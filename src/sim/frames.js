/* P4 step 4c-1: what crosses the thread boundary between the simulation worker and the page (no DOM, no clock, pure data).

   Worker -> page, after every batch of steps: a "frame" (render snapshot), sent with structured clone (postMessage):
     state   every key of sim.s except `world` (sent once, it never changes during a match) and `nodes` (delta, below);
             units / buildings / effects / resources / tech / ... are copied whole each frame.
     nodes   resource nodes are ~60% of the state bytes and mostly static: only nodes whose fields changed since the last frame
             are sent ({changed:[node...], order:[ids] when the list itself changed}); the page keeps the others.
     fog     the fog of war only when its revision changed: visible/explored per nation (Uint8Array) and team 0's memory.
     events  sim.events since the last frame (sounds, toasts, end of match ...); the worker clears its list after sending.
     navRev  bumped when the worker's navigation grids were rebuilt (a building finished or fell): the page drops its own copies.
   Page -> worker: player commands as {m: Sim method name, a: arguments}, arguments encoded like the P1 replay format
   ({"$e": id} for a unit / building / node), so the worker records exactly what a main-thread game records. */

export const FRAME_VERSION = 1;

/* ---------- worker side ---------- */

const flat = (v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
function nodeChanged(prev, n) {
  if (!prev) return true;
  let count = 0;
  for (const k in n) { count++; if (prev[k] !== flat(n[k])) return true; }
  return count !== prev.__n;
}
function remember(n) { const o = { __n: 0 }; for (const k in n) { o[k] = flat(n[k]); o.__n++; } return o; }

export function createFrameSource() {
  return { nodes: new Map(), order: null, fogRev: -1, grid: null, seaGrid: null, gates: null, navRev: 0, worldSent: false };
}

/* Builds one frame from the live simulation. `src` is the per-game cache from createFrameSource(). The frame references live
   simulation objects: post it (structured clone copies synchronously) before the next step. */
export function buildFrame(sim, src, step) {
  const s = sim.s, state = {};
  for (const k in s) if (k !== 'world' && k !== 'nodes') state[k] = s[k];
  // nodes: changed objects plus the id order when the list changed
  const list = s.nodes, changed = [];
  let orderChanged = !src.order || src.order.length !== list.length;
  if (!orderChanged) for (let i = 0; i < list.length; i++) if (src.order[i] !== list[i].id) { orderChanged = true; break; }
  const seen = orderChanged ? new Set() : null;
  for (let i = 0; i < list.length; i++) {
    const n = list[i];
    if (seen) seen.add(n.id);
    if (nodeChanged(src.nodes.get(n.id), n)) { changed.push(n); src.nodes.set(n.id, remember(n)); }
  }
  let order = null;
  if (orderChanged) {
    order = list.map((n) => n.id); src.order = order.slice();
    for (const id of [...src.nodes.keys()]) if (!seen.has(id)) src.nodes.delete(id);
  }
  // fog: only when the revision changed
  let fog = null; const f = sim.fog;
  if (f && f.revision !== src.fogRev) {
    src.fogRev = f.revision;
    fog = { cols: f.cols, rows: f.rows, revision: f.revision, visible: f.visible, explored: f.explored, memory0: f.memory?.[0] || {} };
  } else if (!f && src.fogRev !== null) { src.fogRev = null; fog = { off: true }; }
  // navigation grids rebuilt (cache identity changed) -> the page drops its copies
  if (sim.grid !== src.grid || sim.seaGrid !== src.seaGrid || sim._gateGrids !== src.gates) {
    src.grid = sim.grid; src.seaGrid = sim.seaGrid; src.gates = sim._gateGrids; src.navRev++;
  }
  const events = sim.events; sim.events = [];
  const frame = { t: 'frame', v: FRAME_VERSION, step, time: s.time, state, nodes: { changed, order }, fog, events, navRev: src.navRev };
  if (!src.worldSent) { frame.world = s.world; src.worldSent = true; }
  return frame;
}

/* ---------- page side ---------- */

/* Rebuilds the full node list from a frame (keeps unchanged node objects from the previous frame). Returns a NEW array, so
   identity-keyed caches (Sim.byId index, expansion.js visibleView) notice the change. */
export function mergeNodes(prev, delta) {
  const byId = new Map();
  for (const n of prev || []) byId.set(n.id, n);
  for (const n of delta.changed) byId.set(n.id, n);
  const order = delta.order || (prev || []).map((n) => n.id);
  const out = new Array(order.length);
  for (let i = 0; i < order.length; i++) out[i] = byId.get(order[i]);
  return out;
}

/* Arguments for the worker: units / buildings / nodes become {$e:id}. Unlike the recorder's encodeArg, an entity is recognised
   by its id and kind (the page may still hold an object from an older frame: a button built 0.25 s ago), not by identity. */
export function encodeForWorker(v, depth = 0) {
  if (v === undefined) return { $u: 1 };
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : { $n: String(v) };
  if (typeof v === 'function') return { $u: 1 };
  if (depth > 6) throw Error('simWorker: argument nested too deeply');
  if (Array.isArray(v)) return v.map((x) => encodeForWorker(x, depth + 1));
  if (typeof v === 'object') {
    if (typeof v.id === 'number' && typeof v.kind === 'string') return { $e: v.id };
    const out = {};
    for (const k of Object.keys(v)) if (typeof v[k] !== 'function') out[k] = encodeForWorker(v[k], depth + 1);
    return out;
  }
  return null;
}
/* Page-side decode for the local prediction: current frame objects where they exist, else the object the caller passed. */
export function decodeLocal(sim, enc, orig) {
  if (enc === null || typeof enc !== 'object') return enc;
  if (Array.isArray(enc)) return enc.map((x, i) => decodeLocal(sim, x, Array.isArray(orig) ? orig[i] : undefined));
  if ('$u' in enc) return undefined;
  if ('$n' in enc) return Number(enc.$n);
  if ('$e' in enc) return sim.byId(enc.$e) ?? orig;
  const out = {};
  for (const k of Object.keys(enc)) out[k] = decodeLocal(sim, enc[k], orig?.[k]);
  return out;
}

/* What a command returned, in a cloneable form (same shapes as the replay recorder's results). */
export function resultOf(r) {
  if (r === undefined || r === null || typeof r === 'string' || typeof r === 'boolean' || typeof r === 'number') return r ?? null;
  if (typeof r.id === 'number') return { $e: r.id };
  if (typeof r.error === 'string') return { error: r.error };
  if (r.building && typeof r.building.id === 'number') return { building: r.building.id };
  if (typeof r.count === 'number') return { count: r.count, error: r.error ?? null };
  return '[object]';
}
