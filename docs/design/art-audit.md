# 边境王国 · 精简方案美术审查（ART_AUDIT）

审查人：Claude（艺术总监角色，本次一次性审查，非常驻评审）· 日期 2026-11-10 · 仓库快照 `main` @ 79365c8（只读，未修改）
方法：PIL 缩略图（绿色地面底，暴露透明问题）+ 用 headless Chrome 按**生产脚本顺序**（同 art-preview.html）实绘建筑与单位，村民与建筑同一世界比例并排。未做真机测试。

证据目录（以下用简称引用）：
- `T/` = `/tmp/claude-0/-home-claude/3e12cd73-d261-5d16-9dcc-2ff9074b6ac9/scratchpad/art_audit/thumbs/`（每张图集的缩略图）
- `S/` = `/tmp/claude-0/-home-claude/3e12cd73-d261-5d16-9dcc-2ff9074b6ac9/scratchpad/art_audit/sheets/`（兵种分组拼图 A–M）
- `R/` = `/tmp/claude-0/-home-claude/3e12cd73-d261-5d16-9dcc-2ff9074b6ac9/scratchpad/art_audit/renders/`（生产渲染：建筑×时代×村民比例、受损/建造、行走）

---

## 0. 结论（先读这里）

1. **兵种素材基本够用，缺的是“走路”。** 保留的约 40 个移动单位全部有四方向站姿（V33）和四方向 × 4 帧攻击/工作（V34），质量整体达标、风格统一。但四个方向的行走都只有一张静态站姿（`R/walk_units.png` 中 4 个时间采样完全相同），与另一分支“静态图 + 错切 + 上下摆动、滑步约 20%”的诊断一致。**行走帧是第一优先级的新素材**，约 39 张图集、约 1,100 帧。
2. **三阶升级线不需要新画三套。** 长枪步兵 → 戟兵 → 近卫戟兵、弓箭手 → 火枪兵 → 连发步枪卫队，现有六套素材已经是逐阶升级的外观，可以直接当一、二、三阶用。**唯一例外：近卫戟兵（eliteguard）现有素材拿的是剑和鸢盾，不是戟**，需要以戟兵为底稿重画（四向 + 攻击）。
3. **建筑有 5 个硬伤，必须修：**
   - 粮食磨坊、矿物收集场的图集是 **JPEG 无透明通道**，运行时去底失败，实绘有黄/粉/灰杂边和散点（`R/bld_core_britain.png`、`R/functional_edge_zoom.png`）→ 重新出 PNG。
   - 飞艇工场（aviation-v2.png）四周有白色光晕（96.5% 像素 alpha > 0）→ 重新抠图。
   - **国家特色建筑现在是程序画的方盒子**（皇家军械所、连弩工坊、武家道场、沙皇军械库等，`R/nat_all.png` 第一列），与厚涂风严重不符 → 国家地标改用 `ten-capitals.png`（十国十座首都建筑，质量很高，目前只当图标用）。
   - **painted-architecture.js 的 `ornament()` 在画好的建筑上叠矢量装饰**：中国是浮在屋顶上的绿色“人”字折线，奥斯曼/俄国是平涂洋葱顶，美国是白色线框柱廊，IV 时代起每栋建筑再加一面 13×8 的矩形小旗（`R/nat_all.png`、`R/bld_civic_china.png`、`R/bld_def_ottoman.png`）。这违反 AGENTS.md“建筑不得出现漂浮色块”的规则，属代码问题，删掉即可，不需要新素材。
   - 城墙/城门是平涂矢量块（`R/bld_def_ottoman.png`），与周边建筑落差最大 → 新画模块化城墙。
4. **两张攻击图集的背景没抠干净：** `attack-prussianguard-v34.png`（绿色云雾底，alpha 最小 3，零透明像素）、`attack-villager-food-v34.png`（alpha 最小 20）→ 重抠或重画。
5. **阵营识别：** 建筑旗帜、骑兵/近卫马衣上统一印着**法国鸢尾花**，十国共用；所有国家的城镇中心、教堂都是同一座欧式建筑（只换屋顶色）。东方三国（中、日、奥斯曼）的识别度最弱。
6. **授权：** 视觉素材几乎都记录为内置 ImageGen 生成，有提示词存档，但缺少逐文件登记表；`functional-buildings-v1.jpg` 没有提示词；医护单位的**红十字（白底红十字是日内瓦公约保护标志）**上架前必须换掉；App 图标带半透明（alpha 最小 64），App Store 1024 图标要求不透明。

**新素材总量估算：** P0–P2（上线必需）约 **50 次生成 + 8 次编辑，约 1,200 帧**；全部做完（含 P3–P4）约 **75 次生成，约 1,500 帧**。明细见 §4.4。

---

## 1. 保留兵种逐一审查

图例：四向 = V33 四方向站姿是否齐全（`directions-*-v33.png`）；攻击 = V34 四向 × 4 帧（准备/出手/跟随/收招）是否齐全（`attack-*-v34.png`）；行走 = 是否只有单帧；评级：✅ 可直接用 / 🔧 需修补 / ♻️ 需重做。
**所有保留的陆上单位，行走都只有单帧（V33 站姿）**，下表不再逐行重复，统一归入 §4 P0。少数单位有 V29/旧版**仅右向**的多帧走路，已单独标出，风格与身份和 V33 不一致，只能作参考，不能直接用。

### 1.1 经济 / 海军

| 兵种 | 现有素材（四向行 / 攻击） | 四向 | 攻击·工作帧 | 评级与理由 | 看过的图 |
|---|---|---|---|---|---|
| 村民 villager | civilians 第 1 行 / attack-villager；工作 4 套 attack-villager-mine/wood/food/build；背负 directions-cargo（4 种 × 四向） | ✅ | ✅ 攻击 + 4 套工作 | 🔧 站姿与工作帧质量好。**缺四向行走与四向负重行走**（背负只有静态四向）。`attack-villager-food` 背景未抠净，需要重抠。v29 有 8 帧右向走路和背篓走路（棕/蓝马甲，身份略不同），可作动作参考 | `S/B_cav_sup.jpg` `S/I_work.jpg` `S/K_dirs2.jpg` `S/M_legacy.jpg` `R/walk_units.png` |
| 渔船 fishingboat | navalA 第 1 行 / attack-fishingboat（撒网） | ✅ | ✅ | ✅ 撒网动作清楚；航行可由运行时摇摆和尾迹表现 | `S/D_naval.jpg` `S/J_dirs.jpg` |
| 贸易商队 trader | civilians 第 4 行 / attack-trader | ✅ | ✅（职责动作） | 🔧 造型好，背篓与身体连接正确；缺行走 | `S/B_cav_sup.jpg` |
| 运输船 transport | navalAir 第 1 行 / attack-transport（放跳板） | ✅ | ✅ | ✅ | `S/D_naval.jpg` |
| 轻型护航舰 sloop | navalA 第 2 行 / attack-sloop | ✅ | ✅（炮口烟） | ✅ | `S/D_naval.jpg` |
| 重型护卫舰 frigate | navalA 第 3 行 / attack-frigate | ✅ | ✅ | ✅ 舷炮齐射清楚，体量够大 | `S/D_naval.jpg` `R/walk_units.png` |
| 迫击炮舰 bombketch | navalA 第 4 行 / attack-bombketch | ✅ | ✅ | ✅ | `S/D_naval.jpg` |

### 1.2 步兵升级线（同一兵种三阶）

| 阶 | 现有素材 | 四向 | 攻击 | 评级与理由 | 看过的图 |
|---|---|---|---|---|---|
| I 长枪步兵 infantry | core 第 1 行 / attack-infantry | ✅ | ✅ | 🔧 **攻击图集里的长枪被缩成短矛**（约 1.3 倍身高，站姿图中约 1.8 倍），人物也更矮壮，身份有漂移，违反“长兵器完整”的门槛。建议重画攻击图集，枪长与站姿一致 | `T/directions-core-v33.jpg` `T/attack-infantry-v34.jpg` |
| II 戟兵 halberd | line 第 2 行 / attack-halberd | ✅ | ✅ | ✅ 半身板甲、蓝条纹灯笼裤，劈砍四帧清楚 | `S/A_line_inf.jpg` `T/directions-line-v33.jpg` |
| III 近卫戟兵 eliteguard | advanced 第 1 行 / attack-eliteguard | ✅ | ✅ | ♻️ **武器不对**：现图是持剑和鸢尾花鸢盾的金甲骑士，不是戟兵，与“近卫戟兵”的名称和升级线断开。以戟兵为底稿重画：鎏金胸甲、羽饰头盔、更长的戟头加流苏 | `S/A_line_inf.jpg` `T/directions-advanced-v33.jpg` |

**三阶外观建议：** 三阶之间保持脚底锚点、身高和握持手一致，只换头盔、胸甲层级、配色细节和武器头。I→II 现有图已经满足这个要求（同为蓝衣铁盔），III 按上面的方案重画后即可统一。不需要额外的“同一底稿换色”版本。

### 1.3 远程线 + 散兵 + 掷弹兵

| 兵种 | 现有素材 | 四向 | 攻击 | 评级与理由 | 看过的图 |
|---|---|---|---|---|---|
| I 弓箭手 archer | core 第 2 行 / attack-archer | ✅ | ✅ 拉弓四帧 | ✅ | `S/A_line_inf.jpg` |
| II 火枪兵 musketeer | core 第 4 行 / attack-musketeer | ✅ | ✅ | ✅ 小瑕疵：正面和背面的开火帧枪口朝画面右侧，没有朝镜头或纵深方向；图里画了枪口火焰，运行时如果再叠一次特效会重复 | `T/attack-musketeer-v34.jpg` |
| III 连发步枪卫队 rifleguard | advanced 第 3 行 / attack-rifleguard | ✅ | ✅ | ✅ 高筒军帽、背包，和火枪兵一眼能分开 | `S/A_line_inf.jpg` |
| 散兵 skirmisher | line 第 3 行 / attack-skirmisher | ✅ | ✅ | ✅ 绿色流苏猎装、羽毛宽檐帽，轮廓独特 | `S/A_line_inf.jpg` |
| 掷弹兵 grenadier | line 第 1 行 / attack-grenadier | ✅ | ✅ 投掷 | ✅ | `S/A_line_inf.jpg` |

三阶外观：弓 → 前装滑膛枪 → 后装步枪，帽子分别是兜帽 → 三角帽 → 高筒帽，**现有三套可以直接当一、二、三阶**。

### 1.4 骑兵

| 兵种 | 现有素材 | 四向 | 攻击 | 评级与理由 | 看过的图 |
|---|---|---|---|---|---|
| 轻骑斥候 hussar | line 第 4 行 / attack-hussar | ✅ | ✅ 马刀 | 🔧 造型好；鞍布上有鸢尾花，需要换成中性纹样 | `S/B_cav_sup.jpg` |
| 骑兵 cavalry（重骑） | core 第 3 行 / attack-cavalry | ✅ | ✅ | 🔧 全身板甲、蓝色马衣，作重骑很合适；马衣满印鸢尾花，十国共用 → 去徽记 | `T/attack-cavalry-v34.jpg` |
| 龙骑兵 dragoon | advanced 第 2 行 / attack-dragoon | ✅ | ✅ 马上射击 | ✅ 白马、三角帽，和其他两种骑兵区分清楚 | `S/B_cav_sup.jpg` |
| 旧版右向走路 | units-atlas 第 4 行（4 帧骑兵小跑） | — | — | 只能作步态参考，人物身份不同 | `S/M_legacy.jpg` |

### 1.5 攻城

| 兵种 | 现有素材 | 四向 | 攻击 | 评级 | 看过的图 |
|---|---|---|---|---|---|
| 攻城火炮 cannon | artillery 第 1 行 / attack-cannon | ✅ | ✅ 后坐 + 烟 | ✅ 缺推行时的轮子滚动（P1，可与行走同批） | `S/C_siege_air.jpg` |
| 攻城臼炮 mortar | artillery 第 2 行 / attack-mortar | ✅ | ✅ | ✅ 同上 | `S/C_siege_air.jpg` |
| 升级外观：重型榴弹炮 howitzer | artillery 第 3 行 / attack-howitzer | ✅ | ✅ | ✅ **直接作火炮 III 阶外观**（狮首炮口、带旗） | `S/C_siege_air.jpg` |
| 升级外观：长管迫击炮 fieldmortar | artillery 第 4 行 / attack-fieldmortar | ✅ | ✅ | ✅ **直接作臼炮 III 阶外观** | `S/C_siege_air.jpg` |

### 1.6 支援 / 空军 / 英雄

| 兵种 | 现有素材 | 四向 | 攻击·职责帧 | 评级与理由 | 看过的图 |
|---|---|---|---|---|---|
| 战地军医（合并） | 主图用 advanced 第 4 行 combatmedic + attack-combatmedic（围裙、药箱、包扎）；healer（修女风、发光手）作备选 | ✅ | ✅ | 🔧 **药箱和臂章上是白底红十字**，有授权风险（见 §5），需要换成中性徽记。healer 的手部发光偏魔法，与写实风格不搭，建议合并后不用它 | `S/B_cav_sup.jpg` `T/directions-civilians-v33.jpg` |
| 侦察热气球 scoutballoon | navalAir 第 3 行 / attack-scoutballoon；aviation-v2 第 1 格 | ✅ | ✅（望远镜） | ✅ 缺悬停时的轻微摆动，可由运行时实现 | `S/C_siege_air.jpg` |
| 双翼轰炸机 bomber | special 第 1 行 / attack-bomber | ✅ | ✅ 投弹 | ✅ 年代感偏晚，但属设计取舍；螺旋桨转动可由运行时实现 | `S/C_siege_air.jpg` `S/K_dirs2.jpg` |
| 英雄 ×10 | heroesA/B/C + attack-hero_* | ✅ | ✅ | 🔧 **与本国特色兵几乎一模一样**（英国英雄 ≈ 长弓手加斗篷，中国英雄 ≈ 连弩兵，奥斯曼英雄 ≈ 禁卫火枪兵，俄 ≈ 射击军，普 ≈ 普鲁士卫队，西 ≈ 大方阵，荷 ≈ 拿骚），远看分不出哪个是英雄。美国英雄（将官服）和法国英雄（白马金甲）区分尚可。P3 建议加统一的“统帅标记”：披风、金色肩带、持旗或指挥刀，再放大 10%。素材修好之前可以先用运行时光环过渡 | `S/G_heroA.jpg` `S/H_heroB.jpg` `S/K_dirs2.jpg` |

### 1.7 国家特色兵（各替换一个通用兵）

| 兵种 | 素材行 | 四向 | 攻击 | 评级 | 备注 |
|---|---|---|---|---|---|
| 长弓卫士 longbow（英） | nationalA r1 | ✅ | ✅ | ✅ | 白底红色圣乔治十字纹章，属历史纹章，可保留 |
| 皇家胸甲骑兵 cuirassier（法） | nationalA r2 | ✅ | ✅ | ✅ | 鸢尾花放在法国身上是正确的 |
| 诸葛连弩兵 repeater（中） | nationalA r3 | ✅ | ✅ | ✅ | |
| 武士 samurai（日） | nationalA r4 | ✅ | ✅ | ✅ | |
| 禁卫火枪兵 janissary（奥） | nationalB r1 | ✅ | ✅ | ✅ | |
| 射击军 streltsy（俄） | nationalB r2 | ✅ | ✅ | ✅ | |
| 普鲁士掷弹卫队 prussianguard | nationalB r3 / attack-prussianguard | ✅ | ⚠️ | ♻️（仅攻击图集） | **攻击图集带绿色云雾背景，没有一个全透明像素**，重抠；若重抠不干净则按原提示词重画 |
| 大方阵枪兵 tercio（西） | nationalB r4 | ✅ | ✅ | ✅ | |
| 拿骚神射手 nassau（荷） | nationalC r1 | ✅ | ✅ | ✅ | |
| 大陆军步枪兵 continental（美） | nationalC r2 | ✅ | ✅ | ✅ | |

看过的图：`S/E_natA.jpg` `S/F_natB.jpg` `S/J_dirs.jpg`

### 1.8 中立 / 野兽 / 彩蛋

| 单位 | 四向 | 攻击 | 额外 | 评级 |
|---|---|---|---|---|
| KC 符文卫士 runesentinel | ✅ | ✅ | — | ✅ |
| KC 余烬投射车 emberthrower | ✅ | ✅ | — | ✅ |
| KC 熔岩龙 kcdragon | ✅ | ✅ + 喷火 | v29 有 6 帧右向走路 | ✅（仍缺四向行走，P0 低档） |
| KC 深渊守卫 kcdemon | ✅ | ✅ + 施法 | v29 有 6 帧右向走路 | ✅（同上） |
| 高地棕熊 bear、矿区豺狼 jackal | ✅ | ✅ | wildlife-v8 | ✅ 缺四向行走 |
| 糖豆 tangdou、团团 tuantuan | ✅ | ✅ | — | ✅ 风格刻意卡通，属彩蛋；需确认是原创形象（§5） |

看过的图：`S/L_misc.jpg` `S/H_heroB.jpg` `S/M_legacy.jpg`

---

## 2. 保留建筑逐一审查

**生产渲染方式：** 建筑由 `painted-architecture.js` 从三张图集切图：`architecture-v2.png`（4×4：town, house, barracks, range, farm, stable, tower, blacksmith, market, church, workshop, fort, dock, shipyard, bath, quarry）、`industry-v2.png`（4×4：lumbercamp, coastbattery, university, arsenal, foundry, palace, steelworks, signalbureau, cannonturret, siegeyard, wall, gate, palisade, palisadegate, kcreclaimed, greenhouse）、`functional-buildings-v1.jpg`（3×2：mill/miningcamp/ridingacademy 的基础版与精修版）。国家建筑不在这几张图集里，由 `architecture-art.js` 用程序矢量绘制。城墙和城门由 `wall-art.js` 程序绘制。

**时代差异（共性问题）：** 除磨坊、矿场、马术学院有基础版/精修版两张图外，其余建筑**没有任何时代外观差异**。I 时代屋顶去饱和成棕色，II 时代起换成国家屋顶色，IV 时代起加矢量小旗（`R/bld_core_britain.png`、`R/bld_mil_britain.png` 中 e1/e3/e5 三行几乎相同）。合并建筑正好可以把被并入的那张图当作“后期时代外观”，这是成本最低的时代差异方案（见表中“时代外观建议”一列）。

**受损状态：** `building-damage-v32.png` 的火焰/破洞贴花按建筑轮廓遮罩，全部建筑通用，效果好（`R/bld_states.png` 上排）。✅
**建造状态：** 只是整体半透明，加几条矢量脚手架线（`R/bld_states.png` 下排），太弱 → P1 新画通用的施工阶段素材（地基、脚手架）。
**尺度：** 村民在世界比例下约 95px 高。房屋约 1.9 倍村民高度，城镇中心、要塞有足够体量；**农田只比村民略大**，箭塔约 1.7 倍村民高。门洞普遍偏小，约为村民的 0.5–0.6 倍。V34 文档记录的比例场测试是通过的，但从艺术角度看人物偏大。建议用真机截图复核后再决定改素材还是改单位缩放，**不要拉伸单轴**。

| 保留建筑 | 合并来源 | 主图（建议） | 时代外观建议 | 检查结论 | 评级 | 证据 |
|---|---|---|---|---|---|---|
| 城镇中心 | — | architecture-v2 #0 | I–II 原图；III+ 可在 P3 出东方变体 | 欧式市政厅，十国共用；IV+ 钟楼上的蓝色小旗是矩形色块 | 🔧（去掉 ornament；P3 出东方三国变体） | `R/bld_core_britain.png` `R/nat_all.png` |
| 房屋 | — | architecture-v2 #1 | — | 茅草半木屋，好；IV+ 旁边有漂浮小旗 | 🔧（仅代码） | 同上 |
| 农田 | — | **新画** | 生长 3 态 | 现图是“小谷仓 + 风车 + 4 垄麦田”，和磨坊重复，且尺寸偏小 | ♻️ | `R/bld_core_britain.png` |
| 粮食磨坊 | — | functional #0 / #3（基础/精修） | 已有两态 | **JPEG 去底失败，杂边严重** | ♻️（重出 PNG，设计不变） | `R/functional_edge_zoom.png` |
| 伐木营地 | — | industry-v2 #0 | — | 好 | ✅ | `R/bld_core_britain.png` |
| 采石场（并入矿物收集场） | miningcamp | I–II：architecture-v2 #15 quarry（透明干净）；III+：miningcamp 精修版（需重出 PNG） | quarry → 矿井 | quarry 可直接用；miningcamp 设计更好，但 JPEG 杂边严重 | 🔧 | `R/bld_core_britain.png` |
| 步兵营 | — | architecture-v2 #2 | IV+：industry #3 arsenal（近卫兵工厂，已删除，外观可回收） | 好 | ✅ | `R/bld_mil_britain.png` |
| 射击场 | — | architecture-v2 #3 | — | 好 | ✅ | 同上 |
| 马厩 | — | architecture-v2 #5 | — | 好 | ✅ | 同上 |
| 炮兵工坊（并入攻城器械营/铸炮厂/精密机械工坊） | siegeyard, foundry, steelworks | III：architecture-v2 #10 workshop | IV：industry #4 foundry；V：industry #6 steelworks | 四张图都干净，正好组成时代递进 | ✅ | `R/bld_mil_britain.png` |
| 港口（并入造船厂外观） | — | architecture-v2 #12 dock | III+：architecture-v2 #13 shipyard | 好 | ✅ | `R/bld_civic_china.png` |
| 市场 | — | architecture-v2 #8 | — | 好；中国版有漂浮折线 | 🔧（仅代码） | 同上 |
| 铁匠铺（并入皇家大学） | university | II–III：architecture-v2 #7 | IV+：industry #2 university | 好 | ✅ | 同上 |
| 教堂（并入海滨浴场） | bath | architecture-v2 #9 | — | 哥特式教堂，十国共用；东方三国识别度差。浴场图不建议当教堂的时代外观（功能语义不同） | 🔧（P3 出清真寺、东方寺庙变体） | 同上 |
| 箭塔 | — | architecture-v2 #6 | IV+：industry #8 cannonturret（棱堡炮塔外观） | 塔身偏矮小；奥斯曼版有平涂洋葱顶 | 🔧（仅代码） | `R/bld_def_ottoman.png` |
| 要塞（并入棱堡炮塔、岸防炮台职能） | cannonturret, coastbattery | architecture-v2 #11 fort | 临海放置时可换用 industry #1 coastbattery | 体量好；奥斯曼版顶上叠了矢量洋葱顶 | 🔧（仅代码） | 同上 |
| 城墙 | — | **新画模块** | I–II 用 industry #12 palisade（木栅，现未使用） | 现为平涂矢量块，质量最差 | ♻️ | 同上 |
| 城门（横纵合一） | gatevertical | **新画模块** | I–II 用 industry #13 palisadegate | 同上；industry #11 的石城门不能拼接 | ♻️ | 同上 |
| 国家统帅府 | — | industry-v2 #5 palace | — | 好，体量和气势都够 | ✅ | `R/bld_civic_china.png` |
| 飞艇工场 | — | aviation-v2 #4 | — | 设计好，但四周有白色光晕 | 🔧（重新抠图） | `R/bld_def_ottoman.png` `T/aviation-v2.jpg` |
| **国家地标 ×10** | 原各国特色建筑 | **ten-capitals.png**，按 K.nations 顺序 5×2：英、法、中、日、奥、俄、普、西、荷、美 | — | 十座都有鲜明的国家建筑语言（中式殿宇、日式城郭、奥斯曼圆顶、俄式洋葱顶、荷兰阶梯山墙、美式红砖钟楼），透明干净。目前只用来生成图标，现在的程序方盒子必须替换 | ✅ 直接用 | `T/ten-capitals.jpg` `R/nat_all.png` |

法国地标可以用 ten-capitals 第 2 格，也可以沿用 functional 的马术学院（需重出 PNG）。建议统一用 ten-capitals，十国风格一致。

**漂浮色块与矢量叠加（代码问题，不需要出图）：**
- `painted-architecture.js` 中的 `ornament()`：II 时代起按国家风格叠加矢量屋顶（pagoda/hipped 折线、dome/onion 洋葱顶、stepped 阶梯块、portico 白线柱），IV 时代起叠加旗杆和 13×8 矩形旗。建议整个删除，国家感改由地标和 P3 的东方变体素材承担。
- 建筑上自带的旗帜和挂毯被运行时染成队伍色，这是融合在建筑里的，符合规则。但上面的**鸢尾花图案十国通用**，P2 统一换成纯色旗或无图案挂毯（编辑原图集）。

---

## 3. 被删除单位/建筑的素材再利用

| 被删素材 | 质量 | 再利用建议 |
|---|---|---|
| 重型榴弹炮 howitzer、长管迫击炮 fieldmortar | ✅ | 分别作攻城火炮、攻城臼炮的 III 阶外观（§1.5） |
| 近卫兵工厂 arsenal | ✅ | 步兵营 IV+ 外观 |
| 攻城器械营 siegeyard、铸炮厂 foundry、精密机械工坊 steelworks | ✅ | 炮兵工坊的 III / IV / V 阶外观 |
| 造船厂 shipyard | ✅ | 港口 III+ 外观 |
| 皇家大学 university | ✅ | 铁匠铺 IV+ 外观 |
| 棱堡炮塔 cannonturret | ✅ | 箭塔 IV+ 外观 |
| 岸防炮台 coastbattery | ✅ | 要塞临海变体，或地图上的中立岸防遗迹 |
| 木栅 palisade、木栅门 palisadegate（industry #12/#13，目前未用） | ✅ | I–II 时代城墙和城门 |
| 运输飞艇 airtransport（aviation #2 及四向/攻击图） | ✅ | 飞艇工场的装饰性停泊艇；或作某国地标战略能力“空投补给”的演出单位（不可选中）；或战役过场 |
| 武装运输飞艇 gunship | ✅ | KC 中立要塞的空中守卫，或 V 时代地标能力“空中轰炸”的演出 |
| 配重投石机 trebuchet、重型工程车 siegewagon | ✅ | 地图装饰与中立遗迹；工程车可摆在城镇中心或炮兵工坊旁当施工道具；投石机也可作 KC 奖励兵候选 |
| 蒸汽装甲车 steamcrawler | ✅ | 彩蛋或 KC 奖励（工业奇观感强），不建议进常规兵种 |
| 军械工程师 engineer | ✅ | 村民 IV–V 时代“工匠”换装（皮围裙、护目镜、锤），或建造/修理状态的专用外观 |
| 战地医师 healer（女性） | 🔧 | 战役 NPC；合并后的军医不用它（手部发光偏魔法） |
| 舰载双翼机 airwing | ✅ | 双翼轰炸机的升级外观（带浮筒，可作海上变体） |
| 航空母舰 carrier | ⚠️ | **不建议再利用**。二战式钢铁航母与 18 世纪风格冲突明显（`S/J_dirs.jpg` navalAir 第 2 行）。建议移出发布包，可省约 3MB |
| 电报与军械局 signalbureau | ✅ | 中立“情报站”地标，或荷兰/英国地标的副建筑 |
| 大陆议事厅 congress（程序绘制） | ❌ | 丢弃，美国地标用 ten-capitals |
| nation-buildings.png 中的 stone、ruins | ✅ | 地图装饰 |
| 旧图集 world-atlas、units-atlas、troops-v2、troops-*-v3、nation-buildings、expansion-*、naval-atlas、reinforcements、nation-units、nations-east/west、imperial-units | — | 渲染时大多被后加载的层覆盖（visuals.js、dynasty-art.js 中的基础层）。请工程确认不再显示后移出发布包，可降低内存和包体。其中 villager-actions-v29、units-atlas 和 villager-carry-v9 的右向多帧走路，可作为 P0 行走生成的**动作参考图** |

---

## 4. 新素材需求清单

### 4.1 通用规格（所有单位图集都适用）

- **格式：** PNG RGBA，**真实透明**（背景 alpha=0，不得出现棋盘格、白底、渐变或云雾底）；边缘不得有黑白描边光晕。交付前用 `python3 -c "from PIL import Image;print(Image.open(f).getchannel('A').getextrema())"` 检查，最小值必须是 0。
- **布局：** 行 = 方向，固定为 **正面（朝镜头/南）、背面（北）、右（东）、左（西）**，和 V33/V34 一致；列 = 连续帧。
- **人物/步兵图集：** 画布 1536×1024，8 列 × 4 行，单格 192×256。人物身高约占格高 72%，**脚底基线在格高 88% 处（y≈225），水平居中（x=96）**，每帧固定。
- **骑兵/野兽图集：** 画布 1536×1024，6 列 × 4 行，单格 256×256。蹄/爪着地基线 y≈228，马身中心 x=128。
- **攻城车辆：** 画布 1024×1024，4 列 × 4 行，单格 256×256，轮底基线 y≈228。
- **原地行走（treadmill）：** 不带根位移。左右方向的着地脚在帧间应基本固定，只换脚，不能整体平移。正反方向的身体在格内居中。
- **镜头与光照：** 与 V33/V34 相同，约 25° 俯视的 RTS 镜头，左上暖光，厚涂写实预渲染风格；**左右两向必须分别画**（盾、武器在哪只手不能靠镜像翻转）。
- **步幅登记：** 每套行走图集交付时附一行数据：“一个完整循环向前移动的像素数（按单格尺度）”，供运行时计算播放速率，消除滑步。
- **参考图：** 每次生成都附上对应的 `directions-*-v33.png`（指明第几行），以及该单位的 `attack-*-v34.png` 作身份参考；提示词里写明“只使用参考图第 N 行的角色”。
- **队伍色：** 主服装保留可染色的蓝色区块（运行时会把蓝色换成队伍色），不要加国旗、鸢尾花或红十字。

### 4.2 优先级与清单

#### P0 · 四方向行走（最优先）

| # | 用途 | 数量（图集） | 方向 × 帧 | 合计帧 |
|---|---|---|---|---|
| P0-1 | 村民空手行走 | 1 | 4 × 8 | 32 |
| P0-2 | 村民负重行走：肩扛原木 / 背篓装石 / 背篓装金 / 背篓装粮 | 4 | 4 × 8 | 128 |
| P0-3 | 通用步兵：长枪、戟、近卫戟（在 P2 重画之后再生成）、弓箭、火枪、步枪卫队、散兵、掷弹兵 | 8 | 4 × 8 | 256 |
| P0-4 | 军医、贸易商队 | 2 | 4 × 8 | 64 |
| P0-5 | 国家步兵 ×9（长弓、连弩、武士、禁卫、射击军、普鲁士、方阵、拿骚、大陆军） | 9 | 4 × 8 | 288 |
| P0-6 | KC 符文卫士 | 1 | 4 × 8 | 32 |
| P0-7 | 骑乘：轻骑、重骑、龙骑、胸甲骑兵、法国英雄 | 5 | 4 × 6 | 120 |
| P0-8 | 生物：熊、豺狼、熔岩龙、深渊守卫、糖豆、团团 | 6 | 4 × 6 | 144 |
| P0-9 | 攻城推行（轮子滚动 + 炮身轻晃）：火炮、臼炮、余烬投射车 | 3 | 4 × 4 | 48 |
| **小计** | | **39** | | **≈1,112** |

英雄的行走在 P3 新外观完成前，先复用本国特色兵的行走图，加运行时光环区分，不单独出图。

#### P1 · 硬伤修复

| # | 用途 | 规格 | 帧 |
|---|---|---|---|
| P1-1 | 粮食磨坊 基础/精修，PNG 重出（设计不变） | 1536×768，2 列 × 1 行，单格 768×768，**真实透明**，建筑底边中心为锚点（格内 y≈92%） | 2 |
| P1-2 | 采石场/矿场 基础/精修，PNG 重出（以 miningcamp 设计为准，加露天采石堆） | 同上 | 2 |
| P1-3 | 飞艇工场 重新抠图 | 单图 1024×1024，去掉白色光晕 | 1 |
| P1-4 | 农田（新）：刚播种 / 生长中 / 成熟金黄 / 收割后残茬 | 1024×1024，2×2，单格 512×512；**纯田地，不带风车和谷仓**；占地约为房屋的 1.3 倍、村民身高的 2.5 倍宽；地块四边有矮篱笆 | 4 |
| P1-5 | 石城墙模块：横段、纵段、转角、T 形接头、横门（关/开）、纵门（关/开） | 2048×1024，4×2，单格 512×512；**墙体必须能无缝拼接**，横段左右端截面一致、纵段上下端截面一致；墙高约 1.3 倍村民 | 8 |
| P1-6 | 通用施工阶段：小/中/大占地 × （打地基、搭脚手架） | 1536×1024，3×2，单格 512×512；只有地基、木架、绳索和堆料，**不画具体建筑** | 6 |
| P1-7 | 普鲁士掷弹卫队 攻击图集 重抠或重画 | 沿用 V34 规格 4×4（准备/出手/跟随/收招） | 16 |
| P1-8 | 村民采食 工作图集 重抠 | 同上 | 16 |
| **小计** | | **8 次生成/编辑** | **55** |

#### P2 · 升级线与阵营

| # | 用途 | 规格 | 帧 |
|---|---|---|---|
| P2-1 | 近卫戟兵 重画四向（以戟兵为底稿：鎏金胸甲、蓝羽头盔、长戟加流苏） | V33 规格 4 列（方向） × 1 行，可与 P2-2 合成一张 4×5 图集 | 4 |
| P2-2 | 近卫戟兵 攻击：戟劈砍四帧 | V34 规格 4×4 | 16 |
| P2-3 | 长枪步兵 攻击重画（长枪完整，长度约 1.8 倍身高） | V34 规格 4×4 | 16 |
| P2-4 | 去徽记编辑：骑兵四向行 + 攻击、轻骑四向行 + 攻击、军医四向行 + 攻击（红十字 → 无图案药箱和白色臂章）、architecture-v2 / industry-v2 旗帜（鸢尾花 → 纯色旗） | 原图编辑，**不改布局、位置和姿态** | 8 次编辑 |
| **小计** | | **3 次生成 + 8 次编辑** | **36** |

#### P3 · 识别度（非阻塞）

| # | 用途 | 帧 |
|---|---|---|
| P3-1 | 英雄 ×10 统帅外观：在本国特色兵基础上加披风、金色肩带、指挥旗或指挥刀，四向 + 攻击 | 10 × 20 = 200（之后再出行走 10 × 32） |
| P3-2 | 东方城镇中心变体：中式、日式、奥斯曼 × 基础/后期 | 6 |
| P3-3 | 宗教建筑变体：清真寺（奥）、东亚寺庙（中/日共用或各一座）、东正教堂（俄，可选） | 3–4 |

#### P4 · 锦上添花

| # | 用途 | 帧 |
|---|---|---|
| P4-1 | 舰船航行循环（帆鼓起、船身起伏）×5，4 方向 × 4 帧 | 80 |
| P4-2 | 热气球、轰炸机悬停/飞行循环 ×2，4 方向 × 4 帧 | 32 |

### 4.3 提示词模板（中英文；写法参照 docs/v29-art-prompts.md 和 docs/v34-prompts/）

> 使用方法：把 `{…}` 换成具体内容。每次生成都附上对应的参考图集，并在提示词里注明参考行号。

#### A. 步兵四方向行走（P0-1、P0-3 到 P0-6）

**EN**
Use case: stylized-concept. Asset type: production historical RTS WALK-CYCLE SPRITE SHEET, TRUE TRANSPARENT RGBA background (alpha 0, no checkerboard, no white, no gradient, no cloud). The reference is an EXISTING FOUR-DIRECTION ATLAS; use ONLY the subject in reference row {N} (count from top) and preserve that exact identity, face, clothes, equipment, colors, materials, body proportions and painterly pre-rendered 3D game quality. Subject: {short description, e.g. "blue-coated musketeer, brown tricorne, cross belts, musket carried at shoulder"}.
Canvas 1536x1024, EXACTLY 8 COLUMNS × 4 ROWS of equal 192x256 cells, 32 full-body sprites of ONLY this subject. Each ROW is one fixed heading, camera elevated about 25 degrees, fixed: row1 FRONT walking toward camera/screen bottom; row2 BACK walking away (show the back, not the face); row3 walking RIGHT (east); row4 walking LEFT (west) — draw LEFT separately, do NOT mirror (shield/weapon stay in the correct hands). Each column is one consecutive frame of a seamless 8-frame NATURAL MARCHING WALK CYCLE: contact – down – passing – up for the right foot, then the same for the left foot. Legs clearly alternate, knees bend, arms or weapon arm counter-swing, the body rises and falls slightly at passing/up frames, coat tails and straps follow. Walk IN PLACE (treadmill): no forward translation; in side rows the planted foot stays at the same x while it is on the ground. SAME body size in every cell, feet baseline at y=225 of each cell, torso centered at x=96, at least 10% transparent padding, weapon fully inside the cell (foreshorten long weapons rather than crop). Weapons carried at march, NOT attacking. Warm upper-left light, no ground, no cast shadow, no text, no labels, no grid lines, no muzzle flash, no particles. Not cartoon, not low-poly, not vector.

**中文**
用途：风格化概念。素材类型：正式的历史题材 RTS **行走循环精灵图集**，真实透明 RGBA 背景（alpha 为 0，不要棋盘格、白底、渐变或云雾）。参考图是现有的四方向图集，**只使用从上数第 {N} 行的角色**，严格保持他的身份、面孔、服装、装备、配色、材质、身材比例和厚涂预渲染 3D 游戏质感。角色：{简述}。
画布 1536×1024，**正好 8 列 × 4 行**，每格 192×256，共 32 个全身像，只画这一个角色。每行一个固定朝向，镜头俯视约 25°、固定不动：第 1 行朝镜头（画面下方）走来；第 2 行背向镜头走（露背不露脸）；第 3 行向右（东）走；第 4 行向左（西）走——**左向单独绘制，不要镜像**，盾和武器保持在正确的手上。每列是 8 帧无缝**自然行军步伐**中的连续一帧：右脚 着地→下沉→交错→抬升，再换左脚重复。双腿明显交替、膝盖弯曲，手臂（或持武器的手臂）反向摆动，交错/抬升帧身体略有起伏，衣摆和背带随动。**原地踏步**：不向前位移，侧视时着地脚在接地期间 x 不变。每格人物大小一致，脚底基线在格内 y=225，躯干中心 x=96，四周至少留 10% 透明边距，武器完整在格内（长兵器用透视缩短，不要裁切）。武器呈行军携带姿态，**不是攻击**。左上暖光，无地面、无投影、无文字、无标签、无网格线、无枪口火焰、无粒子。不要卡通、低多边形或矢量风格。

#### B. 村民负重行走（P0-2）

**EN** — Same as template A with reference `directions-cargo-v33.png` row {1 logs / 2 stone / 3 gold / 4 food}. Add: "The burden is physically attached: {logs: a bundle of 3–4 split logs held on the right shoulder with one hand / basket: a wicker back-basket on two leather shoulder straps, filled with {grey stone blocks | gold ore nuggets | vegetables, grain sack and meat}}. Body leans forward under the weight, shorter stride, straps visibly compress the shoulders, the basket bounces with the body and never floats or separates; contents stay inside the basket rim. Same farmer identity: straw hat, cream rolled-sleeve shirt, blue vest, brown trousers."

**中文** — 同模板 A，参考图用 `directions-cargo-v33.png` 第 {1 原木 / 2 石 / 3 金 / 4 粮} 行。追加：“负重物与身体有物理连接：{原木：3–4 根劈开的原木扛在右肩，一只手扶着 / 背篓：两条皮背带背着的藤编背篓，里面装满 {灰色石块 | 金矿块 | 蔬菜、谷袋和肉}}。身体因负重前倾、步幅变小，背带明显勒住肩膀，背篓随身体起伏，**不能悬浮或脱离身体**，货物在篓沿以内。人物身份不变：草帽、米色卷袖衬衫、蓝色马甲、棕色长裤。”

#### C. 骑乘/野兽行走（P0-7、P0-8）

**EN** — Template A, but: "Canvas 1536x1024, EXACTLY 6 COLUMNS × 4 ROWS of 256x256 cells. 6-frame seamless {horse WALK/TROT cycle with correct diagonal leg pairs | quadruped walk | heavy biped stomp}. All four legs articulate, hooves/paws lift and plant, head nods with the stride, tail and mane follow; the rider sits deep, rises slightly with the trot and keeps the weapon {sheathed / shouldered}. Hooves baseline at y=228, body center x=128. Whole horse, rider, tail and weapon fully inside the cell."

**中文** — 同模板 A，改为：“画布 1536×1024，**正好 6 列 × 4 行**，每格 256×256。6 帧无缝{马匹慢步/快步（对角两腿成对）| 四足行走 | 沉重的双足踏步}。四条腿都有关节动作，蹄/爪抬起和落地清楚，头随步伐点动，尾巴和鬃毛随动；骑手坐稳，快步时略有起伏，武器{入鞘 / 扛在肩上}。蹄底基线 y=228，身体中心 x=128。马、骑手、尾巴和武器全部完整在格内。”

#### D. 攻城推行（P0-9）

**EN** — "Reference `directions-artillery-v33.png` row {N}. Canvas 1024x1024, 4×4 cells of 256x256. Row order FRONT/BACK/RIGHT/LEFT; muzzle points to screen bottom in FRONT and to screen top in BACK. 4-frame ROLLING cycle: spoked wheels rotate 22.5° per frame (spokes visibly advance), carriage trail bobs slightly, barrel steady, banner sways. No crew, no smoke, no ground. Wheel contact baseline y=228."

**中文** — “参考 `directions-artillery-v33.png` 第 {N} 行。画布 1024×1024，4×4，每格 256×256。行顺序：正、背、右、左；正面时炮口朝画面下方，背面时朝上方。4 帧**滚动循环**：辐条车轮每帧转 22.5°（辐条位置明显前移），炮架尾部轻微起伏，炮管稳定，旗帜飘动。不画炮手、烟或地面。轮底基线 y=228。”

#### E. 建筑单体（P1-1、P1-2、P1-4、P3-2、P3-3）

**EN**
Use case: stylized-concept. Asset type: production building sprites for a premium realistic 1700s historical RTS. {layout, e.g. "1536x768 canvas, EXACTLY 2 columns × 1 row, equal 768x768 cells"}. Orthographic three-quarter top-down camera, about 40° elevation, viewed from the south-east, matching the reference atlas `architecture-v2.png` exactly in camera, scale, light and painterly pre-rendered PBR finish: worn stone blocks, individual roof tiles, detailed timber, warm sunlight from the upper left, ambient occlusion. Cell 1 {base-era description}; cell 2 {refined later-era version of the SAME building: same footprint and layout, upgraded materials (dressed stone, slate roof, brass fittings)}. Include a small integrated ground apron (dirt/cobble) that belongs to the building. Cloth banners plain solid BLUE with no emblem (runtime recolors to team color). TRUE TRANSPARENT background outside the building and its apron; NO black/white matte, NO halo, NO stray specks. Building base centered horizontally, its front-most ground contact at 92% of cell height, 8% transparent margin. No people, no text, no UI, no flags with national symbols. Not cartoon, not low-poly.

**中文**
用途：风格化概念。素材类型：高品质写实 18 世纪历史 RTS 的正式建筑精灵。{布局，例如“画布 1536×768，正好 2 列 × 1 行，每格 768×768”}。正交 3/4 俯视镜头，仰角约 40°，从东南方向看，镜头、比例、光照和厚涂预渲染 PBR 质感**与参考图集 `architecture-v2.png` 完全一致**：风化石块、逐片瓦、细致木构、左上暖光、环境光遮蔽。第 1 格 {基础时代描述}；第 2 格 {**同一建筑**的后期精修版：占地和布局不变，材质升级（琢面石、板岩屋顶、黄铜构件）}。带一小块属于建筑本身的地面（泥地或卵石）。布质旗帜一律纯蓝色、无图案（运行时会染成队伍色）。建筑和地面以外**真实透明**，无黑白底、无光晕、无散点。建筑底部水平居中，最前方接地点在格高 92% 处，四周留 8% 透明边距。不画人物、文字、UI，不画带国家标志的旗帜。不要卡通或低多边形风格。

农田（P1-4）在上述模板基础上替换为：“2×2 格，每格是**同一块**有矮木篱围着的方形农田：① 刚翻耕播种的垄沟 ② 绿色幼苗 ③ 成熟的金黄麦穗 ④ 收割后的残茬和两捆麦束。**不要风车、谷仓或房屋**，四块田的占地和篱笆完全一致。”

#### F. 模块化城墙（P1-5）

**EN** — Template E camera/style, plus: "2048x1024, 4×2 cells of 512x512: (1) straight wall segment running exactly along the screen-horizontal axis, (2) straight segment running along the screen-vertical axis, (3) 90° corner tower, (4) T-junction tower, (5) horizontal gatehouse CLOSED, (6) horizontal gatehouse OPEN, (7) vertical gatehouse CLOSED, (8) vertical gatehouse OPEN. Grey limestone ashlar with crenellations and a walkway; wall height about 1.3× a standing villager. Segment ends are clean vertical cut faces with IDENTICAL cross-section so that repeated segments tile seamlessly; the gate and tower pieces accept the same cross-section on their connecting sides. Plain blue banner on gatehouses only."

**中文** — 镜头与风格同模板 E，追加：“画布 2048×1024，4×2，每格 512×512：(1) 严格沿画面水平方向的直墙段 (2) 沿画面竖直方向的直墙段 (3) 90° 转角塔 (4) T 形接头塔 (5) 横向门楼·关 (6) 横向门楼·开 (7) 纵向门楼·关 (8) 纵向门楼·开。灰色石灰岩方石，带垛口和走道，墙高约为站立村民的 1.3 倍。墙段两端是干净的竖直截面，**截面完全相同**，重复摆放可无缝拼接；门楼和塔的连接面与墙段截面一致。只有门楼上挂纯蓝旗帜。”

#### G. 施工阶段（P1-6）

**EN** — Template E style: "1536x1024, 3 columns (SMALL house-size, MEDIUM barracks-size, LARGE town-center-size footprint) × 2 rows (row1: staked-out foundation with stone footing, timber piles, tools; row2: half-height timber scaffolding with ladders, ropes, stacked planks and stone). Generic, no recognizable finished building, transparent background."

**中文** — 同模板 E 风格：“画布 1536×1024，3 列（小 = 房屋占地、中 = 兵营占地、大 = 城镇中心占地）× 2 行（第 1 行：放线定桩的地基、石砌基脚、木桩、工具；第 2 行：半高木脚手架，带梯子、绳索、堆放的木板和石料）。通用施工场景，看不出最终是哪栋建筑，透明背景。”

#### H. 攻击图集重画（P1-7、P2-2、P2-3）

直接复用 `docs/v34-prompts/{id}.txt` 的原文（四行方向 × 四列 准备/出手/跟随/收招）。
- 近卫戟兵：把角色描述换成 “gilded half-plate guard halberdier, blue plumed morion, long halberd with gold tassel; based on reference row 2 of directions-line-v33.png”（以 directions-line-v33.png 第 2 行戟兵为底稿：鎏金半身甲、蓝羽头盔、带金流苏的长戟）。
- 长枪步兵：追加 “the pike is FULL LENGTH, about 1.8× body height, never shortened; foreshorten in FRONT/BACK rows”（长枪全长约为身高 1.8 倍，绝不缩短；正面和背面行用透视缩短表现）。
- 末尾统一追加：“TRUE alpha 0 background, no cloud, no green haze”（真实 alpha 0 背景，不要云雾或绿色雾气）。

#### I. 去徽记编辑（P2-4）

**EN** — "Edit only: preserve the exact grid, positions, poses, scale, lighting and all other pixels. Replace every fleur-de-lis / red-cross emblem on {barding / shields / banners / medical bag / armband} with plain cloth of the same blue (banners, barding) or plain leather (bag) and a plain white armband. Do not add new symbols. Keep true transparency."

**中文** — “只做编辑：完全保持原有网格、位置、姿态、比例、光照和其他像素。把 {马衣 / 盾 / 旗帜 / 药箱 / 臂章} 上的所有鸢尾花和红十字图案，换成同色蓝布（旗帜、马衣）、素色皮革（药箱）和纯白臂章。不要添加任何新符号。保持真实透明。”

#### J. 英雄统帅外观（P3-1）

**EN** — Template A’s reference rules + V33 four-direction layout (4 columns × 1 row) + V34 attack layout: "Same identity as the national unit in reference row {N}, promoted to COMMANDER: long {nation color} cloak, gold epaulettes or sash, ornate helmet/hat with taller plume, {command sword | standard on a short pole slung on the back}, 10% larger build; silhouette must read as a leader at 40 px height."

**中文** — 参考规则同模板 A，四向布局用 V33 规格（4 列 × 1 行），攻击布局用 V34 规格：“与参考图第 {N} 行的本国特色兵为同一身份，**升格为统帅**：{国家色}长披风、金色肩章或绶带、更华丽的头盔/帽子和更高的羽饰、{指挥刀 | 背在身后的短杆军旗}，体型放大 10%；人物缩到 40px 高时仍能一眼看出是统帅。”

### 4.4 验收标准（对照 AGENTS.md 门槛）

1. **透明（Raster alpha gate）：** alpha 最小值为 0，四角为 0，行列之间有透明间隔；把图叠在草地、沙地、雪地三种地形上检查无黑白杂边；在 `direction-preview.html` / `attack-preview.html` 按生产脚本顺序目视确认，并在 docs/ 中**写明是谁看的**。
2. **四方向（Direction gate）：** 正、背、右、左四个方向齐全，左向非镜像，盾和武器持手正确；`check-directions.cjs` 通过；拾取遮罩、血条、守卫炮口锚点与新帧对齐。
3. **动作门槛：** 行走 8 帧（骑乘/野兽 6 帧）逐帧可见差异，不是同一张图的平移或倾斜；脚底基线在各帧间误差 ≤ 2px；长兵器、翅膀、尾巴完整；同一单位所有帧身高误差 ≤ 3%。
4. **无滑步：** 按交付的“每循环步幅”设置播放速率后，录屏检查着地脚相对地面的漂移应小于步幅的 5%（目前约 20%）。
5. **比例：** 不单轴拉伸；与村民同屏对照，树高于人，房屋门洞能容下人；建筑锚点在底边。
6. **负重：** 货物在篓内随帧起伏，背带与肩相连，不允许漂浮方块。
7. **建筑：** 不得出现漂浮的矩形队伍色块；旗帜是建筑的一部分；施工阶段和受损贴花与新建筑轮廓匹配（`check-building-integrity.cjs`）。
8. **攻击回归：** 运行 `check-attack-actions.cjs` 和 `check-attack-alpha.cjs`；新图集登记进 `attack-manifest.json`。
9. **内存与体积：** 新增图集按需解码，遵守现有缓存上限（动作缓存 80MiB），并记录新增的 PNG 总字节数。V34 一共 129MB PNG，加上 P0 约 39 张，预计再增加 60–80MB，必须先测真机内存；可以考虑把单格降到 160×208。

### 4.5 张数汇总

| 优先级 | 生成/编辑次数 | 帧数 |
|---|---|---|
| P0 行走 | 39 次生成 | ≈1,112 |
| P1 硬伤 | 8 次 | 55 |
| P2 升级线与阵营 | 3 次生成 + 8 次编辑 | 36（编辑不另计帧） |
| **P0–P2 合计（上线必需）** | **≈50 次生成 + 8 次编辑** | **≈1,200** |
| P3 识别度 | 约 12–22 次 | ≈210（英雄行走另加 320） |
| P4 | 7 次 | 112 |
| **全部** | **≈75 次** | **≈1,500（含英雄行走 ≈1,850）** |

---

## 5. 授权风险（上架前补记录）

`docs/app-store-readiness.md` 中的素材登记表目前**一行都没有填**。以下是逐项风险，按严重程度排序：

| 风险 | 涉及文件 | 处理建议 |
|---|---|---|
| **白底红十字是日内瓦公约保护标志**，游戏中使用有被投诉和下架的先例 | directions-advanced-v33（军医行）、attack-combatmedic、directions-civilians-v33（医师行）、attack-healer | P2-4 去徽记编辑；上架前必须完成 |
| 没有提示词记录 | `functional-buildings-v1.jpg`（docs/functional-buildings-v1.md 只描述了设计） | P1 重出 PNG 时同时补齐提示词 |
| 原始生成文件只存在本地 Windows 路径（`C:/Users/…/generated_images/…`），v33-assets.md 的链接指向本机路径 | 全部 V29–V34 图集 | 把原始文件和生成会话 ID 归档进项目记录；把文档链接改成仓库内的相对路径（提示词已在 `docs/v33-prompts/`（19 份）和 `docs/v34-prompts/`（72 份）中） |
| 生成工具条款没有登记 | 全部 AI 生成图（ART.md、v29–v34 记录为内置 ImageGen 生成） | 登记表每行填写：工具/服务商、账户、日期、提示词文件、参考图（只用了项目自有素材）、服务商输出权利条款版本，并说明可以在付费 App 中再分发 |
| 只在文档中提到、没有对应提示词正文的素材 | app-180/192/512.png（只在 NAVAL.md 中提到）、nation-buildings、naval-atlas、reinforcements、nation-units（NAVAL.md） | 核对 NAVAL.md 是否有完整提示词，没有就补；不再使用的旧图集移出发布包 |
| **App 图标带半透明**（alpha 最小 64） | app-*.png | App Store 要求 1024×1024 不透明图标，需另出一版 |
| 彩蛋形象需确认原创 | 糖豆 tangdou、团团 tuantuan | 写明这是原创形象（或说明是基于用户自家宠物/自绘设定），不是任何商业角色的衍生 |
| 第三方 CC0 素材 | guardian-fire.png（OpenGameArt，CC0，已有 LICENSE.txt）✅；音频 public/audio/CREDITS.md 已列来源（不在本次美术范围内，需并入同一张登记表） | 照搬进登记表即可 |
| 品牌联想 | 本地目录名“帝国时代”；类型描述 | 商店文案和截图不要出现“帝国时代 / Age of Empires”；素材本身未发现抄袭他作的痕迹 |
| 历史纹章与旗帜 | 鸢尾花（遍布全部国家）、英国联合旗和王室纹章（nation-buildings 中的 royalarsenal 格，该格当前已被覆盖不显示）、圣乔治十字（长弓手） | 历史纹章本身属公共领域，主要是阵营识别问题；按 P2-4 处理鸢尾花即可 |

---

## 6. 交给工程的非素材事项（便于和美术同步）

1. 删除 `painted-architecture.js` 的 `ornament()` 调用（矢量屋顶和矩形小旗）。
2. 国家地标改用 `ten-capitals.png` 切图（`dynasty-art.js` 已经切好了 `capitals[n]`，只用来生成图标），不再用 `architecture-art.js` 程序绘制的国家建筑。
3. 合并建筑按时代切换主图（§2 表中“时代外观建议”一列），三阶兵种按科技等级切换素材（§1.2、§1.3、§1.5）。
4. I–II 时代城墙接入 industry-v2 的 palisade / palisadegate。
5. 确认旧图集不再显示后移出发布包，并移除 carrier 素材。
