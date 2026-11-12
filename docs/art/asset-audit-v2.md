# 边境王国 · 素材审查 v2（对标 AoE II DE / AoE IV / 魔兽争霸 III 重制版）

审查人：Claude（本次任务中担任艺术总监，一次性审查，不是常驻评审）· 日期 2026-11-12 · 仓库快照 `main` @ deb60cf（只读，没有改游戏代码和素材）
底稿：`docs/design/art-audit.md`（v1，2026-11-10 @ 79365c8，兵种/建筑逐项、P0–P4、模板 A–J）与 `docs/art-review-walls.md`（城墙，`feature/realistic-walls` @ e64d0b4）。本文只增量复查 v1 之后的变化和 v1 没覆盖的类别；v1 的逐兵种、逐建筑结论仍然有效，这里不再重复。
方法：`node preview.cjs` + Playwright（headless Chromium，`--disable-gpu`，字体请求中止，`domcontentloaded`），点“开始”后按游戏真实脚本顺序渲染，用测试钩子摆场景（只在测试页面里改模拟状态）。桌面 1280×720 共 12 张、手机 393×852 共 3 张，外加 1 张素材缩略拼图（PIL）。每张都由我亲眼看过。**没有真机测试。**

证据（已随本文提交）：`docs/art/asset-audit-v2/`，下文简称 `E/`。

| 文件 | 内容 |
|---|---|
| `E/d02-opening.jpg` | 开局默认缩放：城镇中心、房屋、兵营、森林、金矿、小地图、底栏 |
| `E/d03-opening-zoom17.jpg` | 同一场景放大 1.7 倍：材质密度、地面、接地 |
| `E/d04-battle-fx.jpg` `E/d05-battle-fx2.jpg` | 72 单位会战（火枪、火炮、骑兵、长枪、掷弹、弓）：弹道、烟、命中、伤害数字、遮挡剪影 |
| `E/d06-buildings-states.jpg` | 兵营、马厩（35% 血，受损贴花）、铁匠铺（施工中 30%）、市场、教堂、箭塔、要塞 |
| `E/d07-destroyed.jpg` | 市场、箭塔被摧毁的瞬间与之后 |
| `E/d08-coast-dock.jpg` | 港口、海岸、水面、渔船、护卫舰 |
| `E/d09-air.jpg` | 侦察热气球、双翼轰炸机 |
| `E/d10-resources.jpg` | 金矿、石矿、牛、树林，村民采集 |
| `E/d11-ui-villager-build.jpg` | 选中村民：头像、建造目录 |
| `E/d12-ui-info.jpg` | ⓘ 弹窗（房屋） |
| `E/d13-landmark-palace.jpg` | 英国国家地标“皇家军械所”与统帅府 |
| `E/m-montage.jpg` | 手机竖屏：开局 / 村民面板 / ⓘ 弹窗 |
| `E/env-montage.jpg` | 环境与特效素材缩略拼图（绿色底，用来暴露透明问题） |

---

## 0. 结论（先读这里）

1. **兵种和建筑单体已经接近标杆，拉开差距的是“它们之间的东西”。** 单体精灵（V33/V34 兵种、architecture-v2 建筑、trees-v29 树木）的材质密度够得上 AoE II DE 的水准。但画面整体看上去像“高质量贴纸摆在一块均匀的草皮上”：**地表只有一种草地材质平铺**、**没有任何投影或接地阴影**、**水面是一块平涂蓝色、海岸是圆角方块**、**石矿是平涂多面体**。这四项比继续加兵种帧更能决定第一眼观感，而且生成成本很低（约 6 次生成，外加工程接入）。
2. **v1 之后的变化：**
   - `main` 里**还没有合入写实城墙**：`walls-v1.png` 和删除 `ornament()` 只在 `feature/realistic-walls`（e64d0b4）分支上，`main` 的城墙仍是平涂矢量块，II 时代以后的漂浮矢量屋顶和 IV 时代以后的矩形小旗仍会出现。先合并这条分支，再谈城墙提示词 F。
   - 兵种精简后国家建筑已经变成“一局一座”的**国家地标**，但英国地标（皇家军械所）在游戏里**仍是程序画的棕色方盒子加蓝色矩形**（`E/d13`），紧挨着写实的统帅府，落差最大。`ten-capitals.png` 十座首都仍然只用来做图标。这是代码接入问题，不需要新素材。
   - 新增了 `carrier-v45.png`（1.2 MB），但航母已退役。建议移出发布包。
   - 鸢尾花仍然印在所有国家的城镇中心、兵营、房屋旗帜上（`E/d03`）。
3. **新发现的问题（v1 没覆盖的类别）：**
   - **地表**：`terrain-materials-v2.png` 有 8 种写实材质（草、草甸、枯草、泥土、岩石、水、碎石、板岩，`E/env-montage.jpg` 左上），但游戏里大面积只看到一种枯黄草地，放大时还有矢量画的“v”形草叶记号（`E/d03`）。没有道路、泥地斑块、碎石、花丛等贴花，也没有材质过渡。
   - **水与海岸**：水面是平涂蓝加细波纹，岸线是一串圆角方块，草地和水之间是一圈暗色描边，没有沙滩、浅水和浪花（`E/d08`）。护卫舰船体压到草地上。
   - **资源点**：石矿是浅灰平涂多面体，像低多边形占位图（`E/d10`、`E/m-montage` 第一张）；金矿是同一张 `clarity-v6` 金矿堆竖着叠三次，看上去像贴图重复（`E/d02`）；浆果丛在 world-atlas 里有写实图，但开局只见牛。渔场没有单独素材。
   - **阴影与光照**：建筑、单位、树、飞机都没有投影，只有选中圈。光源在各素材里都是左上暖光（一致），但缺少落在地面上的结果，所有东西都“浮”在地上。热气球和轰炸机在地面上没有影子，看不出高度（`E/d09`）。
   - **特效**：火枪烟、火炮烟是程序粒子（`combat-fx-v37.js`），整体可读，但枪口火焰很小，炮弹是黑色小圆点，落点没有爆炸和尘土；建筑倒塌有写实尘土和碎片（`building-damage-v32` 第 3 行），**倒塌后不留残骸**，地上什么都没有（`E/d07`）。
   - **遮挡剪影**：被建筑挡住的单位画成大面积半透明白色人形，会战时铺满城镇中心（`E/d04`、`E/d05`），是目前画面里最“不像游戏美术”的元素；伤害数字也很密。属于代码与 UI 参数问题。
   - **UI**：顶栏和底栏是深青色面板加细金边，排版干净，但按钮图标是单色线条符号（旗、城堡、准星），与写实厚涂世界不统一；ⓘ 弹窗像网页对话框（`E/d12`）。单位头像其实是**缩小的全身站姿**，40 px 左右，看不清脸（`E/d11`）。建造目录的建筑小图是好的。
   - **施工状态**：仍是整体半透明加矢量竖线（`E/d06` 铁匠铺），和 v1 结论一样。
4. **新增素材总量：** v1 的 P0–P4 约 75 次生成、约 1,500 帧仍然有效；本轮新增约 **24 次生成、约 430 帧/图块**（地形 3、水岸 2、资源点 2、残骸 1、特效 6、UI 4、头像 6）。**合计约 100 次生成、约 1,950 帧**（不含英雄行走 320 帧）。另有 5 项只需工程接入、不需要出图（地标、投影、遮挡剪影、城墙合并、地表混合）。

---

## 1. 质感标杆：把“AoE / 魔兽质感”拆成可检查的标准

评级：✅ 达标 · 🟡 接近 · 🔴 明显差距。

| # | 标准 | 标杆是什么样（可检查） | 我们现状 | 差距 | 证据 |
|---|---|---|---|---|---|
| 1 | **统一光源与投影** | 所有物体同一方向的光（AoE II DE 左上），每个物体在地面上有方向一致的软投影，接地处有环境光遮蔽暗边；飞行单位投影离本体有距离，表示高度 | 素材自身的受光方向一致（左上暖光）✅；**地面上没有任何投影**，建筑、树、单位都没有接地暗边 | 🔴 最大单项差距。主要是代码：按精灵轮廓生成一次性投影缓存（往右下偏移、压扁、模糊），每个实体多一次 drawImage。不需要新图 | `E/d02` `E/d03` `E/d09` |
| 2 | **材质细节密度** | 默认缩放下石块、瓦片、木纹、布料都有可见颗粒；放大 1.5 倍不糊 | 建筑、兵种、树木 ✅；地面在 1.7 倍时变成均匀糊状，有矢量草叶记号 🔴；石矿低模 🔴 | 地面和资源点 | `E/d03` `E/d10` |
| 3 | **默认缩放下的轮廓可读性** | 40–60 px 高的单位，一眼分出兵种（帽子、武器长度、坐骑）；英雄、攻城、空军轮廓独特 | 兵种轮廓 ✅（v1 结论）；会战时被白色遮挡剪影和伤害数字盖住 🔴；英雄与本国特色兵难分（v1 P3） 🟡 | 遮挡剪影改成队伍色描边、降低透明度；伤害数字合并 | `E/d04` `E/d05` |
| 4 | **阵营色区** | 队伍色只出现在固定的布料区（旗、肩带、马衣、帆），面积 10–20%，远看能分清敌我，不靠选中圈 | 布料区可染色 ✅；但所有旗帜、马衣都带鸢尾花 🟡；红队旗帜上的白色图案很显眼（`E/d05` 右侧） | 去徽记（模板 I） | `E/d03` `E/d05` |
| 5 | **动画帧数与节奏** | 行走 8–12 帧、攻击 6–10 帧、待机有呼吸；脚不滑 | 攻击 4 帧 ✅（V34）；**行走只有一张站姿加错切** 🔴（v1 P0）；船、气球、飞机静止 🟡 | v1 P0 行走仍是最大工作量 | v1 `R/walk_units.png` |
| 6 | **地表过渡与贴花** | 草—泥—沙—岩之间有不规则的混合边；建筑脚下有踩秃的泥地；道路、碎石、花丛、车辙打破重复 | 一种草地平铺；建筑脚下没有泥地；地图上没有贴花 🔴 | 新出：地表贴花图集、过渡遮罩；复用 terrain-materials-v2 | `E/d02` `E/env-montage` |
| 7 | **水面** | 深浅两层颜色、反光与波纹动画、岸边浪花线、浅滩可见水底、沙滩过渡 | 平涂蓝加细波纹，岸线是圆角方块，有暗色描边，无浪花、无沙滩 🔴 | 新出：浪花序列帧、沙滩与浅水图块；代码做岸线平滑 | `E/d08` |
| 8 | **特效层次** | 每次射击 = 枪口火焰（1–2 帧）+ 烟团（8 帧以上，向上飘散）+ 命中反馈（尘土或火星）；炮弹落地 = 爆炸 + 土块 + 焦痕贴花；建筑起火分小中大三档 | 烟是程序粒子，读得出 🟡；枪口火焰小，炮弹落点无爆炸，无焦痕 🔴；建筑火焰贴花 ✅（damage-v32）；倒塌尘土 ✅ 但不留残骸 🔴 | 新出 6 张特效序列帧；残骸图 | `E/d04` `E/d07` |
| 9 | **UI 质感** | 面板有材质（木、皮革、铜、石），按钮有按下态，图标是同一画风的小插画；头像是带光的半身像 | 面板干净但平 🟡；图标是单色线条符号 🔴；ⓘ 弹窗像网页 🟡；头像是缩小的全身像 🔴 | 新出：UI 套件、图标、头像 | `E/d02` `E/d11` `E/d12` `E/m-montage` |
| 10 | **比例** | 树明显高于人，门洞能进人，炮与人的比例可信 | 树 ✅；建筑门洞偏小（v1）🟡；火炮比步兵大一圈 🟡 | 不改素材，按 v1 建议用真机截图复核 | `E/d04` `E/d06` |
| 11 | **建筑时代外观、损毁、施工** | 每个时代建筑外观有变化；受损分 3 档；施工有地基和脚手架；摧毁留下废墟 | 时代外观只改屋顶色（v1）🟡；受损贴花 ✅；施工是半透明加竖线 🔴；废墟缺失 🔴 | v1 P1-6 施工阶段；本文新增残骸图 | `E/d06` `E/d07` |

---

## 2. 差距清单与优先级 Top 15

按“观感提升 ÷ 生成成本”排序。观感：★ 越多提升越大；成本按生成次数估。“复用”一列写能拿来直接用或作参考的现有素材。

| # | 类别 | 现状问题 | 需要的素材 / 工作 | 复用 | 预估张数 / 帧数 | 观感 |
|---|---|---|---|---|---|---|
| 1 | 阴影光照（代码） | 所有物体都没有地面投影，像贴在地上 | 无需出图：按精灵 alpha 生成投影缓存（光从左上，影子往右下偏 0.35×高度、竖向压扁到 0.3、模糊 4 px、不透明度 0.35）；飞行单位投影按高度偏移 | 全部现有精灵 | 0 | ★★★★★ |
| 2 | 地表材质与过渡 | 只有一种草地，有矢量草叶记号，无过渡 | ① 地表贴花图集（泥地斑块、踩秃地面、车辙小路、碎石、花丛、草丛、树桩、落叶）② 无缝材质补 2 种（沙滩、深色森林地面） ③ 过渡边缘遮罩（可程序生成，不出图） | terrain-materials-v2 的 8 种材质直接用作底材 | 3 张生成（贴花 16 + 补材质 2 + 森林地面贴花 8） | ★★★★★ |
| 3 | 水面与海岸 | 平涂蓝、圆角方块岸线、暗描边、无浪花 | ① 岸边浪花序列帧（直边、外角、内角 × 8 帧）② 浅水 / 沙滩无缝图块 + 深水焦散叠层 | terrain-materials-v2 第 6 格水面作深水底 | 2 张生成（约 32 帧 + 4 图块） | ★★★★☆ |
| 4 | 遮挡剪影与伤害数字（代码） | 会战时大面积白色人形和密集数字 | 无需出图：剪影改成 1.5 px 队伍色描边 + 25% 填充；同一目标 0.4 s 内伤害合并显示 | — | 0 | ★★★★☆ |
| 5 | 资源点 | 石矿低模平涂；金矿同图竖叠三次；无渔场 | 金矿、石矿各 3 档储量 + 枯竭；浆果丛 满 / 半 / 空；鱼群水面波纹 4 帧；伐倒的树桩 2 种 | world-atlas 的写实岩石与浆果丛可作风格参考；clarity-v6 金矿堆作单块参考 | 2 张生成（约 18 格） | ★★★★☆ |
| 6 | 国家地标（代码） | 地标仍是程序方盒子 | 无需出图：接入 ten-capitals.png（dynasty-art.js 已切好 `capitals[n]`） | ten-capitals.png | 0 | ★★★★☆ |
| 7 | 城墙（合并 + 出图） | main 仍是矢量块，ornament 漂浮色块仍在 | 先合并 `feature/realistic-walls`；然后按提示词 F 终版出图替换纵墙、纵门、塔 | walls-v1.png、industry-v2 第 10/11 格 | 1 张生成（8 格） | ★★★☆☆ |
| 8 | 特效序列帧 | 枪口火焰小、炮弹无爆炸、无焦痕；火焰只在受损贴花里 | 枪口火焰 + 烟、炮弹落地爆炸、焦痕贴花、持续火焰（小 / 中 / 大）、尘土（行军 / 冲锋 / 落地）、建筑起火大火、血雾（可选，默认关） | magic-v5 的爆炸偏魔幻，只作构图参考；building-damage-v32 的火与尘土保留 | 6 张生成（约 120 帧） | ★★★★☆ |
| 9 | 施工与倒塌残骸 | 施工是半透明加竖线；倒塌后不留东西 | v1 P1-6 施工阶段（小 / 中 / 大 × 地基 / 脚手架）；新增残骸（小 / 中 / 大 × 刚倒塌冒烟 / 冷却后） | building-damage-v32 第 3 行第 4 格的碎石堆可作风格参考 | 2 张生成（12 格） | ★★★☆☆ |
| 10 | 四方向行走（v1 P0） | 只有站姿加错切，滑步约 20% | 39 套行走图集 | V33 站姿、V34 攻击、v29 右向走路作参考 | 39 张生成（≈1,112 帧） | ★★★★★（但成本最高） |
| 11 | UI 套件与图标 | 单色线条图标，平面板，网页式弹窗 | 面板九宫格框、按钮四态、资源图标、科技/指令图标（约 64 个，同一画风） | 顶栏资源图标已经是写实小图，可作风格基准 | 4 张生成 | ★★★☆☆ |
| 12 | 单位头像 | 底栏头像是 40 px 全身缩图 | 半身像，每单位 1 张（约 48 个）。**过渡方案**：从 V33 正面行自动裁胸像，不出图 | directions-*-v33 正面行 | 6 张生成（8 个一张） | ★★★☆☆ |
| 13 | 去徽记 + 升级线（v1 P2） | 鸢尾花十国通用；红十字；近卫戟兵拿剑；长枪攻击变短 | v1 模板 H、I | 原图编辑 | 3 张生成 + 8 次编辑 | ★★★☆☆ |
| 14 | 建筑硬伤（v1 P1-1 到 P1-4） | 磨坊 / 矿场 JPEG 杂边；飞艇工场白边；农田和磨坊重复 | v1 模板 E | functional-buildings-v1.jpg 作设计参考 | 4 张生成 / 编辑 | ★★☆☆☆ |
| 15 | 空中与海上循环（v1 P4） | 热气球、轰炸机、舰船静止，无地面投影 | 热气球漂浮 4 帧、轰炸机螺旋桨与机身微摆 4 帧，各 4 方向；舰船航行（P4-1） | aviation-v2 第 1 格、clarity-v6 第 1 格、directions-navalAir / special 行 | 2 张生成（32 帧），舰船另 5 张 | ★★☆☆☆ |

**建议执行顺序：** 先做 1、4、6、7 的工程接入（0 张图，一次提交就能明显改观），同时出 2、3、5 的 7 张图；然后 8、9；然后 v1 P0 行走分批（先村民和常用的 8 套步兵）；UI、头像、P2–P4 穿插进行。

---

## 3. 提示词

### 3.0 通用规则（每条提示词都隐含，生成时请一并贴上）

- **镜头**：与 `architecture-v2.png` 一致，正交 3/4 俯视，约 40° 仰角，从东南方向看；单位与 `directions-*-v33.png` 一致，约 25° 俯视。**地表图块和贴花是正上方俯视（90°）**，否则无法平铺。
- **光照**：左上暖色太阳光，柔和环境光遮蔽；**素材里不要画投影**（游戏统一加），贴花除外（贴花自带的接地暗部可以保留）。
- **风格关键词**：写实厚涂、预渲染 3D 质感、PBR 材质、18 世纪历史题材、手工绘制细节。**负面**：卡通、Q 版、低多边形、矢量平涂、像素风、赛璐璐描边、照片拼贴、水印、文字。
- **透明**：真实 RGBA，背景 alpha=0，不要棋盘格、白底、渐变、云雾、绿色雾气；边缘无黑白描边光晕。无缝地表图块除外（不透明）。
- **阵营色**：需要队伍色的布料一律**纯蓝色、无图案**（运行时会换色）；不要国徽、鸢尾花、红十字、文字或旗帜纹章。
- **网格**：严格按给定的行列和单格尺寸；格与格之间至少 8 px 透明间隔；任何东西不能越出格子。
- **参考图**：每条都写了要附带的文件名。提示词里注明“只参考画风与镜头，不要复制内容”或“只使用第 N 行的角色”。

### 3.1 沿用并更新 v1 模板 A–J

v1 模板原文见 `docs/design/art-audit.md` §4.3，本轮只改下面几处，其余照用：

| 模板 | 用途 | 本轮更新 |
|---|---|---|
| A 步兵行走 | P0-1、P0-3 到 P0-6 | **单格从 192×256 改为 160×208**（画布 1280×832，8×4），脚底基线 y=184、躯干中心 x=80。原因：包体与内存（§4.4）。末尾追加：“no cast shadow; the game adds a shared ground shadow”（不画投影，游戏统一加地面阴影） |
| B 负重行走 | P0-2 | 同 A 的新尺寸；参考图改为 `directions-cargo-v33.png` + `villager-carry-v9.png`（动作参考） |
| C 骑乘 / 野兽 | P0-7、P0-8 | 单格 224×224（画布 1344×896，6×4），蹄底基线 y=200、中心 x=112 |
| D 攻城推行 | P0-9 | 不变 |
| E 建筑单体 | P1-1、P1-2、P1-4、P3 | 追加“no cast shadow outside the building's own apron”（建筑自带地坪以外不画投影）；旗帜纯蓝无图案 |
| F 城墙 | P1-5 | **作废 v1 版本，改用 `docs/art-review-walls.md` 末尾的提示词 F 终版**（在 `feature/realistic-walls` 分支上；合并后在 main 的同名文件里）。参考图：`walls-v1.png`、`industry-v2.png` 第 10/11 格、`architecture-v2.png` |
| G 施工阶段 | P1-6 | 不变；与本文模板 O（残骸）同批生成，保证石料颜色一致 |
| H 攻击重画 | P1-7、P2-2、P2-3 | 不变 |
| I 去徽记 | P2-4 | 范围追加：`architecture-v2.png`（城镇中心、兵营、房屋、要塞的旗帜和挂毯）、`attack-hussar-v34.png`、`attack-cavalry-v34.png`；红队旗帜上的白色图案一并去掉 |
| J 统帅外观 | P3-1 | 不变 |

### 3.2 K · 地表贴花图集（Top 15 #2）

参考图：`terrain-materials-v2.png`（材质与色调）、`meadow.jpg`（草地底色）、`E/d03-opening-zoom17.jpg`（游戏里的比例）。

**EN**
Use case: production RTS ground decals. Premium realistic 1700s historical RTS, painterly pre-rendered PBR finish, colours matched to the attached `terrain-materials-v2.png` and `meadow.jpg`. STRAIGHT TOP-DOWN (90°) view, no perspective. Warm light from the upper left. Canvas 2048×2048, EXACTLY 4 columns × 4 rows of 512×512 cells, one decal per cell, each decal centred and filling about 80% of its cell with an irregular organic outline that FADES to alpha 0 over its outer 15% (soft feathered edge, no hard border, no square shape). TRUE TRANSPARENT background. Cells: (1) trampled bare dirt patch with footprints, for under buildings; (2) larger trampled dirt yard, oval; (3) straight cart track segment with two wheel ruts and grass in the middle, both ends fading; (4) curved cart track segment (90°); (5) scattered small grey stones and gravel; (6) single flat rock outcrop with moss; (7) wildflower clump, white and yellow; (8) tall grass tuft cluster; (9) fern and low shrub cluster; (10) fallen leaves and twigs; (11) muddy puddle with a faint sky reflection; (12) cut tree stump with sawdust; (13) burnt scorch mark (for explosions), black-brown with ash; (14) dark ploughed soil patch; (15) dry cracked earth patch; (16) cobblestone plaza fragment with grass in joints. Scale: 1 cell = about 4 villager heights across. No objects taller than ankle height, no buildings, no people, no text.

**中文**
用途：正式 RTS 地表贴花。高品质写实 18 世纪历史 RTS，厚涂预渲染 PBR 质感，颜色与附带的 `terrain-materials-v2.png`、`meadow.jpg` 一致。**正上方俯视（90°）**，没有透视。左上暖光。画布 2048×2048，**正好 4 列 × 4 行**，每格 512×512，每格一个贴花，居中，约占格子 80%，外形不规则、自然，**外圈 15% 逐渐淡出到 alpha 0**（柔和羽化边，不要硬边，不要方形）。真实透明背景。各格：(1) 踩秃的泥地，带脚印，用于建筑脚下；(2) 更大的椭圆形踩秃泥地院子；(3) 直的车辙小路段，两道轮辙中间有草，两端淡出；(4) 90° 弯的车辙小路段；(5) 散落的小灰石和碎石；(6) 一块长苔藓的平岩；(7) 白色和黄色的野花丛；(8) 高草丛；(9) 蕨类和低矮灌木丛；(10) 落叶和枯枝；(11) 泥水坑，隐约反射天空；(12) 带木屑的树桩；(13) 爆炸焦痕，黑褐色带灰烬；(14) 深色翻耕土；(15) 干裂的土地；(16) 草缝里的卵石广场残片。比例：一格宽约等于 4 个村民身高。所有东西不高于脚踝，不要建筑、人物或文字。

### 3.3 L · 补充无缝地表材质（Top 15 #2）

参考图：`terrain-materials-v2.png`。

**EN**
Use case: seamless tileable terrain textures for a premium realistic 1700s RTS, matching the attached `terrain-materials-v2.png` in scale, colour and painterly PBR finish. STRAIGHT TOP-DOWN, no perspective, no lighting gradient across the tile, no vignette, OPAQUE. Canvas 2048×1024, EXACTLY 2 cells of 1024×1024, each cell SEAMLESSLY TILEABLE on all four edges (the left edge continues the right edge, the top continues the bottom), no visible repeating landmark in the cell. Cell 1: pale golden coastal sand with small shells and a few dark wet patches. Cell 2: dark forest floor — moss, needles, leaf litter, small roots, low contrast. Scale: a villager is about 1/12 of the cell width. No objects, no text.

**中文**
用途：高品质写实 18 世纪 RTS 的无缝地表材质，比例、颜色和厚涂 PBR 质感与附带的 `terrain-materials-v2.png` 一致。**正上方俯视**，没有透视，图块内没有明暗渐变或暗角，**不透明**。画布 2048×1024，**正好 2 格**，每格 1024×1024，**四边都能无缝平铺**（左边接右边、上边接下边），格内不要有显眼的重复标志物。第 1 格：浅金色海岸沙地，有小贝壳和几处深色湿沙。第 2 格：深色森林地面，苔藓、松针、落叶、细根，低对比。比例：一个村民约为格宽的 1/12。不要物体或文字。

### 3.4 M · 岸边浪花与浅水（Top 15 #3）

参考图：`terrain-materials-v2.png` 第 6 格（水）、`E/d08-coast-dock.jpg`。

**M1 浪花序列帧 · EN**
Use case: animated shoreline foam overlay for a realistic 1700s RTS, top-down. STRAIGHT TOP-DOWN view. Canvas 2048×1536, EXACTLY 8 columns × 3 rows of 256×512 cells. Row 1: STRAIGHT shoreline piece — land side at the TOP of the cell, open water at the bottom; a band of white surf foam and wet-sand darkening along the waterline, about 120 px deep. Row 2: OUTER corner (land convex) using the same foam style. Row 3: INNER corner (land concave). Each row is an 8-frame seamless loop: the foam line advances 24 px toward land, breaks into lace, and recedes, with the lace pattern drifting. Only foam, thin translucent water film and wet sand darkening are painted; everything else is alpha 0 so the game's sand and water show through. In Row 1 the left and right edges of every frame must tile seamlessly. No rocks, no boats, no text.

**M1 浪花序列帧 · 中文**
用途：写实 18 世纪 RTS 岸边浪花叠层动画，俯视。**正上方俯视。**画布 2048×1536，**正好 8 列 × 3 行**，每格 256×512。第 1 行：**直岸线**，陆地在格子上方、开阔水面在下方；沿水线一条白色浪花和湿沙变深的带，纵深约 120 px。第 2 行：**外角**（陆地凸出），浪花画法相同。第 3 行：**内角**（陆地凹入）。每行是 8 帧无缝循环：浪花线向陆地推进 24 px，碎成网状泡沫，再退回，泡沫纹样缓慢漂移。只画浪花、半透明薄水膜和湿沙变深；其余全部 alpha 0，让游戏里的沙地和水面透出来。第 1 行每帧左右两边必须能无缝拼接。不要岩石、船或文字。

**M2 浅水与深水叠层 · EN**
Seamless tileable water layers, top-down, matching `terrain-materials-v2.png` cell 6. Canvas 2048×1024, 2 cells of 1024×1024, each tileable on all edges. Cell 1 (OPAQUE): shallow turquoise water over visible sandy bottom with soft ripples. Cell 2 (TRANSPARENT overlay, alpha 0 where nothing is painted): bright caustic light network and small specular glints, to be scrolled slowly over deep water. No foam, no objects.

**M2 浅水与深水叠层 · 中文**
无缝水面图层，俯视，与 `terrain-materials-v2.png` 第 6 格一致。画布 2048×1024，2 格，每格 1024×1024，四边可平铺。第 1 格（**不透明**）：浅绿松石色浅水，能看见沙底和柔和波纹。第 2 格（**透明叠层**，没画的地方 alpha 0）：明亮的焦散光网和细小高光点，游戏里会在深水上缓慢滚动。不要浪花或物体。

### 3.5 N · 资源点（Top 15 #5）

参考图：`world-atlas.png`（第 2 行第 3 格岩石、第 4 格浆果丛：画风）、`clarity-v6.png` 第 3 格（金矿堆）、`trees-v29.png`（比例）、`architecture-v2.png`（镜头）。

**N1 金矿 / 石矿 · EN**
Use case: production resource-node sprites for a premium realistic 1700s RTS. Orthographic three-quarter top-down camera about 40° elevation from the south-east, matching the attached `architecture-v2.png` and `world-atlas.png` (rocks) exactly in camera, light and painterly pre-rendered PBR finish. TRUE TRANSPARENT background. Canvas 2048×1024, EXACTLY 4 columns × 2 rows of 512×512 cells. Row 1 GOLD MINE: (1) large outcrop of dark granite boulders with thick veins and nuggets of gold, some loose gold ore at the base; (2) the same deposit about 60% mined — fewer boulders, broken faces, pick marks; (3) the same about 25% left — a low rubble mound with a few gold glints; (4) depleted — flat scatter of grey gravel and dust, no gold. Row 2 STONE QUARRY: the same four stages for pale grey limestone boulders with natural fracture planes, some squared blocks already cut, chips at the base. All cells share the same footprint (about 2.2 villager heights wide), ground contact centred at x=256, y=430; at least 8% transparent margin. Each node is ONE natural cluster, not stacked copies. No cast shadow, no tools, no people, no text. Not low-poly, not flat-shaded.

**N1 金矿 / 石矿 · 中文**
用途：高品质写实 18 世纪 RTS 的正式资源点精灵。正交 3/4 俯视，仰角约 40°，从东南方向看，镜头、光照和厚涂预渲染 PBR 质感**与附带的 `architecture-v2.png`、`world-atlas.png`（岩石）完全一致**。真实透明背景。画布 2048×1024，**正好 4 列 × 2 行**，每格 512×512。第 1 行**金矿**：(1) 一大片深色花岗岩巨石，带粗金矿脉和金块，底部散落金矿石；(2) 同一矿点开采约 60%：巨石变少，断面新鲜，有镐痕；(3) 剩约 25%：低矮的碎石堆，零星金光；(4) 枯竭：一片灰色碎石和尘土，没有金。第 2 行**石矿**：同样四个阶段，浅灰石灰岩巨石，自然断裂面，有几块已经切成方块，底部有碎屑。所有格子占地相同（宽约 2.2 个村民身高），接地中心在 x=256，y=430；四周至少留 8% 透明边距。每个矿点是**一整团自然的石堆，不是同一块石头复制叠放**。不画投影、工具、人物或文字。不要低多边形或平涂。

**N2 浆果、渔场、树桩 · EN**
Same camera, light, style and transparency as N1. Canvas 2048×1024, 4 columns × 2 rows of 512×512 cells. Row 1 BERRY BUSH (forage): (1) full dense bush laden with red berries; (2) half-picked; (3) nearly bare, a few berries; (4) bare twigs. Row 2: (5)–(8) FISH SHOAL, a 4-frame seamless loop seen on open water — circular ripples, dark fish backs and silver flashes breaking the surface; ONLY ripples, fish and splashes are painted, the water itself is alpha 0. Fish shoal diameter about 3 villager heights. Bush about 1.2 villager heights tall.

**N2 浆果、渔场、树桩 · 中文**
镜头、光照、风格和透明要求同 N1。画布 2048×1024，4 列 × 2 行，每格 512×512。第 1 行**浆果丛**：(1) 结满红浆果的茂密灌木；(2) 摘了一半；(3) 几乎摘光，剩几颗；(4) 只剩枝条。第 2 行 (5)–(8)：**鱼群**，开阔水面上的 4 帧无缝循环——圆形涟漪、深色鱼背和银色鱼鳞闪光跃出水面；**只画涟漪、鱼和水花，水本身 alpha 0**。鱼群直径约 3 个村民身高，灌木高约 1.2 个村民身高。

（伐倒的树桩已放进模板 K 第 12 格。）

### 3.6 O · 建筑倒塌残骸（Top 15 #9）

参考图：`building-damage-v32.png`（第 3 行：尘土和碎石的画法）、`architecture-v2.png`（镜头、石材和瓦片）。

**EN**
Use case: building ruin sprites left on the ground after destruction, premium realistic 1700s RTS. Same camera, light and painterly PBR finish as the attached `architecture-v2.png`; debris style matching `building-damage-v32.png` row 3. TRUE TRANSPARENT background. Canvas 1536×1024, EXACTLY 3 columns × 2 rows of 512×512 cells. Columns = footprint SMALL (house), MEDIUM (barracks), LARGE (town centre / fort). Row 1: freshly collapsed — heap of broken stone, snapped charred beams, fallen roof tiles, a few low embers and thin smoke wisps; Row 2: the same ruin cooled — no smoke, ash-grey, a few weeds. Generic European/neutral materials (grey stone, dark timber, slate and terracotta tiles mixed) so it fits every nation. Ruin height at most 0.6 villager height; footprints exactly as wide as the corresponding building base; ground contact centred at x=256, y=440; 8% margin. No flags, no team colour, no people, no text.

**中文**
用途：建筑被摧毁后留在地上的废墟精灵，高品质写实 18 世纪 RTS。镜头、光照和厚涂 PBR 质感与附带的 `architecture-v2.png` 一致，碎石画法与 `building-damage-v32.png` 第 3 行一致。真实透明背景。画布 1536×1024，**正好 3 列 × 2 行**，每格 512×512。列 = 占地 小（房屋）、中（兵营）、大（城镇中心 / 要塞）。第 1 行：刚倒塌——碎石堆、折断烧焦的梁、掉落的瓦片、几处低矮余火和细烟；第 2 行：同一废墟冷却后——没有烟，灰白色，长出几根杂草。材料通用中性（灰石、深色木料、板岩和陶瓦混杂），十国都能用。废墟高度不超过 0.6 个村民身高；宽度与对应建筑底座一致；接地中心 x=256，y=440；留 8% 边距。不要旗帜、队伍色、人物或文字。

### 3.7 P · 特效序列帧（Top 15 #8）

共同规格（每张都要写进提示词）：**真实透明背景；只画特效本身；左上暖光；写实，不是卡通爆炸，不是魔法特效；每格内特效的起点（枪口 / 落点 / 地面中心）固定在同一像素；格间 8 px 透明；最后一帧完全消散到 alpha 0。** 参考图：`attack-musketeer-v34.png`（枪口位置与尺度）、`attack-cannon-v34.png`、`building-damage-v32.png`（火焰与尘土画风）、`E/d04-battle-fx.jpg`（游戏里的尺度）。**不要**参考 `magic-v5.png`（魔幻风）。

| 编号 | 名称 | 画布 / 网格 | 帧 | 锚点 |
|---|---|---|---|---|
| P1 | 枪口火焰 + 硝烟（火枪、步枪） | 1024×512，8×2，128×256；第 1 行朝右，第 2 行朝镜头 | 8 | 枪口在 x=16（右向）/ x=64,y=200（朝镜头） |
| P2 | 火炮炮口火焰 + 大团硝烟 | 2048×512，8×2，256×256；朝右 / 朝镜头 | 8 | 炮口 x=24,y=160 |
| P3 | 炮弹落地爆炸（土块、尘柱、火光） | 2048×512，8×1，256×512 | 8 | 落点 x=128,y=460 |
| P4 | 持续火焰（小 / 中 / 大，循环） | 2048×1536，8×3，256×512 | 每行 8 | 火焰底 x=128,y=480 |
| P5 | 尘土（行军脚下 / 骑兵冲锋 / 重物落地） | 2048×768，8×3，256×256 | 每行 8 | 地面中心 x=128,y=220 |
| P6 | 建筑起火大火 + 黑烟柱（循环） | 2048×1024，8×1，256×1024 | 8 | 火焰底 x=128,y=980 |
| P7（可选，默认关） | 命中血雾 | 1024×256，8×1，128×256 | 8 | 命中点 x=64,y=128 |

**EN（把 {…} 换成上表一行）**
Use case: production VFX sprite sheet for a premium realistic 1700s gunpowder-era RTS. {name}. Canvas {canvas}, EXACTLY {grid} cells of {cell}. Each row is one seamless {8-frame one-shot | 8-frame loop} sequence read left to right. Realistic black-powder look: {P1: a short bright orange-yellow muzzle flash with a few sparks in frames 1–2 only, then a dense off-white powder-smoke puff that expands, drifts upward and to the right, thins and fully dissipates by frame 8 | P2: a large flash and a heavy rolling bank of grey-white smoke, ground-hugging, dissipating by frame 8 | P3: impact — a dark-brown spray of earth clods and a column of dust, a brief orange flash at frame 2, debris falling back, dust settling, nothing left at frame 8 | P4: natural wood fire, orange-yellow tongues with a dark red base, embers and a thin smoke tail, three intensities small/medium/large, each row loops seamlessly | P5: tan dust clouds — row1 light puffs kicked by marching feet, row2 a long dust trail behind charging horses, row3 a ring burst from a heavy object hitting the ground | P6: a building fire — tall flames with a thick black smoke column rising out of the top of the cell, loops seamlessly | P7: a small dark-red mist puff, subtle, no gore, no body parts}. The effect origin stays at {anchor} in every cell. TRUE TRANSPARENT RGBA background (alpha 0), smoke edges soft and semi-transparent, no black or white matte, no glow halo filling the cell. Warm light from the upper left. No ground, no people, no weapons, no text. Not cartoon, not anime, not magical.

**中文（把 {…} 换成上表一行）**
用途：高品质写实 18 世纪火药时代 RTS 的正式特效精灵图集。{名称}。画布 {画布}，**正好 {网格}**，每格 {单格}。每行是一段从左到右的{8 帧一次性 | 8 帧循环}序列。写实黑火药效果：{P1：只在第 1–2 帧出现短促明亮的橙黄枪口火焰和少量火星，随后是一团浓密的米白色硝烟，膨胀、向右上飘、变淡，第 8 帧完全消散 | P2：大火光和沉重翻滚的灰白硝烟，贴地扩散，第 8 帧消散 | P3：落地爆炸——深褐色土块喷溅和一柱尘土，第 2 帧有短暂橙色闪光，碎屑落回，尘土沉降，第 8 帧什么都不剩 | P4：自然的木柴火焰，橙黄火舌、暗红底部、火星和细烟尾，小 / 中 / 大三档强度，每行无缝循环 | P5：土黄色尘土——第 1 行行军脚下的小尘团，第 2 行骑兵冲锋拖出的长尘尾，第 3 行重物落地的环形尘爆 | P6：建筑大火——高火焰加从格子顶部冒出的浓黑烟柱，无缝循环 | P7：一小团暗红色雾气，克制，不要血腥，不要肢体}。每格中特效起点固定在 {锚点}。**真实透明** RGBA 背景（alpha 0），烟的边缘柔和半透明，不要黑白底，不要铺满格子的光晕。左上暖光。不要地面、人物、武器或文字。不要卡通、动漫或魔法风格。

### 3.8 Q · UI 套件（Top 15 #11）

参考图：`E/d02-opening.jpg`（现有配色：深青绿面板、浅金描边、米白文字）、顶栏资源图标（游戏截图中的肉、木、金、石）、`architecture-v2.png`（画风）。**配色不变**，只把材质和图标画风统一。

**Q1 面板与按钮 · EN**
Use case: UI kit for a premium realistic 1700s historical RTS on iPhone, iPad and desktop. Palette fixed: deep teal-green lacquered wood panels (#1d3a36 to #24443f), aged brass trim (#c9b27a), parchment text areas (#e9dcbc). Painterly realistic material, subtle wear, NOT flat, NOT glossy mobile-game style, NOT fantasy gold-and-gems. Canvas 2048×2048 on TRUE TRANSPARENT background, items laid out on a 4×4 grid of 512×512 cells, each item centred: (1) large panel frame, 9-slice friendly — corners 64 px with small brass corner plates, straight edges uniform so they can stretch, centre plain dark teal; (2) small panel frame, 9-slice, corners 32 px; (3) modal dialog frame with a header band; (4) parchment inset panel, 9-slice; (5)–(8) square command button 160×160 in four states: normal, hover (brass edge brighter), pressed (inset, darker), disabled (desaturated); (9)–(10) wide text button 360×96 normal / pressed; (11) round info button 'i' engraved in brass, 96×96; (12) close button engraved X, 96×96; (13) tab, active and inactive side by side; (14) portrait frame, square, brass with inner bevel, 192×192 with transparent centre; (15) minimap frame, square, 9-slice; (16) progress bar trough and fill (health green, production gold). No text except the 'i' and 'X' glyphs. Crisp edges suitable for downscaling to 50%.

**Q1 面板与按钮 · 中文**
用途：高品质写实 18 世纪历史 RTS 的 UI 套件，用于 iPhone、iPad 和电脑。配色固定：深青绿漆木面板（#1d3a36 到 #24443f）、做旧黄铜描边（#c9b27a）、羊皮纸文本区（#e9dcbc）。写实厚涂材质，轻微磨损，**不要平面化，不要亮晶晶的手游风格，不要奇幻风的金子宝石**。画布 2048×2048，**真实透明背景**，按 4×4 网格排布，每格 512×512，物件居中：(1) 大面板框，适合九宫格拉伸——四角 64 px 带小黄铜角片，四边均匀可拉伸，中心纯深青色；(2) 小面板框，九宫格，四角 32 px；(3) 带标题条的弹窗框；(4) 羊皮纸内嵌面板，九宫格；(5)–(8) 方形指令按钮 160×160 四态：常态、悬停（黄铜边更亮）、按下（内凹、更暗）、禁用（去饱和）；(9)–(10) 宽文字按钮 360×96 常态 / 按下；(11) 黄铜刻字的圆形 “i” 信息按钮 96×96；(12) 刻字 X 关闭按钮 96×96；(13) 标签页，激活与未激活并排；(14) 方形头像框，黄铜带内斜面，192×192，中间透明；(15) 方形小地图框，九宫格；(16) 进度条槽与填充（生命绿、生产金）。除 “i” 和 “X” 外不要文字。边缘清晰，缩小到 50% 仍然干净。

**Q2–Q4 指令 / 科技 / 资源图标（3 张，同一提示词换清单）· EN**
Use case: icon sheet for a premium realistic 1700s RTS. Each icon is a small painterly still-life illustration (not a flat glyph, not a line icon) of one object on a TRANSPARENT background, lit from the upper left, rich but readable at 48 px: strong silhouette, 2–3 dominant values, the object fills about 75% of the cell. Consistent style, scale and light across all icons; matching the attached in-game resource icons (meat, logs, gold, stone) and `architecture-v2.png`. Canvas 2048×2048, EXACTLY 8×8 cells of 256×256, row by row in this order: {list of 64 subjects}. No text, no numbers, no borders or frames (the game adds the frame), no national emblems.
清单：Q2 = 指令（移动、攻击、停止、巡逻、驻守、卸载、修理、集结点、重置集结点、建造、采集、拆除、阵型 ×4、选择军队 / 舰队 / 空闲村民、时代升级 I–V 用的五件代表物……）；Q3 = 科技（铁匠铺武器 / 护甲各三阶、伐木、采矿、农业、弹道、炮术、航海、医疗、学说 ×10 等，按 `docs/gameplay-v39.md` 研究表逐项填写）；Q4 = 资源与状态（食物、木、金、石、人口、时间、攻击、护甲、射程、速度、生命、克制、被克制、经验、地标征召等）。

**Q2–Q4 · 中文**
用途：高品质写实 18 世纪 RTS 图标图集。每个图标是一件物品的厚涂小静物插画（**不是平面符号，不是线条图标**），透明背景，左上光，48 px 时仍可读：轮廓强、2–3 个主要明度、物体约占格子 75%。所有图标的风格、比例和光照一致，与附带的游戏内资源图标（肉、原木、金、石）和 `architecture-v2.png` 一致。画布 2048×2048，**正好 8×8 格**，每格 256×256，按以下顺序逐行排列：{64 个对象清单}。不要文字、数字、边框（游戏会加框）或国家徽记。

### 3.9 R · 单位头像（Top 15 #12）

参考图：对应的 `directions-*-v33.png`（**只使用第 N 行正面那一格的角色**）、`attack-*-v34.png`（身份）。每张 8 个单位。

**EN**
Use case: unit portrait sheet for a premium realistic 1700s RTS. Canvas 2048×1024, EXACTLY 4 columns × 2 rows of 512×512 cells, one portrait per cell, in this order: {8 unit names, each with "reference file, row N"}. Each portrait is a head-and-shoulders bust of EXACTLY the same character as the referenced front-facing sprite — same face, hat or helmet, clothing, colours and equipment (weapon tip may show at the shoulder) — painted at higher detail, three-quarter view facing slightly left, warm key light from the upper left, soft rim light, eyes readable. Background: plain soft dark teal-green gradient (#1d3a36 centre to #142a27 edges), OPAQUE, no scenery. Head top at 12% of the cell height, chin at about 62%, shoulders fill the bottom edge. Team-colour cloth stays plain blue. No text, no frame, no emblem, no red cross.

**中文**
用途：高品质写实 18 世纪 RTS 的单位头像图集。画布 2048×1024，**正好 4 列 × 2 行**，每格 512×512，一格一个头像，顺序为：{8 个单位名称，每个注明“参考文件第 N 行”}。每个头像是胸像（头和肩），**与参考的正面精灵完全是同一个角色**——相同的脸、帽子或头盔、服装、配色和装备（武器尖端可以在肩头露出），细节更高，3/4 侧脸略朝左，左上暖色主光，柔和轮廓光，眼睛清楚。背景：纯色柔和深青绿渐变（中心 #1d3a36 到边缘 #142a27），**不透明**，不要场景。头顶在格高 12%，下巴约在 62%，肩膀铺满底边。队伍色布料保持纯蓝。不要文字、边框、徽记或红十字。

**过渡方案（不出图）**：在新头像到位之前，从 V33 正面那一格裁出头顶到胸口的区域，放大到头像框内，并加深青色渐变底。

### 3.10 S · 热气球与轰炸机飞行循环（Top 15 #15，即 v1 P4-2）

参考图：`directions-navalAir-v33.png`（热气球那一行）、`directions-special-v33.png`（轰炸机那一行）、`aviation-v2.png` 第 1 格、`clarity-v6.png` 第 1 格。

**EN**
Use case: flight-loop sprite sheet for a premium realistic 1700s RTS, same identity, camera (about 25° elevated), light and painterly pre-rendered finish as the reference row {N} of {file}. TRUE TRANSPARENT background, NO ground and NO cast shadow (the game draws the shadow on the ground separately). Canvas 1024×1024, EXACTLY 4 columns × 4 rows of 256×256 cells. Rows = heading FRONT (toward camera), BACK, RIGHT, LEFT (draw LEFT separately, do not mirror). Columns = one seamless 4-frame loop: {BALLOON: envelope breathes slightly, basket sways ±3°, ropes follow, small burner flame flickers in frames 1 and 3 | BOMBER: both propellers shown as motion-blurred discs rotating, wings bank ±2°, fabric ripples slightly, pilot head turns}. Same size and centre in every frame: balloon basket bottom at y=230, aircraft centre at x=128, y=128. Team-colour panels plain blue. No text, no roundels, no national markings.

**中文**
用途：高品质写实 18 世纪 RTS 的飞行循环精灵图集，身份、镜头（约 25° 俯视）、光照和厚涂预渲染质感与参考图 {文件} 第 {N} 行一致。**真实透明背景，不画地面，不画投影**（游戏会单独在地面画影子）。画布 1024×1024，**正好 4 列 × 4 行**，每格 256×256。行 = 朝向：正面（朝镜头）、背面、右、左（**左向单独绘制，不要镜像**）。列 = 4 帧无缝循环：{**热气球**：气囊轻微起伏，吊篮摆动 ±3°，绳索随动，第 1、3 帧燃烧器小火苗闪动 | **轰炸机**：两只螺旋桨画成旋转的运动模糊圆盘，机翼倾斜 ±2°，蒙皮轻微抖动，飞行员转头}。每帧大小和中心一致：热气球吊篮底在 y=230，飞机中心在 x=128，y=128。队伍色区域纯蓝。不要文字、机徽或国家标志。

---

## 4. 验收标准与接入流程

### 4.1 每批素材都要过的门槛（沿用 AGENTS.md）

1. **Raster alpha gate**：`python3 -c "from PIL import Image;print(Image.open(f).getchannel('A').getextrema())"` 最小值必须为 0，四角和格间隔 alpha=0；JPEG 或无 alpha 的源图一律退回。叠在草地、沙地、深色底上，**按生产脚本顺序**（`art-preview.html`、`direction-preview.html`、`attack-preview.html` 或真实对局）截图，目视无黑白杂边、无光晕，**并在 docs 里写明是谁看的**。无缝图块（模板 L、M2 第 1 格）例外：改查四边拼接（2×2 平铺截图无接缝）。
2. **四方向**（单位、飞行循环、头像身份）：正、背、右、左齐全，左向不是镜像；`check-directions.cjs` 通过；拾取遮罩、血条、守卫炮口锚点与新帧对齐。
3. **攻击门槛（V34）**：攻击图集重画后跑 `check-attack-actions.cjs`、`check-attack-alpha.cjs`，登记 `attack-manifest.json`；长兵器、机翼完整；行和列都有透明间隔；共享地面锚点。
4. **动作**：行走 8 帧（骑乘 / 野兽 6 帧）逐帧可见差异；脚底基线误差 ≤ 2 px；同一单位身高误差 ≤ 3%；附交“每循环步幅”，录屏检查着地脚漂移 < 步幅 5%。特效第一帧的起点和最后一帧的完全消散都要检查。
5. **比例**：不拉伸单轴；与村民同屏对照：树高于人、门洞容得下人、资源点宽约 2.2 个村民、废墟不高于 0.6 个村民；地表贴花一格约 4 个村民宽。
6. **建筑**：不得出现漂浮的矩形队伍色块（`check-building-integrity.cjs`）；旗帜是建筑的一部分；施工、受损、残骸与建筑占地匹配。
7. **一致性抽查**：每批随机抽 3 格，与 `architecture-v2.png` / `directions-*-v33.png` 并排看光向（左上）、饱和度、颗粒度；有一项明显不同就整张重出，不在代码里调色补救。

### 4.2 接入方式（每类）

| 类别 | 文件命名 | 接入点（工程） | 检查 |
|---|---|---|---|
| 地表贴花 K、材质 L | `terrain-decals-v41.png`、`terrain-extra-v41.png` | 地形绘制层：材质按地块混合，过渡用程序噪声遮罩；贴花按地图种子散布、建筑脚下自动加泥地；贴花缓存进地形底图，不增加每帧绘制次数 | `check-terrain.cjs`；release-check 渲染项（drawImage 增幅 ≤ 35%） |
| 浪花 M1、水 M2 | `shore-foam-v41.png`、`water-layers-v41.png` | 岸线按直 / 外角 / 内角选格，8 帧全局同步播放；焦散层在深水上慢速滚动 | `check-maritime.cjs`；港口与舰船截图 |
| 资源点 N | `resource-nodes-v41.png` | 按剩余量选档（>66% / >33% / >0 / 0）；鱼群循环 | `check-resource-layout.cjs`、`check-economy.cjs` |
| 残骸 O、施工 G | `ruins-v41.png`、`construction-v41.png` | 摧毁后按占地放残骸，冒烟版 20 秒后换冷却版，60 秒后淡出（不占碰撞）；施工按进度 0–40% 地基、40–90% 脚手架 | `check-building-integrity.cjs`、`damage-preview.html` |
| 特效 P | `fx-*-v41.png` | 接进 `combat-fx-v37.js` 的粒子池，按画质档（low / mid / high）限量；P7 血雾默认关，设置里开 | `check-feedback.cjs`；release-check 渲染项 |
| UI Q | `ui-kit-v41.png`、`icons-*-v41.png` | CSS `border-image` 九宫格、图标雪碧图；中英文两种语言都要截图 | Frontier UI audit（手机竖 / 横、iPad 横、桌面；HUD 展开 / 折叠） |
| 头像 R | `portraits-*-v41.png` | 底栏头像、ⓘ 弹窗、多选列表 | Frontier UI audit |
| 飞行 S | `flight-balloon-v41.png`、`flight-bomber-v41.png` | 替换站姿的空中绘制，地面投影按高度偏移 | `check-directions.cjs` |
| 行走 A–C | `walk-<unit>-v41.png` | 同 v1：按步幅设播放速率 | `check-motion.cjs`、`check-gait-render-cache.cjs` |

每批接入后：`node check-all.cjs` → `npm run build` → `node check-artifact.cjs` → `npm run release-check`（发布前必须完整跑），并按 AGENTS.md 写对比报告。

### 4.3 推荐单格尺寸

| 类别 | 单格 | 理由 |
|---|---|---|
| 步兵行走 | 160×208 | 游戏里约 85–95 px 高，2× 已足够 3x 屏；比 v1 的 192×256 省 32% |
| 骑兵 / 野兽 | 224×224 | 同上 |
| 资源点、残骸、施工 | 512×512 生成，**入库前缩到 256×256** | 游戏里 150–250 px 宽 |
| 特效 | 见 §3.7 表格，入库前缩到 50% | 特效快速播放，细节不需要 |
| 地表贴花 | 512 生成 → 256 入库 | 烘焙进地形底图 |
| 无缝材质 | 1024 生成 → 512 入库 | 平铺 |
| 图标 | 256 生成 → 128 入库 | 屏幕上 48–64 px |
| 头像 | 512 生成 → 192 入库 | 头像框 64–96 px |

### 4.4 体积与内存预算

- 现状：`public/assets` 共 244 MB，其中 V34 攻击 124 MB、V33 四向 31 MB。旧图集和 `carrier-v34.png`、`carrier-v45.png` 移出发布包后，可先腾出约 20–30 MB（需要工程确认不再显示）。
- **本轮新增预算：磁盘 ≤ 25 MB**（地形 + 水岸 + 资源 + 残骸 + 特效 + UI + 头像 + 飞行，约 24 张，入库前缩放并用 `scripts/optimize-png-assets.cjs` 量化）；解码后常驻 ≤ 60 MiB。
- **v1 P0 行走预算：磁盘 ≤ 55 MB**（39 张，160×208 单格，量化）；按需解码，遵守动作缓存 80 MiB 上限。
- 每批登记“新增 PNG 字节数 / 解码后 MiB”，并在 iPhone / iPad 真机上测内存；超过预算先降单格，不删动作帧。

---

## 5. 授权登记

`docs/app-store-readiness.md` 的素材登记表（“Asset inventory and redistribution rights”）在 main 上仍为 **Not audited**。每张生成图交付时登记一行：

| 字段 | 说明 |
|---|---|
| 文件路径 | `public/assets/…`，以及入库前的原始生成文件存档位置（仓库内或项目共享盘，不要写个人电脑本地路径） |
| 用途 / 模板编号 | 例如“K 地表贴花”“P3 炮弹爆炸” |
| 生成工具与服务商 | 产品名、模型或版本 |
| 账户与日期 | 用哪个账户生成、生成日期 |
| 提示词 | 存为 `docs/art/prompts/<文件名>.txt`，**原文照存**，包括负面要求 |
| 参考图 | 列出附带的参考图文件名；声明“只使用本项目自有素材作参考，没有使用任何第三方游戏、电影或网络图片” |
| 后期处理 | 抠图、缩放、量化、手工修图（谁做的、用什么工具） |
| 服务商输出条款 | 条款名称、版本或日期、链接；是否允许在免费 / 付费 App 中商业再分发；是否需要署名 |
| 风险标记 | 徽记、旗帜、红十字、真实人物肖像、品牌相似；没有就写“无” |
| 审查人 | 写明是谁按生产脚本顺序看过（AGENTS.md alpha gate 要求） |

另外：`carrier-v45.png` 是 v1 之后新增的文件，也要补登记，或者随航母退役一起移出发布包。

---

## 附：本轮复查范围与限制

- **看过的**：上表 13 张游戏截图 + 1 张手机拼图 + 1 张环境 / 特效素材缩略拼图；对照了 v1 与城墙审查的全部结论；代码只读了与渲染来源有关的片段（地标、资源点、特效、城墙）。
- **没有重新看的**：v1 已逐张审过、且之后没有变化的兵种和建筑图集（`git diff 79365c8..deb60cf -- public/assets` 只新增了 `carrier-v45.png`）。
- **没有验证的**：iPhone / iPad 真机观感与内存；Safari / WebKit 渲染；英文界面截图；HUD 折叠状态；城墙在 main 上的观感（分支尚未合并，城墙结论引用 `docs/art-review-walls.md`）。
