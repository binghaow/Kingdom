# Performance audit — Frontier Kingdom

Date: 2026-11-07  
Scope: current browser game in `public/`, including V36 performance changes already present before this audit. Audit is diagnostic only. No gameplay behavior was changed. A diagnostics HUD is off by default and can be enabled with `?perf=1`.

## Summary

The browser client is a single-threaded Canvas 2D renderer with a fixed-step JavaScript simulation. A Node benchmark of the production simulation shows that ordinary 360-unit updates are currently inexpensive after V36's targeting change: median 1.85 ms and p95 2.06 ms over 150 measured ticks in a 360-unit static-order scenario. In the 4-team combat/fog scenario, 360 units measured median 1.83–2.03 ms, p95 3.06–3.30 ms, with observed max 4.02–5.53 ms after warm-up. These results are Node CPU figures, not device/browser frame rates. They imply the most likely remaining lag on phones is rendering and dense local interactions, with intermittent fog / storage work as secondary causes. Actual iPhone thermal, browser GPU and frame-time measurements remain unmeasured.

## Five likely bottlenecks

| Priority | Candidate | Evidence | Fix difficulty |
|---|---|---|---|
| 1 | Canvas work scales with visible entities and sprite complexity | Every animation frame the client clears and redraws the canvas, constructs visible entity lists, allocates wrapper objects, sorts them by Y, then draws terrain, units, buildings, effects, fog, targets and UI overlays (`expansion.js:38`). Each frame also filters selection/entity collections repeatedly. The cost is proportional to visible entities and expensive sprite variants, even while the simulation itself is below budget. Hypothesis for mobile lag until sampled on-device. | Medium |
| 2 | Pairwise unit collision is quadratic | `engine.js:103` checks every unit pair on each 50 ms simulation tick. 360 units imply 64,620 pairs per tick before dead/embarked checks. Actual tick benchmarks did not expose a severe median, but this becomes a dense-army CPU scaling cliff and multiplies when a slow frame triggers catch-up ticks. | Medium–High |
| 3 | Fog of war has periodic full recomputation and memory snapshots | `worlds.js:82–83` clears visibility and walks vision cells for every unit/building, tests line of sight, then checks/stores visible nodes/buildings for every team. It runs every 0.5 simulated seconds. This can create short spikes that a median hides, especially with many nations or vision units. Hypothesis until browser/update phase samples isolate a fog tick. | Medium–High |
| 4 | Pixel fill, terrain backing canvas, atlas decode and cache churn consume mobile GPU/RAM | V36 already caps the main canvas DPR at 1.5 on a coarse pointer and caps the terrain backing canvas to 8.5 million pixels. Current assets total 240 MiB compressed PNG on disk (128 files); decoded memory is larger and an individual RGBA surface is 4 bytes/pixel. `attack-art.js` can decode up to two atlases concurrently, reads pixel data across frames, and maintains decoded/tint caches. Safari does not expose `performance.memory`, so live heap must be measured on Chromium or through native tools. Likely contributor during initial loading and high-unit battles; not a proven leak. | Medium |
| 5 | Full A* path searches and synchronous persistence can cause bursts | `engine.js:61` runs 8-neighbor A* over a 48-unit grid and allocates three grid-sized typed arrays per search. Paths are replanned after 1.8 simulated seconds, plus explicit attack/engagement repositioning can request paths. `expansion.js:84,89` serializes and writes the full save synchronously every eight seconds, while each render sorts and allocates lists. These are burst/hitch risks. Node test did not isolate their browser impact. | Medium |

## Requested subsystem review

- **Rendering architecture/frequency — measured from code:** Canvas 2D runs from `requestAnimationFrame`; the full visible scene is redrawn each callback. Terrain is prerendered to an offscreen canvas. The minimap is also Canvas 2D and V36 throttles it to 100 ms for coarse-pointer devices. No WebGL renderer is present. Render duration is now sampled by the opt-in HUD.
- **Frame loop — measured from code:** `expansion.js:89` clamps elapsed time to 100 ms, accumulates time and executes 50 ms ticks up to four times per frame, then performs UI work every 250 ms, save work every 8 seconds, draws, and requests another animation frame. A slow callback can therefore be followed by up to four simulation updates, compounding a hitch. The diagnostics HUD records frame interval, simulation, UI, and render durations separately.
- **CPU operations — measured from code:** collision pairs; enemy target candidate scans and diplomacy/visibility checks; A*; periodic fog; draw-list creation/sort; per-visible-entity draw and occlusion/pixel picking; save serialization. The prior V36 optimization already improved automatic target scanning and draw-side occlusion/head-bound work. This audit makes no further optimization.
- **Allocation/leaks — findings vs hypothesis:** per-frame lists, wrappers, sets and filtered arrays are explicit short-lived allocations. A* allocates typed arrays for every search. `unit-motion.js` recreates a `Map` snapshot each simulation tick. Art caches have explicit caps (`attack-art.js`, `troop-art.js`), which reduces unbounded growth risk. These are churn risks, not proof of a leak. The new HUD reports `performance.memory.usedJSHeapSize` where Chromium exposes it and says “unavailable” elsewhere.
- **Character animation — measured from code:** `captureMotion` builds a full unit-position map each fixed tick (`unit-motion.js`); drawing interpolates positions and computes a distance-driven gait for rendered units. Sprite animation may draw multiple cropped bands for walking and blends attack frames. Cost grows with visible moving units and animated asset mix. Hypothesis until render sub-timing on target devices.
- **Collision — measured from code:** exhaustive all-pairs unit resolution each tick, O(n²), and each overlapping pair may call `blocked`, which scans buildings. This is the clearest algorithmic scaling risk.
- **Enemy AI — measured from code:** strategic AI runs when the timer exceeds seven simulated seconds; raids occur much less often. The tactical unit behavior still updates per tick, including target scanning, movement, gathering and combat. Strategic planning frequency itself is unlikely to explain continuous lag; per-unit tactical work can.
- **Pathfinding — measured from code:** A* over a 48-unit grid, 8 neighbors, binary heap, typed arrays sized to the grid per query. Normal paths are cached on units for 1.8 simulated seconds. Expensive repeated queries during large coordinated movement or siege engagement are a plausible burst source.
- **Assets/image drawing — measured from files:** 128 PNG files occupy 240 MiB compressed. Canvas rendering decodes/rasterizes sprites and terrain. The attack-art system has a two-decode concurrency limit and bounded caches. Cold-start decode and high-resolution canvases are likely load/thermal cost; no measured memory leak.
- **DOM updates — measured from code:** the main HUD updates at most 4 times per second and rebuilds the actions panel only when a signature changes. This is sensible compared with the every-frame Canvas work. Campaign UI also scans units on those periodic UI updates. DOM is lower priority unless the HUD phase shows otherwise.
- **Canvas/WebGL opportunities:** Canvas 2D is appropriate for this game's current size and implementation. First measure and reduce CPU work submitted to Canvas; batching static terrain/layers and culling remain promising. OffscreenCanvas/worker rendering is a later option but needs serialization/transfer architecture. WebGL could improve large sprite batching and fill-heavy effects, but requires a renderer and asset pipeline rewrite and will not fix collision, AI, pathfinding or fog CPU costs by itself.

## Instrumentation

A small HUD is included in `public/performance-audit.js` and is loaded by `public/index.html`. It is inert unless the URL has `?perf=1`. It reports rolling median FPS/frame interval, p95 frame interval, simulation/update, render and last UI cost, active non-embarked units, active buildings, DPR, and JS heap when available. It samples every 20 frames and keeps 120 recent samples. It does not write game state. Example: `https://<game-host>/?perf=1`.

The Node simulation benchmarks above are measured. They exclude browser painting, image decoding, audio, DOM and phone thermals. For a conclusive device finding, capture 30 seconds on the iPhone in the same saved game and camera view, compare low and high entity counts, and note p95 frame interval plus update/render breakdown. JS heap will likely be unavailable in iOS Safari.

## Engine decision

- **Remain in JavaScript:** Yes. Current measured simulation cost on desktop Node does not support an engine migration. The Web client, Canvas architecture and shared multiplayer model are already established.
- **Phaser:** Potentially useful if its renderer, asset lifecycle, input and scene management replace a meaningful portion of the current custom stack. It may help WebGL sprite batching and profiling, but adopting it only to solve lag is premature and could add migration work without fixing the measured algorithmic risks. Reassess after device profiling and CPU fixes.
- **Unity:** Not justified by current evidence. It would require substantial porting of simulation, UI, netcode, saves and content, and does not automatically solve quadratic collision or expensive gameplay scans. Consider only if native/store requirements or measured graphics demands exceed what a Web renderer can deliver after optimization.

## Prioritized plan

1. Capture opt-in HUD samples on iPhone 17, iPad and desktop for the same saved scenario. Log frame p50/p95, update and render, visible entity counts, DPR and whether the hitch repeats every ~8 seconds or ~0.5 simulated seconds.
2. If update time rises with army size, address all-pairs collision via spatial partitioning, then profile and reduce repeated target/team/visibility checks.
3. If render time dominates, record draw-call/entity counts and profile worker/sprite/fog passes. Prioritize visible-region culling, reducing repeated sorting/allocation and batching repeated sprites; preserve gameplay and validate visually.
4. Isolate fog update and path query spikes using counters/timers, then consider incremental fog and path request scheduling only if those measurements show spikes.
5. If heap rises over repeated identical battles, record heap snapshots and cache sizes. Reduce cold-load decode contention and transient allocation only where snapshots confirm pressure.
6. Re-profile before considering Phaser; reconsider Unity only with concrete web-platform limits or a native product requirement that cannot be met in the existing client.

## Validation and limits

`node --check` passes for the diagnostics and main loop, `npm test` passes, and `npm run build` succeeds. Diagnostics are opt-in. No game behavior or balance changes were made in this audit. Browser/iPhone performance, GPU timings, and iOS heap were not measured in this workspace, so the five-item ranking is an evidence-backed diagnosis of likely causes, not a claim of on-device measurements.

## 2026-11-07 targeted performance fix

The iPhone 17 screenshot supplied in this session is a direct device measurement: at the 60-second HUD mark it showed 4 FPS, 253 ms frame p50 / 312 ms p95, update p50 234 ms, render p50 9 ms, UI last 1 ms, 81 units and 25 buildings. This isolates the immediate symptom to simulation/update CPU rather than Canvas drawing. It also matches only about one-third of the expected game-clock progression, so the simulation is falling behind real time and causing sustained CPU load and heat.

Confirmed source defect: `Sim.walk()` treated an empty path as a reason to re-run A* on every 50 ms fixed tick. The existing 1.8-second retry timer was therefore ineffective for unreachable goals. Each A* allocates three arrays proportional to the map grid. Failed routes now retry after 1.8 simulated seconds; a changed target cell or fresh player order still triggers an immediate attempt. The failure cache is runtime-only, is cleared when orders change/units reach their target/die, and is not serialized.

The opt-in `?perf=1` HUD now reports A* calls/failures/time, collision time and fog update calls/time alongside frame/update/render, UI, entities, heap and DPR. Collision timing uses a conditional timer only while the diagnostics HUD is enabled. This can confirm whether quadratic collision, route search or fog recomputation is the next dominant cost. Other listed hotspots remain hypotheses until compared on device.

Validation: `node check-all.cjs` passed all listed simulation, multiplayer, campaign, rendering, audio, movement and art-check groups after the initial correction; `npm run build` succeeded. `check-siege.cjs` adds a regression proving repeated failed routes are throttled and that new orders/goal cells replan immediately. Browser viewport and physical iPhone thermal retesting have not been performed in this environment; the user must retest the new link on the iPhone.

## 2026-11-07 iPhone retest findings and follow-up

The user's second iPhone screenshot measures: frame p50/p95 242/713 ms; update p50 220 ms; render p50 66 ms; UI 1 ms; A* 4 calls, 0 failed, 203 ms; collision 2 ms; fog 0; 85 active units and 26 buildings; Safari-reported device DPR 3. The four path searches account for about 92% of that frame's measured update time (203/220 ms). This is direct iPhone evidence that the main simulation spike is route search; collision and fog are not the cause in this sample. Render time is also material at 66 ms and needs a separate follow-up after simulation time falls.

Code-level cause found: a unit touching a blocked point in `Siege.walk()` discarded both land and sea navigation grids and reset the route timer. On the next movement step, the same blocked route could be searched again; any other unit requesting a route then forced a full-grid rebuild. A large five-player map has 40,992 navigation cells. A Node benchmark measured its cold grid+route call at roughly 157 ms and repeated warm routes at 0.24–0.55 ms. Node is not iPhone Safari; this is corroborating algorithm evidence, not a device performance estimate.

Fixes: preserve static navigation grids after unit movement collisions and low-bridge checks; defer retrying the same obstructed route for 1.8 simulated seconds; warm land and sea grids before a new/resumed match begins; reuse A* scratch typed arrays and a numeric heap; avoid allocating neighbor arrays per expanded cell; use the exact octile heuristic and linear-time path reconstruction. Actual building/wall additions and destruction still invalidate the corresponding navigation cache. Regression coverage checks that blocked routes retain caches and do not retrigger A* every tick.

The next diagnostics HUD also separates battlefield and minimap draw time, reports visible entity count, grid calls/time, expanded A* cells, and both device and effective Canvas DPR. The previous screenshot's `DPR 3` was the device DPR; the game caps coarse-pointer Canvas DPR at 1.5. This distinction is now visible in the HUD.

Validation: `node check-all.cjs` passes all project groups and `npm run build` succeeds after the follow-up. UI viewport browser checks and physical iPhone 17 retest of this new deployment remain outstanding. The 66 ms render measurement is not yet optimized; use the scene/minimap split on the next sample to choose that work.
