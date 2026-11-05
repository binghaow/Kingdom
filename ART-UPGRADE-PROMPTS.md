# 美术素材与生成说明 · 2026-11-05

生成方式：内置 ImageGen，分别生成五张图集；未使用 CLI。素材已复制进项目，游戏不依赖本机生成目录。

保存位置（相对于本文件）：

- `public/assets/aviation-v2.png`：独立热气球、运输飞艇、武装飞艇、飞艇工场，2×2 透明图集。
- `public/assets/terrain-materials-v2.png`：草地三种、泥土、层状岩壁、海水、砂砾、金矿岩，4×2 材质图集。
- `public/assets/troops-v2.png`：16 种分别制作的人物和骑兵，4×4 透明图集。
- `public/assets/architecture-v2.png`：16 种基础功能建筑，4×4 透明图集。
- `public/assets/industry-v2.png`：16 种工业、防御和文明建筑，4×4 透明图集。

游戏按网格切图、去除低透明度边缘并保留透明背景；国家布料和屋顶配色、时代装饰、脚手架、选择圈、动画另由绘制代码添加。城墙采用贴合碰撞范围的独立绘制，避免图画朝向与实际阻挡范围错位。图集内未启用的温室和木栅样式只作为素材保留，没有新增建筑功能。

最终提示词集合（规格记录）：

1. Aviation: professional detailed painterly historical RTS assets, transparent background, exact 2×2 isolated sprite atlas, no text. Round silk scout balloon with wicker basket and telescope; tan elongated civilian cargo airship with wooden gondola and crates; dark navy armored rigid military zeppelin with rivets guns engines; dedicated arched steel/glass airship hangar with visible assembly, gantry crane and mooring mast. Complete silhouettes, consistent isometric view, realistic textured materials and subtle shadows.
2. Terrain: seamless historical RTS material atlas, exact 4×2, no text or gutters. Lush clover grass; olive mixed grass and tiny wildflowers; dry golden grass; brown earth; layered limestone cliff; deep blue teal water with fine ripples; pale gravel; dark slate with gold veins. Detailed natural painterly game textures, opaque background, no buildings, no characters.
3. Troops: professional historical RTS sprite atlas, painterly realistic miniatures, intricate clothing anatomy metal and ambient occlusion, polished Age of Empires III prerendered quality. Transparent background, exact 4×4 isolated full figures, no labels, three-quarter right view, complete weapons inside each cell. Row 1 peasant pickaxe worker, leather-armored spear and round-shield infantry, hooded archer with quiver, armored mounted knight. Row 2 tricorn musketeer aiming musket, tall-cap grenadier holding iron grenade, white-robed healer with staff and satchel, crouching green hunter rifle skirmisher. Row 3 heavy plate halberd guard, apron/goggles/tool-belt engineer with hammer, blue-coated mounted carbine dragoon on pale horse, braided-jacket hussar with saber on black horse. Row 4 ornate royal swordsman with tower shield, nineteenth-century rifle guard, medical-bag field surgeon, loaded traveling merchant with walking staff. Muted blue/green fabrics, natural skin, brown leather, gray steel. Not cartoon, vector or flat illustration.
4. Architecture: professional historical RTS building atlas, exact 4×4 equal cells, isolated full isometric buildings, transparent, no text or labels, generous margins. Detailed painterly miniature architecture, weathered timber stone plaster roof tiles, fine joinery, warm upper-left sunlight, ambient shadows, muted jade/slate roofs. Row 1 town center courtyard civic hall and bell tower, thatched house garden, U-shaped barracks training yard weapon racks, archery shed three targets. Row 2 wheat farm fenced barn windmill, stable horses and paddock, defensive watchtower, blacksmith forge anvil chimney. Row 3 market stalls crates carts, church spire stained glass apse, cannon workshop gun racks, four-tower stone fort courtyard. Row 4 fishing dock nets warehouse wharf, shipyard unfinished hull ribs gantry crane, bathhouse turquoise pool steps colonnade, quarry stone blocks hoist hut. Not vector, cartoon or diagram.
5. Industry: professional historical RTS building atlas, exact 4×4 equal cells, isolated complete isometric buildings, transparent, no text, labels or grid. Polished painterly prerendered miniatures with realistic weathered copper jade slate stone timber and upper-left light. Row 1 lumber camp logs sawbench axes lean-to, three-gun coastal battery, ornate university quadrangle telescope observatory, guarded arsenal rifle racks drill courtyard. Row 2 foundry chimneys furnace molten metal molds, palace fountain symmetrical wings central dome, steelworks blast furnaces gears pipes bars, semaphore telegraph bureau wires office. Row 3 round cannon turret bastion, trebuchet siege yard winch shed, horizontal crenellated stone wall, arched twin-tower city gate. Row 4 sharpened wooden palisade, wooden palisade gate, captured ancient black-stone citadel amber runes, glass greenhouse research hut. No airships, not flat vector or cartoon.

这些是游戏用 2D 图集及绘制层，非完整 3D 引擎或商业游戏素材移植。
