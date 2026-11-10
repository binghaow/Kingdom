# V37 animation and combat-effect upgrade

Scope: presentation only. No change to damage, cooldowns, resources, collision, saves or the network protocol. New code reads simulation fields and the cosmetic `effects` list and
keeps its own state (per-unit Map, pooled typed arrays); nothing is written back, `Math.random` appears only inside `combat-fx-v37.js` for visual jitter. The "one authored frame at a time" rule
(no additive ghosting) is kept; smoothness comes from timing, anchor-pivoted transforms and effects.

## What changed
| file | change |
|---|---|
| `attack-timing.js` | New V37 schedule (`api.legacy=false`): prepare frame fills the whole wind-up (<=0.38 s), release is the hit frame, follow/recover holds, recover is kept until the next wind-up if the next strike is close (no flick back to the standing sprite). `_attackPreview` path and `pair()` untouched. |
| `attack-art.js` | Poses sampled with a smooth clock `A.animClock = sim.time + acc` (set per frame in `expansion.js`) instead of the 20 Hz tick; `lead` passed so `cool` is interpolated. Picking mask keys use the same clock. |
| `animation-v37.js` (new) | Wraps `A.unit`: translate/rotate/scale about the feet, so still a single sprite. Lunge (melee), recoil (musket/cannon/bow), wind-up lean, hit flinch + knock-back + delayed flash at projectile arrival, 0.16 s turn squash on heading change, step bob/sway/lean synced to the existing gait phase, selection ripple. Idle units take the untouched fast path. |
| `combat-fx-v37.js` (new) | Pooled particles (600 hard cap, tiered) + projectile pool: flight time by distance, arrow with fletching, musket tracer + muzzle glow/smoke, cannon muzzle blast/ground kick, shell/grenade/boulder with smoke trail, impact by target (blade glint + steel sparks, dust ring + chips, stone/wood chips on buildings, explosion ring/fireball/smoke/debris), death fall (gravity, hop, bounce, long lie, late fade) + dust, building collapse dust/chips, ambient smoke on damaged buildings (hooked from `building-damage-art.js`), command lock-on ring. Damage numbers and splash explosions are delayed to the matching projectile arrival. Optional blood mist: `?blood=1` (off by default). |
| `unit-motion.js` | Foot-soldier stride 32->40 px, leg shear 3.6->5.2 px; mounted 50->58 px, 3->4.4 px (slip ~30 % -> ~20 %, cadence 2.1 -> 1.7 Hz). Villager stride unchanged (check-motion). |
| `expansion.js` | ~6 small hooks: clock + FX tick/observe at draw start, legacy `attack/impact/explosion` skipped when FX active, damage-text delay, death pose, command ring, ground/air FX passes (timed as `fx` in the perf HUD). |
| `index.html`, `sw.js` | two new scripts (+ offline cache). No asset added. |

## Switches
`?anim37=0` legacy timing/gait/no motion director. `?fx37=0` (or `off`) legacy effects. `?fx37=low|mid|high` tier (default high on desktop, mid on coarse pointers; also `localStorage fk-fx37`, `KingdomFX.setTier()`).
Tier caps: 150 / 320 / 600 particles, 48 / 96 / 160 projectiles; spawn counts scale with tier and an adaptive density that falls (down to 0.3) when the frame-time EMA exceeds 34 ms.
Particles are spawned only inside the camera rect + margin.

## Measurements (headless Chromium, software raster, 200 units 100v100, scene = `PerformanceAudit` scene median, ms; machine was shared with another agent's jobs, so +-15 % noise)
| scenario | original code | legacy switches (`anim37=0&fx37=0`) | V37 |
|---|---|---|---|
| desktop 1280x720 DPR1 | 33.4 / 38.7 | 40.3 / 36.5 | 38.6 |
| phone 393x852 DPR3 (capped 1.5) | 20.9 | 25.9 | 26.0 |
Conclusion: no measurable render-time regression in a 200-unit melee/ranged/cannon fight; p95 and frame interval are dominated by the headless compositor and are not reliable. Not a device measurement.
Screenshots with HUD: `docs/animation-v37/perf-*.jpg`.

## Evidence (before/after strips)
`docs/animation-v37/before|after/*.jpg`: inf_duel, archer_vs_inf, musket_vs_inf, cannon_vs_house, cav_charge, walk, turn, death, building_hit, building_collapse (after only: command_ring).
Reproduce: `S=<dir> node scripts/anim-lab/scen.cjs <tag>` (needs `node scripts/anim-lab/serve.cjs public 8791`, Playwright).

## Verification
`node check-all.cjs` (37 suites) passes after the change (output kept in the delivery notes). All determinism-relevant files untouched (`engine.js`, `empires.js`, ...).

## Known gaps
- Walking is still one sprite with leg-band shear plus bob; real gait improvement needs new art. `before/after walk.jpg` shows a modest change only.
- Cavalry charge, ships, aircraft and guardians get the generic director (lunge/recoil/turn) but no bespoke tuning; ships/air/siege machines skip bob.
- Hit-stop is implemented as the longer release-frame hold, not a global time freeze.
- Selection ripple and command ring are visually checked only by injected effects, not by real pointer interaction; touch input untested.
- Nothing verified on a physical iPhone/iPad or Safari (Safari lacks `ctx.filter`; the legacy flash filter still used by leaf renderers is a no-op there).
- Large-battle timing was measured on 200 units only; no 400+ stress test.
