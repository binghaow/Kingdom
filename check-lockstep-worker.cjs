#!/usr/bin/env node
'use strict';
/* P4 step 4c-2: lockstep multiplayer simulation in public/sim-worker.js runs identically to the main thread.
   1. public/sim-worker.js and public/kingdom-core.js are up to date with src/.
   2. A 3-nation match (2 human seats + 1 computer seat) with player commands AND relay system commands (aiTakeover /
      aiRelease on seat 1 and seat 0 caretaker) runs on the main thread (LockstepClient) and inside the bundled worker
      (Node worker_threads, real lsInit / lsStep / lsChecksum messages, irregular turn batches + slim views):
      - every 20-step checksum matches; final checksum matches;
      - command results, control events and aiSeats/aiTeams match;
      - slim per-player views expand cleanly via K.networkExpand and match main-thread K.networkSnapshot.
   3. Snapshot resume (lsLoadSnapshot): a normalized snapshot loaded in the worker verifies its checksum, rejects a bad
      hash, resumes at the snapshot turn and produces identical subsequent checksums to main-thread LockstepClient.
   4. Opt-in pipeline profiling (profile: true / false): returns named system timings only when enabled.
   usage: node check-lockstep-worker.cjs */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { Worker } = require('node:worker_threads'), { pathToFileURL } = require('node:url');
const ROOT = __dirname, { buildWorker, WORKER_OUT } = require('./scripts/build-core.cjs');

const code = fs.readFileSync(WORKER_OUT, 'utf8');
assert.equal(code, buildWorker().code, 'public/sim-worker.js is stale: run npm run build');

const SHIM = `const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;globalThis.postMessage=m=>parentPort.postMessage(m);parentPort.on('message',d=>globalThis.onmessage&&globalThis.onmessage({data:d}));\n`;
function spawn() {
  const w = new Worker(SHIM + code, { eval: true });
  const inbox = [], wait = [];
  w.on('message', (m) => { if (wait.length) wait.shift()(m); else inbox.push(m); });
  w.on('error', (e) => { throw e; });
  const next = () => (inbox.length ? Promise.resolve(inbox.shift()) : new Promise((r) => wait.push(r)));
  return { w, next, post: (m) => w.postMessage(m) };
}

async function main() {
  const { LockstepClient, SYSTEM_SEAT } = await import(pathToFileURL(path.join(ROOT, 'src/net/lockstep.js')).href);
  const { checksum } = await import(pathToFileURL(path.join(ROOT, 'src/core/hash.js')).href);
  const K = require(path.join(ROOT, 'public/little-ant.js'));
  const commands = require(path.join(ROOT, 'public/network-commands.js'));

  const setup = {
    difficulty: 'normal',
    netMode: 'ffa',
    names: ['甲', '乙', '电脑丙'],
    options: { nations: ['britain', 'france', 'china'], groups: [1, 2, 3], humanTeams: [0, 1], mapId: 'coast_s', fog: true, minerals: 'standard', seed: 4242 },
  };
  const seats = [{ seat: 0, team: 0 }, { seat: 1, team: 1 }];
  const TOTAL_TURNS = 220;

  // Build deterministic command stream (player orders + training + chat + aiTakeover/aiRelease including team 0 caretaker).
  const probe = new LockstepClient({ K, commands, setup, seat: 0, seats, startAt: 0, period: 100, now: () => 0 });
  const town0 = probe.sim.s.buildings.find((b) => b.team === 0 && b.kind === 'town');
  const town1 = probe.sim.s.buildings.find((b) => b.team === 1 && b.kind === 'town');
  const vills0 = probe.sim.s.units.filter((u) => u.team === 0 && u.kind === 'villager').map((u) => u.id);
  const vills1 = probe.sim.s.units.filter((u) => u.team === 1 && u.kind === 'villager').map((u) => u.id);
  const rows = [
    [2, 0, 1, { type: 'train', args: { id: town0.id, kind: 'villager' } }],
    [2, 1, 1, { type: 'train', args: { id: town1.id, kind: 'villager' } }],
    [5, 0, 2, { type: 'order', args: { ids: vills0.slice(0, 2), order: { type: 'move', x: town0.x + 120, y: town0.y + 40 } } }],
    [6, 1, 2, { type: 'order', args: { ids: vills1.slice(0, 2), order: { type: 'move', x: town1.x - 120, y: town1.y - 40 } } }],
    [12, 0, 3, { type: 'chat', args: { text: 'hello worker', channel: 'all' } }],
    [35, SYSTEM_SEAT, 1, { type: 'aiTakeover', args: { seat: 1, team: 1, reason: 'offline' } }],
    [90, SYSTEM_SEAT, 2, { type: 'aiTakeover', args: { seat: 0, team: 0, reason: 'offline' } }],
    [135, SYSTEM_SEAT, 3, { type: 'aiRelease', args: { seat: 0, team: 0 } }],
    [150, SYSTEM_SEAT, 4, { type: 'aiRelease', args: { seat: 1, team: 1 } }],
    [165, 0, 4, { type: 'train', args: { id: town0.id, kind: 'villager' } }],
    [170, 1, 3, { type: 'train', args: { id: town1.id, kind: 'villager' } }],
  ];

  // 1. Main-thread reference run.
  const mainResults = [], mainControls = [];
  const mainClient = new LockstepClient({
    K, commands, setup, seat: 0, seats, startAt: 0, period: 100, now: () => 0,
    onResult: (result, cmd, _lat, seq) => mainResults.push({ seq, type: cmd.type, result }),
  });
  mainClient.onControl = (e) => mainControls.push(e);
  mainClient.receive({ t: rows, se: TOTAL_TURNS - 1 });
  mainClient.sparseCatchup = false;
  const referenceCheckpoints = new Map();
  while (mainClient.nextTurn < TOTAL_TURNS) {
    mainClient.runTurn();
    const h = mainClient.hashQueue.at(-1);
    if (h?.[0] === mainClient.step) referenceCheckpoints.set(mainClient.nextTurn, { turn: mainClient.nextTurn, step: mainClient.step, hash: h[1], aiSeats: [...mainClient.aiSeats], logFrom: mainClient.logFrom || 0 });
  }
  const mainFinal = checksum(mainClient.sim).hash;

  // 2. Worker run with irregular batches + slim view expansion + profiling toggle.
  const { w, next, post } = spawn();
  post({ t: 'lsInit', setup, seat: 0, seats, startAt: 0, period: 100, navRoom: 'test-room', hashes: true, profile: false });
  let m = await next();
  assert.equal(m.t, 'lsReady', 'lsInit failed: ' + JSON.stringify(m));
  assert.equal(m.hash, checksum(probe.sim).hash, 'initial worker lockstep hash differs from main thread');

  const workerHashes = [], workerResults = [], workerControls = [];
  const cache = {};
  let have = {}, lastEvent = 0, viewTurn = -1, viewsChecked = 0, nextRow = 0, curTurn = 0, reqCount = 0;
  let rng = 777;
  const rand = () => (rng = (rng * 1103515245 + 12345) >>> 0) / 4294967296;
  const sortedRows = rows.slice().sort((a, b) => a[0] - b[0]);

  while (curTurn < TOTAL_TURNS) {
    const batch = 1 + Math.floor(rand() * 7);
    const limit = Math.min(TOTAL_TURNS - 1, curTurn + batch - 1);
    const sendRows = [];
    while (nextRow < sortedRows.length && sortedRows[nextRow][0] <= limit) sendRows.push(sortedRows[nextRow++]);
    const wantView = reqCount++ % 3 === 0 || limit === TOTAL_TURNS - 1;
    post({ t: 'lsStep', rows: sendRows, sealed: limit, limit, budget: 5000, wantView, viewTurn, eventAfter: lastEvent, have });
    const f = await next();
    assert.equal(f.t, 'lsFrame', 'unexpected worker reply: ' + JSON.stringify(f).slice(0, 300));
    assert.equal(f.sysProfile, null, 'profile: false must not emit sysProfile');
    assert.equal(f.diag, null, 'profile: false must not emit worker diagnostics');
    if (f.checkpoint) assert.deepEqual(f.checkpoint, referenceCheckpoints.get(f.checkpoint.turn), 'save checkpoint hash/AI seats must describe the exact reference turn');
    curTurn = f.nextTurn;
    workerHashes.push(...f.hashes);
    for (const r of f.results) workerResults.push({ seq: r.seq, type: r.cmd.type, result: r.result });
    workerControls.push(...f.controls);
    if (f.view) {
      viewTurn = f.viewTurn;
      const marks = f.view.slim;
      assert.equal(K.networkExpand(f.view, cache), true, 'worker slim view failed to expand at turn ' + viewTurn);
      have = { ...marks };
      lastEvent = f.view.eventSeq;
      viewsChecked++;
    }
  }

  assert.deepEqual(workerHashes, mainClient.hashLog, 'worker lockstep checksum sequence differs from main thread');
  assert.deepEqual(workerResults, mainResults, 'worker command results differ from main thread');
  assert.deepEqual(workerControls, mainControls, 'worker control events differ from main thread');
  assert.ok(viewsChecked >= 15, 'expected multiple expanded slim views, got ' + viewsChecked);

  post({ t: 'lsChecksum', q: 1 });
  m = await next();
  assert.equal(m.t, 'lsChecksum');
  assert.equal(m.hash, mainFinal, 'worker final checksum differs from main thread');
  assert.equal(m.turn, TOTAL_TURNS);

  // Compare final slim view against main-thread networkSnapshot.
  const mainView = K.networkSnapshot(mainClient.sim, 0, 0, { slim: false });
  post({ t: 'lsStep', rows: [], sealed: TOTAL_TURNS - 1, limit: TOTAL_TURNS - 1, budget: 5000, wantView: true, viewTurn: -1, eventAfter: 0, have: {} });
  const vf = await next();
  assert.ok(vf.view, 'expected final full slim view');
  assert.equal(K.networkExpand(vf.view, {}), true, 'final slim view failed to expand');
  assert.equal(vf.view.state.time, mainView.state.time);
  assert.equal(vf.view.state.units.length, mainView.state.units.length);
  assert.equal(vf.view.state.buildings.length, mainView.state.buildings.length);
  assert.deepEqual(vf.view.state.resources[0], mainView.state.resources[0]);
  assert.deepEqual(vf.view.state.ages, mainView.state.ages);

  // 3. Snapshot load + bad-hash rejection + subsequent determinism.
  const snapText = JSON.stringify(K.networkPersistent(mainClient.sim));
  const snapSim = K.networkHydrate(JSON.parse(snapText));
  const snapHash = checksum(snapSim).hash;
  post({ t: 'lsLoadSnapshot', q: 2, snap: { turn: 220, hash: '00000000', text: snapText, aiSeats: [] } });
  m = await next();
  assert.equal(m.t, 'lsSnapshotLoaded');
  assert.equal(m.ok, false, 'corrupted snapshot hash must be rejected');

  post({ t: 'lsLoadSnapshot', q: 3, snap: { turn: 220, hash: snapHash, text: snapText, aiSeats: [] } });
  m = await next();
  assert.equal(m.t, 'lsSnapshotLoaded');
  assert.equal(m.ok, true, 'valid snapshot load failed');
  assert.equal(m.hash, snapHash);
  assert.equal(m.nextTurn, 220);

  // Enable profiling and run 40 more turns in both main and worker after snapshot load.
  const mainSnap = new LockstepClient({ K, commands, setup, seat: 0, seats, startAt: 0, period: 100, now: () => 0 });
  assert.equal(mainSnap.loadSnapshot({ turn: 220, hash: snapHash, text: snapText, aiSeats: [] }).ok, true);
  mainSnap.sealed = 259; mainSnap.sparseCatchup = false;
  while (mainSnap.nextTurn < 260) mainSnap.runTurn();

  post({ t: 'profile', on: true });
  post({ t: 'lsStep', rows: [], sealed: 259, limit: 259, budget: 10000, wantView: false, viewTurn: -1 });
  const pf = await next();
  assert.equal(pf.t, 'lsFrame');
  assert.ok(pf.sysProfile && pf.sysProfile.units && pf.sysProfile.collision, 'profile: true must report pipeline system timings');
  post({ t: 'lsChecksum', q: 4 });
  const postSnap = await next();
  assert.equal(postSnap.hash, checksum(mainSnap.sim).hash, 'post-snapshot checksum differs between worker and main thread');
  assert.deepEqual(pf.hashes, mainSnap.hashQueue, 'post-snapshot hash sequence differs');
  post({ t: 'profile', on: false });
  post({ t: 'lsStep', rows: [], sealed: 259, limit: 259, budget: 100, wantView: false });
  const disabled = await next();
  assert.equal(disabled.sysProfile, null);
  assert.equal(disabled.diag, null);

  await w.terminate();
  console.log(`PASS lockstep worker: 3-nation (2 human + 1 AI) ${TOTAL_TURNS} turns (${workerHashes.length} checksums, ${workerResults.length} results, ${workerControls.length} control events, ${viewsChecked} slim views) identical between main thread and worker (final ${mainFinal}); snapshot load + bad-hash reject + 40 post-snap turns identical (${postSnap.hash}); opt-in pipeline profile works`);
}

main().catch((e) => { console.error('FAIL', e.stack || e); process.exit(1); });
