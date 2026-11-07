# Frontier Kingdom — persistent UI and scale requirements

## Incremental development

- Before adding a feature, identify existing features, components, and assets that can serve it. Reuse them when they fit and preserve the behavior their current callers rely on.
- When reuse is unsuitable, add the new capability through the smallest isolated extension that meets the request. Preserve existing gameplay, controls, interfaces, and save compatibility unless the user explicitly requests a change to them.
- Keep changes confined to the requested feature. Use existing checks to verify the new behavior and any existing flows it touches. If the feature requires changing existing behavior beyond the authorized scope, explain the concrete impact and obtain approval before making that change.

## UI and scale

For changes to HUD, responsive layout, touch input, selection, camera, sprites or entity scale, apply the project skill [frontier-ui-audit](skills/frontier-ui-audit/SKILL.md). Read its checklist before implementing and record actual validation in docs/. These are the user's standing preferences, not facts to reconstruct from chat history.

- Main battlefield remains central and spacious; keep bottom-command collapse/expand and the army / idle-worker / fleet shortcuts.
- Chinese and English labels, unit portraits, queue counts and resource costs must remain legible inside their panels on phone portrait/landscape, iPad landscape and desktop. Horizontal command scrolling is intentional; accidental clipping or overlapping controls is not.
- The villager building catalogue should favor larger detailed building pictures with slightly smaller readable captions. Keep full costs and descriptions accessible; do not revert to large fixed text rows that squeeze the artwork.
- Keep bitmap aspect ratio, full heads/feet in portraits, and world-camera uniform scale. Adjust tree/building proportions relative to a villager at the same zoom; never solve this by stretching one axis. Trees should visibly exceed human height; houses and civic buildings should look usable by people.
- Keep entity drawing, measurement, picking, outlines, placement and health bars consistent after art scale changes. A larger sprite must not gain a large invisible circular picking area. Do not silently change resource amounts, movement or combat balance to fix artwork.
- Villagers visibly carry logs or a back basket of stone/gold/food; the loaded posture and straps must connect the burden to the back. Preserve harvest/return/delivery semantics, smooth movement and correct facing.
- A browser viewport check is not a physical iPhone/iPad test. Report validation limits honestly. Maintain the existing Site identity and sharing audience.
- Combat audio should use real performed horn calls and human battle cries, with distinct charge/contact/alarm cues. Do not reuse the old wake-up bugle or introduce synthetic approximations. Continuous fighting must not periodically replay an entrance horn; preview controls should remain usable without waiting for gameplay cooldowns.

- Every new feature must run the Frontier UI audit in its affected states, including multi-selection, shortcut hit sizes and text containment on phone, iPad and desktop. Check both expanded/collapsed HUD and both languages; update docs with actual evidence.

- Product destination: a polished iPhone/iPad game for friends, progressing through actual device use, TestFlight and App Store distribution. Browser publication is not proof of a native build or store readiness.
- Reuse suitable existing art for resource cargo. Missing or unsuitable assets must be left absent and listed as gaps; do not ship improvised geometric cargo or invent replacement assets. Generate new assets only when explicitly requested. Resources sit inside the real basket and track its animation frame; do not add floating square markers to villagers.
- Building artwork must not gain floating rectangular team-color blocks. Use integrated existing flags/material colors and health/selection UI; retain stable rally markers.
- Every mobile unit/species needs distinct front, back, right and left source views, including cargo and work variants where silhouette changes. Keep heading, sprite, pick mask, healthbar and guardian muzzle aligned. Run check-directions.cjs and direction-preview.html for new types; preserve established multi-frame side animations and do not silently claim full four-direction animation sets.

- Attack-animation gate (V34): idle/direction wrappers must not replace active combat with standing sprites. Enumerate all mobile definitions and action variants in attack-manifest.json; run check-attack-actions.cjs and attack-preview.html using production script order. Verify four real preparation/release/follow/recovery frames in every direction, actual simulation strike/guardian/heal/launch cues, continuous recovery, complete long weapons/wings, transparent row AND column gutters, pixel picking and shared ground anchors. Noncombat units keep support roles; do not add attacks or alter balance just for animation.

## Performance requirements

- Preserve the current JavaScript/Canvas architecture unless repeatable device measurements show a platform limit. Profile first; do not migrate engines as a substitute for identifying a hot path.
- Keep diagnostics opt-in. Normal play must not run per-frame/per-entity timing wrappers, allocate profiling samples, or display the performance HUD. Single-player `debug` may enable diagnostics; disabling it must remove the HUD and restore uninstrumented hot methods. `?perf=1` remains an explicit profiling override.
- Navigation grids represent static terrain. Unit movement, collision separation, and temporary obstruction must not invalidate them; only terrain or static obstacle changes such as completed/destroyed buildings may do so.
- Cache unreachable and temporarily blocked path goals with a simulation-time retry delay (currently 1.8 s). A fresh order or changed goal cell may retry immediately. Keep this transient cache out of saves and clear entries when units die or reach their goals.
- Keep A* low-allocation: reuse map-sized scratch arrays and numeric heap storage, hoist neighbor offsets, use an admissible octile heuristic for 8-way movement, and avoid per-cell objects/arrays or front insertion during path reconstruction.
- Prewarm land and sea navigation data before active simulation/resume so the first unit command does not pay the full grid build cost.
- Profile update, render, pathfinding, collision, fog, minimap, visible/active entity counts, and both device/effective canvas DPR when diagnostics are enabled. Confirm findings on physical iPhone/iPad; desktop browser or Node measurements are not device evidence.
- After performance changes, run `node check-all.cjs` and `npm run build`; record device measurements, scenario, and remaining unverified work in `docs/performance-audit.md`.
