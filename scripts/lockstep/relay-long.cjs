#!/usr/bin/env node
'use strict';
/* 3c relay-only long-match benchmark (no simulation): fills one room with a 90-minute, 8-seat command volume
   (54 000 turns, --apm commands per seat per minute, checksum rows every second, snapshots every 5 minutes) in node:sqlite
   through the real relay code, then times the exchanges a client makes late in that match: a live exchange (new turns only),
   a full catch-up from turn 0 in MAX_ROWS batches, and a fresh connection that is offered the latest snapshot.
   usage: node scripts/lockstep/relay-long.cjs [--minutes 90] [--seats 8] [--apm 60] [--latency 0] [--json out.json] */
const path = require('node:path'), { DatabaseSync } = require('node:sqlite');
const ROOT = path.resolve(__dirname, '../..'), Lockstep = require(path.join(ROOT, 'server/lockstep/http.cjs')), core = require(path.join(ROOT, 'server/lockstep/relay-core.cjs'));
const { sqliteD1 } = require(path.join(ROOT, 'scripts/sqlite-d1.cjs')), { simulatedD1 } = require('./d1-sim.cjs');
const a = process.argv.slice(2), get = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const o = { minutes: +get('minutes', 90), seats: +get('seats', 8), apm: +get('apm', 60), latency: +get('latency', 0), json: get('json', null) };
(async () => {
  const sqlite = new DatabaseSync(':memory:'), raw = sqliteD1(sqlite), DB = o.latency ? simulatedD1(raw, { latency: o.latency }) : raw;
  const turns = o.minutes * 600, id = 'BENCH234', now = Date.now(), startAt = now - turns * 100 - 200;
  const setup = core.makeSetup({ difficulty: 'normal', nations: ['britain', 'france', 'china', 'japan', 'ottoman'], groups: [1, 2, 3, 4, 5], mapId: 'coast_l', minerals: 'standard', fog: true, seed: 1, humanTeams: [0, 1, 2, 3], names: ['a', 'b', 'c', 'd', 'e'], netMode: 'ffa' });
  await Lockstep.createRoom(raw, { id, setup, startAt, period: 100, now, seats: Array.from({ length: o.seats }, (_, i) => ({ seat: i, team: i % 4, token: 'h' + i })) });
  // Bulk fill (direct SQL; the relay inserts these one by one during a real match).
  const ins = sqlite.prepare('INSERT INTO lockstep_cmds (room, seat, seq, turn, cmd) VALUES (?, ?, ?, ?, ?)'), hs = sqlite.prepare('INSERT INTO lockstep_hashes (room, step, hash, agree, bad) VALUES (?, ?, ?, ?, NULL)');
  const cmd = JSON.stringify({ type: 'orders', args: { items: [{ ids: [101, 102, 103, 104, 105, 106], order: { type: 'move' }, points: [{ x: 2310.5, y: 1820.25 }] }] } });
  let n = 0; const per = o.apm / 600; // commands per seat per turn
  sqlite.exec('BEGIN');
  for (let s = 0; s < o.seats; s++) { let seq = 0, acc = 0; for (let t = 0; t < turns; t++) { acc += per; while (acc >= 1) { acc--; ins.run(id, s, ++seq, t, cmd); n++; } } }
  for (let step = 20; step <= turns * 2; step += 20) hs.run(id, step, 'abcdef01', (1 << o.seats) - 1);
  sqlite.prepare('UPDATE lockstep_rooms SET sealed = ? WHERE id = ?').run(turns - 1, id);
  for (const t of [turns - 6000, turns - 3000].filter((x) => x > 0)) { sqlite.prepare('INSERT INTO lockstep_snapshots (room, turn, step, hash, parts, meta, at) VALUES (?, ?, ?, ?, 2, ?, ?)').run(id, t, t * 2, 'abcdef01', '{"aiSeats":[],"enc":"gzip","seat":0}', now); for (let p = 0; p < 2; p++) sqlite.prepare('INSERT INTO lockstep_snapshot_parts (room, turn, part, data) VALUES (?, ?, ?, ?)').run(id, t, p, 'x'.repeat(40000)); }
  sqlite.exec('COMMIT');
  const head = { ...(await Lockstep.lookup(raw, id, 'h0')) };
  const msg = (x) => ({ after: -1, at: -1, rtt: 50, cmds: [], hashes: [], turns: true, seats: false, ...x });
  const time = async (fn, reps = 20) => { const out = []; for (let i = 0; i < reps; i++) { const t = performance.now(); await fn(); out.push(performance.now() - t); } out.sort((x, y) => x - y); return { p50: +out[Math.floor(out.length / 2)].toFixed(2), max: +out[out.length - 1].toFixed(2) }; };
  const clock = startAt + turns * 100 + 150;
  const live = await time(() => Lockstep.exchange(DB, id, head, msg({ after: turns - 3, at: turns - 4, hashes: [[turns * 2 - 20, 'abcdef01']].map(([step, hash]) => ({ step, hash })), seats: true }), clock));
  // Full catch-up from turn 0 in MAX_ROWS batches.
  let after = -1, batches = 0, rows = 0, bytes = 0; const t0 = performance.now();
  while (after < turns - 1 && batches < 1000) { const r = await Lockstep.exchange(DB, id, head, msg({ after }), clock); batches++; rows += r.rows.length; bytes += r.text.length; after = r.sealed; }
  const catchup = { batches, rows, bytes, ms: Math.round(performance.now() - t0) };
  const fresh = await Lockstep.exchange(DB, id, head, msg({ after: -1, fresh: true }), clock), offer = JSON.parse(fresh.text).snap;
  const snapTime = await time(() => Lockstep.exchange(DB, id, head, msg({ after: -1, fresh: true }), clock), 5);
  const plan = sqlite.prepare('EXPLAIN QUERY PLAN SELECT turn, seat, seq, cmd AS text FROM lockstep_cmds WHERE room = ?1 AND turn > ?2 AND turn <= (SELECT sealed FROM lockstep_rooms WHERE id = ?1) ORDER BY turn, seat, seq LIMIT ?3').all(id, turns - 3, 2000).map((r) => r.detail);
  const report = { config: o, turns, rows: { cmds: n, hashes: sqlite.prepare('SELECT COUNT(*) c FROM lockstep_hashes').get().c, cmdBytes: sqlite.prepare('SELECT SUM(LENGTH(cmd)) b FROM lockstep_cmds').get().b }, liveExchangeMs: live, catchupFromZero: catchup, snapshotOffer: offer, freshExchangeMs: snapTime, plan, note: 'node:sqlite on this VM, no network; add the D1 round trip (Sites p50 47 ms) per exchange/batch' };
  if (o.json) require('node:fs').writeFileSync(o.json, JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
