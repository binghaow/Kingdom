# v40 · 手机全屏与界面不遮挡（第 10 项）+ 联机重连诊断

分支 `feature/gameplay-ai-roster`。界面改动，不改玩法、不改联机协议（`NETWORK_PROTOCOL` 仍为 2）。

## 改了什么

- **全屏按钮**（`public/screen-fit.js` / `screen-fit.css`）：开始菜单（“多人联机”按钮下方）与暂停设置各一个“⛶ 全屏”。支持 Fullscreen API 的环境（安卓、iPad Safari、桌面）直接切换全屏；不支持的（iPhone Safari）弹出引导：“点 Safari 的「分享」→「添加到主屏幕」，之后从主屏幕图标打开即为全屏。”从主屏幕打开（`display-mode: standalone/fullscreen` 或 `navigator.standalone`）时，按钮、地图栏 ⛶ 与引导全部隐藏。地图栏原有 ⛶ 改用同一逻辑。
- **Web App 声明**：`manifest.webmanifest` 已有 `display: standalone`、192/512 图标；新增 `display_override: ["fullscreen","standalone"]`，`theme_color` 与页面 `<meta name="theme-color">` 统一为 `#172c35`。`index.html` 已有 `apple-mobile-web-app-capable`、`apple-mobile-web-app-status-bar-style: black-translucent`、`apple-mobile-web-app-title`、`apple-touch-icon`、`viewport-fit=cover`；补 `mobile-web-app-capable`。Service Worker 缓存名改为 `frontier-coast-20261112-v40`，新文件进 SHELL。
- **debug 诊断栏**：移到标题栏下方、safe-area 内；手机或矮窗口（宽 < 900 或高 < 500）默认收起为两行，点一下展开/收起（展开时最高为可视高度减 140 px，可滚动）。
- **兵种信息面板**：横屏矮窗口（高 ≤ 430）宽度限制为 min(380 px, 44vw)、最高 66 px 可滚动；竖屏高 ≤ 700 时最高 84 px。
- **弹窗**：所有打开的 dialog 最高为可视高度 − 16 px；联机面板标题栏（含 × 关闭）滚动时吸顶，矮窗口下也能关闭。
- **联机状态条**：横屏矮窗口移到右上角、标题栏下方，不再横跨中间。
- **重连诊断（beta 反馈）**：重连提示显示最近一次失败的原因与距上次成功的秒数，例如“正在重连，暂不能下达指令 · HTTP 503 · 7s ⓘ”；点开是诊断窗（HTTP 状态、错误信息与响应片段、距上次成功、连续失败次数、首次/最近失败时间、房间号、协议、游戏时间、浏览器 UA），可复制，方便截图。请求超时（12 秒）、网络错误、服务器返回非 JSON、超过 4 秒无回应都分别标出。只改客户端 `network-ui.js`，服务器与协议未改。

## “开局卡在 00:07 正在重连”的原因（已在本地复现并修复）

用本地全栈预览（`node preview.cjs`，同一 `server/service.cjs`）开一个有电脑补位的联机房间：游戏时间到 00:07 后每次轮询都返回 HTTP 503，服务器日志 `Multiplayer service failed: Cannot read properties of undefined (reading 'get')`。堆栈指向 `dynasties.js` 的 `aiExpertExpansion`：服务器每次轮询用 `networkHydrate` 重建模拟（不跑构造函数），构造函数里创建的 `aiExpansionGoals` / `aiExpansionReady` 不存在，电脑第一次思考（约 7 秒）就抛错。v39 基线（e5a4adf）同样复现——这是已有缺陷，不是 v40 引入的；两浏览器纯真人房间不会触发（没有电脑座位）。

修复：`aiExpertExpansion` 开头按需重建这两个缓存（`??=`）。之后同一房间 60 秒内 0 次失败，时钟正常前进。`check-v40.cjs` 新增回归：按服务器方式每次轮询 hydrate、普通与专家电脑各跑 30 秒游戏时间（未修复时此项失败）。线上 Worker 需部署新构建后才生效；本次未部署。

## 验证证据（Playwright，Chromium headless，非真机）

脚本只读 DOM 几何、用真实按钮操作；结果全文在 `docs/v40-screen-fit-layout.json`。“中央”= 可视区中间 40%×40%。

| 视口 | 状态 | 改前 | 改后 |
| --- | --- | --- | --- |
| 852×320（横屏 Safari 非全屏） | debug 栏遮中央 | 51% | 0% |
| 852×320 | 多选信息面板遮中央 | 25% | 10% |
| 852×393 | debug 栏遮中央 | 27% | 0% |
| 393×660（竖屏 Safari 非全屏） | debug 栏压住小地图/右侧按钮栏/暂停 | 是 | 否 |
| 852×393 / 852×320 | 联机房间弹窗 × 可见 | 否（滚到底后看不到） | 是 |
| 四种视口 | 弹窗是否超出可视区 | 否 | 否 |
| 四种视口 | 联机状态条/重连条遮中央或常用按钮 | 0% | 0% |

亲眼看过的截图（scratchpad，未提交）：852×320 debug+多选面板、393×660 重连诊断窗、393×852 重连提示、393×852 iPhone 全屏引导、1280×720 开始菜单全屏按钮。

## 未验证

- 真机：iPhone 17 Safari（引导文字、safe-area、添加到主屏幕后隐藏按钮）、iPad Safari 的元素全屏、安卓 Chrome 全屏；Safari 非全屏时真实可视高度随工具栏变化。
- 英文界面下的同一组截图（文字已加英文，检查 `check-locales` 通过）。
- 线上 Cloudflare Worker 是否还有其它报错（本地只能复现上面这一个）；需要 beta 玩家用新诊断窗截图。
