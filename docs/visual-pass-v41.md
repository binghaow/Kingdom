# V41 画面改进（艺术总监审核 v2 中 5 项“只改代码”的项目）

分支 `feature/visual-pass-v41`（基于 main deb60cf）。实现与截图审看：Claude（本次任务的程序员，单人完成，没有另设评审）。
全部截图为 Playwright headless Chromium（`--disable-gpu`）按生产脚本顺序渲染，并逐张亲眼查看。**没有真机测试。**
只改表现层：玩法、数值、存档、联机协议和模拟都没动（`s.effects`、建筑占地 `D.r`、地标规则保持不变）。

## 每项结果与截图

| 项目 | 改动 | 之前 | 之后 |
|---|---|---|---|
| 1 合并写实城墙 | `git merge origin/feature/realistic-walls`；冲突只在 `sw.js`（保留 main 的 v40 预缓存并加入 walls-v1.png/.json）和 `app-store-readiness.md`（两行都留）。横墙、纵墙、转角、横门、随相邻纵墙转向的纵门（v40 `gateTurn`）都用新图拼接 | `docs/art-review-walls/before-scene-a.jpg` | `visual-pass-v41/walls-after.jpg` |
| 2 统一投影 | 新增 `public/ground-shadows.js`：建筑/树/石金矿的投影按精灵遮罩只生成一次（向右下斜切、压扁、四分之一分辨率放大来柔化，不用 `ctx.filter`）；单位影子每帧合并成 2 次 Path2D 填充（不是每个单位一次 drawImage），空中单位影子按高度离开本体。在 y 排序绘制前画，影子不会盖住精灵 | `opening-before.jpg` | `opening-after.jpg`（同时含第 5 项） |
| 3 遮挡剪影与伤害数字 | 被挡单位：阵营色 1.5 px 描边 + 约 10% 填充，按（遮罩, 颜色）缓存，一次 drawImage；去掉白色 `brightness(0) invert(1) drop-shadow` 重绘。伤害数字：只在上层画一次（原来两遍都画），同一位置 0.5 s 内合并为总数，每帧最多 14 个，重叠的丢弃。受击闪白改为 `lighter` 叠画（direction-art / attack-art / 地标）。另：attack-art 队伍色攻击帧缓存从 96 个改成 28 MB 字节上限（原来会战每帧重染约 36 张） | `battle-before.jpg` | `battle-after.jpg`、`battle-after-phone.jpg` |
| 4 国家地标换图 | 新增 `public/landmark-art.js`：九国地标用 `ten-capitals.png` 对应国家的建筑（只保留最大连通块，去掉相邻格的碎片）；法国保留已有的写实马术学院。宽度 = 原美术宽度 ×1.08，高度按位图比例；施工透明度与脚手架、受损贴花、像素拾取、血条、图标都随同一尺寸。比例：村民约等于一层楼高 | `landmark-before.jpg`、`landmarks-montage-before.jpg` | `landmark-after.jpg`、`landmarks-montage-after.jpg` |
| 5 地表混合 | `terrain-art.js` 用 8 种材质烘焙：草/枯草/草甸/泥土/碎石区域（16 px 网格值噪声 + 材质亮度做边缘），带纹理的泥土路，石矿/金矿周围碎石与板岩，部分林缘深色地面；建筑完工且玩家可见时一次性把踩秃的泥地印进同一张缓存地表（小地图同步，不泄露迷雾）。去掉烘焙的“v”形草叶和每帧画的矢量草（约 4 ms/帧） | `opening-before.jpg` | `opening-after.jpg` |
| 顺手 | `carrier-v45.png` 移出 Service Worker 预缓存，启动时不再加载；只有旧存档真画到航母时才请求，到达前用基础航母图。文件仍在仓库和 dist 里，所以旧存档能按需取到 | — | — |

截图都在 `docs/visual-pass-v41/`（桌面 1280×720，另一张手机 393×852）。

## 性能（headless Chromium，无 GPU，2 核共享虚拟机；只用于提交之间比较，不是真机帧率）

完整 release-check，200 单位会战：

| | 帧间隔 p50/p95 ms | render p50/p95 ms | 每帧 drawImage | 每帧带 filter 绘制 |
|---|---|---|---|---|
| 桌面 main 2959137（完整） | 2966.6 / 3158.1 | 9.4 / 39.1 | 526 | 36.5 |
| 桌面 本分支 b905709（完整） | **83.3 / 116.7** | 16.4 / 30.8 | 517.3 | **0** |
| 手机 main 2959137（完整） | 2308.3 / 2608.3 | 5.4 / 29.6 | 421.8 | 37.8 |
| 手机 本分支 b905709（完整） | **50.1 / 100** | 15.6 / 32.4 | 466.5 | **0** |

为什么 render p50 看起来变高：以前每帧约 40 次 `ctx.filter` 让 headless 帧间隔到了约 3 秒，HUD 的 render 中位数主要采到开战前的轻量帧。同一套脚本、同一时段做 A/B（本地 Node+Playwright，开战后 2.5 s 起取 12 s）：

- 桌面：之前 12 s 只出 4 帧，render 均值 29.8 ms（遮挡 11.1 ms）；之后 111 帧，29.0 ms（遮挡 5.8 ms，投影 1.3 ms）。
- 手机：之前 5 帧，29.8 ms；之后 180 帧，22.1 ms。
- 把旧版的 filter 临时去掉后，units 一项就是 21 ms/帧，说明旧基线里低的 render p50 是假象，不是渲染变快了。

完整检查结论：**WARN，89 PASS / 5 WARN / 0 FAIL**（`docs/release-reports/2026-11-12-b905709.md`）。WARN 说明：

- phone render p50 +93%、phone drawImage +21%：原因见上，帧间隔快了 40 多倍，filter 次数降到 0；基线没有更新。
- 3 项联机 CPU/时延模型 WARN：本分支没改联机或服务器代码，属于沙箱机器负载波动。

地表烘焙时间：之前 1.45–1.53 s，之后 1.14–1.60 s（3428×2481 缓存，headless），每帧不增加成本。

## 检查

`node check-all.cjs` 通过；`npm run build` 通过；`node check-artifact.cjs` 通过；完整 `npm run release-check` 0 FAIL。
`check-carrier-presentation.cjs` 改为在绘制前等待新增的 `A.carrierArtReady()`（航母图改成按需加载）。

## 未验证 / 已知局限

- 没有真机：iPhone 17 / iPad 的 `?perf=1` 帧率、发热，以及 Safari/WebKit 的投影和 `lighter` 合成效果都没测。
- 新增内存：attack-art 队伍色帧最多 28 MB（原来约 6.6 MB）；投影缓存最多 320 张小画布。需要在 iPad/iPhone 上看内存。
- 剩下的渲染大头是原有缓存不够大：步态合成帧（192 帧上限，行军时每帧新建约 16 张画布）和拾取遮罩（240 条，血条每帧重建约 10 张）。这次没改，只记录。
- 纵门在 1.0 缩放下比较细，开/关的可读性仍需按城墙提示词 F 出新图。
- 金矿/石矿本身仍是平涂多面体（审核 v2 资源点提示词 N，需要出图），这次只加了地面碎石。
- 不同国家地标有些没有明显的队伍色区（ten-capitals 原图没有可染色旗帜），敌我只靠血条/选择圈区分。
- 矢量草取消后，地面的“风吹草动”也没了；需要的话等出了草丛贴花再加回来。
