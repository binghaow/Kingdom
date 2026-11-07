# V34 four-direction action assets

Generated with the built-in image generation tool from the existing V33 reference atlases. Original transparent PNG files are retained in public/assets. No external game art was copied.

68 atlases; each has front/back/right/left rows and preparation/release/follow-through/recovery columns, 1088 authored keyframes in total. Primary action coverage: 62 mobile definitions, including 53 offensive units and 9 support/transport roles. Additional variants: two guardian breath/casting sets and four villager work sets.

Combined PNG bytes: 128856097. Decoded runtime action cache is capped at 80 MiB plus a maximum of 96 small team-tint frames; no more than two atlas decodes run concurrently. Existing engine/terrain/audio memory is additional. Browser-managed download/cache storage is additional.

Four cutouts were regenerated after visual and alpha review; the matching -alpha-edit.txt files record those edits. Exact per-job prompts are retained in docs/v34-prompts/. Reference row numbering is zero-based. Renderer follows transparent horizontal/vertical gutters, preserves source proportions and shared anchors, and removes only small disconnected seam-edge fragments.

| ID | Source | Reference row |
|---|---|---|
| villager | assets/attack-villager-v34.png | assets/directions-civilians-v33.png / 1 |
| infantry | assets/attack-infantry-v34.png | assets/directions-core-v33.png / 1 |
| archer | assets/attack-archer-v34.png | assets/directions-core-v33.png / 2 |
| cavalry | assets/attack-cavalry-v34.png | assets/directions-core-v33.png / 3 |
| musketeer | assets/attack-musketeer-v34.png | assets/directions-core-v33.png / 4 |
| grenadier | assets/attack-grenadier-v34.png | assets/directions-line-v33.png / 1 |
| cannon | assets/attack-cannon-v34.png | assets/directions-artillery-v33.png / 1 |
| healer | assets/attack-healer-v34.png | assets/directions-civilians-v33.png / 3 |
| halberd | assets/attack-halberd-v34.png | assets/directions-line-v33.png / 2 |
| skirmisher | assets/attack-skirmisher-v34.png | assets/directions-line-v33.png / 3 |
| hussar | assets/attack-hussar-v34.png | assets/directions-line-v33.png / 4 |
| mortar | assets/attack-mortar-v34.png | assets/directions-artillery-v33.png / 2 |
| longbow | assets/attack-longbow-v34.png | assets/directions-nationalA-v33.png / 1 |
| cuirassier | assets/attack-cuirassier-v34.png | assets/directions-nationalA-v33.png / 2 |
| repeater | assets/attack-repeater-v34.png | assets/directions-nationalA-v33.png / 3 |
| fishingboat | assets/attack-fishingboat-v34.png | assets/directions-navalA-v33.png / 1 |
| sloop | assets/attack-sloop-v34.png | assets/directions-navalA-v33.png / 2 |
| frigate | assets/attack-frigate-v34.png | assets/directions-navalA-v33.png / 3 |
| bombketch | assets/attack-bombketch-v34.png | assets/directions-navalA-v33.png / 4 |
| transport | assets/attack-transport-v34.png | assets/directions-navalAir-v33.png / 1 |
| trader | assets/attack-trader-v34.png | assets/directions-civilians-v33.png / 4 |
| samurai | assets/attack-samurai-v34.png | assets/directions-nationalA-v33.png / 4 |
| janissary | assets/attack-janissary-v34.png | assets/directions-nationalB-v33.png / 1 |
| streltsy | assets/attack-streltsy-v34.png | assets/directions-nationalB-v33.png / 2 |
| prussianguard | assets/attack-prussianguard-v34.png | assets/directions-nationalB-v33.png / 3 |
| tercio | assets/attack-tercio-v34.png | assets/directions-nationalB-v33.png / 4 |
| nassau | assets/attack-nassau-v34.png | assets/directions-nationalC-v33.png / 1 |
| continental | assets/attack-continental-v34.png | assets/directions-nationalC-v33.png / 2 |
| eliteguard | assets/attack-eliteguard-v34.png | assets/directions-advanced-v33.png / 1 |
| dragoon | assets/attack-dragoon-v34.png | assets/directions-advanced-v33.png / 2 |
| engineer | assets/attack-engineer-v34.png | assets/directions-civilians-v33.png / 2 |
| howitzer | assets/attack-howitzer-v34.png | assets/directions-artillery-v33.png / 3 |
| hero_britain | assets/attack-hero_britain-v34.png | assets/directions-heroesA-v33.png / 1 |
| hero_france | assets/attack-hero_france-v34.png | assets/directions-heroesA-v33.png / 2 |
| hero_china | assets/attack-hero_china-v34.png | assets/directions-heroesA-v33.png / 3 |
| hero_japan | assets/attack-hero_japan-v34.png | assets/directions-heroesA-v33.png / 4 |
| hero_ottoman | assets/attack-hero_ottoman-v34.png | assets/directions-heroesB-v33.png / 1 |
| hero_russia | assets/attack-hero_russia-v34.png | assets/directions-heroesB-v33.png / 2 |
| hero_prussia | assets/attack-hero_prussia-v34.png | assets/directions-heroesB-v33.png / 3 |
| hero_spain | assets/attack-hero_spain-v34.png | assets/directions-heroesB-v33.png / 4 |
| hero_netherlands | assets/attack-hero_netherlands-v34.png | assets/directions-heroesC-v33.png / 1 |
| hero_usa | assets/attack-hero_usa-v34.png | assets/directions-heroesC-v33.png / 2 |
| kcdragon | assets/attack-kcdragon-v34.png | assets/directions-special-v33.png / 3 |
| kcdemon | assets/attack-kcdemon-v34.png | assets/directions-special-v33.png / 4 |
| steamcrawler | assets/attack-steamcrawler-v34.png | assets/directions-engineering-v33.png / 3 |
| fieldmortar | assets/attack-fieldmortar-v34.png | assets/directions-artillery-v33.png / 4 |
| rifleguard | assets/attack-rifleguard-v34.png | assets/directions-advanced-v33.png / 3 |
| combatmedic | assets/attack-combatmedic-v34.png | assets/directions-advanced-v33.png / 4 |
| trebuchet | assets/attack-trebuchet-v34.png | assets/directions-engineering-v33.png / 1 |
| siegewagon | assets/attack-siegewagon-v34.png | assets/directions-engineering-v33.png / 2 |
| scoutballoon | assets/attack-scoutballoon-v34.png | assets/directions-navalAir-v33.png / 3 |
| airtransport | assets/attack-airtransport-v34.png | assets/directions-navalAir-v33.png / 4 |
| gunship | assets/attack-gunship-v34.png | assets/directions-engineering-v33.png / 4 |
| runesentinel | assets/attack-runesentinel-v34.png | assets/directions-nationalC-v33.png / 3 |
| emberthrower | assets/attack-emberthrower-v34.png | assets/directions-nationalC-v33.png / 4 |
| tangdou | assets/attack-tangdou-v34.png | assets/directions-heroesC-v33.png / 3 |
| tuantuan | assets/attack-tuantuan-v34.png | assets/directions-heroesC-v33.png / 4 |
| bomber | assets/attack-bomber-v34.png | assets/directions-special-v33.png / 1 |
| carrier | assets/attack-carrier-v34.png | assets/directions-navalAir-v33.png / 2 |
| airwing | assets/attack-airwing-v34.png | assets/directions-special-v33.png / 2 |
| bear | assets/attack-bear-v34.png | assets/directions-animals-v33.png / 1 |
| jackal | assets/attack-jackal-v34.png | assets/directions-animals-v33.png / 2 |
| kcdragon_breath | assets/attack-kcdragon-breath-v34.png | assets/directions-special-v33.png / 3 |
| kcdemon_breath | assets/attack-kcdemon-breath-v34.png | assets/directions-special-v33.png / 4 |
| villager_mine | assets/attack-villager-mine-v34.png | assets/directions-workerwork-v33.png / 1 |
| villager_wood | assets/attack-villager-wood-v34.png | assets/directions-workerwork-v33.png / 2 |
| villager_food | assets/attack-villager-food-v34.png | assets/directions-workerwork-v33.png / 3 |
| villager_build | assets/attack-villager-build-v34.png | assets/directions-workerwork-v33.png / 4 |
