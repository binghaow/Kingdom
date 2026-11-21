#!/usr/bin/env node
'use strict';
/* One Node headless lockstep client (P3 step 3a). Runs the real Sim (public/network-model.js) and the shared command rules
   (public/network-commands.js) through src/net/lockstep.js + src/net/http-transport.js against an HTTP relay, driven by a
   scripted bot. Started by scripts/lockstep/harness.cjs with one JSON argument; prints one JSON result line at the end.
   Fault injection (all optional): delay (base one-way ms), jitter (extra uniform 0..jitter ms per request, split up/down),
   loss (probability a request is lost: half before reaching the relay, half after it was processed = lost reply). */
const path = require('node:path'), { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '../..');
const cfg = JSON.parse(process.argv[2]);
const K = require(path.join(ROOT, 'public/network-model.js')), commands = require(path.join(ROOT, 'public/network-commands.js')), { createBot } = require('./bot.cjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function faultyFetch(f) {
  let seed = (cfg.seat + 1) * 2654435761 >>> 0; const rand = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
  const stats = { lostUp: 0, lostDown: 0 };
  const wrapped = async (url, init) => {
    const extra = (cfg.jitter || 0) * rand(), up = (cfg.delay || 0) + extra / 2, down = (cfg.delay || 0) + extra / 2, roll = rand();
    if (up > 0) await sleep(up);
    if (roll < (cfg.loss || 0) / 2) { stats.lostUp++; await sleep(cfg.lossTimeout || 300); throw new Error('simulated loss (request)'); }
    const res = await f(url, init); const body = await res.text();
    if (down > 0) await sleep(down);
    if (roll < (cfg.loss || 0)) { stats.lostDown++; await sleep(cfg.lossTimeout || 300); throw new Error('simulated loss (reply)'); }
    return { ok: res.ok, status: res.status, text: async () => body };
  };
  wrapped.stats = stats; return wrapped;
}

/* 3c fault injection (all optional, by turn reached on this client):
   outage {atTurn, ms}   network down: sockets closed, new sockets fail, HTTP fails (the iPad on a flaky network)
   freeze {atTurn, ms}   the whole page frozen (backgrounded tab / lock screen): the process blocks, sockets stay open
   corrupt {fromStep}    this client reports wrong checksums from that step (desync handling)
   restartAt turn        page refresh: client + transport discarded, a new one rejoins with the same seat token and
                         catches up from turn 0
   saveAt turn           3c online save at that turn (src/net/saves.js makeSave), returned in the result */
(async () => {
  const { LockstepClient } = await import(pathToFileURL(path.join(ROOT, 'src/net/lockstep.js')).href);
  const { AutoTransport } = await import(pathToFileURL(path.join(ROOT, 'src/net/auto-transport.js')).href);
  const saves = await import(pathToFileURL(path.join(ROOT, 'src/net/saves.js')).href);
  const { attachSnapshots } = await import(pathToFileURL(path.join(ROOT, 'src/net/snapshots.js')).href);
  const now = () => performance.timeOrigin + performance.now();
  const t0 = Date.now();
  let offlineUntil = 0;
  const offline = () => Date.now() < offlineUntil;
  const NativeWS = globalThis.WebSocket;
  class FlakyWS extends NativeWS { constructor(url) { super(offline() ? 'ws://127.0.0.1:9/offline' : url); } }
  const fetch = faultyFetch(async (...a) => { if (offline()) throw new Error('offline (simulated)'); return globalThis.fetch(...a); });
  const hashMod = await import(pathToFileURL(path.join(ROOT, 'src/core/hash.js')).href);
  const endTurn = cfg.turns, samples = []; let stepMs = 0, steps = 0, maxStep = 0, finalAtEnd = null, switched = null, save = null, restart = null;
  const bot = createBot(K, cfg.seat, cfg.seats.find((x) => x.seat === cfg.seat)?.team ?? -1, cfg.botSeed || 1);
  const faults = { outage: cfg.outage ? { ...cfg.outage, done: false } : null, freeze: cfg.freeze ? { ...cfg.freeze, done: false } : null };
  let client, transport, buildMs = 0, prevHashes = [], snaps = null;
  function session() {
    const b0 = Date.now();
    const c = new LockstepClient({ K, commands, setup: cfg.setup, seat: cfg.seat, seats: cfg.seats, startAt: cfg.startAt, period: cfg.period, now });
    buildMs = Date.now() - b0;
    const t = new AutoTransport({ mode: cfg.transport || 'http', httpUrl: cfg.base + '/api/lockstep/' + cfg.room, wsUrl: cfg.base.replace(/^http/, 'ws') + '/api/lockstep/' + cfg.room + '/ws' + (cfg.wsPath || ''), token: cfg.token, client: c, fetch, WebSocket: FlakyWS, timeout: cfg.timeout || 4000, stallMs: cfg.stallMs, onSwitch: (r) => { switched = r; } });
    if (cfg.trace) c.stats.trace = [];
    const run = c.runTurn.bind(c);
    c.runTurn = () => {
      const turn = c.nextTurn, a = performance.now(); run(); const d = performance.now() - a; stepMs += d; steps++; if (d > maxStep) maxStep = d;
      if (cfg.corrupt) for (const h of c.hashQueue) if (h[0] >= cfg.corrupt.fromStep && !h.bad) { h[1] = (h[1][0] === 'f' ? '0' : 'f') + h[1].slice(1); h.bad = true; }
      // The bot plays only on time and while this seat is not under computer control (a player cannot order during catch-up).
      if (!c.progress() && !c.aiSeats.has(cfg.seat)) for (const [type, args] of bot(c.sim, turn)) if (c.issue(type, args)) t.kick();
      if (c.nextTurn === endTurn) finalAtEnd = hashMod.checksum(c.sim).hash;
      if (cfg.saveAt && c.nextTurn === cfg.saveAt && !save) save = saves.makeSave(c, cfg.room0 || { id: cfg.room, config: { capacity: cfg.seats.length, mode: 'ffa', mapId: cfg.setup.options.mapId, fog: true }, players: cfg.seats.map((x) => ({ seat: x.seat, name: 'Bot ' + (x.seat + 1), nation: cfg.setup.options.nations[x.team], group: cfg.setup.options.groups[x.team], team: x.team })) });
      if (turn % 600 === 0) samples.push({ turn, units: c.sim.s.units.length, t: Date.now() });
    };
    c.navRoom = cfg.room; snaps = cfg.snapshots === false ? null : attachSnapshots(c, { url: cfg.base + '/api/lockstep/' + cfg.room, token: cfg.token, onLoaded: () => t.resync(), fetch: (...a) => (offline() ? Promise.reject(new Error('offline (simulated)')) : globalThis.fetch(...a)) });
    t.start();
    return [c, t];
  }
  [client, transport] = session();
  // --stall S: give up when no turn executed for S wall seconds (the field failure was a client waiting forever).
  let lastTurn = -1, lastMove = Date.now(), stalled = null;
  const block = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  while (client.nextTurn < endTurn && !client.desync && !transport.fatal) {
    const o = faults.outage, f = faults.freeze;
    if (o && !o.done && client.nextTurn >= o.atTurn) { o.done = true; o.from = client.nextTurn; offlineUntil = Date.now() + o.ms; try { transport.active?.ws?.close(); } catch { /* ignore */ } }
    if (f && !f.done && client.nextTurn >= f.atTurn) { f.done = true; f.from = client.nextTurn; block(f.ms); }
    if (cfg.restartAt && !restart && client.nextTurn >= cfg.restartAt) {
      transport.stop(); restart = { from: client.nextTurn, at: Date.now(), oldReconnects: client.stats.reconnects || 0 }; prevHashes = client.hashLog;
      [client, transport] = session();
    }
    if (restart && !restart.caughtUp && client.sealed > restart.from && !client.progress() && client.nextTurn >= restart.from) { restart.caughtUp = Date.now() - restart.at; restart.turns = client.nextTurn; }
    snaps?.tick(); client.advance(cfg.budget || 40); await sleep(cfg.loop || 4);
    if (client.nextTurn !== lastTurn) { lastTurn = client.nextTurn; lastMove = Date.now(); }
    else if (cfg.stall && Date.now() - lastMove > cfg.stall * 1000) { stalled = { turn: client.nextTurn, sealed: client.sealed, seconds: cfg.stall }; break; }
  }
  // Keep reporting until the last checksums are delivered.
  const until = Date.now() + 3000; while (client.hashQueue.length && Date.now() < until && !client.desync) await sleep(20);
  transport.stop();
  const lat = client.stats.latency.slice().sort((a, b) => a - b), q = (p) => (lat.length ? Math.round(lat[Math.min(lat.length - 1, Math.floor(p * lat.length))]) : null);
  const wall = (Date.now() - t0) / 1000, sock = transport.active?.stats || null;
  process.stdout.write(JSON.stringify({ seat: cfg.seat, team: client.team, turns: client.nextTurn, steps: client.step, desync: client.desync, desyncInfo: client.desyncInfo, fatal: transport.fatal?.message || null,
    hashes: [...new Map([...prevHashes, ...client.hashLog])], final: finalAtEnd, units: client.sim.s.units.length,
    stats: { ...client.stats, latency: undefined, latencyN: lat.length, latencyP50: q(0.5), latencyP90: q(0.9), latencyMax: lat.length ? Math.round(lat[lat.length - 1]) : null, latencyAll: cfg.keepLatency ? lat : undefined },
    stalled, lost: fetch.stats, transport: transport.mode, fallback: switched, reconnects: client.stats.reconnects || 0, socket: sock, faults, restart, control: client.control, aiTeams: [...client.aiTeams], humanTeams: client.sim.s.humanTeams,
    save, snapshots: snaps?.stats || null, snapshotTurn: client.stats.snapshotTurn ?? null, buildMs, wall, simMsPerTurn: steps ? stepMs / steps : 0, maxTurnMs: maxStep, rtt: client.rtt, delay: client.delay, samples, log: cfg.keepLog ? client.log : undefined }) + '\n');
  process.exit(0);
})().catch((e) => { process.stdout.write(JSON.stringify({ seat: cfg.seat, error: String(e && e.stack || e) }) + '\n'); process.exit(1); });
