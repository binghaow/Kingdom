/* Browser entry of the new ES-module code (P1). Bundled by scripts/build-core.cjs (esbuild) into public/kingdom-core.js,
   which index.html loads with ONE <script> right after the simulation scripts (network-model.js / network-client.js) and
   before the UI scripts (expansion.js creates the first simulation).

   Bridge rule (redesign-plan.md section 3): old global scripts and new modules talk only through
     window.KingdomSim   (old -> new: the simulation classes, read here)
     window.KingdomCore  (new -> old: everything exported below)
   New code never reaches into other globals, and old scripts never import from src/. */

import { checksum, fnvString } from './core/hash.js';
import * as replay from './replay/replay.js';

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
        core.replay.current = replay.attachRecorder(this, { difficulty, options, created: new Date().toISOString(), source: 'game' });
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

/* Debug entry, opt-in only: ?replay=1 shows a small "export replay" button. Normal players see nothing. */
function debugButton() {
  if (!query.has('replay') || typeof document === 'undefined') return;
  const add = () => {
    if (document.getElementById('kingdom-replay-export')) return;
    const b = document.createElement('button');
    b.id = 'kingdom-replay-export'; b.type = 'button'; b.textContent = '导出录像 / Export replay';
    b.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;font:12px system-ui;padding:6px 10px;border-radius:6px;border:1px solid #c9a65a;background:#1d1a14;color:#f3e3b5;opacity:.85';
    b.onclick = () => { const d = core.replay.download(); b.textContent = d ? `已导出 ${d.final.step} 步 · ${d.final.hash}` : '尚无对局'; };
    document.body.append(b);
  };
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
}

core.installed = install(root.KingdomSim);
debugButton();
root.KingdomCore = core;
export default core;
