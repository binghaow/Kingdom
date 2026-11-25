# P4 模拟核心重组 · 第一段（4c-1 及准备）进度

分支 `feature/p4-sim-worker`（基于 main 9278395：P0–P3e + 小蚂蚁），2026-11-24。对应 `docs/architecture/redesign-plan.md` P4。
本段只做三件事：依赖盘点、固定步长 + 渲染插值、单机模拟进 Web Worker（开关，默认关）。**玩法、数值、素材未改**；录像校验值未变（4 段标准录像与录制时逐个相同）。

## 1. 做了什么

### 1.1 依赖盘点
见 `docs/p4/sim-dependencies.md`。结论：模拟链 23 个文件只有两类浏览器依赖——`window.PerformanceAudit`/`performance.now()`（`?perf=1` 诊断，已有 `typeof window` 守卫）和 `btoa/atob`（联机视图，Worker 里也有）；没有 `Math.random`、`Date`、`document`、`localStorage`、定时器。页面侧对模拟的读写逐项列了处理方式。

### 1.2 固定步长 + 渲染插值（主线程，默认路径）
- `src/core/clock.js`：每步 0.05 s（每秒 20 步）；一帧最多追 4 步；单帧时长按 ≤ 0.25 s 计；追不完的积压直接丢弃（游戏变慢而不是越追越卡）。
- `expansion.js` 用它推进模拟。≥ 10 帧/秒时步进序列与 main 完全相同（原来单帧时长上限 0.1 s、最多 4 步，实际最多 2 步）；低于 10 帧/秒时原来是游戏变慢，现在每帧最多追 4 步，再慢才变慢。
- 渲染插值沿用 `unit-motion.js` 的 `A.renderUnit(u, alpha)`（alpha = 累积量 / 0.05），三处调用改为 `renderAlpha()`，Worker 模式下换成按帧到达时间计算的 alpha。
- 联机：锁步每轮 100 ms 跑 2 步（`src/net/lockstep.js` `STEPS_PER_TURN=2`，`STEP=0.05`），与单机同为每秒 20 步，确认一致，未改。

### 1.3 单机模拟进 Web Worker（`?simWorker=1`，默认关闭）
- `public/sim-worker.js`：esbuild 把 `src/sim/worker.js` + 整条模拟链（走 CommonJS 分支）打成一个文件（544 KiB 未压缩）；`npm run build` 生成，`check-core-bundle.cjs` 和 `check-sim-worker.cjs` 检查它与源码一致。
- `src/sim/host.js`（Worker 内）：init（新局录像 / 存档）→ 每个 `step` 消息先按顺序执行玩家指令再跑 n 步 → 回一帧快照；另有 save / replay / checksum，`eval` 只在 `?perf=1` 时可用（基准用）。
- `src/sim/client.js`（页面）：把页面原来的 Sim 实例变成**代理**：
  - 页面仍用原 Sim 实例开局（同样的构造参数），Worker 用同样参数再造一份，比对初始校验值；不一致或 Worker 出错 → 自动回到主线程模拟（用最新快照），游戏不断。
  - 每帧快照替换 `sim.s`，UI/渲染/声音代码一行未改，照常读 `sim.state`、`byId`、`canSee`……
  - 玩家入口（P1 录像的 CAPTURED 列表）编码成 `{m, a}` 发给 Worker，同时在当前快照上本地预测一次，保留同步返回值（toast、`{building}`、`{error}`）；实测本地预测与 Worker 结果 0 条不一致。
  - 同一时间只有一个步进请求在路上；期间到期的步数累计、上限 4，Worker 慢时游戏变慢而不是排队。
  - 插值：新帧到达时以“当前画出的位置”为起点，在这一帧的游戏时长内滑到新位置，单位不会回跳。
  - 存档由 Worker 序列化（文本格式与主线程相同，含编队 `controlGroups`），回复后写 localStorage。
  - 新联机/旧联机/教学通过 `networkView` / `replaceSimulation` 换模拟时释放 Worker，本段联机仍在主线程。
- 开关关闭时 `KingdomCore.simWorker === null`，expansion.js 走原路径（除 1.2 的追帧上限外与 main 相同）。

## 2. 数据

### 2.1 Worker 快照大小与耗时（Node，`node scripts/perf/worker-frames.cjs 300`，后期场景 397 单位，每请求 1 步）

| 项目 | 第一版（整份 units） | 现版（路径只带 2 个路点 + 长度） |
|---|---|---|
| 每帧字节（v8 结构化克隆格式）均值 / p95 / 最大 | 459 / 553 / 606 KiB | **177 / 265 / 286 KiB** |
| 20 帧/秒折合 | 8.96 MB/s | 3.46 MB/s（线程间内存复制，不走网络） |
| 接收方解码（v8.deserialize）均值 / p95 | 4.08 / 11.5 ms | **1.05 / 1.56 ms** |
| 页面应用（节点合并、路径恢复）均值 | 0.22 ms | 0.42 ms |
| Worker 组帧均值 / p95 | 3.49 / 6.6 ms | 1.93 / 4.84 ms |
| Worker 每步 / 主线程每步（同场景） | 10.4 / 9.5 ms | 10.1 / 9.9 ms |
| 三方校验值（主线程 / Worker / 页面镜像） | 一致 ec524c0b | 一致 ec524c0b |

现版帧构成：units 156 KiB（约 400 个对象 × 39 个字段），资源点只发变化的（平均每帧 11 个），迷雾只在 revision 变化时发（约 10% 的帧）。
**评估**：结构化克隆在 400 单位时每帧解码约 1 ms，可以接受；1000 单位约 2.5–3 ms，会吃掉 8 ms 预算的三分之一。下一步顺序：① units 增量（只发变化字段，静止单位不发）；② P5 列存（TypedArray）后改为 Transferable / SharedArrayBuffer（需要 COOP/COEP 响应头，iOS Safari 15.2+ 支持，须先确认 Sites 能配头）。

### 2.2 浏览器后期场景（`scripts/perf/late-render.cjs`，headless Chromium 无 GPU，1920×1080，412 单位，交替运行，**本机只有 2 个 CPU 核**）

主线程每帧 JS = CDP `ScriptDuration` / 帧数；task = `TaskDuration` / 帧（含光栅、结构化克隆解码）。

| 场景 | 模式 | 主线程 JS/帧 | task/帧 | HUD update p50/p95（模拟） | HUD render p50 | 帧间隔 p50 / p95 | FPS |
|---|---|---|---|---|---|---|---|
| 四军同屏交战（release-check 后期节） | 主线程模拟（5 次） | 34.3 / 35.0 / 34.3 / 38.6 / 36.9 | 86–103 | 13.1–15.9 / 24.7–31.2 ms | 18.0–21.9 | 83–100 / 117–150 | 10–12 |
| 同上 | simWorker=1（5 次） | **28.8 / 28.0 / 28.6 / 31.1 / 32.2** | 81–90 | **0.3 / 0.5–0.7 ms** | 21.0–23.9 | 83 / 100–117 | 12 |
| 镜头在空地，战斗照打（`--away`） | 主线程模拟（2 次） | 10.3 / 10.3 | 16.8–17.0 | 0.1 / 10.9–11.7 ms | 6.0–6.3 | 16.7 / 33.3 | 59.9 |
| 同上 | simWorker=1（2 次） | 11.7 / 11.2 | 18.7–19.4 | 0.1 / 0.8–2.2 ms | 7.5–8.2 | 16.7 / 33.4 | 59.9 |

解读（如实）：
- **模拟确实离开了主线程**：主线程上的模拟段从每帧 13–16 ms（p95 25–31 ms）降到 0.3 ms（p95 ≤ 2.2 ms）；同屏交战时主线程 JS/帧降 15–19%，帧间隔 p95 117–150 → 100–117 ms，FPS 10–12 → 12。
- **≤ 8 ms 的目标本机没达到**：headless 软件光栅下仅渲染就要 18–24 ms/帧（交战）或 6–8 ms/帧（空地）。另外本机只有 2 核，Worker（每步 14–16 ms，比 Node 单独跑的 10 ms 慢，说明在抢 CPU）与渲染、光栅线程争用，渲染 p50 上升 1.5–4 ms，空地场景因此主线程均值反而高 1 ms。对照实验：主线程模拟 + 一个每 50 ms 空转 15 ms 的假 Worker，渲染 p50 18.0 → 19.4 ms，量级吻合。多核真机（iPad、桌面）上 Worker 有自己的核，预期收益是“主线程 JS ≈ 渲染 + 1 ms”；**真机未测**。
- 帧间隔 p50/p95 在 headless 下被光栅主导且按 16.7 ms 量化，只作提交间比较。

### 2.3 确定性
- `check-sim-worker.cjs`（加入 check-all）：4 段标准录像在主线程（`public/little-ant.js`，即页面的 `KingdomSim`）与打包后的 Worker（Node worker_threads，页面同一消息协议，每次随机 1–4 步）中**校验值序列逐个相同**（每 20 步一个，共 4×60 个），与录制时相同；每条指令返回值相同；只靠快照重建的页面镜像状态与 Worker 状态校验值相同；Worker 自己的录像能回放到同一最终状态。
- 同一脚本还在真实页面里（headless Chromium，`?simWorker=1`）完整玩一局：调试模式 → 建兵营 → 训练 3 个兵 → 晋升时代 → 召唤小蚂蚁和小熊猫 → 攻击 → 暂停存档 → 刷新继续（Worker 接管存档）→ 页面 Worker 回放 coast_s-2p 校验值与录像相同。无页面错误、无回退、本地预测 0 条不一致。
- P1 `check-replay`、`check-consistency-page`、`check-lockstep`、`check-lockstep-restore` 均通过（见交付检查）。

## 3. 交付检查
- `check-all`：64/64 ALL PASS（含新增 check-sim-worker；check-lockstep-resilience 单独跑通过）。`npm run build`、`node check-artifact.cjs` 通过。
- 完整 `npm run release-check`：111 PASS / 3 WARN / 0 FAIL（`docs/release-reports/2026-11-24-d80621a.md`，含补充说明）。WARN：drawImage/帧（只重跑渲染节为 0 WARN，main 历次 508–557，噪声）、后期帧间隔 p50（main e79b287 同样 WARN）、千兵 >40 ms 步（P5 前预期）。后期节新增 simWorker=1 INFO：主线程 JS/帧 39.6 → 32.4 ms，模拟段 15.3 → 0.3 ms，帧间隔 p95 133 → 125 ms。
- 联机冒烟（`node preview.cjs` 8765）：新联机默认流程 65 秒 76 个校验值一致、ws 无回退（`docs/p4/duel-default-code.json`）；旧联机备用含电脑座位 65 秒无 503、无非 2xx（`docs/p4/duel-legacy-backup.json`）。

## 4. 下一段计划

### 4a 指令接口统一（AI 也只下指令）
- 已有两套指令：单机 = Sim 方法名 + 参数（录像 CAPTURED，本段 Worker 也用它），联机 = `network-commands.js` 的 `{type, args}`（带校验）。4a 统一为一套 `commands/`：`{type, team, args}` + 校验 + 序列化，单机、联机、录像、Worker 消息全用它；旧录像通过转换表继续可回放。
- 电脑 AI 改为每步输出指令列表（先包一层：AI 决策函数里对 `this.order/train/...` 的调用改为写入指令队列，在同一步末尾执行），以录像校验值不变为验收；之后才能给 AI 单独的计算预算或放到别的 Worker。

### 4b 继承链改系统管线
- 先把 23 层 `tick` 覆盖按实际执行顺序列成表（每层在 super.tick 前/后做什么），生成一个显式的 `systems = [指令, AI, 移动, 寻路, 战斗, 经济, 视野, 胜负, ...]` 管线，每个系统是现有方法的薄包装，录像校验值必须不变；然后逐层把逻辑从继承链挪进系统，挪一层删一层。
- `window.PerformanceAudit` 两处诊断改为系统管线的计时钩子（Worker 里也能统计寻路/碰撞/迷雾分项）。

### 4c-2 联机进 Worker
- 锁步客户端（`src/net/lockstep.js` LockstepClient）本身是纯逻辑：把它连同 `network-commands.js` 一起放进 Worker，传输层（WebSocket/HTTP，`auto-transport.js`）留在主线程，收到的轮指令 `postMessage` 进 Worker；`issue()` 从主线程发进 Worker 排队。
- 渲染副本：现在 `driver.view()` 每 90 ms 在主线程跑 `networkSnapshot` + JSON 深拷贝。改为 Worker 里生成精简视图（同 `slim` 格式）发回主线程，副本 `KingdomNetworkClient.apply` 不变；校验值、快照（每 5 分钟）、追帧都在 Worker 里做，追帧时不再卡主线程。
- 验收沿用 check-lockstep / check-lockstep-restore / resilience，并加“同一联机录像主线程与 Worker 校验值相同”。
- 之后把 `?simWorker=1` 改为默认，再删主线程模拟路径。

## 5. 未验证 / 限制
- **Safari / iPad / iPhone 上的 Worker 表现未验证**（本机无 WebKit）：Worker 启动时间、结构化克隆开销、后台/锁屏时 Worker 是否被暂停后能恢复、内存（Worker 里多一份模拟状态与导航网格，估计 +20–40 MB）。
- 多核真机上主线程每帧 JS 是否 ≤ 8 ms 未测；本机数据受 2 核争用影响。
- `simWorker=1` 时 `?perf=1` HUD 的寻路/碰撞/迷雾分项为空（诊断在 Worker 里无 `window`），模拟耗时看 `KingdomCore.simWorker.stats.worker`。
- 页面关闭（pagehide）时 Worker 存档是异步的，可能来不及写；切后台会先暂停并存档（通常来得及），每 8 秒的定时存档兜底，最坏丢 8 秒。
- 页面本地预测改动的资源点不会被纠正（只有 Worker 改动过的资源点才重发）；目前没有指令会只在本地改资源点。
- 合规影响：未引入新的发布合规依赖（无新权限、无新网络请求、无新第三方代码；Worker 脚本与页面同源）。

---

# P4 第二段（4a 指令统一 / 4b 系统管线 / 4c-2 联机 Worker）

分支 `feature/p4-commands-pipeline`（基于 feature/ai-naval-air d6c62cf），2026-11-24。

## 0. 电脑对电脑统计基线（`scripts/perf/ai-stats.cjs`）
- 脚本：三席位（0 号空观察者），4 组对局 × 6 种子：镜湖 lake_s 专家对专家 25 分钟、专家对普通 15 分钟，断崖古道 cliff_s 困难对普通 15 分钟，潮汐群岛 straits 专家对专家 20 分钟。统计胜负/领先、首次主攻时间、主攻次数、军队（终局/峰值）、村民、时代、渡海登陆、岛屿资源登陆、战舰/飞行单位。子进程并行（`--jobs`），`--root` 可跑别的检出。每步 0.1 s（同 check-ai-naval-air）。
- 基线：`docs/p4/ai-baseline.json`（d6c62cf；跑的过程中发现并修了一个崩溃：海岛图种子 1 运输船返航时 `F.port` 已被清空，`jobFerry` 抛 TypeError，真实对局会直接卡死模拟——基线 worktree 打了同样的一行修复再跑）。
- 遗留问题“海空军改造后陆地图专家对专家 25 分钟主攻变少了吗”：**不是真的回退**。同脚本 6 种子：main b006cf3 座位 1/2 平均主攻 4.17 / 2.83 次（[4,4,5,3,5,4] / [3,3,1,3,4,3]），d6c62cf 4.33 / 3.0（[4,4,5,4,5,4] / [2,3,2,3,6,2]）。上一轮“4 对 0”是单种子噪声。另：镜湖座位 1 系统性强于座位 2（两边都一样），是出生点差异，不是 AI 问题。

## 1. 4a 统一指令接口（已完成）
- `src/commands/index.js`：指令 `{type, team, args}`（实体编码为 `{$e:id}`），TYPES = 原录像 CAPTURED 列表；`check`（座位只能指挥自己活着的单位/建筑）、`dryRun`（和入口同样的前置检查）、`applyCommand`、`drainCommands`、编码/解码。由 `scripts/build-core.cjs` 打成 `public/kingdom-commands.js`（UMD，engine.js 之前加载；11 个页面加了这一个 script），也被 kingdom-core.js / sim-worker.js 直接 import。录像 `replay.js`、Worker `host.js` 改为通过 `applyCommand` 执行玩家指令。
- 电脑在“AI 阶段”运行（`sim.aiScope`）：所有入口（order/construct/train/research/…）在 AI 阶段不执行，而是写入 `s.commandQueue`（状态的一部分，存档、快照、锁步都带着），AI 立即拿到 dry-run 结果（放置/费用/前置），下一步第一件事执行（单机、Worker、联机电脑座位同一路径）。只有 `AI_TYPES` 能在 AI 阶段下，其它（聊天、外交…）直接抛错。
- AI 不再改单位字段：harass 标记、撤退点、海岛村民、改派冷却、侦察标记、协作期限挪到 AI 记忆 `s.aiUnits[id]`；直接写 `u.order=null` 改为新指令 `{type:'stop'}`（运输船的 stop 同时取消待登船）；电脑兵种选择（原 train 覆盖）改为下指令时决定（`aiTrainKind`）；建造营地/卸船等“下完马上看结果”的逻辑改为下一次运行再看（营地按坐标找回 id，卸船分两次运行）。
- 验收 `check-ai-commands.cjs`（已入 check-all）：镜湖 300 s + 海岛 420 s，每次 AI 阶段前后对整份状态（除 AI 记忆、指令队列、随机数）比对，**0 处直接改动**；队列下一步全部执行；伪造他人单位的指令被拒；带未执行指令的快照恢复与对等端一致，丢掉队列则不同。
- 统计（`docs/p4/ai-stats-4a.json` 对比基线，6 种子均值）：镜湖专家对专家主攻 4.3/3.0 → 4.3/3.3，首攻 522/551 → 570/492 s；专家对普通主攻 2.5/1.7 → 2.0/1.5，专家 6 局全部领先（同前）；断崖困难对普通 1.8/1.8 → 2.0/1.8；海岛专家对专家登陆 25 → 24 次，主攻 2/1.2 → 2/1。胜率与节奏在噪声内。
- 统计过程中暴露并修了两个**原有**的 AI 卡死问题（只是种子变了才显出来）：①电脑把塔/房子放进城镇中心周围最后一个缺口，把自己整个基地围死（村民交不了货、兵出不去，该座位整局 0 次进攻）——电脑下建造指令前检查新建筑会不会把周围的通路切断（`aiPlacementSplits`，45×45 格局部连通性）；②背着货却到不了任何收集点的村民永远站着，资源规划还不断往那里派人——新 AI 行为 `stranded-cargo`（走注册点）在他们旁边建对应的收集场。
- 录像校验值：4 段标准录像全部重录（`make-fixtures.cjs`），**原因只有一个**：电脑的指令晚一步执行，第一处不同都在第 160 步（8 s，电脑第一次思考之后），玩家指令序列逐条相同；consistency 页面的 3 段录像同理重录。
- 已有检查里依赖“AI 立刻生效”或单样本的断言改为读 AI 记忆 / 三种子均值（check-ai-phase1/2、companions、economy、worlds、ai-humanlike、ai-naval-air 第 1 节飞行单位改为“训练飞行单位或开建飞艇工场”），均在提交说明里写明。
- 发现但未改：`networkHydrate` 恢复时会把各队迷雾一次全刷新，恢复出的状态与连续运行的状态在约 30 s 后分叉（d6c62cf 上同样）。锁步靠“所有端在快照回合一起规范化”不受影响，但“从存档恢复 == 从没中断”目前不成立。
