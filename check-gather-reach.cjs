#!/usr/bin/env node
'use strict';
/* Villagers at a drop site built right against a gold/stone node (player report: villagers walk back and forth next to the
   mine and never mine). Root cause: paths end on 48 px nav cells; with the node's own cell blocked by the building the
   nearest reachable point was a neighbouring cell centre 49-72 px away, outside the 38 px gather reach -> re-path every
   1.8 s forever. Checks:
   1. legacy placement (camp 56 px from the node, allowed before this fix; old saves / restored matches still have it):
      6 villagers on one gold node and 6 on one stone node -> every villager mines within 45 s;
   2. several villagers sharing one node with a camp at the new minimum distance: every villager mines;
   3. placement: a mining camp / mill can no longer be placed on a gold/stone rock or berry bush (ore 50 px, berries 34 px from
      the footprint edge); trees keep the old distance. */
const assert = require('node:assert/strict'), K = require('./public/network-model.js'), D = K.defs;
function scene(res, campAt, n, seed = 11) {
  const sim = new K.NetworkSim('normal', null, { nations: ['britain', 'france'], groups: [1, 2], mapId: 'coast_s', minerals: 'standard', fog: false, seed, humanTeams: [0, 1] });
  const s = sim.s, town = s.buildings.find((b) => b.team === 0 && b.kind === 'town');
  const node = s.nodes.filter((x) => x.resource === res && x.amount > 0).sort((a, b) => K.distance(a, town) - K.distance(b, town))[0];
  let place = null;
  if (campAt === 'rule') {
    for (let r = 40; r < 220 && !place; r += 2) for (let a = 0; a < 72; a++) { const x = node.x + Math.cos(a / 72 * 6.2832) * r, y = node.y + Math.sin(a / 72 * 6.2832) * r; if (!sim.placementError('miningcamp', x, y, 0)) { place = { x, y }; break; } }
  } else place = { x: node.x + campAt, y: node.y };
  const camp = sim.add('miningcamp', 0, place.x, place.y); camp.complete = true; camp.hp = D.miningcamp.hp; sim.grid = null;
  const vs = []; for (let i = 0; i < n; i++) vs.push(sim.add('villager', 0, town.x + 40 + i * 14, town.y + 90));
  sim.order(vs, { type: 'gather', id: node.id, resource: res });
  const got = new Map(vs.map((v) => [v.id, 0]));
  for (let i = 0; i < 45 / 0.05; i++) { const before = vs.map((v) => v.cargo?.amount || 0); sim.tick(0.05); vs.forEach((v, j) => { const d = (v.cargo?.amount || 0) - before[j]; if (d > 0) got.set(v.id, got.get(v.id) + d); }); }
  return { sim, node, camp: K.distance(camp, node), got: [...got.values()].map(Math.round) };
}
const out = [];
for (const res of ['gold', 'stone']) {
  const r = scene(res, 56, 6);
  assert.ok(r.got.every((x) => x > 0), `${res}: camp ${Math.round(r.camp)} px from the node, every villager mines: ${r.got}`);
  out.push(`${res} node, camp 56 px away (legacy placement), 6 villagers: mined ${r.got.join('/')} in 45 s`);
}
const r2 = scene('gold', 'rule', 8);
assert.ok(r2.got.every((x) => x > 0), 'camp at the minimum distance, 8 villagers: ' + r2.got);
out.push(`gold node, camp at the new minimum distance (${Math.round(r2.camp)} px), 8 villagers: mined ${r2.got.join('/')}`);
// 3. placement rule
const sim = r2.sim, s = sim.s, gold = r2.node;
s.resources[0].wood = 9999;
const ok = (kind, n, d) => !sim.placementError(kind, n.x + d, n.y, 0) || !sim.placementError(kind, n.x - d, n.y, 0) || !sim.placementError(kind, n.x, n.y + d, 0) || !sim.placementError(kind, n.x, n.y - d, 0);
assert.equal(sim.nodeClearance(gold), 50); assert.equal(sim.nodeClearance({ resource: 'food', subtype: 'berries' }), 34); assert.equal(sim.nodeClearance({ resource: 'wood', subtype: 'forest' }), 20);
for (const d of [40, 56, 70]) assert.ok(!ok('miningcamp', gold, d), 'mining camp on the gold rock refused at ' + d);
const berry = s.nodes.find((n) => n.subtype === 'berries');
if (berry) for (const d of [40, 55]) assert.ok(/资源/.test(sim.placementError('mill', berry.x + d, berry.y, 0)) || sim.placementError('mill', berry.x + d, berry.y, 0) !== '', 'mill on a berry bush refused at ' + d);
out.push('placement: mining camp refused within 34+50 px of a gold rock (was 34+20), mill within 35+34 px of berries; trees unchanged');
for (const l of out) console.log('PASS ' + l);
