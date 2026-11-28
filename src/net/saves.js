/* 3c online save ("保存联机进度"): room parameters + the full command recording of a lockstep match, kept on this device
   (IndexedDB, falling back to localStorage) and downloadable as a file. A save can
   - restore the online room: the host opens a new room with it (new 3-digit code), the others join and claim their old
     seats, everybody replays the recording headless up to the save point and play continues (unclaimed seats -> computer);
   - be watched as a replay in single player.
   Nothing here touches the simulation; the recording is the relay's ordered command stream (player + system commands).

   3e: a save also carries the newest 5-minute snapshot the client holds (snapshot {turn, step, hash, aiSeats, enc, data},
   the same gzip+base64 JSON state the relay stores, see snapshots.js). Restoring uploads that snapshot plus only the
   commands from its turn on; every client loads and verifies the snapshot and replays just the turns after it, instead of
   replaying the whole match from turn 0. `from` is the first turn the save's commands cover (0 unless the match itself
   was restored from a snapshot; then turns before `from` can only be reached through the snapshot). Saves without a
   snapshot (shorter than 5 minutes, or made before 3e) restore from turn 0 as before. */

import { checksum } from '../core/hash.js';
import { encode, decode } from './snapshots.js';

export const FORMAT = 'kingdom-lockstep-save', VERSION = 1, KEEP = 6, SEGMENT_BYTES = 48000;
const DB_NAME = 'kingdom-online-saves', STORE = 'saves', LS_PREFIX = 'kingdom-online-save:';

/* Builds a save from a running LockstepClient. room: the lobby room (publicRoom shape). */
export function makeSave(client, room, { auto = false, commands = null, from = null } = {}) {
  const players = (room.players || []).map((p, seat) => (p ? { seat, name: p.name, nation: p.nation, group: p.group, team: p.team ?? null } : null)).filter(Boolean);
  return {
    format: FORMAT, version: VERSION, savedAt: new Date().toISOString(), auto,
    room: { id: room.id, code: room.code || null, config: room.config, players },
    self: client.seat, setup: client.setup, period: client.period, seats: [...client.teams].map(([seat, team]) => ({ seat, team })),
    turns: client.nextTurn, step: client.step, hash: client.sim ? checksum(client.sim).hash : (client.saveHash?.turn === client.nextTurn ? client.saveHash.hash : (client.hashLog?.at(-1)?.[1] || '')), aiSeats: [...client.aiSeats],
    // A client that resumed from a relay snapshot has no local log before it: the caller passes the relay recording instead.
    from: from ?? (commands ? 0 : client.logFrom || 0),
    commands: (commands || client.log).filter((r) => r.turn < client.nextTurn).map((r) => ({ turn: r.turn, seat: r.seat, seq: r.seq, c: r.c })),
  };
}

/* Adds the client's newest snapshot (made or loaded at or after save.from, not after the save point). Encoding is cached
   on the snapshot, so the 2-minute autosave compresses each snapshot once. Returns the save. */
export async function attachSnapshot(save, client) {
  const snap = client.lastSnap;
  if (!snap || !snap.text && !snap.encoded || snap.turn > save.turns || snap.turn < (save.from || 0)) return save;
  if (!snap.encoded) snap.encoded = await encode(snap.text);
  save.snapshot = { turn: snap.turn, step: snap.step, hash: snap.hash, aiSeats: snap.aiSeats || [], enc: snap.encoded.enc, data: snap.encoded.data };
  return save;
}
/* Decoded snapshot of a save ({turn, hash, text, aiSeats, encoded}) for LockstepClient.loadSnapshot / replayLockstep. */
export async function saveSnapshot(save) {
  const s = save?.snapshot; if (!s) return null;
  return { turn: s.turn, hash: s.hash, aiSeats: s.aiSeats || [], text: await decode(s.data, s.enc), encoded: { enc: s.enc, data: s.data } };
}
/* First turn a restore has to replay: the snapshot's turn when the save has one, else 0. */
export const restoreBase = (save) => (save?.snapshot ? save.snapshot.turn : 0);
export function snapshotParts(save, size = SEGMENT_BYTES) {
  const d = save.snapshot.data, out = []; for (let i = 0; i < d.length; i += size) out.push(d.slice(i, i + size)); return out.length ? out : [''];
}

export function validSave(save) {
  if (!(!!save && save.format === FORMAT && save.version === VERSION && save.setup && Array.isArray(save.commands) && Array.isArray(save.seats) && Number.isSafeInteger(save.turns))) return false;
  const s = save.snapshot, from = save.from || 0;
  if (s && !(Number.isSafeInteger(s.turn) && s.turn > 0 && s.turn % 3000 === 0 && s.turn <= save.turns && s.turn >= from && s.step === s.turn * 2 && /^[0-9a-f]{8}$/.test(s.hash || '') && typeof s.data === 'string' && (s.enc === 'gzip' || s.enc === 'json'))) return false;
  return from === 0 || !!s; // commands that start after turn 0 need the snapshot
}

/* Cuts the recording into upload segments of at most SEGMENT_BYTES, each ending on a turn boundary; the last one ends at
   turns - 1 (so a restored relay's catch-up never splits a turn). */
export function segments(save, maxBytes = SEGMENT_BYTES) {
  const out = []; let rows = [], bytes = 2;
  const base = restoreBase(save), byTurn = new Map();
  for (const r of save.commands) { if (r.turn < base) continue; if (!byTurn.has(r.turn)) byTurn.set(r.turn, []); byTurn.get(r.turn).push([r.turn, r.seat, r.seq, r.c]); }
  const turns = [...byTurn.keys()].sort((a, b) => a - b);
  for (const t of turns) {
    const list = byTurn.get(t), size = list.reduce((n, r) => n + JSON.stringify(r).length + 1, 0);
    if (rows.length && bytes + size > maxBytes) { out.push({ lastTurn: t - 1, rows }); rows = []; bytes = 2; }
    rows.push(...list); bytes += size;
  }
  out.push({ lastTurn: save.turns - 1, rows });
  return out;
}

/* ---- storage ---- */
function idb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'));
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'key' });
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
const tx = (db, mode, fn) => new Promise((resolve, reject) => { const t = db.transaction(STORE, mode), s = t.objectStore(STORE), out = fn(s); t.oncomplete = () => resolve(out.result ?? out); t.onerror = () => reject(t.error); });
const meta = (key, save) => ({ key, savedAt: save.savedAt, auto: !!save.auto, room: save.room?.code || save.room?.id || '', map: save.setup?.options?.mapId, turns: save.turns, seconds: Math.round(save.turns / 10), snapshot: save.snapshot ? save.snapshot.turn : null, players: (save.room?.players || []).map((p) => p.name), commands: save.commands.length });

export async function store(save) {
  const key = 'room:' + (save.room?.id || 'local');
  try {
    const db = await idb();
    await tx(db, 'readwrite', (s) => s.put({ key, meta: meta(key, save), save }));
    const all = await tx(db, 'readonly', (s) => s.getAll());
    const old = all.map((x) => x.meta).sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt))).slice(KEEP);
    if (old.length) await tx(db, 'readwrite', (s) => { for (const m of old) s.delete(m.key); return {}; });
    return { key, where: 'indexedDB' };
  } catch {
    try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(save)); return { key, where: 'localStorage' }; } catch (e) { return { key, where: null, error: String(e?.message || e) }; }
  }
}
export async function list() {
  const out = [];
  try { const db = await idb(); for (const x of await tx(db, 'readonly', (s) => s.getAll())) out.push(x.meta); } catch { /* none */ }
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(LS_PREFIX) && !out.some((m) => m.key === k.slice(LS_PREFIX.length))) { const s = JSON.parse(localStorage.getItem(k)); if (validSave(s)) out.push(meta(k.slice(LS_PREFIX.length), s)); } } } catch { /* none */ }
  return out.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
}
export async function load(key) {
  try { const db = await idb(); const x = await tx(db, 'readonly', (s) => s.get(key)); if (x?.save) return x.save; } catch { /* fall through */ }
  try { return JSON.parse(localStorage.getItem(LS_PREFIX + key)); } catch { return null; }
}
export async function remove(key) {
  try { const db = await idb(); await tx(db, 'readwrite', (s) => s.delete(key)); } catch { /* none */ }
  try { localStorage.removeItem(LS_PREFIX + key); } catch { /* none */ }
}
export function download(save, name) {
  if (typeof document === 'undefined') return;
  const blob = new Blob([JSON.stringify(save)], { type: 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name || `kingdom-online-${save.room?.code || save.room?.id || 'match'}-${Math.floor(save.turns / 600)}min.json`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
