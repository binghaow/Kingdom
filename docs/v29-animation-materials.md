# V29 · Animation and material pass · 2026-11-06

## Shipped changes
- One consistent farmer identity/outfit across 64 cells: eight frames each for idle, walking, mining, chopping, food gathering, melee, hurt and loaded walking. Source cells use stable full-body scale and ground anchors; resource cargo stays attached to the back basket. Existing distance-driven motion interpolation drives walking.
- Eight combat frames each for the basic pikeman, archer, mounted knight and musketeer. The infantry row was corrected from a sword to its actual pike. Existing national overlays, team livery, action sounds and damage values remain.
- Six walk frames and six charge/fire-casting frames each for KC dragon and demon. Frame-aware mouth / casting-hand origin, including left-facing mirror. Existing melee pose remains with its lunge; no claim that every national hero or every unit now has an eight-frame atlas.
- New detailed siege equipment: counterweight trebuchet, engineering wagon, cannon and mortar. Two mechanical states per machine, no whole-chassis fade ghosting. Original wood, rope and metal painting includes Japanese-style equipment detail and team-colored cloth.
- Six tree variants, bark/leaf detail, restrained wind, smoother grass material mixing, more cached ground tufts and visible-camera grass blades in three draw batches. Grass cache capped at6000 entries; tint frames capped128; ship trails capped180.
- Ships leave short world-space wakes that follow actual travelled positions and dissipate; no painted persistent tracks. Arrows, musket tracers, shells and thrown rocks receive distinct ballistic presentation; gunpowder muzzle flash uses the licensed flame atlas and dissipating smoke strokes. Hero spell success records a short casting gesture. Gameplay damage and gathering rates are unchanged.
- Current bridges are low bridges: all ships, including small fishing boats, are excluded with hull clearance. Infantry still crosses; aircraft ignores bridge obstacles. A* navigation, stale immediate paths and legacy ships saved on a bridge are handled.
- Phone header now fits real five-digit resource amounts without pushing Help outside the viewport.

## Actual validation
- check-all.cjs: prior25 groups passed, then targeted new check-v29.cjs7 groups passed; final suite contains26 groups and passed. Includes four coast/river map sizes, all ship classes, ground/air bridge rules, path segment sampling,600 stale-path movement steps, save migration, eight-frame timing, unchanged orders/cargo and hero cast cooldown.
- Existing campaign, naval, multiplayer, economy, rally, tutorial, recorded-audio and localization suites passed. Worker build and artifact validation run before packaging.
- presentation-preview.html: all30 pixel/proportion probes passed after1px foliage wind tolerance. Trees181/183px vs human85px; house124px and town251px at the same world scale.
- detail-preview.html production-wrapper pixel tests: infantry77px idle /76px attack, archer77/77, cavalry94/92, musketeer77/77. Frozen input entities remained unchanged. This caught and fixed a width-driven attack-sprite shrink. Disconnected neighboring-cell fragments were filtered at atlas load.
- Visual scenes inspected for all8 farmer actions, all4 basic combat roles, both guardian facings and fire origins,6 trees,4 loads and4 siege machines. Transparent cell corners checked from alpha metadata; browser compositing verified no opaque backdrop.
- Real gameplay:7 selected villagers accepted a right-click move command and used the new sprites. Fleet shortcut tested in empty-fleet state.
-40 final UI probes: Chinese/English;394×852,852×394,360×780,1180×820,1280×720; army3 /worker7; expanded and collapsed. No final probe findings. See v29-layout-matrix.json.
- Evidence in artifact directory: v29-actors.png, v29-trees.png, v29-combat.png and v29-game-phone.png.

## Limits and assets
Browser viewports and desktop visual checks are not physical iPhone/iPad touch, speaker or sustained large-battle performance tests. Six-frame guarding movement and basic combat sequences do not constitute full3D skeletal animation or a remake of a commercial game's assets.

Built-in ImageGen was used for five original atlases and transparent extraction / pikeman correction edits. Final assets are in public/assets/: villager-actions-v29.png, siege-equipment-v29.png, guardian-actions-v29.png, trees-v29.png, troop-actions-v29.png. Full prompts and correction briefs: v29-art-prompts.md. Generated originals were retained.
