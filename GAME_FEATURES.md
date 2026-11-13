# Game Features

## Computer opponents

- Single-player debug mode exposes all country-specific building options in the `All` build tab and country-specific unit options at their valid production buildings. It skips normal age, nation, research, resource, population and queue limits for debug construction/training/research and completes them in about one second. Turning debug off restores normal progression. Placement safety and producer compatibility remain active; multiplayer cannot enable debug.
- When a player-issued attack target dies, surviving attackers continue toward its last known position and then use normal nearby target acquisition, preventing rear units from idling after the initial target disappears.

- Six selectable profiles: Sandbox, Beginner, Easy, Normal, Hard and Expert. Profiles configure economic/combat scaling, army caps, raid size/cadence, age pace and strategic think interval.
- Computer workers gather food, wood, gold and stone; fishing boats collect food; markets can train traders. Resource searches in fog-enabled matches use explored resources.
- The computer develops its town, houses, military buildings, markets, docks and later-era infrastructure; it advances ages and researches technologies through the existing technology tree.
- Military production respects nation/age availability, resources, queue limits and army caps. (Phase 1 adds role-balanced selection and affordability checks.)
- AI armies periodically attack known enemy capitals; naval attacks are issued when a known hostile dock and sufficient fleet are available. Units also use the existing automatic target acquisition system.
- The computer scouts under fog, respects the era restrictions around the KC dragon/demon objective, and uses existing guardian, fortress and reward mechanics. It does not yet deliberately plan a dedicated dragon assault.
- Phase 1 adds shortage-led worker reallocation with a cooldown and threat-triggered towers near a threatened civic/economic site. Towers only respond to visible threats or recent damage to owned buildings.
- Tower balance: age-I towers have 900 HP and take 30% less damage from archer-role units; their range, attack, cost, and construction time are unchanged. Musketeers, siege, and forts are unaffected.
- Expert uses standard economy, unit damage, training speed and age pace; its added challenge comes from the larger army plan, quicker raid interval, stronger reactive defense, resource-site outposts and a higher share of age IV+ units when affordable.
- Expert outposts reuse existing lumbercamps and mining camps (quarries are merged into mining camps in v39), send a villager to an explored and reachable resource area, avoid nearby threats and respect building costs. Goals are transient and reset safely after loading; other difficulty profiles retain their current expansion behavior.
- The existing age progression and high-tech chain remain in place: the town advances through five ages, the siege layer plans aerodromes, and Dynasty AI builds palaces when their eras unlock; buildings merged in v39 (universities, foundries, siege yards, steelworks, signal bureaus) are skipped and their research happens at the blacksmith/workshop.
- Phase 2 begins with a periodic, explainable strategic assessment (defense, economy, technology, military, expansion, naval, neutral objective and offense), net resource-flow snapshots, goal hysteresis and goal-aware technology priorities. It runs only on the existing per-team AI think timer.
- Doctrine harassment waves (cavalry/air) also have a per-unit cautious withdrawal check: a raiding unit returns toward its saved home position when it is badly hurt in a nearby multi-unit fight or visibly outmatched. This does not cancel player-ordered ally cooperation.

## Roster v39 (docs/gameplay-v39.md)

- Fewer, clearer units and buildings: retired units and merged buildings leave the menus but stay loadable from old saves.
- National units replace one generic unit in the ordinary barracks / range / stable; the ten national buildings are one-per-match landmarks that levy a free national soldier every 90 s.
- Upgrade lines (spear at the barracks, ranged at the shooting range, mortar at the artillery workshop since v40) upgrade existing and queued units; the unit information panel shows the line, tier and research costs.
- Role counters are x2 and later tiers are stronger per resource and per population (calibrated with `scripts/balance/roster-battles.cjs`).
- Air plan A: scout balloon from age III without research; bombers attack only buildings; ranged line and towers hit aircraft at half damage, forts at full. Markets no longer make passive gold.

## Gameplay v40 (docs/gameplay-v39.md, section "v40 改动")

- Horizontal and vertical stone walls are both buildable again; the single gate button turns to match the wall it closes.
- Every research button (all buildings, the Town Center age advance and national landmarks) has an ⓘ with measured effects, affected units, cost, age and a before/after table; `check-tech-intel.cjs` keeps descriptions honest.
- Research lives where the units are trained; the blacksmith keeps only weapons and armor. The computer researches by doctrine and difficulty.
- Maps: limited gold and stone at home, equivalent rich sites in the middle and far flanks, a shared middle site, rich islands worth a transport, fair camp rewards (`check-resource-layout.cjs`).
- Computer frontier: claims outside points with camps, towers and (expert/turtle) walls, takes points near the player after scouting, ferries a party to islands, raids outlying gatherers, sends flanking groups by another lane or by sea, grows its base by age and paces age-ups by difficulty; armies keep growing with difficulty-scaled caps.
- Scout balloon: artillery spotting (+15% range, fire at what it sees) and permanent map survey of deposits and relics.
- Move and retreat orders always win over combat; retaliation resumes on arrival; attack-move still fights.
- Commanders: aura, a national gather bonus while alive, a 60 s attack penalty when they fall, tougher stats, automatic fallback when badly hurt, and computer heroes that stay with their army.
- Full screen buttons with an iPhone Add-to-Home-Screen guide; diagnostics and panels kept off the battlefield on phones; reconnect badge shows why it is reconnecting.

## Existing player systems preserved

Ten national identities and units, five eras, four resources, trade, diplomacy, fog of war, six maps, land and naval units, aircraft, walls, heroes, spells, neutral guardians, multiplayer, saves and the browser Canvas rendering loop remain supported.

## Known AI limitations

Since v40 the computer scores outside resource sites, flanks, raids outlying gatherers and lands on islands, but outside sites come from fixed per-player slots, it coordinates at most one flanking group per main attack, remote raids are chance-based per difficulty, and deliberate neutral-objective assaults remain a future phase.
Strategic expansion still follows the existing building list near a town for non-Expert difficulties. Idle research buildings pick strategy-aware research (Phase 2 scores) alongside the doctrine-ordered research list; neither is a full tech-tree search. Phase 2 is in progress, not complete.

## Carrier aviation balance (2026-11-09)
- **Superseded by air plan A (merge of feature/gameplay-ai-roster, 2026-11-12):** carriers and carrier fighters are retired again (definitions, art `carrier-v45.png` and `carrier-layout.js` stay for old saves); the aerodrome trains the scout balloon and, after Aeronautics, the land biplane bomber, which attacks only buildings. `check-carrier-presentation.cjs` stays in check-all because saved carriers and deck aircraft must still render. The notes below describe the earlier carrier design.
- V-age carrier fighters have 340 HP, 7 base armor, and 96 bomb damage; low-tier bow units now take many hits, while musketeers and dedicated anti-air can still intercept them.
- Carriers support up to four separately produced aircraft. The aerodrome no longer offers the retired duplicate land bomber; existing saved bombers remain valid.
- Carrier art uses an original edited four-view asset with empty decks; aircraft now render as attached deck units, staggered takeoffs and return/landing/rearm states. The map legend uses nation names instead of placeholder computer numbers.
