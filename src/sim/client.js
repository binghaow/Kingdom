/* P4 step 4c-1: single-player simulation in a Web Worker (opt-in: ?simWorker=1). Page side.

   adopt(sim, setup) turns the game's own main-thread Sim instance into a PROXY:
   - the worker builds the same game from the same setup (new K.Sim(difficulty, saved, options) is deterministic) and
     confirms with the initial checksum; on any mismatch or worker error the instance simply becomes a normal main-thread
     simulation again (fallback, the game goes on);
   - every frame the worker sends (src/sim/frames.js) replaces sim.s, so all existing UI / render code keeps reading
     sim.state, sim.byId, sim.canSee, sim.stat ... unchanged;
   - the player entry points (the replay recorder's CAPTURED list: order, construct, train, research, setRally, sendChat ...)
     are forwarded to the worker as {m, a} commands. They also run locally on the current frame ("prediction") so the
     caller gets its usual synchronous return value (toast text, {building}, {error}) and the HUD reacts at once; the next
     frame from the worker replaces that local state. Nested calls inside a command are never forwarded twice.
   - fx() calls from the UI (click markers, upgrade flashes) stay local and survive incoming frames until they expire.
   - the page decides WHEN steps run (expansion.js frame loop + src/core/clock.js), the worker runs them: at most one
     request is in flight, steps that come due meanwhile are owed and sent with the next request (capped at MAX_STEPS, so
     a slow worker makes the game slower, never a growing queue).
   - rendering interpolates between the drawn position at the moment a frame is applied and the new frame (alpha grows
     over the frame's game time), so units glide at 60 fps although frames arrive at 20 per second.

   Online play uses the separate worker-lockstep proxy; this controller owns single-player only. */

import { CAPTURED } from '../replay/replay.js';
import { checksum } from '../core/hash.js';
import { STEP, MAX_STEPS } from '../core/clock.js';
import { createFrameMirror, applyFrameState, encodeForWorker, decodeLocal, resultOf } from './frames.js';

const UI_KEYS = ['controlGroups']; // written into the state by the page only (tactics-ui.js); carried across frames and into saves
const NOOP_ON_PROXY = ['updateFog']; // the fog comes from the worker

export function createSimWorker(root, { url = 'sim-worker.js', debug = false, getK, onAdopt, onFallback } = {}) {
  const perf = root.performance;
  let worker = null, sim = null, ready = false, busy = false, owed = 0, seq = 0, queue = [], pendingFrames = [], scheduled = false;
  let initHash = null, appliedAt = 0, span = STEP * 1000, frameStep = 0, navRev = 0, localFx = [], lastPump = 0, depth = 0, failed = null, profiling = false, sysProf = null, mirror = null, detached = false;
  let prev = new Map();
  const waiting = new Map(), predicted = new Map();
  const stats = { frames: 0, applyMs: 0, maxApplyMs: 0, postMs: 0, requests: 0, owedDropped: 0, commands: 0, mismatches: [], worker: null, error: null, fallback: null };

  function post(msg) { const t0 = perf.now(); worker.postMessage(msg); stats.postMs += perf.now() - t0; }
  function flush() {
    scheduled = false;
    if (!worker || !ready || busy) return;
    if (!owed && !queue.length) return;
    const n = owed, cmds = queue; owed = 0; queue = [];
    busy = true; stats.requests++;
    post({ t: 'step', n, cmds });
  }
  function schedule() { if (!scheduled) { scheduled = true; Promise.resolve().then(flush); } }
  function ask(type, extra = {}) {
    if (!worker || !ready) return Promise.reject(Error('simulation worker not ready'));
    const q = ++seq;
    return new Promise((resolve, reject) => { waiting.set(q, { resolve, reject }); post({ t: type, q, ...extra }); });
  }

  /* Detach entity graphs from the pristine mirror lazily, only before local command prediction. */
  function detachForPrediction(target) {
    if (detached || !target?.s) return;
    detached = true;
    const s = target.s;
    // Commands also mutate nested fields (e.g. hero.spellCooldowns). A shallow clone would poison unchanged deltas.
    const copies = new WeakMap();
    const copy = (v) => {
      if (!v || typeof v !== 'object') return v;
      if (copies.has(v)) return copies.get(v);
      if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) return v;
      const out = Array.isArray(v) ? new Array(v.length) : {};
      copies.set(v, out);
      for (const k of Object.keys(v)) out[k] = copy(v[k]);
      return out;
    };
    if (Array.isArray(s.units)) s.units = copy(s.units);
    if (Array.isArray(s.buildings)) s.buildings = copy(s.buildings);
    target._idIndex = null;
  }

  function install(target) {
    const proto = Object.getPrototypeOf(target);
    for (const name of CAPTURED) {
      if (typeof target[name] !== 'function') continue;
      target[name] = function (...args) {
        if (this !== target || depth > 0 || target !== sim) return proto[name].apply(this, args);
        let enc;
        try { enc = args.map((a) => encodeForWorker(a)); } catch (e) { return proto[name].apply(this, args); }
        const q = ++seq; queue.push({ q, m: name, a: enc }); stats.commands++;
        detachForPrediction(target);
        let r;
        depth++;
        try { r = proto[name].apply(target, decodeLocal(target, enc, args)); } catch (e) { r = ''; } finally { depth--; }
        if (predicted.size > 200) predicted.clear();
        predicted.set(q, { m: name, r: resultOf(r) });
        schedule();
        return r;
      };
    }
    target.fx = function (...args) {
      const r = proto.fx.apply(this, args);
      if (this === target && depth === 0 && target === sim) { const f = target.s.effects[target.s.effects.length - 1]; if (f) localFx.push(f); }
      return r;
    };
    for (const name of NOOP_ON_PROXY) target[name] = function () {};
    target.tick = function () {}; // the worker steps the game; expansion.js never calls this while the worker owns the game
  }
  function uninstall(target) {
    for (const name of [...CAPTURED, 'fx', 'tick', ...NOOP_ON_PROXY]) if (Object.prototype.hasOwnProperty.call(target, name)) delete target[name];
  }

  /* Back to a plain main-thread simulation, from the latest frame (worker error, init mismatch, or release()). */
  function fallback(reason) {
    const target = sim;
    stats.fallback = reason; failed = reason;
    stop();
    if (!target) return;
    for (const f of pendingFrames) applyFrame(target, f);
    pendingFrames = [];
    uninstall(target);
    // per-instance caches belong to the worker's copy: start them fresh on the main thread
    target.grid = null; target.seaGrid = null; target._gateGrids = null; target._gridPrev = null; target._idIndex = null;
    target.pathFailures = new Map(); target.pathGoals = new Map(); target.autoTargets = new WeakMap(); target.autoTargetRoster = []; target.autoTargetRosterAt = -1;
    target.events = target.events || [];
    if (reason) onFallback?.(reason, target);
  }
  function stop() {
    if (worker) { try { worker.terminate(); } catch { /* gone */ } }
    worker = null; sim = null; ready = false; busy = false; owed = 0; queue = []; scheduled = false;
    for (const w of waiting.values()) w.reject(Error('simulation worker stopped'));
    waiting.clear();
  }

  function applyFrame(target, f) {
    const old = target.s;
    const st = applyFrameState(mirror || (mirror = createFrameMirror()), f);
    detached = false;
    if (!st.world && old.world) { st.world = old.world; mirror.world = old.world; }
    for (const k of UI_KEYS) if (st[k] === undefined && old[k] !== undefined) st[k] = old[k];
    target.s = st;
    if (f.fog) {
      if (f.fog.off) target.fog = null;
      else {
        const memory = f.fog.visible.map((_, t) => (t === 0 ? f.fog.memory0 : {}));
        target.fog = { cols: f.fog.cols, rows: f.fog.rows, revision: f.fog.revision, visible: f.fog.visible, explored: f.fog.explored, memory };
      }
    }
    if (f.events?.length) (target.events ||= []).push(...f.events);
    if (f.navRev !== navRev) { navRev = f.navRev; target.grid = null; target.seaGrid = null; target._gateGrids = null; target._gridPrev = null; }
    for (const [q, r] of f.results || []) {
      const p = predicted.get(q); predicted.delete(q);
      if (p && JSON.stringify(p.r) !== JSON.stringify(r) && stats.mismatches.length < 20) stats.mismatches.push({ m: p.m, local: p.r, worker: r, step: f.step });
    }
    if (f.hashes?.length) (stats.hashes ||= []).push(...f.hashes);
    if (f.sysProfile) {
      sysProf ||= {};
      for (const k of Object.keys(f.sysProfile)) {
        const v = f.sysProfile[k], e = sysProf[k] || (sysProf[k] = { ms: 0, n: 0, max: 0 });
        e.ms += v.ms; e.n += v.n; if (v.max > e.max) e.max = v.max;
      }
    }
    if (f.diag) root.PerformanceAudit?.mergeWorkerDiag?.(f.diag);
    stats.worker = f.stats;
  }

  function onMessage(e) {
    const msg = e.data;
    if (!msg || !sim) return;
    if (msg.t === 'frame') { pendingFrames.push(msg); if (!msg.init) busy = false; flush(); return; }
    if (msg.t === 'ready') {
      ready = true; stats.readyAt = perf.now();
      if (initHash && msg.hash !== initHash) { fallback(`initial checksum differs (page ${initHash}, worker ${msg.hash})`); return; }
      flush(); return;
    }
    if (msg.t === 'error') {
      const w = msg.q != null && waiting.get(msg.q);
      if (w) { waiting.delete(msg.q); w.reject(Error(msg.message)); return; }
      stats.error = msg.message; fallback('worker error: ' + msg.message); return;
    }
    const w = waiting.get(msg.q);
    if (w) { waiting.delete(msg.q); w.resolve(msg); }
  }

  const api = {
    enabled: true,
    stats,
    get failed() { return failed; },
    get ready() { return ready; },
    owns(s) { return !!sim && s === sim; },
    /* setup: {difficulty, options} for a new game, or {difficulty, saved} (the saved state, untouched by a constructor). */
    adopt(target, setup) {
      api.release();
      const K = getK?.() || root.KingdomSim;
      try {
        worker = new root.Worker(url);
      } catch (e) { failed = 'worker unavailable: ' + (e && e.message || e); onFallback?.(failed, target); return target; }
      sim = target; ready = false; busy = false; owed = 0; queue = []; pendingFrames = []; localFx = []; prev = new Map(); failed = null; mirror = createFrameMirror();
      appliedAt = perf.now(); span = STEP * 1000; frameStep = 0; navRev = -1; predicted.clear(); stats.hashes = [];
      worker.onmessage = onMessage;
      worker.onerror = (ev) => { ev?.preventDefault?.(); fallback('worker failed: ' + (ev?.message || 'script error')); };
      initHash = checksum(target).hash;
      onAdopt?.(target);
      install(target);
      target.events = target.events || [];
      K.activateWorld?.(target.s.world);
      post({ t: 'init', difficulty: setup.difficulty, options: setup.options || {}, saved: setup.saved || null, created: new Date().toISOString(), hashes: setup.hashes | 0, prewarm: true, profile: profiling || !!root.PerformanceAudit });
      return target;
    },
    /* Stop the worker and keep the game on the main thread from its latest frame (switching to online, tutorial, new war). */
    release() { if (sim) fallback(null); else stop(); },
    /* n more steps are due (expansion.js frame loop). */
    request(n) {
      if (!sim) return;
      if (n > 0) { owed += n; if (owed > MAX_STEPS) { stats.owedDropped += owed - MAX_STEPS; owed = MAX_STEPS; } }
      flush();
    },
    /* Apply what arrived since the last display frame. capture(sim) = KingdomArt.captureMotion (interpolation origin). */
    pump(now, capture) {
      if (!sim) return;
      const dt = lastPump ? Math.min(0.25, (now - lastPump) / 1000) : 0; lastPump = now;
      if (localFx.length) { for (const f of localFx) f.life -= dt; localFx = localFx.filter((f) => f.life > 0); }
      if (!pendingFrames.length) return;
      const t0 = perf.now(), target = sim;
      // Interpolation origin = where each unit is drawn right now, so a new frame never makes a unit jump back.
      // Temporarily adjust u.x/u.y for capture(target), then restore so pristine mirror objects stay untouched.
      const a = api.alpha(now), units = target.s.units, saved = [];
      for (let i = 0; i < units.length; i++) {
        const u = units[i], p = prev.get(u.id);
        if (p && p.kind === u.kind && Math.abs(u.x - p.x) + Math.abs(u.y - p.y) < 220) {
          saved.push(u, u.x, u.y);
          u.x = p.x + (u.x - p.x) * a; u.y = p.y + (u.y - p.y) * a;
        }
      }
      try {
        capture?.(target);
        prev = new Map(units.map((u) => [u.id, { x: u.x, y: u.y, kind: u.kind }]));
      } finally {
        for (let i = 0; i < saved.length; i += 3) { saved[i].x = saved[i + 1]; saved[i].y = saved[i + 2]; }
      }
      const first = frameStep;
      for (const f of pendingFrames) applyFrame(target, f);
      const last = pendingFrames[pendingFrames.length - 1];
      pendingFrames = [];
      frameStep = last.step;
      const kept = localFx.filter((f) => !target.s.effects.includes(f));
      if (kept.length) target.s.effects.push(...kept);
      span = Math.max(1, frameStep - first) * STEP * 1000; appliedAt = now;
      const ms = perf.now() - t0; stats.frames++; stats.applyMs += ms; if (ms > stats.maxApplyMs) stats.maxApplyMs = ms;
    },
    alpha(now) { return Math.min(1, Math.max(0, (now - appliedAt) / span)); },
    /* Saves come from the worker (its serialize(), the same text a main-thread game writes). */
    save(write) {
      if (!sim || !ready) return false;
      const extra = {}; for (const k of UI_KEYS) if (sim.s[k] !== undefined) extra[k] = sim.s[k];
      ask('save', { extra }).then((m) => write(m.text)).catch(() => {});
      return true;
    },
    replay() { return ask('replay').then((m) => m.data); },
    checksum() { return ask('checksum'); },
    /* Benchmarks only (?perf=1): run a script against the worker's simulation. */
    eval(src) { if (!debug) return Promise.reject(Error('eval needs ?perf=1')); return ask('eval', { src: String(src) }).then((m) => m.value); },
    setProfile(on) { profiling = !!on; if (!profiling) sysProf = null; if (worker && ready) post({ t: 'profile', on: profiling }); },
    takeSystemProfile() { const p = sysProf; sysProf = null; return p; },
  };
  return api;
}
