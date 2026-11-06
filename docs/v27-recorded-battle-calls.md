# v27 — Recorded charge horns and battle cries

2026-11-06. The user requested a replacement for the attack horn, with the performed character and battle staging of mature historical strategy games.

The previous cue was an excerpt from a real morning wake-up bugle, not an appropriate charge call. It was reused for multiple purposes and the simulation emitted another horn every 12 seconds of combat. Replacing only the file would have retained that repetition problem.

## Sources and processing

- Joseph SARDIN / BigSoundBank, CC0, traditional outdoor horn performances #2520 / #2521 / #2524, recorded with SoundDevices MixPre-3 and Sennheiser ME66: https://bigsoundbank.com/horn-1-s2520.html , https://bigsoundbank.com/trompe-ou-corne-2-s2521.html , https://bigsoundbank.com/trompe-ou-corne-5-s2524.html . Downloaded the published BWF WAV files at /UPLOAD/bwf-en/{number}.wav.
- joelcarrsound / Freesound, CC0, Middle Ages War Cry 3, an MS stereo field recording of a Battle of Hastings re-enactment: https://freesound.org/people/joelcarrsound/sounds/521831/ . Used the public HQ MP3 preview at https://cdn.freesound.org/previews/521/521831_3718141-hq.mp3 .
- scripts/prepare-battle-audio.py converts to 48kHz mono PCM16, trims quiet tails, normalizes with headroom and applies endpoint fades. Original source speed and pitch are retained. There are no synthetic horns, generated crowd voices, detuned duplicate voices or extracted game/film audio. Outputs: charge-horn-a.wav (1.648s), charge-horn-b.wav (1.767s), battle-alert.wav (.82s), battle-cry.wav (2.42s). charge-preview.wav mirrors charge horn A + the field-recorded crowd layer at relative runtime levels.
- Reference read: the Age of Empires IV composers describe recording live Horagai calls and moving between exploration/combat layers: https://dynamedion.com/news/age-of-empires-iv-byzantines-japanese/ . Firaxis's audio diary introduction emphasizes authentic, lively and responsive sound: https://forums.civfanatics.com/threads/developer-diary-designing-the-sound-of-civilization-vii.703311/ . These inform event staging; their audio is not copied.

## Runtime behavior

Four or more selected land fighters issuing an attack/attack-move play a recorded horn variation plus a restrained crowd response. A lone fighter uses a short recorded attack response. Charge calls share a 20-second cooldown and suppress duplicate order/contact voices immediately afterward. Combat entry uses a group field-recorded cry and a physical steel impact for three nearby fighters after a quiet interval; continuing combat does not periodically replay entrance calls. Engagement timing persists across server reconstruction/save reload.

Danger has its own short recorded horn and independent shared eight-second cooldown; a recent offensive charge does not suppress an urgent defensive alert. Work/steel sounds retain their world/view gating. Delayed layers now schedule their gain envelope at the source start time rather than before it. New files warm before less urgent recordings after a gesture and are in the offline cache. The obsolete wake-up bugle is not referenced by active combat/alarm cues.

Sound & Music has three localized preview buttons. Explicit previews bypass gameplay cooldowns without resetting them; mute/volume and gesture unlocking remain in effect. Updated the settings description to accurately describe the recorded cues.

## Checks and limits

check-battle-audio.cjs passed: real PCM files and peak headroom, natural playback rate, delayed envelope alignment, duplicate suppression, independent alert, preview behavior, mute, one engagement entry over a minute of strikes, re-entry after quiet and persisted cooldowns. check-recordings.cjs, check-tactics.cjs, check-locales.cjs, all 16 check-network.cjs cases, build and check-artifact.cjs passed.

Browser: clicked all three actual preview buttons; the AudioContext status remained Running with no captured console warnings/errors. The localized modal was checked at desktop 1280×720, nominal phone 393×852 / 852×393 and iPad 1180×820; DOM probe reported no layout findings. Saved audio review clip and modal screenshot are the review artifacts. This verifies assets, routing and browser playback state, not subjective listening quality or physical iPhone/iPad speaker playback; those were not claimed as tested.

This preference and the no-periodic-charge rule are recorded in AGENTS.md. Existing battle saves and Site audience are preserved.
