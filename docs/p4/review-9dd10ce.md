# 9dd10ce strict review — 2026-11-28

Reviewer: Codex (single coordinating reviewer; no separate agents). Scope: exactly 9dd10ce, whose parent is Android draft 314672c. Original checkout gemini/p4-lockstep-worker has an uncommitted public/kingdom-commands.js; untouched. Work performed in independent worktrees. Remote main verified d1dfb30.

## Findings in original commit (release-blocking until fixed)

1. **P1 — inconsistent Worker saves.** prepareSave obtains an exact checksum, then releases its saving guard. saveOnline can await the relay recording before makeSave reads the live proxy. nextTurn/step/AI/log can advance; makeSave silently falls back to an older hashLog hash. A well-shaped save can therefore have mismatched turn and hash. The synchronous desync save path also skips prepareSave. Reproduction: checkpoint at turn 10, advance to 11 while awaiting recording; original save claims turn 11 with the turn-10 hash. Fix: capture a stable checkpoint cursor/AI/header/log reference, filter commands at that cursor, capture the corresponding snapshot, and use it across asynchronous work. Existing checksum events include exact checkpoint AI metadata for the desync path. No new checksum pass per frame; no growing full-log copy per checksum. Never substitute a stale hash for a newer cursor. Save format/version remain unchanged; main-thread saves retain their existing synchronous path.
2. **P1 — prediction poisons incremental mirror.** detachForPrediction shallow-copies entities but shares spellCooldowns and other nested mutable state. The real castSpell(...,'ward') mutates the shared cooldown map. When the authoritative next frame has no corresponding change (e.g. rejected speculative command), no patch repairs it. Regression reproduces a stale ward:30 cooldown after applying an unchanged frame. Fix: lazily detach nested plain-data graphs only on first local prediction, preserving sparse paths; normal frames still reuse pristine entity objects. Temporary interpolation coordinates are restored in finally even if capture throws.
3. **P2 — generic delta type transition throws.** A truthy scalar cached for a field followed by an object executes `'__j' in 1`, throwing TypeError and stopping the frame stream. Fix: object guard before the in operator. Added boundary test; same-count key replacement/deletion also tested.
4. **P1 — fatal Worker failure leaves RPCs alive.** onerror/non-RPC errors notify the UI but leave pending save/checksum promises, timers and transport active. stop also cannot flush waitIdle while busy remains true. Fix: a single fatal shutdown sets stopped/not-ready/not-busy, stops transport/timer/worker, rejects pending RPCs and wakes idle waiters. Synchronous postMessage failures are contained. Added pending-save crash check.

## Determinism / compatibility / default path

Simulation commands, fixed tick order, balances, RNG and serialized save schema were not changed. Worker host reuses the same LockstepClient and command rules. New save checkpoint metadata is only intra-page/Worker data; relay requests and persistent v1 saves stay the same. Snapshot loading is checksum-verified and async-compatible. New regression checks include reference AI-takeover/release state at each checksum cursor, not just the final hash.

?simWorker remains off by default, with explicit ?simWorker=0 override and the existing stored preference. Single-player worker controller and online proxy stay separate. Default main-thread simulation changes in 9dd10ce are diagnostics sink indirection and the existing callback receiving one optional extra argument; measured release gates are still required rather than calling that zero CPU overhead. Profiling remains opt-in; checks verify no diag/sysProfile when disabled and disabling it after use. No claims of physical-device latency or main-thread <=8ms target attainment.

## Review of docs/p4/progress.md, third segment

It correctly discloses the Android ancestry, default-off flag, incomplete check-all/release-check, Windows resilience failures, headless-vs-device distinction and no APK rebuild. Those are useful historical measurements, not release approval. Its shallow-detach/pristine-mirror and exact-save claims needed the fixes above. Its frame benchmark measures transport/apply, not prediction-copy overhead, busy-game rendering, Safari or 1000-unit budget compliance. Keep the original measurements as historical evidence; do not relabel as current candidate measurements. New results and limits belong here and the final release report.

## Compliance

No new third-party libraries, permissions, analytics, identities, remote endpoints, art or audio are introduced. Worker is same-origin; existing transport and local online-save storage continue. Profiler data stays local. This is a browser release review, not store approval. Android draft assets, manifests, packages, telemetry and dashboard must NOT enter main via branch ancestry.

## Checks so far

- New check-p4-review.cjs: all six boundary checks PASS after fixes. Before fixes: scalar/object crash, real spell mirror contamination, async save cursor mismatch and unprepared save mismatch reproduced; fatal RPC shutdown lacked cleanup.
- check-lockstep-worker.cjs: PASS real worker_threads bundled Worker, 220 turns / 22 hashes / 4 command results / 4 control events / 17 expanded views, final 56f3ab93; verified snapshot load/reject + 40 more turns, 6471ba90; reference checkpoint AI/turn checks and profile off/on/off pass.
- check-sim-worker.cjs --node-only: four fixtures / 1200 steps each / recorded checksums and final mirror hashes PASS (before final capture-finally comment-only/safety update); rerun through check-all on clean candidate is required.
- Full ordered check-all, build, artifact and release-check are NOT claimed passed by this review note. Main and public site unchanged.

## Release constraints

AGENTS requires production UI/performance review, and an iPhone/iPad Safari >=8-minute / >=100-population check for cache/memory strategy changes. This commit changes Worker snapshot caches, mirror lifetime and copying; treat that requirement as applicable. Headless tests do not satisfy it. User has been asked whether relevant device evidence is available. Other device follow-up: Worker initialization/failure, background/lock-screen resume, >25-minute multiplayer, weak network, mixed worker/main peers, save/restore, memory/thermal behavior, both-language HUD and touch controls. Any unpassed mandatory gate prevents merging main or publishing.
