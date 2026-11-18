'use strict';
/* Net lobby v2: open-room list (GET /api/rooms/open), invite-only rooms, 4-character codes with legacy 8-character ids,
   no token / token hash / private data in the public list, rate limit, cache, index use, default lockstep transport. */
const assert = require('node:assert/strict'), fs = require('node:fs'), { DatabaseSync } = require('node:sqlite'), { sqliteD1 } = require('./scripts/sqlite-d1.cjs');
const S = require('./server/service.cjs'), Lobby = require('./server/lobby.cjs');
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync('drizzle/0000_multiplayer.sql', 'utf8')); db.exec(fs.readFileSync('drizzle/0001_room_limits.sql', 'utf8'));
const env = { DB: sqliteD1(db) }, done = []; let clock = 1794960000000; Date.now = () => clock;
async function call(path, body = {}, token, expected = 200, ip) {
  const headers = { 'Content-Type': 'application/json' }; if (token) headers.Authorization = 'Bearer ' + token; if (ip) headers['cf-connecting-ip'] = ip;
  const r = await S.handle(new Request('https://kingdom.test' + path, { method: 'POST', headers, body: JSON.stringify(body) }), env), j = await r.json();
  assert.equal(r.status, expected, j.error || JSON.stringify(j).slice(0, 200)); return j;
}
async function openList(ip = '10.0.0.1', expected = 200) {
  Lobby.resetCache();
  const r = await S.handle(new Request('https://kingdom.test/api/rooms/open', { method: 'GET', headers: { 'cf-connecting-ip': ip } }), env), text = await r.text();
  assert.equal(r.status, expected, text); return { json: JSON.parse(text), text, headers: r.headers };
}
async function test(n, f) { await f(); done.push(n); }
(async () => {
  const tokens = [];
  await test('create returns a 4-character code from the unambiguous alphabet and keeps the 8-character id', async () => {
    const c = await call('/api/rooms', { name: '房主甲', nation: 'china', config: { capacity: 2, mapId: 'coast_s', fillAI: true } }, null, 201);
    assert.match(c.room.id, /^[A-HJ-NP-Z2-9]{8}$/); assert.match(c.room.code, /^[A-HJ-NP-Z2-9]{4}$/); assert(!/[01OI]/.test(c.room.code));
    tokens.push(c);
  });
  await test('open list shows the public waiting room with only public fields', async () => {
    const { json, text, headers } = await openList();
    assert.equal(json.rooms.length, 1); const r = json.rooms[0];
    assert.deepEqual(Object.keys(r).sort(), ['age', 'capacity', 'code', 'createdAt', 'host', 'id', 'joined', 'lockstep', 'map', 'nation'].sort());
    assert.equal(r.host, '房主甲'); assert.equal(r.nation, 'china'); assert.equal(r.joined, 1); assert.equal(r.capacity, 2); assert.equal(r.lockstep, false); assert.equal(r.map, 'coast_s');
    assert(!text.includes(tokens[0].token), 'token leaked'); assert(!/hash|token|lastSeen|players|seed|state/i.test(text), 'private field leaked: ' + text);
    const seatHash = JSON.parse(JSON.stringify(await S.Store.prototype.get.call(new S.Store(env.DB), tokens[0].room.id, clock))).room.players[0].hash;
    assert(!text.includes(seatHash), 'token hash leaked'); assert.match(headers.get('Cache-Control'), /max-age=2/);
  });
  await test('invite-only room is not listed but joins by invite id and by code', async () => {
    const c = await call('/api/rooms', { name: '私密', nation: 'japan', config: { capacity: 2, mapId: 'coast_s', private: true, lockstep: true } }, null, 201);
    const { json } = await openList(); assert(!json.rooms.some((r) => r.id === c.room.id), 'private room listed');
    const j = await call('/api/rooms/' + c.room.id + '/join', { name: '客人', nation: 'france' });
    assert.equal(j.room.id, c.room.id); assert.equal(j.room.config.private, true);
    const c2 = await call('/api/rooms', { name: '私密2', nation: 'japan', config: { capacity: 2, mapId: 'coast_s', private: true } }, null, 201);
    const j2 = await call('/api/rooms/' + c2.room.code + '/join', { name: '客人2', nation: 'france' }); assert.equal(j2.room.id, c2.room.id);
  });
  await test('4-character code joins and resolves to the room id; full room leaves the list', async () => {
    const j = await call('/api/rooms/' + tokens[0].room.code + '/join', { name: '乙', nation: 'japan' });
    assert.equal(j.room.id, tokens[0].room.id); assert(j.token);
    const { json } = await openList(); assert(!json.rooms.some((r) => r.id === tokens[0].room.id), 'full room still listed');
    await call('/api/rooms/' + tokens[0].room.code, {}, j.token); // seat polls by code too
  });
  await test('legacy rooms (8-character id, no code) still join and are never listed', async () => {
    const legacy = { id: 'ABCDEFGH', status: 'lobby', config: S.config({ capacity: 2, mapId: 'coast_s' }), players: [null, null], host: 0, createdAt: clock, lastAt: clock, frame: 0, state: null };
    legacy.players[0] = { seat: 0, name: '老房主', nation: 'china', group: 1, ready: false, hash: 'x'.repeat(64), lastSeen: clock, lastSeq: 0, results: [], left: false };
    await new S.Store(env.DB).create(legacy, clock);
    const j = await call('/api/rooms/ABCDEFGH/join', { name: '老客', nation: 'japan' }); assert.equal(j.room.id, 'ABCDEFGH'); assert.equal(j.room.code, undefined);
    const { json } = await openList(); assert(!json.rooms.some((r) => r.id === 'ABCDEFGH'));
    await call('/api/rooms/ZZZZ/join', { name: 'x' }, null, 404); await call('/api/rooms/ABC0/join', { name: 'x' }, null, 404);
  });
  await test('lockstep flag, leave, staleness and the 10-minute window', async () => {
    const c = await call('/api/rooms', { name: '新', nation: 'britain', config: { capacity: 3, mapId: 'coast_l', lockstep: true } }, null, 201);
    let r = (await openList()).json.rooms.find((x) => x.id === c.room.id); assert.equal(r.lockstep, true); assert.equal(r.joined, 1);
    const j = await call('/api/rooms/' + c.room.id + '/join', { name: '二', nation: 'japan' });
    r = (await openList()).json.rooms.find((x) => x.id === c.room.id); assert.equal(r.joined, 2);
    await call('/api/rooms/' + c.room.id, { action: 'leave' }, j.token);
    r = (await openList()).json.rooms.find((x) => x.id === c.room.id); assert.equal(r.joined, 1);
    clock += 31000; assert(!(await openList()).json.rooms.some((x) => x.id === c.room.id), 'host gone quiet but still listed');
    await call('/api/rooms/' + c.room.id, {}, c.token); assert((await openList()).json.rooms.some((x) => x.id === c.room.id), 'polling host relists');
    clock += 10 * 60 * 1000; await call('/api/rooms/' + c.room.id, {}, c.token);
    assert(!(await openList()).json.rooms.some((x) => x.id === c.room.id), 'room older than 10 minutes still listed');
  });
  await test('started room leaves the list; lockstep transport defaults to WebSocket', async () => {
    const c = await call('/api/rooms', { name: '开', nation: 'britain', config: { capacity: 2, mapId: 'coast_s', lockstep: true, fillAI: true } }, null, 201);
    assert((await openList()).json.rooms.some((x) => x.id === c.room.id));
    await call('/api/rooms/' + c.room.id, { action: 'settings', ready: true }, c.token);
    const s = await call('/api/rooms/' + c.room.id, { action: 'start' }, c.token);
    assert.equal(s.room.lockstep.transport, 'ws');
    assert(!(await openList()).json.rooms.some((x) => x.id === c.room.id));
    const forced = await S.handle(new Request('https://kingdom.test/api/rooms', { method: 'POST', body: JSON.stringify({ name: 'h', config: { capacity: 2, mapId: 'coast_s', lockstep: true, fillAI: true } }) }), { ...env, LOCKSTEP_TRANSPORT: 'http' }), fj = await forced.json();
    await S.handle(new Request('https://kingdom.test/api/rooms/' + fj.room.id, { method: 'POST', headers: { Authorization: 'Bearer ' + fj.token }, body: JSON.stringify({ action: 'settings', ready: true }) }), env);
    const st = await (await S.handle(new Request('https://kingdom.test/api/rooms/' + fj.room.id, { method: 'POST', headers: { Authorization: 'Bearer ' + fj.token }, body: JSON.stringify({ action: 'start' }) }), { ...env, LOCKSTEP_TRANSPORT: 'http' })).json();
    assert.equal(st.room.lockstep.transport, 'http');
  });
  await test('rate limit per IP, cache, method check, query uses the index', async () => {
    Lobby.resetCache(); let last;
    for (let i = 0; i < 41; i++) last = await S.handle(new Request('https://kingdom.test/api/rooms/open', { headers: { 'cf-connecting-ip': '10.9.9.9' } }), env);
    assert.equal(last.status, 429);
    const other = await S.handle(new Request('https://kingdom.test/api/rooms/open', { headers: { 'cf-connecting-ip': '10.9.9.8' } }), env); assert.equal(other.status, 200);
    const post = await S.handle(new Request('https://kingdom.test/api/rooms/open', { method: 'POST', body: '{}' }), env); assert.equal(post.status, 405);
    let reads = 0; const counting = { ...env.DB, prepare(sql) { if (sql === Lobby.LIST_SQL) reads++; return env.DB.prepare(sql); }, withSession() { return counting; } };
    Lobby.resetCache();
    for (let i = 0; i < 10; i++) await S.handle(new Request('https://kingdom.test/api/rooms/open', { headers: { 'cf-connecting-ip': '10.1.1.' + i } }), { DB: counting });
    assert.equal(reads, 1, 'cache should serve repeated reads within 2 s');
    const plan = db.prepare('EXPLAIN QUERY PLAN ' + Lobby.LIST_SQL).all(0, 0).map((r) => r.detail).join(' | ');
    assert.match(plan, /USING INDEX multiplayer_lobby_open/, plan);
  });
  await test('cleanup removes expired lobby rows', async () => {
    clock += 7 * 60 * 60 * 1000;
    for (let i = 0; i < 3; i++) await new S.Store(env.DB).cleanup(clock);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM multiplayer_lobby WHERE expires_at < ?').get(clock).n, 0);
  });
  await test('UI wiring: open list, collapsed code entry, private option, share, locale entries', async () => {
    const ui = fs.readFileSync('public/network-ui.js', 'utf8'), loc = fs.readFileSync('public/network-locale.js', 'utf8');
    for (const id of ['net-open-list', 'net-code-box', 'net-private', 'net-copy']) assert(ui.includes('id="' + id + '"'), id);
    assert(ui.includes("fetch('/api/rooms/open'")); assert(ui.includes('navigator.share'));
    for (const t of ['开放房间', '用房间码加入', '仅邀请（不出现在列表）', '分享邀请', '旧联机', '分钟前', '刚刚创建']) assert(loc.includes('\n' + t + '|'), t);
  });
  console.log('PASS lobby v2: ' + done.length + ' checks — ' + done.join('; '));
})().catch((e) => { console.error(e); process.exitCode = 1; });
