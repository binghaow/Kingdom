/* State checksum (P1). A fast, order-independent fingerprint of the simulation state that matters for lockstep:
   every entity is visited in id order, numbers are quantized to a fixed precision before hashing, and the result is
   a 32-bit FNV-1a value printed as 8 hex digits. Pure function of sim.s: no DOM, no clock, no Math.random.

   Precision: positions / hp / amounts / resources at 1/100 (Math.round(x*100)), time at 1 ms. Two runs that differ
   by less than that rounding are treated as equal; any real divergence shows up within a few steps anyway because
   the simulation feeds positions back into itself.

   Not hashed on purpose: effects (visual particles, the UI also pushes "upgrade" sparkles into them), events,
   caches (grids, path caches, fog bitmaps), chat log text. These are presentation or derived data. */

const OFFSET = 0x811c9dc5, PRIME = 16777619, SCALE = 100;

export function fnvInt(h, v) {
  // v: any integer-valued number. Split into two 32-bit halves so values above 2^31 still hash exactly.
  const lo = v | 0, hi = Math.floor(v / 4294967296) | 0;
  h = Math.imul(h ^ (lo & 0xff), PRIME); h = Math.imul(h ^ ((lo >>> 8) & 0xff), PRIME);
  h = Math.imul(h ^ ((lo >>> 16) & 0xff), PRIME); h = Math.imul(h ^ (lo >>> 24), PRIME);
  if (hi !== 0 && hi !== -1) { h = Math.imul(h ^ (hi & 0xffff), PRIME); h = Math.imul(h ^ (hi >>> 16), PRIME); }
  return h;
}
export function fnvNum(h, x) {
  if (x === undefined || x === null) return fnvInt(h, -0x7ffffff1);
  if (typeof x === 'boolean') return fnvInt(h, x ? 1 : 0);
  if (typeof x !== 'number') x = Number(x);
  if (!Number.isFinite(x)) return fnvInt(h, Number.isNaN(x) ? -0x7ffffff2 : x > 0 ? -0x7ffffff3 : -0x7ffffff4);
  return fnvInt(h, Math.round(x * SCALE));
}
export function fnvStr(h, s) {
  if (s === undefined || s === null) return fnvInt(h, -0x7ffffff5);
  s = String(s);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), PRIME);
  return Math.imul(h ^ 0xff, PRIME);
}
export const fnvString = (s) => (fnvStr(OFFSET, s) >>> 0).toString(16).padStart(8, '0');
const hex = (h) => (h >>> 0).toString(16).padStart(8, '0');
const byId = (a, b) => a.id - b.id;
const refId = (v) => v && typeof v === 'object' ? v.id : v;

function hashOrder(h, o) {
  if (!o) return fnvInt(h, 0);
  h = fnvStr(h, o.type); h = fnvNum(h, refId(o.id)); h = fnvNum(h, o.x); h = fnvNum(h, o.y);
  return fnvNum(h, refId(o.target));
}
function hashUnits(list) {
  let h = OFFSET;
  const units = list.slice().sort(byId);
  for (const u of units) {
    h = fnvInt(h, u.id); h = fnvStr(h, u.kind); h = fnvInt(h, u.team | 0);
    h = fnvNum(h, u.x); h = fnvNum(h, u.y); h = fnvNum(h, u.hp);
    h = hashOrder(h, u.order); h = fnvNum(h, refId(u.combatTarget)); h = fnvNum(h, refId(u.workTarget));
    h = fnvNum(h, u.path ? u.path.length : 0);
    if (u.cargo) { h = fnvStr(h, u.cargo.type || u.cargo.resource); h = fnvNum(h, u.cargo.amount); } else h = fnvInt(h, 0);
    h = fnvNum(h, refId(u.embarkedOn));
  }
  return h;
}
function hashBuildings(list) {
  let h = OFFSET;
  for (const b of list.slice().sort(byId)) {
    h = fnvInt(h, b.id); h = fnvStr(h, b.kind); h = fnvInt(h, b.team | 0);
    h = fnvNum(h, b.x); h = fnvNum(h, b.y); h = fnvNum(h, b.hp); h = fnvInt(h, b.complete === false ? 0 : 1);
    h = fnvNum(h, b.progress); h = fnvNum(h, b.amount);
    const q = b.queue || [];
    h = fnvInt(h, q.length);
    for (const item of q) { h = fnvStr(h, item.type); h = fnvStr(h, item.kind); h = fnvNum(h, item.left); }
  }
  return h;
}
function hashNodes(list) {
  let h = OFFSET;
  for (const n of list.slice().sort(byId)) { h = fnvInt(h, n.id); h = fnvStr(h, n.kind || n.type); h = fnvNum(h, n.amount); h = fnvNum(h, n.x); h = fnvNum(h, n.y); }
  return h;
}
function hashEconomy(s) {
  let h = OFFSET;
  const res = s.resources || [];
  for (let t = 0; t < res.length; t++) { const r = res[t] || {}; for (const k of ['food', 'wood', 'gold', 'stone']) h = fnvNum(h, r[k]); }
  for (const a of s.ages || []) h = fnvNum(h, a);
  for (const tech of s.tech || []) { if (!tech) { h = fnvInt(h, 0); continue; } for (const k of Object.keys(tech).sort()) { h = fnvStr(h, k); h = fnvNum(h, tech[k]); } }
  for (const d of (s.defeated || []).slice().sort((a, b) => a - b)) h = fnvInt(h, d);
  h = fnvInt(h, s.ended ? 1 : 0);
  return h;
}

/* checksum(sim or state) -> { hash, parts:{units,buildings,nodes,economy}, rng, time, units }
   `hash` folds every part together with the RNG state and the simulation clock. */
export function checksum(simOrState) {
  const s = simOrState && simOrState.s ? simOrState.s : simOrState;
  const u = hashUnits(s.units || []), b = hashBuildings(s.buildings || []), n = hashNodes(s.nodes || []), e = hashEconomy(s);
  let h = OFFSET;
  h = fnvInt(h, u); h = fnvInt(h, b); h = fnvInt(h, n); h = fnvInt(h, e);
  h = fnvInt(h, s.rng | 0); h = fnvInt(h, Math.round((s.time || 0) * 1000));
  return { hash: hex(h), parts: { units: hex(u), buildings: hex(b), nodes: hex(n), economy: hex(e) }, rng: s.rng | 0, time: Math.round((s.time || 0) * 1000) / 1000, units: (s.units || []).length };
}
