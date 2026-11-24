# P4 依赖盘点：模拟层对浏览器全局的依赖

分支 `feature/p4-sim-worker`（基于 main 9278395），2026-11-24。对应 `docs/architecture/redesign-plan.md` P4 第一段（4c-1 及准备）。
方法：对模拟链上的每个文件 grep `window / document / KingdomArt* / performance.now / Math.random / Date / localStorage / sessionStorage / location / navigator / setTimeout / requestAnimationFrame / Image / matchMedia / btoa / atob / crypto / fetch / WebSocket` 等，再逐处读上下文。结论用 `public/sim-worker.js`（同一份源码在 Worker 里运行）和 `check-sim-worker.cjs`（4 段录像主线程与 Worker 校验值序列逐个相同）验证。

## 1. 模拟链（require 链，即 Worker 打包进去的文件）

`little-ant.js → network-model.js → ai-humanlike.js → frontier-v40.js → roster.js → commander.js（+ direction.js）→ wildlands.js → economy.js → terrain.js → guardians.js → clarity.js → campaign.js → companions.js → tactics.js → fortification.js → siege.js（+ art-profiles.js）→ frontiers.js → worlds.js → dynasties.js → coalitions.js → empires.js → engine.js`，共 23 个文件；`network-commands.js`（联机指令规则）不在单机链上，但同样无浏览器依赖（4c-2 联机进 Worker 时打包进去）。

页面加载顺序（index.html）与 require 链一致；链外的脚本**没有**改动 `KingdomSim.Sim.prototype` 或 `KingdomSim.defs`（已 grep 全部 UI/美术脚本确认），所以 Worker 里的模拟与主线程的模拟是同一份行为。唯一的主线程包装是 `kingdom-core.js` 的 `RecordedSim`（录像录制，不改行为）；Worker 里由 `src/sim/host.js` 自己挂同一个录制器。

## 2. 逐项依赖与处理

| # | 位置 | 依赖 | 用途 | 在 Worker / Node 中 | 处理 |
|---|---|---|---|---|---|
| 1 | 全部 23 个文件末尾 | `(typeof window!=='undefined'?window:globalThis)`，`root.KingdomSim=api` | 模块导出（无 module 时挂全局） | Worker 打包走 CommonJS 分支（esbuild 提供 `module`），不挂全局 | 不改。P4b 迁 `src/` 时改为 ES 模块导出 |
| 2 | engine.js `findPathAStar`（2 处）、`tick` 碰撞段 | `window.PerformanceAudit`、`performance.now()` | `?perf=1` 诊断：寻路展开数、碰撞耗时 | `window` 不存在 → 诊断关闭，`performance.now` 不调用 | 不改（已是 `typeof window` 守卫，只读计时、不影响状态）。代价：`simWorker=1` 时 HUD 的寻路/碰撞/迷雾分项为空；Worker 自己统计每步耗时（`stats.worker`）。4b 改为向注册表上报的计时钩子 |
| 3 | worlds.js `updateFog` | `window.PerformanceAudit`、`performance.now()` | 迷雾耗时诊断 | 同上 | 同上 |
| 4 | siege.js `artProfiles()` | `root.KingdomArtProfiles` / `require('./art-profiles.js')` | 建筑占地尺寸（`sizes`，纯数据） | 打包进 Worker | 不改。art-profiles.js 是纯数据+纯函数，无 DOM。4b 把尺寸表移到 `core/` |
| 5 | network-model.js `packBits/unpackBits` | `btoa` / `atob` | 联机精简视图的迷雾位图编码 | Worker 与 Node ≥16 都有 | 不改（单机 Worker 不调用） |
| 6 | worlds.js / engine.js | `K.activateWorld(world)` 模块级“当前地图”变量（`K.map` 尺寸） | 地图尺寸、地形查询 | 每个线程一份，互不影响 | 不改；页面代理在接管时 `activateWorld` 一次（同一张图） |
| 7 | network-model.js、engine.js、siege.js | 模块级缓存（导航网格 `navCache`、寻路备忘、地形掩码） | 性能缓存，不进存档、不进校验值 | 每线程一份 | 不改；页面代理收到 `navRev` 变化时丢弃自己的网格副本 |
| 8 | little-ant.js、companions.js | 加载时向 `K.defs` 加 `ant` / `panda` | 彩蛋单位定义 | 同一份代码在两边都执行 | 不改 |
| 9 | roster.js | 注释中出现 `Math.random`（声明不使用） | — | — | 无依赖。全链**没有** `Math.random`、`Date`、`localStorage`、`document`、`location`、`navigator`、定时器、`requestAnimationFrame` |

结论：模拟层没有必须搬家的浏览器依赖，只有两类“可选诊断”读 `window.PerformanceAudit`。这也是 P1 能在 Node 里逐位复现的原因。

## 3. 页面侧对模拟的依赖（模拟进 Worker 后要改走快照/消息的地方）

| 页面代码 | 读/写 | simWorker=1 时的处理 |
|---|---|---|
| expansion.js `frame()` 调 `sim.tick(.05)`、`A.captureMotion(sim)` | 写 | 改为 `SW.request(n)`（步数由 `src/core/clock.js` 决定）+ `SW.pump(now, captureMotion)` 应用快照 |
| expansion.js / UI 模块读 `sim.state`（s）、`byId`、`stat`、`canSee`、`hostile`、`sea`、`builder`、`view(0)`、`unitError`、`researchError`、`placementError`、`costFor` 等（约 60 个查询方法） | 读 | 不改：页面上的 Sim 实例变成**代理**，`sim.s` 每帧换成 Worker 发来的快照，查询方法照常在快照上运行 |
| 玩家入口 `order / construct / constructLine / train / research / setRally / board / unload / assignFish / skill / castSpell / route / claimReward / setDifficulty / sendChat / pact / add / 外交 4 项`（= P1 录像的 CAPTURED 列表） | 写 | 代理把调用编码成 `{m, a}`（实体写成 `{$e:id}`）发给 Worker；同时在当前快照上本地执行一次（预测），保持同步返回值（toast 文本、`{building}`、`{error}`）；下一帧覆盖。实测 0 条返回值不一致 |
| `sim.events`（expansion.js `consume()` 取完清空） | 读写 | Worker 每帧把新事件发来，代理追加到 `sim.events` |
| `sim.fog`（迷雾渲染、`canSee`） | 读 | 迷雾 revision 变化时 Worker 发各国 visible/explored（Uint8Array）+ 0 号国记忆 |
| `sim.fx()`（UI 点击标记、升级闪光） | 写 | 留在页面本地，跨帧保留到寿命结束 |
| `sim.serialize()` + localStorage（存档） | 读 | 由 Worker 序列化（`SW.save`），回复后由页面写 localStorage；文本格式不变 |
| tactics-ui.js 写 `s.controlGroups`（编队） | 写 | 页面专有键，跨帧保留，存档时随请求带给 Worker |
| tutorial-ui.js 直接改状态（教学） | 写 | 教学用 `replaceSimulation` 换成自己的 Practice 实例 → 释放 Worker，教学留在主线程 |
| network-ui.js / lockstep（新联机） | — | `networkView` / `replaceSimulation` 释放 Worker；联机本段仍在主线程（见 progress.md 4c-2） |
| performance-audit.js（`?perf=1`） | 读 | 仍统计 render/scene；update 段在 Worker 模式下只剩“应用快照”，模拟分项见 Worker 自己的统计 |

## 4. 保持确定性的规则（新代码已遵守）

- Worker 只用 `src/core/clock.js` 的 `STEP = 0.05`；步数由页面决定，但每步内容只取决于“初始设置 + 指令序列”（录像证明）。
- 页面本地预测**不回写** Worker；Worker 是唯一权威，存档与录像都取 Worker 的。
- 帧里的 `units[i].path` 只带前 2 个路点 + 长度（页面只用 `path.length` 判断是否在走），页面恢复为同长度数组，校验值（含路径长度）不变：`check-sim-worker.cjs` 用“只靠帧重建的镜像状态”的校验值与 Worker 比对。
