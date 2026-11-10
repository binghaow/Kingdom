# Unit spawn, combat response, and scale review

Date: 2026-11-07

## Changes

- Production exits now search for a passable, unoccupied cell with nearby open navigation cells. Recovery placement avoids crowded footprints and prefers cells with multiple exits.
- Movers that make no progress for 0.9 seconds get up to three safe lateral waypoints before continuing their original route. If still blocked, the route is periodically cleared for a fresh path search. This is transient simulation state and is not added to saves.
- Military units on ordinary move/rally routes and hold orders can engage valid enemies in their existing acquisition radius, then continue the saved move order. Explicit attack orders stay locked; retreat orders retain their disengage window. Villagers retain gather/build behavior.
- Tower projectiles originate near the visible top of the structure. Arrow-tower and cannon-turret shots use more readable projectile silhouettes and trails; combat damage/range/cooldown are unchanged.
- Reused art was scaled uniformly: villager display height 82→88 world pixels, house profile 132×133→150×151, villager radius 10→11, house radius 29→34. Existing pixel picking uses the updated art bounds.

## Validation evidence

- `node check-all.cjs`: passed, including move-order engagement, attack target locking, worker gathering, spawn exit clearance, stuck-route waypoint, turret projectile origin, saves, fog, and the existing gameplay regressions.
- `npm run build`: passed.
- `git diff --check`: passed; Git only reported the repository's configured LF-to-CRLF normalization notices.
- Browser preview `http://127.0.0.1:8765/presentation-preview.html?rev=spawnfix1`: reviewed the same-world-scale scene and ran its pixel-picking probe. Measured visible heights were villager 91 px, house 131 px, Town Center 248 px, trees 181–183 px. House, Town Center, tree, and villager rest/walk/harvest/load masks passed. This is a local desktop browser preview, not a physical-device test.

## Not verified

- Physical iPhone/iPad touch play, mobile frame rate, and thermal behavior.
- Long-duration crowded battles and custom maps beyond the deterministic automated scenarios.
- Manual in-game visual review of every national building/tower variant; the projectile source heights use one shared model per defensive building kind.
