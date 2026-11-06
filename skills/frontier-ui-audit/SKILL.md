---
name: frontier-ui-audit
description: Check and fix Frontier Kingdom RTS interface layout, touch controls, text visibility, sprite proportions and picking across phone, tablet and desktop. Apply when changing this game's HUD, camera, art scale or input behavior.
---

# Frontier interface and scale audit

Use the project's AGENTS.md and [standing checks](references/frontier-checks.md) as persistent user requirements. Preserve the existing game and authorized task scope. This skill does not independently authorize publication, messages or access changes.

Before editing, identify which rendering layers and CSS overrides actually win. This game has multiple art wrappers: changing an early renderer or one preview can leave the real battlefield unchanged. Use the same script order for production and visual QA.

Validate the affected states with the supported browser/computer-use tool. Use read-only DOM evaluation for geometry diagnostics and real controls for interactions. Do not mutate game state through browser evaluation or use an alternate browser automation library. The optional [DOM probe](scripts/inspect-layout.js) is a read-only self-invoking expression: read its contents and pass that string to the browser's documented evaluate API. It reports candidates, not a complete pass/fail verdict. Run it after each relevant UI state/viewport change, and inspect screenshots to resolve intentional scrolling, details affordances and false positives.

For a UI/art/input change, cover phone portrait and landscape, iPad landscape and desktop, both languages, and expanded/collapsed commands. Sample other states from the reference according to the change; a sprite-only edit does not require replaying unrelated multiplayer flows. Check a narrow phone width when footer CSS changes. Reset temporary viewport overrides at the end.

For sprite scale, compare an ordinary person, loaded villager, tree, house and civic building at the SAME world scale. Also compare actual opaque-pixel bounds, selection outline, click target and healthbar. Native bitmap aspect ratio is invariant. Preserve wall joins, resource collision and economy balance unless the user requests changes to them. An icon fitting its card does not prove world scale is correct.

Fix observed failures, rerun affected checks, and keep a short dated report in docs/ with viewport/state/language, evidence, findings and unverified items. Do not report physical-device, audio, touch-gesture or full-game coverage that was not actually exercised. Save screenshots where the supported browser workflow requires proof.
