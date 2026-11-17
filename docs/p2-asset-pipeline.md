# P2 素材流水线（feature/p2-asset-pipeline）

基于 main b04bcb2。只缩放、转格式、按需加载，不新增/替换美术内容，不改玩法和数值；没有改模拟文件（engine.js / dynasties.js / ai-humanlike.js / network-model.js）。

## 1. 结果（前 → 后）

测量工具：`scripts/perf/asset-memory.cjs`（原始数据 `docs/p2/measurements.json`）。无头 Chromium，同一台 2 核机器；数字用于前后对比，不是真机数据。

| 指标 | 前（b04bcb2） | 后 | 目标 |
|---|---|---|---|
| 首次加载到可玩（20 Mbit/s、40 ms RTT、空缓存） | 43.5 s（就绪前下载 125.5 MB，含 SW 预缓存抢带宽） | **9.8 s**（17.9 MB） | ≤ 10 s ✔（余量很小） |
| 后期内存：渲染进程 PSS，电脑 1920×1080 | 1397 MB | 964 MB | ≤ 400 MB ✘ |
| 后期内存：渲染进程 PSS，手机配置 393×852 DPR3 触屏 | 1410 MB | 953 MB | ≤ 300 MB ✘ |
| 同上，`--gpu`（SwiftShader GPU 进程）渲染进程私有内存 电脑 / 手机 | 1381 / 1355 MB | 930 / 910 MB | — |
| 存活画布（GC 后，宽×高×4） | 397 MB | 310 MB | — |
| 存活的 assets/ 图片解码量 | 125 MB（22 张） | 60 MB（13 张） | — |
| 全部图集解码像素量（w×h×4） | 775 MB | 447 MB（首屏非按需部分 207 MB） | check 上限 470 / 260 MB |
| 部署包 dist/client | 270 MB（assets 239，audio 30） | **76 MB**（assets 52，audio 23） | — |
| 图集文件总量 | 244 MB PNG | 46 MB WebP | — |

**内存目标没有达到。** 解码像素降了 42%，渲染进程内存降了约 32%，但剩下的大头不是源图：
- 约 310 MB 是各 art 模块按帧切出来的画布缓存（attack 44、detail 37、direction 37、expansion 地形 32、visuals 28、precision-picking 遮罩 37 MB 等），它们的分辨率由代码里的帧上限决定（160–256 px），缩小源图基本不影响；
- 其余约 550 MB 是渲染进程自身、解码与 getImageData 过程中的临时缓冲被分配器保留等（同样的场景源图全部减半也只能到约 700 MB）。
要到 400/300 MB 需要改帧缓存的存储方式（按实际绘制尺寸切帧、合批图集、ImageBitmap/WebGL 纹理），属于 P6 渲染改造范围，本分支没有动渲染。

测量方法：
- 内存：`node scripts/perf/asset-memory.cjs --only memory [--gpu]`。late-render 同款场景（4 国、每国约 110 单位、四支军队在镜头内混战），预热后 CDP `HeapProfiler.collectGarbage` 三次，读 `/proc/<pid>/smaps_rollup` 的 PSS（全部 Chromium 进程合计和渲染进程单独）、CDP `Runtime.getHeapUsage`，并用 WeakRef 统计仍存活的画布和 assets 图片的解码字节。`performance.measureUserAgentSpecificMemory` 需要跨源隔离，本页没有开，所以用 /proc。用户提到的 Chrome 标签页 827 MB 是带 GPU 的真浏览器；无头 `--disable-gpu` 下画布都在渲染进程里，所以绝对值更高，只看前后比例。
- 加载：`node scripts/perf/asset-memory.cjs --only load`。新的浏览器配置（空缓存，允许 Service Worker），CDP `Network.emulateNetworkConditions` 20 Mbit/s 下行、5 Mbit/s 上行、40 ms，计时到 `KingdomArt.ready` 稳定（所有 art 模块串上的 ready 都完成、开始按钮可点）。
- 画质：`scripts/art/compare-shots.cjs`（见第 5 节）。

## 2. 做法

1. **统计实际绘制尺寸**：`scripts/art/measure-draw-sizes.cjs` 在真实游戏里放一个“动物园”（全部 62 种单位两队交战 + 45 种建筑，镜头 1× 和约 2× 两档），挂钩 `drawImage` / `getImageData→putImageData` / `createPattern` / `toDataURL`，追踪每张图集的像素经过哪些离屏画布、最终以多大比例画到屏幕。每张图集得到 m（离屏切帧已有的最小缩放，例如攻击帧上限 160–224 px、图标 120 px、地形烘焙）和 k（缩放 1、DPR 1 时每设备像素需要的源像素）。结果在 `scripts/art/draw-sizes.json`。
2. **构建派生图**：`scripts/art/size-assets.cjs`（调用 `scripts/art/resize_assets.py`，Pillow）。比例 = min(1, m, k × 设计缩放 2 × 设计 DPR 2)，加 5% 余量并向上取到 0.05，≥0.95 保持原尺寸。攻击图集按代码算：帧上限 ÷ 最大单格 alpha 范围。追踪不到的路径（图案、未被动物园触达的图集）一律保持原尺寸，只换格式；只出现在图标里的 k=0 图集需要人工审核过才用 m（清单在脚本 `VERIFIED_CAP`，例如 ten-capitals 虽然只测到图标，但 landmark-art 会原尺寸画，所以保持 1）。缩放用预乘 alpha 的 Lanczos（无黑边），WebP 有损 q92 + 无损 alpha。原图留在 `public/assets` 作为源，派生图在 `public/assets/sized/`，`manifest.json` 记录比例、理由和源文件哈希。
3. **引用**：visuals.js 增加 `KingdomArt.src()`（表由脚本写入 `/*P2-SIZED*/` 区域），所有 art 模块的图片加载都改为经过它；visuals.js 切完图块后释放源图（只留草地）。
4. **按需加载**（`KingdomArt.loaded` / `ready` 语义不变：首屏需要的图准备好即可开始）：
   - 方向图集：启动只加载 civilians / core / animals / wildnodes / cargo / workerwork 6 组；其余 13 组在该兵种第一次出现（含电脑对手，每秒扫描一次在场单位）或第一次绘制时逐组加载，期间用原有侧视图（baseUnit）绘制，不会空白；首屏就绪前不开始。
   - 攻击图集：原本就是按在场兵种加载，未改，只是改为加载缩放后的 WebP。
   - 首屏不出现的贴图在 `KingdomArt.ready` 之后再加载（`KingdomArt.afterReady`）：守护者/喷火动作、建筑损坏、法术、船只、战斗姿势（troops-v2）、航空、野兽、国家待命、攻城器械、部队动作（troop-actions-v29）。这些模块的绘制函数原本就有“图未就绪则回退”的判断。
5. **Service Worker**：SHELL 保留原文件名，安装时映射到 sized 文件，按需图集不预缓存（运行时缓存照旧）；缓存版本号改为 `frontier-coast-20261117-p2assets1`；pwa.js 在首屏素材就绪 1.5 s 后才注册 SW，避免首访时 SW 预缓存和首屏抢带宽。
6. **音频**：音乐保持 HTMLAudio 流式；SFX/语音仍按需解码。发现 wind（85 s）、hooves（47 s）每次整段解码再裁 3 s，boss-flame（41 s，只用 5–8.8 s）、cow（14 s，只用前 2.6 s）整段解码常驻；`scripts/art/size-audio.cjs` 生成只含实际播放窗口的 `public/audio/sized/*.mp3`（wind/hooves 就是原来运行时裁出的那 3 s 单声道），常驻 PCM 约 12 MB → 4 MB，并免掉 wind/hooves 整段解码时约 50 MB 的临时 PCM；传输 7.5 MB → 0.5 MB。
7. **构建**：有 sized 副本的原图和未被引用的 carrier-v34.png 不再进入 dist（仍在仓库）；ten-capitals.png 保留在 dist，因为 check-artifact.cjs 断言它存在。imperial.css 欢迎图改用全尺寸 WebP 副本（`world-atlas.full.webp`，欢迎图显示得比游戏内大，所以不缩）。
8. **新检查** `check-asset-budget.cjs`（已加入 check-all）：代码引用的图集都存在且有最新 sized 副本（源文件哈希）、visuals.js / sw.js 的表与清单一致、解码像素上限（非按需 260 MB、全部 470 MB）、预缓存里只有 sized 且被引用的首屏图（无按需图集、单张 ≤1.5 MB、合计 ≤40 MB）、裁剪音频存在。

重新生成：改了源图或渲染代码后，`node scripts/art/measure-draw-sizes.cjs`（约 10 分钟）→ `node scripts/art/size-assets.cjs` → `node scripts/art/size-audio.cjs`，然后跑 `node check-asset-budget.cjs`。注意：生成在开发机上做（需要 Python Pillow / ffmpeg），结果提交到仓库；`npm run build` 不依赖 Python。

## 3. 删除 / 改为按需 / 缩小清单

- **未被引用、不再部署**：`carrier-v34.png`（被 carrier-v45 取代，代码和 SW 都不引用）。
- **改为按需（首次出现时加载）**：攻击图集 69 张（原本已按需）；方向组 directions-advanced / artillery / engineering / heroesA / heroesB / heroesC / line / nationalA / nationalB / nationalC / navalA / navalAir / special。
- **改为首屏就绪后加载**：guardian-actions-v29、building-damage-v32、guardians-v7、magic-v5、ships-v3、troops-v2、aviation-v2、wildlife-v8、national-idle-v3、siege-equipment-v29、troop-actions-v29。
- **已被替代、只用于图标和加载回退、按图标上限缩小**：units-atlas、expansion-units、reinforcements、naval-atlas、nation-buildings（visuals.js 旧图块）；imperial-units、kc-encounter（代码把每格重采样到固定 128/192 px）。
- **缩小比例 < 1 的图集**（其余均原尺寸，仅转 WebP）：

| 图集 | 比例 | 依据 |
|---|---|---|
| attack-airtransport-v34.png | 0.65 | attack-art decode caps frames at 192 px; largest cell 315 px |
| attack-airwing-v34.png | 0.75 | attack-art decode caps frames at 192 px; largest cell 279 px |
| attack-archer-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 302 px |
| attack-bear-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 296 px |
| attack-bomber-v34.png | 0.7 | attack-art decode caps frames at 192 px; largest cell 288 px |
| attack-bombketch-v34.png | 0.7 | attack-art decode caps frames at 192 px; largest cell 303 px |
| attack-cannon-v34.png | 0.65 | attack-art decode caps frames at 192 px; largest cell 311 px |
| attack-carrier-v34.png | 0.65 | attack-art decode caps frames at 192 px; largest cell 322 px |
| attack-cavalry-v34.png | 0.55 | attack-art decode caps frames at 160 px; largest cell 313 px |
| attack-combatmedic-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 295 px |
| attack-continental-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 291 px |
| attack-cuirassier-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 305 px |
| attack-dragoon-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 289 px |
| attack-eliteguard-v34.png | 0.55 | attack-art decode caps frames at 160 px; largest cell 306 px |
| attack-emberthrower-v34.png | 0.8 | attack-art decode caps frames at 192 px; largest cell 263 px |
| attack-engineer-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 305 px |
| attack-fieldmortar-v34.png | 0.7 | attack-art decode caps frames at 192 px; largest cell 300 px |
| attack-fishingboat-v34.png | 0.7 | attack-art decode caps frames at 192 px; largest cell 296 px |
| attack-frigate-v34.png | 0.7 | attack-art decode caps frames at 192 px; largest cell 298 px |
| attack-grenadier-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 298 px |
| attack-gunship-v34.png | 0.65 | attack-art decode caps frames at 192 px; largest cell 317 px |
| attack-halberd-v34.png | 0.55 | attack-art decode caps frames at 160 px; largest cell 315 px |
| attack-healer-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 296 px |
| attack-hero_britain-v34.png | 0.55 | attack-art decode caps frames at 160 px; largest cell 308 px |
| attack-hero_china-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 298 px |
| attack-hero_france-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 291 px |
| attack-hero_japan-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 297 px |
| attack-hero_netherlands-v34.png | 0.55 | attack-art decode caps frames at 160 px; largest cell 306 px |
| attack-hero_ottoman-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 298 px |
| attack-hero_prussia-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 301 px |
| attack-hero_russia-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 294 px |
| attack-hero_spain-v34.png | 0.55 | attack-art decode caps frames at 160 px; largest cell 319 px |
| attack-hero_usa-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 304 px |
| attack-howitzer-v34.png | 0.65 | attack-art decode caps frames at 192 px; largest cell 311 px |
| attack-hussar-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 303 px |
| attack-infantry-v34.png | 0.55 | attack-art decode caps frames at 160 px; largest cell 314 px |
| attack-jackal-v34.png | 0.55 | attack-art decode caps frames at 160 px; largest cell 311 px |
| attack-janissary-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 302 px |
| attack-kcdemon-breath-v34.png | 0.85 | attack-art decode caps frames at 224 px; largest cell 286 px |
| attack-kcdemon-v34.png | 0.8 | attack-art decode caps frames at 224 px; largest cell 302 px |
| attack-kcdragon-breath-v34.png | 0.8 | attack-art decode caps frames at 224 px; largest cell 299 px |
| attack-kcdragon-v34.png | 0.75 | attack-art decode caps frames at 224 px; largest cell 314 px |
| attack-longbow-v34.png | 0.55 | attack-art decode caps frames at 160 px; largest cell 307 px |
| attack-mortar-v34.png | 0.7 | attack-art decode caps frames at 192 px; largest cell 296 px |
| attack-musketeer-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 294 px |
| attack-nassau-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 293 px |
| attack-prussianguard-v34.png | 0.55 | attack-art decode caps frames at 160 px; largest cell 312 px |
| attack-repeater-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 297 px |
| attack-rifleguard-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 294 px |
| attack-runesentinel-v34.png | 0.55 | attack-art decode caps frames at 160 px; largest cell 314 px |
| attack-samurai-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 299 px |
| attack-scoutballoon-v34.png | 0.75 | attack-art decode caps frames at 192 px; largest cell 286 px |
| attack-siegewagon-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 291 px |
| attack-skirmisher-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 293 px |
| attack-sloop-v34.png | 0.7 | attack-art decode caps frames at 192 px; largest cell 305 px |
| attack-steamcrawler-v34.png | 0.75 | attack-art decode caps frames at 192 px; largest cell 273 px |
| attack-streltsy-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 296 px |
| attack-tangdou-v34.png | 0.75 | attack-art decode caps frames at 192 px; largest cell 281 px |
| attack-tercio-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 302 px |
| attack-trader-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 299 px |
| attack-transport-v34.png | 0.7 | attack-art decode caps frames at 192 px; largest cell 307 px |
| attack-trebuchet-v34.png | 0.7 | attack-art decode caps frames at 192 px; largest cell 291 px |
| attack-tuantuan-v34.png | 0.75 | attack-art decode caps frames at 192 px; largest cell 269 px |
| attack-villager-build-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 287 px |
| attack-villager-food-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 293 px |
| attack-villager-mine-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 292 px |
| attack-villager-v34.png | 0.55 | attack-art decode caps frames at 160 px; largest cell 311 px |
| attack-villager-wood-v34.png | 0.6 | attack-art decode caps frames at 160 px; largest cell 299 px |
| bridge.png | 0.15 | screen 0.296 px/px at zoom x DPR 1 (x4 = 1.18), offscreen cap 0.13 |
| cliffs-v4.png | 0.2 | screen 0.350 px/px at zoom x DPR 1 (x4 = 1.40), offscreen cap 0.16 |
| directions-animals-v33.png | 0.85 | screen 0.197 px/px at zoom x DPR 1 (x4 = 0.79), offscreen cap 0.95 |
| directions-civilians-v33.png | 0.9 | screen 0.206 px/px at zoom x DPR 1 (x4 = 0.83), offscreen cap 0.87 |
| directions-nationalB-v33.png | 0.9 | screen 0.206 px/px at zoom x DPR 1 (x4 = 0.82), offscreen cap 0.87 |
| directions-nationalC-v33.png | 0.9 | screen 0.202 px/px at zoom x DPR 1 (x4 = 0.81), offscreen cap 0.90 |
| directions-navalAir-v33.png | 0.9 | screen 0.496 px/px at zoom x DPR 1 (x4 = 1.98), offscreen cap 0.82 |
| expansion-buildings.png | 0.9 | screen 0.213 px/px at zoom x DPR 1 (x4 = 0.85), offscreen cap 1.00 |
| expansion-units.png | 0.45 | visuals.js musketeer/grenadier/cannon/healer tiles: superseded on screen; icons + loading fallback; cap 0.39 |
| imperial-units.png | 0.35 | dynasty-art.js cut() resamples every cell to a fixed 128 px frame; cap 0.31 |
| kc-encounter.png | 0.6 | world-art.js cut() resamples every cell to a fixed 192 px frame; cap 0.53 |
| livestock.png | 0.3 | world-art.js cut() resamples each 443 px cell to a fixed 112 px frame |
| meadow.jpg | 0.45 | visuals.js art.terrain draws it once into a 520x520 pattern tile |
| nation-buildings.png | 0.3 | visuals.js lumbercamp/quarry/bath/... tiles: superseded by painted architecture; icons + fallback; cap 0.27 |
| nation-units.png | 0.85 | screen 0.201 px/px at zoom x DPR 1 (x4 = 0.81), offscreen cap 1.00 |
| nations-east.png | 0.45 | screen 0.151 px/px at zoom x DPR 1 (x4 = 0.60), offscreen cap 0.41 |
| nations-west.png | 0.4 | screen 0.130 px/px at zoom x DPR 1 (x4 = 0.52), offscreen cap 0.35 |
| naval-atlas.png | 0.3 | visuals.js ship/dock tiles: superseded by ships-v3 / painted architecture; icons + fallback; cap 0.28 |
| reinforcements.png | 0.45 | visuals.js halberd/skirmisher/hussar/mortar tiles: superseded on screen; icons + loading fallback; cap 0.39 |
| terrain-materials-v2.png | 0.5 | architecture-art.js resamples each 443 px material cell to a 192 px canvas before using it as a pattern |
| troops-v2.png | 0.85 | screen 0.196 px/px at zoom x DPR 1 (x4 = 0.79), offscreen cap 1.00 |
| units-atlas.png | 0.45 | visuals.js tiles for villager/infantry/archer/cavalry: superseded on screen by direction/attack art; used for 120 px icons and as the loading fallback; cap 0.38 |
| world-atlas.png | 0.5 | screen 0.118 px/px at zoom x DPR 1 (x4 = 0.47), offscreen cap 1.00 |

## 4. 检查结果

- `node check-all.cjs`：全部通过（含新的 check-asset-budget）。
- `npm run build`、`node check-artifact.cjs`：通过。
- `npm run release-check`（完整）：**103 PASS、2 WARN、0 FAIL**，报告 `docs/release-reports/2026-11-17-a14ffbd.md`，没有改基线。
  - WARN 渲染 · desktop 每帧 drawImage 550 vs 453（+21%）：推测是场景里 halberd/longbow/grenadier 的方向组改为按需后，采样窗口内部分单位仍走 baseUnit 回退（回退路径画法不同）；未单独验证。
  - WARN 联机 · 2 人 opening CPU/轮询 p95：本分支没有改联机代码，判断为机器噪声。

## 5. 画质对比（需艺术总监目测）

`node scripts/art/compare-shots.cjs`，设备缩放 2、窗口 760×540（自适应渲染 DPR 实际稳定在 1.7）、镜头约 1.75 倍：
- `docs/p2/shots/town-before.png` / `town-after.png`：城镇中心、兵营、草地地形、村民。
- `docs/p2/shots/units-before.png` / `units-after.png`：多兵种交战（攻击帧）。

我（Claude，程序员）看过这两组截图，建筑与地形没有看出差别；两次运行单位位置不同，单位对比只能粗看。**这不是美术签收**，需要艺术总监确认：
1. 攻击图集缩到 0.5–0.7、方向图集 0.85–0.9：最大缩放 3.5×、DPR 2 下单位是否变糊（设计点是缩放 2 × DPR 2，超过这个倍数会比原来更早出现放大）。
2. world-atlas 0.5、expansion-buildings 0.9、nation-units 0.85、nations-east/west 0.45/0.4：镜头拉近时城镇建筑和国家兵种细节。
3. WebP q92 有损颜色（alpha 无损）：队伍色条纹、细线边缘是否有色带或块状噪点。
4. 按需加载的过渡：国家兵种、英雄、船只、守护者第一次出现时有几百毫秒用旧侧视图，是否能接受。
5. 按 AGENTS.md alpha 规则，sized 图需在实际脚本顺序、对比色地形上复查黑边/白边（本次只做了上面两个场景）。

## 6. 未验证

- Safari / iPhone / iPad 真机：WebP（含 alpha）Safari 14+ 支持，未在真机上加载验证；真机内存和加载时间未测。
- 真实 Chrome（带 GPU）标签页内存未测；无头数据只能看比例。
- 离线：按需图集只在第一次用到时缓存，离线时从未用过的国家/兵种会一直显示回退图。
- draw-sizes 由动物园场景测得，未覆盖的绘制路径（例如某些特殊状态）可能需要更高分辨率；发现后在 size-assets.cjs 里提高该图比例重新生成即可。
