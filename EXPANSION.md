# 战斗与经济扩展版

已完成：移动优先与独立撤退指令；红色攻击目标圈和目标血条卡；倒地、尸体淡出、建筑崩塌；材质区分的战斗与采集音效；采集任务标签、进度、资源飘字和碎屑；12 种建筑、村民及 7 种作战/支援单位；三时代、两级武器/护甲/采集科技、击杀 3/8 次的老兵晋升；3600 × 2400 地图、三处桥梁、440 个初始资源点（含 24 个渔场点）。

操作：选部队后点敌人指定攻击；点空地移动会打断交战；R / 立即撤退返回主城；F / 攻击前进会沿途交战；WASD / 方向键移动视野。手机直接使用命令按钮和拖动地图。城镇中心晋升时代，铁匠铺和市场研究科技。建农田后派村民耕作。

旧版地图与新地图几何结构不同，因此新战局使用独立存档，保留浏览器中的旧版存档，不自动覆盖。游戏保持公开、无需账号登录。

新增美术使用内置 ImageGen；最终文件：`dist/assets/expansion-buildings.png`、`dist/assets/expansion-units.png`。建筑图集另用内置图像编辑清除了白色背景和网格；图集裁切时清除低透明度背景像素。

## 生成提示词

### 建筑

Production sprite atlas for a realistic historical 1700s RTS game, exactly 4 columns by 2 rows, eight separate buildings in equal square cells. True transparent background. Orthographic high top-down 40 degree camera from southeast, realistic detailed prerendered 3D PBR stone, wood, slate blue roofing, subtle royal blue banners, warm upper-left sunlight, match premium European colonial RTS assets. Row 1 left to right: (1) farm: rectangular cultivated wheat rows, small timber shed, fence and grain sacks; (2) cavalry stable with timber stalls, stone walls and hay; (3) military shooting range with blue roofed armory hut, archery targets and weapon racks; (4) artillery workshop with timber and stone hall, cannon wheels and a cannon outside. Row 2 left to right: (1) blacksmith forge with chimney, anvil and coal; (2) colonial marketplace with colorful canvas stalls, crates and small storehouse; (3) small limestone church with bell tower and blue slate roof; (4) stone bastion fortress with crenellated walls, squat central keep, blue pennants and corner cannons. All objects completely fit inside their own cell with 8 percent transparent margins, consistent lighting and ground baseline near 90 percent cell height. No ground squares beyond footprints, no text, no UI, no background scenery, no cartoon, no flat vector, no low-poly. Very fine architectural textures.

### 单位

Production animated sprite sheet for realistic historical 1700s European RTS. Exactly 4 columns by 4 rows of equal cells, true transparent background. Each row is one consistent unit in four walking frames facing down-right; orthographic top-down 40 degree camera from southeast. Professional highly detailed prerendered 3D game art with warm upper-left sunlight and realistic proportions. Row 1: musketeer in dark blue military coat, white breeches, black boots and tricorne, holding long flintlock musket. Row 2: grenadier in blue coat and tall grenadier cap, bandolier of grenades, holding a small round iron grenade in hand. Row 3: wheeled bronze field cannon on dark timber gun carriage, two large wooden spoked wheels, barrel points down-right, four slight wheel rotation poses, no crew. Row 4: battlefield physician in cream long coat with blue sash and brown hat, leather medical satchel, carrying small medical bag; no red cross logos. Each sprite fully fits its own cell with generous margins and baseline near 90 percent cell height. Isolated unit objects only, no scenery, no ground tiles, no labels, no text, no UI, no cartoon or low-poly. High quality game sprites matching European colonial architecture.

### 建筑透明背景修正

Edit target: the supplied historical RTS building sprite sheet. Keep all eight buildings and their exact positions, grid cell sizes, framing, architecture, roofs, colors and textures unchanged. Remove the white backdrop AND the thin grey grid lines completely, replacing all empty backdrop pixels with true transparent alpha. Keep small natural ground footprints immediately under the buildings, but remove wide white rectangular backgrounds and detached shadows. Do not redesign or add anything. Output the same 4 columns by 2 rows atlas with a genuinely transparent background, usable as game sprites.

## 验证

运行 `node check.cjs`，覆盖撤退优先级、死亡与人口释放、采集反馈、农田与贸易、时代与重复研究限制、全军科技效果、火炮范围与攻城伤害、治疗、施工、跨河寻路及存档恢复等 12 项场景。浏览器另检查实际升级、建设、目标标记、移动与撤退指令、音频激活状态，以及桌面和手机横竖屏布局。手机真机听感与性能仍需要实际试玩。

