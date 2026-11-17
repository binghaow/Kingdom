'use strict';
/* Scripted lockstep player for the headless clients. It reads its own copy of the simulation and issues commands in the
   wire format the browser client sends ({type,args}, the same as the room service's execute()): gather, train, construct,
   research (age), rally, move and attack-move. Decisions only need to be plausible input; determinism comes from the relay
   delivering the same commands to everyone. A small PRNG per seat spreads the timing so seats do not act in the same turn. */
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const near = (a, list) => list.reduce((best, x) => (!best || Math.hypot(x.x - a.x, x.y - a.y) < Math.hypot(best.x - a.x, best.y - a.y) ? x : best), null);

function createBot(K, seat, team, seed = 1) {
  const D = K.defs, rand = rng(seed * 7919 + seat * 104729 + 13);
  let built = { house: 0, barracks: 0 };
  function spot(sim, kind, town, start) {
    for (let r = start; r < 760; r += 40) for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8 + r / 97 + seat, x = town.x + Math.cos(a) * r, y = town.y + Math.sin(a) * r; if (!sim.placementError(kind, x, y, team)) return { x, y }; }
    return null;
  }
  /* Called once per turn; returns a list of [type, args] to issue (usually empty). */
  return function think(sim, turn) {
    if (team < 0 || (turn + seat * 3) % 10 !== 0) return [];
    const s = sim.s, out = [], sec = turn / 10;
    if (s.defeated.includes(team) || s.ended) return out;
    const town = s.buildings.find((b) => b.team === team && b.kind === 'town' && b.hp > 0); if (!town) return out;
    const mine = s.units.filter((u) => u.team === team && u.hp > 0 && !u.embarkedOn);
    const vills = mine.filter((u) => u.kind === 'villager'), army = mine.filter((u) => u.kind !== 'villager' && D[u.kind]?.damage > 0 && !sim.sea?.(u) && !sim.air?.(u));
    const nodes = s.nodes.filter((n) => (n.amount ?? 1) > 0 && Math.hypot(n.x - town.x, n.y - town.y) < 900);
    const idle = vills.filter((u) => !u.order);
    if (idle.length) {
      const pick = idle.slice(0, 6), want = rand() < 0.5 ? 'food' : rand() < 0.6 ? 'wood' : 'gold';
      const cand = nodes.filter((n) => sim.canGather(pick[0], n) && (n.resource || n.kind) && String(n.resource || n.kind).includes(want));
      const n = near(town, cand.length ? cand : nodes.filter((n) => sim.canGather(pick[0], n)));
      if (n) out.push(['orders', { items: [{ ids: pick.map((u) => u.id), order: { type: 'gather', id: n.id } }] }]);
    }
    if (vills.length < 40 && rand() < 0.7) out.push(['train', { id: town.id, kind: 'villager' }]);
    if (sec > 20 && sec / 25 > built.house && vills[0]) { const p = spot(sim, 'house', town, 160); if (p) out.push(['construct', { kind: 'house', x: p.x, y: p.y, ids: [vills[0].id] }]); built.house++; }
    if (sec > 45 && built.barracks < 1 + Math.floor(sec / 240) && vills[1]) { const p = spot(sim, 'barracks', town, 240); if (p) out.push(['construct', { kind: 'barracks', x: p.x, y: p.y, ids: [vills[1].id, vills[2]?.id].filter(Boolean) }]); built.barracks++; }
    if (sec > 60 && turn % 600 === (seat * 30) % 600) out.push(['research', { id: town.id, key: 'age' }]);
    for (const b of s.buildings) if (b.team === team && b.kind === 'barracks' && b.complete && rand() < 0.5) {
      const list = D.barracks.trains || ['infantry']; out.push(['train', { id: b.id, kind: list[Math.floor(rand() * Math.min(2, list.length))] }]);
      if (turn % 300 === 0) out.push(['rally', { id: b.id, point: { x: town.x + 120, y: town.y - 80 } }]);
    }
    if (army.length && rand() < 0.3) { const u = army[Math.floor(rand() * army.length)]; out.push(['orders', { items: [{ ids: [u.id], order: { type: 'move', retreat: false }, points: [{ x: Math.max(10, Math.min(sim.world.width - 10, town.x + (rand() - 0.5) * 500)), y: Math.max(10, Math.min(sim.world.height - 10, town.y + (rand() - 0.5) * 500)) }] }] }]); }
    if (sec > 180 && army.length >= 6 && turn % 300 === (seat * 50) % 300) {
      const foe = near(town, s.buildings.filter((b) => b.team !== team && b.team >= 0 && b.kind === 'town' && b.hp > 0 && !sim.allied(team, b.team)));
      if (foe) out.push(['order', { ids: army.slice(0, 120).map((u) => u.id), order: { type: 'advance', x: foe.x, y: foe.y } }]);
    }
    return out;
  };
}
module.exports = { createBot };
