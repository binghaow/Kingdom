# Frontier Kingdom — persistent UI and scale requirements

## Product development roles and review workflow

Use these roles as a repeatable review workflow for future feature work. The coordinating agent owns the task end to end and may perform several roles itself. Do not create parallel agents by default; delegate only when the task explicitly calls for it or when a bounded independent review will materially help. Keep one implementation owner for overlapping files.

- **Product manager:** Translate the player's request into a short player-facing outcome, scope, priority, acceptance criteria, and open questions. Preserve the user's intent; explain technical tradeoffs in plain language.
- **Game architect:** Inspect the current implementation before proposing changes. Map affected systems and dependencies, identify reusable features, performance risks, save/network compatibility, and the smallest safe extension. Ask for approval before major architectural changes.
- **Software engineer:** Make incremental, localized changes and preserve existing gameplay. Before implementation, inspect applicable project rules and existing systems. Include App Store readiness in design and code review whenever a change could affect eventual iPhone/iPad distribution; see the mandatory release-compliance gate below.
- **Art director:** Review visual and audio direction for readability, animation/state coverage, scale, faction identity, consistency, and device presentation. Track each shipped asset's source and license. Do not invent, copy, or ship unverified third-party game/movie assets; leave a gap documented when a suitable authorized asset is unavailable.
- **Coordinator / reviewer:** Keep the request, implementation, and acceptance criteria aligned; resolve conflicts before code changes; review the diff and test evidence; state device-only checks that remain unverified.
- **Raster asset alpha gate:** Flattened JPEG or non-alpha source art must be checked for black/white matte and edge halos, then inspected through the actual production script order on contrasting terrain. A raw source preview or passing crop test alone is not visual sign-off. Record the production-render evidence and explicitly name who performed the review; role descriptions do not mean a separate persistent reviewer ran.

For each feature, use this order: clarify the player outcome and acceptance criteria → inspect current behavior and dependencies → agree on a minimal implementation plan → implement → run relevant checks → review regressions and platform/compliance effects → update the relevant documentation. For small safe changes this can be a concise checklist in the task notes; do not create ceremony or extra files without a reason.

## App Store release-compliance gate

The intended product path includes iPhone/iPad distribution through TestFlight and the Apple App Store. Treat this as an engineering constraint during feature design, not as a last-minute packaging step. Track project-wide release gaps in [docs/app-store-readiness.md](docs/app-store-readiness.md). This gate is a risk review, not a legal opinion or a guarantee of App Review approval.

- **Intellectual property and asset provenance:** For code, images, sprite sheets, audio, music, fonts, names, logos, and generated content, record source, creator/provider, license or terms, attribution duties, and whether redistribution in a free or paid app is allowed. Do not use assets extracted from Age of Empires, Warcraft, movies, or other games/media unless the project has explicit redistribution rights. Flag unclear ownership before release; prefer original or documented, compatible assets.
- **Brand and store listing:** Keep the game name, icon, screenshots, metadata, and marketing distinct from third-party brands. Describe genre inspirations without implying affiliation or using another game's protected branding as the product identity.
- **Privacy and data:** Before adding analytics, accounts, chat, multiplayer identity, crash reporting, or other collection, document what data is collected, why, retention, sharing, deletion, and whether it is necessary. Minimize collection, update the privacy notice and store disclosures, and do not claim “no data collected” without checking all code and SDK behavior.
- **User-generated content and multiplayer:** For chat, player names, shared content, or social features, review applicable current Apple requirements for reporting, blocking, moderation, contact/support, and safety controls. Keep server-side abuse and data handling in scope when the feature depends on a backend.
- **Purchases and external services:** If monetization, subscriptions, ads, external account linking, or third-party services are introduced, check current Apple rules and payment/privacy implications before implementation. Do not assume today's free prototype rules cover a future monetized release.
- **iOS product behavior:** Review touch controls, safe areas, orientation changes, audio activation, interruptions/backgrounding, battery/thermal load, memory, network loss/reconnect, accessibility/readability, and supported device versions. A browser preview or desktop build is not evidence of iOS readiness.
- **Release evidence:** Maintain a concise release checklist for asset/license inventory, dependencies/licenses, privacy/data flows, device testing, store metadata, and TestFlight/App Review readiness. Verify current Apple policies at release time; requirements change. Clearly separate code checks from legal review, physical-device results, and Apple approval.

When a feature touches these areas, include its compliance impact and follow-up evidence in the implementation summary. If it does not affect them, state that no new release-compliance dependency was introduced rather than repeating the whole checklist.

## Incremental development

- Before adding a feature, identify existing features, components, and assets that can serve it. Reuse them when they fit and preserve the behavior their current callers rely on.
- When reuse is unsuitable, add the new capability through the smallest isolated extension that meets the request. Preserve existing gameplay, controls, interfaces, and save compatibility unless the user explicitly requests a change to them.
- Keep changes confined to the requested feature. Use existing checks to verify the new behavior and any existing flows it touches. If the feature requires changing existing behavior beyond the authorized scope, explain the concrete impact and obtain approval before making that change.

## UI and scale

For changes to HUD, responsive layout, touch input, selection, camera, sprites or entity scale, apply the project skill [frontier-ui-audit](skills/frontier-ui-audit/SKILL.md). Read its checklist before implementing and record actual validation in docs/. These are the user's standing preferences, not facts to reconstruct from chat history.

- Main battlefield remains central and spacious; keep bottom-command collapse/expand and the army / idle-worker / fleet shortcuts.
- Chinese and English labels, unit portraits, queue counts and resource costs must remain legible inside their panels on phone portrait/landscape, iPad landscape and desktop. Horizontal command scrolling is intentional; accidental clipping or overlapping controls is not.
- The villager building catalogue should favor larger detailed building pictures with slightly smaller readable captions. Keep full costs and descriptions accessible; do not revert to large fixed text rows that squeeze the artwork.
- Keep bitmap aspect ratio, full heads/feet in portraits, and world-camera uniform scale. Adjust tree/building proportions relative to a villager at the same zoom; never solve this by stretching one axis. Trees should visibly exceed human height; houses and civic buildings should look usable by people.
- Keep entity drawing, measurement, picking, outlines, placement and health bars consistent after art scale changes. A larger sprite must not gain a large invisible circular picking area. Do not silently change resource amounts, movement or combat balance to fix artwork.
- Villagers visibly carry logs or a back basket of stone/gold/food; the loaded posture and straps must connect the burden to the back. Preserve harvest/return/delivery semantics, smooth movement and correct facing.
- A browser viewport check is not a physical iPhone/iPad test. Report validation limits honestly. Maintain the existing Site identity and sharing audience.
- Combat audio should use real performed horn calls and human battle cries, with distinct charge/contact/alarm cues. Do not reuse the old wake-up bugle or introduce synthetic approximations. Continuous fighting must not periodically replay an entrance horn; preview controls should remain usable without waiting for gameplay cooldowns.

- Every new feature must run the Frontier UI audit in its affected states, including multi-selection, shortcut hit sizes and text containment on phone, iPad and desktop. Check both expanded/collapsed HUD and both languages; update docs with actual evidence.

- Product destination: a polished iPhone/iPad game for friends, progressing through actual device use, TestFlight and App Store distribution. Browser publication is not proof of a native build or store readiness.
- Reuse suitable existing art for resource cargo. Missing or unsuitable assets must be left absent and listed as gaps; do not ship improvised geometric cargo or invent replacement assets. Generate new assets only when explicitly requested. Resources sit inside the real basket and track its animation frame; do not add floating square markers to villagers.
- Building artwork must not gain floating rectangular team-color blocks. Use integrated existing flags/material colors and health/selection UI; retain stable rally markers.
- Every mobile unit/species needs distinct front, back, right and left source views, including cargo and work variants where silhouette changes. Keep heading, sprite, pick mask, healthbar and guardian muzzle aligned. Run check-directions.cjs and direction-preview.html for new types; preserve established multi-frame side animations and do not silently claim full four-direction animation sets.

- Attack-animation gate (V34): idle/direction wrappers must not replace active combat with standing sprites. Enumerate all mobile definitions and action variants in attack-manifest.json; run check-attack-actions.cjs and attack-preview.html using production script order. Verify four real preparation/release/follow/recovery frames in every direction, actual simulation strike/guardian/heal/launch cues, continuous recovery, complete long weapons/wings, transparent row AND column gutters, pixel picking and shared ground anchors. Noncombat units keep support roles; do not add attacks or alter balance just for animation.

## Performance requirements

- Preserve the current JavaScript/Canvas architecture unless repeatable device measurements show a platform limit. Profile first; do not migrate engines as a substitute for identifying a hot path.
- Keep diagnostics opt-in. Normal play must not run per-frame/per-entity timing wrappers, allocate profiling samples, or display the performance HUD. Single-player `debug` may enable diagnostics; disabling it must remove the HUD and restore uninstrumented hot methods. `?perf=1` remains an explicit profiling override.
- Navigation grids represent static terrain. Unit movement, collision separation, and temporary obstruction must not invalidate them; only terrain or static obstacle changes such as completed/destroyed buildings may do so.
- Cache unreachable and temporarily blocked path goals with a simulation-time retry delay (currently 1.8 s). A fresh order or changed goal cell may retry immediately. Keep this transient cache out of saves and clear entries when units die or reach their goals.
- Keep A* low-allocation: reuse map-sized scratch arrays and numeric heap storage, hoist neighbor offsets, use an admissible octile heuristic for 8-way movement, and avoid per-cell objects/arrays or front insertion during path reconstruction.
- Prewarm land and sea navigation data before active simulation/resume so the first unit command does not pay the full grid build cost.
- Profile update, render, pathfinding, collision, fog, minimap, visible/active entity counts, and both device/effective canvas DPR when diagnostics are enabled. Confirm findings on physical iPhone/iPad; desktop browser or Node measurements are not device evidence.
- After performance changes, run `node check-all.cjs` and `npm run build`; record device measurements, scenario, and remaining unverified work in `docs/performance-audit.md`.

## 发布前常规检查（必须）

每次发布（包括部署预览链接、TestFlight 构建、合并到发布分支）之前，都必须按顺序运行并全部通过：

1. `node check-all.cjs` —— 单机与联机回归。
2. `npm run build` —— 生成 dist。
3. `node check-artifact.cjs` —— 构建产物、Worker 与 D1 声明。
4. `npm run release-check` —— 性能与行为门槛，约 8 分钟（`-- --quick` 约 4 分钟，只用于开发中自查，不能代替发布前的完整运行）。它依次做：
   - **单位路径分析**：开局脚本对局、200 单位会战、围攻被城墙围死的目标、160 单位大编队一次下令四个场景，统计 A* 次数、展开节点 p50/p95/max、单次耗时、失败/重试率、不可达缓存命中、首段受阻被丢弃的路线，以及**卡住单位检测**（有移动意图、未在战斗或工作、4 秒内位移 < 16 像素），列出位置、指令与原因分类。
   - **模拟开销**：50/100/200/400 单位每步均值/p95/max 与碰撞、索敌、寻路、迷雾分项，计算增长指数并标出超线性增长。
   - **渲染帧耗时**：Playwright 打开真实游戏（`?perf=1`），桌面 1280×720 与手机 393×852，约 200 单位会战，取帧间隔与 render/scene p50/p95，以及每帧 drawImage 与带 filter 的绘制次数。这是无 GPU 的 headless 上限，只用于提交之间比较，不是真机帧率。
   - **服务器与联机**：每次轮询的服务端 CPU、响应体积（gzip 前后）、4 席位同时到达时的冲突重算（实测）、下令到首次位移的模型时延（RTT 40/100/200 ms、D1 20 ms 为假设值）。

规则：

- 结果与 `scripts/release/baseline.json` 中同一模式的基线比较（`--quick` 重复次数少，门槛放宽 1.5 倍）。耗时类（多次运行的中位数）相对基线回退超过 20% 判 FAIL、超过 15% 判 WARN；headless 渲染帧间隔与 A* 总耗时为 30%/20%；HUD 的 render p50 只取到少量帧，超过 50% 判 WARN、2.5 倍才判 FAIL；p95 类（服务端每次轮询 CPU、模拟步 p95）样本少，翻倍才判 FAIL、超过 30% 判 WARN，FAIL 主要由均值项承担；确定性计数（A* 次数、展开节点、首段受阻丢弃次数、响应体积）超过 15%–20% 判 FAIL；每帧 drawImage 与带 filter 的绘制次数超过 35% 判 FAIL；增长指数上升超过 0.25 判 FAIL；卡住单位数超过“基线 + 20%（至少 +1）”判 FAIL；冲突重算上升 0.5 次/请求或出现因冲突失败的请求判 FAIL。噪声大的项取多次运行的中位数。
- **任何 FAIL 都不得发布。** 先修复，或确认是有意的行为/性能变化后在同一台机器上用 `npm run release-check -- --update-baseline`（以及 `-- --quick --update-baseline`）更新基线，并在提交说明里写明原因。WARN 需在发布说明里解释。
- 每次运行在 `docs/release-reports/<日期>-<提交号>.md` 与 `.json` 生成报告（结论在前）。**发布说明必须附上该报告**（链接或全文），以及上面四条命令的结果。
- 基线只在同一台机器、同一模式（完整/快速）之间可比；换机器后先在旧提交上重建基线再比较。
- 诊断仍须 opt-in：检查脚本只在测试实例上挂钩，或在带 `?perf=1` 的测试页面里注入计数，不修改游戏文件，正常游玩路径不得因此增加任何计时或采样。

仍需真机验证（release-check 不能代替）：

- iPhone 17 / iPad 实机 `?perf=1` 的帧率、render/scene 分项、长时间对局的发热与降频。
- Safari/WebKit 的 Canvas 渲染（尤其 `ctx.filter` 的开销）与内存；release-check 只测 Chromium。
- Cloudflare Worker / D1 线上 CPU、isolate 复用率、D1 往返、真实冲突率；跨设备、弱网、丢包、后台恢复。
- 触控操作、HUD 布局与中英文文本（按 Frontier UI audit 执行）。
