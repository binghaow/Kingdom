# v18: recorded Foley and fortifications

The active page loads `natural-audio.js`; the historical synthesis modules remain only as legacy reference files and are not loaded by the game. Audio sources, licenses and exact mirrored filenames are in `public/audio/CREDITS.md` and `sources.json`. Short sound effects use bounded, lazy-decoded AudioBuffers (24 concurrent voices); the music is streamed through an HTML media element. Wind is cropped to a three-second buffer after decoding. User gestures resume Web Audio and start media playback, with iOS playback audio-session support. Safari 18.4 and newer support Ogg Vorbis on iOS/iPadOS: https://webkit.org/blog/16574/webkit-features-in-safari-18-4/ . Actual iPhone speaker output still requires device testing.

New maps multiply the original map definitions by 1.62, compared with 1.2 previously. Small coast: 7776 × 5568; large: 11616 × 8064. Approximately 35% longer sides and 82% more area than v17. Saved campaigns retain their old dimensions. A* parent indices now use Int32Array; the largest map exceeds 32,767 navigation cells. Terrain raster cache remains capped at 8.5 megapixels.

Wall construction checks the explored state of all sampled footprint points, rather than current visibility. It has no arbitrary camp, villager or KC-distance radius. Water, cliff, map-edge, resource trunk/deposit and actual building overlap remain invalid. Neighboring paid segments still queue builders and gates can replace matching walls. Allied proximity animates hinged gate leaves; hostile movement remains blocked by an intact gate.

Vertical walls and both gates project ground coordinates independently from height. Their art is code-native geometry, with mortar courses and hinged timber/iron leaves. Picking masks include a quantized gate-open state and adequate north/south sprite margins.

## Generated cliff asset

Built-in ImageGen tool, transparent_background=true. No CLI fallback. Output copied unchanged from the generated file to `public/assets/cliffs-v4.png`. Runtime splits the 2 × 2 atlas and uses layered natural-aspect silhouettes for longer ridges.

Exact prompt:

Professional historical RTS terrain sprite atlas, EXACT 2 columns x 2 rows equal square cells, four separate full cliff/escarpment formations on genuinely transparent alpha background. Natural believable cliffs, NOT rectangular blocks, NOT architecture, not floating islands. Isometric slightly top-down camera matching painterly realistic prerendered Age of Empires III-inspired scenery. Each formation has a rough grassy and mossy upper plateau, a dramatic exposed VERTICAL STRATIFIED LIMESTONE ROCK FACE with cracks ledges weathered overhangs, angular talus rubble and small shrubs at the base. Top left broad crescent-shaped cliff facing southeast; top right long narrow ravine wall with face towards southwest; bottom left tall jagged crag with grassy cap and steep front drop; bottom right curved rocky escarpment with stepped ledges and a narrow broken edge. Detailed natural stone texture, warm grey and earth colours, subtle sunlight from upper left, strong shaded vertical faces and realistic ground contact. Entire silhouettes contained within each cell with generous transparent margins. No text, no labels, no sea, no rectangular background, no grid lines. Cliff vertical height substantial and visibly separates high ground and low ground.

## Validation

Full existing game/network regression suite; recorded cue file signatures and no active oscillator modules; remote explored vs unknown wall sites; gate opening/closing; >32k-cell map pathfinding; local browser audio decoding and phone landscape layout. `field-preview.html` provides a user-facing sound sampler and animated wall/cliff gallery.
