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
