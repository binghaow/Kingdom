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

## 2. 4b 系统管线（已完成：全部 21 层迁完）
- `public/engine.js`：`addSimLayer(Class, layer, {pre, post})` + `registerSystem({name, before|after, run})` + `runPipeline`。一步 = `commands` → 各层 pre 系统（从最外层类往里）→ 核心系统 → 各层 post 系统（从最里层往外），与原来 `super.tick()` 嵌套的执行顺序逐条相同；pre 系统返回 `SKIP` 等价于原来的“`if(ended)return` 不调 super”（内层和本层 post 跳过，外层 post 照常）。每步一个临时对象 `c` 传递原来 pre/post 之间的局部变量（建造前数量、英雄名单、位置快照……）。
- **21 个模拟层的 `tick` 覆盖全部删除**（脚本化拆分，原代码逐字搬进命名方法，方法里的 `super.xxx` 仍然有效）；engine 的 tick 拆成 `engine.ended / engine.clock / buildings / units / collision / deaths / cleanup / ai.turns`；世界层拆出 `fog`、`ai.scout`，王朝层拆出 `ai.raids`，指挥层拆出 `ai.raidRetreat`。完整顺序（单机 43 个系统）见 `node check-pipeline.cjs` 输出。
- 计时：`sim.profileSystems(true)` / `KingdomSim.profileSystems`，`?perf=1` 的 HUD 多一行“sim systems x ms/step: 前 8 个系统”（只在打开诊断时计时，正常游玩每个系统只多一次空指针判断）。示例（Node，lake_l 4 国，660 s，241 单位）：总 8.21 ms/步 = units（移动+寻路+采集+战斗，同一个单位循环，没法再拆而不改顺序）4.79、collision 1.02、fog 0.57、buildings 0.37、ai.humanlike 0.15、ai.turns 0.14（最大 17.1：电脑思考那一步）……
- 验收：`check-replay` 4 段录像校验值与 4a 完全相同（未重录）；另用 3 局电脑对电脑（cliff/straits/lake，600–1200 s）和一局“打掉对方全部建筑后再跑 900 步”比对 4a 提交与 4b 的整份状态 SHA-1，全部相同。`check-pipeline.cjs`（入 check-all）：模拟层不得再有 tick 覆盖/`super.tick`、顺序、registerSystem 插入位置、计时、结束后跳过内层。
- 性能（Node，`scripts/perf/late-game.cjs 600`，371 单位，与 4a 提交交替各 3 次）：每步均值 9.35/9.00/8.91 → 8.70/9.49/9.50 ms，p95 16.6–17.0 → 16.1–17.8 ms，在本机噪声内（完整 release-check 见报告）。
- 剩下没做：`window.PerformanceAudit` 的寻路/碰撞/迷雾两处旧计时钩子仍在（只在页面主线程有效）；Worker 模式下 HUD 看不到系统分项（Worker 自己可以 `profileSystems`，没接到 HUD）；units 系统内部（移动/寻路/战斗）要等 P5 的数据重排才能拆开。

## 3. 4c-2 联机模拟进 Worker（本段未做）
- 原因：本次额度优先给 4a（含统计中发现的三个 AI 卡死问题）和 4b；按优先级 0→1→2→3 停在可发布的 4a/4b。
- 计划不变（见第一段 4.4c-2）：`LockstepClient` + `network-commands` + 快照/追帧放进 `src/sim/host.js` 的新消息类型（`lsInit / lsTurn / lsIssue`），传输层（`auto-transport.js`）留在主线程，收到的回合 `postMessage` 进 Worker；渲染副本用 Worker 生成的 slim 视图（`networkSnapshot` 同格式），`KingdomNetworkClient.apply` 不变；开关仍是“多线程”设置 + `?simWorker`，默认关。现在 4a 已让电脑座位的指令成为状态的一部分，Worker 里跑联机不需要额外处理电脑座位。
- 验收沿用：check-lockstep / check-lockstep-restore / resilience + “同一联机录像主线程与 Worker 校验值相同” + 2 人带电脑座位的浏览器冒烟（开/关各一次）。

## 4. 交付检查（第二段）
- check-all 69/69（含新增 check-ai-commands、check-pipeline），resilience 单独 PASS；build、check-artifact 通过；release-check 113 PASS / 1 WARN（千兵 >40 ms 步，只记录）/ 0 FAIL（`docs/release-reports/2026-11-25-a6a7aab.md`）；联机冒烟 2 人 + 1 电脑座位 240 校验值一致。
- 未验证：Safari/iPad/iPhone 真机；浏览器里 `?perf=1` 的系统分项只在主线程模拟时显示（Worker 模式未接）；电脑对电脑统计是 Node、每步 0.1 s，不是真实对局的 0.05 s。
- 合规影响：未引入新的发布合规依赖（新增的 `kingdom-commands.js` 是同源脚本，无新权限/网络请求/第三方代码）。

---

# 修复分支 `fix/lobby-buildings-net`（基于 main 038d21c，2026-11-25）：玩家反馈 A/B/C

## A. 新联机约 20 分钟卡死
- 详见 `docs/p3e/stall-20min.md`。本机未能复现（Node 双客户端 21 分钟、headless 浏览器双标签 50 游戏分钟 `docs/p3e/duel-50min-headless.json`、快照归一化/加载/视图路径都一致）。修了两条“socket 活着却永远等”的路径：客户端进度看门狗（等待 > 6 s 且对方未离线 → 静默重连）；中继对“还在发消息但 8 s 不推进”的座位不再等待（`lockstep_seats.moved`）。
- 新增 `check-lockstep-long.cjs`（不进 check-all，约 9 分钟）：20.5 游戏分钟、4 倍时钟、生产 socket 预算、4 次快照，第 12 000 轮连接卡住 6.7 s 自恢复，1230 对校验值一致（`docs/p3e/long-20min.json`）。

## B. 小 bug
- 大厅插图按所选国家显示该国城镇中心（ten-capitals 图集，CSS 背景，保持位图比例）。截图 `docs/art/lobby-buildings/`。
- 磨坊/矿物收集场/伐木营地画得太大：图宽 / 占地直径 2.8–3.2 → 约 2.2（与其它建筑一致），占地 r 与碰撞不变；`functional-buildings-v2.png` 离线抠图（黑底、假透明亮边、杂点、内圈灰带外修 6 px，按建筑重新排版，消除邻格碎片）。**残留**：磨坊左缘仍有少量灰色斑点，彻底干净需要重新出图（docs/art/asset-audit-v2.md 第 14 项）。视觉复核：Claude（本次，生产脚本顺序截图，草地背景）。
- 放置校验：建筑占地边缘离金/石矿中心 ≥ 50 px、离浆果 ≥ 34 px（原 20）。
- 村民在矿边来回走不采：路径终点是 48 px 导航格中心，矿所在格被紧贴的建筑占住时，最近终点在 49–72 px，超出 38 px 采集距离 → 每 1.8 s 重新寻路，永远不采。只在“路径走完且矿格被占”时采集距离放宽到 74 px。`check-gather-reach.cjs`（进 check-all）：收集场 56 px 紧贴、6 个村民同采金矿/石矿，45 s 内每人都有采集量（改前 6 人里 5 人为 0、2 人时全为 0）。
- 录像夹具与 consistency 录像因电脑放置/采集变化（第 160 步起）重录。

## C. iPhone 后期发热（快速部分）
- 省电模式（手机/平板默认开，暂停菜单可切换）：最多 30 帧、暂停/菜单 8 帧、触屏画布倍数上限 1.25。headless 手机上下文：空地后期画出帧 59 → 30，主线程 JS 490–520 → 322–324 ms/s；暂停 297 → 43 ms/s。四军交战时本机 CPU 已满（15–20 帧），上限不起作用。详见 `docs/performance-audit.md`。

## 交付检查
- check-all 70/70 ALL PASS（c3fd8b3；含新增 check-gather-reach）；check-lockstep-resilience 单独跑 PASS（含新增 4b：卡住连接 6.5 s 静默重连、连着不推进的座位 20 s 时对方只等 15.2 s，无接管）；check-lockstep-long PASS。
- `npm run build`、`node check-artifact.cjs` PASS；`npm run release-check`：112 PASS / 2 WARN / 0 FAIL（`docs/release-reports/2026-11-25-c3fd8b3.md`）。WARN：后期 HUD update p50（只重跑后期节 0 WARN，噪声）、千兵 >40 ms 步（P5 前预期）。渲染节单独重跑 0 WARN；release-check 的 phone 视口是触屏，省电模式生效后帧间隔 p50 16.8 → 33.3 ms 属预期（30 帧上限），desktop 默认关、通过。
- 新联机冒烟（`preview.cjs` 8765，两个浏览器标签）：65 秒 72 个校验值一致、ws 无回退、点击到执行 p50 290 ms（`docs/p3e/duel-fix-lobby-buildings-net.json`）。
- 合规影响：无新的发布合规依赖（新图由已有素材离线抠图，无新权限、网络请求或第三方代码）。

## 需要真机验证
- iPhone 新联机 25 分钟以上不再卡死、不需手动重连；如出现“等待…”> 10 s，截图重连诊断。
- 省电模式下后期发热、帧率是否稳在 30、1.25 倍画布清晰度；改了画布分辨率，按 AGENTS.md 须在 iPhone/iPad Safari 玩到后期（≥ 8 分钟、≥ 100 人口）确认战场和小地图不空白。
- 大厅国家插图、新磨坊/矿场图在 Safari 上的显示。

---

# P4 第三段（4c-2 联机模拟进 Web Worker + Worker `?perf=1` 系统分项）

分支 `gemini/p4-lockstep-worker`（基于 `codex/android-playtest` `314672c`），2026-11-27。对应 `docs/architecture/redesign-plan.md` P4 剩余项 `4c-2`。**玩法、数值、存档格式和默认主线程路径未改**（开关仍为 `?simWorker=1` 或聊天“多线程”设置，默认关闭）。

## 1. 做了什么

### 1.1 联机锁步模拟进 Web Worker（`4c-2`）
- `src/sim/worker.js`：引入 `public/network-commands.js` 并传给 `createHost`，与已有 `public/little-ant.js`（含 `K.NetworkSim`、`K.networkSnapshot`、`K.networkPersistent`、`K.networkHydrate`）同打进 `public/sim-worker.js`（未压缩 678.2 KiB）。
- `src/sim/host.js`：新增联机消息处理 `lsInit / lsStep / lsLoadSnapshot / lsChecksum`（复用同一份 `src/net/lockstep.js` `LockstepClient`，无重复模拟逻辑）；回合执行、追帧、每 20 步校验、每 5 分钟快照归一化、`loadSnapshot` 校验和 `K.networkSnapshot(..., { slim: true, have })` 视图生成全部在 Worker 线程内运行。`postMessage` 结构化克隆直接给出副本，主线程不再执行 `JSON.parse(JSON.stringify(v))`。
- `src/net/worker-lockstep.js`：浏览器侧代理 `startWorkerLockstep`。网络传输层（`AutoTransport`：WebSocket / HTTP）、快照 HTTP 收发（`attachSnapshots`）和渲染副本（`KingdomNetworkClient`）留在主线程不变；代理同步维护时钟、RTT、延迟缓冲、出队指令、校验队列、等待/接管状态，把新到的回合行发给 Worker 并接收 `lsFrame`。新增 `prepareSave()` 在联机存档前向 Worker 取当前精确步校验值，确保 `makeSave()` 产出与主线程同格式的合法存档。
- `src/net/browser.js`、`src/index.js`：`startBrowserLockstep` 在 `opts.worker` 开启且浏览器支持 `Worker` 时走 `startWorkerLockstep`（构造失败自动回退主线程）；`core.lockstep.start` 沿用 `simWorkerWanted`（`?simWorker=1` 或 `localStorage['kingdom-sim-worker']==='1'`），默认关闭。
- `src/net/snapshots.js`、`src/net/saves.js`、`public/network-ui.js`：`attachSnapshots` 中 `loadSnapshot` 改为 `await`（兼容主线程同步与 Worker 异步）；`makeSave` 兼容无本地 `client.sim` 的 Worker 代理；`saveOnline` 保存前调用 `lockstep.prepareSave?.()`。

### 1.2 Worker `?perf=1` 系统分项与零 `window` 诊断钩子
- `public/engine.js` 新增 `setPerfSink / getPerfSink`（保持对测试脚本设置 `window.PerformanceAudit` 的向后兼容），`public/worlds.js` 改用 `K.getPerfSink?.()`；模拟层不再直接依赖 `window.PerformanceAudit`。
- `src/sim/host.js` 新增 opt-in 消息 `{t:'profile', on}`（`init` / `lsInit` 亦可带 `profile`），仅在开启诊断时调用 `K.profileSystems(true)` 并挂载 Worker 侧 `perfSink`（`findPath / getGrid / collision / fog`），在帧中附带 `sysProfile` 与 `diag`；关闭时完整卸载，正常游玩零开销。
- `src/sim/client.js`（单机 Worker）与 `src/net/worker-lockstep.js`（联机 Worker）均提供 `setProfile(on)` / `takeSystemProfile()` 并将 `diag` 转发给 `PerformanceAudit.mergeWorkerDiag`。
- `public/performance-audit.js`：`instrument(on)` 同步设置 `K.setPerfSink` 并通知单机/联机 Worker 开关，`systemsLine()` 优先读取 Worker 系统分项并标注 `sim systems (worker) Xms/step: ...`。

### 1.3 单机 Worker 帧快照增量优化（`units` / `buildings` 字段级 delta）
- `src/sim/frames.js`（`FRAME_VERSION = 2`）：在原有 `nodes` 增量和 `path` 截断基础上，把 `units` 和 `buildings` 改为字段级增量 `{add, patch, order}`——静止单位 0 字节、移动/交战单位只发变化字段（对 `path` / `drift` / `cargo` / 平坦 `order` 做零分配值比较，检测键删除 `$d`）；接收侧 `createFrameMirror` + `applyFrameState` 原地更新镜像并复用持久 `nodes` Map（不再每帧重建 600 项 Map 或二次浅拷贝实体）。
- `src/sim/client.js`：`pump()` 插值采集后立即还原 `u.x/u.y`；玩家下达指令做本地预测前按需惰性拷贝 `s.units` / `s.buildings`（`detachForPrediction`），保证正常帧零拷贝且镜像不被预测污染。

## 2. 验证结果（本机 Windows，Node 模拟 + 本地 Chrome headless 浏览器）

### 2.1 单机 Worker 快照前后对比（Node，`node scripts/perf/worker-frames.cjs 300`，397 单位后期场景，同机实测，`docs/p4/worker-frames-delta.json`）

| 指标 | 改前（整份 units/buildings） | 改后（字段级 delta + 零拷贝应用） | 变化 |
|---|---|---|---|
| 每帧字节 均值 / p95 / 最大（v8 序列化） | 178,125 / 266,882 / 288,127 B | **41,784 / 130,294 / 140,034 B** | **-76.5% / -51.2% / -51.4%** |
| 20 帧/秒折合带宽（线程间内存复制） | 3,479 KB/s | **816 KB/s** | **-76.5%** |
| `units` 分项 / `buildings` 分项 | 159,113 B / 5,057 B | **19,022 B / 339 B** | **-88.0% / -93.3%** |
| 接收方解码（`v8.deserialize`）均值 / p95 | 7.91 / 12.29 ms | **2.44 / 6.18 ms** | **-69.2% / -49.7%** |
| 页面应用（`applyFrameState`）均值 / p95 | 2.14 / 4.62 ms | **0.87 / 2.59 ms** | **-59.3% / -43.9%** |
| 主线程接收总耗时（decode + apply 均值） | 10.05 ms | **3.31 ms** | **-67.1%（3.04× 提速）** |
| 三方校验值（主线程 / Worker / 镜像） | 一致 `753fa5de` | 一致 `753fa5de` | 逐位一致 |

注：本机 Windows Node 计时绝对值受 CPU 负载影响（两次测试主线程每步均值分别为 33.4 ms 与 55.1 ms），上述改善在后一次更高 CPU 负载下仍成立；为 1000 单位阶段主线程解码留出充足预算（下一步进一步压缩待 P5 列存 TypedArray + Transferable/SAB）。

### 2.2 Node 逻辑与一致性检查
- `npm run build`、`node check-browser-syntax.cjs`（119 个浏览器 JS）、`node check-core-bundle.cjs`、`node check-artifact.cjs`（含 `dist/client` 核心包与 Worker/D1 检查）：**PASS**。
- 新增 `node check-lockstep-worker.cjs`（已加入 `check-all.cjs`）：使用 Node `worker_threads` 运行真实打包的 `public/sim-worker.js`，3 国（2 真人 + 1 电脑）220 轮含玩家指令与系统指令（`aiTakeover`/`aiRelease` 含 0 号位 caretaker），不规则批次 + 17 帧 `slim` 视图展开：22 组校验值序列、4 条指令回执、4 条接管事件、最终校验值（`56f3ab93`）与主线程 `LockstepClient` 完全一致；快照加载校验、篡改哈希拒收、加载后再跑 40 轮校验值（`6471ba90`）与主线程完全一致；`profile: false` 不输出、`profile: true` 输出命名系统耗时：**PASS**。
- `node check-sim-worker.cjs --node-only`（4 段标准录像主线程与 delta 帧镜像校验序列全部一致）：**PASS**。
- `node check-lockstep.cjs`（使用本机 `.release-tools/node_modules/ws` 与 loopback，7 项全过：relay 规则、旧房间未改、4 客户端大厅 60 s、HTTP 抖动+丢包、WS on D1 断线重连 5/5、DO 适配器、无 WS 回退 HTTP）：**PASS**。
- `node check-lockstep-restore.cjs`（5.5 分钟存档 turn-3000 快照恢复、房主单人恢复、从 0 回放对比）：**PASS**。
- `node check-stuck-units.cjs`、`check-pipeline.cjs`、`check-ai-commands.cjs`、`check-replay.cjs`、`check-network.cjs`、`check-lobby.cjs`、`check-netcode.cjs`：**全部 PASS**。

### 2.3 本机 Chrome Headless 浏览器冒烟（非物理真机）
- 单机 `?simWorker=1` 冒烟（`node scripts/sim-worker/play-smoke.cjs`）：建造、训练、升时代、小蚂蚁/小熊猫、攻击、暂停存档、刷新续玩、`coast_s-2p` 60/60 校验值一致（`1295b3dc`），`applyMsMean: 0.32 ms`，`mismatches: 0`，0 错误、无回退：**PASS**。
- 单机 `?simWorker=1&perf=1` HUD 验证：真实页面 HUD 正常输出 `collision 0.6ms 68/702 pairs` 与 `sim systems (worker) 3.7ms/step: units ... · fog ... · collision ...`，0 页面错误：**PASS**。
- 联机 2 真人 + 1 电脑座位（`preview.cjs` + `scripts/lockstep/browser-duel.cjs`，45 s，WebSocket 无回退）：
  - **全 Worker + `?perf=1` + 存档**（`docs/p4/duel-4c2-worker.json`）：`workerActive: {A:true, B:true}`，94 对校验值全部一致（末步 `1880: c6609f57`），0 错、0 失败；`perfOk: true`（HUD 显示 `sim systems (worker)`）；实机暂停点击“保存联机进度”生成合法存档（`turns: 581, hash: 676fe53b, valid: true`）；点击到执行 20/20（p50 403 ms）；Worker 内 `viewMsAvg` 4.12 / 4.16 ms（主线程无需 JSON 深拷贝）。**PASS**。
  - **全主线程对照**（`docs/p4/duel-4c2-main.json`）：`workerActive: {A:false, B:false}`，57 对校验值全部一致（`1140: b5aa9688`），0 错；主线程 `viewMsAvg` 5.64 / 5.65 ms（max 13–18.2 ms）。**PASS**。
  - **混排互通（A 开 Worker / B 走主线程）**（`docs/p4/duel-4c2-mixed.json`）：`workerActive: {A:true, B:false}`，54 对校验值全部一致（`1080: 3ef8ab16`），0 错。**PASS**。
- 联机 Worker 浏览器快照恢复（`scripts/lockstep/browser-restore.cjs --sim-worker --after 20`，`docs/p4/restore-4c2-worker.json`）：双标签均在 Worker 中下载并校验 turn-3000 快照（78 KB，747 / 704 ms），离线追帧到存档点 turn 3300 校验值 `cf933cc1` 与存档完全一致，续玩至 turn 3531/3536 共 30 对校验值全部一致，0 错：**PASS**。

## 3. 未验证项目与限制
- `check-lockstep-resilience.cjs` 在本机 Windows 两次运行中遇到环境计时断言未通过（全量模式 `outage` 2x 时钟下 seat 1 未在 110 s 结束前完成 `aiRelease`；`--quick` 模式 120 s 仅触发 1 次计划重连未达 `>=2` 门槛）；该脚本运行主线程 `headless-client.cjs`，待在基线环境复核，不能据此宣称完整 resilience 通过。
- 本分支尚未运行全量 `node check-all.cjs`（全 71 项）和完整 `npm run release-check` 性能报告，也未做真机 UI 审计（`frontier-ui-audit`）。
- **Safari / iPad / iPhone / Android 真机未测**：Worker 联机启动、切后台/锁屏恢复、长局内存、弱网与发热仍需真机验证；因此 `?simWorker=1` 仍保持默认关闭，不切换默认值、不删除主线程路径。
- 本分支更新了 `public/kingdom-core.js` 和 `public/sim-worker.js`；若后续要打新版 Android 试玩 APK，需重新执行 `npm run android:prepare` 同步 `.local/android-web`（当前未触碰 Android APK 与下载页，不构成已发布或真机验收）。
- 合规影响：未引入新的发布合规依赖（无新权限、无新第三方库、无新增数据采集或远程请求；Worker 与页面同源）。
