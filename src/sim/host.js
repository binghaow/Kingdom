/* P4 step 4c-1: the simulation worker's message handler (runs inside the Web Worker; Node worker_threads in the checks).
   Environment-free: it gets the simulation module (K, the same Sim chain the page loads) and a post(message) function.

   Messages (page -> worker):
     {t:'init', difficulty, options, saved, hashes, prewarm}  new game (saved = null, recorded like a main-thread game) or a
                                                              saved game; answers {t:'ready', hash, frame}
     {t:'step', n, cmds:[{q, m, a}]}  apply the player commands (in order), then run n steps of 0.05 s; answers one frame
     {t:'save', q, extra}             answers {t:'saved', q, text} (sim.serialize(), the localStorage format)
     {t:'replay', q}                  answers {t:'replay', q, data} (the P1 recording of this game, null for a saved game)
     {t:'checksum', q}                answers {t:'checksum', q, step, hash, parts}
     {t:'eval', q, src}               benchmarks only (the page sends it only with ?perf=1): runs src with (sim, K)
   Worker -> page: frames (src/sim/frames.js), plus {t:'error', message} when something threw. */

import { checksum } from '../core/hash.js';
import { attachRecorder, prewarm, decodeArg } from '../replay/replay.js';
import { STEP } from '../core/clock.js';
import { buildFrame, createFrameSource, resultOf } from './frames.js';

export function createHost(K, post, { now = () => 0 } = {}) {
  let sim = null, rec = null, src = null, step = 0, hashes = 0, hashList = [];
  const stats = { steps: 0, tickMs: 0, maxTickMs: 0, frames: 0, frameMs: 0, maxFrameMs: 0 };

  function frame(results, init = false) {
    const t0 = now();
    const f = buildFrame(sim, src, step);
    f.results = results; f.hashes = hashList; hashList = [];
    f.stats = { ...stats }; if (init) f.init = true;
    post(f);
    const ms = now() - t0; stats.frames++; stats.frameMs += ms; if (ms > stats.maxFrameMs) stats.maxFrameMs = ms;
  }
  function apply(cmds) {
    const results = [];
    for (const c of cmds || []) {
      let r;
      try {
        const fn = sim[c.m];
        if (typeof fn !== 'function') throw Error('unknown command ' + c.m);
        r = resultOf(fn.apply(sim, (c.a || []).map((a) => decodeArg(sim, a))));
      } catch (e) { r = { error: 'worker: ' + String(e && e.message || e) }; }
      results.push([c.q, r]);
    }
    return results;
  }
  const handlers = {
    init(msg) {
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
      src.order = null; // the script may have added entities: resend every node
    },
    stop() { sim = null; rec = null; src = null; },
  };
  return {
    stats,
    get sim() { return sim; },
    get step() { return step; },
    handle(msg) {
      try {
        const h = msg && handlers[msg.t];
        if (!h) throw Error('unknown message ' + (msg && msg.t));
        h(msg);
      } catch (e) { post({ t: 'error', q: msg?.q ?? null, message: String(e && e.message || e), stack: String(e && e.stack || '').slice(0, 2000) }); }
    },
  };
}
