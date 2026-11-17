# 运行期内存预算（feature/memory-and-device-check）

基于 feature/merge-p1-p2（main 393bdb5 + P1 + P2，提交 d12b844）。不改玩法、数值、素材内容，没有新增 `ctx.filter`，没有改模拟代码。

## 1. 结果（前 → 后）

测量：`node scripts/perf/asset-memory.cjs --only memory`（P2 文档同一方法、同一场景：late-render 的 412 单位四国会战，预热后 GC 三次，读 `/proc/<pid>/smaps_rollup` 渲染进程 PSS）。无头 Chromium `--disable-gpu`，2 核共享虚拟机；只用于前后对比，不是真机数据。新增 `ASSET_BREAKDOWN=1`：冻结帧循环后依次释放全部离屏画布、全部 assets 图片再测，得到“渲染进程地板”。

| 指标（后期 412 单位） | 前（d12b844） | 后 | 目标 |
|---|---|---|---|
| 渲染进程 PSS，电脑 1920×1080 | **955 MB** | **666 MB**（−30%） | ≤ 400 ✘ |
| 渲染进程 PSS，手机配置（852×393 DPR 3 触屏） | **961 MB** | **629 MB**（−35%） | ≤ 300 ✘ |
| 全部 Chromium 进程合计 电脑 / 手机 | 1208 / 1200 MB | 917 / 864 MB | — |
| 存活画布（w×h×4）电脑 / 手机 | 310 / 312 MB | 328 / 298 MB（含原来算作图片的 24 MB 源图） | — |
| 存活的源图解码量 | 60 MB（12 张 `<img>`） | 24 MB（6 张，改为画布） | — |
| 冻结后释放全部画布的“地板” 电脑 | 592 MB | 284 MB | — |
| 运行期缓存预算 使用 / 上限 电脑 | —（各自上限，合计可到约 300 MB） | 136 / 160 MB，未淘汰 | — |
| 运行期缓存预算 使用 / 上限 手机 | — | 91 / 96 MB，淘汰 407 项（58 MB） | — |

**内存目标仍未达到。** 去掉的大头是图片解码缓存（见第 2 节），剩余组成（电脑，666 MB）：
- 约 **284 MB 渲染进程地板**：Chromium 可执行文件/字体/ICU 映射约 70 MB、V8 堆 17 MB、DOM 与合成层、主画布（1920×1080 及其层）、Skia/分配器保留；空白页约 47 MB，菜单页释放全部画布后约 225 MB。这部分页面代码基本控制不了。
- 约 **136 MB 运行期派生缓存**（受预算管理，见第 3 节）：点选遮罩 38 + 姿态遮罩 17 + 遮挡幽灵 7、攻击动作集 23 + 攻击队伍色 25、方向/细节队伍色 19、其他 7。
- 约 **190 MB 常驻帧图**（启动时一次性切好的美术帧，不在预算内）：detail-art 约 40、direction-art 约 38、地形烘焙画布（expansion.js，整张地图）32、仍在运行时直接绘制的源图 24（resource-nodes 8、walls 4.3、guardian-fire 4、functional-buildings 2.7、meadow、cliffs）、painted-architecture / interaction-art 各约 14、旧图块与图标约 14、其余各模块 1–7 MB。
要到 400 / 300 MB，常驻帧图必须改为按需切帧或换成 GPU 纹理图集（P6 渲染改造），渲染进程地板只能在真机（带 GPU、内存压力回收）上重新评估。

### 渲染耗时（速度/内存权衡）

同一台机器、同一天，交替运行。

| 场景 | 指标 | 前 | 后 |
|---|---|---|---|
| late-render（后期 412 单位，1920×1080，`scripts/perf/late-render.cjs --secs 10`，2 次） | 帧间隔 p50 / p95 | 100–100.1 / 149.9–150 ms | 100 / 133.4 ms |
| | HUD render p50 / p95 | 26.2–26.9 / 55.6–60.3 ms | 21.9–22.0 / 32.1–43.4 ms |
| | 每帧 drawImage / getImageData | 602–626 / 1 | 580–587 / 0 |
| release-check 渲染场景（`scripts/release/render-cost.cjs`，200 单位，2 次中位数） | 电脑 1280×720 帧 p50/p95，render p50/p95 | 66.6/100，13.7/21.5 ms | 50.1/83.4，11.9/18.0 ms |
| | 手机 393×852 帧 p50/p95，render p50/p95 | 33.3/66.7，11.4/18.5 ms | 33.3/50.1，10.5/17.6 ms |

渲染没有变慢（略快，推测是少了解码缓存的换入换出和红色旧图块的预生成；headless 噪声约 ±10%）。手机配置在 96 MB 预算下每次测量会淘汰约 400 项（主要是点选遮罩和队伍色），重建发生在新姿态第一次出现时，帧时间未见上升；预算更小（例如 64 MB）时预计会开始反复重建点选遮罩（getImageData），所以没有再压低。注意手机配置“后”的自适应分辨率比“前”多降了一档（0.92 vs 1.08），这是 headless 下每 90 帧中位数 >26 ms 就降一档、两次运行的预热长度不同造成的，桌面两次相同（0.72）。

## 2. 改动一：图集解码改为 createImageBitmap → 画布（释放解码缓存）

实测（菜单页，全部图集已加载）：渲染进程 704 MB 中约 **278 MB 是 /dev/shm 共享内存**——Chromium 把 `<img>` 解码后的像素放在“可丢弃”共享内存里（约为像素量的 2 倍），模块切完帧、丢掉 `<img>` 之后它仍常驻，只在系统内存压力下才回收（CDP `Memory.simulatePressureNotification` 后降到 39 MB）。对照实验：30 张 sized WebP（75 MB 像素）用 `<img>`+drawImage 后 PSS 224 MB（shm 156），用 `createImageBitmap(blob)`+`close()` 后 55 MB（shm 0）。

做法（`public/visuals.js`）：
- `KingdomArt.image()` 返回一个“像 Image 一样”的画布：设置 `src` 时 `fetch → blob → createImageBitmap`，画进这块画布后立即 `bitmap.close()`；支持 `onload/onerror`、`complete`、`naturalWidth/naturalHeight`、`decode()`、`src` 读回。浏览器没有 `createImageBitmap`/`fetch` 或解码失败时，退回 `<img>` 画进画布再丢掉 `<img>`。所有 art 模块的 `new Image()`（21 个文件 26 处）改为 `(globalThis.KingdomArt?.image?.()||new Image())`，其余代码不变。
- `KingdomArt.releaseImage(img)`：切完帧后把源画布缩为 1×1（误画也只是空操作、不会抛错）。已用于 campaign-art、guardian-art（守护者图集）、spell-sprites、economy-art（野兽、村民背篓）、clarity-art（航空/资源图集）——这些模块运行时只画切好的帧。仍在运行时直接按格绘制源图的（resource-nodes、walls、guardian-fire、functional-buildings、meadow 图案、cliffs）保留。
- 画质：原尺寸切帧逐像素相同（512×512 实测差 0）；**缩小绘制时**，Chromium 对 `<img>` 和对画布用的重采样不同（512→132/200：平均差 1.7/255，个别边缘像素差到 255，肉眼看画布版略锐一点）。影响切帧时就缩小的路径（攻击帧上限 160–224 px、imperial-units 128 px、kc-encounter 192 px 等）。**需要艺术总监目测**：`docs/p2/shots` 同款场景下单位边缘是否更“硬”。截图对比（late-render 场景，前后各一张）我（Claude，程序员）看过，未见明显差异，这不是美术签收。

## 3. 改动二：统一的运行期画布缓存预算

`KingdomArt.canvasBudget`（visuals.js）+ `KingdomArt.canvasCache(name, {size, onEvict})`：
- 每个缓存是与 Map 兼容的存储（get/set/has/delete/keys/entries/size/clear，原有的“满了删最旧一项”代码照常工作），每项记录字节数（画布 w×h×4，对象里的画布/数组画布/TypedArray 合计，或缓存自己的 size 函数）。
- 所有缓存共用**一个 LRU 顺序和一个字节上限**：电脑 160 MB，触屏（`pointer: coarse`）96 MB，`navigator.deviceMemory ≤ 4` 时 64 MB；`?canvasBudget=<MB>` 可覆盖。超限时按最久未用淘汰到上限的 90%；**本帧和上一帧用过的项从不淘汰**（工作集超过预算时宁可超出并记录 `overshootMB`，也不每帧重建），每帧最多做一次淘汰扫描。被淘汰的项下次用到时由原模块重新生成（它们都是“取不到就生成”的派生缓存）。
- `KingdomArt.canvasBudget.stats()` 给出上限、已用、峰值、超出、淘汰次数和各缓存明细（`asset-memory.cjs` 输出里的 `canvasBudget`）。

| 缓存 | 内容 | 以前 | 现在 |
|---|---|---|---|
| attack-art:sets | 攻击动作集（解码切帧） | 桌面 160 MB / 触屏 80 MB 独立上限 | 预算内；独立上限 = 全局上限；被淘汰时同时清掉请求记录，下次出现重新加载 |
| attack-art:tints | 攻击帧队伍色 | 72 / 28 MB | 预算内；独立上限 = 全局上限的一半 |
| detail-art:tints / direction-art:tints / interaction-art:tints | 细节、四向、动作队伍色 | 128 / 160 / 140 项 | 预算内，项数上限保留 |
| precision-picking:cache / poseCache / ghosts | 点选遮罩、姿态遮罩、遮挡幽灵轮廓 | 240 / 320 项；幽灵每个遮罩 6 色（不限遮罩数） | 预算内；幽灵改为一个共享缓存（键 = 遮罩编号 + 颜色，上限 1200 项） |
| painted-architecture:cache / architecture-art:cache / troop-art:cache / painted-troops:variants / dynasty-art:variants / wall-art:tinted / building-damage-art:masks | 建筑与兵种国家/队伍色变体、破损遮罩 | 80 / 无上限 / 220 / 100 / 无上限 / 48 / 96 项 | 预算内，原项数上限保留 |
| unit-motion:gait | 行走步态帧 | 192 帧 / 450 万像素 | 预算内（淘汰时同步扣减像素计数） |
| visuals:red | 旧图块的红色队伍变体 | 启动时全部预生成（约 14 MB） | 第一次用到时生成，进预算 |

不在预算内（常驻）的是启动时切好的美术帧和地形烘焙，见第 1 节。

## 4. 检查

- `check-canvas-budget.cjs`（加入 check-all）：在 VM 里单测预算（字节统计、跨缓存 LRU、淘汰到 90%、本帧保护与超出记录、onEvict、Map 接口、160/96/64 MB 与 `?canvasBudget`）；所有 art 模块不得直接 `new Image()`；上表 17 个缓存都已登记。
- 原有检查（check-all、check-gait-render-cache、check-attack-*、check-asset-budget 等）全部通过；完整 release-check 结果见 `docs/release-reports/`（本分支最新一份）。

## 5. 未验证

- 真机（带 GPU 的 Chrome、Safari/iPhone/iPad）的实际内存：GPU 加速画布的像素在 GPU 进程/显存里，Safari 的图片解码缓存策略也不同；headless 数字只看比例。iOS 上 `createImageBitmap(blob)` 需 Safari 15+（更早版本自动退回 `<img>`）。
- 缩小重采样的画质差异需要艺术总监在真机上目测（第 2 节）。
- 更长对局（多国家、多兵种轮换）下预算的淘汰频率与重建开销只在 412 单位场景测过。
