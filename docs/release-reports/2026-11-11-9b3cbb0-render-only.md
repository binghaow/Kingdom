# 发布前常规检查 2026-11-11 · 9b3cbb0（工作区有未提交改动）

## 结论：**PASS**

- 模式 full，分支 `feature/realistic-walls`，基线 fb70bd1（2026-11-11，full），耗时 370 秒，Node v22.23.4，2 核；机器速度校准 50.76 ms（基线 32.78 ms，耗时项按系数 1.55 校正后再比较）。
- 10 项门槛：PASS 10 · WARN 0 · FAIL 0。任何 FAIL 都不得发布（AGENTS.md）。

## 渲染帧耗时（无 GPU 的 headless Chromium 上限，不等于真机）

headless Chromium --disable-gpu（CPU 软件光栅，无 GPU），2 个共享 CPU 核：只作提交之间的回退信号，不是真机帧率。

| 视口 | 单位/可见 | DPR 设备/实际 | 帧间隔 p50/p95 ms | FPS | render p50/p95 | scene p50/p95 | update p50/p95 | 每帧 drawImage / 带 filter 绘制 |
|---|---|---|---|---|---|---|---|---|
| desktop 1280x720@1 | 203/275 | 1/1 | 3533.2/3983.1 | 0.3 | 12.1/187.9 | 11.5/187.1 | 23.3/69.9 | 465.5 / 39 |
| phone 393x852@3 | 203/254 | 3/1.5 | 2624.9/3041.6 | 0.4 | 6.6/62 | 5.8/61.6 | 22.3/65.7 | 420 / 42.3 |

## 全部门槛

| 状态 | 类别 | 项目 | 当前 | 基线 | 说明 |
|---|---|---|---|---|---|
| PASS | 渲染 | desktop 帧间隔 p50 | 3533.2ms | 2383.3ms |  |
| PASS | 渲染 | desktop 帧间隔 p95 | 3983.1ms | 2849.9ms |  |
| PASS | 渲染 | desktop render p50 | 12.1ms | 8.6ms |  |
| PASS | 渲染 | desktop 每帧 drawImage | 465.5 | 453 |  |
| PASS | 渲染 | desktop 每帧带 filter 的绘制 | 39 | 39 |  |
| PASS | 渲染 | phone 帧间隔 p50 | 2624.9ms | 1999.9ms |  |
| PASS | 渲染 | phone 帧间隔 p95 | 3041.6ms | 2416.5ms |  |
| PASS | 渲染 | phone render p50 | 6.6ms | 6.8ms |  |
| PASS | 渲染 | phone 每帧 drawImage | 420 | 384.8 |  |
| PASS | 渲染 | phone 每帧带 filter 的绘制 | 42.3 | 38.8 |  |

## 仍需真机验证（本检查不能代替）

- iPhone 17 / iPad 实机 `?perf=1` 帧率、render/scene、发热与降频（headless 无 GPU，数字只用于提交之间比较）。
- Safari/WebKit 上的渲染与内存（这里只测 Chromium）。
- Cloudflare Worker / D1 实际 CPU、isolate 复用率、D1 往返和真实冲突率；跨设备、弱网、丢包、后台恢复。
- 触控操作、HUD 布局与双语文本（Frontier UI audit 另行执行）。
