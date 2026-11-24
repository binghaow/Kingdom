#!/usr/bin/env node
'use strict';
/* P3 step 3e check: restoring an online room from a save starts from the save's newest snapshot instead of turn 0.
   1. save format: the snapshot travels with the save (validSave), upload segments hold only the commands from the snapshot
      turn on, a save whose commands start after turn 0 is only valid with a snapshot;
   2. room service: bad snapshot metadata is refused, the room cannot start before every snapshot part is uploaded, the
      started relay room offers that snapshot (agreed step hash) and carries lockstep.snap for the clients;
   3. end to end (relay + 2 headless clients running the browser's lockstep code, WebSocket + D1): a 5.5-minute save
      (snapshot at turn 3000) restored through the lobby — both clients download and verify the snapshot, replay only turns
      3000..3299, reach the save point with the save's checksum and play on consistently; the relay's recording replays from
      the snapshot to the same final checksum. Host-only variant: the unclaimed seat goes to the computer at the save turn.
   4. before/after: the same save restored without its snapshot (the 3c path, replay from turn 0) reaches the save point
      later than with it. */
const assert = require('node:assert/strict'), path = require('node:path'), { pathToFileURL } = require('node:url');
const H = require('./scripts/lockstep/harness.cjs'), core = require('./server/lockstep/relay-core.cjs');
const { DatabaseSync } = require('node:sqlite'), { sqliteD1 } = require('./scripts/sqlite-d1.cjs'), fs = require('node:fs');
const done = [];

(async () => {
  const saves = await import(pathToFileURL(path.resolve('src/net/saves.js')).href);
  const t0 = Date.now(), { save, msPerTurn } = await require('./scripts/lockstep/synthetic-save.cjs').build({ turns: 3300, seed: 7 });
  assert.ok(save.snapshot && save.snapshot.turn === 3000 && save.turns === 3300, 'save carries the turn-3000 snapshot');
  done.push(`synthetic 5.5-minute save built headless in ${Math.round((Date.now() - t0) / 1000)} s (${msPerTurn.toFixed(1)} ms/turn), snapshot ${Math.round(save.snapshot.data.length / 1024)} KB gzip+base64`);

  // 1. Save format.
  assert.ok(saves.validSave(save));
  const segs = saves.segments(save, 8000), rows = segs.flatMap((s) => s.rows);
  assert.ok(rows.length > 0 && rows.every((r) => r[0] >= 3000) && segs.at(-1).lastTurn === 3299, 'segments hold only turns >= snapshot');
  assert.equal(rows.length, save.commands.filter((c) => c.turn >= 3000).length);
  assert.equal(saves.validSave({ ...save, snapshot: { ...save.snapshot, turn: 2999 } }), false);
  assert.equal(saves.validSave({ ...save, snapshot: undefined, from: 3000 }), false, 'commands after turn 0 need the snapshot');
  const noSnap = { ...save, snapshot: undefined };
  assert.ok(saves.validSave(noSnap) && saves.segments(noSnap).flatMap((s) => s.rows).length === save.commands.length, 'pre-3e saves restore from turn 0');
  const decoded = await saves.saveSnapshot(save);
  done.push(`save format: ${rows.length} of ${save.commands.length} commands uploaded (turns >= 3000), snapshot required when commands start after turn 0, old saves unchanged`);

  // 2. Room service rules (in-process, SQLite D1).
  {
    const S = require('./server/service.cjs'), db = new DatabaseSync(':memory:');
    for (const f of ['0000_multiplayer.sql', '0001_room_limits.sql']) db.exec(fs.readFileSync(path.join('drizzle', f), 'utf8'));
    const env = { DB: sqliteD1(db) };
    const call = async (p, body, token, expected = 200) => { const r = await S.handle(new Request('https://kingdom.test' + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }), env), j = await r.json(); assert.equal(r.status, expected, p + ' ' + (j.error || '')); return j; };
    const parts = saves.snapshotParts(save, 30000);
    const restore = (snap) => ({ setup: save.setup, seats: save.seats, players: save.room.players, turns: save.turns, period: save.period, aiSeats: save.aiSeats, segments: segs.length, self: 0, ...(snap ? { snapshot: snap } : {}) });
    const meta = { turn: 3000, hash: save.snapshot.hash, enc: save.snapshot.enc, aiSeats: [], parts: parts.length };
    await call('/api/rooms', { name: 'h', nation: 'britain', config: { capacity: 2, mapId: 'coast_s' }, restore: restore({ ...meta, turn: 3001 }) }, null, 400);
    await call('/api/rooms', { name: 'h', nation: 'britain', config: { capacity: 2, mapId: 'coast_s' }, restore: restore({ ...meta, turn: 6000 }) }, null, 400);
    await call('/api/rooms', { name: 'h', nation: 'britain', config: { capacity: 2, mapId: 'coast_s' }, restore: restore({ ...meta, hash: 'xyz' }) }, null, 400);
    const host = await call('/api/rooms', { name: 'h', nation: 'britain', config: { capacity: 2, mapId: 'coast_s' }, restore: restore(meta) }, null, 201), id = host.room.id;
    assert.deepEqual(host.room.restore.snapshot, { turn: 3000, parts: parts.length, uploaded: 0 });
    for (const sg of segs) await call('/api/rooms/' + id, { action: 'restoreChunk', lastTurn: sg.lastTurn, rows: sg.rows }, host.token);
    const j = await call('/api/rooms/' + id + '/join', { name: 'g' }); await call('/api/rooms/' + id, { action: 'settings', ready: true }, j.token);
    await call('/api/rooms/' + id, { action: 'restoreSnap', part: 0, data: parts[0] }, j.token, 403);
    await call('/api/rooms/' + id, { action: 'restoreSnap', part: parts.length, data: 'x' }, host.token, 400);
    await call('/api/rooms/' + id, { action: 'settings', ready: true }, host.token);
    await call('/api/rooms/' + id, { action: 'start' }, host.token, 409); // snapshot not uploaded yet
    let last; for (let i = 0; i < parts.length; i++) last = await call('/api/rooms/' + id, { action: 'restoreSnap', part: i, data: parts[i] }, host.token);
    assert.equal(last.room.restore.snapshot.uploaded, parts.length);
    const st = await call('/api/rooms/' + id, { action: 'start' }, host.token);
    assert.deepEqual(st.room.lockstep.snap, { turn: 3000, hash: save.snapshot.hash }); assert.equal(st.room.lockstep.base, 3300);
    const r = await call('/api/lockstep/' + id, { a: -1, x: -1, w: 0, s: 1 }, host.token);
    assert.ok(r.snap && r.snap.turn === 3000 && r.snap.hash === save.snapshot.hash, 'relay offers the restore snapshot: ' + JSON.stringify(r.snap));
    const got = await call('/api/lockstep/' + id, { snapget: 3000 }, host.token);
    assert.equal(got.data.join(''), save.snapshot.data);
    done.push(`room service: bad snapshot metadata refused (400), only the host uploads (403), start waits for all ${parts.length} parts (409), relay offers the snapshot with its agreed checksum`);
  }

  // 3. End to end through the lobby + relay (WebSocket + D1), 2 headless clients.
  const { makeRestoreRoom } = require('./scripts/lockstep/restore-room.cjs'), makeRoom = (s, claim) => makeRestoreRoom(saves, s, { claim, decoded });
  const run = async (name, o) => {
    const t = Date.now(), r = await H.main({ ...H.args(), quiet: true, stall: 60, keepRaw: true, clients: 2, period: 50, transport: 'ws', clientCfg: () => ({ markTurn: 3300 }), ...o });
    if (!r.ok) { console.error('FAIL', name, JSON.stringify(r.failures, null, 1)); process.exit(1); }
    r.seconds = Math.round((Date.now() - t) / 1000); return r;
  };
  let r = await run('restore-snapshot', { seconds: 360, makeRoom: makeRoom(save, true) });
  for (const c of r.raw) {
    assert.equal(c.snapshotTurn, 3000, 'client resumed from the save snapshot');
    assert.equal(c.snapshots.loads, 1);
    assert.equal(new Map(c.hashes).get(6600), save.hash, 'save point reached with the save checksum');
  }
  const after = r.raw.map((c) => c.mark), loadMs = r.raw.map((c) => c.snapshots.lastLoad.ms);
  done.push(`restore from snapshot (both seats claimed): both clients loaded+verified the turn-3000 snapshot (${loadMs.join('/')} ms), replayed 300 turns, reached the save point (checksum ${save.hash}) after ${after.join('/')} ms, played to turn ${r.config.turns}, ${r.consistency.pairsCompared} checksum pairs equal, relay recording replays from the snapshot to the same final (${r.seconds} s)`);

  core.TAKEOVER_MS = 6000;
  r = await run('restore-snapshot-host-only', { seconds: 345, makeRoom: makeRoom(save, false), clients: 1 });
  const sys = r.recording.commands.filter((c) => c.seat === core.SYSTEM_SEAT && c.turn >= 3300).map((c) => c.c.type + ':' + c.c.args.reason);
  assert.deepEqual(sys, ['aiTakeover:unclaimed']); assert.equal(r.raw[0].snapshotTurn, 3000); assert.ok(!r.raw[0].humanTeams.includes(1));
  done.push('restore from snapshot, host only: seat 1 unclaimed -> computer at turn 3300, snapshot path, consistent with the relay recording');

  // 4. Before/after: the same save without its snapshot replays from turn 0 (3c behaviour, kept for old saves).
  r = await run('restore-from-0', { seconds: 335, makeRoom: makeRoom(noSnap, true), clientCfg: () => ({ markTurn: 3300 }) });
  for (const c of r.raw) { assert.equal(c.snapshotTurn, null); assert.equal(new Map(c.hashes).get(6600), save.hash); }
  const before = r.raw.map((c) => c.mark);
  assert.ok(Math.max(...after) < Math.min(...before), `snapshot restore reaches the save point sooner: ${after} vs ${before}`);
  done.push(`before/after (same 5.5-minute save, 2 clients on this machine): replay from turn 0 reached the save point after ${before.join('/')} ms; from the snapshot ${after.join('/')} ms`);

  for (const d of done) console.log('PASS ' + d);
})().catch((err) => { console.error(err); process.exit(1); });
