# 音乐素材库 / Music library

存放《边境王国》的背景音乐素材原文件。这个目录在 `public/` 之外，**不会被 `npm run build` 打包，也不会发布到游戏里**。某首曲子要进游戏时，再把它（或处理后的版本）放到 `public/audio/`，接入代码，并在 `public/audio/CREDITS.md` 和 `docs/app-store-readiness.md` 里登记来源和授权。

This folder holds source music for Frontier Kingdom. It is outside `public/`, so it is not built or deployed. To use a track in the game, copy or process it into `public/audio/`, wire it up, and register its source and license in `public/audio/CREDITS.md` and `docs/app-store-readiness.md`.

## 曲目 / Tracks

| 文件 / File | 标题 / Title | 片段 / Piece | 规格 / Format | 来源与授权 / Source & license | 状态 / Status |
| --- | --- | --- | --- | --- | --- |
| `kings-orchard-a.mp3` | The King's Orchard | Piece A | 2:59, MP3 192 kbps, 44.1 kHz stereo；-10.8 LUFS，true peak +0.4 dBTP；开头约 0.6 s、结尾约 0.8 s 静音 | Google Gemini app 生成（Lyria 音乐模型），项目作者 2026-11-14 提供；生成对话 https://g.co/gemini/share/c993682c9577 。含 Google SynthID 隐形水印。**App 内再分发授权待确认**：需按生成当天的 Google 服务条款与生成式 AI 使用政策核对商业/App 分发权利 / Generated in the Gemini app (Lyria); redistribution rights unverified | 原文件，未修改（SHA-256 `234c32d3…1ecf45ce`）；已进游戏，见 `docs/music-director.md` |
| `sunlight-on-the-orchard-b.mp3` | Sunlight on the Orchard | Piece B | 2:59, MP3 192 kbps, 44.1 kHz stereo；-11.2 LUFS，true peak +0.3 dBTP；开头约 1.3 s、结尾约 1.9 s 静音 | Google Gemini app 生成（Lyria 音乐模型），项目作者 2026-11-14 提供，与 Piece A 同一流程。含 SynthID 隐形水印。**App 内再分发授权待确认** / Generated in the Gemini app (Lyria); redistribution rights unverified | 原文件，未修改（SHA-256 `722073d1…7611d710`）；已进游戏，见 `docs/music-director.md` |
| `cobblestone-celebration-c.mp3` | Cobblestone Celebration | Piece C | 3:02, MP3 192 kbps, 44.1 kHz stereo；-11.6 LUFS，true peak +0.1 dBTP；开头无静音、结尾约 2.4 s 静音 | Google Gemini app 生成（Lyria 音乐模型），项目作者 2026-11-14 提供，与 Piece A 同一流程。含 SynthID 隐形水印。**App 内再分发授权待确认** / Generated in the Gemini app (Lyria); redistribution rights unverified | 原文件，未修改（SHA-256 `421a22ce…5dbdfdf0`）；已进游戏，见 `docs/music-director.md` |
| `unseen-gambit-tension-a.mp3` | The Unseen Gambit | Tension A | 1:58, MP3 192 kbps, 44.1 kHz stereo；-11.7 LUFS，true peak +0.2 dBTP；开头无静音、结尾约 0.4 s 静音 | Google Gemini app 生成（Lyria 音乐模型），项目作者 2026-11-14 提供，与 Piece A 同一流程。含 SynthID 隐形水印。**App 内再分发授权待确认** / Generated in the Gemini app (Lyria); redistribution rights unverified | 原文件，未修改（SHA-256 `3a7aef43…555bd743`）；已进游戏，见 `docs/music-director.md` |
| `against-the-stone-gates-battle-a.mp3` | Against the Stone Gates | Battle A | 2:03, MP3 192 kbps, 44.1 kHz stereo | Google Gemini 生成，项目作者 2026-11-16 提供 / Generated in Gemini by the project author | 原文件（SHA-256 `2d3aa90a...ead1a670`）；与 Tension A 交替作为战斗音乐 |
| `breach-at-the-gate-battle-b.mp3` | Breach at the Gate | Battle B | 2:03, MP3 192 kbps, 44.1 kHz stereo | Google Gemini 生成，项目作者 2026-11-16 提供 | 原文件（SHA-256 `d9aae051…acc7173e`）；战斗音乐三首轮换之一 |
| `rise-of-the-sovereign-victory.mp3` | Rise of the Sovereign | Victory | 1:02, MP3 192 kbps, 44.1 kHz stereo | Google Gemini 生成，项目作者 2026-11-16 提供 | 原文件（SHA-256 `72084487…c7c0179c`）；胜利时播放一次 |
| `morning-at-the-estate-calm.mp3` | Morning at the Estate | Calm | 3:00, MP3 | Google Gemini 生成，项目作者 2026-11-20 提供 | 原文件（SHA-256 `09010be3…2914661f`）；平静曲轮换 |
| `where-the-river-bends-calm.mp3` | Where the River Bends | Calm | 3:01, MP3 | Google Gemini 生成，项目作者 2026-11-20 提供 | 原文件（SHA-256 `d39c62a9…f0433ec4`）；平静曲轮换 |
| `before-the-walls-fall-battle.mp3` | Before the Walls Fall | Battle | 2:03, MP3 | Google Gemini 生成，项目作者 2026-11-20 提供 | 原文件（SHA-256 `3faf755b…a4740ce4`）；战斗曲轮换 |
| `untitled-1120-battle.mp3` | （未命名，2026-11-20 提供） | Battle (按节奏判断) | 2:04, MP3 | Google Gemini 生成，项目作者 2026-11-20 提供 | 原文件（SHA-256 `1c10ea0a…5bc9c996`）；战斗曲轮换；用途待作者确认 |
| `victory-march-d-major.mp3` | 胜利进行曲（D 大调，108 BPM） | Victory | 1:22, MP3 | Google Gemini 生成，项目作者 2026-11-20 提供 | 原文件（SHA-256 `8aae6fcf…75c9d993`）；胜利时与 Rise of the Sovereign 随机二选一 |

## 进游戏 / In-game use

已由 `scripts/prepare-music.py` 处理（去首尾静音、响度统一到约 -17.5 LUFS、128 kbps）后放在 `public/audio/music/`，播放逻辑见 `docs/music-director.md`。新曲目：放进本目录 → 在脚本 `TRACKS` 和 `public/natural-audio.js` 的 `CALM`/`TENSION` 列表里登记 → 重跑脚本。

## 上架前仍需 / Before App Store release

- 核对 Google 当时的服务条款，确认 Gemini 生成的音乐允许在免费/付费 App 中再分发，并保存带日期的条款副本（App Store 合规要求）。
