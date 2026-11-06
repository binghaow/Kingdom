# v25 — Stable building selection and rally flags

2026-11-06. User reported that selecting a building made its flag flicker.

Root cause: interaction-art.js drew the default rally flag by calling Economy.exitPoint on every render frame. That query advanced building.spawnCursor and chose an occupancy-dependent position. A presentation-only operation was therefore mutating saved game state and rotating the displayed flag at the render frame rate.

Fix: spawnAnchor/defaultRallyPoint provide a fixed read-only flag anchor, exitPoint is a pure position query, and spawnCursor advances once in rallySpawn only for actual production. Actual spawns still search staggered unoccupied slots. Custom rally positions and reset retain their behavior. Old inflated cursor values remain readable and normalize on subsequent real spawns. The rally overlay is drawn after entities, before fog, so walking/new units do not hide the flag.

Validation: check-rally-preview.cjs invokes the actual drawRally renderer against campaign and NetworkSim, compares 600 consecutive frame draw paths and serialized state, checks ten separated spawns per available home producer, custom/reset behavior and old high-cursor saves. check-economy.cjs, check-tactics.cjs and all 16 check-network.cjs cases passed. The regression is included in check-all.cjs.

Browser QA: real Home/selection, default flag, manual rally placement, reset, and one completed villager production. Selected-building DOM geometry checked at nominal desktop 1280×720, phone 393×852 and 852×393, iPad 1180×820, Chinese/English and expanded/collapsed footer. No panel overflow errors; only known deliberate secondary description summaries were reported for review. Screenshots verified the default marker remains visible when a unit stands at its position. Viewport checks are not physical iOS-device tests.

Persistent frontier-ui-audit reference now includes frame-to-frame rally stability and the read-only rendering invariant. Site audience and saves retained.
