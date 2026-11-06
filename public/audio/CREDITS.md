# Recorded sound sources

All sound effects in the active game use audio files, not oscillators or procedurally generated noise. Multiple physical recordings are layered at normal playback speed. No film or television soundtracks were extracted.

* Kenney — Voiceover Pack, Impact Sounds and RPG Audio. CC0 1.0. Human responses (`ready`, `ready2`, `go`, `hold`, `attack`, `warning`, `complete`), wood/metal/soft impacts, cloth, creaks, chopping, latch, coins, book and door recordings. https://kenney.nl/assets/voiceover-pack · https://kenney.nl/assets/impact-sounds · https://kenney.nl/assets/rpg-audio
  Download mirror: https://github.com/Mcamento8/open-game-sfx-index/tree/main/audio — filenames retained in `sources.json`.
* Ben Jaszczak & Brian Nelson / Still North Media, submitted by MedicineStorm — Medieval Sound Effects: Weapon Impacts. CC0. `clash1.wav`: Dagger Katana Blade on Blade; `clash2.wav`: Axe Norse Sword Blade on Blade; `clash3.wav`: Axe Sabre Blade on Blade. Isolated first strikes, trimmed, normalized, converted from 192 kHz / 24-bit mono to 32 kHz / 16-bit mono, short fades. https://opengameart.org/content/medieval-sound-effects-weapon-impacts
* Joseph Sardin / BigSoundBank — CC0. `cow.mp3`: actual cow, #0546, outdoor field recording, https://bigsoundbank.com/vache-qui-meugle-s0546.html ; `wind.mp3`: Wind in Tall Grass #0908, https://bigsoundbank.com/wind-in-tall-grass-s0908.html ; `horn.mp3`: Bugle Awake for Morning Call #3263, https://bigsoundbank.com/bugle-awake-morning-call-s3263.html ; `shot.mp3`: Rifle Shot #2, #2854, https://bigsoundbank.com/rifle-shot-2-s2854.html ; `sword.mp3`: sword sliding against metal #0129, https://bigsoundbank.com/sword-s0129.html . Runtime excerpts and volume envelopes only; gunshot also layers with physical metal for cannon impacts.
* mikewest; edited by AntumDeluge — Sheep Baa, CC0. `sheep.ogg`, real animal recording. https://opengameart.org/content/sheep-baa
* jcpmcdonald — Skippy Fish Water Sound Collection, CC0. `water.mp3`, `swim.mp3`, recorded water Foley. https://opengameart.org/content/skippy-fish-water-sound-collection
* artisticdude — RPG Sound Pack, CC0. `chain.wav`, `ring.wav`, `swing.wav`, `growl.wav` (performed/processed giant vocal). https://opengameart.org/content/rpg-sound-pack
* RandomMind — The Bard's Tale, CC0, `bards-tale.mp3`, prerecorded fantasy/medieval background music. https://opengameart.org/content/medieval-the-bards-tale

CC0: https://creativecommons.org/publicdomain/zero/1.0/

## Recorded charge and engagement update (v27)

* Joseph SARDIN / BigSoundBank, CC0: Horn #1 (2520), Horn #2 (2521), Horn #5 (2524). These are realistic outdoor recordings of a person blowing a traditional horn, recorded with SoundDevices MixPre-3 and Sennheiser ME66. Sources: https://bigsoundbank.com/horn-1-s2520.html , https://bigsoundbank.com/trompe-ou-corne-2-s2521.html , https://bigsoundbank.com/trompe-ou-corne-5-s2524.html . `charge-horn-a.wav` / `charge-horn-b.wav` trim quiet recorder tails, normalize levels and apply short endpoint fades; `battle-alert.wav` is a short faded excerpt from #5. Original pitch and speed retained.
* joelcarrsound / Freesound, CC0: “Middle Ages War Cry 3.wav”, an MS stereo recording of a Battle of Hastings re-enactment: https://freesound.org/people/joelcarrsound/sounds/521831/ . Public HQ preview used as source, converted to mono PCM, trimmed and normalized as `battle-cry.wav`; no generated voices or artificial pitch variations. `charge-preview.wav` is a review mix of recorded horn A and this field recording, at their runtime relative levels.

The legacy `horn.mp3` morning-call bugle remains only as an old asset. The active v27 charge, engagement and alarm cues do not use it. No Age of Empires, Civilization, film or TV audio was extracted. Processing is reproducible with scripts/prepare-battle-audio.py and the documented source files.

Voices are currently recorded English responses in both UI languages. Creatures use performed fantasy vocals; dragons do not have a real-world field-recording equivalent. Ships layer recorded water and timber creaks; airships layer recorded wind, cloth and rigging creaks.

* Movement update: Kenney RPG Audio `footstep00.ogg` and `footstep02.ogg` (CC0), renamed `step1.ogg` and `step2.ogg`. Joseph Sardin / BigSoundBank, Horse Walking on a Path #1854 (actual horse recording), CC0, `hooves.mp3`: https://bigsoundbank.com/horse-walking-on-a-path-s1854.html . Horse and wind recordings are cropped to three-second mono buffers at runtime.

## Guardian performance update (v21)

Darsycho — Monster snarls (CC0), dragon-vocal.ogg = monster-snarls_0.ogg and dragon-attack.ogg = monster-snarl-attack.ogg, https://opengameart.org/content/monster-snarls . StarNinjas — 16 Monster Growls (CC0), performed mouth recordings: demon-vocal.ogg = monster.1.ogg; demon-attack.ogg = monster.10.ogg, https://opengameart.org/content/16-monster-growls . Joseph Sardin / BigSoundBank — Blowtorch and heating #0931 (CC0), boss-flame.mp3, https://bigsoundbank.com/blowtorch-and-heating-s0931.html . Source files retained unchanged; runtime excerpts, pitch reduction, low-pass filtering and physical Foley layering distinguish selection, buildup, flame and melee. No synthetic oscillators or extracted film sounds.

## Wildlife recordings (v23)

Bear: U.S. Fish & Wildlife Service; distributed by AntumDeluge, Bear Growls, CC0. bear.ogg = bear_01.ogg and bear-attack.ogg = bear_02.ogg, unchanged source files. https://opengameart.org/content/bear-growls .

Jackal: Shajiarikkad, Jackal.ogg (24 May 2012), own field recording of a jackal howl, Creative Commons Attribution-ShareAlike 3.0 Unported. https://commons.wikimedia.org/wiki/File:Jackal.ogg . License: https://creativecommons.org/licenses/by-sa/3.0/ . jackal.ogg is redistributed unchanged; runtime playback selects short excerpts. These excerpts and any audio adaptations remain CC BY-SA 3.0. No endorsement is implied.

## Building selection recordings (v28)
- DenisChardonnet / BigSoundBank, Neighing of a Horse #1 (0284), actual horse, CC0: https://bigsoundbank.com/neighing-of-a-horse-1-s0284.html . building-horse.wav, short mono excerpt.
- Joseph SARDIN / BigSoundBank, Crowd of 50-60 People #1 (3515), indoor conversations after a choir performance, CC0: https://bigsoundbank.com/crowd-of-50-60-people-1-s3515.html . building-hall.wav, 1.8-second excerpt used as council/market ambience, not a historical reenactment.
- Pablo BERGEL / BigSoundBank, Anvil #1 (3589), recorded blacksmith hammering an anvil, CC0: https://bigsoundbank.com/anvil-1-s3589.html . building-forge.wav, 1.5-second excerpt.
- nemaavla / Freesound, Tibetan monks.wav (344683), a human vocal performance recorded at home, CC0: https://freesound.org/people/nemaavla/sounds/344683/ . Public HQ preview; building-chant.wav, 2.1-second excerpt, not an actual monastery recording.
All four are mono PCM16 with normalization and endpoint fades only, original pitch/speed. Reproduce via scripts/prepare-building-audio.py. Existing CC0 physical Foley supplies the other building-specific recipes.
