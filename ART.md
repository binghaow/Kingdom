# 边境王国：写实美术更新

本次采用内置 ImageGen 生成原创素材，接入实际可玩的战场。使用固定视角的预渲染精灵和 Canvas 分层渲染（2.5D），不是可旋转镜头的完整 3D 引擎，也不宣称达到《帝国时代 3》完整商业游戏的制作水平。

## 最终素材

| 文件（相对项目目录） | 用途 |
| --- | --- |
| `dist/assets/world-atlas.png` | 4 × 2 图集：城镇中心、兵营、房屋、箭塔、松树、橡树、金矿、果丛 |
| `dist/assets/units-atlas.png` | 4 × 4 图集：村民、步兵、弓箭手、骑兵，每种四个行走帧 |
| `dist/assets/meadow.jpg` | 写实草地贴图；由生成的 PNG 编码为质量 86 的 JPEG，减少传输量 |
| `dist/assets/bridge.png` | 木桥与石砌桥台 |
| `dist/visuals.js` | 图集裁切、敌方服装配色、地形、水面、烟雾、阴影与音效 |
| `dist/imperial.css` | 铜金边框、深蓝指挥界面、响应式布局 |

原始生成文件保留在 `C:/Users/bingh/.codex/generated_images/01a1a90c-b2b7-7d30-8ebd-81cab9f16889/`。游戏实际引用的最终素材全部位于项目内。

## 生成提示词

### 建筑与环境图集

Use case: stylized-concept. Asset type: production game sprite atlas, exactly 4 columns by 2 rows, square canvas 2048x2048 if possible, each cell same size. Eight isolated highly detailed realistic pre-rendered 3D game objects for a premium historical real-time strategy game set in the 1700s. Orthographic three-quarter top-down camera, 40 degree elevation, camera from south-east, directional warm sunlight from upper left, coherent realistic PBR materials, crisp edges, fine architectural details, worn stone blocks, detailed timber beams, individual roof tiles. Transparent background everywhere, NO ground tiles, NO colored backgrounds, NO text, NO UI. Each object entirely within its equal cell with a generous 8 percent transparent margin. Row 1 left to right: (1) grand colonial European town hall with central clock tower, limestone walls, slate blue roofs and subtle royal blue banners, side wings and front stone steps; (2) long colonial military barracks with slate blue roofs, stone and timber walls, weapon racks and blue banner; (3) small colonial half-timber cottage with terracotta roof, chimney, crates and a tiny fence; (4) tall square stone watchtower with blue slate pointed roof and wooden lookout balcony. Row 2 left to right: (1) tall realistic dense conifer pine tree, dark green layered needles, textured trunk; (2) mature spreading oak tree with richly detailed green leaves and thick textured trunk; (3) small cluster of natural rugged grey mineral rocks with golden ore veins; (4) dense leafy berry bush with reddish berries. Buildings must look like real miniature architecture, NOT low-poly, NOT cartoon, NOT flat vector, NOT toy plastic. Objects grounded at same relative baseline at 90 percent height of each cell. Consistent lighting, clear silhouettes, ambient occlusion. Professional RTS art asset quality.

### 单位行走图集

Use case: stylized-concept. Asset type: historical RTS animated unit sprite sheet, transparent background, 4 columns and 4 rows in an exact uniform grid, each sprite completely inside its own cell. 2048 by 2048 canvas preferred. Professional highly detailed realistic pre-rendered 3D game art, 1700s European frontier military, fine cloth texture, realistic human proportions, tiny believable details, game camera orthographic three-quarter view from above about 40 degrees, facing down-right in all cells. Each row contains the SAME character with a consistent four-frame walk cycle, legs and arms alternating in a natural stride. Row 1: male settler villager, brown trousers, cream shirt, dark blue vest, broad brimmed brown felt hat, holding woodcutting axe. Row 2: European pikeman infantry with blue military coat, ivory breeches, black boots, black tricorne hat, long metal pike held upright diagonally. Row 3: European crossbowman in dark blue vest over beige shirt, boots, brown leather belt, leather cap, carrying crossbow. Row 4: mounted European cavalryman wearing blue military coat and black tricorne hat riding a realistic chestnut horse with saddle and bridle, four natural walking horse poses. Every whole unit including weapon/horse fits its cell, consistent ground baseline at 90 percent cell height, generous transparent margin, no overlapping between cells, isolated sprites, no scenery, no ground tiles, no labels, no text, no UI, no large shadows. Warm directional sunlight from upper left, ambient occlusion. Not cartoon, not low poly, not vector art. These are usable actual animated game sprites, not a concept board.

### 草地

Use case: stylized-concept. Asset type: seamless tileable top-down terrain texture for a realistic historical strategy game. Square image. Orthographic straight down aerial view of natural temperate meadow ground at a scale where the whole tile is about 20 meters across. Dense fine varied olive green meadow grass with subtle dry straw tufts, tiny clover, earthy irregular patches and minute scattered pebbles, realistic organic microtexture, natural subtle tonal variation, muted sage olive greens and warm tan earth, late summer. Flat neutral diffuse sunlight with no directional cast shadows. Perfectly tileable edges in all directions, no obvious seams, no large distinct objects, NO trees, no bushes, no buildings, no paths, no roads, no water, no flowers, no text, no perspective horizon, no UI. High quality physically based game terrain albedo texture, highly detailed and natural, not stylized blobs, not cartoon, not vector. Entire canvas filled with terrain.

### 桥梁

Use case: stylized-concept. Asset type: a single production sprite for a premium realistic 1700s historical real-time strategy game. A timber and stone river bridge viewed from a high orthographic 45-degree top-down angle. The bridge runs exactly HORIZONTALLY from left to right across the image; both endpoints at the same screen height, no diagonal rotation. Long narrow weathered wooden plank deck with two subtle wheel tracks, convincing individual boards and iron nails, timber side railings along near and far edges, realistic old masonry stone abutments at both ends. Entire bridge isolated on genuinely transparent background, no water, no terrain, no trees, no people, no text, no logos, no frame, no UI. Wide landscape composition. Detailed PBR game render, warm sunlight upper left, fine texture, realistic muted brown wood, grey warm stone, soft ambient occlusion. Fits wholly within canvas with transparent margin. No cartoon, no low-poly, no flat shapes.

## 验证

- 核心模拟检查：采集、训练、施工、跨河路径、战斗伤害、保存、暂停。
- 浏览器检查：素材成功加载，控制台无运行错误，存档可恢复。
- 手机布局检查：393 × 852 竖屏、852 × 393 横屏；不是 iPhone 真机性能测试。
- 公开访问：不携带登录信息请求生产网址，确认直接返回游戏 HTML。
