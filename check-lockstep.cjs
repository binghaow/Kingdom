#!/usr/bin/env node
'use strict';
/* P3 lockstep check (shortened acceptance runs; the full ones are in docs/p3-lockstep-progress.md):
   relay rules, 4 headless clients through the /api/rooms lobby for 60 game seconds (accelerated), HTTP with 300 ms jitter + 5 %
   loss, WebSocket on D1 (B2) with the platform closing sockets every 4 s, Durable Object (B1) adapter, automatic fallback
   to HTTP when sockets are unavailable, and that rooms without the lockstep option are untouched. */
const assert = require('node:assert/strict'), core = require('./server/lockstep/relay-core.cjs'), service = require('./server/service.cjs'), H = require('./scripts/lockstep/harness.cjs');
const done = [];
(async () => {
  // Relay rules.
  assert.equal(core.clockTurn(1000, 100, 1250), 2);
  assert.equal(core.sealLimit(0, 100, 1050, []), 9);
  assert.equal(core.sealLimit(0, 100, 1050, [{ human: true, seen: 1000, at: 3 }]), 9);
  assert.equal(core.sealLimit(0, 100, 5000, [{ human: true, seen: 4900, at: 10 }]), 10 + core.AHEAD, 'a slow active seat holds sealing');
  assert.equal(core.sealLimit(0, 100, 20000, [{ human: true, seen: 1000, at: 10 }]), 20, 'a seat silent for less than TAKEOVER_MS still holds (waiting, takeover countdown)');
  assert.equal(core.sealLimit(0, 100, 90000, [{ human: true, seen: 1000, at: 10 }]), 899, 'a seat silent for TAKEOVER_MS no longer holds');
  assert.equal(core.sealLimit(0, 100, 20000, [{ human: true, seen: 19000, at: 10, mode: 1 }]), 199, 'a seat under computer takeover never holds');
  assert.equal(core.sealLimit(0, 100, 20000, [{ human: true, seen: 19900, at: 150 }, { human: true, seen: 19900, at: 3 }], 10, 60000, 155), 160, 'a seat catching up (more than CATCHUP behind) does not hold the others');
  assert.equal(core.sealLimit(0, 100, 20000, [{ human: true, seen: 19900, at: 40 }, { human: true, seen: 19900, at: 3 }], 10, 60000, 500), 50, 'everybody catching up: the most advanced seat paces the relay');
  assert.deepEqual(core.majority([[0, 'aaaaaaaa'], [1, 'bbbbbbbb'], [2, 'aaaaaaaa']]).losers, [1], 'desync: majority wins');
  assert.deepEqual(core.majority([[0, 'aaaaaaaa'], [1, 'bbbbbbbb']]).losers, [1], 'desync tie: the group with the lowest seat (host) wins');
  assert.equal(core.majority([[0, 'aaaaaaaa'], [1, 'aaaaaaaa']]), null);
  assert.equal(core.assignTurn(7, 0, 100, 650), 8); assert.equal(core.assignTurn(3, 0, 100, 650), 6); assert.equal(core.assignTurn(3, 0, 100, 9000, 13), 14, 'held relay: next open turn, not the wall-clock turn');
  assert.equal(core.adaptDelay(2, [40, 50, 60]), 2); assert.equal(core.adaptDelay(2, [400, 420]), 3, 'one step at a time'); assert.equal(core.adaptDelay(5, [900]), 5); assert.equal(core.adaptDelay(4, [10]), 3);
  assert.throws(() => core.parseClient({ c: [[0, { type: 'train' }]] })); assert.throws(() => core.parseClient({ c: [[1, { type: 'x y' }]] }));
  assert.equal(core.parseClient({ h: [[21, 'abcdef01'], [20, 'zz'], [40, 'abcdef01']] }).hashes.length, 1, 'only well-formed checksums on 20-step marks');
  const e = {}; assert.equal(core.recordHash(e, 0, 'aaaaaaaa'), false); assert.equal(core.recordHash(e, 1, 'aaaaaaaa'), false); assert.equal(core.recordHash(e, 2, 'bbbbbbbb'), true); assert.equal(e.agree, 3);
  done.push('relay rules: turn clock, sealing + hold, assignment, adaptive delay 2-5, envelope and checksum checks');
  // Old rooms unchanged.
  assert.equal('lockstep' in service.config({ capacity: 2 }), false); assert.equal(service.config({ capacity: 2, lockstep: true }).lockstep, true);
  done.push('rooms without the lockstep option keep the old config (server-authoritative path untouched)');
  const run = async (name, o) => { const r = await H.main({ ...H.args(), quiet: true, ...o }); if (!r.ok) { console.error(name, JSON.stringify(r.failures)); process.exit(1); } return r; };
  let r = await run('lobby', { clients: 4, seconds: 60, period: 25, lobby: true });
  assert.ok(r.consistency.pairsCompared >= 150 && r.consistency.relayMismatches === 0 && r.consistency.replayFinal === r.consistency.final);
  done.push(`4 headless clients via /api/rooms lobby, 60 game s: ${r.consistency.checksumsPerClient} checksums each identical, recording replays to ${r.consistency.final}`);
  r = await run('faults', { clients: 2, seconds: 20, period: 100, jitter: 300, loss: 0.05 });
  const lost = r.clients.reduce((n, c) => n + c.lost.lostUp + c.lost.lostDown, 0);
  assert.ok(lost > 0, 'loss injected');
  done.push(`HTTP with 0-300 ms jitter + 5% loss: completed, consistent (${lost} requests lost and retried)`);
  r = await run('ws-d1', { clients: 2, seconds: 20, period: 100, transport: 'ws', wsLimit: 4 });
  assert.ok(r.clients.every((c) => c.transport === 'ws' && !c.fallback && c.reconnects >= 2), 'sockets closed by the platform reconnect and catch up: ' + JSON.stringify(r.clients.map((c) => [c.transport, c.fallback, c.reconnects])));
  done.push(`WebSocket on D1 (B2), sockets closed every 4 s: ${r.clients.map((c) => c.reconnects).join('/')} reconnects, consistent`);
  r = await run('ws-do', { clients: 2, seconds: 15, period: 100, transport: 'ws', durable: true });
  assert.ok(r.clients.every((c) => c.transport === 'ws' && !c.fallback));
  done.push('Durable Object adapter (B1, local in-memory object): consistent');
  r = await run('fallback', { clients: 2, seconds: 10, period: 100, transport: 'ws', noWs: true });
  assert.ok(r.clients.every((c) => c.transport === 'http' && c.fallback), 'falls back to HTTP');
  done.push('no WebSocket support: clients fall back to HTTP automatically and stay consistent');
  for (const d of done) console.log('PASS ' + d);
})().catch((err) => { console.error(err); process.exit(1); });
