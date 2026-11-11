# 城墙与城门美术更新 · 艺术总监把关（2026-11-11）

审查与验证：Claude（本次任务中担任艺术总监，一次性审查，不是常驻评审）。全部截图由我用 Playwright（headless Chromium）按生产脚本顺序渲染，并用图像查看工具逐张亲眼检查。**没有真机测试。**

## 结论（先读这里）

**部分达到写实目标。**

- **横向城墙、横向城门：达到。** 风化方石砌块、垛口带受光顶面、托臂挑檐（corbel）、扶壁、墙脚杂草、接地阴影都来自仓库里已有的写实厚涂图，和周围的建筑放在一起不再显得突兀。横段之间看不出接缝，城门有拱券、铁件木门、两侧壁灯，还有一面染成队伍色的布旗（关门/开门两种状态，开门时能透过门洞看到后面的地面）。
- **纵向城墙：只是“可用”，没有达到同等水准。** 游戏镜头从正南方看过去，南北走向的墙在几何上只露出墙顶走道和南端截面，两侧墙面是看不到的。所以纵墙在画面上是一条带垛口的窄石带，加上向东投的软阴影。比起旧的平涂矢量块好得多，但立体感明显不如横墙。离线合成解决不了这个问题，因为它是镜头几何决定的，见下文“差距”。
- **纵向城门：未达到。** 原因同上：门洞朝东西开，镜头看不到。现在只能靠开门时左右翻出的两扇门板来提示“开着”，关门时和一段带塔的纵墙几乎一样，可读性差。
- **转角 / T 形接头塔：基本达到。** 30×30 的塔比墙高 10，有四角垛口，但塔身正面是从墙面切出来的，看上去更像一根加高的扶壁，没有独立城楼的分量。

如果目标是“和 architecture-v2 的建筑一样好看”，横向部分已经接近；纵向部分要做到同样好看，**需要新出图**（提示词见本文末，已按游戏的投影规则写定）。我没有夸大：离线合成能做到的，就是现在这个程度。

## 选择的路线与理由

本环境没有图像生成模型，所以没有出新图，而是**离线合成**：用 PIL/numpy 把仓库里已登记的写实位图加工成模块精灵（`scripts/art/build_walls.py`，确定性，重跑结果逐字节一致）。

1. `industry-v2.png` 第 10 格（写实石城墙，原来没有用上）：这张图是透视斜拍的，先用单应性变换把墙面“拉正”成正立面，再按 96 像素一段切成周期纹理。接缝用最小误差缝（image quilting）处理，所以横段可以无缝重复。墙上的鸢尾花旗避开了（窗口选在没有旗的扶壁处）。
2. 同一张图拆出：单个垛口（带受光顶面）、女墙带、托臂带、墙身，再按真实几何把它们重新组装成横段、纵段（墙顶走道、两侧女墙、垛口、南端截面）、转角/T 形塔。每块都按 `(x, y − z)` 投影绘制，和 fortification.js 的碰撞矩形一一对应。
3. 城门：`industry-v2.png` 第 11 格（石门楼）的中段拱门，盾形纹章（鸢尾花）用相邻砌块覆盖掉；“关门”状态把第 13 格（木栅门）的木门嵌进拱内并加门洞阴影；“开门”状态把门洞中间设为透明。
4. 布旗：取第 10 格的蓝旗，抹掉鸢尾花图案成为纯色布，运行时按队伍色重新着色（只处理旗帜所在矩形，每队缓存一张）。
5. 阴影：沿光照方向（左上）分三层投影后模糊，靠墙脚最深、向外渐淡；按段的格子羽化裁切，相邻两段的阴影正好补齐，不会叠深，也不会出现方形色块。阴影不透明度不超过 0.40，低于拾取阈值，点阴影不会选中墙。

为什么没有用 I–II 时代木栅：城墙是 II 时代才能建，名字和造价都是“石城墙 / 石料”。改成木栅属于玩法表达上的变更，不在这次授权范围内，所以没做。木栅图（industry-v2 第 12/13 格）仍可在以后接入。

## 前后对比（`docs/art-review-walls/`）

| 内容 | 之前 | 之后 |
|---|---|---|
| 场景 A：横墙、开门（友军）、关门（敌军）、转角、T 形、纵墙、受损、施工，村民对照（缩放 1.0） | `before-scene-a.jpg` | `after-scene-a.jpg` |
| 场景 A 细节（缩放 1.6） | `before-zoom16.jpg` | `after-zoom16.jpg` |
| 场景 B：十字接头、纵墙东西接头、纵向城门开/关 | `before-scene-b.jpg` | `after-scene-b.jpg` |
| 草地 / 沙石 / 雪地（浅色底）/ 深色底，全部模块 + 村民，生产脚本顺序 | — | `after-terrain-grass-sand-snow-dark.jpg` |
| 点选城门：像素描边、血条、名称、底栏头像 | — | `after-selected-gate.jpg` |
| 手机竖屏 393×852 @3x | — | `after-phone-393x852.jpg` |
| 删除 `ornament()`：中国 V 时代全部建筑 | `ornament-before-china-era5.jpg` | `ornament-after-china-era5.jpg` |
| 删除 `ornament()`：奥斯曼 V 时代全部建筑 | `ornament-before-ottoman-era5.jpg` | `ornament-after-ottoman-era5.jpg` |

注：游戏里没有“雪地”地形。草地取的是 `terrain-materials-v2` 的草地材质，沙地取的是岸边沙石材质（游戏在岸边用的就是它），雪地用接近白色的底色代替，另加深色底，用来检查有没有黑边或白边。

## Raster alpha gate（审查人：Claude）

- `walls-v1.png`：四角和精灵之间的间隔 alpha 都是 0；半透明边缘像素里没有接近纯白的，也没有不透明度高的纯黑像素。在雪地和深色底上目视检查过（`after-terrain-…jpg`），没有发现黑白杂边或光晕。缩放用的是预乘 alpha，避免产生暗边。
- 已知软点：源图分辨率有限，精灵约是源像素的 1.5 倍放大，手机 3x 屏或放大到 1.6 倍以上时，比 architecture-v2 的建筑略软。

## 尺度与一致性

- 墙高：从墙脚到垛口顶 111（塔 121、门楼 124），村民可见身高约 85–88，比例约 1.3 倍。门洞净高约 67，约为村民的 0.8 倍（原来的建筑门洞一般只有 0.5–0.6 倍）。
- 占地、碰撞、`wallRects` 接头、城门通行逻辑、施工与受损状态的逻辑都没有改。拾取仍是像素遮罩：墙面、垛口、截面能点中；阴影、垛口之间的空隙、开着的门洞点不中。用真实鼠标点城门能选中，描边贴合轮廓，血条位于门楼上方（`after-selected-gate.jpg`）。
- `A.measure` 改为和精灵实际高度一致（横 108×140，纵 100×150，城门 108×125，纵门 100×150），血条位置和拾取遮罩画布都按这个高度来。`art-profiles` 的尺寸没有动，所以碰撞地基不变。
- 拾取遮罩副本和受损剪影副本现在按 id 找回真实墙段的接头，遮罩里能看到的接头部分和画面一致；原来的副本拿不到相邻墙段，所以没有接头。
- 已有的细节没有改：横墙向南的接头最南的 26 像素仍落在 `hitEntity` 的快速排除范围外（`e.y + 22`），这是 precision-picking.js 原有的规则。

## 性能

渲染改成：每段墙只调用一次 `drawImage`，从缓存的图集里取图；队伍色旗帜每队缓存一张；邻接查询每帧建一次空间哈希（O(n)），不再对每段墙都筛选一遍全部建筑。墙体绘制不使用 `filter`，只有原有的受击闪白会用。

**200 段城墙场景**（202 段：4 条横墙线、9 条纵墙线、8 座城门、40 个村民，桌面 1280×720，`?perf=1`，各跑 3 次取中位数，同一台机器，基础版本从 `HEAD` 导出）：

| | render p50 | render p95 | scene p50 | 帧间隔 p50 | 每帧 drawImage | 每帧带 filter |
|---|---|---|---|---|---|---|
| 之前（矢量） | 11.0 ms | 102 ms | 10.4 ms | 900 ms | 184 | 7 |
| 之后（精灵） | 10.7 ms | 54 ms | 10.3 ms | 900 ms | 391 | 8 |

- render 和 scene 持平，p95 下降。帧间隔约 900 ms 是 headless 无 GPU 加上共享 2 核虚拟机的合成开销，两个版本一样，不是墙造成的。
- drawImage 正好增加约“每段墙一次”，因为原来的矢量路径换成了一次贴图。
- 两个版本里带 filter 的绘制都只来自 `precision-picking.js` 的 `drawOccluded`（被建筑挡住的单位的可点剪影）。之后多 1 次，是因为墙变高后多挡住了一个村民，属于预期行为。
- `npm run release-check -- --only render`：10 PASS / 0 WARN / 0 FAIL（这个会战场景里没有墙，只能说明没有引起其它回退）。完整 release-check 的结果见提交后生成的报告。
- 新增 PNG 842,608 字节（1272×880），解码后约 4.5 MiB 显存/内存；Service Worker 预缓存了它和它的 JSON，版本号已更新。

## 删除 `ornament()`

`painted-architecture.js` 里的 `ornament()` 在 II 时代以后会在屋顶上叠一层矢量装饰（中国是绿色“人”字折线，奥斯曼/俄国是洋葱顶，荷兰是阶梯块，美国是白线柱廊），IV 时代以后还会加 13×8 的矩形小旗。这违反“建筑不得出现漂浮色块”的规则，已经整段删除。对比图显示：各建筑仍保留图集自带、已染队伍色的旗帜和挂毯，国家屋顶色调也还在，可读性不受影响。国家识别以后由地标建筑（`ten-capitals.png`）承担，见 art-audit §6。

## 授权记录

| 文件 | 来源 | 授权 |
|---|---|---|
| `public/assets/walls-v1.png`、`walls-v1.json` | 由仓库内 `public/assets/industry-v2.png` 第 10 格（石城墙及旗帜）、第 11 格（石门楼的拱门、门、壁灯）、第 13 格（木栅门的关闭木门）派生；生成脚本 `scripts/art/build_walls.py`，只做纠正透视、裁切、平铺、明暗处理和拼合，没有使用生成模型，也没有用任何第三方素材 | 与 `industry-v2.png` 相同：项目使用 ImageGen 生成（见 ART.md）。生成工具条款还没有登记，这是全项目共有的缺口（art-audit §5），已在 `docs/app-store-readiness.md` 素材登记表中加一行 |

鸢尾花图案已从派生的旗帜和城门上去掉。

## 未验证 / 仍需人工

- iPhone / iPad 真机的观感、帧率、内存；Safari / WebKit 的渲染。
- 双语界面、HUD 展开/折叠在多种视口下的完整 UI 审查：这次只改了世界里的精灵和建造菜单图标，只截了桌面和手机竖屏，没有跑完整的 Frontier UI 审查矩阵。

---

## 需要用户再生成的素材：提示词 F（最终版，可直接交给图像模型）

用途：替换纵向城墙、纵向城门，以及转角/T 形塔，把横向部分也再提高一档。参考图必须一起附上：`public/assets/walls-v1.png`（现有模块，用来确认比例和截面）、`public/assets/industry-v2.png`（第 10、11 格，材质和画风）、`public/assets/architecture-v2.png`（镜头和光照）。

**EN**
Use case: production game sprite sheet. Premium realistic 1700s RTS, painterly pre-rendered PBR finish exactly matching the attached `architecture-v2.png` and `industry-v2.png` cells 10–11 (weathered grey-tan limestone ashlar, corbelled parapet, crenellations, warm sunlight from the upper left, soft ambient occlusion). TRUE TRANSPARENT RGBA background (alpha 0), no ground plane, no cast shadow (the game adds shadows), no text, no emblem, no fleur-de-lis, no people.
CAMERA (critical): the game is an oblique top-down view in which a point at height z is drawn straight UP by z pixels and ground depth runs straight DOWN the screen; vertical edges stay perfectly vertical; there is NO perspective and NO diagonal recession. A wall running north–south therefore shows its TOP walkway as a long vertical strip plus its south end face; a wall running east–west shows its full south face plus a thin strip of walkway above it.
Canvas 2048×1024, EXACTLY 8 columns × 2 rows of 256×512 cells, 2 sprite px = 1 game px. In every cell the ground anchor (centre of the footprint) is at x=128, y=416.
Dimensions in sprite px: wall cross-section 48 deep; walkway at height 176; parapet sill at 192; merlon tops at 222; merlons 36 long, period 64, with merlon CENTRES exactly on the segment ends and at ±32 from the anchor, so that repeated segments tile seamlessly; parapet thickness 10 on both sides. Towers 60×60 footprint, walkway 196, merlon tops 242. Gatehouses 56 deep, merlon tops 248, arch clear opening about 120 wide × 134 high.
Row 1: (1) east–west wall segment, 192 wide, south face visible, both ends clean vertical cuts with identical cross-section; (2) north–south wall segment, footprint 48 wide × 192 long, top walkway with stone slabs, crenellated parapets on both edges, south end cross-section showing two merlons; (3) corner/junction tower 60×60 with four corner merlons, distinctly a TOWER (string course, slit window, slightly battered base), not a buttress; (4) the same tower with an attached north–south stub reaching 66 px south.
Row 2: (5) east–west gatehouse CLOSED (iron-strapped oak double doors in a round arch); (6) the same gatehouse OPEN (doors swung inward, passage fully transparent); (7) north–south gatehouse CLOSED, readable from this camera: two square towers at the north and south ends joined by a covered bridge, and the gate visible as a dark recessed arch in the TOP of the passage roof plus a raised timber portcullis frame spanning the walkway; (8) the same north–south gatehouse OPEN, with the portcullis frame raised and the two door leaves swung out flat to the east and west of the passage so they read clearly from above.
Plain solid-blue cloth banner on each gatehouse only (recoloured at runtime). Identical stone colour and lighting in all cells; transparent gutters at least 8 px between cells; nothing crosses a cell boundary.

**中文**
用途：正式游戏精灵图集。高品质写实 18 世纪 RTS，厚涂预渲染 PBR 质感，**与附带的 `architecture-v2.png` 及 `industry-v2.png` 第 10–11 格完全一致**（风化灰褐石灰岩方石、带托臂挑檐的女墙、垛口、左上暖光、柔和环境光遮蔽）。**真实透明** RGBA 背景（alpha 0），不画地面，不画投影（游戏自己加阴影），不要文字、徽记、鸢尾花或人物。
镜头（关键）：游戏是斜俯视画法，高度 z 的点直接向上画 z 像素，地面纵深直接沿屏幕向下；所有竖边保持**完全竖直**，**没有透视，也没有斜向退远**。所以南北走向的墙只露出墙顶走道（一条竖长条）和南端截面；东西走向的墙露出完整的南立面，上方再露一条窄窄的走道。
画布 2048×1024，**正好 8 列 × 2 行**，每格 256×512；2 精灵像素 = 1 游戏像素。每格的地面锚点（占地中心）在 x=128，y=416。
尺寸（精灵像素）：墙截面纵深 48；走道高 176；女墙垛口底沿高 192；垛口顶高 222；垛口长 36、周期 64，**垛口中心正好落在墙段两端和距锚点 ±32 处**，这样重复摆放能无缝拼接；两侧女墙厚 10。塔占地 60×60，走道高 196，垛口顶高 242。门楼纵深 56，垛口顶高 248，拱门净空约宽 120、高 134。
第 1 行：(1) 东西向墙段，宽 192，露出南立面，两端是干净的竖直截面，截面完全相同；(2) 南北向墙段，占地 48 宽 × 192 长，墙顶走道铺石板，两侧女墙有垛口，南端截面露出两个垛口；(3) 转角/接头塔 60×60，四角有垛口，要明确画成**塔**（腰线、箭窗、略带收分的塔基），不要画成扶壁；(4) 同一座塔加一段向南伸出 66 像素的南北向短墙。
第 2 行：(5) 东西向门楼·关（铁箍橡木双扇门，圆拱）；(6) 同一门楼·开（门向内开，门洞完全透明）；(7) 南北向门楼·关，**要能从这个镜头看懂**：南北两端各一座方塔，中间用有顶的廊桥连接；城门表现为通道顶上一个凹进去的暗色拱口，再加一个横跨走道的木制闸门框；(8) 同一南北向门楼·开：闸门框升起，两扇门板平摊着翻向通道东西两侧，从上方能清楚看出是开着的。
只有门楼挂纯蓝色无图案布旗（运行时会染成队伍色）。所有格子石色和光照一致；格与格之间至少留 8 像素透明间隔；任何东西都不能越过格子边界。

**拿到图后的接入方式**：按上面的格子和锚点切图，替换 `walls-v1.png` 中对应的模块（JSON 里的 `ox/oy` 就是锚点）。`wall-art.js` 不需要改；纵门的开关可读性需要重新截图把关。
