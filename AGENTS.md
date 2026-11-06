# Frontier Kingdom — persistent UI and scale requirements

For changes to HUD, responsive layout, touch input, selection, camera, sprites or entity scale, apply the project skill [frontier-ui-audit](skills/frontier-ui-audit/SKILL.md). Read its checklist before implementing and record actual validation in docs/. These are the user's standing preferences, not facts to reconstruct from chat history.

- Main battlefield remains central and spacious; keep bottom-command collapse/expand and the army / idle-worker / fleet shortcuts.
- Chinese and English labels, unit portraits, queue counts and resource costs must remain legible inside their panels on phone portrait/landscape, iPad landscape and desktop. Horizontal command scrolling is intentional; accidental clipping or overlapping controls is not.
- The villager building catalogue should favor larger detailed building pictures with slightly smaller readable captions. Keep full costs and descriptions accessible; do not revert to large fixed text rows that squeeze the artwork.
- Keep bitmap aspect ratio, full heads/feet in portraits, and world-camera uniform scale. Adjust tree/building proportions relative to a villager at the same zoom; never solve this by stretching one axis. Trees should visibly exceed human height; houses and civic buildings should look usable by people.
- Keep entity drawing, measurement, picking, outlines, placement and health bars consistent after art scale changes. A larger sprite must not gain a large invisible circular picking area. Do not silently change resource amounts, movement or combat balance to fix artwork.
- Villagers visibly carry logs or a back basket of stone/gold/food; the loaded posture and straps must connect the burden to the back. Preserve harvest/return/delivery semantics, smooth movement and correct facing.
- A browser viewport check is not a physical iPhone/iPad test. Report validation limits honestly. Maintain the existing Site identity and sharing audience.
- Combat audio should use real performed horn calls and human battle cries, with distinct charge/contact/alarm cues. Do not reuse the old wake-up bugle or introduce synthetic approximations. Continuous fighting must not periodically replay an entrance horn; preview controls should remain usable without waiting for gameplay cooldowns.

- Every new feature must run the Frontier UI audit in its affected states, including multi-selection, shortcut hit sizes and text containment on phone, iPad and desktop. Check both expanded/collapsed HUD and both languages; update docs with actual evidence.
