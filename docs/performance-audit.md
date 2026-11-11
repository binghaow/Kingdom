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

## 2026-11-07 iPhone 17 successful retest and diagnostics behavior

The user's follow-up iPhone 17 screenshot reports 58.8 FPS, frame p50/p95 17/25 ms, update p50 0.0 ms, render p50 1.1 ms, UI 0.0 ms, A* 0 calls, grid 0, collision 0, fog 0, scene/minimap 1.0 ms each, and 88 active units plus 28 buildings (89 visible). Device/effective Canvas DPR is 3/1.5. This is the first supplied device evidence after the path-cache/A* changes and shows the formerly severe stall is absent in that 61-second sample. It is one observed scenario, not a guarantee for all maps or devices.

The HUD now follows the existing single-player `debug` chat command. Enabling it creates the HUD and installs timing wrappers; disabling it removes the HUD and restores the original hot methods, so ordinary play avoids profiling wrappers and per-frame samples. The explicit `?perf=1` URL remains available for profiling without turning on the gameplay debug cheats. Multiplayer still cannot enable the single-player debug mode. Device-layout checks after this HUD behavior change were not run here; the HUD uses the existing compact, pointer-transparent panel geometry.

## 2026-11-08 code audit: zoomed-out rendering and multiplayer sync

### Evidence

- Confirmed in source: `expansion.js` calls `sim.view(0)` during every animation-frame draw. In fog mode that rebuilds visible units/buildings/resource lists; rendering then created three filtered arrays, three mapped wrapper arrays and a combined depth-sorted list on every draw. This is a measured code path, but its iPhone CPU cost was not sampled in the user's current multiplayer match.
- Confirmed in source: the strategic camera previously allowed zoom down to 6%, and the “全图” control fit the full map into the main viewport. Current map extents are 7,488–11,712 world units wide and 5,568–8,064 high. At that scale most or all of a small map could be on screen, increasing the number of drawable objects and reducing unit readability.
- Confirmed in source: the browser game draws on every `requestAnimationFrame` (normally around 60 Hz), while simulation steps run at 20 Hz. Canvas drawing is therefore repeated between simulation steps.
- Confirmed in source: multiplayer polls about every 350 ms while active. Each room request hydrates and advances the authoritative simulation, commits a compressed full room state, then builds a per-seat snapshot containing currently visible entities and fog arrays. This is a plausible source of sync latency and serialization work, but it has not been timed against the user's two-device connection.
- Prior device evidence is not contradictory: the 2026-11-07 iPhone screenshot measured about 1.1 ms median render and 58.8 FPS in one single-player 61-second scenario. It does not measure a long heated session or multiplayer polling/application costs.

### Changes

- Cache the render visibility view until its simulation, entity arrays or fog revision changes. Fog revisions update on the existing half-second cadence; moving entity objects remain live references.
- Build the depth list with direct loops, avoiding the three intermediate `filter`/`map` arrays.
- Cap zoom-out dynamically so the main view covers at most about 68% of each map dimension. At that time, the overview control centered on a strategic view; the minimap remained the full-map navigation tool.
- Refresh minimap graphics at most 10 times per second on both pointer classes, except immediately when fog changes.
- Extend opt-in `?perf=1` diagnostics with visible-view cost and multiplayer request / response-application time. These metrics are absent from normal play.

### Validation and remaining work

- `node check-all.cjs` and `npm run build` pass after these changes.
- The local browser opened the setup screen; battlefield interaction and the required phone portrait/landscape, iPad landscape and desktop visual matrix were not completed in this environment. No physical iPhone/iPad or two-device multiplayer retest has been run.
- For the next online sample, open both players with `?perf=1` and compare `update`, `render`, `scene`, `view`, `net` and `apply` lines after the match has run for at least 60 seconds. `net` measures fetch plus response parsing; `apply` measures the client state/UI update. These values help distinguish local rendering from request/snapshot work but do not isolate server CPU from network transit.

## 2026-11-08 local-battle zoom limit

The user requested Warcraft III / Red Alert-style camera limits that keep the main view around the local battle instead of zooming out to most or all of the world. The old production camera allowed a 6% zoom floor; the previous strategic-view cap was based on map size and could still show a large fraction of a small map. The new minimum camera scale is 0.55, with the existing viewport/map bound still allowed to raise it for small maps or large viewports. Pinch, wheel, buttons, slider, saved cameras, orientation changes and the local-battle overview all pass through the same clamp. The local-battle overview keeps the current focus point and changes only zoom; the minimap remains the full-map navigation control.

The draw loop already culls entity draw calls outside the camera rectangle plus a 240-world-unit margin. The closer minimum should reduce off-screen entity drawing when the old camera made most map entities visible. It does not reduce simulation, AI, collision, pathfinding or multiplayer synchronization work, so it is a rendering/readability improvement rather than a complete heat/CPU fix. No device FPS/thermal comparison has been measured yet.

Validation: `node check-all.cjs` and `npm run build` pass after the camera/control/help/localization update. The local preview reached the setup dialog, but the battle view and zoom slider were not exercised. The supported Windows browser automation stopped because it could not establish the active browser URL with enough confidence; phone portrait/landscape, iPad landscape and desktop visual checks remain outstanding. No physical iPhone/iPad comparison was run.

## 2026-11-08 8-minute desktop slowdown sample

### Measured evidence

The user supplied a screenshot from the local game after 7:52 in-game. The opt-in HUD reads 2.6 FPS, frame p50/p95 383.4/833.4 ms, update 4.7 ms, render 385.7 ms, UI 0.7 ms, A* 2 calls / 0 failed / 0.1 ms, collision 1.2 ms, fog 0 ms, scene 385.2 ms, minimap 0.7 ms, 78 active units, 19 buildings, 110 visible objects and 87.7 MiB reported heap. This directly identifies the main sampled delay as scene drawing: simulation, routing, collision, fog, HUD and minimap are all small in this sample. It does not identify which draw pass consumed the scene time, and the screenshot is desktop evidence only; there is no corresponding iPhone/iPad measurement yet.

### Source-confirmed hot-path candidate and change

The worker and infantry animation compositor in `public/detail-art.js` blends adjacent animation frames through one 540×540 offscreen canvas. For each animated entity requiring a blend, it previously cleared all 291,600 pixels although the next draw samples only a frame-sized crop. This cost repeats with visible animated entities and is a credible match for the sharp slowdown after producing units. The compositor now clears only the crop it will redraw and sample. It preserves the same frame blending, assets and animation timing; it does not remove animation frames.

This is a source-confirmed redundant-work reduction, but its contribution to the supplied 385 ms measurement remains unproven because that run predates the change and the earlier HUD had no per-pass timing. The diagnostics now report the slowest of four opt-in scene groups (grass, entities, occlusion, overlay/fog) alongside the overall scene time. Capture a comparable post-change run to verify the effect and isolate any remaining hot pass.

### Validation and limits

`node check-all.cjs` passed all registered simulation, combat, multiplayer, rendering and art checks; `npm run build` succeeded; `git diff --check` reported no whitespace errors in the four touched files. Browser battle-scene visual review, the same eight-minute scenario after the change, physical iPhone 17/iPad performance and thermal measurements have not been performed here. The desktop screenshot cannot be used to claim mobile performance. No gameplay systems, balance, save format, network protocol, external dependencies or assets were changed; no new App Store compliance dependency was introduced.

## 2026-11-09 direct-file launch visual failure

The user's Chrome screenshot shows the game opened from `file:///.../frontier-kingdom/public/index.html`. All game assets are referenced with relative `assets/...` URLs, and the renderer intentionally uses primitive dots/ellipses when `KingdomArt.loaded` is false. The art readiness promise rejects on image decode or canvas atlas processing errors; the caller's failure branch previously re-enabled Continue/Start, so a failed art load could enter a simulation with these fallback marks. The screenshot matches this failure state. The exact browser exception was not captured, so attributing it specifically to Chrome's local-file origin security is a likely trigger, not a confirmed console error.

Change: direct `file://` launches now stop at setup with a persistent instruction to use the local preview server; any other art readiness failure keeps Continue/Start disabled and reports that art failed. This prevents the fallback-debug view from being mistaken for a playable release. `http://127.0.0.1:8765/` continues to load the game through the project's existing `npm run dev` server.

Visual check: the local HTTP preview rendered its nation artwork and map normally at the available 486×864 CSS viewport. A user-provided 1904×985 desktop screenshot documents the broken file-URL fallback. The actual file-URL error branch could not be exercised through the supported browser tab, so its persistent copy is source-reviewed but not visually verified there. iPad, physical phone and desktop HTTP visual matrices remain untested. This startup guard introduces no new data collection, assets or release compliance dependency.

## 2026-11-09 army-density hitch follow-up

### Screenshot evidence

The user's latest `?perf=1` screenshot shows a 46-unit selection, 79 active units, 13 buildings and 106 visible objects. It reports 30.1 FPS, frame p50/p95 33.2/266.7 ms, update p50 1.3 ms, render p50 5.5 ms, scene p50 5.2 ms, entity pass 1.0 ms, occlusion 1.4 ms, grass 0.7 ms, collision 0.8 ms and two fog updates totaling 14.5 ms. The 266.7 ms p95 is a severe hitch. The other phase values in this screenshot are medians only, so they cannot rule out a render or update spike on the slow frames. Fog may explain some individual slow frames, but its recorded total does not explain the full frame p95 by itself. The screenshot's reported DPR is 1/1, so it is not sufficient evidence of iPhone 17 or iPad behavior.

### Source review and diagnostic change

The main loop performs a full simulation serialization plus synchronous `localStorage.setItem` every eight seconds. This is a credible source of occasional blocking, but its duration has not previously been measured and must not be presented as the confirmed root cause. The existing opt-in HUD now shows p50/p95 for update, render and scene, plus the last/maximum serialization-and-storage duration. Normal play still has no performance HUD or timing wrapper; measurements are active only under `?perf=1` or single-player debug mode. No gameplay or rendering behavior was changed in this diagnostic follow-up.

### Next comparison and limits

On the same computer/browser and same busy army scene, leave `?perf=1` open for at least 30 seconds and record the HUD both during a hitch and after it. If `update p95` rises, inspect simulation/AI; if `scene p95` rises, use its pass list; if save last/max spikes with frame p95, the synchronous save path is implicated. If all measured phases stay low while frame p95 spikes, the remaining cause is outside these measured JS phases (for example browser scheduling, garbage collection or raster/GPU work) and requires a browser performance trace. `node --check` passed for both changed JavaScript files, `node check-all.cjs` passed, and `npm run build` succeeded. No physical iPhone/iPad retest or deployment was performed.


## 2026-11-09 desktop stutter and flattened-building matte

### Measured symptoms

Two user-provided local desktop captures report 11.9 FPS (frame p50/p95 84.1/183.3 ms) and 8.6 FPS (116.7/333.3 ms). Render medians are 50.7 and 76.6 ms; scene medians are 50.5 and 75.5 ms. Simulation update medians are 32.3 and 33.9 ms. In the same samples, collision takes 15.3 and 14.4 ms. The scenes contain approximately 162–166 active units, 36–37 buildings and 149–154 visible entities. These measurements show both rendering and simulation are over budget; collision is a material measured part of the update cost. They are desktop captures at device/effective DPR 1/1, not iPhone or iPad evidence.

### Changes and evidence

- Unit collision separation now builds transient 128-world-unit buckets and evaluates nearby candidate pairs in the same stable unit-index order as the old all-pairs pass. This preserves the existing separation rule and blocking checks. Regression comparison against the prior algorithm passed 100 seeded mixed scenarios and dense 80, 166, 300 and 600-unit crowds; distant pairs are pruned. The debug HUD now reports tested/possible pairs alongside collision milliseconds. Device timing improvement remains unmeasured.
- The moving-unit gait renderer previously issued 19 sprite drawImage operations per moving unit per frame (one torso plus 18 leg strips). It now memoizes production-equivalent gait composites at 16 gait phases, four blend levels and the active Canvas scale, with an LRU limit of 192 frames and a 4.5-million-pixel backing-store budget (about 18 MB). The same nine gait bands and source images remain in use; only repeated composition is cached. This is a source-confirmed high-call-count candidate for the entity-render cost, not yet a measured contribution. The existing HUD’s separate units/buildings/nodes pass timings are retained to verify a fresh sample.
- The mill/mining camp/riding academy base and refined art is cut from functional-buildings-v1.jpg, which is flattened and has no alpha channel. The existing gray-key cleanup could not remove its black backdrop and white specks. A JPEG-specific border flood fill now clears black/white matte before the existing gray cleanup; other PNG atlases and crop logic are unchanged. A regression test executes the production matte-cleanup function against synthetic black/white matte and opaque building pixels.

### Validation and remaining limits

The full `node check-all.cjs` suite passed after the collision change, including the multiplayer checks. After the final cache-budget adjustment, focused motion, gait-cache, collision-parity and matte-alpha checks plus Node syntax checks passed; `npm run build` succeeded. Browser visual QA could not be completed because the available preview tab did not connect to http://127.0.0.1:8765/; the game asset therefore still needs an in-context desktop visual confirmation on this machine. The full project suite/build are being run for this change. No physical iPhone 17/iPad test, multiplayer retest, thermal comparison, or release deployment was made. No third-party assets, dependencies, gameplay balance, save schema, or network protocol were introduced.


## 2026-11-10 multiplayer server cost (netcode P0) and single-player unit-count scaling

### Multiplayer: fixed per-request cost

Full write-up, protocol notes and all tables: [netcode-p0.md](netcode-p0.md). Summary of what was measured in Node (sandbox, in-memory SQLite, no network, no real D1; not device or Worker evidence):

| scenario | server CPU per poll, mean / p95 ms, before -> after | response JSON KB before -> after |
|---|---|---|
| opening, 2 seats, 27 units, fog off | 52.4 / 142.1 -> 20.4 / 42.9 | 173.7 -> 37.2 |
| 2 seats, 64 units | 128.5 / 160.9 -> 25.6 / 60.3 | 197.4 -> 53.6 |
| 4 seats, 47 units, fog on | 120.9 / 359.1 -> 39.4 / 73.0 | 64.7 -> 16.0 |
| 4 seats, ~170 units | 446.1 / 551.8 -> 68.0 / 115.3 | 119.1 -> 51.2 |
| 4 seats, ~810 units in combat | 1049.7 / 1364.9 -> 369.2 / 509.3 | 335.9 -> 276.9 |

Changes: the `art-profiles` lookup left the `blocked()` inner loop; the server keeps navigation grids across requests (keyed by room, world and standing buildings; unit movement never invalidates them; a miss rebuilds from the saved state and reuses a terrain-only mask); `start()`/`advance()` prewarm land and sea grids; protocol 2 stops resending fog arrays and unchanged static sections. Remaining per-request cost at large armies is save decompression/compression, `updateFog()` on every restore, the auto-target roster rebuild and the simulation step itself.

### Single player: step cost versus unit count

The user reports single-player stutter when armies are large. `scripts/perf/sim-scaling.cjs` builds a two-nation `coast_s` game, adds N mixed land units split between both sides, orders both armies to advance on each other and times 240 single-player steps (0.05 s) covering march, contact and melee. Node v22 on the sandbox; milliseconds per step; columns are inclusive time of the named method.

| units | step mean | p50 | p95 | max | collision | auto-target | pathfinding | fog | other (orders, combat, tactics, companions, economy) |
|---|---|---|---|---|---|---|---|---|---|
| 55 | 4.06 | 2.34 | 12.85 | 59 | 0.22 | 0.24 | 0.61 | 0.83 | 2.13 |
| 105 | 6.01 | 3.70 | 17.96 | 89 | 0.39 | 0.57 | 0.88 | 1.06 | 3.11 |
| 205 | 10.01 | 6.41 | 30.70 | 115 | 1.01 | 1.47 | 1.49 | 1.43 | 4.61 |
| 405 | 22.32 | 13.33 | 64.99 | 140 | 3.21 | 4.78 | 2.32 | 2.74 | 9.27 |

Same script on the commit before this work: 3.72 / 6.15 / 11.65 / 27.80 ms mean. The 15–20% difference at 200–400 units comes from the `blocked()` and `pair()` changes; the `require` part of that gain exists only in Node, so the browser gain is smaller and was not measured.

Findings:

- Unit count x8 (55 -> 405) costs x5.5 in the mean step, but **auto-target grows x20 and collision x15**: both are quadratic in units that are close together. Pathfinding (x3.8), fog (x3.3) and the rest (x4.4) grow roughly linearly or slower.
- p95 is about three times the mean at every size (13 -> 65 ms). The spikes line up with the 0.5 s fog refresh and bursts of path requests when a whole selection is ordered at once; `max` (59–140 ms) is the first step after the mass order.
- A CPU profile at 405 units has no single dominant function. Largest self times: `findPath` 8.7%, `separateCrowd` 6.2%, `updateFog` 5.9%, `tactics.tick` 5.7%, `siege.blocked` and its building callback 10%, `distance` 3.7%, `acquireAutoTarget` 3.6%, `canSee` 2.6%, `canTarget` 2.4%, `byId` (linear scan over units, buildings and all resource nodes) 3.3%.
- `view(0)` costs 0.2–0.4 ms per call and is not a factor.
- At 205 units the desktop Node step averages 10 ms against a 16.7 ms frame; a phone that is three to four times slower would spend 30–40 ms per step on simulation alone, before rendering. This extrapolation is an estimate, not a device measurement.

No single-player code was changed in this pass: nothing here is a confirmed, isolated hot spot that can be fixed without touching targeting or collision behaviour, and rendering was not profiled. Recommended next steps, in order, each to be verified with a state-hash comparison so behaviour stays identical:

1. Auto-target: reuse the existing 128-unit collision buckets (or a similar spatial hash rebuilt with the 0.3 s roster) so `acquireAutoTarget` only tests enemies within sight range instead of the whole roster.
2. `byId`: an id -> entity map maintained by `add`/removal, or a per-step lazily built map; it is called per unit per step and scans up to ~900 nodes.
3. `blocked()` during movement: prefilter buildings by bounding box (or sample the cached navigation grid first and only run the exact ellipse test for cells next to buildings).
4. Fog: update incrementally or spread the 0.5 s refresh over several frames to remove the periodic spike.
5. Stagger path requests for large selections over a few steps (the retry cache already exists) to cut the first-step spike.

### Not verified

- `?perf=1` frame, render, entity-pass, minimap and canvas-DPR numbers were **not** collected: no browser or device was available in this environment, so render sort/draw scaling with unit count is unknown. The 50/100/200/400-unit scenario above should be repeated on desktop and phone with `?perf=1` before optimizing rendering.
- No physical iPhone/iPad run, no Cloudflare Worker/D1 run. All figures above are Node CPU times on a shared two-core sandbox with roughly ±20% noise.
- Multiplayer latency figures in netcode-p0.md are model outputs with assumed RTT and D1 round-trip times.

No new release-compliance dependency was introduced.

## 2026-11-10 发布前常规检查（release-check）

新增 `npm run release-check`（`scripts/release/`），每次发布前必须运行，规则见 AGENTS.md“发布前常规检查（必须）”。它复用 `scripts/perf/sim-scaling.cjs`、`scripts/netcode/server-cost.cjs`、`scripts/netcode/latency-model.cjs`（后两者只加了可选的提前停止与库导出），并新增：

- `path-analysis.cjs`：四个脚本场景（开局、200 单位会战、围攻被城墙围死的目标、160 单位大编队一次下令）的 A* 统计与卡住单位检测。挂钩只装在测试实例上；A* 展开节点借用 engine.js 已有的 opt-in 计数，仅在每次 findPath 调用期间启用。
- `render-cost.cjs`：Playwright + headless Chromium（`--disable-gpu`）打开真实游戏 `?perf=1`，桌面与手机视口约 200 单位会战，记录帧间隔、HUD 的 render/scene，以及每帧 drawImage 与带 `ctx.filter` 的绘制次数（计数器只注入测试页面）。
- `net-cost.cjs`：服务端每次轮询 CPU 与响应体积、4 席位同时到达的冲突重算（实测）、时延模型。
- 结果与 `scripts/release/baseline.json` 比较，输出 PASS/WARN/FAIL，并写入 `docs/release-reports/`。

### 首次运行的发现（基线 = claude/netcode-p0 的游戏代码）

- **卡住单位，确定性复现**（模拟无随机数，每次相同）：
  1. *首段受阻的死循环*：A* 网格按默认小半径单位、以格子中心判定；`Siege.walk()` 按单位真实半径逐段检查。若单位当前位置到第一个路点的直线擦过建筑角（开局村民贴着靶场）或窄通道对火炮太窄（大编队里的火炮），这段移动被判阻挡，路线被丢弃并记入不可达缓存，1.8 秒后重新寻路得到同一条路线，再次被丢弃，单位永久原地不动（样例 119.5 秒、69.5 秒）。
  2. *迎面僵持*：两个单位在同一行格子中心上相向而行（会战里一名步兵与一名村民），碰撞分离沿同一直线把两者推回；`walk()` 的卡住恢复只比较本次 walk 内的位移，看不到之后碰撞造成的回退，所以从不触发绕行，两者整场不动。
  3. *围攻被围死的目标*：60 个攻击者全部 `engagementBlocked` 原地不动，不会转去攻击城墙；`engagementPoint()` 每个单位每 2 秒做最多 6 次全图洪泛 A*（每次展开 10,608 格、约 1.5 ms），且所有单位的 2 秒记忆同时过期，造成约每 2 秒一次 ~600 ms 的模拟步尖峰。这一路径不经过 `pathFailures` 不可达缓存。
- **渲染**：在无 GPU 的 headless Chromium 中，约 200 单位场景每帧约 40 次带 `ctx.filter` 的绘制（单位被树木/建筑遮挡时 `precision-picking.js` 的剪影描边 `brightness(0) invert(1) drop-shadow(...)`，以及受击闪光 `brightness(...)`）。在测试页面中临时把 filter 置空做对照：帧间隔约 3.8 s → 去掉 drop-shadow 后约 0.76 s → 去掉全部 filter 后约 0.08 s。软件光栅放大了这个差距，真机 GPU / Safari 上的比例未测，但 `ctx.filter` 是需要在 iPhone 上用 `?perf=1` 优先确认的候选热点。
- **联机**：4 席位请求同时到达时，进程内实测乐观锁冲突约 1.4 次/请求，每轮 CPU 约翻倍；线上冲突率取决于 D1 往返与请求错开程度，未实测。

以上均为诊断结论，本次没有修改任何游戏代码或数值。修复（网格/逐段检查使用一致的单位半径或对首段做容差、碰撞回退纳入卡住判定、围死目标时转攻城墙并错开重试、替换 canvas filter 描边）需单独立项，并在修复后用 `--update-baseline` 更新基线。

### 未验证

- 真机（iPhone 17 / iPad）帧率与发热、Safari 的 filter 开销、Cloudflare Worker / D1 线上数据均未测；headless 渲染数字只作提交之间的回退信号。
