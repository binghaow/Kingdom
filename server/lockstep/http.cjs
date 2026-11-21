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
  "CREATE TABLE IF NOT EXISTS lockstep_rooms (id TEXT PRIMARY KEY NOT NULL, start_at INTEGER NOT NULL, period INTEGER NOT NULL, sealed INTEGER NOT NULL DEFAULT -1, delay INTEGER NOT NULL DEFAULT 2, setup TEXT NOT NULL, seats TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'playing', desync TEXT, expires_at INTEGER NOT NULL, base INTEGER NOT NULL DEFAULT 0)",
  'CREATE TABLE IF NOT EXISTS lockstep_seats (room TEXT NOT NULL, seat INTEGER NOT NULL, team INTEGER NOT NULL, token TEXT NOT NULL, human INTEGER NOT NULL DEFAULT 1, seen INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL DEFAULT -1, rtt INTEGER, mode INTEGER NOT NULL DEFAULT 0, flag INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (room, seat))',
  'CREATE TABLE IF NOT EXISTS lockstep_cmds (room TEXT NOT NULL, seat INTEGER NOT NULL, seq INTEGER NOT NULL, turn INTEGER NOT NULL, cmd TEXT NOT NULL, PRIMARY KEY (room, seat, seq))',
  'CREATE INDEX IF NOT EXISTS lockstep_cmds_turn ON lockstep_cmds (room, turn)',
  'CREATE TABLE IF NOT EXISTS lockstep_segments (room TEXT NOT NULL, last_turn INTEGER NOT NULL, rows TEXT NOT NULL, PRIMARY KEY (room, last_turn))',
  'CREATE TABLE IF NOT EXISTS lockstep_snapshots (room TEXT NOT NULL, turn INTEGER NOT NULL, step INTEGER NOT NULL, hash TEXT NOT NULL, parts INTEGER NOT NULL, meta TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (room, turn))',
  'CREATE TABLE IF NOT EXISTS lockstep_snapshot_parts (room TEXT NOT NULL, turn INTEGER NOT NULL, part INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (room, turn, part))',
  'CREATE TABLE IF NOT EXISTS lockstep_hashes (room TEXT NOT NULL, step INTEGER NOT NULL, hash TEXT NOT NULL, agree INTEGER NOT NULL, bad TEXT, PRIMARY KEY (room, step))',
];
/* 3c columns for tables created by the 3a/3b relay (live D1 already has them without these columns). ADD COLUMN fails with
   "duplicate column" when present — that error is expected and ignored. */
const UPGRADES = ['ALTER TABLE lockstep_rooms ADD COLUMN base INTEGER NOT NULL DEFAULT 0', 'ALTER TABLE lockstep_seats ADD COLUMN mode INTEGER NOT NULL DEFAULT 0', 'ALTER TABLE lockstep_seats ADD COLUMN flag INTEGER NOT NULL DEFAULT 0'];
const LIFETIME = 6 * 60 * 60 * 1000, DESYNC_KEEP = 3 * 24 * 60 * 60 * 1000; // a room with a desync is kept 3 days for investigation
const ready = new WeakMap();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const session = (db) => (db.withSession ? db.withSession('first-primary') : db);
const reply = (text, status = 200) => new Response(text, { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' } });
const fail = (status, message) => reply(JSON.stringify({ error: message }), status);
async function sha256(text) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join(''); }

/* Tables are created on first use (CREATE IF NOT EXISTS), so the relay works on a host where migrations are not run;
   drizzle/0002_lockstep.sql holds the same schema for hosts that do run them. */
async function ensureSchema(raw) {
  const key = raw.schemaKey || raw; let p = ready.get(key);
  if (!p) { p = (async () => { const db = session(raw); for (const sql of SCHEMA) await db.prepare(sql).bind().run();
    for (const sql of UPGRADES) { try { await db.prepare(sql).bind().run(); } catch (e) { if (!/duplicate column/i.test(String(e?.message || e))) throw e; } } })(); ready.set(key, p); p.catch(() => ready.delete(key)); }
  return p;
}
async function batch(db, statements) {
  if (typeof db.batch === 'function') return db.batch(statements);
  const out = []; for (const s of statements) out.push(await s.all()); return out;
}

/* Called by the lobby (server/service.cjs start) once a lockstep room starts, or directly by test harnesses.
   seats: [{seat, team, token: sha256 of the seat token, human}] */
async function createRoom(raw, { id, setup, seats, startAt, period = core.PERIOD, now = Date.now(), base = 0, system = [] }) {
  await ensureSchema(raw); const db = session(raw);
  if (!Array.isArray(seats) || !seats.length || seats.length > core.MAX_SEATS) throw Object.assign(new Error('座位数无效'), { status: 400 });
  const expired = (await db.prepare('SELECT id FROM lockstep_rooms WHERE expires_at < ? LIMIT 4').bind(now).all()).results.map((r) => r.id);
  const statements = [];
  for (const room of [...expired, id]) for (const table of ['lockstep_cmds', 'lockstep_seats', 'lockstep_hashes']) statements.push(db.prepare(`DELETE FROM ${table} WHERE room = ?`).bind(room));
  for (const room of expired) statements.push(db.prepare('DELETE FROM lockstep_segments WHERE room = ?').bind(room), db.prepare('DELETE FROM lockstep_snapshots WHERE room = ?').bind(room), db.prepare('DELETE FROM lockstep_snapshot_parts WHERE room = ?').bind(room), db.prepare('DELETE FROM lockstep_rooms WHERE id = ?').bind(room));
  statements.push(db.prepare('DELETE FROM lockstep_snapshots WHERE room = ?').bind(id), db.prepare('DELETE FROM lockstep_snapshot_parts WHERE room = ?').bind(id));
  // Restored room (3c): the clock starts at turn `base`, turns before it are already sealed (segments uploaded by the host).
  statements.push(db.prepare('INSERT OR REPLACE INTO lockstep_rooms (id, start_at, period, sealed, delay, setup, seats, status, desync, expires_at, base) VALUES (?, ?, ?, ?, ?, ?, ?, \'playing\', NULL, ?, ?)')
    .bind(id, startAt, period, base - 1, core.D_MIN, JSON.stringify(setup), JSON.stringify(seats.map((s) => ({ seat: s.seat, team: s.team, human: s.human !== false }))), now + LIFETIME, base));
  for (const s of seats) statements.push(db.prepare('INSERT INTO lockstep_seats (room, seat, team, token, human, seen, at, rtt, mode) VALUES (?, ?, ?, ?, ?, ?, -1, NULL, ?)').bind(id, s.seat, s.team, s.token, s.human === false ? 0 : 1, now, s.mode || 0));
  // System commands at the first live turn of a restored room (takeover of unclaimed seats, release of reclaimed ones).
  system.forEach((cmd, i) => statements.push(db.prepare('INSERT INTO lockstep_cmds (room, seat, seq, turn, cmd) VALUES (?, ?, ?, ?, ?)').bind(id, core.SYSTEM_SEAT, base * 100 + i, base, cmd.text)));
  await batch(db, statements);
}

/* Restored room: one segment of recorded commands (turns up to lastTurn, after the previous segment). rows [[turn, seat, seq, cmd]]. */
async function putSegment(raw, id, lastTurn, rows) {
  await ensureSchema(raw);
  return session(raw).prepare('INSERT OR REPLACE INTO lockstep_segments (room, last_turn, rows) VALUES (?, ?, ?)').bind(id, lastTurn, core.rowsJSON(rows.map(([turn, seat, seq, c]) => ({ turn, seat, seq, text: JSON.stringify(c) })))).run();
}
async function segmentCount(raw, id) { await ensureSchema(raw); return (await session(raw).prepare('SELECT COUNT(*) AS n, MAX(last_turn) AS last FROM lockstep_segments WHERE room = ?').bind(id).first()) || { n: 0, last: null }; }
async function dropSegments(raw, id) { await ensureSchema(raw); return session(raw).prepare('DELETE FROM lockstep_segments WHERE room = ?').bind(id).run(); }

const HEAD_SQL = 'SELECT r.start_at AS startAt, r.period AS period, r.sealed AS sealed, r.delay AS delay, r.status AS status, r.expires_at AS expires, r.base AS base, s.seat AS seat, s.team AS team, s.mode AS mode FROM lockstep_rooms r JOIN lockstep_seats s ON s.room = r.id WHERE r.id = ? AND s.token = ?';
async function lookup(raw, id, tokenHash) { await ensureSchema(raw); return session(raw).prepare(HEAD_SQL).bind(id, tokenHash).first(); }

/* Hold rule in SQL (relay-core sealLimit with `sealed`): the slowest playing seat seen within TAKEOVER_MS that is not more than
   CATCHUP turns behind the sealed turn; if every such seat is catching up, the most advanced one; with no playing seat, the clock. */
const HOLD = (active, catchup, clock) => `COALESCE((SELECT MIN(at) FROM lockstep_seats WHERE room = ?1 AND human = 1 AND mode = 0 AND seen >= ${active} AND at >= lockstep_rooms.sealed - ${catchup}), (SELECT MAX(at) FROM lockstep_seats WHERE room = ?1 AND human = 1 AND mode = 0 AND seen >= ${active}), ${clock})`;

/* 3c computer takeover / release / desync exit: one guarded switch of a seat's mode plus the matching system command at the
   first turn nobody has received yet (sealed + 1), in one transaction. The UPDATE's guard (current mode, and for takeover
   "still silent") makes concurrent relays (several isolates, sockets and HTTP polls of the same room) insert it once. */
function switchStatements(db, id, seat, from, to, cmd, silentBefore = null) {
  return [
    db.prepare('UPDATE lockstep_seats SET mode = ?3, flag = 1 WHERE room = ?1 AND seat = ?2 AND mode = ?4' + (silentBefore === null ? '' : ' AND seen < ?5')).bind(...[id, seat, to, from, ...(silentBefore === null ? [] : [silentBefore])]),
    // seq = turn * 100 + n: unique, and larger than every system seq of earlier turns, including those inside a restored
    // room's recording segments (clients drop a seat+seq they have already seen).
    db.prepare('INSERT INTO lockstep_cmds (room, seat, seq, turn, cmd) SELECT ?1, ?3, t.turn * 100 + (SELECT COUNT(*) FROM lockstep_cmds WHERE room = ?1 AND seat = ?3 AND turn = t.turn), t.turn, ?4 FROM lockstep_seats, (SELECT sealed + 1 AS turn FROM lockstep_rooms WHERE id = ?1) t WHERE room = ?1 AND seat = ?2 AND flag = 1').bind(id, seat, core.SYSTEM_SEAT, cmd),
    db.prepare('UPDATE lockstep_seats SET flag = 0 WHERE room = ?1 AND seat = ?2 AND flag = 1').bind(id, seat),
  ];
}
const takeoverCmd = (s, reason) => core.systemCommand('aiTakeover', { seat: s.seat, team: s.team, reason });
const releaseCmd = (s) => core.systemCommand('aiRelease', { seat: s.seat, team: s.team });

/* One relay exchange on D1, shared by the HTTP adapter and the WebSocket-on-D1 adapter (B2): store the seat's presence,
   commands and checksums, seal due turns, and read the turns after msg.after. One batch = one transaction, one round trip.
   Returns the compact reply text (the same JSON for both transports) plus what the socket loop needs. */
async function exchange(raw, id, head, msg, now, held = 0) {
  const db = session(raw), c = core.clockTurn(head.startAt, head.period, now), seat = head.seat, active = now - core.TAKEOVER_MS;
  // at is monotonic except on a fresh connection (hello / first poll), which reports the client's true executed turn: a
  // refreshed page restarts from turn 0 and must count as catching up, not as still being at its old turn.
  const statements = [db.prepare(`UPDATE lockstep_seats SET seen = MAX(seen, ?3), at = ${msg.fresh ? '?4' : 'MAX(at, ?4)'}, rtt = COALESCE(?5, rtt) WHERE room = ?1 AND seat = ?2`).bind(id, seat, Math.min(now, msg.seen ?? now), msg.at, msg.rtt)];
  // Back from a computer takeover and caught up: release the seat at the next undelivered turn.
  if (msg.reclaim) statements.push(...switchStatements(db, id, seat, 1, 0, releaseCmd(head)));
  // Turn = MAX(sealed + 1, MIN(clock turn, hold limit + 1)) (relay-core assignTurn), computed inside the INSERT so it is atomic.
  for (const cmd of msg.cmds) statements.push(db.prepare(`INSERT INTO lockstep_cmds (room, seat, seq, turn, cmd) SELECT ?1, ?2, ?3, MAX(sealed + 1, MIN(?4, ${HOLD('?6', '?8', '?4')} + ?7 + 1)), ?5 FROM lockstep_rooms WHERE id = ?1 AND status = 'playing' AND NOT EXISTS (SELECT 1 FROM lockstep_seats WHERE room = ?1 AND seat = ?2 AND mode = 2) ON CONFLICT (room, seat, seq) DO NOTHING`).bind(id, seat, cmd.seq, c, cmd.text, active, core.AHEAD, core.CATCHUP));
  const sealAt = statements.length;
  statements.push(db.prepare(`UPDATE lockstep_rooms SET sealed = MAX(sealed, MIN(?2, ${HOLD('?3', '?5', '?2')} + ?4)) WHERE id = ?1 RETURNING sealed, delay, status, desync`).bind(id, c - 1, active, core.AHEAD, core.CATCHUP));
  const hashAt = statements.length;
  for (const h of msg.hashes) statements.push(db.prepare('INSERT INTO lockstep_hashes (room, step, hash, agree, bad) VALUES (?1, ?2, ?3, ?4, NULL) ON CONFLICT (room, step) DO UPDATE SET agree = CASE WHEN hash = excluded.hash THEN agree | excluded.agree ELSE agree END, bad = CASE WHEN hash = excluded.hash THEN bad ELSE COALESCE(bad || \',\', \'\') || ?5 END RETURNING hash, agree, bad').bind(id, h.step, h.hash, 1 << seat, seat + ':' + h.hash));
  const readAt = statements.length;
  // Restored room (3c save/restore): turns before `base` are stored as segments (one row per ~48 KB of commands).
  const fromSegments = msg.turns && head.base > 0 && msg.after < head.base - 1;
  if (fromSegments) statements.push(db.prepare('SELECT last_turn AS last, rows FROM lockstep_segments WHERE room = ?1 AND last_turn > ?2 ORDER BY last_turn LIMIT 1').bind(id, msg.after));
  else if (msg.turns) statements.push(db.prepare('SELECT turn, seat, seq, cmd AS text FROM lockstep_cmds WHERE room = ?1 AND turn > ?2 AND turn <= (SELECT sealed FROM lockstep_rooms WHERE id = ?1) ORDER BY turn, seat, seq LIMIT ?3').bind(id, msg.after, core.MAX_ROWS));
  // Snapshot offer (3c): a client far behind (fresh connection or > SNAP_GAIN turns back) is told about the newest complete
  // snapshot whose checksum the relay has as an undisputed step hash; it may download it and resume there.
  const snapAt = statements.length, wantSnap = msg.turns && (msg.fresh || msg.after < (head.sealed ?? 0) - SNAP_GAIN);
  if (wantSnap) statements.push(db.prepare('SELECT s.turn AS turn, s.step AS step, s.hash AS hash, s.parts AS parts, h.agree AS agree FROM lockstep_snapshots s JOIN lockstep_hashes h ON h.room = s.room AND h.step = s.step AND h.hash = s.hash AND h.bad IS NULL WHERE s.room = ?1 AND s.turn > ?2 + ?3 AND (SELECT COUNT(*) FROM lockstep_snapshot_parts p WHERE p.room = s.room AND p.turn = s.turn) = s.parts ORDER BY s.turn DESC LIMIT 1').bind(id, msg.after, SNAP_GAIN));
  const wantSeats = msg.seats || msg.hashes.length > 0;
  if (wantSeats) statements.push(db.prepare('SELECT seat, team, human, seen, at, rtt, mode FROM lockstep_seats WHERE room = ?1 ORDER BY seat').bind(id));
  const results = await batch(db, statements);
  const room = results[sealAt].results[0];
  let rows = msg.turns && !fromSegments ? results[readAt].results : null, segment = fromSegments ? results[readAt].results[0] || null : null;
  let sealed = room.sealed, desync = room.desync;
  if (rows && rows.length >= core.MAX_ROWS) sealed = rows[rows.length - 1].turn - 1; // truncated: report only complete turns
  if (fromSegments) sealed = segment ? segment.last : Math.min(sealed, head.base - 1);
  let list = wantSeats ? results[snapAt + (wantSnap ? 1 : 0)].results : null;
  const snap = wantSnap ? results[snapAt].results[0] || null : null;
  // Desync v1: once every playing seat reported a disputed step, the majority wins; the minority seats leave (computer takes over).
  for (let i = 0; i < msg.hashes.length; i++) {
    const r = results[hashAt + i].results[0];
    if (!r || !r.bad) continue;
    const decided = desync ? JSON.parse(desync) : null;
    if (decided && decided.steps?.includes(msg.hashes[i].step)) continue;
    const reports = core.hashReports(r), present = list.filter((s) => s.human && s.mode === 0 && now - s.seen <= core.ACTIVE_MS).map((s) => s.seat);
    if (!present.every((p) => reports.some(([q]) => q === p))) continue; // wait for the other active seats' checksums
    const vote = core.majority(reports); if (!vote) continue;
    const event = { step: msg.hashes[i].step, hash: vote.hash, winners: vote.winners, losers: vote.losers, tie: vote.tie, reports, at: now };
    const next = decided ? { ...decided, losers: [...new Set([...decided.losers, ...vote.losers])].sort((a, b) => a - b), steps: [...decided.steps, event.step], events: [...decided.events, event].slice(-8) }
      : { step: event.step, hash: vote.hash, winners: vote.winners, losers: vote.losers, tie: vote.tie, reports, at: now, steps: [event.step], events: [event] };
    desync = JSON.stringify(next);
    const out = [db.prepare('UPDATE lockstep_rooms SET desync = ?2, expires_at = MAX(expires_at, ?3) WHERE id = ?1').bind(id, desync, now + DESYNC_KEEP)];
    for (const loser of vote.losers) { const s = list.find((x) => x.seat === loser); if (s && s.mode === 0) out.push(...switchStatements(db, id, loser, 0, 2, takeoverCmd(s, 'desync'))); }
    await batch(db, out);
    list = list.map((s) => (vote.losers.includes(s.seat) && s.mode === 0 ? { ...s, mode: 2 } : s));
  }
  let delay = room.delay, seats = null;
  if (msg.seats) {
    seats = list.map((s) => [s.seat, s.team, s.at, now - s.seen, s.mode]);
    const next = core.adaptDelay(delay, list.filter((s) => s.human && s.mode === 0 && now - s.seen <= core.ACTIVE_MS && s.rtt !== null).map((s) => s.rtt), head.period);
    const silent = list.filter((s) => s.human && s.mode === 0 && now - s.seen > core.TAKEOVER_MS && room.status === 'playing');
    const out = [];
    if (next !== delay) { out.push(db.prepare('UPDATE lockstep_rooms SET delay = ? WHERE id = ?').bind(next, id)); delay = next; }
    for (const s of silent) out.push(...switchStatements(db, id, s.seat, 0, 1, takeoverCmd(s, 'offline'), active));
    if (out.length) await batch(db, out);
  }
  // Compact reply (~40 bytes when idle): n is relative to startAt; static fields only come with the seat table.
  const text = '{"n":' + (now - head.startAt) + ',"se":' + sealed + ',"d":' + delay + (held ? ',"hw":' + held : '') + (desync ? ',"ds":' + desync : '')
    + (seats ? ',"st":' + head.startAt + ',"p":' + head.period + ',"me":' + seat + ',"seats":' + JSON.stringify(seats) : '')
    + (snap ? ',"snap":' + JSON.stringify({ turn: snap.turn, step: snap.step, hash: snap.hash, parts: snap.parts, agree: snap.agree }) : '')
    + (segment ? ',"t":' + segment.rows + ',"base":' + head.base : rows ? ',"t":' + core.rowsJSON(rows) : fromSegments ? ',"t":[]' : '') + '}';
  return { text, sealed, rows: rows || (segment ? [0] : []), seats, status: room.status };
}

/* 3c snapshots. Upload: {snap: {turn, step, hash, part, parts, data, meta}} in parts of <= 48 KB (gzip+base64 JSON state,
   made by src/net/snapshots.js); the first complete upload per turn wins, later ones are ignored. Only the two newest
   snapshots of a room are kept. Download: {snapget: turn} -> {turn, step, hash, meta, data: [parts], seq (this seat's
   highest stored command seq)}. The relay never parses the state; clients verify it against the agreed step hash. */
const SNAP_GAIN = 600, SNAP_PART = 49152, SNAP_PARTS = 64;
async function putSnapshot(raw, id, head, snap, now) {
  const db = session(raw), turn = snap.turn, part = snap.part, parts = snap.parts;
  if (!Number.isSafeInteger(turn) || turn <= 0 || turn % 3000 !== 0 || snap.step !== turn * core.STEPS_PER_TURN || !/^[0-9a-f]{8}$/.test(snap.hash || '') || !Number.isSafeInteger(part) || !Number.isSafeInteger(parts) || parts < 1 || parts > SNAP_PARTS || part < 0 || part >= parts || typeof snap.data !== 'string' || snap.data.length > SNAP_PART || turn > head.sealed + 3000)
    throw Object.assign(new Error('快照无效'), { status: 400 });
  const meta = JSON.stringify({ aiSeats: Array.isArray(snap.meta?.aiSeats) ? snap.meta.aiSeats.filter(Number.isSafeInteger).slice(0, 8) : [], enc: snap.meta?.enc === 'gzip' ? 'gzip' : 'json', seat: head.seat });
  const r = await batch(db, [
    db.prepare('INSERT INTO lockstep_snapshots (room, turn, step, hash, parts, meta, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) ON CONFLICT (room, turn) DO NOTHING').bind(id, turn, snap.step, snap.hash, parts, meta, now),
    db.prepare('INSERT OR IGNORE INTO lockstep_snapshot_parts (room, turn, part, data) SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM lockstep_snapshots WHERE room = ?1 AND turn = ?2 AND hash = ?5 AND parts = ?6 AND meta = ?7)').bind(id, turn, part, snap.data, snap.hash, parts, meta),
    db.prepare('DELETE FROM lockstep_snapshot_parts WHERE room = ?1 AND turn < (SELECT MIN(turn) FROM (SELECT turn FROM lockstep_snapshots WHERE room = ?1 ORDER BY turn DESC LIMIT 2))').bind(id),
    db.prepare('DELETE FROM lockstep_snapshots WHERE room = ?1 AND turn < (SELECT MIN(turn) FROM (SELECT turn FROM lockstep_snapshots WHERE room = ?1 ORDER BY turn DESC LIMIT 2))').bind(id),
    db.prepare('SELECT COUNT(*) AS n FROM lockstep_snapshot_parts WHERE room = ?1 AND turn = ?2').bind(id, turn),
  ]);
  return { ok: true, stored: r[4].results[0].n };
}
async function getSnapshot(raw, id, head, turn) {
  const db = session(raw), r = await batch(db, [
    db.prepare('SELECT turn, step, hash, parts, meta FROM lockstep_snapshots WHERE room = ?1 AND turn = ?2').bind(id, turn),
    db.prepare('SELECT data FROM lockstep_snapshot_parts WHERE room = ?1 AND turn = ?2 ORDER BY part').bind(id, turn),
    db.prepare('SELECT MAX(seq) AS seq FROM lockstep_cmds WHERE room = ?1 AND seat = ?2').bind(id, head.seat),
  ]);
  const s = r[0].results[0], data = r[1].results.map((x) => x.data);
  if (!s || data.length !== s.parts) return null;
  return { turn: s.turn, step: s.step, hash: s.hash, meta: JSON.parse(s.meta), data, seq: r[2].results[0]?.seq || 0 };
}

async function replayText(raw, id) {
  const db = session(raw), room = await db.prepare('SELECT setup, seats, sealed, period, desync, base FROM lockstep_rooms WHERE id = ?').bind(id).first();
  const rows = (await db.prepare('SELECT turn, seat, seq, cmd AS text FROM lockstep_cmds WHERE room = ? AND turn <= ? ORDER BY turn, seat, seq').bind(id, room.sealed).all()).results;
  if (room.base > 0) for (const seg of (await db.prepare('SELECT rows FROM lockstep_segments WHERE room = ? ORDER BY last_turn').bind(id).all()).results)
    for (const [turn, seat, seq, c] of JSON.parse(seg.rows)) rows.push({ turn, seat, seq, text: JSON.stringify(c) });
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
    if (head.mode === 2 && !msg.replay) return fail(409, '本机与多数玩家不同步，已退出本局（可下载录像）');
    if (msg.replay) return reply(await replayText(env.DB, id));
    if (body.snap) return reply(JSON.stringify(await putSnapshot(env.DB, id, head, body.snap, now)));
    if (Number.isSafeInteger(body.snapget)) { const r = await getSnapshot(env.DB, id, head, body.snapget); return r ? reply(JSON.stringify(r)) : fail(404, '快照不存在'); }
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
   isolates (or be HTTP clients) and still agree. Messages are the durable.cjs ones (hello/start/cmd/ack/ping/turns/pong).

   3c resilience (field failure 2026-11-19: "等待网络… 213s" from minute 16:43 on, never recovering):
   - A socket is ONE Worker invocation for its whole life, and the platform caps the subrequests / D1 calls one invocation
     may make. At one exchange per 100 ms turn a socket used up that budget after ~16.7 minutes; from then on every D1 call
     threw, the error was swallowed, and the socket stayed open but silent, so the client never reconnected. Now each socket
     counts its D1 calls and, after SOCKET_BUDGET of them (default 2400, ~4 minutes), asks the client to reconnect
     ({type:'reconnect'}) and closes; the new socket is a fresh invocation and hello resumes from the last turn received.
   - FAILS_TO_CLOSE consecutive failed exchanges close the socket (1011) instead of idling, so any other D1 or platform
     failure also ends in a reconnect (or the client's HTTP fallback) rather than a silent wait.
   - A 'turns' message goes out at least every HEARTBEAT ms even when nothing new was sealed (the relay holding for a slow
     seat), so the client's watchdog can tell a live-but-waiting relay from a dead socket.
   - Presence ('seen') is the time of the client's last message, not the relay's own tick: a backgrounded tab whose socket
     is still open but whose page is frozen stops counting as present, so the 60 s computer takeover can start. */
const SOCKET_BUDGET = 2400, FAILS_TO_CLOSE = 3, HEARTBEAT = 1000;
function meteredDB(raw, meter) {
  const count = () => { meter.calls++; };
  const wrap = (inner) => ({ bind(...a) { const b = inner.bind(...a); return { _inner: b, _sync: b._sync, first: (...x) => (count(), b.first(...x)), all: (...x) => (count(), b.all(...x)), run: (...x) => (count(), b.run(...x)) }; } });
  const api = { schemaKey: raw.schemaKey || raw, withSession: () => api, prepare: (sql) => wrap(session(raw).prepare(sql)), batch: (list) => (count(), batch(session(raw), list.map((x) => x._inner || x))) };
  return api;
}
function attachSocket(ws, env, id, { now: clock = Date.now, setTimeout: st = setTimeout, clearTimeout: ct = clearTimeout, budget } = {}) {
  const meter = { calls: 0 }, DB = meteredDB(env.DB, meter), limit = budget || Number(env.LOCKSTEP_SOCKET_BUDGET) || SOCKET_BUDGET;
  let head = null, after = -1, at = -1, rtt = null, hashes = [], timer = null, closed = false, busy = false, fails = 0, lastSent = 0, lastMsg = clock(), extra = {};
  const send = (text) => { try { ws.send(text); } catch { closed = true; } };
  const finish = (code, reason) => { if (closed) return; send(JSON.stringify({ type: 'reconnect', reason })); closed = true; ct(timer); try { ws.close(code, reason); } catch { /* already closing */ } };
  const schedule = () => { if (closed || !head) return; const n = clock(), c = core.clockTurn(head.startAt, head.period, n); ct(timer); timer = st(tickNow, Math.max(1, head.startAt + (c + 1) * head.period + 2 - n)); };
  async function tickNow() {
    if (closed || busy) return; // a running exchange reschedules itself when it ends
    if (meter.calls >= limit) return finish(4000, 'budget');
    busy = true;
    try {
      const h = hashes.splice(0, 16), x = extra; extra = {};
      const r = await exchange(DB, id, head, { after, at, rtt, cmds: [], hashes: h, turns: true, seats: x.seats || false, seen: lastMsg, ...x }, clock());
      fails = 0;
      const n = clock();
      if (r.sealed > after || r.rows.length || r.seats || n - lastSent >= HEARTBEAT) { send('{"type":"turns",' + r.text.slice(1)); lastSent = n; after = Math.max(after, r.sealed); }
    } catch (err) {
      if (++fails >= FAILS_TO_CLOSE) { busy = false; return finish(1011, 'relay'); }
    } finally { busy = false; schedule(); }
  }
  ws.addEventListener('message', async (e) => {
    let msg; try { msg = JSON.parse(typeof e.data === 'string' ? e.data : new TextDecoder().decode(e.data)); } catch { return; }
    lastMsg = clock();
    try {
      if (msg.type === 'hello') {
        head = await lookup(DB, id, await sha256(String(msg.token || '')));
        if (!head || head.seat !== msg.seat || head.expires <= clock() || head.mode === 2) { send(JSON.stringify({ type: 'error', error: '席位凭据无效，请重新加入房间' })); try { ws.close(4001, 'auth'); } catch { /* ignore */ } return; }
        after = Number.isSafeInteger(msg.last) ? msg.last : -1;
        if (Number.isSafeInteger(msg.x)) at = Math.max(at, msg.x);
        const room = await DB.prepare('SELECT setup, seats, delay FROM lockstep_rooms WHERE id = ?').bind(id).first();
        send(JSON.stringify({ type: 'start', setup: JSON.parse(room.setup), seats: JSON.parse(room.seats), startAt: head.startAt, period: head.period, d: room.delay, n: clock() - head.startAt, budget: limit }));
        extra = { seats: true, fresh: true }; ct(timer); tickNow(); return;
      }
      if (!head) return;
      const parsed = core.parseClient(msg);
      if (msg.type === 'cmd' && parsed.cmds.length) { await exchange(DB, id, head, { ...parsed, after, at, rtt, turns: false, seats: false, hashes: [], seen: lastMsg }, clock()); fails = 0; }
      else if (msg.type === 'ack') { at = Math.max(at, parsed.at); hashes.push(...parsed.hashes); if (msg.s) extra.seats = true; if (msg.k === 1) extra.reclaim = true; }
      else if (msg.type === 'ping') { if (parsed.rtt !== null) rtt = parsed.rtt; send(JSON.stringify({ type: 'pong', t: msg.t, n: clock() - head.startAt })); }
    } catch (err) {
      send(JSON.stringify({ type: 'error', error: err.message || '无效消息', retry: true }));
      if (++fails >= FAILS_TO_CLOSE) finish(1011, 'relay');
    }
  });
  ws.addEventListener('close', () => { closed = true; ct(timer); });
  return { meter };
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

module.exports = { SOCKET_BUDGET, HEARTBEAT, putSegment, segmentCount, dropSegments, handle, handleSocket, attachSocket, exchange, lookup, createRoom, ensureSchema, SCHEMA, replayText };
