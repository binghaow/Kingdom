# Draft validation — 2026-11-13

## Result

This is an **incomplete P0 recording-based draft set**, not a final audio approval. There are 41 stems / 82 files (OGG + M4A), about 0.26 MB total. The existing sources were edited with FFmpeg 9.0.2. No runtime mapping, game code or live audio was changed.

## Technical checks

| Check | Result |
|---|---|
| File decode / stream metadata | Pass: all 82 outputs probe as playable audio |
| Sample format | Pass: all outputs mono, 48 kHz |
| Codecs | Pass: OGG Vorbis q5 and M4A/AAC 160 kbps, set by the processing script |
| Peak ceiling | Pass: `volumedetect` on all 82 files found no measured peak above the −1 dBFS limiter ceiling |
| Draft package size | Pass: 261,599 bytes, below the 3 MB SFX package target |
| Prompt duration | Pass for sourced SFX in target ranges: chop, mining, tree fall, rubble, bow release/flyby, wood building hit, stone wall candidates, and collapse montages. Horn studies are intentionally out-of-spec references, not finished age-up music. |
| Listening / device speaker review | **Unverified**: Codex has no human listening sign-off in this review. Every montage requires headphone and phone/tablet speaker audition before integration. |

## Coverage against P0

| P0 item | Status | Remaining gap |
|---|---|---|
| Axe chops ×5 | Draft | One actual axe-chop take is layered with different recorded timber takes. These are not five independent axe performances. |
| Tree falls ×2 | Draft | One whole-tree recording; second combines recorded creak and timber fall Foley. Listening review required. |
| Stone mining ×5 | Partial | Four isolated pick strikes plus one rock-break Foley; the fifth is not a separate pick strike. |
| Gold mining ×4 | Candidate | Recorded pick + metal + rock layers; no actual gold-mine recording. |
| Rubble tails ×2 | Draft | Two CC0 rock/boulder source sequences. |
| Age-up start / progress / completion | **Not complete** | Two short horn excerpts are included as source studies. No licensed acoustic military drum performance or complete 6–10 second age-up motifs were available in the inspected sources. No fake or synthesized substitute was made. |
| Bow release ×4 | Partial | Three distinct recorded releases; fourth is a crop from the same longbow take. |
| Arrow flyby ×3 | Draft | Recorded approach/pass/passby samples; listening review required. |
| Arrow hits: wood, shield, stone, flesh ×3 each | **Not included** | No suitable licensed, realistic impact source set was available. In particular, no flesh hit was fabricated. |
| Timber building hits ×4 | Candidate | Four recorded wood impacts; listening review required for suitability as heavy building hits. |
| Stone wall hits ×4 | Candidate only | Rock/boulder impacts are foley candidates, not masonry-wall recordings. |
| Cannonball vs. stone wall ×3 | **Not included** | No verified source recording was added; do not treat generic rock impacts as cannon impacts. |
| Wood collapse ×2 | Montage study | Real creak/fall/impact Foley assembled; no actual building-collapse takes. |
| Stone collapse ×2 | Montage study | Rock/boulder Foley assembled; no actual stone-structure collapse takes. |
| Collapse rubble tails ×2 | Draft | Two recorded rock/boulder sequences. |

## Reproducibility and sources

Run `process-sources.ps1` from the repo root using FFmpeg 9.0.2. It reads only licensed recordings, keeps source pitch and speed, applies mono/48 kHz conversion, a −1 dBFS limiter ceiling, 5 ms fade-in and 20 ms fade-out, then exports OGG Vorbis q5 and AAC 160 kbps M4A. Stem-level source links, date, tool and commercial-use license notes are recorded in `public/audio/sources.json`; fuller credits are in `public/audio/CREDITS.md`.

**Aural reviewer:** Codex (technical file review only). **Conclusion:** technically valid draft files, but not approved for integration because listening review and several P0 source gaps remain. No human listening review was performed or implied.
