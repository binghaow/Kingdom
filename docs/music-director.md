# 背景音乐导演 / Background music director

## 玩家体验 / Player outcome

背景音乐轻、不抢戏，并且随局势变化：

- **平时（calm）**：在三首 Gemini 生成的曲子（The King's Orchard、Sunlight on the Orchard、Cobblestone Celebration）和原有的 The Bard's Tale 之间轮换。每次洗牌，不会同一首连放；两首之间留 **25–70 秒安静**，只剩环境音和音效。
- **交战（tension）**：遭到攻击、敌军来袭警报、冲锋号角/接战，或 12 秒内出现 3 次以上可见的近战/炮击音效时，1–2 秒内淡入 The Unseen Gambit（循环）。
- **战后**：最后一次交战信号后 30 秒，且紧张曲至少放了 45 秒（避免来回切换），淡出到安静，8–15 秒后回到平时轮换。
- 原有的“交战时音乐压低到 40%”、暂停时降到 20%、音乐开关、静音、切到后台暂停都保持不变。设置面板里的音效试听不会触发紧张音乐。

## 实现 / Implementation

- `public/natural-audio.js`：原来单个循环的 `bards-tale.mp3` 换成两个 `<audio>` 播放槽，各自经 WebAudio 增益节点接到原有的音乐总线 `bgm`，用增益淡入淡出交叉切换（iOS 上 `audio.volume` 只读，所以用 WebAudio 增益）。1 Hz 的轻量计时器决定何时换曲；交战信号直接来自已有的 `A.sound(kind)` 事件，不读模拟状态、不改游戏逻辑。
- iOS 首次播放需要用户手势：第一次点击/按键时在手势内对两个播放槽各调用一次 `play()`（增益为 0）以解锁，之后换曲不再需要手势。**真机未验证。**
- 音频文件：`scripts/prepare-music.py` 从 `music/` 原文件生成 `public/audio/music/*.mp3`：去掉首尾静音，两遍 EBU R128 响度统一到约 -17.9 LUFS（与 bards-tale.mp3 的 -17.6 LUFS 一致，原有音乐音量设置不用改），128 kbps，四首合计 9.9 MB。按需流式加载（`preload='none'`），**没有**加进 Service Worker 预缓存，避免首次安装多下载近 10 MB；离线时新曲目不可用，会回落到安静。
- 新增 `check-music.cjs`（已加入 `check-all.cjs`）：轮换覆盖全部曲目且不连放、间隔 ≥25 s、试听不触发、两次零星打击不触发、警报和连续打击触发、持续交战保持、战后回到平时、音乐开关和后台暂停。

## 验证证据 / Evidence（2026-11-14）

| 项目 | 结果 | 类型 |
| --- | --- | --- |
| `node check-all.cjs`（含新 `check-music.cjs`） | PASS | 本地 Node |
| `npm run build` / `node check-artifact.cjs` | PASS；`dist/client/audio/music/` 含 4 首 | 本地 Node |
| `npm run release-check`（完整） | 89 PASS · 5 WARN · 0 FAIL，报告 `docs/release-reports/2026-11-14-0e689d9.md` | 本地 headless Chromium / Node |
| 真实游戏冒烟（Playwright Chromium，`preview.cjs`，1280×720） | 点击开始后约 4 s 播放 `music/kings-orchard`，`AudioContext` running，播放进度在前进；触发 `underAttack` 后切到 `music/unseen-gambit`；两个 mp3 请求均 200；无页面错误 | 浏览器测量（无扬声器，未听感评审） |

release-check 的 WARN 不是本次改动造成的：在 `origin/main`（de89f8c，无本次改动）上同机只跑渲染项，drawImage 同样超警告线（桌面 567 / 手机 510.8，本分支 555.8 / 496.5）；完整运行里的 render p50 两条 WARN 在随后单独的渲染复测中未复现，属 headless 噪声。碰撞增长指数 WARN 属模拟部分，本次未改模拟代码。音乐只增加一个 1 Hz 计时器和两个媒体元素，不涉及每帧渲染或模拟。

## 仍未验证 / Unverified

- iPhone 17 / iPad 实机：手势解锁、来电/后台打断后恢复、Safari 交叉淡入淡出、长时间播放的耗电与内存。
- 人耳听感：音量平衡、各曲之间风格衔接、紧张曲切入的时机是否合适。
- 授权：Gemini 生成音乐的 App 内再分发权利尚未确认（见 `docs/app-store-readiness.md`）。

## 发布合规影响 / Release-compliance impact

新增 4 个第三方生成音频资产，授权状态“未确认”，已登记在资产表和 `public/audio/CREDITS.md`。不涉及数据收集、账号、联机或付费。
