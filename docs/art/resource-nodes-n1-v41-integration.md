# N1 金矿 / 石矿接入检查

日期：2026-11-12

## 接入内容

- 生产图集：`public/assets/resource-nodes-n1-v41.png`，从 `docs/art/drafts/n1-v41/resource-nodes-n1-v41.png` 原样复制；授权与生成记录见草稿 README。
- `public/clarity-art.js` 根据 `amount / maxAmount` 在富集、约 60%、约 25%、耗尽四个格之间切换。金矿与石矿各自使用图集的一行，单个资源点每帧仍只调用一次 `drawImage`；不创建额外离屏画布或逐帧对象。
- 图格按 512×512 源区域绘制到 166×166 世界空间，基线位置使用图集接地点 `(256, 430)`。`public/precision-picking.js` 同步了资源点测量尺寸，并把资源阶段放入像素遮罩缓存键，避免耗竭后仍沿用富集图形的拾取轮廓。
- `public/sw.js` 预缓存新图集并递增缓存版本，避免安装版继续使用旧资源列表。
- `public/presentation-preview.html` 与 `.js` 增加同图集四阶段展示和矿脉拾取轮廓检查，沿用生产脚本顺序。

## 检查结果

- `npm test`：通过；完整游戏回归套件退出码 0，覆盖资源交付、AI、联网、移动、战斗、资产与离线缓存等现有系统。
- `node check-resource-layout.cjs`、`node check-economy.cjs`：通过，地图资源均衡与采集/交付逻辑未变。
- `npm run build` 与 `node check-artifact.cjs`：通过。构建优化器重打包了 15/15 张 PNG，合计节省 6.34 MiB。
- `npm run release-check` 完整模式：0 FAIL；2 WARN。性能基线来自 Linux / Node 22，本机是 Windows / Node 24，不能直接比较；本机缺少 Playwright，标准 headless 渲染采样未运行。报告见本轮 release-check 输出。
- 素材草稿的自动图集验收及 Codex 对草地、海水、深色背景和 3× 边缘预览的人工检查为 PASS（详见 `docs/art/drafts/n1-v41/check.md`）。Claude v41 的构筑、单位和战场变更视觉记录见 `docs/visual-pass-v41.md`。

## 限制与性能说明

本环境的工作区本地 HTTP 预览无法通过浏览器访问，且 release-check 没有可用 Playwright，因此这次没有取得“游戏运行中、生产绘制顺序”的实战截图，也没有可比的浏览器帧耗时数据。无法把图集背景预览冒充为完整游戏画面审查。代码路径保持每资源点一次绘图，没有增加渲染调用数；目的地绘制框从旧金矿的 82 px 加宽至 166 px，具体设备帧耗时仍待支持浏览器的环境和 iPhone/iPad 实机验证。

此素材不引入运行时依赖、账号、数据收集或新商业服务；素材再分发条款记录在 N1 README 中。代码检查不能替代法律审查或真机 App Store 准备。
