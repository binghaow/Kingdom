# 真机一致性检查页（consistency.html）

用途：在 iPhone / iPad / Safari 等真机浏览器里检查“这台设备算出来的游戏结果，是否和电脑上一模一样”。这是将来锁步联机（P3）的前提：所有玩家的设备必须一步不差地算出同样的战局。

## 给玩家的 3 步说明

1. 用 iPhone / iPad 的 Safari 打开 **https://<站点>/consistency.html**（就是游戏网址后面加上 `/consistency.html`）。
2. 不用点任何东西，等 10–30 秒。页面会依次回放“战斗”“建造”“经济”三段录像，最上面出现大字：
   - **✅ 全部一致 · All consistent**：这台设备没问题；
   - **❌ 不一致 · Mismatch**：下面会写明是哪段录像、从第几秒开始不同、差在哪类数据（单位 / 建筑 / 资源点 / 经济科技）。
3. 点 **“复制结果 · Copy result”**，把复制的文字粘贴发给开发者（微信、邮件都可以）。如果提示无法复制，就展开最下面的“设备信息与原始结果”，长按文字手动复制。

注意：页面会用满一个 CPU 核心几秒钟，手机稍微发热属正常；中途不要切到别的 App（Safari 会暂停页面，回来后会继续）。

## 它做了什么

- 页面按 `index.html` 的顺序加载同一份模拟脚本（`engine.js` … `network-model.js`），再加载模拟会读取的 `art-profiles.js`（siege.js 用其中的建筑占地尺寸判断阻挡，属于模拟状态的一部分）、P1 打包的 `kingdom-core.js` 和页面脚本 `consistency.js`。不加载任何美术、声音、界面脚本，普通游戏界面里也没有入口。
- 标准录像在 `public/consistency/`（P1 录像格式 version 1，见 `docs/p1-foundations.md` 第 2 节）：

| 录像 | 地图 / 国家 | 难度 | 时长 | 覆盖内容 |
|---|---|---|---|---|
| battle | coast_s，英 vs 法 | normal | 40 s（800 步） | 双方各 16 名步兵/弓手在两城之间交战：攻击前进、点名攻击、分兵移动、推进敌城；电脑对手同时运行 |
| build | cliff_s，中 vs 日，无迷雾 | easy | 45 s（900 步） | `debug` 口令（无限资源、建造约 1 秒）、房屋/兵营/农田/铁匠铺/市场/靶场/马厩/箭塔、一段城墙（constructLine）、晋升时代、农田耕作、兵营训练与集结点 |
| economy | lake_s，西/奥/俄三方 | hard | 60 s（1200 步） | 村民分采食物/木材/黄金/石头、集结点指向树、持续训练村民、建房和市场、研究“高效采集”、空闲村民再分配 |

- 标准答案 `public/consistency/expected.json`：由 **Node 回放这些录像**（不是录制时那一次运行）得到，每 20 步（1 秒游戏时间）一个校验值，并带分项 `parts.units / buildings / nodes / economy`。页面逐个检查点比较；第一处不同时再比较分项，指出差异类别（分项都相同则是随机数状态或模拟时钟不同）。指令返回值（建造得到的建筑编号、错误提示等）也逐条比较。
- 回放在浏览器里每次跑 40 步后让出一帧，手机不会卡死；进度条显示进度。
- 复制的结果包括：每段录像的结论、第一处不同的步数和类别、期望/实际校验值、最终校验值、耗时；浏览器 UA、平台、屏幕、触点数、核数、内存，以及一个 Math 函数指纹（7 个三角/指数函数结果的哈希；若录像不一致，可看出是否因为该引擎的 Math 末位与 V8 不同）。

## 本机结果（Chromium，headless，2 核虚拟机）

`node check-consistency-page.cjs`：手机竖屏（390×844，DPR 3，触屏）和桌面（1280×800）两种配置都显示 **全部一致**；回放耗时 battle 约 1.9 s、build 约 1.5 s、economy 约 2.0–2.3 s，整页约 6 s。Chromium 与 Node 同为 V8，这只证明页面和标准答案是对的；**Safari / iPhone / iPad 需要用户按上面 3 步真机打开**（本机没有 WebKit）。

## 维护

- 检查：`check-consistency-page.cjs`（已加入 check-all）——页面脚本顺序与 index.html 的模拟链一致；Node 回放每段录像，与 expected.json 的每个校验值和分项、录像自带的校验值、最终值全部相同；录像时长 30–60 s 且覆盖 add/order/construct/constructLine/train/research；Chromium 手机竖屏与桌面打开页面显示全部一致、无页面错误、无横向滚动、复制按钮有反馈。
- 部署：`npm run build` 原样复制 `public/`，`check-artifact.cjs` 断言 `dist/client/consistency.html`、`consistency.js`、`consistency/*.json` 存在。上线后网址为 `https://<站点>/consistency.html`。
- 玩法有意改动导致校验值变化时：`node scripts/replay/make-device-fixtures.cjs` 重新生成录像和标准答案（`--dry` 只比较不写入），并在提交说明里写明理由（与 P1 fixtures 相同的规则）。
- Service Worker：`sw.js` 未改；页面的 json 用 `cache: 'no-store'` 读取，模拟脚本走 SW 的“网络优先”，所以更新部署后打开即为新代码。
