# Combat AI and action animation audit

## 2026-11-07

### Findings

- The base simulation already had automatic combat, but it rebuilt a unit/building array every 50 ms and scanned every candidate for each eligible unit. Its single 260-unit-distance cutoff selected only the nearest target, with no target lock or role priority. The loop also cleared `combatTarget` every tick, so targets could change whenever another candidate became slightly nearer.
- Explicit move, attack, gather, build, repair, hold, and advance behavior is processed in existing command branches. Workers return from the gather/build/repair branches before autonomous military targeting. These paths remain in place.
- The battlefield draw clears the full canvas before drawing each frame, and the action-art wrapper draws the action sprite once. The observed ghosting source is `attack-art.js`: it combined two different adjacent authored poses with Canvas `lighter` compositing. The source atlases contain the authored action frames and still do after this change.

### Changes

- Automatic acquisition now uses configurable `D[kind].acquisitionRadius` when present, with a bounded range-based default otherwise. Scan cadence is 0.35 simulated seconds; a reusable roster is refreshed every 0.3 seconds. A retained target is checked cheaply each tick and held until it dies, becomes invalid/unreachable, or exceeds a 1.55-radius pursuit leash.
- Candidate priority is military units, combat-capable buildings, then other attackable targets. Existing `canTarget` remains authoritative for diplomacy, unit roles, air defense and structure-only weapons. The current path-failure and blocked-engagement caches are respected so a known unreachable target does not prevent choosing another nearby target.
- Manual orders clear the automatic target lock. Automatic target state lives in a `WeakMap`, so it does not enter saves or network snapshots. Gathering, construction and repair continue to run before automatic targeting, so workers do not abandon those active jobs. Existing idle self-defense behavior remains available.
- Action playback now displays one authored frame at a time rather than additively superimposing consecutive frames. No atlas frames were removed; attack, gathering, building and guardian action mappings remain unchanged. Pixel-picking keys track the displayed frame.

### Validation

- `check-combat-ai.cjs` covers acquisition, target priority/retention, target death and reacquisition, explicit attack/move priority, worker gathering, and save compatibility.
- `check-attack-actions.cjs` and `check-attack-alpha.cjs` pass, retaining all existing combat/work action mappings and source atlases.
- The full project check and production build are being run for this change; final status is recorded in the delivery summary.
- Visual preview: Chromium in-app browser, localhost `attack-preview.html`, 508 × 771 CSS px. The default villager action was switched to four-direction continuous playback and then real simulated combat. After about eight seconds, all four headings reported eight strikes, visible frame changes and matching damage. The screenshot showed each pose as one sprite; target contact overlap is visible in some directions and is normal close-range positioning. This is a desktop browser preview, not a physical phone/tablet test.
- Physical iPhone/iPad session was not run. The exact animation cadence should still be checked on device, especially because discrete authored frames can look less blended than the prior ghosted interpolation.

### Remaining considerations

- Reachability is identified from existing failed-route/engagement caches after a route attempt rather than running extra A* searches during target selection; this avoids increasing AI cost. Units will switch away from a blocked target on the next acquisition scan.
- The range default can be tuned per unit by setting `acquisitionRadius` on its existing definition. No unit stats or combat damage were changed.
