# V28 · 2026-11-06

Own villagers behind foreground wood sprites now receive a pale silhouette and opaque-pixel outline, drawn before fog. Unit pixel hits take priority over resource sprites, including friendly companions and neutral guardians. The isolated regression-v28.html uses production art wrappers and no campaign storage; a real click on the tree-hidden worker returned PASS.

KC fire uses unchanged Soluna Software Fire01 CC0 atlas, 32 frames / 8×4, sourced from https://opengameart.org/content/lots-of-game-effects . Dragon muzzle anchor lowered from nose to open mouth; demon uses the casting-hand anchor and a warmer infernal tint. Bubble particles removed. Right-facing visuals inspected; mirrored anchor uses the same sprite transform.

Attack reach accounts for ship/guardian footprint and melee attacker size. Engagement path goals are reachable grid centers within weapon reach, respecting minimum range and melee terrain. Ground units do not walk to the inaccessible center of a ship/building. No melee damage through blocked terrain, and melee still cannot target aircraft. Unreachable selected attackers show a reposition message. Units cannot cross disconnected water/cliffs simply to make attacks succeed.

The complete network-model export chain was exercised: both companions retain >700 attack and damage infantry, ships and both KC guardians; the symptom could not be reproduced as missing stats. Fixed frontmost-resource interception and ocean movement rejection for airborne companions, rather than inventing a damage nerf/buff.

Chat debug or 调试 toggles single-player-only unlimited resources and one-second own training, age/tech research and construction. Carrier queues included. Existing unlock/population/placement requirements remain. Toggles restore pre-debug resources; network constructors remove debug state and imported fast queue timings.

Every active building (42 definitions) has an explicit physical recording recipe. New PCM16 mono clips: horse neigh (DenisChardonnet/BSB0284), indoor crowd (Joseph SARDIN/BSB3515), blacksmith anvil (Pablo BERGEL/BSB3589), performed chant (nemaavla/Freesound344683), all CC0; originals at original pitch/speed. Full sources and transformations in public/audio/CREDITS.md, sources.json and scripts/prepare-building-audio.py. These are recordings and performed fantasy ambience, not extracted game/film soundtracks.

UI: explicit shortcut grid columns and 88px minimum widths; compact portrait uses a full-width horizontal row. Actual shortcuts measured 150×40 CSS px in iPad landscape; phone portrait expanded 122×38. Browser probes cover Chinese/English, multi-army (3) and multi-idle-worker (7), expanded/collapsed, 394×852, 852×394, 360×780, 1180×820, 1280×720. Final matrices in v28-layout-matrix.json show no probe findings. English move/advance/worker text shortened after detecting clipping. Fleet shortcut tested in empty-fleet state; an occupied fleet was not visually exercised in this pass.

Project and installed frontier-ui-audit skill updated with mandatory new-feature state checks, button geometry and tree occlusion. Probe flags primary shortcuts narrower than88px or shorter than32px.

Validation: check-all.cjs passed all25 groups including new six regression scenarios; targeted check-siege, check-locales, check-battle-audio and check-v28 passed. Worker build/artifact checks passed. Screenshots: v28-phone-zh.png and v28-fire-ghost.png in the artifact directory. Viewport checks are browser-based, not physical iPhone/iPad touch or speaker listening tests.
