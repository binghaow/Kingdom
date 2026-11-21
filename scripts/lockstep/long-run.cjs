#!/usr/bin/env node
'use strict';
/* 3c long match against the real local stack (node preview.cjs on PORT, default 8765) with the platform model:
   D1 latency per call and a per-invocation D1 call budget (scripts/lockstep/d1-sim.cjs; Sites measured D1 batch p50 47 ms).
   Lobby room: 2 human seats (Node headless clients = the browser's lockstep code) + 1 computer seat, WebSocket + D1.
   Faults: seat 0 loses the network for --outage s at --outage-at min (longer than 60 s -> computer takeover, then reclaim);
   seat 1's page freezes (backgrounded, socket open) for --freeze s at --freeze-at min; seat 1 refreshes the page at
   --refresh-at min (catch-up from turn 0 is timed). Reports relay D1 row counts and the platform counters.

   usage: node scripts/lockstep/long-run.cjs [--minutes 26] [--period 50] [--latency 47] [--limit 10000] [--outage 90]
          [--outage-at 8] [--freeze 20] [--freeze-at 14] [--refresh-at 24] [--json out.json] */
const path = require('node:path'), { spawn } = require('node:child_process'), { DatabaseSync } = require('node:sqlite');
const ROOT = path.resolve(__dirname, '../..');
const a = process.argv.slice(2), get = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const o = { minutes: +get('minutes', 26), period: +get('period', 50), latency: +get('latency', 47), limit: +get('limit', 10000), outage: +get('outage', 90), outageAt: +get('outage-at', 8), freeze: +get('freeze', 20), freezeAt: +get('freeze-at', 14), refreshAt: +get('refresh-at', 24), port: +get('port', 8765), json: get('json', null) };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(base, p, body, token) {
  const res = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
  const data = await res.json(); if (!res.ok) throw new Error(p + ' ' + res.status + ' ' + data.error); return data;
}
function client(cfg) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'headless-client.cjs'), JSON.stringify(cfg)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = ''; child.stdout.on('data', (d) => (out += d)); child.stderr.on('data', (d) => (err += d));
    child.on('exit', (code) => { try { resolve(JSON.parse(out.trim().split('\n').pop())); } catch { resolve({ seat: cfg.seat, error: 'exit ' + code + ' ' + err.slice(-600) }); } });
  });
}
(async () => {
  // D1 latency scales with the accelerated turn clock so a batch takes the same share of a turn as on Sites.
  const latency = Math.round(o.latency * o.period / 100);
  const preview = spawn(process.execPath, [path.join(ROOT, 'preview.cjs')], { env: { ...process.env, PORT: String(o.port), PREVIEW_D1_LATENCY: String(latency), PREVIEW_INVOCATION_LIMIT: String(o.limit), LOCKSTEP_PERIOD: String(o.period) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; preview.stdout.on('data', (d) => (log += d)); preview.stderr.on('data', (d) => (log += d));
  const base = 'http://127.0.0.1:' + o.port;
  for (let i = 0; i < 100 && !/127\.0\.0\.1:\d+/.test(log); i++) await sleep(100);
  const host = await api(base, '/api/rooms', { name: 'Host', nation: 'britain', config: { capacity: 3, mode: 'ffa', mapId: 'coast_l', fog: true, fillAI: true, difficulty: 'normal', lockstep: true } });
  const id = host.room.id, guest = await api(base, '/api/rooms/' + id + '/join', { name: 'Guest', nation: 'france' });
  for (const t of [host.token, guest.token]) await api(base, '/api/rooms/' + id, { action: 'settings', ready: true }, t);
  const started = await api(base, '/api/rooms/' + id, { action: 'start' }, host.token), ls = started.room.lockstep;
  const turns = o.minutes * 600, perMin = 600, tokens = { 0: host.token, 1: guest.token }, t0 = Date.now();
  const common = { base, room: id, setup: ls.setup, seats: ls.seats, startAt: ls.startAt, period: ls.period, turns, transport: 'ws', stall: 180, keepLatency: false };
  const results = await Promise.all(ls.seats.map((s) => client({ ...common, seat: s.seat, token: tokens[s.seat], botSeed: 7,
    ...(s.seat === 0 ? { outage: { atTurn: o.outageAt * perMin, ms: o.outage * 1000 } } : { freeze: { atTurn: o.freezeAt * perMin, ms: o.freeze * 1000 }, restartAt: o.refreshAt * perMin }) })));
  const wall = Math.round((Date.now() - t0) / 1000);
  const db = new DatabaseSync(path.join(ROOT, '.local/rooms.sqlite'));
  const rows = { cmds: db.prepare('SELECT COUNT(*) n FROM lockstep_cmds WHERE room = ?').get(id).n, system: db.prepare('SELECT COUNT(*) n FROM lockstep_cmds WHERE room = ? AND seat = 99').get(id).n, hashes: db.prepare('SELECT COUNT(*) n FROM lockstep_hashes WHERE room = ?').get(id).n, bad: db.prepare('SELECT COUNT(*) n FROM lockstep_hashes WHERE room = ? AND bad IS NOT NULL').get(id).n, cmdBytes: db.prepare('SELECT SUM(LENGTH(cmd)) n FROM lockstep_cmds WHERE room = ?').get(id).n };
  const plan = db.prepare("EXPLAIN QUERY PLAN SELECT turn, seat, seq, cmd FROM lockstep_cmds WHERE room = ? AND turn > ? AND turn <= 5 ORDER BY turn, seat, seq LIMIT 2000").all(id, 0).map((r) => r.detail);
  const system = db.prepare('SELECT turn, cmd FROM lockstep_cmds WHERE room = ? AND seat = 99 ORDER BY turn').all(id).map((r) => [r.turn, JSON.parse(r.cmd)]);
  const sealed = db.prepare('SELECT sealed FROM lockstep_rooms WHERE id = ?').get(id).sealed;
  db.close();
  // Wait for the platform counters line, then stop the preview.
  preview.kill('SIGTERM');
  const stats = (log.match(/d1-sim (\{.*\})/g) || []).pop();
  const ok = results.every((r) => !r.error && r.turns >= turns && !r.desync), finals = results.map((r) => r.final);
  const byStep = results.map((r) => new Map(r.hashes)), common2 = [...byStep[0].keys()].filter((k) => byStep.slice(1).every((m) => m.has(k)));
  const mismatch = common2.find((k) => byStep.some((m) => m.get(k) !== byStep[0].get(k)));
  const report = { config: { ...o, latencyScaled: latency, turns, room: id, map: ls.setup.options.mapId, nations: ls.setup.options.nations.length, computerSeats: ls.setup.options.nations.length - ls.seats.length },
    ok: ok && new Set(finals).size === 1 && mismatch === undefined, finals, checksumStepsCompared: common2.length, mismatch: mismatch ?? null, wallSeconds: wall, sealed, rows, plan, system, platform: stats ? JSON.parse(stats.slice(7)) : null,
    clients: results.map((r) => ({ seat: r.seat, error: r.error, turns: r.turns, transport: r.transport, fallback: r.fallback, reconnects: r.reconnects, socket: r.socket, faults: r.faults, restart: r.restart, control: r.control, stallMs: Math.round(r.stats?.stallMs || 0), watchdog: r.stats?.watchdog || 0, commands: r.stats?.commands, units: r.units, simMsPerTurn: +(r.simMsPerTurn || 0).toFixed(2), latencyP50: r.stats?.latencyP50, latencyP90: r.stats?.latencyP90 })) };
  if (o.json) require('node:fs').writeFileSync(o.json, JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report, null, 1));
  process.exit(report.ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
