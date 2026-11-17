/* Replays (P1): "initial setup + per-step player command list".

   Recording: attachRecorder(sim, setup) wraps the player-facing methods of ONE simulation instance (order, construct,
   train, research incl. age-up, rally, ships, hero skills, rewards, chat cheats, ...). A call is recorded only when it
   comes from outside the simulation: not during tick() and not nested inside another captured call. Computer players
   act inside tick() and are therefore never recorded; they are reproduced by the same seed (verified by
   check-replay.cjs and the browser pre-flight, which compare checksums of a live game against a headless replay).

   Arguments are stored as JSON; any object that is a live unit/building/node of this simulation is written as
   {"$e":id} and resolved again with sim.byId(id) on replay.

   Replay: runReplay(K, replay) builds `new K.Sim(difficulty, null, options)`, prewarms navigation like the game
   (expansion.js warmNavigation), then for every step applies that step's commands and ticks 0.05 s. It works in
   Node (K = require('public/network-model.js')) and in the browser (K = window.KingdomSim). */

import { checksum } from '../core/hash.js';

export const FORMAT = 'kingdom-replay', VERSION = 1, STEP = 0.05, DEFAULT_EVERY = 20;
export const CAPTURED = ['order', 'construct', 'constructLine', 'train', 'research', 'setRally', 'board', 'unload', 'assignFish',
  'skill', 'castSpell', 'route', 'claimReward', 'setDifficulty', 'sendChat', 'pact', 'add',
  'offerAlliance', 'acceptAlliance', 'rejectAlliance', 'declareWar'];

const isEntity = (sim, v) => typeof v.id === 'number' && typeof sim.byId === 'function' && sim.byId(v.id) === v;

export function encodeArg(sim, v, depth = 0) {
  if (v === undefined) return { $u: 1 };
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : { $n: String(v) };
  if (typeof v === 'function') return { $u: 1 };
  if (depth > 6) throw Error('replay: argument nested too deeply');
  if (Array.isArray(v)) return v.map((x) => encodeArg(sim, x, depth + 1));
  if (typeof v === 'object') {
    if (isEntity(sim, v)) return { $e: v.id };
    const out = {};
    for (const k of Object.keys(v)) { if (typeof v[k] !== 'function') out[k] = encodeArg(sim, v[k], depth + 1); }
    return out;
  }
  return null;
}
export function decodeArg(sim, v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => decodeArg(sim, x));
  if ('$u' in v) return undefined;
  if ('$n' in v) return Number(v.$n);
  if ('$e' in v) return sim.byId(v.$e) ?? { id: v.$e, missing: true };
  const out = {};
  for (const k of Object.keys(v)) out[k] = decodeArg(sim, v[k]);
  return out;
}
const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const resultOf = (r) => (typeof r === 'string' || typeof r === 'boolean' || typeof r === 'number' || r === null || r === undefined ? r ?? null : r && typeof r.id === 'number' ? { $e: r.id } : '[object]');

/* Same calls as expansion.js warmNavigation(): grids are caches of static terrain, but prewarming keeps the replay on
   exactly the game's call sequence. */
export function prewarm(sim) {
  if (typeof sim.getGrid !== 'function') return;
  const s = sim.s, land = s.units.find((u) => !sim.sea?.(u) && !sim.air?.(u)), ship = s.units.find((u) => sim.sea?.(u));
  if (land) sim.getGrid(land); else sim.getGrid();
  if (ship) sim.getGrid(ship);
}

export function attachRecorder(sim, setup, { every = DEFAULT_EVERY, onCommand = null } = {}) {
  const rec = {
    format: FORMAT, version: VERSION, step: STEP, every,
    setup: { difficulty: setup.difficulty, options: clone(setup.options) ?? {}, prewarm: setup.prewarm !== false },
    meta: { created: setup.created || null, source: setup.source || 'game', notes: [] },
    steps: 0, commands: [], checksums: [],
  };
  let depth = 0, step = 0;
  const own = (name) => Object.prototype.hasOwnProperty.call(sim, name);
  // Always resolve through the prototype at call time, so later prototype instrumentation (?perf=1 audit) still applies.
  const call = (name, self, args) => Object.getPrototypeOf(sim)[name].apply(self, args);
  for (const name of CAPTURED) {
    if (typeof sim[name] !== 'function') continue;
    const wrapped = function (...args) {
      if (depth > 0 || this !== sim) return call(name, this, args);
      let entry = null;
      try { entry = { s: step, m: name, a: args.map((a) => encodeArg(sim, a)) }; } catch (e) { rec.meta.notes.push(`step ${step}: ${name} not recordable (${e.message})`); rec.meta.unrecordable = true; }
      depth++;
      let r;
      try { r = call(name, this, args); } finally { depth--; }
      if (entry) { entry.r = resultOf(r); rec.commands.push(entry); if (onCommand) onCommand(entry); }
      return r;
    };
    sim[name] = wrapped;
  }
  const tick = function (dt) {
    if (this !== sim) return Object.getPrototypeOf(sim).tick.call(this, dt);
    depth++;
    let r;
    try { r = Object.getPrototypeOf(sim).tick.call(sim, dt); } finally { depth--; }
    if (dt !== STEP) rec.commands.push({ s: step, dt });
    step++; rec.steps = step;
    if (every > 0 && step % every === 0) rec.checksums.push({ step, hash: checksum(sim).hash });
    return r;
  };
  sim.tick = tick;
  const api = {
    sim, data: rec,
    get step() { return step; },
    detach() { for (const name of [...CAPTURED, 'tick']) if (own(name)) delete sim[name]; },
    /* A complete, self-contained replay object (deep copy). */
    export() {
      const out = clone(rec);
      if (sim.s?.tutorial) { out.meta.unrecordable = true; out.meta.notes.push('tutorial scripts edit state directly; not replayable'); }
      out.final = { step, ...checksum(sim) };
      return out;
    },
  };
  return api;
}

/* Run a replay headlessly. Returns { checksums:[{step,hash}], final, results:{mismatch:[...]}, steps }.
   options.steps: stop early / run longer than recorded; options.every overrides the checksum interval;
   options.onStep(sim, step) is called after every tick (benchmarks, debugging). */
export function runReplay(K, replay, { steps, every, onStep, Sim } = {}) {
  if (!replay || replay.format !== FORMAT) throw Error('not a kingdom replay');
  if (replay.version > VERSION) throw Error(`replay version ${replay.version} is newer than this player (${VERSION})`);
  const Ctor = Sim || K.Sim, total = steps ?? replay.steps, interval = every ?? replay.every ?? DEFAULT_EVERY;
  const sim = new Ctor(replay.setup.difficulty, null, clone(replay.setup.options) || {});
  if (replay.setup.prewarm !== false) prewarm(sim);
  const byStep = new Map();
  for (const c of replay.commands) { if (!byStep.has(c.s)) byStep.set(c.s, []); byStep.get(c.s).push(c); }
  const checksums = [], mismatch = [];
  let dtNext = null;
  for (let step = 0; step < total; step++) {
    for (const c of byStep.get(step) || []) {
      if (c.dt !== undefined) { dtNext = c.dt; continue; }
      const fn = sim[c.m];
      if (typeof fn !== 'function') { mismatch.push({ step, m: c.m, why: 'method missing' }); continue; }
      const r = resultOf(fn.apply(sim, c.a.map((a) => decodeArg(sim, a))));
      if (c.r !== undefined && JSON.stringify(r) !== JSON.stringify(c.r)) mismatch.push({ step, m: c.m, expected: c.r, got: r });
    }
    sim.tick(dtNext ?? STEP); dtNext = null;
    if (interval > 0 && (step + 1) % interval === 0) checksums.push({ step: step + 1, hash: checksum(sim).hash });
    if (onStep) onStep(sim, step + 1);
  }
  return { steps: total, checksums, final: { step: total, ...checksum(sim) }, results: { mismatch }, sim };
}

/* Compare two checksum lists; returns null when equal, else the first difference. */
export function firstDifference(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i]?.step !== b[i]?.step || a[i]?.hash !== b[i]?.hash) return { index: i, a: a[i] || null, b: b[i] || null };
  return null;
}
