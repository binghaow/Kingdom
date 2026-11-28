/* P4 steps 4c-1 / 4c-2: the simulation worker's message handler (runs inside the Web Worker; Node worker_threads in checks).
   Environment-free: it gets the simulation module (K, the same Sim chain the page loads) and a post(message) function.

   Single-player messages (page -> worker):
     {t:'init', difficulty, options, saved, hashes, prewarm, profile}  new or saved game; answers {t:'ready', hash, step}
     {t:'step', n, cmds:[{q, m, a}]}  apply the player commands (in order), then run n steps of 0.05 s; answers one frame
     {t:'save', q, extra}             answers {t:'saved', q, text} (sim.serialize(), the localStorage format)
     {t:'replay', q}                  answers {t:'replay', q, data} (the P1 recording of this game, null for a saved game)
     {t:'checksum', q}                answers {t:'checksum', q, step, hash, parts}
     {t:'eval', q, src}               benchmarks only (the page sends it only with ?perf=1): runs src with (sim, K)
   Lockstep multiplayer messages (4c-2, page -> worker; transport stays on the main thread):
     {t:'lsInit', setup, seat, seats, startAt, period, resumeAt, navRoom, hashes, profile} -> {t:'lsReady', nextTurn, step, hash}
     {t:'lsStep', rows, sealed, limit, budget, wantView, viewTurn, eventAfter, have}       -> {t:'lsFrame', ...}
     {t:'lsLoadSnapshot', q, snap}                                                         -> {t:'lsSnapshotLoaded', q, ...}
     {t:'lsChecksum', q}                                                                   -> {t:'lsChecksum', q, ...}
   Common:
     {t:'profile', on}                opt-in pipeline system profiling (?perf=1)
     {t:'stop'}                       release active single-player or lockstep simulation
   Worker -> page: frames / lsFrame, plus {t:'error', message} when something threw. */

import { checksum } from '../core/hash.js';
import { attachRecorder, prewarm } from '../replay/replay.js';
import { applyCommand } from '../commands/index.js';
import { STEP } from '../core/clock.js';
import { LockstepClient, CATCHUP } from '../net/lockstep.js';
import { buildFrame, createFrameSource, resultOf } from './frames.js';

export function createHost(K, post, { now = () => 0, netCommands = null } = {}) {
  let sim = null, rec = null, src = null, step = 0, hashes = 0, hashList = [], profiling = false, diag = null;
  let ls = null, lsResults = [], lsControls = [], lsSnaps = [];
  const wrapped = [];
  const stats = { steps: 0, tickMs: 0, maxTickMs: 0, frames: 0, frameMs: 0, maxFrameMs: 0 };

  const freshDiag = () => ({ pathCalls: 0, pathFails: 0, pathMs: 0, pathExpanded: 0, gridCalls: 0, gridMs: 0, collision: 0, collisionPairs: 0, collisionTotal: 0, fogCalls: 0, fogMs: 0 });
  const diagSink = {
    path(ms, failed, expanded) { if (!diag) return; diag.pathCalls++; if (failed) diag.pathFails++; diag.pathMs += ms; diag.pathExpanded += expanded || 0; },
    grid(ms) { if (!diag) return; diag.gridCalls++; diag.gridMs += ms; },
    collision(ms, pairs = 0, total = 0) { if (!diag) return; diag.collision += ms; diag.collisionPairs += pairs; diag.collisionTotal += total; },
    fog(ms) { if (!diag) return; diag.fogCalls++; diag.fogMs += ms; },
  };
  function instrumentWorker(on) {
    K.setPerfSink?.(on ? diagSink : null);
    const ctors = [K.Sim, K.NetworkSim].filter(Boolean);
    if (on) {
      if (wrapped.length) return;
      for (const C of ctors) {
        const p = C.prototype;
        for (const [name, run] of [['findPath', function (ms, res) { diagSink.path(ms, !res?.length, this._perfPathExpanded); }], ['getGrid', function (ms) { diagSink.grid(ms); }]]) {
          const orig = p[name]; if (typeof orig !== 'function') continue;
          const own = Object.getOwnPropertyDescriptor(p, name);
          p[name] = function (...args) { const t0 = now(), res = orig.apply(this, args); run.call(this, now() - t0, res); return res; };
          wrapped.push({ p, name, own });
        }
      }
    } else {
      for (const w of wrapped.splice(0).reverse()) if (w.own) Object.defineProperty(w.p, w.name, w.own); else delete w.p[w.name];
    }
  }
  function setProfiling(on) {
    profiling = !!on;
    diag = profiling ? freshDiag() : null;
    K.profileSystems?.(profiling);
    instrumentWorker(profiling);
  }
  function takeProfile() {
    return profiling ? (K.takeSystemProfile?.() || null) : null;
  }
  function takeDiag() {
    if (!profiling || !diag) return null;
    const out = diag; diag = freshDiag(); return out;
  }
  function frame(results, init = false) {
    const t0 = now();
    const f = buildFrame(sim, src, step);
    f.results = results; f.hashes = hashList; hashList = [];
    f.stats = { ...stats }; if (init) f.init = true;
    const sp = takeProfile(); if (sp) f.sysProfile = sp;
    const dg = takeDiag(); if (dg) f.diag = dg;
    post(f);
    const ms = now() - t0; stats.frames++; stats.frameMs += ms; if (ms > stats.maxFrameMs) stats.maxFrameMs = ms;
  }
  function apply(cmds) {
    const results = [];
    for (const c of cmds || []) {
      let r;
      try {
        if (typeof sim[c.m] !== 'function') throw Error('unknown command ' + c.m);
        r = resultOf(applyCommand(sim, c));
      } catch (e) { r = { error: 'worker: ' + String(e && e.message || e) }; }
      results.push([c.q, r]);
    }
    return results;
  }
  const handlers = {
    init(msg) {
      ls = null; lsResults = []; lsControls = []; lsSnaps = [];
      if (msg.profile !== undefined) setProfiling(msg.profile);
      sim = new K.Sim(msg.difficulty, msg.saved || null, msg.options || {});
      rec = msg.saved ? null : attachRecorder(sim, { difficulty: msg.difficulty, options: msg.options || {}, created: msg.created || null, source: 'worker' }, { every: 0 });
      if (msg.prewarm !== false) prewarm(sim);
      src = createFrameSource(); step = 0; hashes = msg.hashes | 0; hashList = [];
      const h = checksum(sim);
      post({ t: 'ready', hash: h.hash, step });
      frame([], true);
    },
    step(msg) {
      if (!sim) throw Error('step before init');
      const results = apply(msg.cmds);
      const n = Math.max(0, msg.n | 0);
      for (let i = 0; i < n; i++) {
        const t0 = now();
        sim.tick(STEP); step++;
        const ms = now() - t0; stats.steps++; stats.tickMs += ms; if (ms > stats.maxTickMs) stats.maxTickMs = ms;
        if (hashes > 0 && step % hashes === 0) hashList.push([step, checksum(sim).hash]);
        if (sim.s.ended) break;
      }
      frame(results);
    },
    save(msg) {
      if (msg.extra && typeof msg.extra === 'object') for (const k of Object.keys(msg.extra)) if (msg.extra[k] !== undefined) sim.s[k] = msg.extra[k];
      post({ t: 'saved', q: msg.q, step, text: sim.serialize() });
    },
    replay(msg) { post({ t: 'replay', q: msg.q, data: rec ? rec.export() : null }); },
    checksum(msg) { const h = checksum(sim); post({ t: 'checksum', q: msg.q, step, hash: h.hash, parts: h.parts }); },
    eval(msg) {
      // eslint-disable-next-line no-new-func
      const value = new Function('sim', 'K', msg.src)(sim, K);
      post({ t: 'eval', q: msg.q, value: value === undefined ? null : JSON.parse(JSON.stringify(value)) });
      src.order = null; src.unitOrder = null; src.buildingOrder = null; // the script may have added entities: resend order lists
    },
    profile(msg) { setProfiling(msg.on); },
    /* ---- 4c-2: lockstep multiplayer simulation in the worker ---- */
    lsInit(msg) {
      sim = null; rec = null; src = null;
      if (!netCommands) throw Error('lockstep command rules not loaded in worker');
      if (msg.profile !== undefined) setProfiling(msg.profile);
      lsResults = []; lsControls = []; lsSnaps = [];
      ls = new LockstepClient({
        K, commands: netCommands, setup: msg.setup, seat: msg.seat, seats: msg.seats,
        startAt: msg.startAt, period: msg.period, now, hashes: msg.hashes !== false,
        resumeAt: msg.resumeAt || null,
        onResult: (result, cmd, _lat, seq) => lsResults.push({ seq, result, cmd, turn: ls ? ls.nextTurn : 0 }),
      });
      ls.navRoom = msg.navRoom || null;
      ls.onControl = (e) => lsControls.push(e);
      ls.onSnapshot = (snap) => lsSnaps.push({ turn: snap.turn, step: snap.step, hash: snap.hash, text: snap.text, aiSeats: snap.aiSeats, live: snap.live });
      const h = checksum(ls.sim);
      post({ t: 'lsReady', nextTurn: ls.nextTurn, step: ls.step, hash: h.hash });
    },
    lsStep(msg) {
      if (!ls) throw Error('lsStep before lsInit');
      if (Array.isArray(msg.rows) && msg.rows.length) ls.receive({ t: msg.rows });
      if (Number.isFinite(msg.sealed) && msg.sealed > ls.sealed) ls.sealed = msg.sealed;
      lsResults = []; lsControls = []; lsSnaps = [];
      const logStart = ls.log.length;
      const t0 = now(), limit = Math.min(msg.limit, ls.sealed), budget = msg.budget ?? 12;
      let n = 0;
      if (!ls.resumeAt && !ls.desync) {
        while (ls.nextTurn <= limit) {
          ls.runTurn(); n++;
          if (now() - t0 > budget) break;
        }
      }
      const simMs = now() - t0;
      const newHashes = ls.hashQueue.splice(0);
      const log = ls.log.slice(logStart);
      const catching = ls.nextTurn < ls.sealed - CATCHUP;
      const prevViewTurn = msg.viewTurn ?? -1;
      let view = null, viewMs = 0, viewTurn = null;
      if (msg.wantView && ((!catching && ls.nextTurn > prevViewTurn) || (catching && prevViewTurn < 0 && ls.nextTurn > 0))) {
        const vt0 = now();
        view = K.networkSnapshot(ls.sim, Math.max(0, ls.team), msg.eventAfter || 0, { slim: true, have: msg.have || {} });
        viewMs = now() - vt0;
        viewTurn = ls.nextTurn;
      }
      const sysProfile = takeProfile();
      const workerDiag = takeDiag();
      post({
        t: 'lsFrame', n, simMs, nextTurn: ls.nextTurn, step: ls.step,
        hashes: newHashes, results: lsResults, controls: lsControls, snaps: lsSnaps, log,
        aiSeats: [...ls.aiSeats], aiTeams: [...ls.aiTeams], rejected: ls.stats.rejected,
        view, viewTurn, viewMs, sysProfile, diag: workerDiag,
      });
    },
    lsLoadSnapshot(msg) {
      if (!ls) throw Error('lsLoadSnapshot before lsInit');
      const r = ls.loadSnapshot(msg.snap);
      post({
        t: 'lsSnapshotLoaded', q: msg.q, ok: r.ok, hash: r.hash,
        nextTurn: ls.nextTurn, step: ls.step, sealed: ls.sealed,
        aiSeats: [...ls.aiSeats], aiTeams: [...ls.aiTeams],
        logFrom: ls.logFrom || 0, snapshotTurn: ls.stats.snapshotTurn ?? null,
      });
    },
    lsChecksum(msg) {
      if (!ls) throw Error('lsChecksum before lsInit');
      const h = checksum(ls.sim);
      post({ t: 'lsChecksum', q: msg.q, turn: ls.nextTurn, step: ls.step, hash: h.hash, parts: h.parts, aiSeats: [...ls.aiSeats], logFrom: ls.logFrom || 0 });
    },
    stop() { setProfiling(false); sim = null; rec = null; src = null; ls = null; lsResults = []; lsControls = []; lsSnaps = []; },
  };
  return {
    stats,
    get sim() { return sim || ls?.sim || null; },
    get lockstep() { return ls; },
    get step() { return sim ? step : ls ? ls.step : 0; },
    handle(msg) {
      try {
        const h = msg && handlers[msg.t];
        if (!h) throw Error('unknown message ' + (msg && msg.t));
        h(msg);
      } catch (e) { post({ t: 'error', q: msg?.q ?? null, message: String(e && e.message || e), stack: String(e && e.stack || '').slice(0, 2000) }); }
    },
  };
}
