# Aircraft carrier scale and balance update

Date: 2026-11-07

## Changes

- Replaced the rendered carrier with a dedicated transparent four-view atlas: bow, stern, starboard and port. The connected hull runs continuously from bow to stern, with a readable flight deck, island bridge, funnels and small biplanes.
- Set carrier art bounds to 500 × 320 world units, radius to 76 and speed to 34. It is now substantially larger and slower than the frigate (radius 28, speed 78). Selection, pixel picking and occlusion bounds use the new art measurement.
- Added a low wake while the carrier moves. The asset is included in the offline shell cache and the direction preview uses the production carrier renderer.
- Made carrier aircraft distinct light scout-bombers: one bomb, 34 damage, 115 HP, 175 speed, one population and a 34-second production time. The land bomber remains at two bombs, 88 damage, 185 HP and 225 speed.

## Validation

- `node check-campaign.cjs`: passed, including new flagship size/speed and carrier-aircraft balance assertions.
- `node check-directions.cjs`: passed for the existing four-direction manifest and RGBA atlases. The new carrier renderer also has four image panels; it overrides the manifest carrier art only in production and the direction preview.
- `node check-all.cjs`: passed all project groups after the campaign check was corrected and rerun.
- `npm run build`: passed.
- Opened the local game at `http://127.0.0.1:8765/`; the setup page and offline-ready state loaded. The in-match carrier was not visually exercised through production controls in this session. Physical iPhone/iPad views and touch picking remain unverified.

The image sheet was visually inspected at source resolution. No unrelated ship art, national models, economy values or combat roles were changed.

## Follow-up: carrier fighter balance and art refresh — 2026-11-09

- Raised carrier fighter base HP from 115 to 340, armor from the inherited low value to 7, and bomb damage from 34 to 96. Added one-time save migration that keeps existing aircraft's health percentage while applying the new maximum.
- Increased carrier capacity from two to four separately queued fighters, increased their production cost/time, and removed land bomber production from the aerodrome while preserving saved bomber units.
- Added visible deck-stored aircraft, staggered takeoff, return approach, landing, and carrier rearm states. Existing stored aircraft receive a safe initial state; carrier commands now reach aircraft while they are embarked.
- Switched the production carrier renderer and offline cache to the edited empty-deck asset `public/assets/carrier-v45.png`; this prevents painted static planes from conflicting with separately owned aircraft.
- Replaced the fixed Computer 1/2/3 map legend entries with actual active nation names.
- `node check-campaign.cjs` passed 15 campaign tests, including damage contrast, old-save health migration, deck launch, return landing and rearm.
- `node check-all.cjs` reported all functional suites passing before the carrier-state lifecycle was added; the final carrier changes were then verified with the campaign suite. A fresh all-suite run remains pending.
- `npm run build` was interrupted after the asset copy stage because the lossless PNG optimization did not return; dist output exists but a successful build completion is not confirmed. The build command should be rerun before release.
- Browser preview could not be opened through the supported UI tool, so the new carrier atlas has not been checked composited over production terrain. iPhone/iPad/desktop visual checks and physical device balancing remain unverified.

## Hull, deck and shoreline correction — 2026-11-10

- Kept the existing carrier art asset and aligned the hull drawing, selection ellipse, hit prefilter and carrier navigation checks around the simulation anchor. The ship bitmap is now centered on the ship's movement position, instead of drawing a hull-length sprite from its center as if that point were the bow.
- Separated the four owned fighters into deck slots. Takeoff and return landing now converge on those same slots; ordinary ship shoreline navigation remains unchanged while the carrier avoids shallow/coastal cells that cannot fit its larger hull.
- Added `carrier-layout.js` as the shared placement rule used by production art and the isolated carrier preview. Added regression coverage to `check-all.cjs`.
- `node check-all.cjs`: passed, including all 68 attack-action atlas alpha checks and the carrier layout/renderer/collision tests.
- `node scripts/build.cjs`: a fresh build was started after the full suite; completion is pending.
- Required visual sign-off completed on desktop through the current project HTTP preview at `http://127.0.0.1:8765/presentation-preview.html`. The preview uses the production renderer and current production script order. The screenshot showed the carrier fully over open water; the selection ellipse was centered on and contained the hull; all four fighters were on deck instead of in the water. Reviewer: primary implementation agent. No black matte or image stretching was visible in this view.
- The preview canvas also showed the surrounding coastline and adjacent water with the ship wholly on the water side. Carrier-specific pixel-mask, bounds, deck-slot, and shoreline-navigation checks passed.
- Physical iPhone/iPad checks remain unverified. The art source was reused without adding third-party assets or new licensing dependencies.
- Physical iPhone/iPad checks remain unverified. The art source was reused without adding third-party assets or new licensing dependencies.
