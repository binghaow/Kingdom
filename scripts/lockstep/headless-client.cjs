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

(async () => {
  const { LockstepClient } = await import(pathToFileURL(path.join(ROOT, 'src/net/lockstep.js')).href);
  const { AutoTransport } = await import(pathToFileURL(path.join(ROOT, 'src/net/auto-transport.js')).href);
  const now = () => performance.timeOrigin + performance.now();
  const t0 = Date.now();
  const client = new LockstepClient({ K, commands, setup: cfg.setup, seat: cfg.seat, seats: cfg.seats, startAt: cfg.startAt, period: cfg.period, now });
  const buildMs = Date.now() - t0;
  const fetch = faultyFetch((...a) => globalThis.fetch(...a));
  const transport = new AutoTransport({ mode: cfg.transport || 'http', httpUrl: cfg.base + '/api/lockstep/' + cfg.room, wsUrl: cfg.base.replace(/^http/, 'ws') + '/api/lockstep/' + cfg.room + '/ws' + (cfg.wsPath || ''), token: cfg.token, client, fetch, timeout: cfg.timeout || 4000, onSwitch: (r) => { switched = r; } });
  let switched = null;
  if (cfg.trace) client.stats.trace = [];
  const bot = createBot(K, cfg.seat, client.team, cfg.botSeed || 1);
  const hashMod = await import(pathToFileURL(path.join(ROOT, 'src/core/hash.js')).href);
  let finalAtEnd = null;
  const endTurn = cfg.turns, samples = []; let stepMs = 0, steps = 0, maxStep = 0;
  const run = client.runTurn.bind(client);
  client.runTurn = () => { const turn = client.nextTurn, a = performance.now(); run(); const d = performance.now() - a; stepMs += d; steps++; if (d > maxStep) maxStep = d;
    for (const [type, args] of bot(client.sim, turn)) if (client.issue(type, args)) transport.kick();
    if (client.nextTurn === endTurn) finalAtEnd = hashMod.checksum(client.sim).hash;
    if (turn % 600 === 0) samples.push({ turn, units: client.sim.s.units.length, t: Date.now() }); };
  transport.start();
  // --stall S: give up when no turn executed for S wall seconds (the field failure was a client waiting forever).
  let lastTurn = -1, lastMove = Date.now(), stalled = null;
  while (client.nextTurn < endTurn && !client.desync && !transport.fatal) {
    client.advance(cfg.budget || 40); await sleep(cfg.loop || 4);
    if (client.nextTurn !== lastTurn) { lastTurn = client.nextTurn; lastMove = Date.now(); }
    else if (cfg.stall && Date.now() - lastMove > cfg.stall * 1000) { stalled = { turn: client.nextTurn, sealed: client.sealed, seconds: cfg.stall }; break; }
  }
  // Keep reporting until the last checksums are delivered.
  const until = Date.now() + 3000; while (client.hashQueue.length && Date.now() < until) await sleep(20);
  transport.stop();
  const lat = client.stats.latency.slice().sort((a, b) => a - b), q = (p) => (lat.length ? Math.round(lat[Math.min(lat.length - 1, Math.floor(p * lat.length))]) : null);
  const wall = (Date.now() - t0) / 1000;
  process.stdout.write(JSON.stringify({ seat: cfg.seat, team: client.team, turns: client.nextTurn, steps: client.step, desync: client.desync, fatal: transport.fatal?.message || null,
    hashes: client.hashLog, final: finalAtEnd, units: client.sim.s.units.length,
    stats: { ...client.stats, latency: undefined, latencyN: lat.length, latencyP50: q(0.5), latencyP90: q(0.9), latencyMax: lat.length ? Math.round(lat[lat.length - 1]) : null, latencyAll: cfg.keepLatency ? lat : undefined },
    stalled, lost: fetch.stats, transport: transport.mode, fallback: switched, reconnects: client.stats.reconnects || 0, buildMs, wall, simMsPerTurn: steps ? stepMs / steps : 0, maxTurnMs: maxStep, rtt: client.rtt, delay: client.delay, samples, log: cfg.keepLog ? client.log : undefined }) + '\n');
  process.exit(0);
})().catch((e) => { process.stdout.write(JSON.stringify({ seat: cfg.seat, error: String(e && e.stack || e) }) + '\n'); process.exit(1); });
