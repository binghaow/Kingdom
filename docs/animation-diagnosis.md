# Animation / combat-effect diagnosis (pre-V37 code, main @ start of this task)

Method: Playwright + headless Chromium against the production script order, scenes spawned into the real game (`scripts/anim-lab/*`, run with `S=<outdir>`),
frame-exact strips sampled from the world canvas, plus Node timing replay of `attack-timing.js`. Evidence: `docs/animation-v37/before/*.jpg`
(each cell is a render frame sampled every 70-100 ms, label = simulation time). Desktop headless only; nothing here was run on a physical iPhone/iPad.

## Top findings

1. **Animation clock ticks at 20 Hz.** Attack poses were sampled with `sim.state.time`, which only advances every 50 ms, so every pose change lands on a tick boundary
   (60 fps frames show 3-3-4 repeats, `out/framelog`). Hold lengths of 0.09-0.14 s (prepare, standing flick) are only 2 ticks long.
2. **Authored frames are stretched into a slideshow and interleaved with a different sprite.** One 4-frame cycle spans up to 1.35 s. Real per-cycle sequence (infantry, cooldown 0.95 s):
   `release 0.18s -> follow 0.34s -> recover 0.18s -> STANDING sprite 0.08s -> prepare 0.09s`; musketeer holds `follow` for 0.65 s; cannon/mortar/trebuchet/dragon show the
   standing sprite 60-76 % of the time (`baseArtShare` in the table below). The standing sprite is a different render path (direction-art / painted-troops) so pose, weapon position and
   silhouette pop at every swing. The prepare frame only appears in the last ~0.1-0.14 s before the strike and the release frame is shown ~0.09 s before damage (wind-up second half).
3. **Impact feedback fires at release, not at arrival.** Damage, hit flash, damage number and the `impact` spark are all created in the same tick as the strike, while the arrow/bullet/shell
   is drawn flying for another ~0.29 s (`p*1.7` over a 0.5 s fx). Target reacts before the projectile arrives. There is no recoil/flinch at all, only a `brightness(1.6)` filter pulse.
4. **Walking is a rigid sprite with a tiny leg shear.** Limb shear is +-3.6 px (infantry) at a 32 px stride => 2.1 leg cycles/s at 68 px/s (about twice a human cadence), and foot slip during
   stance is still ~30 %. No body bob/sway/lean, so units "glide". Direction changes are an instant swap among 4 views (no turn transition). See `before/walk.jpg`, `before/turn.jpg`.
5. **Effects are thin line art.** Melee hit = a flat cream arc + radial dashes; musket flash = 8-point star; no muzzle smoke persistence worth noting, no dust, no debris; building hits only
   spark; death = a rigid 0.1 s snap to 77 deg then fade; command click = two plain ellipses. Collapse had slices + a static debris decal but no dust cloud.

Also noted: `ctx.filter='brightness(1.6)'` is used for flash in the leaf renderers (slow path in Canvas2D, unsupported on older Safari), the first strike of any engagement has no
prepare frame (cooldown is 0 when contact starts - simulation behaviour, deliberately not changed).

## Frame schedule table (Node replay, one cooldown cycle; transitions `frame@seconds`, `B` = standing sprite)

| kind | cooldown | before | baseArtShare before | after (V37) | baseArtShare after |
|---|---|---|---|---|---|
| infantry | 0.95 | 0@1 0.18@2 0.52@3 0.70@B 0.78@0 0.87@1 | 8 % | 0@1 0.15@2 0.43@3 0.70@0 | 0 % |
| archer | 1.15 | 0@1 0.22@2 0.63@3 0.83@B 0.95@0 1.05@1 | 10 % | 0@1 0.17@2 0.52@3 0.83@0 | 0 % |
| cavalry | 1.05 | ... 0.77@B 0.87@0 | 10 % | 0@1 0.17@2 0.48@3 0.77@0 | 0 % |
| musketeer | 1.8 | 0@1 0.33@2 0.98@3 1.30@B 1.53@0 1.67@1 | 13 % | 0@1 0.27@2 0.82@3 1.43@0 | 0 % |
| cannon | 4.0 | 0@1 0.35@2 1.02@3 1.35@B 3.73@0 | 60 % | 0@1 0.28@2 0.85@3 1.35@B 3.63@0 | 57 % (idle between long reloads is intended) |

Sprite anchor check (`scripts/anim-lab/pop.cjs`): feet anchor identical for idle vs all 4 attack frames (12/15/19 px), so the "pop" is silhouette/pose, not ground drift; cannon (side view) drops from 145 px to 129 px tall between standing and attack art (11 % scale step).

## Not a cause
Four-direction anchors, atlas gutters/alpha and picking are fine (V34 checks); damage/cooldown values are not touched by any of this.
