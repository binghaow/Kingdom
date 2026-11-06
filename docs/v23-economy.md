# v23 — Physical economy and responsive command panel

Villagers collect into a visible load (12 base capacity) and deposit at a completed own Town Center or appropriate depot. Resource banks increase on delivery. Interrupted orders preserve the load; death loses it. Mills receive food; lumber camps receive wood; mining camps receive gold and stone; quarries also receive stone. Carrying capacity and loaded movement have separate mill technologies. Fishing remains on its existing economy path.

New maps cluster home and frontier resources and add two optional guarded mining plateaus, separate from the single KC fortress. Bears and jackals guard the entrances and chase within a leash. Defeating the camp opens its resources. Existing saves retain their map layout; delivery mechanics apply immediately.

The footer has bounded desktop, tablet, phone portrait and phone landscape layouts, retains its collapse control, scrolls production commands horizontally and shows per-kind production queue badges. Spawn positions use occupancy-aware staggered rows.

The computer uses six local strategy compositions, visible-enemy counters, resource-side depots and harassment/defense priorities. Allied chat parses color and relative location, uses actual attack markers, respects fog and may report insufficient troops. This is a deterministic local planner, not a language model or online learning system.

Validation: all check-all.cjs groups passed; check-economy.cjs covers delivery, cargo, capacity/speed technologies, interruption/no-depot behavior, separated spawns, both guarded camps on nine map types, KC isolation and allied color/location commands. All 22 tutorial simulations passed. Browser QA at 1280×720, 393×852, 852×393 and 1180×820 checked footer bounds and English/Chinese labels. Three real production clicks showed queue badge 3. The resource tutorial completed through an actual harvest/return/delivery cycle, increasing wood from 3000 to 3012. Physical iOS devices were not available for this verification.

## Wildlife artwork

Generated using the built-in ImageGen tool; atlas: public/assets/wildlife-v8.png. Runtime alpha cleanup and three action frames per species provide idle, melee and running silhouettes. Generation prompt:

> Production historical RTS animal sprite atlas, genuine transparent alpha background with all empty pixels alpha zero, EXACT 3 columns by 2 rows equal cells, generous transparent padding, no floor, no background, no scenery, no text. Detailed realistically prerendered painted 3D miniatures seen isometrically from above, warm natural light, natural animal anatomy and realistic fur, same camera and size within each row. All animals face RIGHT. TOP ROW: same large brown grizzly bear, heavy shoulders, rich dark brown fur, no armor. Top left calm idle standing on all four paws, head alert. Top middle aggressive close attack, bear rising half upright and swiping a massive forepaw toward RIGHT, jaws open showing teeth. Top right bear running forward RIGHT, legs in full stride, head lowered, believable weight. BOTTOM ROW: same lean golden jackal, tawny gold fur, dark back, pointed ears, bushy tail, clearly a jackal rather than a wolf or fox. Bottom left idle sentry standing on four paws, ears up, mouth closed. Bottom middle snarling bite lunge toward RIGHT, jaw open and front paws extended. Bottom right running/chasing RIGHT in full stride, alert ears, stretched athletic body. Creatures wholly inside each cell, precise distinct action silhouettes, all six animals fully visible, fully opaque fur interiors with clean alpha edges and genuinely fully transparent space between subjects. Premium Age-of-Empires-inspired natural wildlife art, not cartoon.

## Recorded audio

Brown bear recordings: U.S. Fish & Wildlife Service / AntumDeluge, CC0, https://opengameart.org/content/bear-growls . Jackal recording: Shajiarikkad, CC BY-SA 3.0, https://commons.wikimedia.org/wiki/File:Jackal.ogg . Original audio files are retained unchanged; runtime playback uses excerpts. The in-game help links public/audio/CREDITS.md with attribution and license details.
