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
- Expert outposts reuse existing lumbercamps and quarries, send a villager to an explored and reachable resource area, avoid nearby threats and respect building costs. Goals are transient and reset safely after loading; other difficulty profiles retain their current expansion behavior.
- The existing age progression and high-tech chain remain in place: the town advances through five ages, the siege layer plans siegeyards and aerodromes, and Dynasty AI builds universities, arsenals, foundries and palaces when their eras unlock.
- Phase 2 begins with a periodic, explainable strategic assessment (defense, economy, technology, military, expansion, naval, neutral objective and offense), net resource-flow snapshots, goal hysteresis and goal-aware technology priorities. It runs only on the existing per-team AI think timer.
- Existing cavalry/air harassment now has a cautious withdrawal check: a raiding unit returns toward its saved home position when it is badly hurt in a nearby multi-unit fight or visibly outmatched. This does not cancel player-ordered ally cooperation.

## Existing player systems preserved

Ten national identities and units, five eras, four resources, trade, diplomacy, fog of war, six maps, land and naval units, aircraft, walls, heroes, spells, neutral guardians, multiplayer, saves and the browser Canvas rendering loop remain supported.

## Known AI limitations

Strategic expansion still follows the existing building list near a town for non-Expert difficulties; Expert resource outposts score only explored existing resource nodes. Research priorities are now strategy-aware but still use simple rule-based estimates, not a full tech-tree search. Raids target known settlements and harassment targets; flanking, encirclement, diversionary attacks, multi-front coordination, adaptive counters, deliberate neutral-objective assaults and coordinated naval landings remain future work. Phase 2 is in progress, not complete.

## Carrier aviation balance (2026-11-09)
- V-age carrier fighters have 340 HP, 7 base armor, and 96 bomb damage; low-tier bow units now take many hits, while musketeers and dedicated anti-air can still intercept them.
- Carriers support up to four separately produced aircraft. The aerodrome no longer offers the retired duplicate land bomber; existing saved bombers remain valid.
- Carrier art uses an original edited four-view asset with empty decks; aircraft now render as attached deck units, staggered takeoffs and return/landing/rearm states. The map legend uses nation names instead of placeholder computer numbers.
