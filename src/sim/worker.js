/* P4 step 4c-1: Web Worker entry (bundled by scripts/build-core.cjs into public/sim-worker.js). It contains its own copy of
   the simulation chain (public/engine.js ... public/little-ant.js, loaded through their CommonJS branch), so the worker runs
   exactly the code the page runs on the main thread; check-core-bundle.cjs fails when the bundle is older than those files.
   The page side is src/sim/client.js; the message handler is src/sim/host.js. */

import K from '../../public/little-ant.js';
import { createHost } from './host.js';

const scope = typeof self !== 'undefined' ? self : globalThis;
const clock = () => (typeof performance !== 'undefined' ? performance.now() : 0);
const host = createHost(K, (m) => scope.postMessage(m), { now: clock });
scope.onmessage = (e) => host.handle(e.data);
