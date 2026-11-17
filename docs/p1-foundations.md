# P1 地基：打包、录像、校验值、千兵基准、跨浏览器预检

分支 `feature/p1-foundations`（基于 main 393bdb5），2026-11-17。对应 `docs/architecture/redesign-plan.md` 第 4 节 P1。
**玩法、数值、素材、模拟代码（public/ 下的 Sim 链）均未改动**；只新增 `src/`、一个打包产物和检查脚本，`index.html` 多一个 `<script>`。

## 1. 打包结构

```
src/                      新代码（ES 模块，src/package.json 声明 "type":"module"）
├─ index.js               浏览器入口：桥接、录制安装、?replay=1 调试按钮
├─ core/hash.js           状态校验值（FNV-1a，纯函数，无 DOM/时钟/Math.random）
└─ replay/replay.js       录像录制器、序列化、无头回放器（Node 与浏览器共用）
scripts/build-core.cjs    esbuild 0.28.2（devDependencies）把 src/index.js 打成 IIFE → public/kingdom-core.js
public/kingdom-core.js    生成文件（已提交，便于 npm run dev / preview.cjs 直接运行；不要手改）
```

- `npm run build` = `node scripts/build-core.cjs && node scripts/build.cjs`；`scripts/build.cjs` **未改**（P2 在改它），打包产物随 public/ 一起复制到 dist/client。
- `index.html` 只加了一个 `<script src="kingdom-core.js">`，位置在 `network-client.js` 之后、所有 UI 脚本（`expansion.js` 会创建第一局）之前。
- **桥接规则**：旧脚本 → 新代码只通过 `window.KingdomSim`（新代码读取 Sim 类）；新代码 → 旧脚本只通过 `window.KingdomCore`（`version`、`hash.checksum`、`replay.*`）。新代码不碰其他全局变量，旧脚本不 import src/。
- `sw.js` 未改：它对 `.js` 走“网络优先、运行时缓存”，新文件首次在线加载后即可离线使用；P2 改预缓存清单时可把 `./kingdom-core.js` 加入 SHELL（非必须）。
- 检查：`check-core-bundle.cjs`（加入 check-all）验证产物与 src/ 一致（内存重建比较）、`<script>` 恰好一个且顺序正确、产物不含 ES 模块语法，并在 VM 里用真实 Sim 跑“录制 → 回放一致”；`check-artifact.cjs` 用 `--dist` 对 dist/client 做同样检查。
- 体积：产物约 16.6 KiB（未压缩）；页面多 1 个请求，加载时间影响可忽略（游戏本身 109 个脚本、246 MB 素材）。

## 2. 录像格式（version 1）

```json
{
  "format": "kingdom-replay", "version": 1, "step": 0.05, "every": 20,
  "setup": { "difficulty": "normal", "options": { "nations": [...], "groups": [...], "mapId": "coast_s", "seed": 4242, "fog": true, ... }, "prewarm": true },
  "meta": { "created": "...", "source": "game", "notes": [], "unrecordable": false },
  "steps": 1200,
  "commands": [ { "s": 20, "m": "train", "a": [{"$e": 1}, "villager"], "r": "" },
                { "s": 90, "m": "construct", "a": ["house", 2693.04, 3080.88, [{"$e": 4}], 0], "r": {"building": 823} },
                { "s": 300, "dt": 0.1 } ],
  "checksums": [ { "step": 20, "hash": "f682e4df" }, ... ],
  "final": { "step": 1200, "hash": "...", "parts": {...}, "rng": 123, "time": 60, "units": 57 }
}
```

- **初始设置**：`new K.Sim(difficulty, null, options)` 的原样参数（地图、种子、国家、队伍/座位、迷雾、各电脑难度都在 options 里）。回放时同样构造，再按游戏的 `warmNavigation` 预热导航网格。
- **指令**：`s` = 指令发生在第几步之前（已完成的 tick 数），`m` = Sim 方法名，`a` = 参数（活着的单位/建筑/资源点写成 `{"$e":id}`，回放时 `sim.byId` 还原），`r` = 返回值（toast 文本、`{error}`、`{building:id}`），回放时逐条比对。非 0.05 s 的 tick 记为 `{s, dt}`。
- **统一捕获**：`attachRecorder` 在这一局的 Sim 实例上包装玩家入口：`order`（移动/攻击前进/攻击/采集/建造/修理/登船/送回资源…）、`construct`、`constructLine`（城墙）、`train`、`research`（含推进时代 `age`）、`setRally`、`board`、`unload`、`assignFish`、`skill`、`castSpell`、`route`、`claimReward`、`setDifficulty`、`sendChat`（含调试/无限资源口令）、`pact`、`add`（仅教程用）、外交四项。**只记录来自模拟外部的调用**：tick 内部和嵌套调用不记录，所以电脑 AI 的行为从不进录像，由同一种子复现。
- **何时录制**：新开的单机局（`new K.Sim(..., saved=null, ...)`）一律录制指令（每条指令一次判断，开销可忽略，便于复现 bug）；读档继续的局不录（无法从初始设置重放）；联机客户端是 `NetworkSim`，不会被录制（实测见第 6 节）。教程脚本会直接改状态，导出时标 `meta.unrecordable`。
- **校验值**：普通游玩不计算（AGENTS.md：诊断须 opt-in），只在导出时算最终值；`?replay=1` 时每 20 步计算一次。
- **调试入口**：`?replay=1` 左下角两个小按钮——“导出录像”（下载 JSON）和“验证录像”（选一个录像文件，用本浏览器回放并显示最终校验值是否一致，用于 Safari/iPhone）。控制台：`KingdomCore.replay.export()`、`KingdomCore.replay.run(json)`。普通玩家界面没有任何变化。
- **无头回放器**：`node scripts/replay/replay.cjs <file.json> [--runs 3]`，Node 里直接用 `public/network-model.js` 的 Sim 运行，输出校验值序列并与文件内记录比较。

标准录像 `scripts/replay/fixtures/`（`node scripts/replay/make-fixtures.cjs` 生成；脚本化玩家通过同一套 Sim 方法下指令，录制器捕获）：

| 录像 | 地图 / 国家 | 难度 | 步数 | 玩家指令 | 最终校验值 |
|---|---|---|---|---|---|
| coast_s-2p | coast_s，2 国 | normal | 1200（60 s） | 17（采集×3、训练×7、建房、兵营、集结点、晋升×2、移动、攻击前进） | f860905f |
| lake_s-3p | lake_s，3 国 | hard | 1200 | 17 | 98c1affb |
| straits-4p | straits，4 国 2v2 | normal | 1200 | 17 | 5f6890e9 |
| cliff_s-2p | cliff_s，2 国，无迷雾 | easy | 1200 | 18（含攻击） | 58f709c0 |

玩法有意改动时，重新生成并在提交说明里写明理由（redesign-plan 第 3 节）。

## 3. 状态校验值定义（src/core/hash.js）

- 32 位 FNV-1a，输出 8 位十六进制；每 20 步（1 秒游戏时间）一个。
- 所有实体按 id 排序后逐个哈希；数值按 1/100 量化（`Math.round(x*100)`，超过 2³¹ 的拆高低位），时间按 1 ms。
- 内容：单位（id、种类、队伍、x、y、hp、指令类型/目标 id/目标点、combatTarget、workTarget、路径长度、货物、所在船只）；建筑（id、种类、队伍、位置、hp、是否完工、进度、存量、生产队列每项的类型/种类/剩余时间）；资源点（id、种类、存量、位置）；经济（各方四种资源、时代、全部科技等级、出局名单、是否结束）；随机数状态 `s.rng`；模拟时钟。
- 分项 `parts.units / buildings / nodes / economy` 便于定位不同步发生在哪类数据。
- 不计入：特效（界面也会往里推“升级”闪光）、事件、聊天文本、导航/路径/迷雾缓存。
- 敏感度（check-replay 验证）：删掉一条指令或改种子，校验值都会变化。

## 4. 检查

| 检查 | 内容 | 结果 |
|---|---|---|
| `check-core-bundle.cjs`（check-all） | 产物最新、一个 script、桥接录制+回放 | PASS |
| `check-replay.cjs`（check-all） | 4 张地图各 60 s：进程内回放 3 次 + 新进程 1 次全部一致；与录制时 60 个校验值逐个相同；每条指令返回值相同；电脑队伍只靠种子复现；删指令/改种子校验值变化；重新录制脚本对局与录像逐字节相同 | PASS（约 45 s） |
| release-check “规模 P1” | 录像回放 3 次一致（FAIL 门槛）；千兵基准多次运行状态一致（FAIL 门槛）；千兵耗时只记 INFO/WARN | 见第 5 节 |
| `scripts/perf/late-determinism.cjs --self 3 --steps 600` | P0 的“新版自身多次运行一致” | 5 个场景全部 SAME |

## 5. 千兵基准（release-check 新场景）

`scripts/perf/scale-1000.cjs`：地图每局最多 5 个国家（worlds.js 限制），所以“8 方”用 **5 国（座位上限）× 200 单位 = 约 1005 单位**（含中立守卫）在 coast_l 上模拟，各国军队拆成两半共 10 组，其中 **8 组各有独立目标**（4 条战线各两组对冲），AI 开，迷雾开。真正的 8 个座位要等 P7 的地图档位。

现状（本机 Node 22.23，2 核共享虚拟机，600 步 × 3 次取中位数；完整 release-check 两次运行，机器速度系数 1.29–1.45，即本机比基线时慢）：

| 运行 | 单位 | 每步均值 | p50 | p95 | 最大 | >16 ms 步 | >40 ms 步（第 20 步后） | 3 次状态一致 |
|---|---|---|---|---|---|---|---|---|
| release-check 第 1 次 | 1005 | 22.0 ms | 20.3 | 33.2 | 75.2 | 563/600 | 9（4） | 是（fd6d0c01） |
| release-check 第 2 次（报告 2026-11-17-a781295） | 1005 | 22.3 ms | 21.1 | 32.7 | 67.0 | 571/600 | 11（9） | 是（fd6d0c01） |
| 预算（scale-target.md） | 1000 | ≤ 8 | | ≤ 16 | | | 0 | |

结论：**均值约超预算 2.8 倍，p95 约 2 倍，几乎每步都超过 16 ms，并有零星 >40 ms 尖峰**。同次运行的 400 单位后期场景均值 9.35 ms、p95 18.8 ms，单位数 ×2.5 时耗时 ×2.4，大致线性，主要瓶颈仍是 P5 要换掉的数据布局、碰撞/索敌与寻路。release-check 里这些数字标 INFO（尖峰标 WARN），**不判 FAIL**；“多次运行状态一致”和“录像回放一致”是硬门槛（FAIL）。

录制器开销（Node，400 单位 coast_l，400 步，交替 3 次）：未录制 6.77/5.36/4.96 ms vs 录制 5.45/5.29/5.18 ms，差异在噪声内。

## 6. 跨浏览器确定性预检与联机实测

`node scripts/replay/browser-preflight.cjs`（Playwright）：

**A. 真实界面录制（Chromium）**：`?replay=1` 打开游戏，点“开始”，然后像玩家一样操作 25 秒实时：主城按钮选中城镇 → 点“训练村民”按钮 → 打开聊天输入“无限资源”（sendChat）→ E 选村民、右键树 → Q 选军队、右键空地 → 村民建造菜单点“房屋”、在地图上点位置、点“确认建造” → 主城按钮 → 点“晋升时代” → 再训练村民。导出的录像（9 条指令：train、sendChat、order×4、construct→{building}、research、train）在 Node 无头回放，**24 个游戏内校验值和最终值 96a2eaf9 完全相同**，页面 0 错误。说明渲染、界面事件、声音、`fx` 特效、导航预热都不影响模拟，玩家入口已全部捕获，电脑 AI 由种子决定。

**B. 同一录像在各浏览器引擎中回放**（页面自己的 Sim 代码，`KingdomCore.replay.run`）：

| 引擎 | 结果 |
|---|---|
| Node 22.23（V8） | 基准 |
| Chromium 153（headless） | 界面录像、cliff_s-2p、coast_s-2p 三份全部 SAME |
| WebKit | **本机不可用**：`/opt/pw-browsers` 只有 Chromium，`playwright install webkit` 下载失败（沙箱无外网） |
| Firefox | 本机不可用（同上） |

Chromium 和 Node 都是 V8，一致不能证明跨引擎确定性。**Safari / iPhone 必须真机检查**，方法：

1. Mac 上：`npx playwright install webkit` 后运行 `node scripts/replay/browser-preflight.cjs`，B 表会多出 webkit 一行，要求全部 SAME。
2. iPhone / iPad Safari（真机，最重要）：打开 `https://<站点>/?replay=1`，把 `scripts/replay/fixtures/*.json` 存到“文件”App，点左下角“验证录像”，逐个选择：按钮显示“一致 SAME · 校验值 / 录制值”即通过；显示 DIFF 时记下第一处不同的步数。
3. 反向：在 iPhone 上用 `?replay=1` 玩 1–2 分钟（含建造、训练、移动、攻击），点“导出录像”，把 JSON 传到电脑，`node scripts/replay/replay.cjs <文件>`，要求“matches the recording”。这同时验证了 iOS 上的触控入口捕获。
4. 有差异时：用 `--every 1` 回放找到第一处不同的步，比较 `parts` 定位数据类别，再查该步用到的 `Math.sin/cos/atan2/sqrt/hypot/pow` 等（规范允许各引擎结果在末位不同），按 redesign-plan 第 5 节改为整数或定点运算。

**联机实测**（`node preview.cjs`，8765）：`node scripts/replay/live-online.cjs 65` 用真实浏览器客户端（已加载 kingdom-core.js）打开联机面板、勾选电脑补位、建房、准备、开始，玩 65 秒并每 8 秒下指令（Q+右键、主城训练）：/api 共 246 次响应全部 200/201，**无 503、无页面错误**，游戏时间 1.0 → 75.3 s，4 个国家（1 人 + 3 电脑）；KingdomCore 没有为联机局启动录制（录制器只挂在单机 Sim 上）。preview 日志无 error/exception。

## 7. 后续 P3（锁步联机）如何使用

- **指令格式**：录像的 `{s, m, a}` 就是锁步要广播的“第 N 步、谁、什么指令”的雏形。P3 把 `m/a` 收敛到服务器已有的 `{type,args}` 协议（service.cjs `execute`），并加上座位号；客户端在第 `s + 延迟` 步统一执行。
- **不同步检测**：每个客户端每 20 步上报 `checksum(sim).hash`，中继比对；不一致时用 `parts` 和录像定位。
- **断线重连 / 追帧**：中继保存的就是录像（setup + 指令），重连客户端用 `runReplay` 追到当前步。
- **重构安全网（P4/P5）**：每次迁移模拟代码都跑 `check-replay.cjs`；校验值确实需要变化时重录 fixtures 并写明理由。
- **待 P3/P4 解决**：现在单机录制在 Sim 实例方法层面捕获（P4 的统一指令接口会替代它）；WebKit/iPhone 的跨引擎一致性尚未验证；模拟里仍有浮点三角函数。
