/* Browser entry of the new ES-module code (P1). Bundled by scripts/build-core.cjs (esbuild) into public/kingdom-core.js,
   which index.html loads with ONE <script> right after the simulation scripts (network-model.js / network-client.js) and
   before the UI scripts (expansion.js creates the first simulation).

   Bridge rule (redesign-plan.md section 3): old global scripts and new modules talk only through
     window.KingdomSim   (old -> new: the simulation classes, read here)
     window.KingdomCore  (new -> old: everything exported below)
   New code never reaches into other globals, and old scripts never import from src/. */

import { checksum, fnvString } from './core/hash.js';
import * as replay from './replay/replay.js';
import { startBrowserLockstep, startReplayViewer } from './net/browser.js';
import { replayLockstep } from './net/lockstep.js';
import * as saves from './net/saves.js';
import * as clock from './core/clock.js';
import { createSimWorker } from './sim/client.js';
import * as controls from './ui/controls.js';

const root = typeof window !== 'undefined' ? window : globalThis;
const query = (() => { try { return new URLSearchParams(root.location?.search || ''); } catch { return new URLSearchParams(''); } })();

const core = {
  version: 1,
  hash: { checksum, fnvString },
  replay: { ...replay, current: null, recorders: 0, export: null, download: null, run: null },
};

/* Record every new single-player game. new K.Sim(difficulty, null, options) is the only way expansion.js starts one;
   saved games (saved !== null) cannot be replayed from a setup and are not recorded. Multiplayer replicas are
   NetworkSim instances (network-client.js), never K.Sim, so online play is untouched. */
function install(K) {
  if (!K || !K.Sim || K.Sim.__kingdomCoreRecorded) return false;
  const Base = K.Sim;
  class RecordedSim extends Base {
    constructor(difficulty, saved = null, options = {}, ...rest) {
      super(difficulty, saved, options, ...rest);
      if (saved || core.replay.disabled) return;
      try {
        // Commands are always captured (one cheap check per call, enables bug reproduction). Checksums every 20 steps hash every
        // entity, so in normal play they are off (AGENTS.md: diagnostics opt-in); ?replay=1 turns them on.
        core.replay.current = replay.attachRecorder(this, { difficulty, options, created: new Date().toISOString(), source: 'game' }, { every: query.has('replay') ? replay.DEFAULT_EVERY : 0 });
        core.replay.recorders++;
      } catch (e) { core.replay.error = String(e && e.message || e); }
    }
  }
  Object.defineProperty(RecordedSim, 'name', { value: Base.name });
  RecordedSim.__kingdomCoreRecorded = true;
  RecordedSim.Base = Base;
  K.Sim = RecordedSim;
  return true;
}

core.replay.export = () => core.replay.current?.export() || null;
core.replay.download = (name) => {
  const data = core.replay.export();
  if (!data || typeof document === 'undefined') return data;
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name || `kingdom-replay-${data.final.step}-${data.final.hash}.json`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return data;
};
/* Headless replay inside the page with the page's own simulation code (cross-browser determinism pre-flight).
   Uses the un-recorded base class so the replay does not replace the live recording. */
core.replay.run = (data, opts = {}) => {
  const K = root.KingdomSim, r = replay.runReplay(K, data, { ...opts, Sim: K.Sim.Base || K.Sim });
  return { steps: r.steps, checksums: r.checksums, final: r.final, results: r.results };
};

/* Debug entry, opt-in only: ?replay=1 shows two small buttons. Normal players see nothing.
   - export: downloads the current game's replay JSON (setup + commands + checksums every 20 steps);
   - verify: pick a replay JSON (e.g. a fixture from scripts/replay/fixtures, or a game exported on another device), replay it
     headlessly with THIS browser's engine and show the final checksum next to the recorded one (Safari / iPhone check). */
function debugButton() {
  if (!query.has('replay') || typeof document === 'undefined') return;
  const style = (b, left) => { b.type = 'button'; b.style.cssText = `position:fixed;left:${left}px;bottom:8px;z-index:9999;font:12px system-ui;padding:6px 10px;border-radius:6px;border:1px solid #c9a65a;background:#1d1a14;color:#f3e3b5;opacity:.85`; };
  const add = () => {
    if (document.getElementById('kingdom-replay-export')) return;
    const b = document.createElement('button'); b.id = 'kingdom-replay-export'; b.textContent = '导出录像 / Export replay'; style(b, 8);
    b.onclick = () => { const d = core.replay.download(); b.textContent = d ? `已导出 ${d.final.step} 步 · ${d.final.hash}` : '尚无对局'; };
    const v = document.createElement('button'); v.id = 'kingdom-replay-verify'; v.textContent = '验证录像 / Verify'; style(v, 190);
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/json,.json'; input.hidden = true;
    v.onclick = () => input.click();
    input.onchange = async () => {
      const f = input.files && input.files[0]; if (!f) return;
      v.textContent = '回放中…';
      try {
        const data = JSON.parse(await f.text()), t = Date.now(), r = core.replay.run(data), d = replay.compareWithRecording(r, data);
        const ok = !d && (!data.final || data.final.hash === r.final.hash);
        v.textContent = `${ok ? '一致 SAME' : '不一致 DIFF' + (d ? ' @' + d.step : '')} · ${r.final.hash} / ${data.final?.hash ?? '—'} · ${Date.now() - t} ms`;
        core.replay.lastVerify = { ok, final: r.final.hash, recorded: data.final?.hash ?? null, firstDifference: d, checksums: r.checksums };
      } catch (e) { v.textContent = '失败：' + (e && e.message || e); }
      input.value = '';
    };
    document.body.append(b, v, input);
  };
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
}

/* P3 lockstep (beta, opt-in from the lobby): network-ui.js calls start() when a lockstep room begins. */
core.lockstep = {
  current: null,
  start(opts) { core.lockstep.current?.stop(); return (core.lockstep.current = startBrowserLockstep(root, opts)); },
  replay: (rec) => replayLockstep(root.KingdomSim, root.KingdomNetCommands, rec),
  // 3c: online saves (room parameters + recording) and local replay viewing.
  saves,
  watch(opts) { core.lockstep.current?.stop(); return (core.lockstep.current = startReplayViewer(root, opts)); },
};

core.installed = install(root.KingdomSim);

/* P4: fixed-step constants for expansion.js (src/core/clock.js). */
core.clock = { STEP: clock.STEP, MAX_DT: clock.MAX_DT, MAX_STEPS: clock.MAX_STEPS, FixedStep: clock.FixedStep };
/* P4 step 4c-1: ?simWorker=1 runs a single-player game's simulation in a Web Worker (public/sim-worker.js). Off by default:
   core.simWorker stays null and expansion.js takes exactly the main-thread path. */
/* Also on when the player typed “多线程” in chat (stored preference; ?simWorker=0/1 overrides). */
const simWorkerWanted = (() => { const q = query.get('simWorker'); if (q === '0' || q === '1') return q === '1'; try { return root.localStorage?.getItem('kingdom-sim-worker') === '1'; } catch { return false; } })();
core.simWorker = simWorkerWanted && typeof root.Worker === 'function' ? createSimWorker(root, {
  url: 'sim-worker.js', debug: query.has('perf'),
  getK: () => root.KingdomSim,
  // the worker records the game (its own replay recorder); the page's recorder on this instance would only see predictions
  onAdopt: (sim) => { const r = core.replay.current; if (r && r.sim === sim) { r.detach(); core.replay.current = null; } },
  onFallback: (reason) => { core.simWorker.lastFallback = reason; try { root.console?.warn?.('simWorker fallback to main thread:', reason); } catch { /* ignore */ } },
}) : null;
/* Desktop mouse rules and building groups (src/ui/controls.js): pure helpers for expansion.js. */
core.controls = controls;
debugButton();
root.KingdomCore = core;
export default core;
