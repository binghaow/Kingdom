# Architecture and AI Roadmap

## Runtime overview

The game remains a browser JavaScript simulation with a fixed-step simulation and Canvas renderer. Simulation decisions run on the existing AI timer, not the render loop. The base game ticks at 20 Hz; the difficulty layer schedules each computer team using its profile's `think` interval. Raids and scouting have their own slower timers.

The AI is extended through the existing class chain rather than a parallel subsystem:

1. `engine.js` owns simulation, training, gathering, combat and base economy.
2. `empires.js` handles per-team resource assignments, fishing, build plans, unit production and trade-related buildings.
3. `coalitions.js` adds per-team calls, allies, trade and raids.
4. `dynasties.js` adds difficulty profiles, age pacing, tech, heroes and periodic strategic decisions.
5. `worlds.js` supplies explored-resource filtering, fog-aware views, scouting and map-specific attacks.
6. `frontiers.js`, `siege.js`, `fortification.js` and later gameplay wrappers add their existing late-era and defensive capabilities.

`check-all.cjs` runs simulation regression suites; `check-ai-phase1.cjs` covers the new AI decisions and a small Node timing sample.

## Current AI audit

### Already present

- Six difficulty profiles with configurable think, economy, combat, unit-cap, technology pace, raid size and raid cadence.
- Team-specific worker/resource assignments, fish-boat assignment, town/house/economic/military infrastructure, unit training and technology research.
- Fog-aware resource filtering and visible enemy targeting in the world simulation; basic scouting.
- Periodic attacks against known enemy towns and basic naval attacks against known hostile docks.
- Age gating for KC guardians and existing national units, technologies and heroic rewards.
- Automatic unit-level target acquisition from the preceding combat-AI task.

### Phase 1 gaps addressed

- Fixed worker-to-resource assignment did not respond to stockpile shortages. Workers now rebalance when a resource is surplus and another is scarce, while preserving active construction/repair and adding a 45-second retask cooldown.
- Military production selected randomly from eligible units and could repeatedly choose an unaffordable option. It now selects affordable, age/nation-legal units by the current role deficit and counts queued units in that balance.
- No threat-driven defensive building existed. Difficulty profiles now configure a small tower cap; a tower is considered only when a known hostile unit threatens an important owned building or that building was recently damaged. Placement still uses existing terrain, resource and building validation.
- Expert previously received +22% gathering, +6% damage, faster training and faster age pacing. Those four bonuses are normalized to standard values; its raid interval, formation size and reactive defense remain stronger.

### Limits and constraints

- AI planning remains distributed through override layers. There is no separate strategic-goal object or shared threat ledger yet; adding one would be a later architectural step.
- Income rates are not recorded as a time series. Phase 1 estimates need from current stockpiles and upcoming age costs.
- Resource expansion still uses the existing local building plan. Defense is limited to towers; walls are not part of this phase.
- Expert expansion now uses a small transient per-team goal: select an explored wood/stone site, move one available villager there, then build an existing lumbercamp or quarry. A five-minute cooldown limits outpost spam. Age IV+ production receives a configurable Expert-only share target; no economy, damage, health or training bonuses are added. The current town-age and high-tech building plans are reused.
- Attack selection still uses existing raid logic. Flanking, retreat scoring, encirclement, multi-front operations, adaptive counter production, naval landing plans and deliberate dragon assaults are not implemented.
- The Node benchmark is a repeatable algorithm check, not an iPhone/iPad performance measurement.

## Prioritized roadmap and estimated complexity

| Phase | Scope | Complexity | Performance / design risk |
| --- | --- | --- | --- |
| 1 · Reliable basic AI — complete | Adaptive idle/overassigned worker allocation, affordable role-balanced production, reactive local tower defense, retain existing grouped raids | Medium | Periodic node/unit/building scans; scheduled on strategic AI ticks only |
| 2 · Strategic AI | Goal scoring for economy, tech, military, expansion and defense; track income/idle time; value and danger scoring for resource sites; research priorities | Medium–high, roughly 3–5 focused days | Avoid rescanning every map cell; cache candidate sites and recalculate on slower intervals |
| 3 · Adaptive strategy | Enemy-composition counters; safe territorial/resource expansion; wall/chokepoint defense; naval economy and objective planning; dragon risk/reward evaluation | High, roughly 1–2 weeks | Fog-safe remembered intelligence, path reachability and multi-domain balancing |
| 4 · Expert tactics | Harassment, flanks, retreats, diversions and multi-front operations | Very high, roughly 2–3 weeks plus tuning | Group formations/path congestion, repeated target changes and CPU spikes; requires scenario and device profiling |

## Phase 1 test evidence

Run `node check-ai-phase1.cjs`. It checks deficit-driven worker reassignment, preserved build orders, deterministic composition, inability to queue unaffordable units, difficulty configuration, visible-threat defense, fog-safe gathering, fixed-seed repeatability and strategic update time at several entity counts.

On this workspace's Node v24.19.0, the measured `aiPlayer` decision call was 0.26 ms at 22 entities, 0.94 ms at 62, and 1.99 ms at 122. This is a single local sample, not a benchmark guarantee. It excludes the fixed-step movement/collision/render loop and does not establish physical-device performance. Use the existing opt-in diagnostics and device testing before expanding AI update cost or map-wide searches.
