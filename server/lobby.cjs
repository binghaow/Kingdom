'use strict';
/* Open-room list and short numeric room codes (net lobby v2).
   One small D1 table holds only what the public list needs plus the 3-digit code -> room id alias:
   no token, no token hash, no seat data. Rooms keep their 8-character id (used by invite links, the lockstep relay
   and old clients); the 3-digit code (000-999) is a convenience alias and old 8-character codes keep working unchanged.
   A code is held only while its room is open or in progress: it is freed when the room ends/closes or after
   30 minutes without room traffic (expires_at = last activity + 30 min). If all 1000 are held, a 4-digit code is used.
   The table is created on first use (CREATE IF NOT EXISTS) like the lockstep tables; drizzle/0003_lobby.sql has the
   same schema for hosts that run migrations. */
const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS multiplayer_lobby (id TEXT PRIMARY KEY NOT NULL, code TEXT NOT NULL UNIQUE, listed INTEGER NOT NULL DEFAULT 1, waiting INTEGER NOT NULL DEFAULT 1, host TEXT NOT NULL, nation TEXT NOT NULL, map TEXT NOT NULL, capacity INTEGER NOT NULL, joined INTEGER NOT NULL, lockstep INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, seen_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS multiplayer_lobby_open ON multiplayer_lobby (listed, waiting, created_at)',
  'CREATE INDEX IF NOT EXISTS multiplayer_lobby_expires ON multiplayer_lobby (expires_at)',
];
/* List window and freshness: created within 10 minutes, host still polling (seen within 30 s). */
const WINDOW = 10 * 60 * 1000, FRESH = 30 * 1000, LIMIT = 20, CODE_IDLE = 30 * 60 * 1000;
/* The service refreshes a waiting room's row at most this often while players poll (plus on join/leave/start/settings);
   a room in progress refreshes its code lease every PLAY_REFRESH. */
const REFRESH = 10 * 1000, PLAY_REFRESH = 5 * 60 * 1000;
const LIST_SQL = 'SELECT id, code, host, nation, map, capacity, joined, lockstep, created_at FROM multiplayer_lobby WHERE listed = 1 AND waiting = 1 AND created_at > ? AND seen_at > ? ORDER BY created_at DESC LIMIT ' + LIMIT;
const codeValid = (x) => typeof x === 'string' && /^[0-9]{3,4}$/.test(x);
const digits = (n) => String(crypto.getRandomValues(new Uint32Array(1))[0] % 10 ** n).padStart(n, '0');

const ready = new WeakMap();
const session = (db) => (db.withSession ? db.withSession('first-primary') : db);
async function ensureSchema(raw) {
  let p = ready.get(raw);
  if (!p) { p = (async () => { const db = session(raw); for (const sql of SCHEMA) await db.prepare(sql).bind().run(); })(); ready.set(raw, p); p.catch(() => ready.delete(raw)); }
  return p;
}

/* Pick an unused code for room.id and store the (id, code) row; sets room.code. Returns false only if the id is taken.
   Random 3-digit tries first; then a free 3-digit code from the held set; only if all 1000 are held, 4 digits. */
async function reserve(raw, room, now) {
  await ensureSchema(raw); const db = session(raw);
  for (let i = 0; i < 12; i++) {
    let code;
    if (i < 6) code = digits(3);
    else if (i < 8) {
      const held = new Set(((await db.prepare('SELECT code FROM multiplayer_lobby WHERE length(code) = 3 AND expires_at > ?').bind(now).all()).results || []).map((r) => r.code));
      const free = []; for (let n = 0; n < 1000; n++) { const c = String(n).padStart(3, '0'); if (!held.has(c)) free.push(c); }
      code = free.length ? free[crypto.getRandomValues(new Uint32Array(1))[0] % free.length] : digits(4);
    } else code = digits(4);
    room.code = code;
    const r = await insert(db, room, now);
    if (r === 'ok') return true;
    if (r === 'id') return false;
  }
  return false;
}
async function insert(db, room, now) {
  if (await db.prepare('SELECT 1 FROM multiplayer_lobby WHERE id = ?').bind(room.id).first()) return 'id';
  await db.prepare('DELETE FROM multiplayer_lobby WHERE code = ? AND expires_at <= ?').bind(room.code, now).run();
  const r = await db.prepare('INSERT OR IGNORE INTO multiplayer_lobby (id, code, listed, waiting, host, nation, map, capacity, joined, lockstep, created_at, seen_at, expires_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?, 1, ?, ?, ?, ?)')
    .bind(room.id, room.code, room.config.private ? 0 : 1, row(room).host, row(room).nation, room.config.mapId, room.config.capacity, room.config.lockstep ? 1 : 0, now, now, now + CODE_IDLE).run();
  return r.meta.changes === 1 ? 'ok' : 'code';
}
async function release(raw, id) { await ensureSchema(raw); await session(raw).prepare('DELETE FROM multiplayer_lobby WHERE id = ?').bind(id).run(); }

function row(room) {
  const host = room.players[room.host] || room.players.find(Boolean);
  const joined = room.players.filter(Boolean).length;
  return { host: host ? String(host.name).slice(0, 24) : '', nation: host ? host.nation : '', joined, waiting: room.status === 'lobby' && joined > 0 && joined < room.config.capacity ? 1 : 0 };
}
/* Copy the room's current public summary into its lobby row (legacy rooms without a code have no row).
   An ended or closed room frees its code at once; otherwise the code lease runs 30 minutes from now. */
async function sync(raw, room, now) {
  if (!room.code) return;
  await ensureSchema(raw); const r = row(room), live = room.status === 'lobby' || room.status === 'playing';
  await session(raw).prepare('UPDATE multiplayer_lobby SET host = ?, nation = ?, joined = ?, waiting = ?, seen_at = ?, expires_at = ? WHERE id = ?')
    .bind(r.host, r.nation, r.joined, r.waiting, now, live ? now + CODE_IDLE : now, room.id).run();
}
async function resolve(raw, code, now) {
  if (!codeValid(code)) return null;
  await ensureSchema(raw);
  const r = await session(raw).prepare('SELECT id FROM multiplayer_lobby WHERE code = ? AND expires_at > ?').bind(code, now).first();
  return r ? r.id : null;
}
async function cleanup(raw, now) { await ensureSchema(raw); await session(raw).prepare('DELETE FROM multiplayer_lobby WHERE id IN (SELECT id FROM multiplayer_lobby WHERE expires_at <= ? LIMIT 8)').bind(now).run(); }

/* GET /api/rooms/open: read-only, public fields only. Per-isolate cache (2 s) bounds D1 reads to one indexed query per
   isolate per 2 s however many lobbies poll; a per-isolate per-IP limit (40 requests / 20 s) stops one client hammering it. */
let cache = null; const hits = new Map();
function limited(ip, now) {
  if (hits.size > 5000) hits.clear();
  const key = ip || 'shared', h = hits.get(key);
  if (!h || now - h.at > 20000) { hits.set(key, { at: now, n: 1 }); return false; }
  return ++h.n > (ip ? 40 : 400);
}
async function list(raw, now, ip) {
  if (limited(ip, now)) return { status: 429, body: { error: '刷新太频繁，请稍后再试' } };
  if (cache && cache.db === raw && now - cache.at < 2000) return { status: 200, body: { rooms: cache.rooms.map((r) => ({ ...r, age: Math.max(0, Math.round((now - r.createdAt) / 1000)) })), now } };
  await ensureSchema(raw);
  const res = await session(raw).prepare(LIST_SQL).bind(now - WINDOW, now - FRESH).all();
  const rooms = (res.results || []).map((r) => ({ id: r.id, code: r.code, host: r.host, nation: r.nation, map: r.map, capacity: r.capacity, joined: r.joined, lockstep: !!r.lockstep, createdAt: r.created_at }));
  cache = { db: raw, at: now, rooms };
  return { status: 200, body: { rooms: rooms.map((r) => ({ ...r, age: Math.max(0, Math.round((now - r.createdAt) / 1000)) })), now } };
}
function resetCache() { cache = null; hits.clear(); }

module.exports = { SCHEMA, LIST_SQL, WINDOW, FRESH, REFRESH, PLAY_REFRESH, CODE_IDLE, codeValid, ensureSchema, reserve, release, sync, resolve, cleanup, list, resetCache, row };
