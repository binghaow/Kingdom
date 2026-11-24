# 下一版：删除旧联机与服务器模拟（步骤清单）

状态：**计划，3e 版不执行**（2026-11-23，分支 `feature/p3e-default`）。3e 起新联机（锁步）是大厅默认，旧联机（服务器权威轮询）只作为“旧联机（备用）/ Classic online (backup)”勾选项保留**一个版本**。下一版按本清单删除。代码里待删除的位置都标了 `LEGACY`。

## 0. 删除前的条件（全部满足才动手）

1. 3e 上线后至少 1 周：新联机没有不同步上报、没有“等待网络…”卡死（设计稿第 8 节 3e 验收）。
2. 线上日志里旧联机房间（`config.lockstep` 不为 true）的新建数量接近 0，或用户确认不再需要备用。
3. 进行中的旧联机房间会在删除那次发布后失效（房间有效期 6 小时）。发布说明里写明“旧联机房间请在升级前结束”。

## 1. 服务器（`server/service.cjs`）

按顺序删除，每一步都跑 `node check-lobby.cjs && node check-lockstep.cjs`：

| # | 删除 / 修改 | 说明 |
|---|---|---|
| 1 | `advance()`、`commands()` 两个函数 | 标了 `LEGACY` |
| 2 | `start()` 末尾的 `new K.NetworkSim(...)` 分支 | 改为：不带 `lockstep` 的建房请求一律当作锁步（`config()` 里 `lockstep:true` 成为固定值，或直接去掉这个字段）。旧客户端（Service Worker 缓存的旧页面）发来的无 `lockstep` 建房请求也得到锁步房间，旧页面会因为不认识而无法开局——发布时 bump SW 缓存版本，让所有页面先更新 |
| 3 | 请求处理里 `room.state` 相关三处：`sim=advance(...)`、`body.commands` 分支、`room.state=K.networkPersistent(sim)`、返回 `response.view` 的 `networkSnapshot` | 都标了 `LEGACY`。`commands` 字段改为直接 400 |
| 4 | `Store.commit` 的 1.5 MB 上限、`encode/decode` 的 gzip | 房间负载只剩大厅数据（几 KB），可以去掉压缩，或保留压缩但下调上限。改格式前确认没有旧格式行（6 小时后全部过期） |
| 5 | `require('../public/network-commands.js')` 及 `execute`、`orderWeight` 等的导入 | 服务器不再执行指令。`Problem`、`clean` 两个小工具移到 `server/` 下自己的文件 |
| 6 | `require('../public/network-model.js')` | 服务器只用它做 `K.nations / K.maps / K.difficulties` 的取值校验。换成一个只含这三张表的小模块（或从 `public/` 的数据文件生成），**Worker 包不再打包整个模拟**（体积和冷启动时间都会明显下降，删除后在报告里给出前后数字） |
| 7 | `/api/health` 的 `mode:'server-authoritative'` | 改为 `'lockstep'` |
| 8 | `module.exports` 里的 `execute, advance, start` | 先 `grep` 确认只有将被删除的检查在用 |

保留：大厅（`/api/rooms`、短码、开放列表）、席位令牌、开局参数生成、存档恢复（`restore*`）、`server/lockstep/*` 全部。

## 2. 客户端（`public/network-ui.js` 等）

| # | 删除 / 修改 | 说明 |
|---|---|---|
| 1 | 大厅勾选项 `#net-legacy`“旧联机（备用）”及其 locale 条目 | 建房请求固定 `lockstep:true` |
| 2 | `poll()` 旧轮询循环（标了 `LEGACY`）、`pending`/`nextSeq`/`lastResult` 的旧指令队列、`schedule()` 的轮询节奏、`recordFail` 里只针对轮询的诊断 | 锁步房间开局后本来就不走 `poll()`；大厅阶段仍需要轮询房间状态——**保留大厅阶段的房间轮询**（`status==='lobby'`），只删开局后的部分 |
| 3 | `enter(data)` 里处理 `data.view` 的分支 | 视图只来自本地锁步模拟（`src/net/browser.js`） |
| 4 | 开放房间列表的“旧联机（备用）”标签、服务端 `lobby.cjs` 的 `lockstep` 字段 | 列表全部是新联机，不再需要区分 |
| 5 | **保留** `KingdomNetworkClient`（`public/network-client.js`） | 它是锁步模式的渲染副本，不是旧联机专用 |
| 6 | **保留** `public/network-model.js` 里的 `NetworkSim / networkPersistent / networkHydrate / networkSnapshot` | 锁步客户端建模拟、5 分钟快照、生成视图都在用 |

## 3. 检查与工具

| # | 处理 | 说明 |
|---|---|---|
| 1 | `check-network.cjs`、`check-netcode.cjs` | 只测服务器权威路径的部分删除；其中仍然有用的（指令规则、视图过滤、`networkSnapshot` 体积）移到 `check-lockstep.cjs` 或保留为模型层检查。从 `check-all.cjs` 列表同步更新 |
| 2 | `scripts/netcode/*`（harness、server-cost、latency-model、live-multi-town、trace-hash） | 服务器每次轮询的成本模型，删除 |
| 3 | `scripts/release/net-cost.cjs` 和 `release-check` 的“服务器与联机延迟”一节 | 删除这一节，并在**同一台机器上**用 `npm run release-check -- --update-baseline`（及 `--quick --update-baseline`）重建基线，提交说明写明“删除旧联机，去掉服务器轮询 CPU 项”。可以换成锁步中继的成本项（`scripts/lockstep/harness.cjs` 的每请求 CPU、带宽） |
| 4 | `scripts/replay/live-online.cjs`（旧联机冒烟）、`scripts/lockstep/browser-duel.cjs --legacy` | 删除 `--legacy` 分支；发布前冒烟改为只跑新联机 |
| 5 | `AGENTS.md`“发布前常规检查”里提到旧联机冒烟 / 服务器轮询的条目 | 同步更新 |

## 4. 数据库

- `multiplayer_rooms.payload` 里不再有 `state`。不需要迁移：旧房间 6 小时后自然过期并被 `Store.cleanup` 删除。
- 不删表。`lockstep_*` 表不受影响。

## 5. 验收（删除那一版）

- `node check-all.cjs` 全过（已删除的检查从列表去掉）、`npm run build`、`node check-artifact.cjs`；
- 完整 `npm run release-check` 0 FAIL（基线按第 3 节第 3 条重建并说明）；
- 新联机浏览器对战 ≥ 60 秒一致（`scripts/lockstep/browser-duel.cjs`）、存档快照恢复一次（`scripts/lockstep/browser-restore.cjs`）；
- Worker 包体积、冷启动前后对比（第 1 节第 6 条）；
- 用旧页面（未更新的 SW 缓存）打开时能提示刷新，不会白屏。
