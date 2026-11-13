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

## Debug-mode production and attack orders (2026-11-10)

- Single-player debug bypasses era, nation, technology, population, resource and queue-cap gates for otherwise valid units/buildings and research. Producer compatibility, legal placement, builder requirements, and unit/building validity remain enforced. The build catalogue's `All` tab exposes nation-specific structures and training catalogues expose nation-specific units while debug is active. Building, unit and research work retains its existing one-second debug cadence. Turning debug off restores the ordinary checks; debug remains unavailable in multiplayer.
- Explicit attack orders retain the target's last known coordinates. If that target is removed or destroyed, the order changes to an advance toward those coordinates, allowing the unit to keep moving and resume automatic target acquisition instead of stopping with a stale attack command. Fresh player orders still replace it immediately.
- Regression coverage: `check-companions.cjs` and `check-combat-ai.cjs` cover debug gating/restoration and the dead-target advance path. This change adds no per-frame roster or map scan.

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
- The age-I tower's durability is data-driven in `engine.js`; `roster.js` applies a 0.7 damage multiplier only when the incoming unit has the `archer` role. This leaves dedicated musketeers, siege and the heavy fort unchanged.
- Expert previously received +22% gathering, +6% damage, faster training and faster age pacing. Those four bonuses are normalized to standard values; its raid interval, formation size and reactive defense remain stronger.

### Limits and constraints

- AI planning remains distributed through override layers. There is no separate strategic-goal object or shared threat ledger yet; adding one would be a later architectural step.
- Income rates are not recorded as a time series. Phase 1 estimates need from current stockpiles and upcoming age costs.
- Resource expansion still uses the existing local building plan. Defense is limited to towers; walls are not part of this phase.
- Expert expansion now uses a small transient per-team goal: select an explored wood/stone site, move one available villager there, then build an existing lumbercamp or quarry. A five-minute cooldown limits outpost spam. Age IV+ production receives a configurable Expert-only share target; no economy, damage, health or training bonuses are added. The current town-age and high-tech building plans are reused.
- Before Phase 2, attack selection used existing raid logic; full tactical formations, flanking, encirclement, multi-front operations, adaptive counter production, naval landing plans and deliberate dragon assaults were not implemented.
- Phase 2 implementation has started in `dynasties.js`: a per-team assessment scores defense, economy, technology, military, expansion, naval readiness, neutral objectives and offense on the existing `nextThink` cadence. The chosen goal has a short hold window to reduce strategic churn; resource snapshots estimate net stock change between decisions; research candidates are ordered by the active goal and affordability.
- `commander.js` adds only a local retreat check for AI-generated harassment groups. It consults the team's current visible view and sends an exposed raider home when the nearby visible force is overwhelming or the raider is badly injured. It skips active player cooperation. No flank/encirclement path patterns were added because the current shared destination and collision/pathing behavior needs dedicated formation validation first.
- The Node benchmark is a repeatable algorithm check, not an iPhone/iPad performance measurement.

## Prioritized roadmap and estimated complexity

| Phase | Scope | Complexity | Performance / design risk |
| --- | --- | --- | --- |
| 1 · Reliable basic AI — complete | Adaptive idle/overassigned worker allocation, affordable role-balanced production, reactive local tower defense, retain existing grouped raids | Medium | Periodic node/unit/building scans; scheduled on strategic AI ticks only |
| 2 · Strategic AI — in progress | Periodic goal scoring for economy, tech, military, expansion, defense, naval readiness, neutral objectives and offense; net stock-flow snapshots; goal-aware research ordering. Next: worker downtime telemetry, broader resource-site valuation for non-Expert, and scenario tuning. | Medium–high | Existing team think timer only; no path or map-cell scans in goal scoring; preserve fog-limited views |
| 3 · Adaptive strategy | Enemy-composition counters; safe territorial/resource expansion; wall/chokepoint defense; naval economy and objective planning; dragon risk/reward evaluation | High, roughly 1–2 weeks | Fog-safe remembered intelligence, path reachability and multi-domain balancing |
| 4 · Expert tactics | Existing harassment is now joined by a cautious local-force withdrawal for AI raid units. Flanks, encirclement, diversions and multi-front operations remain gated on formation/pathing tests. | Very high, roughly 2–3 weeks plus tuning | Group formations/path congestion, repeated target changes and CPU spikes; requires scenario and device profiling |

## Phase 1 test evidence

Run `node check-ai-phase1.cjs`. It checks deficit-driven worker reassignment, preserved build orders, deterministic composition, inability to queue unaffordable units, difficulty configuration, visible-threat defense, fog-safe gathering, fixed-seed repeatability and strategic update time at several entity counts.

On this workspace's Node v24.19.0, the measured `aiPlayer` decision call was 0.26 ms at 22 entities, 0.94 ms at 62, and 1.99 ms at 122. This is a single local sample, not a benchmark guarantee. It excludes the fixed-step movement/collision/render loop and does not establish physical-device performance. Use the existing opt-in diagnostics and device testing before expanding AI update cost or map-wide searches.

## Phase 2 first-slice validation

`node check-ai-phase2.cjs` covers explainable goal selection, net stock-flow snapshots, visible-vs-hidden threat handling, goal stability, research affordability/priority, raider withdrawal and manual-order priority. A single Node sample measured goal scoring at 0.30 ms with 173 units. `node check-all.cjs` and `npm run build` passed on 2026-11-09. No browser battle session, iPhone/iPad profile, AI-vs-AI balance run or release comparison has been performed; the public accepted version remains the performance reference until matched device samples are recorded.

## Carrier aircraft balance
Campaign owns carrier fighter definitions, carrier capacity and the deck/takeoff/landing/rearm state machine; Siege retains the shared anti-air legality and damage pipeline. Aircraft HP, base armor and bomb strength are data-driven in public/campaign.js; low-tier archers remain able to attack aircraft, but no longer remove a V-age fighter in a few hits. Dedicated musketeers and anti-air towers retain their normal damage. Existing saved airwings preserve their health ratio during migration.
