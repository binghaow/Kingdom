# Functional building art update

Date: 2026-11-07

## Changes

- Added a dedicated transparent atlas for the food mill, mining camp and French Royal Riding Academy, each with a refined later-era counterpart.
- The mill silhouette now combines grain storage with a large working wheel. The mining camp has a hoist, ore sorting shed, carts and visible mineral heaps. The French academy has a formal royal stable, riding yard, horses and fleur-de-lis heraldry.
- Kept economy and training behavior unchanged. Existing footprint, placement radius, health, costs and role remain intact. Later visual era selects the refined art sheet. The mill and mining depot are shared visuals; the academy is French-specific with a fleur-de-lis crest.
- Updated the academy's Chinese name and descriptions for all three buildings so the role is explicit in their information panels.
- Added the atlas to the offline cache.

## Validation

- Asset source visually inspected at 1536 × 1024; it contains six matching-era building views in a 3 × 2 layout. An edge-connected matte removal was applied and the output PNG retains transparency at the image bounds. The alpha edge still needs in-game visual review.
- Production renderer uses the existing architecture and picking layers; no simulation radii or economy values were changed.
- `node check-all.cjs`, `node check-directions.cjs`, `node check-locales.cjs`, `npm run build`, JavaScript syntax checks and `git diff --check` passed.
- A temporary local model preview loaded as a blank canvas in the browser, so rendered model proportions, selection outlines and icons were not visually verified in the runtime. The temporary page was removed.
- Desktop/tablet/phone in-game screenshots, touch selection, team color and icon behavior have not yet been physically validated in this pass.
