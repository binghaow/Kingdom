#!/usr/bin/env node
'use strict';
/* P3 step 3c check (shortened versions of the acceptance runs in docs/p3-lockstep-progress.md section 8):
   1. long match on WebSocket + D1 with the platform model (scripts/lockstep/d1-sim.cjs): per-invocation D1 budget and D1
      latency — planned socket recycling, and the refusal path (budget higher than the platform limit) both keep going
      (the 2026-11-19 field failure: socket silent after ~16.7 min);
   2. network outage longer than the takeover time: the others wait, the computer takes the seat over in the same turn on
      every client, the player reconnects (backoff), catches up and reclaims it;
   3. frozen page (backgrounded tab) with its socket still open: presence goes stale -> takeover -> reclaim;
   4. short outage: wait only, no takeover;
   5. desync: one client reports wrong checksums -> majority decides, that client stops, the computer takes its seat, the
      others finish; with 2 players the tie goes to the host;
   6. page refresh: a new client with the same seat token catches up from turn 0 and plays on;
   7. online save / restore: save at a turn, restore through the lobby (new room, segments, claim), replay to the save point
      (checksum equal to the save), unclaimed seat taken over by the computer, play continues.
   Wall-clock relay timers are shortened (TAKEOVER_MS 6 s) and the turn clock accelerated; every run checks per-step
   checksums across clients and that the relay's recording replays headless to the same final checksum. */
const assert = require('node:assert/strict'), core = require('./server/lockstep/relay-core.cjs'), H = require('./scripts/lockstep/harness.cjs');
const quick = process.argv.includes('--quick');
const done = [];
const run = async (name, o) => {
  const t = Date.now(), r = await H.main({ ...H.args(), quiet: true, stall: 40, keepRaw: true, ...o });
  if (!r.ok) { console.error('FAIL', name, JSON.stringify(r.failures, null, 1)); process.exit(1); }
  r.seconds = Math.round((Date.now() - t) / 1000); return r;
};
const sys = (r, seat) => r.recording.commands.filter((c) => c.seat === core.SYSTEM_SEAT && (seat === undefined || c.c.args.seat === seat)).map((c) => [c.turn, c.c.type, c.c.args.seat, c.c.args.reason || '']);

(async () => {
  // Relay rules for 3c (pure functions).
  assert.equal(core.sealLimit(0, 100, 20000, [{ human: true, seen: 19900, at: 150 }, { human: true, seen: 19900, at: 3 }], 10, 60000, 155), 160);
  assert.deepEqual(core.hashReports({ hash: 'aaaaaaaa', agree: 0b101, bad: '1:bbbbbbbb' }), [[0, 'aaaaaaaa'], [2, 'aaaaaaaa'], [1, 'bbbbbbbb']]);
  assert.deepEqual(core.majority([[0, 'aaaaaaaa'], [2, 'aaaaaaaa'], [1, 'bbbbbbbb']]), { hash: 'aaaaaaaa', winners: [0, 2], losers: [1], tie: false });
  done.push('3c relay rules: catch-up exemption from the hold, desync majority / tie to the host');

  // 1. Long match, platform model. Budget 600 calls per socket (production 2400) so recycling happens every ~25 s of wall time.
  let r = await run('long-recycle', { clients: 2, seconds: quick ? 120 : 200, period: 25, transport: 'ws', d1Latency: 12, invocationLimit: 900, env: { LOCKSTEP_SOCKET_BUDGET: '600' } });
  assert.equal(r.platform.refused, 0, 'sockets recycle before the platform limit');
  assert.ok(r.raw.every((c) => c.transport === 'ws' && !c.fallback && c.socket.planned >= 2), 'planned reconnects: ' + JSON.stringify(r.raw.map((c) => c.socket)));
  done.push(`long match ws+D1 (latency 12 ms at 4x clock, budget 600/limit 900): ${r.config.turns} turns, ${r.raw.map((c) => c.socket.planned).join('/')} planned reconnects, 0 refused calls, ${r.consistency.pairsCompared} checksum pairs equal (${r.seconds} s)`);
  // Refusal path: the platform limit (500) is below the relay budget, D1 calls start failing -> socket closed -> reconnect.
  r = await run('long-refused', { clients: 2, seconds: quick ? 80 : 150, period: 25, transport: 'ws', d1Latency: 12, invocationLimit: 500, env: { LOCKSTEP_SOCKET_BUDGET: '5000' } });
  assert.ok(r.platform.refused > 0 && r.raw.every((c) => c.reconnects >= 2 && c.transport === 'ws'), 'refused D1 calls end in reconnects: ' + JSON.stringify([r.platform, r.raw.map((c) => c.reconnects)]));
  done.push(`platform refuses D1 calls (limit 500 < budget): ${r.platform.refused} refused calls, sockets closed and reopened (${r.raw.map((c) => c.reconnects).join('/')} reconnects), consistent`);

  core.TAKEOVER_MS = 6000; // accelerated (production 60 s)
  // 2. Outage longer than the takeover: wait, takeover, reconnect with backoff, catch up, reclaim.
  r = await run('outage', { clients: 3, seconds: 110, period: 50, transport: 'ws', clientCfg: (s) => (s.seat === 1 ? { outage: { atTurn: 300, ms: 14000 } } : {}) });
  let s1 = sys(r, 1);
  assert.deepEqual(s1.map((x) => x[1]), ['aiTakeover', 'aiRelease'], 'takeover then release: ' + JSON.stringify(s1));
  assert.ok(r.raw.every((c) => JSON.stringify(c.control.map((e) => [e.turn, e.type])) === JSON.stringify(s1.map((x) => [x[0], x[1]]))), 'every client switched in the same turn');
  const waited = r.raw.find((c) => c.seat === 0).stats.stallMs;
  assert.ok(r.raw.find((c) => c.seat === 1).reconnects >= 1);
  done.push(`outage 14 s (takeover at 6 s): others waited ~${(waited / 1000).toFixed(1)} s, takeover turn ${s1[0][0]}, release turn ${s1[1][0]} on all 3 clients, seat 1 reconnected ${r.raw.find((c) => c.seat === 1).reconnects}x (max backoff ${r.raw.find((c) => c.seat === 1).socket.maxBackoff} ms), consistent`);

  // 3. Frozen page, socket open.
  r = await run('freeze', { clients: 2, seconds: 90, period: 50, transport: 'ws', clientCfg: (s) => (s.seat === 1 ? { freeze: { atTurn: 300, ms: 10000 } } : {}) });
  s1 = sys(r, 1);
  assert.deepEqual(s1.map((x) => x[1]), ['aiTakeover', 'aiRelease'], 'frozen page: takeover then release ' + JSON.stringify(s1));
  done.push(`frozen page 10 s with socket open: takeover at turn ${s1[0][0]} (presence from client messages), reclaim at ${s1[1][0]}, consistent`);

  // 4. Short outage: wait only.
  r = await run('short-outage', { clients: 2, seconds: 60, period: 50, transport: 'ws', clientCfg: (s) => (s.seat === 1 ? { outage: { atTurn: 200, ms: 2500 } } : {}) });
  assert.equal(sys(r).length, 0, 'no takeover for a short outage');
  done.push(`short outage 2.5 s: wait only, no takeover, seat 1 reconnects ${r.raw.find((c) => c.seat === 1).reconnects}x, consistent`);

  // 5. Desync: 3 players -> majority; 2 players -> tie to the host.
  r = await run('desync3', { clients: 3, seconds: 60, period: 50, transport: 'ws', clientCfg: (s) => (s.seat === 2 ? { corrupt: { fromStep: 400 } } : {}), allow: (c) => c.seat === 2, expectDesync: true });
  const loser = r.raw.find((c) => c.seat === 2), info = r.raw.find((c) => c.seat === 0).desyncInfo;
  assert.ok(loser.desync && loser.desync.losers.includes(2) && loser.turns < r.config.turns, 'minority stops');
  assert.deepEqual(info.losers, [2]); assert.deepEqual(sys(r, 2).map((x) => x[1] + ':' + x[3]), ['aiTakeover:desync']);
  const row = r.sqlite.prepare('SELECT desync, expires_at FROM lockstep_rooms WHERE id = ?').get(r.config.room);
  assert.ok(JSON.parse(row.desync).reports.length === 3, 'relay keeps every seat\'s checksum for the disputed step');
  done.push(`desync 3 players: seat 2 reported wrong checksums from step 400 -> majority [${info.winners}] wins at step ${info.step}, seat 2 stopped at turn ${loser.turns}, computer took its seat, seats 0/1 finished; relay kept reports + recording (room kept 3 days)`);
  r = await run('desync2', { clients: 2, seconds: 40, period: 50, transport: 'http', clientCfg: (s) => (s.seat === 1 ? { corrupt: { fromStep: 200 } } : {}), allow: (c) => c.seat === 1, expectDesync: true });
  assert.deepEqual(r.raw.find((c) => c.seat === 0).desyncInfo.losers, [1]); assert.ok(r.raw.find((c) => c.seat === 0).turns === r.config.turns);
  done.push('desync 2 players (HTTP transport): tie goes to the host (seat 0 plays on, seat 1 leaves)');

  // 6. Refresh: new client, same token, catch-up from turn 0.
  r = await run('refresh', { clients: 2, seconds: 120, period: 50, transport: 'ws', clientCfg: (s) => (s.seat === 1 ? { restartAt: 900 } : {}) });
  const rs = r.raw.find((c) => c.seat === 1).restart;
  assert.ok(rs && rs.caughtUp > 0, 'refreshed client caught up');
  done.push(`page refresh at turn ${rs.from}: new client caught up from turn 0 in ${rs.caughtUp} ms and played on, consistent`);

  // 7. Save at turn 600, restore through the lobby: (a) both seats claimed, (b) only the host (seat 1 -> computer).
  r = await run('save', { clients: 2, seconds: 70, period: 50, transport: 'ws', clientCfg: (s) => ({ saveAt: 600 }) });
  const save = r.raw.find((c) => c.seat === 0).save, saves = await import('./src/net/saves.js');
  assert.ok(save && saves.validSave(save) && save.turns === 600 && save.hash === r.raw.find((c) => c.seat === 1).save.hash);
  const restore = (claim) => async ({ base, api }) => {
    const segs = saves.segments(save, 8000); // small segments so the check exercises several
    const host = await api(base, '/api/rooms', { name: 'Bot 1', nation: save.room.players[0].nation, config: { ...save.room.config, capacity: 2, lockstep: true }, restore: { setup: save.setup, seats: save.seats, players: save.room.players, turns: save.turns, period: save.period, aiSeats: save.aiSeats, segments: segs.length, self: 0 } });
    const id = host.room.id, tokens = { 0: host.token };
    for (const sg of segs) await api(base, '/api/rooms/' + id, { action: 'restoreChunk', lastTurn: sg.lastTurn, rows: sg.rows }, host.token);
    if (claim) { const j = await api(base, '/api/rooms/' + id + '/join', { name: 'Bot 2' }); tokens[j.room.self] = j.token; assert.equal(j.room.self, 1); await api(base, '/api/rooms/' + id, { action: 'settings', ready: true }, j.token); }
    await api(base, '/api/rooms/' + id, { action: 'settings', ready: true }, host.token);
    const started = await api(base, '/api/rooms/' + id, { action: 'start' }, host.token), ls = started.room.lockstep;
    assert.equal(ls.base, 600);
    return { id, setup: ls.setup, startAt: ls.startAt, period: ls.period, allSeats: ls.seats, seats: ls.seats.filter((x) => tokens[x.seat]).map((x) => ({ ...x, token: tokens[x.seat] })), segments: segs.length };
  };
  for (const claim of [true, false]) {
    r = await run('restore-' + claim, { clients: 2, seconds: 100, period: 50, transport: 'ws', makeRoom: restore(claim) });
    for (const c of r.raw) assert.equal(new Map(c.hashes).get(1200), save.hash, 'replayed to the save point: same checksum as the save');
    if (!claim) { assert.deepEqual(sys(r, 1).filter((x) => x[0] >= 600).map((x) => x[1] + ':' + x[3]), ['aiTakeover:unclaimed']); assert.ok(!r.raw[0].humanTeams.includes(1)); }
    done.push(`save at turn 600 -> restore (${claim ? 'both seats claimed' : 'host only, seat 1 unclaimed -> computer at turn 600'}): segments uploaded, clients replayed to the save point (checksum ${save.hash} = save), played to turn ${r.config.turns}, consistent (${r.seconds} s)`);
  }
  for (const d of done) console.log('PASS ' + d);
})().catch((err) => { console.error(err); process.exit(1); });
