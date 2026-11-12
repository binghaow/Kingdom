# Game Features

## Computer opponents

- Six selectable profiles: Sandbox, Beginner, Easy, Normal, Hard and Expert. Profiles configure economic/combat scaling, army caps, raid size/cadence, age pace and strategic think interval.
- Computer workers gather food, wood, gold and stone; fishing boats collect food; markets can train traders. Resource searches in fog-enabled matches use explored resources.
- The computer develops its town, houses, military buildings, markets, docks and later-era infrastructure; it advances ages and researches technologies through the existing technology tree.
- Military production respects nation/age availability, resources, queue limits and army caps. (Phase 1 adds role-balanced selection and affordability checks.)
- AI armies periodically attack known enemy capitals; naval attacks are issued when a known hostile dock and sufficient fleet are available. Units also use the existing automatic target acquisition system.
- The computer scouts under fog, respects the era restrictions around the KC dragon/demon objective, and uses existing guardian, fortress and reward mechanics. It does not yet deliberately plan a dedicated dragon assault.
- Phase 1 adds shortage-led worker reallocation with a cooldown and threat-triggered towers near a threatened civic/economic site. Towers only respond to visible threats or recent damage to owned buildings.
- Expert uses standard economy, unit damage, training speed and age pace; its added challenge comes from the larger army plan, quicker raid interval, stronger reactive defense, resource-site outposts and a higher share of age IV+ units when affordable.
- Expert outposts reuse existing lumbercamps and mining camps (quarries are merged into mining camps in v39), send a villager to an explored and reachable resource area, avoid nearby threats and respect building costs. Goals are transient and reset safely after loading; other difficulty profiles retain their current expansion behavior.
- The existing age progression and high-tech chain remain in place: the town advances through five ages, the siege layer plans aerodromes, and Dynasty AI builds palaces when their eras unlock; buildings merged in v39 (universities, foundries, siege yards, steelworks, signal bureaus) are skipped and their research happens at the blacksmith/workshop.

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

Since v40 the computer scores outside resource sites, flanks, raids outlying gatherers and lands on islands, but research follows a fixed doctrine-ordered list, outside sites come from fixed per-player slots, it coordinates at most one flanking group per main attack, remote raids are chance-based per difficulty, and deliberate neutral-objective assaults remain a future phase.
