# Placement confirmation placement

Date: 2026-11-07

## Change

- Building placement now pauses at the preview and shows the existing confirm/cancel controls beside the clicked map position on desktop and touch layouts.
- The prompt measures its own size, prefers the upper-right side of the clicked point, flips sides near viewport edges, and clamps inside the battlefield. Wall-line previews use the drag endpoint as their anchor.
- Confirm, cancel, placement validation, costs, and construction simulation remain on the existing APIs.

## Validation

- `node check-all.cjs` passed; `npm run build`, `node --check public/expansion.js`, `node --check public/naval-controls.js`, and `git diff --check` passed.
- Opened the local preview at `http://127.0.0.1:8765/`; the setup screen loaded. The supported Windows browser interaction session timed out before gameplay clicks, so the confirm button's rendered position and confirm/cancel clicks were not visually verified.
- Phone portrait/landscape, iPad landscape, desktop placement, English UI, and collapsed HUD placement remain unverified in this pass.
