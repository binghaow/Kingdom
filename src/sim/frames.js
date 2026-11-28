/* P4 steps 4c-1 / 4c-2+: what crosses the thread boundary between the simulation worker and the page (no DOM, no clock, pure data).

   Worker -> page, after every batch of steps: a "frame" (render snapshot), sent with structured clone (postMessage):
     state      every key of sim.s except `world` (sent once), `nodes`, `units` and `buildings` (all sent as deltas below);
     units      field-level delta ({add:[fullUnit...], patch:[{id, ...changedFields, $d?:[deleted]}...], order:[ids]|null});
                idle/stationary units send 0 bytes, moving units send only the few changed fields (x, y, cool, path...);
                long paths send only the first PATH_SENT waypoints + PATH_LEN (restored on the page as a sparse array).
     buildings  field-level delta ({add, patch, order}), same format as units; most buildings are unchanged on any step.
     nodes      resource nodes are ~60% of static state bytes: only changed nodes are sent ({changed:[node...], order:[ids]|null}).
     fog        the fog of war only when its revision changed: visible/explored per nation (Uint8Array) and team 0's memory.
     events     sim.events since the last frame (sounds, toasts, end of match ...); the worker clears its list after sending.
     navRev     bumped when the worker's navigation grids were rebuilt (a building finished or fell): the page drops its own copies.
   Page -> worker: player commands as {m: Sim method name, a: arguments}, arguments encoded like the P1 replay format
   ({"$e": id} for a unit / building / node), so the worker records exactly what a main-thread game records. */

export const FRAME_VERSION = 2;
export const PATH_SENT = 2, PATH_LEN = '__pathLength';

/* ---------- worker side ---------- */

const flat = (v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
function nodeChanged(prev, n) {
  if (!prev) return true;
  let count = 0;
  for (const k in n) { count++; if (prev[k] !== flat(n[k])) return true; }
  return count !== prev.__n;
}
function rememberNode(n) { const o = { __n: 0 }; for (const k in n) { o[k] = flat(n[k]); o.__n++; } return o; }

function isFlatObj(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  for (const k in v) { const x = v[k]; if (x !== null && typeof x === 'object') return false; }
  return true;
}
function sameFlatObj(a, b) {
  if (!a || !b) return false;
  let n = 0;
  for (const k in b) {
    n++;
    const x = b[k], y = a[k];
    if (x !== y && !(x !== x && y !== y)) return false;
    if (!(k in a)) return false;
  }
  return n === a.__n;
}
function copyFlatObj(v) {
  const o = { __n: 0 };
  for (const k in v) { o[k] = v[k]; o.__n++; }
  return o;
}

function slimEntity(e, isUnit) {
  if (!isUnit) return e;
  const p = e.path;
  if (p && p.length > PATH_SENT) return { ...e, path: p.slice(0, PATH_SENT), [PATH_LEN]: p.length };
  return e;
}

function cachePath(rec, p) {
  if (!p) { rec.__pl = p === null ? -2 : -1; return; }
  const len = p.length;
  rec.__pl = len;
  if (len > 0) { rec.__p0x = p[0].x; rec.__p0y = p[0].y; }
  if (len > 1) { rec.__p1x = p[1].x; rec.__p1y = p[1].y; }
}
function pathChanged(rec, p) {
  if (!p) return rec.__pl !== (p === null ? -2 : -1);
  const len = p.length;
  if (rec.__pl !== len) return true;
  if (len > 0 && (rec.__p0x !== p[0].x || rec.__p0y !== p[0].y)) return true;
  if (len > 1 && (rec.__p1x !== p[1].x || rec.__p1y !== p[1].y)) return true;
  return false;
}

function cacheField(k, v) {
  if (v === null || typeof v !== 'object') return v;
  if (k === 'drift' && Array.isArray(v) && v.length === 3) return { __d: 1, a: v[0], b: v[1], c: v[2] };
  if (k === 'cargo' && !Array.isArray(v)) return { __c: 1, r: v.resource, a: v.amount };
  if (k === 'order' && isFlatObj(v)) return { __f: copyFlatObj(v) };
  return { __j: JSON.stringify(v) };
}

function rememberEntity(e, isUnit) {
  const rec = { __n: 0, __pl: -3, __p0x: 0, __p0y: 0, __p1x: 0, __p1y: 0 };
  for (const k in e) {
    rec.__n++;
    if (isUnit && k === 'path') { cachePath(rec, e.path); rec.path = 1; continue; }
    rec[k] = cacheField(k, e[k]);
  }
  return rec;
}

function diffEntity(rec, e, isUnit) {
  let patch = null, count = 0;
  for (const k in e) {
    count++;
    const v = e[k];
    if (isUnit && k === 'path') {
      if (!('path' in rec)) {
        rec.__n++; rec.path = 1; cachePath(rec, v);
        (patch ||= { id: e.id }).path = v && v.length > PATH_SENT ? v.slice(0, PATH_SENT) : v;
        if (v && v.length > PATH_SENT) patch[PATH_LEN] = v.length;
      } else if (pathChanged(rec, v)) {
        cachePath(rec, v);
        (patch ||= { id: e.id }).path = v && v.length > PATH_SENT ? v.slice(0, PATH_SENT) : v;
        if (v && v.length > PATH_SENT) patch[PATH_LEN] = v.length;
      }
      continue;
    }
    const had = k in rec, prev = rec[k];
    if (v === null || typeof v !== 'object') {
      if (!had) { rec.__n++; rec[k] = v; (patch ||= { id: e.id })[k] = v; }
      else if (prev !== v && !(v !== v && prev !== prev)) { rec[k] = v; (patch ||= { id: e.id })[k] = v; }
      continue;
    }
    if (k === 'drift' && Array.isArray(v) && v.length === 3) {
      if (had && prev && prev.__d && prev.a === v[0] && prev.b === v[1] && prev.c === v[2]) continue;
      if (!had) rec.__n++;
      if (prev && prev.__d) { prev.a = v[0]; prev.b = v[1]; prev.c = v[2]; } else rec[k] = { __d: 1, a: v[0], b: v[1], c: v[2] };
      (patch ||= { id: e.id })[k] = v;
      continue;
    }
    if (k === 'cargo' && !Array.isArray(v)) {
      if (had && prev && prev.__c && prev.r === v.resource && prev.a === v.amount) continue;
      if (!had) rec.__n++;
      if (prev && prev.__c) { prev.r = v.resource; prev.a = v.amount; } else rec[k] = { __c: 1, r: v.resource, a: v.amount };
      (patch ||= { id: e.id })[k] = v;
      continue;
    }
    if (k === 'order' && isFlatObj(v)) {
      if (had && prev && prev.__f && sameFlatObj(prev.__f, v)) continue;
      if (!had) rec.__n++;
      rec[k] = { __f: copyFlatObj(v) };
      (patch ||= { id: e.id })[k] = v;
      continue;
    }
    const s = JSON.stringify(v);
    if (had && prev && prev.__j === s) continue;
    if (!had) rec.__n++;
    if (prev && '__j' in prev) prev.__j = s; else rec[k] = { __j: s };
    (patch ||= { id: e.id })[k] = v;
  }
  if (count !== rec.__n) {
    let del = null;
    for (const k in rec) {
      if (k === '__n' || k === '__pl' || k === '__p0x' || k === '__p0y' || k === '__p1x' || k === '__p1y') continue;
      if (!(k in e)) {
        delete rec[k]; rec.__n--;
        if (isUnit && k === 'path') rec.__pl = -3;
        (del ||= []).push(k);
      }
    }
    if (del) (patch ||= { id: e.id }).$d = del;
  }
  return patch;
}

function diffList(list, cache, prevOrder, isUnit) {
  const add = [], patch = [];
  let orderChanged = !prevOrder || prevOrder.length !== list.length;
  if (!orderChanged) {
    for (let i = 0; i < list.length; i++) if (prevOrder[i] !== list[i].id) { orderChanged = true; break; }
  }
  const seen = orderChanged ? new Set() : null;
  for (let i = 0; i < list.length; i++) {
    const e = list[i], id = e.id;
    if (seen) seen.add(id);
    const rec = cache.get(id);
    if (!rec) {
      add.push(slimEntity(e, isUnit));
      cache.set(id, rememberEntity(e, isUnit));
    } else {
      const p = diffEntity(rec, e, isUnit);
      if (p) patch.push(p);
    }
  }
  let order = null;
  if (orderChanged) {
    order = new Array(list.length);
    for (let i = 0; i < list.length; i++) order[i] = list[i].id;
    for (const id of [...cache.keys()]) if (!seen.has(id)) cache.delete(id);
  }
  return { delta: { add, patch, order }, nextOrder: orderChanged ? order.slice() : prevOrder };
}

export function createFrameSource() {
  return {
    units: new Map(), unitOrder: null,
    buildings: new Map(), buildingOrder: null,
    nodes: new Map(), order: null,
    fogRev: -1, grid: null, seaGrid: null, gates: null, navRev: 0, worldSent: false,
  };
}

/* Builds one frame from the live simulation. `src` is the per-game cache from createFrameSource(). The frame references live
   simulation objects: post it (structured clone copies synchronously) before the next step. */
export function buildFrame(sim, src, step) {
  const s = sim.s, state = {};
  for (const k in s) if (k !== 'world' && k !== 'nodes' && k !== 'units' && k !== 'buildings') state[k] = s[k];
  const uDiff = diffList(s.units, src.units, src.unitOrder, true);
  src.unitOrder = uDiff.nextOrder;
  const bDiff = diffList(s.buildings, src.buildings, src.buildingOrder, false);
  src.buildingOrder = bDiff.nextOrder;
  // nodes: changed objects plus the id order when the list changed
  const list = s.nodes, changed = [];
  let orderChanged = !src.order || src.order.length !== list.length;
  if (!orderChanged) for (let i = 0; i < list.length; i++) if (src.order[i] !== list[i].id) { orderChanged = true; break; }
  const seen = orderChanged ? new Set() : null;
  for (let i = 0; i < list.length; i++) {
    const n = list[i];
    if (seen) seen.add(n.id);
    if (nodeChanged(src.nodes.get(n.id), n)) { changed.push(n); src.nodes.set(n.id, rememberNode(n)); }
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
  const frame = {
    t: 'frame', v: FRAME_VERSION, step, time: s.time, state,
    units: uDiff.delta, buildings: bDiff.delta, nodes: { changed, order },
    fog, events, navRev: src.navRev,
  };
  if (!src.worldSent) { frame.world = s.world; src.worldSent = true; }
  return frame;
}

/* ---------- page side ---------- */

/* Restores the path lengths of units whose path was shortened for the wire (holes after the first waypoints). */
export function restorePaths(units) {
  for (let i = 0; i < units.length; i++) { const u = units[i], n = u[PATH_LEN]; if (n !== undefined) { u.path.length = n; delete u[PATH_LEN]; } }
}

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

function applyEntityDelta(map, prevOrder, delta, isUnit) {
  for (let i = 0; i < delta.add.length; i++) {
    const e = delta.add[i];
    if (isUnit && e[PATH_LEN] !== undefined) { e.path.length = e[PATH_LEN]; delete e[PATH_LEN]; }
    map.set(e.id, e);
  }
  for (let i = 0; i < delta.patch.length; i++) {
    const p = delta.patch[i], base = map.get(p.id);
    if (!base) continue;
    for (const k in p) {
      if (k === '$d' || k === PATH_LEN) continue;
      base[k] = p[k];
    }
    if (isUnit && p[PATH_LEN] !== undefined) base.path.length = p[PATH_LEN];
    if (p.$d) for (let j = 0; j < p.$d.length; j++) delete base[p.$d[j]];
  }
  let order = prevOrder;
  if (delta.order) {
    order = delta.order;
    const keep = new Set(order);
    for (const id of [...map.keys()]) if (!keep.has(id)) map.delete(id);
  }
  const out = new Array(order.length);
  for (let i = 0; i < order.length; i++) out[i] = map.get(order[i]);
  return { list: out, order };
}

function applyNodeDelta(map, prevOrder, delta) {
  for (let i = 0; i < delta.changed.length; i++) {
    const n = delta.changed[i];
    map.set(n.id, n);
  }
  let order = prevOrder;
  if (delta.order) {
    order = delta.order;
    const keep = new Set(order);
    for (const id of [...map.keys()]) if (!keep.has(id)) map.delete(id);
  }
  const out = new Array(order.length);
  for (let i = 0; i < order.length; i++) out[i] = map.get(order[i]);
  return { list: out, order };
}

/* Pristine mirror store on the receiving thread (page or test harness). */
export function createFrameMirror() {
  return { world: null, units: new Map(), unitOrder: [], buildings: new Map(), buildingOrder: [], nodes: new Map(), nodeOrder: [] };
}

/* Applies one worker frame onto `mirror` in place and returns the complete `sim.s` state object (with fresh arrays so
   identity-keyed caches like Sim.byId and expansion.js visibleView notice the update). Callers that mutate entities locally
   (local command prediction) must shallow-clone target.s.units/buildings before mutating so `mirror` stays pristine. */
export function applyFrameState(mirror, frame) {
  if (frame.world) mirror.world = frame.world;
  const st = frame.state;
  st.world = mirror.world;
  if (frame.units) {
    const u = applyEntityDelta(mirror.units, mirror.unitOrder, frame.units, true);
    mirror.unitOrder = u.order; st.units = u.list;
  } else if (st.units) {
    restorePaths(st.units);
  }
  if (frame.buildings) {
    const b = applyEntityDelta(mirror.buildings, mirror.buildingOrder, frame.buildings, false);
    mirror.buildingOrder = b.order; st.buildings = b.list;
  }
  const nd = applyNodeDelta(mirror.nodes, mirror.nodeOrder, frame.nodes);
  mirror.nodeOrder = nd.order; st.nodes = nd.list;
  return st;
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
