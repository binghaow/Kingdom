# 海岸帝国更新

## 本次内容

- 三国：英国、法国、中国。专属兵种为长弓卫士、皇家胸甲骑兵、诸葛连弩兵；特色建筑为皇家军械所、王家马术学院、连弩工坊。
- 全部规则共 21 类建筑、20 类单位；每个国家只开放自己的特色建筑和单位。新增戟兵、散兵、轻骑斥候、攻城臼炮、港口、造船厂、海滨浴场、岸防炮台、采石场与伐木营地。
- 四类资源：食物、木材、黄金、石料。地图扩大至 4800 × 2880，包含主大陆、三处桥梁、两座资源岛、海岸和深海鱼群。
- 海军：渔船、轻型护航舰、重型护卫舰、迫击炮舰、运输船。渔船生产食物；运输船可装载 6 人口，靠岸或靠近岛屿卸载，沉没会损失载员。
- 舰船与陆军使用不同通行网格。岸防炮台只能打海军，迫击炮舰只能轰击建筑，护卫舰负责保护攻岸船只，形成明确分工。

## 初步平衡边界

| 国家 | 优势 | 取舍 |
| --- | --- | --- |
| 英国 | 舰船生命 +8%；农田产出 +8% | 采金效率 -6% |
| 法国 | 近战步兵和骑兵生命 +7% | 骑兵训练时间 +10%；造船木材 +8% |
| 中国 | 建筑木材 -10%；伐木 +6% | 军事单位训练时间 +8%；舰船射程 -5% |

双方开局资源、单位数量、建筑数量和人口相同。难度改变电脑的进攻时机及组织，不给电脑隐藏的攻击或生命加成。高级单位有资源、人口、时代或最小射程限制。皇家胸甲骑兵占 2 人口，2 名同预算戟兵能克制单名胸甲骑兵。采集营地光环不重复叠加。以上是成本与克制关系的初步平衡，不代表已通过大量真人对局或长期胜率验证。

## 手机操作

- 点选后点击目标指挥；“点选 / 框选 / 移图”可明确切换操作。
- 双指缩放、长按选择附近同类单位，底部命令可收起；陆军、舰队、村民分开选择。
- 撤退按钮常驻触控区。舰队撤回港口，陆军撤回主城。
- 手机建造先定位预览，再点“确认建造”，避免误触扣资源。
- 已处理安全区域和动态视口尺寸；电脑保留鼠标、框选、WASD、方向键、快捷键。

## 可安装 App

提供的是 PWA（可安装网页应用），不是已签名的 App Store 原生 iOS 包。已提供 manifest、192/512 图标、Apple 180 图标、standalone 配置、service worker 和离线资源缓存。首次打开保持联网至“离线资源已就绪”；游戏状态保存在当前应用/浏览器存储中。iPhone 使用 Safari 的分享菜单添加到主屏幕，并开启“作为网页 App 打开”。浏览器与主屏幕 App 的存储行为受系统管理，不承诺二者存档自动迁移。

Apple 官方参考：[Safari Web App 模式](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/#every-site-can-be-a-web-app-on-ios-and-ipados)、[原生分发与签名](https://help.apple.com/xcode/mac/current/en.lproj/dev31de635e5.html)。

## 验证与限制

`node check.cjs` 验证 12 项既有陆战、经济和升级场景；`node check-maritime.cjs` 验证 15 项国家开局、成本、兵种限制、海陆寻路、捕鱼、采石、浴场、运输装卸与沉没、海军分工、同预算反骑兵、保存恢复、缓存依赖和离线导航回退场景。浏览器验证国家选择、专属菜单、四资源、舰队视野、常驻撤退、手机二次确认建造与 PWA 缓存就绪。iPhone 17 真机安装、双指手感和性能仍需实际设备试玩；当前使用写实 2.5D 预渲染素材。

## 新增美术素材（内置 ImageGen）

- `dist/assets/naval-atlas.png`：五类船只、岸防、港口、造船厂。
- `dist/assets/nation-buildings.png`：经济与国家特色建筑、石矿、岛屿遗迹。
- `dist/assets/reinforcements.png`：四类新增普通陆军/炮兵行走帧。
- `dist/assets/nation-units.png`：三国特色兵种行走帧。
- `dist/assets/app-180.png`、`app-192.png`、`app-512.png`：由代码绘制的原创建筑盾徽应用图标。

## 生成提示词

### 图集 1

Production sprite atlas for a premium realistic 1700s historical RTS, exactly 4 columns and 2 rows of equal square cells. True transparent alpha background, no white backplate, no grid lines, no labels. Orthographic three-quarter high top-down camera from southeast, realistic PBR wood, rope, bronze, canvas, warm sunlight upper left. Every object entirely contained within its cell with 12 percent transparent margins. Row1 left to right: (1) small fishing sailboat with nets and baskets, (2) agile single-masted naval sloop with cream sails and six small cannons, (3) large three-masted frigate with cream sails and gun ports, (4) squat two-masted bomb ketch with prominent deck mortar. Row2: (1) unarmed wide-bellied transport sailing ship, (2) coastal stone artillery battery with two bronze cannons, (3) timber fishing harbor with compact blue roofed storehouse and long wooden pier extending forward, (4) shipyard with timber boathouse, small crane and unfinished wooden ship on slips. All ships face down-right, no water or broad ground rectangles, minimal contact shadows. Fine realistic texture, highly detailed game-ready pre-rendered art, no cartoon, no low-poly, no text or UI.

### 图集 2

Production transparent sprite atlas for realistic historical RTS, exactly 4 columns by 2 rows, eight isolated objects in equal square cells. Genuine transparent alpha background with no white backdrop, no grid lines or text. Orthographic high top-down southeast camera, warm upper-left sunlight, realistic fine PBR materials. Row1 left to right: (1) timber lumber camp with stacked logs and saw shed; (2) small stone quarry with rock cutting pit, stone blocks and timber crane; (3) elegant 1700s seaside bathing pavilion with cream colonnade, blue tiled roof, small bathing pool and changing huts, no ocean surrounding it; (4) British royal arsenal with Georgian limestone facade, blue slate roof, Tudor archery targets and crown banner. Row2: (1) French royal riding academy, ornate stone and timber stables around small courtyard, blue heraldic banners; (2) Chinese repeating-crossbow workshop with tiled curved roof, timber walls, courtyard weapon racks and royal blue banners; (3) cluster of natural grey stone ore boulders; (4) ancient ruined stone shrine with low broken columns for an island landmark. Keep all objects fully inside their own equal cell with 12 percent transparent margins and consistent baseline, no broad background tiles, no labels, no UI, not cartoon or low-poly. Professional game art matching detailed colonial RTS architecture.

### 图集 3

Production animated unit sprite sheet for a realistic 1700s RTS. Exactly 4 columns by 4 rows on transparent alpha background. Each row contains one consistent unit in four natural walking frames facing down-right; same orthographic high southeast top-down camera, fine realistic fabrics, warm sunlight upper left. Row1: blue-coated halberd infantry in metal breastplate and tricorne carrying a long halberd. Row2: lightly equipped blue-uniformed skirmisher in leather cap carrying long flintlock rifle. Row3: blue-coated light hussar with fur-trimmed jacket and black cap riding a lean dark bay horse, four walking horse poses. Row4: large bronze mortar on small wooden wheeled carriage, steeply raised short barrel, four small wheel poses, no crew. Every unit wholly inside its own equal cell, ground baseline 90 percent, generous transparent margins, no scenery or ground tiles, no labels, no UI, no white backdrop, highly detailed realistic pre-rendered game sprites, no cartoon.

### 图集 4

Production animated unit sprite sheet for a premium realistic historical RTS. Exactly 4 columns by 3 rows of equal cells, genuinely transparent alpha background. Each row depicts same unique national unit in four natural walking frames facing down-right, consistent orthographic high top-down camera from southeast, warm sunlight upper left, fine PBR cloth and armor. Row1 British royal longbow guard in blue Tudor-inspired military coat, dark cap and leather belt, carrying tall longbow. Row2 French royal cuirassier with polished steel breastplate over blue coat, crested helmet, riding a powerful chestnut horse with ornate blue saddle cloth. Row3 Chinese repeating-crossbow soldier in blue cloth lamellar coat and traditional dark brimmed helmet carrying a wooden repeating crossbow with bolt magazine. Realistic proportions and historical miniature game render, every whole unit/horse/weapon inside its own cell with ample transparent margin and consistent baseline near 90 percent, no ground or scenery, no text, no labels, no grid lines, no white background, no low-poly or cartoon.


长时回归：普通难度运行十二分钟，电脑完成第三时代、国家特色建筑、造船厂与攻城工坊；村民不参与军队突袭。
