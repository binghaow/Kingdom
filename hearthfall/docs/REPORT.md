# Hearthfall 基线审查报告（性能 / 稳健性 / 联机预研）

基线：`team/` 快照（p1–p6 构建为 game.html，约 89 KB）。环境：headless Chromium 153（软件光栅，5 µs 计时器），2 核容器。全部数字由 `bench.js` 生成（原始数据 `bench_baseline.json`，完整表格见文末附录 A）。重跑：`node bench.js <game.html> [--quick] [--only=sim,stress,path,render,ui,soak,det,bugs] [--out=x.json]`。

## 0. 结论（先看这里）

1. **模拟 CPU 不是瓶颈。** AI 对 AI 8 分钟，每 tick 均值 0.06–0.09 ms（p95 0.14 ms，30 tick/s 预算 33 ms，占用 <0.3%）；300 单位 0.2–0.4 ms/tick；单位数 50→600 时 tick 耗时对单位数的 log-log 斜率 ≈ 1.0（线性，没有隐藏的 O(n²)）。iPhone 级 CPU 在 4x 降速下也富余 20 倍以上。**可以放心把模拟扩到 600+ 单位、也能放进 Durable Object 服务器跑影子模拟。**
2. **真正会出问题的只有三类：**（a）寻路“尖峰”——不可达目标的重寻路风暴（300 近战单位围攻被围死的目标：均值 22 ms/tick、p95 33 ms、最大 ≈300 ms 的整帧冻结）和“一次性下令”尖峰（100 个单位攻击同一建筑，单 tick 19–22 ms；300 个 55–75 ms；300 个移动命令在点击处理里同步算 46–54 ms）；（b）**触屏点击丢失**——#info 每 200 ms 整块 innerHTML 重建，训练队列中点“取消”按钮，按住 60 ms 丢 36–43%，150 ms 丢 86%，250 ms 丢 100%；（c）**渲染填充率**——世界底图 + 迷雾两次整屏缩放 blit 占 drawWorld 光栅成本的 ~80%（JS 绘制录制只要 0.4–1.5 ms）。
3. **确定性：** 同种子同输入的两次模拟逐 tick 状态哈希一致（5400 tick 零分歧），渲染/UI 调用不影响模拟——好基础。但 Math.random 10 处、Math.hypot 20 处在模拟路径；仅把 hypot 换成 sqrt 就会在第 670 tick（22 秒）分歧，说明跨引擎（V8/JSC）锁步会很快失同步，必须改。
4. **没有泄漏：** 10 分钟浸泡，byId/units/fx/projs/DOM 节点（稳定 114）/JS 堆（2–3 MB）均平稳。

## 1. Top 10 优化项（按 收益/成本 降序）

| # | 问题 | 测量数据 | 建议改法 | 预计收益 | 文件 | 责任人 |
|---|---|---|---|---|---|---|
| 1 | **触屏/鼠标点击丢失**：`refreshPanels` 在 infoSig 变化（训练进度条、HP 条每 200 ms 都变）时整块 `innerHTML` 重建，按下与抬起之间按钮被替换，浏览器不再派发 click | 选中训练中的 TC：#info 每秒重建 4.4 次、#cmds 每秒 2 次；按住 60/100/150/250 ms 的取消按钮丢失率 36–43%/43–50%/86%/100%（14 次试验）；其他选中状态 #info 约 0.1–0.75 次/秒、#cmds ≈1 次/秒（资源阈值翻转） | 按钮 DOM 只创建一次，之后只改 `textContent`/`style.width`/class/disabled；队列图标按 key 增删子节点；动作改在 `pointerup` 且按稳定节点上触发，或事件委托 `pointerdown` 记录 id、`pointerup` 校验同 id 后执行 | 触屏可用性从“半数点击丢失”到 0 丢失；iPhone/iPad 上架必修 | p6_ui.js `refreshPanels`、`cmds`/`info` 监听 | 工程师 |
| 2 | **不可达目标重寻路风暴**：`goTarget` 对不可达目标仍返回“最接近点”的部分路径，`u.path` 非空 → `o.fails` 永不递增 → 每 0.7–1.0 s 全图洪泛一次，永不放弃；`scanEngage` 还会重新选中同一不可达敌人 | `unreach_300`：均值 22–24 ms/tick、p95 33–37 ms、最大 290–330 ms、30–62 个 tick >33 ms；`unreach_100` 均值 8.2–8.7 ms、p95 14 ms；单次不可达 A* = 0.9 ms、展开 5849 节点（≈整张图，7000 上限 > 6400 格 = 无上限） | ① `findPath` 返回 `ok=false` 时计入 fails/黑名单（目标 id+帧），冷却 3–5 s；② 重寻路节流：目标位移 <2 格且已有路径时不重算；③ 洪泛上限降到 ~1500 节点 + 失败缓存；④ 区域连通标签（flood-fill 连通域 id，建筑落成/摧毁时增量更新），不同连通域直接判不可达 O(1) | 最坏 tick 从 ≈300 ms 降到 <1 ms；消除围攻被围死目标时的整帧冻结 | p3_logic.js `updAttack`、`goTarget`、`findPath`；p4 | 工程师 |
| 3 | **一次性下令尖峰**：N 个单位同 tick 各跑一次 A* + 平滑，O(N) 个 A* 落在同一帧 | 100 单位攻击 TC：首 tick 19–22 ms；300 单位：55–75 ms（>33 ms 预算）；移动命令在点击回调内同步 `goPoint` ×N：100 → 15–22 ms，300 → 46–54 ms；每条路径平滑平均 46 次 los（p95 147，最大 373） | ① 寻路请求队列 + 每 tick 预算（如 ≤2 ms 或 ≤6 次），未轮到的单位先朝目标直线走；② 同命令同目标只算一次（组共享路径 + 队形偏移）或按目的地做流场；③ `smoothPath` 改“从当前点向前贪心延伸”避免 O(P²) los；④ A* goalFn 内 `Math.hypot`→平方比较 | 首 tick 尖峰 → <3 ms；手机上 300 单位下令不掉帧 | p3 `buildPath`/`smoothPath`/`goPoint`，p6 `commandAt`/`attackMoveAt` | 工程师 |
| 4 | **渲染填充率**：世界 2560² 画布整屏 blit + 迷雾 80×80 放大到 2560² 再整屏 blit，每帧 2 次；DPR=2 时成本 ×4–5 | 软件光栅下 drawWorld flushed：1280×800@1x 11–15 ms；1440×900@2x 41–60 ms；其中世界 blit 5/26 ms、迷雾 blit 5/26 ms（≈80–90%）；JS 录制仅 0.3–1.5 ms；光栅调用 400–2300/帧、路径调用 600–3700/帧；2x 桌面真实帧间隔 55–65 ms（headless 软件光栅，上界；真机 GPU 会好得多，**需 iPhone 实机复测**） | ① 迷雾改为 viewport/8 的小画布（屏幕空间，0.2 s 更新一次），或把迷雾烘进地形瓦片缓存；② 世界底图改 512² 分块（只 blit 可见 4–9 块），同时解决 5120² 超 iOS 单画布上限的隐患；③ 动态分辨率：帧 >14 ms 时 DPR 降到 1.5/1.25；④ 渲染帧率上限 60（ProMotion 120 Hz 会把绘制成本翻倍）；⑤ 中期考虑 WebGL/PixiJS 精灵批绘 | 预计光栅成本 -60–80%；iPhone 稳定 60 fps 的主要杠杆 | p5_render.js `drawWorld`/`buildWorldCanvas`/`updFogImg`/`resize` | 工程师（分块规格需艺术总监确认瓦片尺寸） |
| 5 | **键盘失焦后相机持续滚动**：`keys` 只在 keyup 清除，blur/visibilitychange 不清 | 按住方向键后 blur：400 ms 内 cam.x 500→679–703，`keys.ArrowRight` 仍为 true | `window.blur`/`visibilitychange`/`pointercancel` 时 `keys={}`；Steam 版同理 | 消除 Alt-Tab 后相机飞走 | p6_ui.js 键盘监听 | 工程师 |
| 6 | **确定性前置改造**（联机/回放/存档的地基，现在改最便宜）：10 处 Math.random、20 处 Math.hypot 进模拟；命令在指针事件里直接改状态；`vis` 只算 team 0；`kill()` 里改 UI 的 `sel` | 同种子两次 5400 tick 零分歧；未种子化 70 tick 即分歧；hypot→sqrt 在 tick 670（22 s）分歧；`Math.hypot` 11.6 ns vs `sqrt` 1.8 ns（6.5 倍快） | ① 模拟专用 PRNG（mulberry32，状态入存档）；② `Math.hypot(a,b)` 全部换成 `Math.sqrt(a*a+b*b)`（IEEE 精确，跨引擎一致，也更快）；③ 所有玩家/AI 操作统一成 `{tick,team,type,ids,x,y}` 命令入队，仅在 tick 边界执行；④ `vis` 改成按队伍数组；⑤ `kill()`/`toast`/`uiEnd` 改走 `emit()` 事件，不碰 UI 全局；⑥ `ord.tgt`/`proj.tgt` 序列化为 id；⑦ 每 30 tick 记录状态哈希 | 解锁锁步联机、回放、读档、云端影子模拟；hypot 替换还能省 CPU | p2/p3/p4（Math.random: addUnit/separate/updAttack/scanEngage/spawnPos/findSpot），p6 命令入口 | 工程师 |
| 7 | **小修 bug 集合**（见 §3）：`gmul` 难度采集倍率永不生效；建造压在移动单位上会清掉其命令；`selSet` 删单位后残留；`restuck` 终身累计 | 见 §3 表 | 逐条小改 | 正确性 | p3/p4/p6 | 工程师 |
| 8 | **渲染每帧分配与重复工作**：`dr=[]` + 每实体 `[y,e]` 小数组 + `sort`，闭包 `inV/seen`；小地图每帧把 2560² 世界缩到 300² 并重绘全部点；30 Hz 模拟无插值 | drawWorld 每帧分配 ≈ 6–25 KB（≈0.4–1.5 MB/s @60 fps）；drawMini 每帧分配 5–60 KB、软件光栅 0.6–1.3 ms；`buildWorldCanvas` 启动 20–30 ms | 复用预分配数组 + 按 y 桶排序；小地图底图缓存一次，动态点 5–10 Hz 更新；为单位保存 prevX/prevY，渲染按 acc/STEP 插值（60/120 Hz 下不再“一拍一拍”） | 减少 GC 抖动；手感明显改善；省 ~1 ms/帧 | p5_render.js | 工程师 + 艺术总监（精灵图集化时一并做：树/建筑/单位预渲染为图集，tree 占可见实体最多） |
| 9 | **移动端布局/视口**：基线没有 `<meta name="viewport">`（依赖托管环境注入）；iPhone 横屏模拟下地图画布只有 948×210 CSS px（占屏高 52%，底栏占一半） | 见附录 A4 画布表 | 加 `width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no`；横屏把底栏压缩/折叠成侧栏，地图至少占 70% 高；`safe-area-inset` | 手机可玩性 | p1_head.html CSS/meta | 艺术总监 + 工程师 |
| 10 | **模拟内部小优化**（数值小但最便宜）：`rebuildHash` 每 tick 清空 1600 个桶（占小规模 tick 的 38–42%，41 µs）；`nearestDrop` 每 tick 对每个运回资源的村民全表扫描；`farmers()` 对每个农田扫全体单位；`findEnemy` 无敌人时扫全部建筑；`fx/projs.filter` 每 tick 分配 | 以上合计占小规模 tick 的 ~50%，绝对值 <0.05 ms | 桶用“脏列表”清空或 32 px 链表数组；drop 点缓存到 `ord`；农田计数器；建筑也进空间哈希 | 单位数上到 1000+ 时才有意义；低优先级 | p3 | 工程师 |

**不建议现在做：** 改用 WebWorker 跑模拟（当前 0.1–0.4 ms/tick 没必要）、重写寻路为 JPS/HPA*（先做 #2/#3 的节流和连通域即可）。

## 2. 分项发现（数字版）

### 2.1 模拟 CPU（附录 A1/A2）
- AI 对 AI（seed 42 / 7，normal）累计 1/3/5/8 分钟的 tick 均值：0.058/0.070/0.085/0.093 ms 与 0.040/0.051/0.054/0.051 ms；p95 ≤0.14 ms；偶发 >4 ms 的 tick 8 分钟内 34 个（GC/JIT 抖动，最大 14 ms，不影响 33 ms 预算）。8 分钟内无人获胜；10 分钟后双方人口停在 20–40，AI 经济萎缩（食物 0、闲置村民少），不是性能问题但意味着 AI 对局会陷入僵局。
- 函数占比（包含式，已含计时器开销）：小规模下 `rebuildHash` 38%、`separate` 22%、`updUnit` 15%、`nearU` 11%、`updateFog` 4%、`aiThink` 2.4%（41 µs/次，每秒 1 次）；寻路合计 ~3%。
- 大兵力：battle/eco/pack 150–300 单位均 <0.4 ms/tick；`pack`（300 单位叠在 100×100 px 内）0.34 ms；唯一超标的是 §2.2 的尖峰场景。`separate` + `nearU` 是线性稳定的主成本，空间哈希格 64 px 对半径 20 的查询偏大，可降到 32 px。
- 隐藏线性扫描清单：`findRes`（遍历全部 ress + blds，每次 7.5 µs，调用很少）、`farmers`（O(单位) × 每个农田）、`nearestDrop`（每 tick 每个“运回”村民 O(建筑)，6 万次/8 分钟）、`findEnemy` 末尾遍历全部 blds、`aiThink` 里 `units.filter` ×3 和威胁扫描 O(敌兵×己方建筑)、`tickBld` 塔/TC 的 `nearU(range 170)`。以 300 单位都不构成问题。

### 2.2 寻路（附录 A3）
- A*：2000 对随机点，均值 0.05 ms、p95 0.15 ms、最大 1.2 ms；展开节点均值 247、p95 709；>60 格距离均值 0.12 ms/598 节点。含平滑的 `buildPath` 均值 0.08 ms；平滑后路点均值 3.1。
- 最坏：目标被围死 → 展开 5849 节点、0.9 ms/次（整张图）；7000 节点上限大于 6400 格，等于没有上限。`nearestWalkable` 14 圈全失败 0.016 ms，无碍。
- 重寻路频率：AI 对局寻路 6.4 次/秒均值、p95 21、单秒最多 40、单 tick 最多 10；`updAttack` 对**静态**目标（攻击 TC）也每 0.7–1.0 s 重算一次：`attackTC_300` 中 findPath+smoothPath 占 tick 的 ~65%。
- stuck/repath：`stepPath` 滑墙时 `tryMove` 只要部分成功就不累计 stuck，贴墙原地蹭不会触发重寻路；`restuck` 终身累计（每第 5 次卡住就放弃路径），建议每次下达新命令清零。

### 2.3 渲染（附录 A4）
- drawWorld JS 录制：0.1–1.5 ms；光栅/路径/状态调用数：中期 400–700/600–1000/550–830，300 单位战斗 1850–2300/2900–3700/3100–3500；`drawImage` 仅 2 次/帧但是整屏大块缩放。
- 显存/内存：worldCv 2560×2560×4 = 25 MB（6.55 MP，低于 iOS 16.7 MP 单画布上限，可用）；主画布 DPR 上限 2 → iPhone 横屏 1896×420 = 3 MB（桌面 2x 2816×1320 = 14 MB）；合计约 30–45 MB，远低于 iOS 画布总量上限。**风险在艺术升级：** 若瓦片改 64 px 或 2x 贴图 → 5120² = 100 MB / 26 MP，超过 iOS 单画布上限会静默失败或空白，必须分块（见 #4）。
- 真实帧间隔（游戏自身循环，5 秒）：iPhone 模拟（DPR 上限 2）mean 17.6–18.0 ms、最大 33 ms、无 >34 ms 帧；1x 桌面 mean 18.5–22 ms（战斗 300 单位偶发 67 ms 帧，2 核容器上与浏览器其他线程争用，需实机复测）；2x 桌面软件光栅 61–65 ms/帧（上界，真机 GPU 会好得多）。iPhone 4x CPU 降速、300 单位战斗：JS 录制 5.8 ms，软件光栅 flushed 60 ms，说明“JS 不是问题，填充率是”。
- 小地图：drawMini JS 0.05–0.1 ms，光栅 0.6–1.3 ms/帧；每帧都画不必要（底图可缓存，动态点 5–10 Hz）。
- 无渲染插值：模拟 30 Hz，画面直接用 `u.x/u.y`，60/120 Hz 屏上运动有明显 30 Hz 节拍。

### 2.4 DOM / UI（附录 A5/A6）
- `refreshPanels` 本身很便宜：未变化 0.01–0.03 ms；强制整块重建 0.12–0.21 ms。成本不是问题，**点击丢失**才是（#1）。
- 事件监听：canvas 上 pointer ×4 + wheel（非 passive，必要）、window keydown/keyup/resize、ResizeObserver；小地图每次 pointerdown 动态加 move/up 监听且只在 pointerup 移除（pointercancel 会泄漏监听），建议用 `setPointerCapture` + 固定处理器。
- 内存：10 分钟浸泡无增长（见 A6）。`selSet` 在 `kill()` 里不移除死亡实体（选中 3 个杀 1 个：sel=2、selSet=3），仅影响 HP 条判断，量级可忽略但应同步。

### 2.5 联机预研

**现有“用户旧仓库”方案（只读代码阅读：MULTIPLAYER.md、server/service.cjs、worker/index.js、public/network-model.js、public/network-ui.js）**：服务器权威 + HTTP 短轮询。模拟步 0.1 s；客户端在**上一次响应返回后**再等 350 ms 发下一次请求（`schedule(350)`，所以周期 P = 350 ms + 请求耗时 R）；每次请求在 Worker 里完整执行：D1 读 → gunzip → JSON.parse → hydrate → 追赶若干 0.1 s 步 → 应用命令 → JSON.stringify → gzip → D1 乐观并发写（revision 比较，冲突最多重试 6 次，每次随机睡 10–40 ms 并重读）→ 再为该玩家生成过滤快照返回。4 人房间每秒 ~8–11 次对**同一行**的写，冲突概率高；状态上限 1.5 MB（gzip）。客户端不做任何预测，只显示快照并插值。

**延迟下限模型（非实测，需在线上抽样验证）**：输入到画面反馈 = 等待下一次轮询 U(0,P) + 请求往返 R + 服务器 0.1 s 步量化 U(0,100) + 客户端“落后一个快照”的插值 P。取服务器处理 S=100 ms：

| 网络 RTT | P=350+RTT+S | 最好 | 平均 | 最坏 |
|---|---|---|---|---|
| 40 ms（同城） | 490 ms | ≈140 ms | ≈925 ms | ≈1220 ms |
| 100 ms（典型手机） | 550 ms | ≈200 ms | ≈1075 ms | ≈1400 ms |
| 250 ms（差网络） | 700 ms | ≈350 ms | ≈1450 ms | ≈1850 ms |

（平均 = P/2 + RTT+S + 50 + P；最坏 = P + RTT+S + 100 + P；最好 = RTT+S，客户端无落后。若 D1 冲突重试一次再加 50–300 ms 抖动。）所以朋友反馈“有点卡”与架构下限一致：**即使网络完美，平均也接近 1 秒才看到自己下的命令生效**，而且每次轮询的 Worker CPU/D1 开销随人数和单位数增长。

**三种方案对比（以本项目 30 tick/s、200 单位为例；带宽为估算，命令率取自 AI 实测：经济类指令 ≈2.7 条/秒 + 军队 goPoint ≈1.5 条/秒，人类 150–250 APM ≈ 3–5 条/秒）：**

| 维度 | A. 现有：服务器权威 + HTTP 短轮询 | B. 确定性锁步 + WebSocket 中继（Cloudflare Durable Object） | C. WebRTC DataChannel P2P 锁步 |
|---|---|---|---|
| 输入→执行延迟 | 平均 0.9–1.5 s，最坏 1.2–1.9 s（上表） | 回合 100 ms（3 tick）+ RTT：平均 ≈ 50 + RTT = 90/150/300 ms（RTT 40/100/250），最坏 ≈ 190/250/400 ms；本地点击反馈（光圈/音效/单位应答）立即给 | 回合 66–100 ms + RTT/2：平均 ≈ 50–70 ms（RTT 40），最坏 ≈ 130 ms；4 人网状取最慢者 |
| 带宽/客户端 | 上行小，下行每次完整过滤快照（JSON+gzip，~2 次/秒/人，量级数十 KB/s，未实测） | 上行 ≈0.5–1 KB/s（10 Hz 回合、5 条/秒、选择集只发一次），下行 ≈2–4 KB/s（4 人）；选 200 单位一条命令 ≈ 412 B（id 列表）→ 用“选择集 id”降到 12 B | 同 B，但上行 ×(人数-1) 份（3 人 ≈2–3 KB/s） |
| 抖动 | 轮询周期 + D1 冲突重试，抖动 ±300 ms | 输入缓冲吸收；WS(TCP) 丢包有队头阻塞 200–1000 ms，需自适应输入延迟 | DataChannel 可 unordered/maxRetransmits=0 + 每包冗余最近 K 回合，几乎无队头阻塞；最慢者仍拖全局 |
| 断线重连 | 天然（每次请求带全量快照），重连成本最低 | DO 存“最近检查点 + 命令日志”，重连客户端下载检查点（实测 4 分钟中期 54 单位 gzip 12 KB，动态部分 4.7 KB；300 单位估 ~40 KB）后用 0.1–0.3 ms/tick 快进（33 s = 1000 tick ≈ 0.3 s） | 需对等方发快照；host 掉线则全局中断，需 TURN 之外的信令服务仍在线 |
| 作弊 | 最强（服务器权威 + 按玩家过滤，迷雾不泄露） | 中：DO 可跑影子模拟（实测 ≈0.3 ms/tick ≈ 1% CPU）校验命令（所有权/资源/视野）并做哈希投票；但客户端持有全状态 → 可地图透视 | 弱：无仲裁方，只能互相哈希；透视、篡改本地状态难以阻止 |
| iOS Safari | 无特殊限制 | WS 在页面后台/锁屏约数十秒被系统断开，需重连协议；回前台时按上面“检查点+快进” | RTCDataChannel 支持（iOS 11+），但蜂窝 CGNAT/对称 NAT 常需 TURN（估计 15–20% 连接）；后台同样被挂起；暴露对端 IP |
| 服务器成本/复杂度 | D1 每次轮询读写 + gzip + 完整模拟，成本随轮询线性涨 | DO 常驻 WS（可休眠）；只转发小消息；CPU 极低 | 仅信令 + TURN 流量，最省，但 NAT/防火墙排障最重 |
| 对本项目改造量 | 已有 | 中（需 #6 确定性改造 + 命令队列 + 房间 DO） | 中高（B 的全部 + ICE/TURN + 房主迁移） |

**推荐：B（锁步 + DO 中继 + DO 影子模拟/检查点），保留现有房间/席位/凭据哈希/限流逻辑，D1 只存房间元数据和战绩。** 理由：本模拟极便宜（0.3 ms/tick）又已基本确定性，锁步带宽最低、延迟比现状低一个数量级（~150 ms vs ~1 s）；DO 影子模拟补上校验与断线重连；不要求 NAT 穿透，兼容 iOS。C 作为以后“同城低延迟”可选优化，不作首版。若将来做天梯/公开匹配，需要迷雾防透视，则在 B 的基础上改成“DO 权威 + 15–20 Hz 过滤快照 + 客户端预测”，二进制快照 200 单位 1.6 KB（JSON 4.6 KB）/快照，10 Hz 约 16 KB/s（JSON 46 KB/s），增量/兴趣管理后 5–8 KB/s。

**改造步骤：**
1. 确定性地基（工程师，见 Top #6）：模拟 PRNG、`hypot→sqrt`、命令队列（tick 戳）、按队伍 `vis`、模拟与 UI 解耦、状态以 id 引用序列化（`structuredClone` 全状态仅 ~1 ms，但 `JSON.stringify(units)` 目前因循环引用失败）。
2. 验收：CI 里两个 headless 页面用不同 `Math.hypot` 实现回放同一份命令日志，每 30 tick 状态哈希必须一致；加“故意篡改一个单位位置”检测到分歧的用例。
3. 回放/存档：命令日志 + 种子 = 回放；每 30 s 检查点（~12–40 KB gzip）。
4. DO 房间：复用旧 `service.cjs` 的房间码/席位凭据/限流；WS 回合时钟 10 Hz；自适应输入延迟（2 回合起，按各玩家 RTT p90 调整）；命令白名单与影子模拟校验；每 N 秒收集客户端哈希，不一致则下发检查点强制重同步；断线→重连流程（检查点 + 日志快进）；后台回前台自动重连。
5. 客户端：本地立刻反馈 + 命令按 `执行回合 = 当前回合+延迟` 入队；暂停/变速改为“所有人同意”；AI 补位在 DO 或房主端用同一命令通道。
6. 上线前压测：1–4 人、丢包 5%、RTT 250 ms 的 `tc netem` 场景；Safari 实机测后台恢复。

## 3. 正确性 / 稳健性清单

| 严重度 | 位置 | 问题 | 复现/证据 |
|---|---|---|---|
| 高 | p6 `refreshPanels` + 监听 | 面板整块重建导致 click 丢失 | 见 Top #1，实测丢失率 36–100% |
| 高 | p3 `updAttack`/`goTarget`/`scanEngage` | 不可达目标永不放弃，每 ~0.85 s 全图洪泛；`fails` 因部分路径非空而不增加 | `unreach_100/300`（用 water 环出 1 格口袋 + 敌方村民，N 个长矛兵 attack） |
| 中 | p3 `updAttack` | 静态目标也周期重寻路 | attackTC 场景 findPath+smoothPath ≈ tick 的 65% |
| 中 | p4 `gmul`（p3）/`makeAI` | `gmul` 读 `ais[1]`，单人局 `ais=[AI(team1)]`，`ais[1]` 为 undefined → 难度的采集倍率（0.85/1.15）永不生效 | `newGame('hard')` 后 `gmul(teamIdUnit)=1`，期望 1.15 |
| 中 | p6 键盘 | blur 后 keys 不清，相机持续滚动 | 实测 400 ms 滚动 180–200 px |
| 中 | p3 `placeBuilding`→`nudgeUnits`→`relocateUnit` | 房屋压在移动中的单位上：路径清空，`stepPath` 返回 false，命令变 idle（命令丢失） | 实测 `ordAfter:'idle'` |
| 中 | p3 `updBuild/updGather` 容差 | 到达判定用格中心 ≤24 px，工作判定用单位位置 ≤26 px；被 `separate` 推到格远端（最多 32 px）时 `goTarget` 立刻“已到达”→ 空路径 → `tries++`，4–5 个 tick 后放弃为 idle（拥挤时易发生） | 代码阅读；AI 每秒重新派活所以被掩盖，玩家单位会“莫名发呆” |
| 低 | p3 `stepPath` | `restuck` 终身累计，每第 5 次卡住放弃；`stuck` 仅在完全无法移动时累计 | 代码阅读 |
| 低 | p6 `setSel`/p3 `kill` | `selSet` 不随单位死亡更新 | 实测 sel=2、selSet=3 |
| 低 | p3 `findEnemy` | 玩家单位对敌方建筑不检查 `vis`，可在迷雾内自动锁定建筑（半径受 sight 限制，实际影响小） | 代码阅读 |
| 低 | p6 `doCmd('del')` / Backspace | 无确认直接删除选中单位（计入 lost，无返还） | 代码阅读；触屏无此键 |
| 低 | p3 `tickBld` | 房屋被毁致 pop>cap 时训练队列停滞（已付费资源被占用），无提示以外的处理 | 实测 cap=5、pop=5、队列剩 4，停滞 |
| 低 | p3 `spawnPos`/建造规则 | 农田不受相邻规则约束，可把 TC 围成死胡同；实测 5 块农田围 TC 后新兵仍可达地图角（缝隙存在），完全围死时会 fallback 出生到不可达处 | `trappedSpawn` 实测可达；全封闭路径未覆盖 |
| 低 | p6 小地图 | pointerdown 动态加监听，pointercancel 不移除 | 代码阅读 |
| 信息 | p6 `frame` | `G.over` 后停止 step，键盘命令被 `$('end').hidden` 拦截，点击被 `G.over` 拦截——正确；游戏结束后 AI 不再运行 | 实测 |
| 信息 | p4 AI | 10 分钟对局人口停在 20–40，资源点耗尽（食物 0）后 AI 不扩张/不探索 | 浸泡数据 A6 |
| 信息 | 地图 | 300 个种子：TC 互通 100%，金矿/浆果全部可达，镜像完全对称（0 个非镜像）；2% 树木（最大 12%）被林子包住不可达，无害 | `bugs.mapSanity` |
| 信息 | 触屏 | 点边缘后不残留相机滚动（mouse.in 在 pointerleave 复位）——无问题；但“选中单位后点空地=下命令”，触屏上无法用点空地取消选择 | 代码阅读（UX） |

## 4. 附：交付文件
- `bench.js`（可重复运行的基准/审计，输出 JSON）、`bench_baseline.json`（本次数据）、`DATA.md`（数据表，下方附录）、`statesize.js`/`statesize.json`（全状态序列化体积）、`mktables.js`（JSON→表格）。
- 局限：headless Chromium 无 GPU，渲染 flushed 数字是软件光栅上界；iOS Safari/JavaScriptCore 的 hypot、GC、画布性能必须实机复测（建议把 `bench.js` 的 render 段做成页面内 `?bench=1` 模式在 iPhone 上跑）。联机延迟表是模型值，未对线上 Worker 实测。

---
# 附录 A：完整数据表（由 bench_baseline.json 生成）

## A1. 模拟每 tick 耗时（ms；AI 对 AI，normal，30 tick/s，无渲染）

**seed42**（8 分钟内无人获胜，gameOver=null）

| 累计到 | mean | p50 | p95 | p99 | max | >4ms 的 tick 数 |
|---|---|---|---|---|---|---|
| 1min | 0.058 | 0.040 | 0.120 | 0.415 | 4.68 | 1 |
| 3min | 0.070 | 0.040 | 0.115 | 0.500 | 9.62 | 6 |
| 5min | 0.085 | 0.045 | 0.135 | 0.635 | 14.47 | 17 |
| 8min | 0.093 | 0.045 | 0.140 | 0.945 | 14.47 | 34 |

| 函数（包含式） | 占 tick 时间 | 调用数 | 每次调用 µs | 单次最大 ms |
|---|---|---|---|---|
| rebuildHash | 37.7% | 14400 | 41.71 | 11.02 |
| separate | 21.6% | 552040 | 0.62 | 6.63 |
| updUnit | 15.0% | 552040 | 0.43 | 5.10 |
| nearU | 10.9% | 561480 | 0.31 | 6.63 |
| updateFog | 3.7% | 14400 | 4.11 | 2.67 |
| tickBld | 3.4% | 239480 | 0.23 | 3.92 |
| aiThink | 2.4% | 928 | 41.40 | 11.09 |
| nearestDrop | 1.9% | 60811 | 0.49 | 5.10 |
| findEnemy | 1.1% | 5914 | 3.03 | 4.61 |
| findPath | 1.0% | 3058 | 5.31 | 0.83 |
| goPoint | 1.0% | 410 | 39.09 | 0.85 |
| purge | 1.0% | 14400 | 1.07 | 2.83 |
| goTarget | 0.8% | 2648 | 4.88 | 0.56 |
| smoothPath | 0.5% | 3058 | 2.40 | 0.56 |
| findRes | 0.2% | 492 | 7.54 | 1.32 |
| updProj | 0.2% | 8296 | 0.32 | 0.17 |
| nearestWalkable | 0.0% | 268 | 0.52 | 0.01 |

寻路调用：每秒 mean 6.4 / p95 21 / max 40；单 tick 最多 10 次；8 分钟共 3058 次。AI 经济类指令（造兵/建造/采集/升级）每秒 mean 2.7 / p95 5。

| t(s) | 单位 | 建筑 | 资源点 | fx | byId | 闲置村民 蓝/红 | 人口 蓝/红 | JS 堆 MB |
|---|---|---|---|---|---|---|---|---|
| 60 | 18 | 6 | 334 | 0 | 358 | 0/0 | 9/9 | 2.31 |
| 120 | 28 | 10 | 328 | 0 | 366 | 0/0 | 14/14 | 2.37 |
| 180 | 42 | 15 | 320 | 0 | 377 | 0/0 | 20/22 | 2.46 |
| 240 | 55 | 19 | 314 | 0 | 388 | 0/0 | 26/29 | 2.48 |
| 300 | 53 | 23 | 304 | 8 | 380 | 0/0 | 24/29 | 2.49 |
| 360 | 51 | 23 | 297 | 3 | 371 | 0/0 | 29/22 | 2.49 |
| 420 | 33 | 23 | 291 | 1 | 347 | 0/0 | 31/2 | 2.62 |
| 480 | 37 | 29 | 285 | 0 | 351 | 3/0 | 35/2 | 2.54 |

**seed7**（8 分钟内无人获胜，gameOver=null）

| 累计到 | mean | p50 | p95 | p99 | max | >4ms 的 tick 数 |
|---|---|---|---|---|---|---|
| 1min | 0.040 | 0.035 | 0.060 | 0.075 | 0.12 | 0 |
| 3min | 0.051 | 0.040 | 0.090 | 0.135 | 1.03 | 0 |
| 5min | 0.054 | 0.045 | 0.090 | 0.140 | 3.49 | 0 |
| 8min | 0.051 | 0.045 | 0.085 | 0.130 | 3.49 | 0 |

| 函数（包含式） | 占 tick 时间 | 调用数 | 每次调用 µs | 单次最大 ms |
|---|---|---|---|---|
| rebuildHash | 42.9% | 14400 | 35.52 | 1.91 |
| separate | 21.9% | 482320 | 0.54 | 1.42 |
| updUnit | 11.9% | 482320 | 0.29 | 0.54 |
| nearU | 10.6% | 492560 | 0.26 | 1.00 |
| updateFog | 3.5% | 14400 | 2.90 | 0.07 |
| tickBld | 3.4% | 240600 | 0.17 | 0.30 |
| aiThink | 1.3% | 928 | 16.16 | 1.83 |
| nearestDrop | 1.2% | 46803 | 0.31 | 0.54 |
| findPath | 1.1% | 2281 | 5.91 | 0.25 |
| goPoint | 1.0% | 442 | 27.91 | 0.30 |
| purge | 0.8% | 14400 | 0.63 | 0.04 |
| findEnemy | 0.7% | 6638 | 1.28 | 0.05 |
| goTarget | 0.7% | 1839 | 4.39 | 0.05 |
| smoothPath | 0.4% | 2281 | 1.96 | 0.06 |
| updProj | 0.2% | 4900 | 0.38 | 0.07 |
| findRes | 0.1% | 241 | 3.73 | 0.03 |
| nearestWalkable | 0.0% | 300 | 0.35 | 0.01 |

寻路调用：每秒 mean 4.8 / p95 20 / max 43；单 tick 最多 20 次；8 分钟共 2281 次。AI 经济类指令（造兵/建造/采集/升级）每秒 mean 3.0 / p95 5。

| t(s) | 单位 | 建筑 | 资源点 | fx | byId | 闲置村民 蓝/红 | 人口 蓝/红 | JS 堆 MB |
|---|---|---|---|---|---|---|---|---|
| 60 | 18 | 4 | 322 | 0 | 344 | 0/0 | 9/9 | 2.71 |
| 120 | 29 | 10 | 317 | 0 | 356 | 0/0 | 15/14 | 2.75 |
| 180 | 44 | 14 | 312 | 0 | 370 | 0/0 | 22/22 | 2.83 |
| 240 | 59 | 19 | 303 | 0 | 381 | 0/0 | 30/29 | 2.83 |
| 300 | 59 | 23 | 293 | 8 | 375 | 0/0 | 29/30 | 2.83 |
| 360 | 25 | 24 | 289 | 5 | 338 | 0/0 | 6/19 | 2.85 |
| 420 | 21 | 24 | 284 | 0 | 329 | 0/0 | 3/18 | 2.84 |
| 480 | 26 | 24 | 282 | 0 | 332 | 0/0 | 3/23 | 2.84 |

## A2. 压力场景（ms/tick：mean / p95 / max；一次性下令耗时 issueMs）

| 场景 | 模拟秒 | tick mean/p95/max | 首 tick | 下令耗时 | >16ms | >33ms | 主要耗时（占比） |
|---|---|---|---|---|---|---|---|
| battle_150 | 40 | 0.10 / 0.21 / 4.25 | 2.20 | 5.33 | 0 | 0 | separate 35%, rebuildHash 25%, updUnit 18% |
| battle_300 | 40 | 0.13 / 0.34 / 0.85 | 0.39 | 1.57 | 0 | 0 | separate 44%, updUnit 22%, rebuildHash 15% |
| eco_150 | 30 | 0.13 / 0.26 / 1.35 | 1.35 | 1.97 | 0 | 0 | separate 46%, updUnit 17%, rebuildHash 14% |
| eco_300 | 30 | 0.30 / 0.52 / 1.63 | 1.63 | 1.12 | 0 | 0 | separate 55%, updUnit 16% |
| massmove_100 | 40 | 0.08 / 0.14 / 2.59 | 0.23 | 14.91 | 0 | 0 | separate 41%, rebuildHash 21%, updUnit 13% |
| massmove_300 | 40 | 0.21 / 0.38 / 0.98 | 0.30 | 46.41 | 0 | 0 | separate 54%, updUnit 13% |
| attackTC_100 | 20 | 0.44 / 1.14 / 18.77 | 18.77 | 0.03 | 1 | 0 | updUnit 71%, findPath 42%, smoothPath 23% |
| attackTC_300 | 20 | 1.30 / 3.03 / 73.01 | 73.01 | 0.03 | 1 | 1 | updUnit 73%, findPath 43%, smoothPath 23% |
| pack_150 | 10 | 0.15 / 0.23 / 0.65 | 0.63 | 0.00 | 0 | 0 | separate 49%, updUnit 17%, rebuildHash 13% |
| pack_300 | 10 | 0.34 / 0.52 / 0.87 | 0.58 | 0.00 | 0 | 0 | separate 54%, updUnit 22%, findEnemy 13% |
| unreach_100 | 20 | 8.19 / 13.62 / 95.04 | 95.04 | 0.00 | 5 | 1 | updUnit 97%, findPath 96% |
| unreach_300 | 20 | 22.48 / 33.40 / 290.31 | 290.31 | 0.00 | 502 | 30 | updUnit 97%, findPath 96% |

可扩展性（battle/pack，mean tick ms vs 单位数）：

| 场景 | n=50 / 100 / 150 / 300 / 600  (log-log 斜率 1.05) |
|---|---|
| battle | 0.056 / 0.083 / 0.112 / 0.229 / 0.772 |

| 场景 | n=50 / 100 / 150 / 300 / 600  (log-log 斜率 0.96) |
|---|---|
| pack | 0.087 / 0.091 / 0.191 / 0.324 / 0.858 |

## A3. 寻路

A* 单次（2000 对随机点，3 分钟中期地图）：ms mean/p95/max = 0.05 / 0.17 / 1.25；展开节点 mean/p95/max = 247.18 / 709.00 / 5814.00；未到达 15

| 格距 | 样本 | ms mean/p95/max | 展开节点 mean/p95/max |
|---|---|---|---|
| <10 | 110 | 0.00 / 0.01 / 0.02 | 15.36 / 27.00 / 134.00 |
| 10-30 | 620 | 0.02 / 0.05 / 1.19 | 87.73 / 222.00 / 5814.00 |
| 30-60 | 1042 | 0.06 / 0.15 / 1.25 | 289.69 / 616.00 / 5814.00 |
| >60 | 228 | 0.13 / 0.27 / 0.98 | 598.36 / 1082.00 / 1573.00 |

含平滑的 buildPath：ms mean/p95/max = 0.09 / 0.26 / 1.40；每条路径 los() 调用 mean/p95/max = 46.22 / 147.00 / 373.00；平滑后路点数 mean 3.0。

最坏情况（目标被围死，goalFn 永不成立）：findPath mean 1.53 ms，p95 2.17，展开 5849 节点（≈整张可走地图；7000 上限 > 6400 格，等于没有上限）；经 goTarget 路径 mean 1.36 ms。nearestWalkable 失败（14 圈）mean 0.016 ms。Math.hypot 13.8 ns/次 vs Math.sqrt 1.9 ns/次。

## A4. 渲染（headless Chromium，软件光栅；js=绘制命令录制耗时，flushed=含强制光栅；ms mean / p95 / max）

| 配置 | 状态 | 可见 单位/资源/建筑 | drawWorld js | drawWorld flushed | 世界贴图 blit | 迷雾 blit | drawMini flushed | 光栅/路径/状态 调用 | 分配/帧 |
|---|---|---|---|---|---|---|---|---|---|
| desktop1280x800_dpr1 | mid4min_defaultZoom | 23u/67r/9b | 0.47 / 0.72 / 1.96 | 11.84 / 17.20 / 18.75 | 5.57 | 4.68 | 1.00 / 1.12 / 2.50 | 692/1026/817 | 25K |
| desktop1280x800_dpr1 | mid4min_minZoom | 26u/25r/6b | 0.34 / 1.04 / 2.63 | 10.92 / 11.83 / 17.06 | 5.14 | 5.17 | 0.65 / 0.79 / 2.29 | 391/585/542 | 19K |
| desktop1280x800_dpr1 | battle300_defaultZoom | 186u/25r/0b | 1.35 / 3.46 / 5.52 | 14.80 / 19.94 / 21.23 | 4.72 | 4.80 | 0.76 / 0.97 / 2.42 | 2005/3218/3264 | 1K |
| desktop1280x800_dpr1 | battle300_minZoom | 190u/64r/1b | 1.22 / 1.74 / 5.73 | 13.29 / 14.59 / 20.78 | 5.39 | 4.94 | 0.95 / 1.25 / 2.59 | 2298/3690/3504 | 5K |
| desktop1440x900_dpr2 | mid4min_defaultZoom | 23u/70r/9b | 0.57 / 0.79 / 5.00 | 56.90 / 64.30 / 80.28 | 26.78 | 26.48 | 0.79 / 1.10 / 2.57 | 710/1056/832 | 7K |
| desktop1440x900_dpr2 | mid4min_minZoom | 29u/48r/8b | 0.49 / 0.86 / 1.60 | 41.16 / 51.23 / 60.51 | 14.03 | 23.85 | 0.98 / 1.16 / 2.60 | 590/870/744 | 6K |
| desktop1440x900_dpr2 | battle300_defaultZoom | 186u/26r/0b | 1.29 / 2.33 / 9.22 | 60.02 / 74.20 / 88.83 | 25.87 | 25.90 | 0.71 / 0.78 / 2.28 | 2011/3228/3269 | 7K |
| desktop1440x900_dpr2 | battle300_minZoom | 190u/65r/1b | 1.54 / 2.73 / 6.31 | 48.74 / 65.59 / 74.72 | 14.13 | 23.58 | 0.76 / 1.01 / 2.40 | 2304/3700/3509 | 10K |
| iphone_dpr3 | mid4min_defaultZoom | 18u/43r/6b | 0.39 / 0.95 / 2.80 | 13.11 / 17.18 / 22.29 | 5.43 | 5.38 | 0.71 / 0.95 / 2.08 | 495/697/610 | 19K |
| iphone_dpr3 | mid4min_minZoom | 3u/9r/1b | 0.10 / 0.16 / 0.48 | 8.52 / 8.76 / 10.11 | 2.74 | 5.37 | 0.61 / 0.69 / 1.88 | 94/155/108 | 12K |
| iphone_dpr3 | battle300_defaultZoom | 186u/0r/0b | 0.97 / 1.35 / 3.23 | 15.11 / 16.51 / 18.20 | 5.62 | 6.06 | 0.84 / 1.01 / 2.85 | 1852/2935/3140 | 24K |
| iphone_dpr3 | battle300_minZoom | 186u/4r/0b | 1.44 / 3.95 / 8.09 | 13.86 / 20.91 / 31.16 | 3.03 | 5.45 | 1.29 / 1.30 / 15.27 | 1879/3008/3159 | 60K |
| iphone_dpr3 | battle300_minZoom_cpuThrottle4x | 186u/4r/0b | 5.83 / 9.61 / 15.07 | 59.76 / 70.77 / 87.06 | 14.18 | 24.95 | 4.43 / 5.71 / 14.76 | 1879/3008/3159 | 6K |

| 配置 | 画布 CSS | backing | DPR(上限2) | worldCv | world MB | buildWorldCanvas ms |
|---|---|---|---|---|---|---|
| desktop1280x800_dpr1 | 1248x560 | 1248x560 (2.7MB) | 1 | 2560x2560 | 25 | 29.8 |
| desktop1440x900_dpr2 | 1408x660 | 2816x1320 (14.2MB) | 2 | 2560x2560 | 25 | 21.6 |
| iphone_landscape_874x402_dpr3 | 948x210 | 1896x420 (3.0MB) | 2 | 2560x2560 | 25 | 23.4 |

真实帧间隔（游戏自身循环运行 5 秒，rAF 间隔 ms）：

| 配置 | 场景 | 帧数 | mean | p95 | max | >34ms 帧数 |
|---|---|---|---|---|---|---|
| desktop1280x800_dpr1 | mid_game_5s | 273 | 18.5 | 33.3 | 66.7 | 1 |
| desktop1280x800_dpr1 | battle300_5s | 226 | 22.3 | 33.3 | 66.7 | 2 |
| desktop1440x900_dpr2 | mid_game_5s | 83 | 61.3 | 83.3 | 83.3 | 82 |
| desktop1440x900_dpr2 | battle300_5s | 78 | 65.3 | 66.7 | 100.0 | 77 |
| iphone_landscape_874x402_dpr3 | mid_game_5s | 287 | 17.6 | 33.3 | 33.3 | 0 |
| iphone_landscape_874x402_dpr3 | battle300_5s | 279 | 18.0 | 33.3 | 33.3 | 0 |

## A5. UI / DOM

| 选中状态 | #info 重建/秒 | #cmds 重建/秒 |
|---|---|---|
| none | 0.12 | 0.00 |
| oneUnitMoving | 0.75 | 1.00 |
| tcWithQueue | 4.37 | 2.00 |
| barracksQueue | 0.12 | 1.00 |
| group20 | 0.12 | 1.00 |

| 选中状态 | refreshPanels 未变化 ms mean/p95/max | 强制重建 ms mean/p95/max |
|---|---|---|
| none | 0.01 / 0.01 / 0.23 | 0.02 / 0.03 / 1.33 |
| oneUnit | 0.01 / 0.01 / 0.36 | 0.20 / 0.28 / 8.31 |
| tcWithQueue | 0.02 / 0.02 / 0.41 | 0.23 / 0.36 / 5.99 |
| group60 | 0.03 / 0.04 / 2.48 | 0.12 / 0.17 / 2.96 |

| 按下到抬起 | 试验 | 点击送达 | 丢失率 |
|---|---|---|---|
| hold60ms | 14 | 8 | 42.9% |
| hold100ms | 14 | 7 | 50% |
| hold150ms | 14 | 2 | 85.7% |
| hold250ms | 14 | 0 | 100% |

键盘失焦：blur 后相机继续滚动 = true（cam.x 501 -> 703 / 400ms）。触屏点边缘残留滚动：mouse.in=false（无问题）。

## A6. 10 分钟浸泡（双方 TC 无敌，每模拟秒调用一次 drawWorld/drawMini/refreshPanels）

| t(s) | 单位 | 建筑 | 资源点 | projs | fx | byId | selSet | DOM 节点 | JS 堆 MB | 闲置村民 | 剩余 木/食/金 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 8 | 2 | 368 | 0 | 0 | 378 | 1 | 90 | 1.92 | 4/4 | 41280/2520/6000 |
| 60 | 18 | 4 | 368 | 0 | 0 | 390 | 1 | 117 | 2.32 | 0/0 | 41014/2290/6000 |
| 120 | 28 | 10 | 364 | 0 | 0 | 402 | 1 | 118 | 2.45 | 0/0 | 40568/1939/5985 |
| 180 | 43 | 15 | 356 | 0 | 0 | 414 | 1 | 118 | 2.54 | 0/0 | 39997/1546/5815 |
| 240 | 58 | 19 | 347 | 0 | 0 | 424 | 1 | 118 | 2.59 | 0/0 | 39323/1019/5568 |
| 300 | 59 | 23 | 339 | 1 | 2 | 421 | 1 | 114 | 2.61 | 0/0 | 38436/726/5274 |
| 360 | 47 | 24 | 331 | 1 | 2 | 402 | 1 | 114 | 2.67 | 0/1 | 37484/629/5007 |
| 420 | 38 | 24 | 323 | 2 | 1 | 385 | 1 | 114 | 2.78 | 0/0 | 36571/595/4713 |
| 480 | 37 | 24 | 315 | 0 | 0 | 376 | 1 | 114 | 2.78 | 0/0 | 35637/595/4411 |
| 540 | 47 | 24 | 306 | 0 | 0 | 377 | 1 | 114 | 2.94 | 0/0 | 34752/571/4110 |
| 600 | 39 | 23 | 300 | 2 | 9 | 362 | 1 | 114 | 2.94 | 0/0 | 33937/542/3811 |

| 分钟 | tick mean | max |
|---|---|---|
| 1 | 0.070 | 4.4 |
| 2 | 0.055 | 1.1 |
| 3 | 0.055 | 0.7 |
| 4 | 0.065 | 1.7 |
| 5 | 0.101 | 7.9 |
| 6 | 0.087 | 4.8 |
| 7 | 0.057 | 0.5 |
| 8 | 0.054 | 0.7 |
| 9 | 0.052 | 0.5 |
| 10 | 0.062 | 2.3 |

## A7. 确定性 / 状态体积

静态扫描：Math.random 出现 10 处（addUnit, updAttack, scanEngage, separate, spawnPos, findSpot, newGame）；Math.hypot 20 处；Date/performance.now 在模拟路径：updHover, endPtr, endPtr, endPtr, newGame。

| 实验（5400 tick，每 10 tick 比对状态哈希） | 首次分歧 tick |
|---|---|
| 同种子 vs 同种子 | 无分歧（确定） |
| 种子化 vs 未种子化 Math.random | 70 |
| 未种子化 A vs B | 70 |
| Math.hypot 换成 sqrt(a*a+b*b) vs 原版 | 670 (≈22 秒) |
| 每 tick 都调用渲染+UI vs 不调用 | 无分歧（模拟与视图解耦） |

300 单位时：状态哈希 mean 0.038 ms；structuredClone 全状态 mean 1.06 ms（JSON.stringify(units) 因 ord.tgt 循环引用而失败 = true）；200 单位网络快照 JSON 4608 B，二进制 1600 B；300 单位 tick mean 0.37 ms。

4 分钟中期全状态序列化（引用→id）：54 单位 / 19 建筑 / 315 资源：JSON 79963 B，gzip 12178 B；仅动态部分（不含资源点/地形）27241 B，gzip 4693 B；每单位约 432 B JSON。

## A8. 正确性脚本结果

```json
{
 "difficultyGatherMultiplier": {
  "aisLength": 1,
  "gmulForTeam1": 1,
  "expectedForHard": 1.15
 },
 "buildOverMovingUnit": {
  "placed": true,
  "ordAfter": "idle",
  "pathAfter": false
 },
 "selSetStale": {
  "selLen": 2,
  "selSetSize": 3
 },
 "restuckPersists": "code reading: u.restuck never reset on success -> every 5th lifetime stuck event aborts path (p3 stepPath)",
 "mapSanity": {
  "seeds": 300,
  "tcDisconnected": 0,
  "unreachableGold": 0,
  "unreachableBerry": 0,
  "startGoldDiff": 0,
  "startBerryDiff": 0,
  "treeAsymmetryRelMean": 0,
  "treeAsymmetryRelMax": 0,
  "unreachableTreesPctMean": 1.7794,
  "unreachableTreesPctMax": 12.338,
  "seedsWithNonMirroredResources": 0
 },
 "popAndQueue": {
  "capAfterCapDrop": 5,
  "popStart": 4,
  "popAfter": 5,
  "queueLeft": 4,
  "note": "queue stalls (not drops) when pop>=cap; resources already paid are held"
 },
 "gameOverKeepsSim": {
  "over": true,
  "winner": 1,
  "note": "frame() stops step() when G.over; keyboard commands are blocked by $(\"end\").hidden check; pointerdown blocked by G.over"
 },
 "trappedSpawn": {
  "farmsPlaced": 5,
  "newestUnitCanReachMapCorner": true
 }
}
```
