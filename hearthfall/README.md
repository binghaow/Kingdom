# Hearthfall (RTS prototype)

Modular single-page Canvas RTS prototype, built as a reference for the next-generation Kingdom engine.
Not a replacement of the existing game in `public/`; nothing outside this folder was changed.

## Layout
- `src/p2_data.js` data, state, events bus (`emit`)  ·  `p3_logic.js` simulation, pathfinding, combat, economy
- `src/p4_ai.js` computer opponent  ·  `p5_render.js` terrain/sprite rendering  ·  `p7_fx.js` audio + effects
- `src/p8_sys.js` command queue, save/load, state hash  ·  `p6_ui.js` input and panels  ·  `p1_head.html` page shell
- `build.sh` concatenates the modules into `dist/game.html`
- `tests/` Playwright checks (AI vs AI, player actions, determinism, touch, device layouts). Run with `GAME=<path to html> node tests/test.js`
- `docs/REPORT.md` independent performance and multiplayer review, `docs/bench.js` repeatable benchmark

## Status
Simulation is seeded and command-driven (same seed + commands gives the same state hash), which is the base for lockstep multiplayer.
Multiplayer networking, the stronger strategic AI and procedural maps are not implemented yet.
Performance figures come from a headless software-rendered browser, not from real iPhone or iPad hardware.
