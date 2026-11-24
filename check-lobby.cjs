'use strict';
/* Net lobby v2: open-room list (GET /api/rooms/open), invite-only rooms, 3-digit codes (lease, freeing, 4-digit fallback,
   guess rate limit) with legacy 8-character ids,
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
  await test('create returns a 3-digit code and keeps the 8-character id', async () => {
    const c = await call('/api/rooms', { name: '房主甲', nation: 'china', config: { capacity: 2, mapId: 'coast_s', fillAI: true } }, null, 201);
    assert.match(c.room.id, /^[A-HJ-NP-Z2-9]{8}$/); assert.match(c.room.code, /^[0-9]{3}$/);
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
  await test('3-digit code joins and resolves to the room id; full room leaves the list', async () => {
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
    const used = new Set(db.prepare('SELECT code FROM multiplayer_lobby WHERE expires_at > ?').all(clock).map((r) => r.code)); let free = '000'; for (let n = 0; n < 1000; n++) { const c = String(n).padStart(3, '0'); if (!used.has(c)) { free = c; break; } }
    await call('/api/rooms/' + free + '/join', { name: 'x' }, null, 404, '10.4.4.4'); await call('/api/rooms/ABC0/join', { name: 'x' }, null, 404); await call('/api/rooms/12/join', { name: 'x' }, null, 404);
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
  await test('code guessing is limited to 20 lookups per minute per IP', async () => {
    const raw = async (path, ip) => (await S.handle(new Request('https://kingdom.test' + path, { method: 'POST', headers: { 'cf-connecting-ip': ip }, body: JSON.stringify({ name: 'g' }) }), env)).status;
    for (let i = 0; i < 20; i++) assert.notEqual(await raw('/api/rooms/' + String(900 + i) + '/join', '10.7.7.7'), 429);
    assert.equal(await raw('/api/rooms/999/join', '10.7.7.7'), 429);
    assert.notEqual(await raw('/api/rooms/998/join', '10.7.7.8'), 429, 'other IPs unaffected');
    assert.equal(await raw('/api/rooms/' + tokens[0].room.id, '10.7.7.7'), 401, '8-character ids are not counted');
    clock += 61000; assert.notEqual(await raw('/api/rooms/999/join', '10.7.7.7'), 429, 'limit resets after a minute');
  });
  await test('code is freed when the room ends/closes or after 30 idle minutes; held while in progress', async () => {
    const a = await call('/api/rooms', { name: '甲', nation: 'china', config: { capacity: 2, mapId: 'coast_s' } }, null, 201);
    await call('/api/rooms/' + a.room.id, { action: 'leave' }, a.token); // last player leaves -> closed
    assert.equal(db.prepare('SELECT COUNT(*) n FROM multiplayer_lobby WHERE code = ? AND expires_at > ?').get(a.room.code, clock).n, 0, 'closed room still holds code');
    const b = await call('/api/rooms', { name: '乙', nation: 'china', config: { capacity: 2, mapId: 'coast_s', fillAI: true } }, null, 201);
    await call('/api/rooms/' + b.room.id, { action: 'settings', ready: true }, b.token); await call('/api/rooms/' + b.room.id, { action: 'start' }, b.token);
    clock += 25 * 60 * 1000; await call('/api/rooms/' + b.room.id, {}, b.token); clock += 25 * 60 * 1000;
    assert.equal((await call('/api/rooms/' + b.room.code + '/join', { name: 'z' }, null, 409, '10.5.5.' + (clock % 200))).error, '战局已开始，只有原席位可以重连', 'playing room code released while polled');
    clock += 31 * 60 * 1000;
    await call('/api/rooms/' + b.room.code + '/join', { name: 'z' }, null, 404, '10.5.6.1');
    const c = await call('/api/rooms', { name: '丙', nation: 'china', config: { capacity: 2, mapId: 'coast_s' } }, null, 201); // may take b's freed code
    const back = await call('/api/rooms/' + b.room.id, {}, b.token); assert.match(back.room.code, /^[0-9]{3,4}$/);
    if (c.room.code === b.room.code) assert.notEqual(back.room.code, b.room.code, 'stale code reused');
    const owners = db.prepare('SELECT code, COUNT(*) n FROM multiplayer_lobby WHERE expires_at > ? GROUP BY code HAVING n > 1').all(clock); assert.equal(owners.length, 0);
    assert.equal((await call('/api/rooms/' + back.room.code + '/join', { name: 'z' }, null, 409, '10.5.6.2')).error, '战局已开始，只有原席位可以重连');
  });
  await test('all 1000 3-digit codes held -> unused 3-digit picked, then 4-digit fallback', async () => {
    const ins = db.prepare("INSERT OR IGNORE INTO multiplayer_lobby (id, code, listed, waiting, host, nation, map, capacity, joined, lockstep, created_at, seen_at, expires_at) VALUES (?, ?, 0, 0, 'x', 'china', 'coast_s', 2, 1, 0, ?, ?, ?)");
    db.prepare('DELETE FROM multiplayer_lobby WHERE expires_at <= ?').run(clock); db.exec('BEGIN'); for (let n = 0; n < 1000; n++) if (n !== 437) ins.run('FAKE' + String(n).padStart(4, '0'), String(n).padStart(3, '0'), clock, clock, clock + 3600000); db.exec('COMMIT');
    db.prepare("DELETE FROM multiplayer_lobby WHERE code = '437' AND id NOT LIKE 'FAKE%'").run(); db.prepare("UPDATE multiplayer_lobby SET expires_at = ? WHERE code = '437'").run(clock - 1);
    const one = await call('/api/rooms', { name: '满', nation: 'china', config: { capacity: 2, mapId: 'coast_s' } }, null, 201); assert.equal(one.room.code, '437');
    const two = await call('/api/rooms', { name: '满2', nation: 'china', config: { capacity: 2, mapId: 'coast_s' } }, null, 201); assert.match(two.room.code, /^[0-9]{4}$/);
    const j = await call('/api/rooms/' + two.room.code + '/join', { name: '四', nation: 'japan' }, null, 200, '10.6.6.6'); assert.equal(j.room.id, two.room.id);
    db.prepare("DELETE FROM multiplayer_lobby WHERE id LIKE 'FAKE%'").run();
  });
  await test('cleanup removes expired lobby rows', async () => {
    clock += 7 * 60 * 60 * 1000;
    for (let i = 0; i < 3; i++) await new S.Store(env.DB).cleanup(clock);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM multiplayer_lobby WHERE expires_at < ?').get(clock).n, 0);
  });
  await test('UI wiring: open list, collapsed code entry, private option, share, locale entries', async () => {
    const ui = fs.readFileSync('public/network-ui.js', 'utf8'), loc = fs.readFileSync('public/network-locale.js', 'utf8');
    for (const id of ['net-open-list', 'net-code-box', 'net-private', 'net-copy']) assert(ui.includes('id="' + id + '"'), id);
    assert(ui.includes('inputmode="numeric"') && !ui.includes('<details id="net-code-box"'), 'code box numeric and not collapsed'); assert(ui.includes('oninput'), 'auto-join on 3 digits');
    assert(ui.includes("fetch('/api/rooms/open'")); assert(ui.includes('navigator.share'));
    for (const t of ['开放房间', '输入房间码', '仅邀请（不出现在列表）', '分享邀请', '旧联机', '分钟前', '刚刚创建']) assert(loc.includes('\n' + t + '|'), t);
  });
  await test('3e: Lockstep is the lobby default; classic polling is the backup option', async () => {
    const ui = fs.readFileSync('public/network-ui.js', 'utf8'), loc = fs.readFileSync('public/network-locale.js', 'utf8');
    assert(!ui.includes('id="net-lockstep"'), 'no opt-in Lockstep box any more');
    assert(/<input id="net-legacy" type="checkbox">旧联机（备用）/.test(ui), 'backup option, unchecked by default');
    assert(ui.includes("...($('net-legacy').checked?{}:{lockstep:true})"), 'create sends lockstep:true unless the backup option is ticked');
    assert(!ui.includes("tr('新联机（测试）')") && ui.includes("tr(r.lockstep?'新联机':'旧联机（备用）')"), 'labels without (beta)');
    for (const t of ['新联机', '旧联机（备用）', '新联机连不上时再用：服务器运行整局模拟。下一版将删除', '正在下载并校验存档快照…', '正在上传存档快照']) assert(loc.includes('\n' + t + '|'), t);
    // What the default create sends gives a lockstep room (no server simulation); the backup option keeps the old room.
    const ls = await call('/api/rooms', { name: '默认', nation: 'britain', config: { capacity: 2, mapId: 'coast_s', lockstep: true, fillAI: true } }, null, 201, '10.9.0.1');
    assert.equal(ls.room.config.lockstep, true);
    await call('/api/rooms/' + ls.room.id, { action: 'settings', ready: true }, ls.token, 200, '10.9.0.1');
    const st = await call('/api/rooms/' + ls.room.id, { action: 'start' }, ls.token, 200, '10.9.0.1');
    assert(st.room.lockstep && st.room.lockstep.setup && !st.view, 'lockstep room: setup only, no server view');
    const row = await new S.Store(env.DB).get(ls.room.id, clock); assert.equal(row.room.state, null, 'no server simulation state for a lockstep room');
    await call('/api/rooms/' + ls.room.id, { commands: [{ seq: 1, type: 'chat', args: { text: 'x' } }] }, ls.token, 409, '10.9.0.1');
    const old = await call('/api/rooms', { name: '旧', nation: 'britain', config: { capacity: 2, mapId: 'coast_s', fillAI: true } }, null, 201, '10.9.0.2');
    assert(!('lockstep' in old.room.config));
  });
  console.log('PASS lobby v2: ' + done.length + ' checks — ' + done.join('; '));
})().catch((e) => { console.error(e); process.exitCode = 1; });
