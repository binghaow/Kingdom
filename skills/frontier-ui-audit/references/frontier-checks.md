# Standing checks for Frontier Kingdom

## Device matrix

Use CSS viewport sizes as repeatable layout probes, not claims about physical device specs: phone 393×852 portrait and 852×393 landscape; narrow phone 360×780 for HUD changes; iPad 1180×820 landscape; desktop 1280×720 (larger desktops when relevant). Test Chinese and English, expanded and collapsed footer. Keep browser default size outside explicit responsive testing.

## Interface and operation

- Footer: selected-unit title, description/status, health, basic stats and Details remain within their area. Long descriptions may be intentionally shortened only if the full information is accessible through a visible Details action; essential costs, labels and queue counts must not disappear behind another control.
- Production: portrait head and feet are intact; images use contain with intrinsic aspect ratio. Queue repeated units three times and observe 1 → 2 → 3, then a decrement when one completes. Confirm the badge does not cover the essential icon/name and does not intercept production clicks.
- Commands: labels, cost and inspect button have distinct space. Build tabs, action title, scroll arrows and command cards do not overlap. Horizontal overflow is scrollable and has an obvious affordance; no vertical text spill.
- Army/idle-worker/fleet shortcuts: all three remain on screen and inside the footer when expanded/collapsed. Select the expected units rather than only checking button visibility.
- Battlefield: resizing and orientation changes preserve uniform world scale and sufficient usable central view. Header, minimap, map tools, touch toolbar, placement confirmation, groups, chat and tutorial panel must not accidentally cover one another's controls or critical confirmation/error text.
- Actual commands: select → move / retreat → resource gather → build/confirm/cancel; production and rally points. Exercise affected controls with real UI actions and verify the visible result. Check that scrolling commands does not pan the world and closing a panel restores input. Use physical touch only if available; do not describe mouse simulation as a verified pinch gesture.
- Selected production buildings: default/custom rally flags stay at one position while frames render, nearby units move and new units spawn. Rendering must never reserve a spawn slot or modify simulation/save state. The regression check is check-rally-preview.cjs; it exercises the real drawRally function against campaign and network simulations.
- Settings/dialogs: buttons align, text fits and the close/resume action is reachable in both orientations. Active modal content must be scrollable when longer than the viewport.

## Image and world scale

The project includes public/presentation-preview.html and presentation-preview.js: an isolated same-scale scene using the production art wrappers, without reading/writing battle saves. Open it through the local preview server. Its visible controls change nation, era, direction and outlines; “检查比例与拾取” compares opaque pixels with actual pick masks for trees, buildings and all four resources in rest/walk/harvest poses and both directions. Use this alongside the real battlefield, not as a substitute for gameplay.

- Inspect a same-zoom group: ordinary villager, loaded villager, pine/oak, house, barracks and Town Center. Standing trees exceed ordinary person height; houses/buildings read as structures people can enter; major civic/fortress buildings stay larger than houses. Preserve the user's modest stylization rather than imposing real-world dimensions.
- Repeated scaling wrappers are a known regression source: interaction-art.js used .63 on trees and war-art.js added another .72. Use a single tree sizing policy and make the visual QA page load the production wrappers.
- Both bitmap axes use the same scale. No squashed ships, aircraft, vertical gates or portraits. Tree/house masks exclude transparent corners. Health bars sit above heads/roofs and outlines follow opaque pixels. A mask cache must include visual pose/state when those states materially change the silhouette.
- Loaded villagers carry actual back-mounted logs/baskets with shoulder straps and a forward-weight posture. Stone, gold and food/meat must be visually distinct. Face the travel direction while returning. Keep step motion smooth and remove the burden when cargo is delivered or lost.
- Changing art size must not silently enlarge simulation collision, modify resource counts, alter wall segment spacing or erase saves. Existing and new battles both need the intended visual result.

## Reporting

Write what was actually tested: viewport, language, UI state, steps/result, screenshot path and remaining limitations. Mark unavailable physical-device/audio testing as unverified. Distinguish a diagnostic candidate from a confirmed bug. The DOM probe cannot inspect canvas art or prove behavior; use the same-scale scene and actual gameplay for those.
