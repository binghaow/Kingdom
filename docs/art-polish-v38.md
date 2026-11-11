# Art & motion acceptance audit — V38

Date: 2026-11-11  
Scope: initial audit of `main` at `b58b602`, followed by a localized worker-animation rendering fix in the current worktree. It does not alter simulation, movement, pathfinding, collision, AI, combat balance, or production logic.

## Acceptance summary

**Not ready to call polished or release-ready against the requested bar.** Existing V34/V37 work provides real four-direction combat atlases, a presentation-only motion layer, pooled combat effects, staged damage/collapse art, and headless regression checks. The stored infantry sample shows a standing sprite with sliced-leg deformation, not an authored 8-frame gait; the V37 diagnosis estimates foot slip at ~20%, above the required <5%. Production-chain inspection also found that villagers already have authored 8-frame walk/work/carry art, but their renderer cross-faded adjacent poses with additive compositing, producing doubled silhouettes. This pass removes that worker cross-fade; the change still needs a production-browser visual capture. Other requirements lack saved one-second evidence, and the 200-unit physical-device target has no current measurement.

The current test suite exercises simulation/gameplay and renderer invariants, but passing it does not establish the requested visual acceptance criteria. The V38 worker-frame change is limited to rendering; the full visual/performance acceptance remains incomplete.

## Motion and rendering evidence

All linked V37 strips are sampled from the production world canvas at 70–100 ms intervals. Their recorded time spans exceed one second; these are headless Chromium samples, not device recordings. Each panel is a separate rendered frame in temporal order.

| Requirement | Result | Continuous-frame evidence / reason |
|---|---|---|
| Infantry walk: 4 directions, 8 authored frames, <5% foot slip, speed-synced, natural stop | **FAIL** | [Infantry walk strip (1.75 s)](animation-v37/after/walk.jpg). The body and feet remain essentially fixed while lower sprite bands shear; this is not an 8-frame walk cycle. `docs/animation-diagnosis.md` records ~20% stance slip. No natural settle frames are evidenced. Needs licensed/original authored walk loops and stop transitions. |
| Cavalry/beast walk: 4 directions, 6 authored frames, <5% foot slip | **FAIL / NOT EVIDENCED** | No one-second cavalry/beast walk sequence exists. Current generic gait applies leg-band deformation; dedicated six-frame gait art is not demonstrated. |
| Smooth turns, no one-frame heading flip | **PARTIAL** | [Infantry turn strip (1.8 s)](animation-v37/after/turn.jpg) shows the presentation squash wrapper, but it does not prove a complete authored turn across all unit families and both 180-degree transitions. V37 uses a brief scale transform, not direction-interpolated source art. |
| Attack prep, release, follow-through, recovery; strike/impact/projectile timing | **PARTIAL** | [Infantry duel](animation-v37/after/inf_duel.jpg), [archer](animation-v37/after/archer_vs_inf.jpg), [musketeer](animation-v37/after/musket_vs_inf.jpg), [cavalry charge](animation-v37/after/cav_charge.jpg), [cannon vs. building](animation-v37/after/cannon_vs_house.jpg), each >1 s. `check-attack-actions.cjs` verifies 68 action mappings and four authored keyframes across four headings, but the audit has no one-second capture for every one of the 53 combat units or every hit/projectile class. |
| Hit reaction and death fall/corpse fade | **PARTIAL** | [Death strip (1.53 s)](animation-v37/after/death.jpg) shows the V37 presentation fall/fade. The stored strip does not separately validate all unit families or every death pose direction. |
| Villager gather/build/work, cargo attached, handoff to carry/return/delivery | **NOT EVIDENCED** | `check-attack-actions.cjs` checks action mapping; `check-cargo.cjs` and `check-gait-render-cache.cjs` check invariants. No saved one-second production-order sequence captures the complete work→loaded movement→delivery transition. Needs actual production-canvas sequences for wood, mine, food, build and resource delivery. |
| Building construction stages and natural completion | **NOT EVIDENCED** | Gameplay construction is covered by automated simulation tests, but there is no stored continuous production-render capture showing foundation→scaffold→finish. Do not count simulation progress as visual proof. |
| Gradual building damage, fire/smoke, collapse, debris/remains | **PARTIAL** | [Building hit strip](animation-v37/after/building_hit.jpg) and [collapse strip](animation-v37/after/building_collapse.jpg), each >1 s. These cover one representative building, not all architectural profiles/materials or repair restoration. |
| Unit exits production doorway and walks to rally point | **NOT EVIDENCED** | `check-unit-recovery.cjs` verifies legal spawn positions and recovery in Node. It does not prove a visible door exit or natural movement from the entrance in the production renderer. |
| Ship bob, sail cycle, smooth turn, idle/picking up anchor | **NOT EVIDENCED** | No saved one-second ship motion strip. V37 documentation says ships skip bob; naval tests cover mechanics, not these motions. |
| Projectile flight, arrival-aligned hit and readable mass battle | **PARTIAL** | V37 adds pooled rendered projectiles and delayed impact effects. Stored one-second examples cover selected combat cases, not a 200-unit readability pass with all effect tiers and no occlusion. |
| No afterimages / duplicate sprites | **PARTIAL** | V37 explicitly draws one authored unit sprite at a time, and `check-attack-actions.cjs` verifies pose mapping. No saved one-second multi-unit attack+work capture is dedicated to detecting ghosting across all animation transitions. |

## Performance gate

| Target | Result | Evidence |
|---|---|---|
| 200 visible units: desktop 60 FPS | **NOT VERIFIED** | Historical V37 headless measurements are not a current matched `?perf=1` run, and the project’s performance audit says current render timings were not collected. |
| 200 visible units: iPhone >=30 FPS without periodic hitch | **NOT VERIFIED** | No physical iPhone/iPad measurement for this revision. Headless/Node results cannot substitute. |
| `?perf=1` frame-time p50/p95 | **NOT VERIFIED** | No fresh current-build HUD sample/capture for the required scenario. |
| Memory and thermal behavior | **NOT VERIFIED** | No current long-running desktop or physical-device run. |

Do not compare with stale historical figures as if they were a current baseline. Capture a matched current build, 200 visible-unit scene, same camera/zoom/effect tier, and report frame p50/p95, update p50/p95, render p50/p95, active/visible counts, canvas DPR and heap where available. Record desktop browser and physical iPhone separately.

## Simulation-only issue boundary

No reproducible stuck-unit, pathfinding-pause, repeated-turn, or stop/start defect was observed in the static audit evidence. Existing Node checks pass the blocked-spawn and crowd-recovery scenarios, but this is not a live visual guarantee. If one is observed during later capture, record scene/map, coordinates or visible landmark, unit type/count, selected order and exact reproduction steps. Leave the simulation fix to `feature/fix-stuck-units`; do not mask it with presentation interpolation.

## Required source assets and missing captures

- Infantry: original/redistributable 8-frame walk loops for front/back/left/right, matching each national/era silhouette; authored settle/stop and turn transition frames.
- Cavalry and beasts: original/redistributable 6-frame loops for four views, with hoof/foot contact and corresponding stop/turn transitions.
- Work/cargo: continuous production-canvas sequences for wood, stone, gold, food, farming, construction, carrying, return and delivery; cargo must remain attached to the existing basket/log sockets.
- Buildings: construction and completion sequences across representative house, civic, military, naval and industrial silhouettes; repair/recovery capture; damage/collapse captures by material and national style.
- Production: capture at the actual doorway from queue completion through exit and rally movement for infantry, mounted, siege, air and naval classes where applicable.
- Naval: ship idle/wake, sail, turn, move/stop and carrier launch/recovery sequences at gameplay scale.
- Combat: 1-second sequences for melee, arrows, firearms, siege, air, ship and guardian attacks showing wind-up→release→projectile→impact→recovery, plus 200-unit readability.

Only use project-owned, generated-on-request, or otherwise redistribution-cleared art/audio. No assets were fabricated or copied during this audit. Actual capture evidence must use the exact production script order and be stored under `docs/art-polish-v38/`; link each sequence here and identify desktop/headless vs physical device.

## V38 implementation update — 2026-11-11

- `public/detail-art.js`: worker animation now selects one authored source frame at a time. It no longer blends two different worker poses using additive compositing, the source of doubled silhouettes. All eight source frames, action timing, cargo attachment and simulation fields remain unchanged.
- `public/presentation-motion.js`: adds a pure frame-index helper for looping and one-shot sequences.
- `check-motion.cjs`: adds coverage that a cycle visits all eight source frames and loop/clamp boundaries behave correctly.
- No new assets or simulation changes. No new App Store compliance dependency.

## Checks and release decision

- `node check-motion.cjs`: **PASS**, 6 checks including the new authored-frame cadence test.
- `npm test`: **PASS**; `check-all.cjs` completed with exit 0. Gameplay, AI, combat, recovery, maritime, world, siege, audio, networking, animation/action mapping and asset-alpha checks all passed.
- `npm run build`: **PASS**; production Worker and client assets built; 15/15 PNGs losslessly repacked, 6.34 MiB saved.
- Visual review: existing V37 headless strips visually inspected for infantry walk; it fails the requested gait criterion. The local production-order browser preview was opened and the changed worker renderer was watched across successive frames; the previous doubled-pose ghosting was not visible. This was a desktop browser spot check only. A saved one-second sequence is still missing under `docs/art-polish-v38/`, so the required evidence gate is not complete; physical iPhone/iPad remain unverified.
- Performance: no fresh `?perf=1` matched measurement and no device run. Worker compositing work is lower by design, but no FPS gain is claimed without measurement.
- Release: published as an **incremental test build** in public Site version 50 at `https://frontier-kingdom-bing-1105.cappedbow.chatgpt.site`. This does not mean the full V38 art/motion acceptance is complete: the authored infantry/cavalry/beast loops, construction/production/naval captures, and physical-device performance targets remain open. No new App Store compliance dependency was introduced.
