#!/usr/bin/env node
'use strict';
/* 3e: builds a long online save without waiting for a real-time match. One headless LockstepClient (src/net/lockstep.js,
   the browser's own code) runs a 2-seat room as fast as the CPU allows; the scripted bots of check-lockstep (bot.cjs) play
   both seats and their commands are fed in as relay turns (issued turn + 2, the relay's default delay), so the run is a
   valid lockstep recording. The client normalizes and snapshots every 5 game minutes exactly as in a live match; the save
   (src/net/saves.js makeSave + attachSnapshot) therefore carries the newest snapshot.

   usage: node scripts/lockstep/synthetic-save.cjs --turns 18300 [--out save.json] [--map coast_s] [--seed 7]
   Exported: build({turns, mapId, seed}) -> { save, ms, msPerTurn } */
const path = require('node:path'), { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '../..');
const core = require(path.join(ROOT, 'server/lockstep/relay-core.cjs'));
const K = require(path.join(ROOT, 'public/network-model.js')), commands = require(path.join(ROOT, 'public/network-commands.js')), { createBot } = require('./bot.cjs');

async function build({ turns = 3300, mapId = 'coast_s', seed = 7, nations = ['britain', 'france'] } = {}) {
  const { LockstepClient } = await import(pathToFileURL(path.join(ROOT, 'src/net/lockstep.js')).href);
  const saves = await import(pathToFileURL(path.join(ROOT, 'src/net/saves.js')).href);
  const setup = core.makeSetup({ difficulty: 'normal', nations, groups: nations.map((_, i) => i + 1), mapId, minerals: 'standard', fog: true, seed, humanTeams: nations.map((_, i) => i), names: nations.map((_, i) => 'Bot ' + (i + 1)), netMode: 'ffa' });
  const seats = nations.map((_, i) => ({ seat: i, team: i }));
  const c = new LockstepClient({ K, commands, setup, seat: 0, seats, startAt: 0, period: 100, now: () => 0 });
  c.sealed = turns + 10; c.sparseCatchup = true; // checksums every 600 steps (as when catching up) — the snapshot step is one of them
  const bots = seats.map((s) => createBot(K, s.seat, s.team, seed)), seq = seats.map(() => 0);
  const t0 = Date.now();
  while (c.nextTurn < turns) {
    const turn = c.nextTurn;
    c.runTurn();
    for (const s of seats) for (const [type, args] of bots[s.seat](c.sim, turn)) c.receive({ t: [[turn + 2, s.seat, ++seq[s.seat], { type, args }]] });
  }
  const ms = Date.now() - t0;
  const room = { id: 'SYNTH' + seed, code: null, config: { capacity: seats.length, mode: 'ffa', mapId, fog: true, minerals: 'standard', difficulty: 'normal', lockstep: true },
    players: seats.map((s) => ({ seat: s.seat, name: 'Bot ' + (s.seat + 1), nation: nations[s.team], group: s.team + 1, team: s.team })) };
  const save = await saves.attachSnapshot(saves.makeSave(c, room), c);
  return { save, ms, msPerTurn: ms / turns, units: c.sim.s.units.length };
}

module.exports = { build };
if (require.main === module) {
  const a = process.argv.slice(2), get = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
  build({ turns: +get('turns', 3300), mapId: get('map', 'coast_s'), seed: +get('seed', 7) }).then(({ save, ms, msPerTurn, units }) => {
    const out = get('out', null), text = JSON.stringify(save);
    if (out) require('node:fs').writeFileSync(out, text);
    console.log(JSON.stringify({ turns: save.turns, minutes: save.turns / 600, hash: save.hash, commands: save.commands.length, snapshot: save.snapshot && { turn: save.snapshot.turn, hash: save.snapshot.hash, kb: Math.round(save.snapshot.data.length / 1024) }, saveKB: Math.round(text.length / 1024), units, buildMs: ms, msPerTurn: +msPerTurn.toFixed(2), out }));
  }).catch((e) => { console.error(e); process.exit(1); });
}
