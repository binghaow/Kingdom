# 音乐素材库 / Music library

存放《边境王国》的背景音乐素材原文件。这个目录在 `public/` 之外，**不会被 `npm run build` 打包，也不会发布到游戏里**。某首曲子要进游戏时，再把它（或处理后的版本）放到 `public/audio/`，接入代码，并在 `public/audio/CREDITS.md` 和 `docs/app-store-readiness.md` 里登记来源和授权。

This folder holds source music for Frontier Kingdom. It is outside `public/`, so it is not built or deployed. To use a track in the game, copy or process it into `public/audio/`, wire it up, and register its source and license in `public/audio/CREDITS.md` and `docs/app-store-readiness.md`.

## 曲目 / Tracks

| 文件 / File | 标题 / Title | 片段 / Piece | 规格 / Format | 来源与授权 / Source & license | 状态 / Status |
| --- | --- | --- | --- | --- | --- |
| `kings-orchard-a.mp3` | The King's Orchard | A | 2:59, MP3 192 kbps, 44.1 kHz stereo；-10.8 LUFS，true peak +0.4 dBTP；开头约 0.6 s、结尾约 0.8 s 静音 | Google Gemini app 生成（Lyria 音乐模型），项目作者 2026-11-14 提供；生成对话 https://g.co/gemini/share/c993682c9577 。含 Google SynthID 隐形水印。**App 内再分发授权待确认**：需按生成当天的 Google 服务条款与生成式 AI 使用政策核对商业/App 分发权利 / Generated in the Gemini app (Lyria); redistribution rights unverified | 原文件，未修改（SHA-256 `234c32d3…f1ecf45ce`）；未在游戏中使用 |

## 进游戏前要做 / Before in-game use

- 登记创作者或生成工具、授权条款，以及是否允许在免费/付费 App 中再分发（App Store 合规要求）。
- 如需循环播放：去掉首尾静音，把响度降到约 -16 LUFS，峰值控制在 -1 dBTP 以内。
