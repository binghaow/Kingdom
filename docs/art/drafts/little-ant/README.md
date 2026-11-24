# 小蚂蚁 Little Ant — 单机彩蛋伙伴

设计：项目负责人的女儿（原稿 `source-sheet-by-daughter.png`，1536×1024）。整合：Claude，2026-11。
个人测试草稿（AGENTS.md「Personal test drafts」），商店发布前再做授权记录。

## 游戏内行为

- 聊天输入 `小蚂蚁` 或 `xiaomayi` / `xiao mayi`（大小写、空格不敏感）召唤；再输一次收起。
- 只在单机生效：`public/little-ant.js` 只扩展 `K.Sim`，联机用的 `K.NetworkSim` 不含这一层；联机里输入只返回系统提示，不生成单位、不改模拟状态（聊天记录本来就不进校验和）。
- 不会受伤（伤害函数返回 0、每步满血）、不能攻击（damage 0）、不能被选为目标（`canTarget` 双向 false，塔和自动索敌都会忽略它）。
- 采集/搬运：和村民一样派去采集（不打猎），每次 4 单位，采集速度为村民的 50%，满载后送回收集建筑。
- 加速：一次远距离移动（> 640）或 0.7 秒内连续下令 → 2.4 秒 1.6 倍速，冷却 8 秒。
- 游泳：只对小蚂蚁开放「陆地或水面」的合并网格（由现有陆地/海面网格按格相与得出，缓存到网格对象变化为止）；其他单位的网格、寻路缓存不变。水中速度 ×0.8。
- 睡觉：闲置 24 秒入睡（入睡 → 睡眠循环带 Zzz → 醒来），任何命令或附近战斗都会叫醒。
- 表情：收到命令「加油」；附近（260）出现战斗「惊讶」；被点选随机「高兴/喜欢/加油」，约一半概率高跳跃；靠近城墙/城门时跳一下；入水/出水跳一下（跳跃纯表现，不改寻路）。
- 性能：未召唤时不请求、不解码图集（只多 2 个小脚本）；召唤后每帧 1 张阴影 + 1 张精灵（游泳时为裁剪 + 2 条涟漪描边），模拟每 0.5 秒扫描一次附近战斗，仅在 `s.antActive` 为真时运行。

## 切图方法（`scripts/art/little_ant_atlas.py build`）

1. 背景识别：深色、低饱和、偏冷（B ≥ R−6，亮度 < 95，色度 < 34）的像素视为原稿底色及其画出的投影；其余为前景。
2. 每条动画只取画面区域（排除标题、八方向下方的中文标签、面板边框）；按连通域找主体（≥ 1500 px），按 x 排序。
3. 睡觉、特殊动作保留附属部件（Zzz、爱心、！、？、加油线、李子、土堆）；奔跑/跳跃的烟尘丢弃（镜像后方向会错）。
4. 封闭空洞只在「很小或颜色不是底色」时填回（瞳孔、嘴）；触角之间露出的底色保持透明。
5. 边缘：内部全不透明，外圈 1 px 柔化，外圈颜色取最近内部像素（去掉深色底的污染）。
6. 统一尺寸：以行走帧侧面身长约 92 px 为基准；八方向 ×0.80、奔跑 ×1.12、跳跃 ×1.10，其余不缩放（预乘 alpha 的 Lanczos）。
7. 锚点：每格 144×132，脚底接地线 y=120，水平以身体中心对齐；跳跃帧在原稿中的离地高度另存为 `lift`（缩放后 `[0,12,45,47,12,1]`），由渲染器抬高。
8. 图集 `public/assets/little-ant-v1.png`（1152×792，6 行：待机 8 方向 / 行走 7 / 奔跑 6 / 跳跃 6 / 睡觉 5 / 特殊 8）；头像 `little-ant-icon-v1.png` 取左上大图（保留黄色小围巾、背包、睡袋和小旗），去掉草丛和光晕。布局写在 `atlas-layout.json`。运行时经 `size-assets.cjs` 使用同尺寸 WebP。

## 调色参数（统一、温和，不改造型）

- 去饱和 10%；白平衡 R×1.03 / G×1.00 / B×0.93（偏暖）；
- 左上暖光：左上 +7% 亮度，右下 −7%，在每帧外接框内线性过渡；
- 接地阴影不在图里，由游戏绘制柔和径向阴影（跳起时变小变淡）；游泳时改为透明涟漪。

## 检查

`python3 scripts/art/little_ant_atlas.py check` → `atlas-check.json` 与 `atlas-preview-{grass,sea,dark}.png`：
真透明、格间 8 px 全透明、全部格子脚底在地线 ±3 px、贴透明处的底色像素 5/20649（< 1%）、每格外圈底色像素 ≤ 2% 且色相偏差 ≤ 6。
游戏内截图（真实脚本顺序、headless Chromium）：`shots/ant-grass.png`、`ant-swim.png`、`ant-sleep.png`、`ant-gather.png`、`ant-carry.png`，由 `node scripts/art/little-ant-shots.cjs` 生成；`shots.json` 记录召唤前图集请求数为 0。目视检查：Claude。

## 缺少的帧（请美术补）

- 原稿动作帧里**没有黄色小围巾和背包**（只有左上大图有）。游戏里只能在头像中看到；建议补画所有动作帧的围巾/背包版本。
- 行走、奔跑、跳跃、睡觉只有**右侧面**：左侧用镜像，前/后方向用八方向待机帧加上下起伏代替。缺：正面/背面（以及四个斜向）的行走 7 帧、奔跑 6 帧、跳跃 6 帧、睡觉 5 帧。
- 特殊动作（高兴、喜欢、惊讶、疑惑、加油、休息、搬运、挖掘）各只有一个朝向；搬运和挖掘各只有 1 帧（游戏中用轻微上下动代替循环）。缺搬运行走循环、挖掘循环（建议各 4–6 帧，左右两侧）。
- 缺游泳专用帧（现用行走帧被水面遮住下半身）。
- AGENTS.md 要求移动单位有前/后/左/右独立视图：本伙伴为单机彩蛋，暂缺上述方向动作，不声称完整四向动画。

## 重绘统一风格版本的提示词

中文：
> 为 2D 写实暖色调即时战略游戏重绘一只「小蚂蚁」伙伴角色的动画精灵表，必须严格保持参考图（小女孩的原创设计）的造型：圆滚滚的红棕色三段身体、米色大脸、大眼睛和腮红、两根末端圆球的触角、细长深棕色腿、黄色小围巾（带皇冠图案）、棕色小背包和绿色睡袋。只统一画风：柔和的手绘质感、左上方暖色光源、略降低饱和度、与中世纪/近代战场的写实暖色调协调，不要改成写实昆虫，不要改变比例和表情。透明背景（真 alpha，无底色、无投影、无文字、无边框），每格 144×132、脚底对齐同一地线，同一尺寸。需要：八方向待机；正面、背面、左、右四个方向的行走 8 帧、奔跑 6 帧、跳跃 6 帧（起跳→空中→落地）、睡觉 5 帧（入睡→循环→醒来）、游泳 6 帧（下半身在水下）、搬运行走 6 帧、挖掘/采集 6 帧；表情：高兴、喜欢、惊讶、疑惑、加油、休息。所有帧都戴黄色围巾、背背包。

English:
> Redraw an animation sprite sheet for the "Little Ant" companion of a warm, painterly 2D real-time strategy game. Keep the reference design (an original character drawn by a child) exactly: round reddish-brown three-segment body, big cream face with large eyes and blush, two antennae with ball tips, thin dark-brown legs, a small yellow scarf with a crown motif, a little brown backpack and a green bedroll. Only unify the rendering: soft hand-painted shading, warm key light from the upper left, slightly reduced saturation, matching a warm realistic battlefield palette — do not turn it into a realistic insect, do not change proportions or expressions. Transparent background (real alpha; no backdrop, no cast shadow, no text, no frames); every cell 144×132 with the feet on one shared ground line and one shared scale. Needed: 8-direction idle; front, back, left and right views of an 8-frame walk, 6-frame run, 6-frame jump (take-off → air → landing), 5-frame sleep (fall asleep → loop → wake), 6-frame swim (lower body under water), 6-frame carrying walk and 6-frame dig/gather; emotes: happy, love, surprised, confused, cheer, rest. The scarf and backpack appear in every frame.
