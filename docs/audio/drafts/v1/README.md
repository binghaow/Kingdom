# Audio drafts v1

Draft assets for `claude/audio-audit`, prepared 2026-11-13 from licensed recordings. Nothing in this folder is connected to runtime playback. The recorded takes were trimmed and assembled with FFmpeg 9.0.2; no AI audio model, oscillator, pitch shifting, or time stretching was used.

## What is here

Each listed stem has `.ogg` (Vorbis q5) and `.m4a` (AAC 160 kbps) versions, mono at 48 kHz.

| Stems | Material / provenance | Status against audit prompt |
|---|---|---|
| `chop_01`–`chop_05` | One recorded Kenney axe-chop layered with different CC0 timber impact/break takes | Draft variations; only one axe-chop take was available, so the five are not five separately recorded axe takes |
| `tree_fall_01`–`tree_fall_02` | CC0 tree fall recording; second is a montage of a recorded tree creak and timber fall | `tree_fall_01` is within target duration; second is source-assembled and must pass listening |
| `mine_stone_01`–`mine_stone_05` | Four separated strikes from a CC-BY pickaxe recording; fifth is a CC0 rock break | Four real pick impacts plus one rock-break candidate; fifth is not a pick strike |
| `mine_gold_01`–`mine_gold_04` | CC-BY pick strikes with CC0 metal and rock Foley layers | Candidate gold-ore variants; not recorded at a gold mine |
| `rubble_01`–`rubble_02` | CC0 boulder / rock recordings, sequenced in opposite order | Source-assembled rubble candidates |
| `bow_release_01`–`bow_release_04` | CC0 longbow, recurve and crossbow recordings | Three distinct weapon recordings; fourth is another crop from the same longbow take, not a separate take |
| `arrow_flyby_01`–`arrow_flyby_03` | CC0 recorded arrow approach, pass and passby | Draft candidates |
| `building_hit_wood_01`–`building_hit_wood_04` | Four CC0 recorded wood impact Foley takes | Candidate timber building hits |
| `wall_hit_stone_01`–`wall_hit_stone_04` | CC0 recorded rock break / boulder impacts and two layered combinations | Foley candidates, not recordings made against a masonry wall |
| `cannonball_hit_wall_01` | One CC0 recording described as a cannonball striking a fortification | Single candidate only; the other two prompt variations are not duplicated from this take |
| `collapse_wood_01`–`collapse_wood_02` | Recorded tree creak, timber falling and timber slam Foley | Montage studies only; no full building-collapse recording was available |
| `collapse_stone_01`–`collapse_stone_02` | CC0 rock break and boulder-drop Foley montage | Montage studies only; no full stone-building collapse recording was available |
| `collapse_rubble_tail_01`–`collapse_rubble_tail_02` | CC0 boulder-drop and rock-break recordings sequenced | Draft rubble tails |
| `age_up_horn_study_01`–`age_up_horn_study_02` | Existing documented CC0 human-performed horn recordings | Short horn studies only; not the specified 6–10 second horn-and-drum completion motifs |

## Source processing

Run from the repository root in PowerShell with FFmpeg 9.0.2 installed:

```powershell
./docs/audio/drafts/v1/process-sources.ps1 -Ffmpeg ffmpeg
```

The original source recordings and source archives are in `src/` for review. The processing script only reads them and writes draft stems beside this file. It applies mono/48 kHz conversion, a -1 dBFS limiter ceiling, a 5 ms fade-in and a 20 ms fade-out. Layered stems use recorded material only, at original pitch and speed.

## Licensing

Per-stem source mappings and commercial redistribution notes are in `public/audio/sources.json`; human-readable attributions are in `public/audio/CREDITS.md`. CC0 sources may be used commercially without attribution. The pickaxe recording is CC BY 3.0 and must retain attribution to spookymodem and the source page. No third-party game, film, or television audio was used.

## Review status

`check.md` records the technical checks and the remaining gaps. These are unintegrated drafts, not art/audio sign-off. A human must listen to each candidate on headphones and on phone/tablet speakers before integration.
