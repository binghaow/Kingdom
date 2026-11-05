# 十国版本生成素材

使用内置 image_gen，真实透明背景。四张图集已逐张检查，保留四帧行走与等分格布局。最终文件均在本项目中：

- [dist/assets/nations-east.png](C:/Users/bingh/OneDrive/文档/ChatGPT/帝国时代/frontier-kingdom/dist/assets/nations-east.png)：日本、奥斯曼、俄罗斯、普鲁士。
- [dist/assets/nations-west.png](C:/Users/bingh/OneDrive/文档/ChatGPT/帝国时代/frontier-kingdom/dist/assets/nations-west.png)：西班牙、荷兰、美国。
- [dist/assets/ten-capitals.png](C:/Users/bingh/OneDrive/文档/ChatGPT/帝国时代/frontier-kingdom/dist/assets/ten-capitals.png)：十国首都与国家机构建筑风格。
- [dist/assets/imperial-units.png](C:/Users/bingh/OneDrive/文档/ChatGPT/帝国时代/frontier-kingdom/dist/assets/imperial-units.png)：近卫戟兵、龙骑兵、重型榴弹炮、军械工程师。

运行时单位帧降为 128 像素，建筑切片高 200 像素，服饰变体按需缓存。城镇中心、特色建筑使用国家建筑外观；通用建筑保留功能轮廓，以配色、旗帜装饰区别；通用村民保留劳动动作并添加地区帽饰，特色兵种使用独立图像。

## 最终提示词

### 1

Production transparent sprite atlas for realistic historical isometric RTS. Orthographic high camera looking southeast, warm sunlight upper left, realistic cloth metal wood. Genuine transparent background, no ground, text, labels or cell lines. Each whole object fits its own equal cell with 12% margin and baseline at 88% cell height. Exactly 4 columns by 4 rows. Each row is one soldier in four consecutive walking frames facing lower right, same soldier weapon scale across frames. Row1 Japanese samurai: indigo lamellar armor, kabuto helmet, long katana. Row2 Ottoman janissary: white tall folded bork hat, red uniform, long matchlock musket. Row3 Russian streltsy: red kaftan, fur hat, bardiche axe and musket. Row4 Prussian grenadier: blue coat, tall brass mitre cap, musket with bayonet. Professional military soldiers with highly distinct silhouettes, never peasants, weapons entirely in cells.

### 2

Production transparent sprite atlas for realistic historical isometric RTS. Orthographic high camera looking southeast, warm sunlight upper left, realistic cloth metal wood. Genuine transparent background, no ground, text, labels or cell lines. Each whole object fits its own equal cell with 12% margin and baseline at 88% cell height. Exactly 4 columns by 3 rows. Each row is one soldier in four consecutive walking frames facing lower right, consistent scale. Row1 Spanish Tercio pikeman in steel half armor, swept morion helmet, crimson sash, long pike slanted diagonally entirely inside cell. Row2 Dutch Nassau marksman: orange sash over navy coat, black wide brim hat, ornate long flintlock rifle. Row3 American Continental rifleman: blue longcoat, cream trousers, black tricorn, powder horn and long rifle. Professional soldiers, not peasants. Distinct headgear and weapons.

### 3

Production transparent sprite atlas for realistic historical isometric RTS. Orthographic high camera looking southeast, warm sunlight upper left, realistic cloth metal wood. Genuine transparent background, no ground, text, labels or cell lines. Each whole object fits its own equal cell with 12% margin and baseline at 88% cell height. Exactly 5 columns by 2 rows: ten distinct magnificent royal/civic buildings, one per equal cell, consistent camera scale. Row1 left to right: British Georgian royal academy, cream stone columns blue slate roof; French ornate military academy with mansard roofs; Chinese imperial academy, red pillars jade glazed roofs courtyard; Japanese samurai dojo, layered dark tiled roofs white plaster timber gate; Ottoman imperial divan with domes corner towers turquoise roofs. Row2: Russian armory with onion-domed towers red brick; Prussian military academy clock tower dark pitched roofs; Spanish Casa de Contratacion, stucco courtyard red tile roofs bell tower; Dutch trading guild, stepped brick gables orange banners; American colonial congress hall, red brick white pillars green copper clock cupola. Isolated architecture, rich realistic PBR detail, no scenery or writing.

### 4

Production transparent sprite atlas for realistic historical isometric RTS. Orthographic high camera looking southeast, warm sunlight upper left, realistic cloth metal wood. Genuine transparent background, no ground, text, labels or cell lines. Each whole object fits its own equal cell with 12% margin and baseline at 88% cell height. Exactly 4 columns by 4 rows. Each row is one late-era unit in four consecutive walking frames facing lower right. Row1 elite halberd guard, polished breastplate over blue military coat, ornate helmet, large halberd. Row2 mounted dragoon in tricorn blue coat, long carbine, brown horse, whole horse inside cell. Row3 heavy bronze howitzer on dark timber wheeled field carriage with blue-uniformed gunner alongside, four subtle rolling movement frames. Row4 military engineer in leather apron over green coat, tricorne, satchel, hand hammer and rolled plans. No modern vehicles or military peasants.

