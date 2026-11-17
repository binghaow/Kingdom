# Browser verification · memory budget and device consistency

Candidate: 7510523, based on GitHub main 01d176b.

- Opened the actual local consistency page in Chromium. Battle, building, and economy recordings matched all 145 expected checkpoints. The repository check also passed on Chromium desktop and phone portrait.
- Started a campaign using the production script order at 1280 × 720, opened battlefield chat and entered 小熊猫. The system confirmed the summon, selected the Panda, and its sprite was visible on the battlefield.
- Asset budget: 207 MiB non-lazy and 465 MiB for all sized atlas pixels. The Panda atlases retain their source dimensions, map through the same decoded image loader, and are excluded from the initial image precache.
- Checked that dist contains the consistency page, its recordings, its answer key and the Panda WebP assets. The files total 74.1 MiB.
- No physical iPhone or iPad was tested. These checks do not measure browser process memory.
