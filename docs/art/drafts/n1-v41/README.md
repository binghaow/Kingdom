# N1 金矿 / 石矿资源图集 · draft v41

**状态：素材候选已生成；自动图集验收 PASS（仅 draft）**：2026-11-12 重新生成金矿耗尽、石矿富集和石矿约剩 25% 三格，修复了可见粉色边缘残留和石矿阶段体量倒挂；其余五格保留。运行本仓库脚本组装、验收并检查草地、海水、深色 UI 预览。尚未接入游戏，未在实时对局中验证，不发布。

本目录包含原始候选图和后半段流程：

- 把任何图像生成器（GPT Image、Midjourney、Imagen 等）的输出处理成合规图集；
- 自动验收，并出三种背景上的预览图。

## 为什么以前的结果有杂边、尺寸也不对

- 一次生成整张 4×2 图集时，生成器很少能精确对齐 512 格。它也常常画假透明（棋盘格），或者用不透明底色。
- 先在白底或黑底上生成再抠图，半透明边缘会混进底色，就成了白边或黑边。在红色或黄色底上抠，就是红边或黄边。

## 推荐流程

1. 用下面的提示词**一张图生成一个阶段**，共 8 张。
   - 生成器能直接输出透明 PNG 就用透明背景。
   - 不能的话，用**纯品红 #FF00FF 实底**。品红和金色、灰色石头都不接近，抠图最干净。
   - 8 张用同一个种子或同一张参考图，保证视角和光照一致。
2. 组装（只做非破坏性后处理）：
   ```
   python3 scripts/art/n1_atlas.py build --out docs/art/drafts/n1-v41/resource-nodes-n1-v41.png \
     gold1.png gold2.png gold3.png gold4.png stone1.png stone2.png stone3.png stone4.png
   ```
   组装会做这些事：
   - 有真 alpha 就直接用。没有就按底色抠图，并把混进边缘的底色算掉。
   - 半透明边缘取内侧实色，去掉黑、白、红、黄的 matte 杂边。
   - 去掉远离主体的碎点。
   - 8 格用**同一个缩放比例**，保证阶段之间大小可比。
   - 接地中心对齐 (256, 430)，四周留 8% 边距，格间 8 px 全透明。
3. 验收：
   ```
   python3 scripts/art/n1_atlas.py check docs/art/drafts/n1-v41/resource-nodes-n1-v41.png --outdir docs/art/drafts/n1-v41/
   ```
   输出 `check.md`、`check.json`，以及草地、海水、深色 UI 三张预览图和边缘 3 倍放大的总览 `preview-sheet.jpg`。
4. 自动检查全部通过后，还要有人目视预览图，并在 `check.md` 末尾写明审查人（AGENTS.md alpha gate）。然后才能另开任务接入游戏，接入后跑 `check-resource-layout.cjs`、`check-economy.cjs` 和完整的 release-check。

## 自动检查项（`check`）

| 项 | 判定 |
|---|---|
| PNG / 2048×1024 / RGBA | 真实像素和通道 |
| 真透明 | alpha 最小为 0，透明像素至少 40%；任何一格整格不透明（棋盘格或实底）判失败 |
| 四角和格间隔 | 四角和格间 8 px 的 alpha 全为 0 |
| 留白 | 每格四周至少 41 px（8%）透明 |
| 接地 | 底部中心在 (256, 430) ±12 px 以内 |
| 单一矿脉 | 主体连通块至少占 80%，没有第二个大团（防止复制叠放或一格两矿） |
| 体量 | 富集格宽至少 300 px（约 2.2 个村民），富集到耗尽的覆盖率递减 |
| 资源类型 | 金矿第 1–3 格有金色像素；金矿第 4 格和石矿 4 格没有金色 |
| 边缘色偏 | 对半透明边缘逐像素寻找最近实色像素，比较 RGB 色相比例，任一颜色通道偏差 ≤ 12 个百分点。亮度差单独记录供目视复核；矿石本身的受光边缘可能比内侧更亮，因此不再把整圈边缘与整圈内侧的平均亮度差误当成色边。 |

**流程自测**（不是交付物）：

- 一张 1536×1024 的 RGB 黑底图，正确判为尺寸和 RGBA 未通过。
- 把仓库现有的石块和精灵图压在暗红底上，再组装检查：抠图后没有红边，接地和留白都通过。
- 自测时故意放错了内容（金矿格放了别的图），被"资源类型"和"体量递减"两项正确判为未通过。

## 实际生成提示词（基于 asset-audit-v2 N1，改成单张生成）

**参考图**（只参考画风和镜头，不复制内容）：

- `public/assets/architecture-v2.png`
- `public/assets/world-atlas.png`，第 2 行岩石
- `public/assets/trees-v29.png`

**EN（每次生成一张，把 [STAGE] 换成下面 8 个阶段之一）**

Production resource-node sprite for a premium realistic 1700s RTS. Orthographic three-quarter top-down camera, about 40° elevation, seen from the south-east, matching the attached reference images exactly in camera, warm top-left sunlight and painterly pre-rendered PBR finish. ONE single natural cluster, centred, filling about 75% of the image width, the whole object fully inside the frame with generous empty space on all sides. Background: fully transparent PNG (if transparency is unavailable: perfectly flat solid #FF00FF magenta, no gradient, no floor, no vignette). No cast shadow on the ground, no ground plane, no grass, no tools, no people, no text, no border. Clean natural anti-aliased silhouette. Not low-poly, not flat-shaded, not cartoon. Square 1024×1024. [STAGE]

**中文（每次一张，把 [阶段] 换成下面 8 个之一）**

高品质写实 18 世纪 RTS 的正式资源点精灵。正交 3/4 俯视，仰角约 40°，从东南方向看。镜头、左上方暖色阳光和厚涂预渲染 PBR 质感与参考图完全一致。只画**一整团自然的矿石堆**，居中，宽度约占画面 75%，四周留足空白，物体完全在画面内。背景用真透明 PNG；不支持透明时用**完全均匀的纯品红 #FF00FF 实底**，不要渐变、地面或暗角。不画地面投影、地面、草、工具、人物、文字或边框。轮廓自然抗锯齿。不要低多边形、平涂或卡通。正方形 1024×1024。[阶段]

**8 个阶段**（同一个矿点的四个状态。必须用同一个种子或参考图连续生成，保持角度和光照一致）：

| 格 | EN | 中文 |
|---|---|---|
| 1 | GOLD rich: large outcrop of dark granite boulders with thick gold veins and nuggets, loose gold ore at the base | 金矿富集：大片深色花岗岩巨石，带粗金矿脉和金块，底部散落金矿石 |
| 2 | GOLD ~60% mined: same deposit, fewer boulders, fresh broken faces, pick marks, gold still clearly visible | 金矿约剩 60%：同一矿点，巨石变少，断面新鲜，有镐痕，金色仍明显 |
| 3 | GOLD ~25% left: low rubble mound of the same granite with a few bright gold glints (must still read as gold) | 金矿约剩 25%：低矮的同种花岗岩碎石堆，零星亮金光（仍要认得出是金矿） |
| 4 | GOLD depleted: flat scatter of grey granite gravel and dust, no gold at all | 金矿耗尽：一片灰色花岗岩碎石和尘土，完全没有金 |
| 5 | STONE rich: pale grey limestone boulders with natural fracture planes, a few squared cut blocks, chips at the base | 石矿富集：浅灰石灰岩巨石，自然断裂面，有几块切好的方石，底部有碎屑 |
| 6 | STONE ~60%: same quarry, fewer boulders, more cut faces and stacked squared blocks | 石矿约剩 60%：同一采石点，巨石变少，切面和码好的方石变多 |
| 7 | STONE ~25%: low heap of pale limestone chips with one or two cut blocks (must still read as quarry stone) | 石矿约剩 25%：低矮的浅色石灰岩碎块堆，留一两块方石（仍要认得出是石矿） |
| 8 | STONE depleted: flat scatter of pale dust and small chips | 石矿耗尽：一片浅色石粉和小碎屑 |

## 授权登记（出图时填写）

| 文件 | 生成工具 / 模型 | 生成者 | 日期 | 条款是否允许免费和付费 App 再分发 |
|---|---|---|---|---|
| `src/gold4.png`, `src/stone1.png`, `src/stone3.png`（本轮重生成）；其余 5 张原图（此前生成）；`resource-nodes-n1-v41.png`（脚本组装） | OpenAI ImageGen（Codex 内置图像生成；具体底层模型版本未向工具公开） | OpenAI Codex 会话 | 2026-11-12 | OpenAI《Terms of Use》（2026-01-01 生效）规定，在适用法律允许范围内，用户拥有 Output；条款未要求署名。可用于免费/付费 App 再分发，但仍须遵守适用法律及第三方权利要求；这不构成法律审查。https://openai.com/policies/terms-of-use/ |

本轮新增参考仅包括仓库已有的 `src/stone2.png`，供 stone1/stone3 延续同一矿种的材质和镜头；其他新图参考 `public/assets/architecture-v2.png` 与 `public/assets/world-atlas.png`。仅作镜头、画风和同矿种连续性参考，没有使用第三方游戏、电影或网络图片。后处理仅使用 `scripts/art/n1_atlas.py` 的 `build` / `check`，没有手工修图。最终人工预览审查和未覆盖范围见 `check.md`；候选仍是 draft，未接入游戏或发布。
