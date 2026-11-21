/* 3c: caretaker for a taken-over team 0. The Sim's computer player only runs teams >= 1 (its planner loops start at team 1
   and many rules test team > 0), and changing that would touch simulation code. Team 0 is the first lobby seat (usually the
   host), so while its player is offline for more than 60 s this keeps the town working: idle villagers gather the nearest
   resource, the town centre trains villagers up to 30, and the army answers enemies near the town.
   It must be deterministic: it reads only the shared simulation state, iterates in the Sim's own array order and has no
   randomness or clock, so every client issues the same commands in the same turn (they go through the same
   network-commands execute() as player commands, after the relay's commands of that turn). */
const PERIOD_TURNS = 30; // every 3 s of game time

export function caretaker(K, sim, team, turn) {
  if (turn % PERIOD_TURNS !== 0) return [];
  const s = sim.s, out = [];
  if (s.ended || s.defeated?.includes(team)) return out;
  const town = s.buildings.find((b) => b.team === team && b.kind === 'town' && b.hp > 0 && b.complete !== false);
  if (!town) return out;
  const d2 = (a) => (a.x - town.x) ** 2 + (a.y - town.y) ** 2;
  const mine = s.units.filter((u) => u.team === team && u.hp > 0 && !u.embarkedOn);
  const villagers = mine.filter((u) => u.kind === 'villager');
  const idle = villagers.filter((u) => !u.order);
  if (idle.length) {
    let best = null, bestD = Infinity;
    for (const n of s.nodes) {
      if (!((n.amount ?? 1) > 0)) continue;
      const d = d2(n); if (d >= bestD || d > 900 * 900) continue;
      if (sim.canGather && !sim.canGather(idle[0], n)) continue;
      best = n; bestD = d;
    }
    if (best) out.push(['orders', { items: [{ ids: idle.slice(0, 8).map((u) => u.id), order: { type: 'gather', id: best.id } }] }]);
  }
  if (villagers.length < 30 && !(town.queue && town.queue.length)) out.push(['train', { id: town.id, kind: 'villager' }]);
  let foe = null, foeD = 650 * 650;
  for (const u of s.units) { if (u.hp > 0 && u.team !== team && u.team >= 0 && !(sim.allied && sim.allied(team, u.team))) { const d = d2(u); if (d < foeD) { foe = u; foeD = d; } } }
  if (foe) {
    const army = mine.filter((u) => u.kind !== 'villager' && K.defs[u.kind]?.damage > 0 && !(sim.sea && sim.sea(u)));
    if (army.length) out.push(['order', { ids: army.slice(0, 80).map((u) => u.id), order: { type: 'advance', x: foe.x, y: foe.y } }]);
  }
  return out;
}
