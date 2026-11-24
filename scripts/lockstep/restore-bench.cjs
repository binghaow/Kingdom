#!/usr/bin/env node
'use strict';
/* 3e before/after for a long save: restore it through the lobby + relay (WebSocket + D1, 2 headless clients running the
   browser's lockstep code) twice — without its snapshot (3c: replay from turn 0) and with it (3e) — and report how long
   each client needs from the room start until it reaches the save point, plus upload sizes.
   usage: node scripts/lockstep/restore-bench.cjs <save.json> [--json out.json] [--period 100] [--after 30]
   Also prints a headless single-process replay comparison (no relay): full replay vs snapshot load + remaining turns. */
const path = require('node:path'), fs = require('node:fs'), { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '../..');
const H = require('./harness.cjs'), { makeRestoreRoom } = require('./restore-room.cjs');
const a = process.argv.slice(2), get = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
(async () => {
  const saves = await import(pathToFileURL(path.join(ROOT, 'src/net/saves.js')).href);
  const { replayLockstep } = await import(pathToFileURL(path.join(ROOT, 'src/net/lockstep.js')).href);
  const K = require(path.join(ROOT, 'public/network-model.js')), commands = require(path.join(ROOT, 'public/network-commands.js'));
  const save = JSON.parse(fs.readFileSync(a[0], 'utf8')), decoded = await saves.saveSnapshot(save), noSnap = { ...save, snapshot: undefined };
  const period = +get('period', 100), after = +get('after', 30), end = save.turns + after * 10;
  const out = { save: { turns: save.turns, minutes: +(save.turns / 600).toFixed(1), commands: save.commands.length, hash: save.hash, snapshotTurn: save.snapshot?.turn, snapshotKB: save.snapshot && Math.round(save.snapshot.data.length / 1024), fileKB: Math.round(JSON.stringify(save).length / 1024) }, period, note: 'local measurement: 2 vCPU VM, Node + SQLite D1 stand-in, 2 headless clients in child processes (both simulations share 2 cores); not Sites / real devices' };
  // Headless, one process.
  let t = Date.now(); const full = replayLockstep(K, commands, save); const fullMs = Date.now() - t;
  t = Date.now(); const d2 = await saves.saveSnapshot(save), dec = Date.now() - t; const snap = replayLockstep(K, commands, save, { snapshot: d2 }); const snapMs = Date.now() - t;
  out.headless = { fullReplayMs: fullMs, fromSnapshotMs: snapMs, decodeMs: dec, finalFull: full.final.hash, finalSnapshot: snap.final.hash, saveHash: save.hash };
  for (const [name, s] of [['before_from_turn_0', noSnap], ['after_from_snapshot', save]]) {
    let room = null; const mk = makeRestoreRoom(saves, s, { decoded });
    const r = await H.main({ ...H.args(), quiet: true, stall: 120, keepRaw: true, clients: 2, period, transport: 'ws', seconds: end / 10, makeRoom: async (x) => (room = await mk(x)), clientCfg: () => ({ markTurn: save.turns }) });
    out[name] = { ok: r.ok, failures: r.failures, upload: room.upload, reachSavePointMs: r.raw.map((c) => c.mark), startLeadMs: 3000, snapshotLoadMs: r.raw.map((c) => c.snapshots?.lastLoad?.ms ?? null), savePointHash: r.raw.map((c) => new Map(c.hashes).get(save.turns * 2) || null), final: r.consistency.final, pairsCompared: r.consistency.pairsCompared, replayFinal: r.consistency.replayFinal, wallSeconds: r.wallSeconds };
    console.error(name, JSON.stringify(out[name]));
  }
  const text = JSON.stringify(out, null, 1); if (get('json', null)) fs.writeFileSync(get('json'), text); console.log(text);
})().catch((e) => { console.error(e); process.exit(1); });
