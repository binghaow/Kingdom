#!/usr/bin/env node
'use strict';
/* 20-minute freeze reproduction (player report 2026-11-25: a new-online 2-player match froze at about 20 minutes, every unit
   stopped, a reconnect fixed it; docs/p3e/stall-20min.md). Two headless clients (the browser's lockstep code, full Sim, scripted
   players) on WebSocket + D1 with the platform model, accelerated 4x, played past 20 game minutes (12 300 turns):
   - production socket budget (2400 D1 calls -> planned reconnect about every 4 game minutes), D1 latency 12 ms per call at 4x
     (= 47 ms real), platform limit 10 000 calls per invocation;
   - the 5-minute snapshots at turns 3000/6000/9000/12000 (normalisation on every client, upload by the keeper);
   - at the 4th snapshot turn (12000, minute 20) seat 1's socket wedges (heartbeats but no turn data, the field symptom);
   it must recover by itself (progress watchdog, silent reconnect) within 12 s, and the match must stay consistent: every
   checksum pair equal, no relay mismatch, the relay recording replays headless to the same final checksum.
   Not in check-all (about 9-10 min of wall time on 2 cores); run before releases that touch src/net or server/lockstep.
   usage: node check-lockstep-long.cjs [--minutes 20.5] [--no-wedge] [--json out.json] */
const assert = require('node:assert/strict'), H = require('./scripts/lockstep/harness.cjs');
const argv = process.argv.slice(2), get = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const minutes = +get('minutes', 20.5), wedge = !argv.includes('--no-wedge'), json = get('json', null);
(async () => {
  const t0 = Date.now();
  const r = await H.main({ ...H.args(), json: null, quiet: true, keepRaw: true, clients: 2, seconds: minutes * 60, period: 25, transport: 'ws', d1Latency: 12, invocationLimit: 10000, stall: 40,
    clientCfg: (s) => (wedge && s.seat === 1 ? { wedge: { atTurn: 12000 } } : {}) });
  const out = { ok: r.ok, failures: r.failures, wallSeconds: Math.round((Date.now() - t0) / 1000), turns: r.config.turns, consistency: r.consistency, platform: r.platform,
    clients: r.raw.map((c) => ({ seat: c.seat, turns: c.turns, reconnects: c.reconnects, planned: c.socket?.planned, watchdog: c.socket?.watchdog, stuck: c.socket?.stuck, stallMs: Math.round(c.stats.stallMs), snapshots: c.snapshots, wedge: c.faults?.wedge || null, simMsPerTurn: +c.simMsPerTurn.toFixed(1), units: c.units })) };
  if (json) require('node:fs').writeFileSync(json, JSON.stringify(out, null, 1));
  if (!r.ok) { console.error('FAIL', JSON.stringify(out, null, 1)); process.exit(1); }
  assert.ok(r.config.turns >= 12300 || minutes < 20.5);
  assert.equal(r.platform.refused, 0, 'sockets recycle before the platform limit');
  const keeper = out.clients.find((c) => c.seat === 0);
  assert.ok(keeper.snapshots.uploads >= Math.floor(r.config.turns / 3000), 'a snapshot every 5 game minutes: ' + JSON.stringify(keeper.snapshots));
  assert.ok(out.clients.every((c) => c.planned >= 3), 'planned socket recycling: ' + out.clients.map((c) => c.planned));
  if (wedge) { const w = out.clients.find((c) => c.seat === 1).wedge; assert.ok(w.recovered > 0 && w.recovered < 12000, 'wedged socket at minute 20 recovered by itself: ' + JSON.stringify(w)); }
  console.log(`PASS ${minutes} game minutes (${r.config.turns} turns, 4x clock, ws + D1 12 ms/call, socket budget 2400): ${r.consistency.pairsCompared} checksum pairs equal, recording replay ${r.consistency.replayFinal} = clients, ${keeper.snapshots.uploads} snapshots, planned reconnects ${out.clients.map((c) => c.planned).join('/')}, 0 refused D1 calls` + (wedge ? `, socket wedged at turn 12000 recovered in ${(out.clients.find((c) => c.seat === 1).wedge.recovered / 1000).toFixed(1)} s` : '') + ` (${out.wallSeconds} s)`);
})().catch((e) => { console.error(e); process.exit(1); });
