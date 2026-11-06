# v24 — Persistent interface audit and carrying artwork

2026-11-06. Existing Site identity/audience retained; changes apply to existing saves.

## Persistent requirements

The user asked for a reusable Skill so layout, visibility, input and scale requirements survive a long chat. The canonical skill is skills/frontier-ui-audit/SKILL.md, installed as frontier-ui-audit in the user's Codex skill directory. Root workspace AGENTS.md routes to the repository's AGENTS.md, which requires this skill for relevant game UI/art/input changes. The skill contains a read-only DOM geometry probe, scoped device/state checks and an explicit requirement to distinguish browser viewport testing from physical device testing.

## Art changes

- Removed the old double tree shrink. One tree policy now draws pine/oak at preserved intrinsic aspect ratio. At the isolated scene's same scale: person 76, pine 141, oak 179 opaque pixels tall.
- Uniform building scale: house +25%, Town Center +20%, most functional buildings +16%, farm +12%. Wall/gate sizes and all simulation collision/resource/economy values remain unchanged.
- New back-mounted log and stone/gold/food-basket sprites, with straps and a weight-bearing posture. Rest and walking artwork reuse the existing gait, livery and selection pipeline. Gathering retains the tool animation with a basket/log bundle rendered behind the body. Delivering removes the load through existing cargo state.
- Picking extents follow new tree measures; mask cache distinguishes resource and loaded pose. Both transparent corners and opaque targets were checked.

## Confirmed UI fixes found by the new audit

1. Collapsed portrait shortcuts squeezed English labels into three narrow columns: now use three readable rows; short landscape retains three wide columns.
2. Legacy absolutely positioned build tabs covered the command title: title, tabs and action cards now occupy distinct grid rows.
3. Horizontal scrollbar plus fixed minimum tracks clipped production costs on tablet/desktop: hide the redundant scrollbar (retain swipe and visible paging arrows) and fit icon/name/cost tracks inside the card.
4. Narrow 360px English mixed-selection title was truncated: a targeted 10px title rule preserves its count. Long secondary descriptions deliberately remain summaries with Details available.

## Validation actually performed

- Built-in browser viewport checks at nominal 393×852 / 852×393, narrow 360×780, iPad 1180×820 and desktop 1280×720. Browser pixel rounding sometimes reported 394 in place of 393.
- Chinese and English, expanded/collapsed worker commands and Town Center production; geometry findings resolved using screenshots. Intentional secondary description truncation is still reported as a review candidate, not falsely called fully visible.
- Real production button clicks produced queue badges 1, 2, 3; subsequent production completed and cleared the queue. Real idle-worker selection and Home/Town selection were used. Pause/language/resume controls were exercised.
- Same-scale art scene: 30 checks passed (tree/person/building hierarchy plus tree/building opaque picking and 24 combinations of resource, direction and rest/walk/harvest). British era III and Chinese era V were sampled; not every nation/era combination was visually reviewed.
- check-motion.cjs, check-fortification.cjs, check-tactics.cjs and check-economy.cjs passed. Final build and check-artifact.cjs validate the publication bundle.
- No physical iPhone/iPad, live touch pinch, audio or full match/end-state retest is claimed for this art/UI update.

Evidence: frontier-v24-scale.png and frontier-v24-ui-audit.json in the session artifact directory. The JSON retains intermediate diagnostic findings as well as corrected runs; it is not an all-zero historical log.

## Generated asset and prompt

Built-in ImageGen mode, not CLI. Copied into public/assets/villager-carry-v9.png; original alpha preserved in the file, runtime thresholding clears low-alpha fringes during atlas slicing.

Use case: historical-scene. Production historical isometric RTS transparent sprite sheet, exactly 4 columns by 2 rows, eight isolated full-body medieval male villager miniatures, consistent same man and proportions, same 3/4 side-view camera from above, all face RIGHT, head on right and BACK on LEFT. Realistic detailed prerendered painted 3D game art, warm natural light, coarse blue tunic, brown trousers and leather boots, neutral plain cap. NO weapons, no tools in hands, no text, no ground, no cast floor shadows, no background; genuine fully transparent alpha empty space. Each sprite wholly within equal grid cell, generous transparent padding, feet aligned at same relative baseline. TOP ROW 4 loaded standing poses: man leans forward modestly under weight, knees slightly bent, shoulders engaged, hands naturally gripping shoulder straps near chest; backpacks attached securely to his BACK (screen LEFT), NOT handheld in front. Column 1: three substantial rough cut firewood logs tied vertically on his back with leather rope, visible pale wood ends. Column 2: deep woven wicker back basket full of angular gray rocks. Column 3: matching woven wicker back basket filled with irregular bright natural gold ore chunks. Column 4: matching woven wicker back basket containing red meat on white bone, green vegetables and golden grain. BOTTOM ROW same four loaded villagers respectively, same cargo and shoulder harness, WALKING carrying pose with one foot forward and one behind, slightly forward leaning torso, one hand steadying strap, carrying the burden on the back. Important shoulders, anatomically correct arms and legs; load rises from waist to shoulder, not obscuring head. Baskets have finely woven wicker texture, rounded deep volume, leather shoulder straps clearly wrapping over shoulders, convincing burden and weight. Make the carried resources large and legible at small game scale without making basket larger than the man's torso. Match premium historical RTS character rendering, not cartoon. All eight sprites fully visible, exact 4x2 arrangement, equal scale, true transparent background.
