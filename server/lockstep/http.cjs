'use strict';
/* P3 lockstep relay, HTTP adapter (v1 transport). Runs inside the existing fetch(request, env) Worker with D1 (env.DB); it only
   reads and writes four small tables and never loads or runs the simulation, so its cost per request does not depend on the
   number of units in the match.

   POST /api/lockstep/<ROOM>   Authorization: Bearer <seat token from the /api/rooms lobby>
   body { a: last turn received, x: last turn executed, r: measured rtt ms, c: [[seq, {type,args}]], h: [[step, hash]], w: 0, s: 1 }
     w (default 1) = wait: if no new turn can be sealed yet, the request is held until the next turn boundary (at most one period),
         so a client polling once per period receives every turn right after it is sealed.
     q: 0 = command post only, no turn data in the reply (polls carry the turns, so nothing is delivered twice).
     s = include the seat table (presence / slowest player / adaptive delay; clients ask about once per second).
   reply { n: server now - startAt, se: sealed turn, d: delay, t: [[turn, seat, seq, cmd]...], hw?: held ms, ds?: desync,
           with s: st: startAt, p: period, me: seat, seats: [[seat, team, executed turn, ms since seen]] }
   body { replay: 1 } returns the match recording (setup + every relayed command) for download.

   All writes of one request go in one D1 batch (one transaction, one round trip). Command insertion and sealing are single
   SQL statements, so a command can never land in a turn somebody has already received. */
const core = require('./relay-core.cjs');

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS lockstep_rooms (id TEXT PRIMARY KEY NOT NULL, start_at INTEGER NOT NULL, period INTEGER NOT NULL, sealed INTEGER NOT NULL DEFAULT -1, delay INTEGER NOT NULL DEFAULT 2, setup TEXT NOT NULL, seats TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'playing', desync TEXT, expires_at INTEGER NOT NULL)",
  'CREATE TABLE IF NOT EXISTS lockstep_seats (room TEXT NOT NULL, seat INTEGER NOT NULL, team INTEGER NOT NULL, token TEXT NOT NULL, human INTEGER NOT NULL DEFAULT 1, seen INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL DEFAULT -1, rtt INTEGER, PRIMARY KEY (room, seat))',
  'CREATE TABLE IF NOT EXISTS lockstep_cmds (room TEXT NOT NULL, seat INTEGER NOT NULL, seq INTEGER NOT NULL, turn INTEGER NOT NULL, cmd TEXT NOT NULL, PRIMARY KEY (room, seat, seq))',
  'CREATE INDEX IF NOT EXISTS lockstep_cmds_turn ON lockstep_cmds (room, turn)',
  'CREATE TABLE IF NOT EXISTS lockstep_hashes (room TEXT NOT NULL, step INTEGER NOT NULL, hash TEXT NOT NULL, agree INTEGER NOT NULL, bad TEXT, PRIMARY KEY (room, step))',
];
const LIFETIME = 6 * 60 * 60 * 1000;
const ready = new WeakMap();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const session = (db) => (db.withSession ? db.withSession('first-primary') : db);
const reply = (text, status = 200) => new Response(text, { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' } });
const fail = (status, message) => reply(JSON.stringify({ error: message }), status);
async function sha256(text) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join(''); }

/* Tables are created on first use (CREATE IF NOT EXISTS), so the relay works on a host where migrations are not run;
   drizzle/0002_lockstep.sql holds the same schema for hosts that do run them. */
async function ensureSchema(raw) {
  let p = ready.get(raw);
  if (!p) { p = (async () => { const db = session(raw); for (const sql of SCHEMA) await db.prepare(sql).bind().run(); })(); ready.set(raw, p); p.catch(() => ready.delete(raw)); }
  return p;
}
async function batch(db, statements) {
  if (typeof db.batch === 'function') return db.batch(statements);
  const out = []; for (const s of statements) out.push(await s.all()); return out;
}

/* Called by the lobby (server/service.cjs start) once a lockstep room starts, or directly by test harnesses.
   seats: [{seat, team, token: sha256 of the seat token, human}] */
async function createRoom(raw, { id, setup, seats, startAt, period = core.PERIOD, now = Date.now() }) {
  await ensureSchema(raw); const db = session(raw);
  if (!Array.isArray(seats) || !seats.length || seats.length > core.MAX_SEATS) throw Object.assign(new Error('座位数无效'), { status: 400 });
  const expired = (await db.prepare('SELECT id FROM lockstep_rooms WHERE expires_at < ? LIMIT 4').bind(now).all()).results.map((r) => r.id);
  const statements = [];
  for (const room of [...expired, id]) for (const table of ['lockstep_cmds', 'lockstep_seats', 'lockstep_hashes']) statements.push(db.prepare(`DELETE FROM ${table} WHERE room = ?`).bind(room));
  for (const room of expired) statements.push(db.prepare('DELETE FROM lockstep_rooms WHERE id = ?').bind(room));
  statements.push(db.prepare('INSERT OR REPLACE INTO lockstep_rooms (id, start_at, period, sealed, delay, setup, seats, status, desync, expires_at) VALUES (?, ?, ?, -1, ?, ?, ?, \'playing\', NULL, ?)')
    .bind(id, startAt, period, core.D_MIN, JSON.stringify(setup), JSON.stringify(seats.map((s) => ({ seat: s.seat, team: s.team, human: s.human !== false }))), now + LIFETIME));
  for (const s of seats) statements.push(db.prepare('INSERT INTO lockstep_seats (room, seat, team, token, human, seen, at, rtt) VALUES (?, ?, ?, ?, ?, ?, -1, NULL)').bind(id, s.seat, s.team, s.token, s.human === false ? 0 : 1, now));
  await batch(db, statements);
}

const HEAD_SQL = 'SELECT r.start_at AS startAt, r.period AS period, r.sealed AS sealed, r.delay AS delay, r.status AS status, r.expires_at AS expires, s.seat AS seat, s.team AS team FROM lockstep_rooms r JOIN lockstep_seats s ON s.room = r.id WHERE r.id = ? AND s.token = ?';
async function lookup(raw, id, tokenHash) { await ensureSchema(raw); return session(raw).prepare(HEAD_SQL).bind(id, tokenHash).first(); }

/* One relay exchange on D1, shared by the HTTP adapter and the WebSocket-on-D1 adapter (B2): store the seat's presence,
   commands and checksums, seal due turns, and read the turns after msg.after. One batch = one transaction, one round trip.
   Returns the compact reply text (the same JSON for both transports) plus what the socket loop needs. */
async function exchange(raw, id, head, msg, now, held = 0) {
  const db = session(raw), c = core.clockTurn(head.startAt, head.period, now), seat = head.seat;
  const statements = [db.prepare('UPDATE lockstep_seats SET seen = ?3, at = MAX(at, ?4), rtt = COALESCE(?5, rtt) WHERE room = ?1 AND seat = ?2').bind(id, seat, now, msg.at, msg.rtt)];
  // Turn = MAX(sealed + 1, MIN(clock turn, hold limit + 1)) (relay-core assignTurn), computed inside the INSERT so it is atomic.
  for (const cmd of msg.cmds) statements.push(db.prepare("INSERT INTO lockstep_cmds (room, seat, seq, turn, cmd) SELECT ?1, ?2, ?3, MAX(sealed + 1, MIN(?4, COALESCE((SELECT MIN(at) FROM lockstep_seats WHERE room = ?1 AND human = 1 AND seen >= ?6), ?4) + ?7 + 1)), ?5 FROM lockstep_rooms WHERE id = ?1 AND status = 'playing' ON CONFLICT (room, seat, seq) DO NOTHING").bind(id, seat, cmd.seq, c, cmd.text, now - core.ACTIVE_MS, core.AHEAD));
  const sealAt = statements.length;
  statements.push(db.prepare('UPDATE lockstep_rooms SET sealed = MAX(sealed, MIN(?2, COALESCE((SELECT MIN(at) FROM lockstep_seats WHERE room = ?1 AND human = 1 AND seen >= ?3), ?2) + ?4)) WHERE id = ?1 RETURNING sealed, delay, status, desync').bind(id, c - 1, now - core.ACTIVE_MS, core.AHEAD));
  const hashAt = statements.length;
  for (const h of msg.hashes) statements.push(db.prepare('INSERT INTO lockstep_hashes (room, step, hash, agree, bad) VALUES (?1, ?2, ?3, ?4, NULL) ON CONFLICT (room, step) DO UPDATE SET agree = CASE WHEN hash = excluded.hash THEN agree | excluded.agree ELSE agree END, bad = CASE WHEN hash = excluded.hash THEN bad ELSE COALESCE(bad || \',\', \'\') || ?5 END RETURNING hash, agree, bad').bind(id, h.step, h.hash, 1 << seat, seat + ':' + h.hash));
  const readAt = statements.length;
  if (msg.turns) statements.push(db.prepare('SELECT turn, seat, seq, cmd AS text FROM lockstep_cmds WHERE room = ?1 AND turn > ?2 AND turn <= (SELECT sealed FROM lockstep_rooms WHERE id = ?1) ORDER BY turn, seat, seq LIMIT ?3').bind(id, msg.after, core.MAX_ROWS));
  if (msg.seats) statements.push(db.prepare('SELECT seat, team, human, seen, at, rtt FROM lockstep_seats WHERE room = ?1 ORDER BY seat').bind(id));
  const results = await batch(db, statements);
  const room = results[sealAt].results[0], rows = msg.turns ? results[readAt].results : null;
  let sealed = room.sealed, desync = room.desync;
  if (rows && rows.length >= core.MAX_ROWS) sealed = rows[rows.length - 1].turn - 1; // truncated: report only complete turns
  for (let i = 0; i < msg.hashes.length; i++) {
    const r = results[hashAt + i].results[0];
    if (r && r.hash !== msg.hashes[i].hash && !desync) {
      desync = JSON.stringify({ step: msg.hashes[i].step, reference: r.hash, agree: r.agree, reports: [[seat, msg.hashes[i].hash]], at: now });
      await db.prepare('UPDATE lockstep_rooms SET desync = ? WHERE id = ? AND desync IS NULL').bind(desync, id).run();
    }
  }
  let delay = room.delay, seats = null;
  if (msg.seats) {
    const list = results[readAt + (msg.turns ? 1 : 0)].results;
    seats = list.map((s) => [s.seat, s.team, s.at, now - s.seen]);
    const next = core.adaptDelay(delay, list.filter((s) => s.human && now - s.seen <= core.ACTIVE_MS && s.rtt !== null).map((s) => s.rtt), head.period);
    if (next !== delay) { await db.prepare('UPDATE lockstep_rooms SET delay = ? WHERE id = ?').bind(next, id).run(); delay = next; }
  }
  // Compact reply (~40 bytes when idle): n is relative to startAt; static fields only come with the seat table.
  const text = '{"n":' + (now - head.startAt) + ',"se":' + sealed + ',"d":' + delay + (held ? ',"hw":' + held : '') + (desync ? ',"ds":' + desync : '')
    + (seats ? ',"st":' + head.startAt + ',"p":' + head.period + ',"me":' + seat + ',"seats":' + JSON.stringify(seats) : '') + (rows ? ',"t":' + core.rowsJSON(rows) : '') + '}';
  return { text, sealed, rows, status: room.status };
}

async function replayText(raw, id) {
  const db = session(raw), room = await db.prepare('SELECT setup, seats, sealed, period, desync FROM lockstep_rooms WHERE id = ?').bind(id).first();
  const rows = (await db.prepare('SELECT turn, seat, seq, cmd AS text FROM lockstep_cmds WHERE room = ? AND turn <= ? ORDER BY turn, seat, seq').bind(id, room.sealed).all()).results;
  return JSON.stringify(core.recording(JSON.parse(room.setup), rows, { period: room.period, seats: JSON.parse(room.seats), sealed: room.sealed, desync: room.desync ? JSON.parse(room.desync) : null }));
}

async function handle(request, env, { now: clock = Date.now } = {}) {
  try {
    if (request.method !== 'POST') return fail(405, '请使用 POST');
    if (!env.DB) return fail(503, '联机数据库尚未连接');
    const match = new URL(request.url).pathname.match(/^\/api\/lockstep\/([A-HJ-NP-Z2-9]{8})$/);
    if (!match) return fail(404, '房间地址无效');
    if (env.LOCKSTEP && env.LOCKSTEP.idFromName) return env.LOCKSTEP.get(env.LOCKSTEP.idFromName(match[1])).fetch(request); // B1: the room lives in its Durable Object
    const authorization = request.headers.get('Authorization') || '', token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token) return fail(401, '席位凭据无效，请重新加入房间');
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > 65536) return fail(413, '请求过大');
    let body; try { body = bytes.byteLength ? JSON.parse(new TextDecoder().decode(bytes)) : {}; } catch { return fail(400, '请求格式错误'); }
    let msg; try { msg = core.parseClient(body); } catch (e) { return fail(e.status || 400, e.message); }
    const id = match[1], head = await lookup(env.DB, id, await sha256(token));
    let now = clock();
    if (!head || head.expires <= now) return fail(head ? 404 : 401, head ? '房间不存在或已过期' : '席位凭据无效，请重新加入房间');
    if (msg.replay) return reply(await replayText(env.DB, id));
    let held = 0;
    if (msg.wait && head.status === 'playing') {
      const c = core.clockTurn(head.startAt, head.period, now);
      if (c - 1 <= msg.after) { const ms = Math.min(head.period + 5, head.startAt + (c + 1) * head.period + 2 - now); if (ms > 0) { await sleep(ms); held = ms; now = clock(); } }
    }
    return reply((await exchange(env.DB, id, head, msg, now, held)).text);
  } catch (e) {
    console.error('Lockstep relay failed:', e?.message || 'unknown');
    return fail(503, '服务器暂时无法同步，请稍后重试');
  }
}

/* ---- B2: WebSocket + D1 (no Durable Object needed) -------------------------------------------------------------------
   Each socket is served by the isolate that accepted it. Every turn boundary the connection runs one D1 exchange for its
   seat (presence, pending checksums, sealing, new turns) and pushes the new turns; commands are written at once. All
   cross-connection state is in D1, exactly as with HTTP polling, so connections of the same room may live in different
   isolates (or be HTTP clients) and still agree. Messages are the durable.cjs ones (hello/start/cmd/ack/ping/turns/pong). */
function attachSocket(ws, env, id, { now: clock = Date.now, setTimeout: st = setTimeout, clearTimeout: ct = clearTimeout } = {}) {
  let head = null, after = -1, at = -1, rtt = null, hashes = [], timer = null, closed = false, busy = false;
  const send = (text) => { try { ws.send(text); } catch { closed = true; } };
  const schedule = () => { if (closed || !head) return; const n = clock(), c = core.clockTurn(head.startAt, head.period, n); timer = st(tickNow, Math.max(1, head.startAt + (c + 1) * head.period + 2 - n)); };
  async function tickNow() {
    if (closed || busy) return schedule();
    busy = true;
    try {
      const h = hashes.splice(0, 16), r = await exchange(env.DB, id, head, { after, at, rtt, cmds: [], hashes: h, turns: true, seats: false }, clock());
      if (r.sealed > after || r.rows.length) { send('{"type":"turns",' + r.text.slice(1)); after = Math.max(after, r.sealed); }
    } catch { /* D1 hiccup: the next boundary retries; the client also reconnects or falls back to HTTP */ } finally { busy = false; schedule(); }
  }
  ws.addEventListener('message', async (e) => {
    let msg; try { msg = JSON.parse(typeof e.data === 'string' ? e.data : new TextDecoder().decode(e.data)); } catch { return; }
    try {
      if (msg.type === 'hello') {
        head = await lookup(env.DB, id, await sha256(String(msg.token || '')));
        if (!head || head.seat !== msg.seat || head.expires <= clock()) { send(JSON.stringify({ type: 'error', error: '席位凭据无效，请重新加入房间' })); try { ws.close(4001, 'auth'); } catch { /* ignore */ } return; }
        after = Number.isSafeInteger(msg.last) ? msg.last : -1;
        const room = await session(env.DB).prepare('SELECT setup, seats, delay FROM lockstep_rooms WHERE id = ?').bind(id).first();
        send(JSON.stringify({ type: 'start', setup: JSON.parse(room.setup), seats: JSON.parse(room.seats), startAt: head.startAt, period: head.period, d: room.delay, n: clock() - head.startAt }));
        ct(timer); tickNow(); return;
      }
      if (!head) return;
      const parsed = core.parseClient(msg);
      if (msg.type === 'cmd' && parsed.cmds.length) await exchange(env.DB, id, head, { ...parsed, after, at, rtt, turns: false, seats: false, hashes: [] }, clock());
      else if (msg.type === 'ack') { at = Math.max(at, parsed.at); hashes.push(...parsed.hashes); }
      else if (msg.type === 'ping') { if (parsed.rtt !== null) rtt = parsed.rtt; send(JSON.stringify({ type: 'pong', t: msg.t, n: clock() - head.startAt })); }
    } catch (err) { send(JSON.stringify({ type: 'error', error: err.message || '无效消息', retry: true })); }
  });
  ws.addEventListener('close', () => { closed = true; ct(timer); });
}

/* GET /api/lockstep/<ROOM>/ws (Upgrade: websocket). B1 when a Durable Object binding named LOCKSTEP exists, else B2 when the
   runtime has WebSocketPair, else 501 (the client then stays on HTTP). Authentication is the first message (hello). */
async function handleSocket(request, env) {
  const match = new URL(request.url).pathname.match(/^\/api\/lockstep\/([A-HJ-NP-Z2-9]{8})\/ws$/);
  if (!match) return fail(404, '房间地址无效');
  if (request.headers.get('Upgrade') !== 'websocket') return fail(426, '需要 WebSocket');
  if (env.LOCKSTEP && env.LOCKSTEP.idFromName) return env.LOCKSTEP.get(env.LOCKSTEP.idFromName(match[1])).fetch(request);
  if (typeof WebSocketPair === 'undefined' || !env.DB) return fail(501, '当前托管不支持 WebSocket，继续使用 HTTP');
  const pair = new WebSocketPair(); pair[1].accept(); attachSocket(pair[1], env, match[1]);
  return new Response(null, { status: 101, webSocket: pair[0] });
}

module.exports = { handle, handleSocket, attachSocket, exchange, lookup, createRoom, ensureSchema, SCHEMA, replayText };
