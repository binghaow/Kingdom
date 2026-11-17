#!/usr/bin/env node
'use strict';
/* P3 step 3a benchmark: an HTTP relay (the real server/service.cjs handle(), node:sqlite D1 adapter, same as preview.cjs) and
   N headless lockstep clients in child processes, each running the full Sim with a scripted bot.

   usage: node scripts/lockstep/harness.cjs [--clients 8] [--seconds 600] [--period 100] [--lobby] [--jitter 300] [--delay 0]
          [--loss 0.05] [--json out.json] [--quiet]
     --seconds  game seconds per client (10 turns each); --period ms per turn on the relay clock (100 = real time; smaller =
                accelerated, the relay's hold rule then paces everybody at the speed of the slowest client)
     --lobby    create the room through the /api/rooms lobby (create, join, ready, start; capacity <= 4) instead of directly
     --jitter / --delay / --loss   fault injection in every client's HTTP layer (see headless-client.cjs)
   Seats: up to 4 human nations plus one computer nation (maps hold at most 5 nations); seats beyond 4 share a nation with an
   earlier seat (co-op control), so 8 clients are 8 independent command senders.
   Prints a report; exit code 1 when any check fails (checksum mismatch, desync, client error, unfinished run). */
const http = require('node:http'), path = require('node:path'), { spawn } = require('node:child_process'), { DatabaseSync } = require('node:sqlite'), { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '../..');
const { handle } = require(path.join(ROOT, 'server/service.cjs')), Lockstep = require(path.join(ROOT, 'server/lockstep/http.cjs')), core = require(path.join(ROOT, 'server/lockstep/relay-core.cjs'));
const { sqliteD1 } = require(path.join(ROOT, 'scripts/sqlite-d1.cjs'));

function args() {
  const a = process.argv.slice(2), get = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
  return { clients: +get('clients', 4), seconds: +get('seconds', 60), period: +get('period', 100), lobby: a.includes('--lobby'), jitter: +get('jitter', 0), delay: +get('delay', 0), loss: +get('loss', 0), json: get('json', null), quiet: a.includes('--quiet'), seed: +get('seed', 4242), transport: get('transport', 'http'), durable: a.includes('--durable'), wsLimit: +get('ws-limit', 0), noWs: a.includes('--no-ws') };
}

async function sha256(text) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join(''); }

function startServer(DB) {
  const meter = { requests: 0, lockstep: 0, bySeat: new Map(), status: {}, cpu: [], tokenSeat: new Map() };
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks), url = new URL(req.url, 'http://' + req.headers.host);
    const reqHeaderBytes = Buffer.byteLength(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`) + req.rawHeaders.reduce((n, v, i) => n + Buffer.byteLength(v) + (i % 2 ? 2 : 2), 0) + 2;
    const r = await handle(new Request(url, { method: req.method, headers: req.headers, body: req.method === 'GET' ? undefined : body }), { DB });
    const out = Buffer.from(await r.arrayBuffer()), headers = Object.fromEntries(r.headers);
    res.writeHead(r.status, headers); res.end(out);
    const resHeaderBytes = Buffer.byteLength(`HTTP/1.1 ${r.status} ${http.STATUS_CODES[r.status]}\r\n`) + Object.entries(headers).reduce((n, [k, v]) => n + Buffer.byteLength(k + ': ' + v + '\r\n'), 0) + Buffer.byteLength('Date: Tue, 17 Nov 2026 00:00:00 GMT\r\nConnection: keep-alive\r\nKeep-Alive: timeout=5\r\nContent-Length: ' + out.length + '\r\n\r\n');
    meter.requests++; meter.status[r.status] = (meter.status[r.status] || 0) + 1;
    if (url.pathname.startsWith('/api/lockstep/')) {
      meter.lockstep++;
      const seat = meter.tokenSeat.get(String(req.headers.authorization || '').slice(7));
      let m = meter.bySeat.get(seat); if (!m) meter.bySeat.set(seat, m = { n: 0, upBody: 0, downBody: 0, upHead: 0, downHead: 0 });
      m.n++; m.upBody += body.length; m.downBody += out.length; m.upHead += reqHeaderBytes; m.downHead += resHeaderBytes;
    }
  });
  server.keepAliveTimeout = 30000;
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, meter, base: 'http://127.0.0.1:' + server.address().port })));
}

async function api(base, p, body, token) {
  const res = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
  const data = await res.json(); if (!res.ok) throw new Error(p + ' ' + res.status + ' ' + data.error); return data;
}

/* Room through the existing lobby: create (lockstep:true), join, ready, start. */
async function lobbyRoom(base, n, o) {
  const nations = ['britain', 'france', 'china', 'japan'];
  const host = await api(base, '/api/rooms', { name: 'Bot 1', nation: nations[0], config: { capacity: Math.max(2, n), mode: 'ffa', mapId: n > 2 ? 'coast_l' : 'coast_s', fog: true, fillAI: false, lockstep: true } });
  const id = host.room.id, tokens = [host.token];
  for (let i = 1; i < n; i++) tokens.push((await api(base, '/api/rooms/' + id + '/join', { name: 'Bot ' + (i + 1), nation: nations[i] })).token);
  for (const t of tokens) await api(base, '/api/rooms/' + id, { action: 'settings', ready: true }, t);
  const started = await api(base, '/api/rooms/' + id, { action: 'start' }, tokens[0]);
  const ls = started.room.lockstep; if (!ls) throw new Error('lobby did not start a lockstep room');
  return { id, setup: ls.setup, startAt: ls.startAt, period: o.period, seats: ls.seats.map((s, i) => ({ ...s, token: tokens[s.seat] })) };
}

/* Direct room for up to 8 seats: 4 human nations + 1 computer nation; seat i controls nation i % 4. */
async function directRoom(DB, n, o) {
  const humans = Math.min(4, n), nations = ['britain', 'france', 'china', 'japan', 'ottoman'].slice(0, humans + 1);
  const setup = core.makeSetup({ difficulty: 'normal', nations, groups: nations.map((_, i) => i + 1), mapId: 'coast_l', minerals: 'standard', fog: true, seed: o.seed, humanTeams: [...Array(humans).keys()], names: nations.map((_, i) => i < humans ? 'Bot ' + (i + 1) : '电脑 ' + (i + 1)), netMode: 'ffa' });
  const id = 'LS' + Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
  const seats = []; for (let i = 0; i < n; i++) { const token = 'tok-' + i + '-' + Math.random().toString(36).slice(2); seats.push({ seat: i, team: i % humans, token, hash: await sha256(token) }); }
  const startAt = Date.now() + 3000;
  await Lockstep.createRoom(DB, { id, setup, startAt, period: o.period, seats: seats.map((s) => ({ seat: s.seat, team: s.team, token: s.hash })) });
  return { id, setup, startAt, period: o.period, seats };
}

function runClient(cfg) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'headless-client.cjs'), JSON.stringify(cfg)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = ''; child.stdout.on('data', (d) => (out += d)); child.stderr.on('data', (d) => (err += d));
    child.on('exit', (code) => { try { resolve(JSON.parse(out.trim().split('\n').pop())); } catch { resolve({ seat: cfg.seat, error: 'exit ' + code + ' ' + err.slice(-800) + out.slice(-300) }); } });
  });
}

async function main(o = args()) {
  const sqlite = new DatabaseSync(':memory:'), DB = sqliteD1(sqlite);
  for (const f of ['0000_multiplayer.sql', '0001_room_limits.sql']) sqlite.exec(require('node:fs').readFileSync(path.join(ROOT, 'drizzle', f), 'utf8'));
  const { server, meter, base } = await startServer(DB);
  const ws = o.noWs ? null : require('./node-ws.cjs').attachUpgrade(server, { DB }, { durable: o.durable });
  // --ws-limit S: the 'platform' closes every socket after S seconds (connection time limit); clients must reconnect and catch up.
  const limiter = ws && o.wsLimit ? setInterval(() => { const t = Date.now(); for (const c of ws.wss.clients) { c._born ??= t; if (t - c._born > o.wsLimit * 1000) c.terminate(); } }, 200) : null;
  const room = o.lobby ? await lobbyRoom(base, o.clients, o) : await directRoom(DB, o.clients, o);
  if (o.lobby && o.period !== core.PERIOD) sqlite.prepare('UPDATE lockstep_rooms SET period = ? WHERE id = ?').run(o.period, room.id);
  for (const s of room.seats) meter.tokenSeat.set(s.token, s.seat);
  const turns = Math.round(o.seconds * 10), cpu0 = process.cpuUsage(), wall0 = Date.now(), req0 = meter.lockstep;
  // CPU per relay request, sampled every 5 s of wall time together with the current relay turn.
  const windows = []; let last = { cpu: process.cpuUsage(), n: meter.lockstep, t: Date.now() };
  const sampler = setInterval(() => { const c = process.cpuUsage(), n = meter.lockstep, row = sqlite.prepare('SELECT sealed FROM lockstep_rooms WHERE id = ?').get(room.id); const d = (c.user + c.system - last.cpu.user - last.cpu.system) / 1000; if (n > last.n) windows.push({ sealed: row?.sealed ?? -1, requests: n - last.n, cpuMsPerRequest: d / (n - last.n) }); last = { cpu: c, n, t: Date.now() }; }, 5000);
  const results = await Promise.all(room.seats.map((s) => runClient({ base, room: room.id, token: s.token, seat: s.seat, seats: room.seats.map((x) => ({ seat: x.seat, team: x.team })), setup: room.setup, startAt: room.startAt, period: room.period, turns, jitter: o.jitter, delay: o.delay, loss: o.loss, botSeed: o.seed, keepLatency: true, transport: o.transport })));
  if (limiter) clearInterval(limiter);
  clearInterval(sampler);
  const cpu = process.cpuUsage(cpu0), wall = (Date.now() - wall0) / 1000, requests = meter.lockstep - req0;
  const bySeat = [...meter.bySeat].map(([k, m]) => [k, { ...m }]), wsBytes = ws ? { in: ws.meter.bytesIn, out: ws.meter.bytesOut, sockets: ws.meter.sockets } : null;
  // Recording download (design 9.4) and a headless replay of it.
  // In B1 (--durable) the commands live in the room object, which serves the recording in production (durable.cjs poll).
  const object = o.durable && ws?.objects.get(room.id);
  const rec = object ? core.recording(object.relay.setup, object.relay.rows, { period: object.relay.period, seats: room.seats.map((x) => ({ seat: x.seat, team: x.team })) }) : await api(base, '/api/lockstep/' + room.id, { replay: 1 }, room.seats[0].token);
  const { replayLockstep } = await import(pathToFileURL(path.join(ROOT, 'src/net/lockstep.js')).href);
  const K = require(path.join(ROOT, 'public/network-model.js')), commands = require(path.join(ROOT, 'public/network-commands.js'));
  const replay = replayLockstep(K, commands, { ...rec, turns });
  const bad = sqlite.prepare('SELECT step, hash, agree, bad FROM lockstep_hashes WHERE room = ? AND bad IS NOT NULL').all(room.id);
  const hashRows = sqlite.prepare('SELECT COUNT(*) AS n FROM lockstep_hashes WHERE room = ?').get(room.id).n;
  ws?.closeAll(); server.close();

  const failures = [];
  const ok = results.filter((r) => !r.error);
  for (const r of results) if (r.error) failures.push('seat ' + r.seat + ' error: ' + r.error.slice(0, 300));
  for (const r of ok) { if (r.turns < turns) failures.push(`seat ${r.seat} stopped at turn ${r.turns}/${turns}`); if (r.desync) failures.push('seat ' + r.seat + ' desync ' + JSON.stringify(r.desync)); if (r.fatal) failures.push('seat ' + r.seat + ' fatal ' + r.fatal); }
  const ref = ok[0]; let compared = 0;
  for (const r of ok.slice(1)) { if (r.final !== ref.final) failures.push(`final checksum seat ${r.seat} ${r.final} != seat ${ref.seat} ${ref.final}`); const n = Math.min(r.hashes.length, ref.hashes.length); for (let i = 0; i < n; i++) { compared++; if (r.hashes[i][1] !== ref.hashes[i][1]) { failures.push(`seat ${r.seat} step ${r.hashes[i][0]} ${r.hashes[i][1]} != ${ref.hashes[i][1]}`); break; } } }
  if (bad.length) failures.push('relay recorded mismatching checksums: ' + JSON.stringify(bad.slice(0, 3)));
  if (ref && replay.final.hash !== ref.final) failures.push(`recording replay final ${replay.final.hash} != clients ${ref.final}`);

  const gameSeconds = turns / 10, lat = ok.flatMap((r) => r.stats.latencyAll || []).sort((a, b) => a - b), q = (p) => (lat.length ? Math.round(lat[Math.min(lat.length - 1, Math.floor(p * lat.length))]) : null);
  const scale = core.PERIOD / room.period; // latency in game-time ms (equal to wall ms at --period 100)
  const seats = bySeat.filter(([s]) => s !== undefined).sort((a, b) => a[0] - b[0]).map(([seat, m]) => ({ seat, requests: m.n,
    upPayloadBps: Math.round(m.upBody / gameSeconds), downPayloadBps: Math.round(m.downBody / gameSeconds),
    upWireBps: Math.round((m.upBody + m.upHead) / gameSeconds), downWireBps: Math.round((m.downBody + m.downHead) / gameSeconds) }));
  const units = ok[0]?.samples || [];
  const report = {
    config: { ...o, json: undefined, turns, room: room.id, lobby: o.lobby, map: room.setup.options.mapId, nations: room.setup.options.nations.length, humanTeams: room.setup.options.humanTeams.length },
    ok: failures.length === 0, failures,
    consistency: { clients: ok.length, checksumsPerClient: ref?.hashes.length || 0, pairsCompared: compared, relayHashRows: hashRows, relayMismatches: bad.length, final: ref?.final, replayFinal: replay.final.hash, recordedCommands: rec.commands.length },
    wallSeconds: Math.round(wall), unitsAtEnd: ok.map((r) => r.units), unitSamples: units.map((s) => [s.turn / 10, s.units]),
    bandwidth: seats, websocket: wsBytes && { sockets: wsBytes.sockets, upPayloadBpsPerClient: Math.round(wsBytes.in / gameSeconds / Math.max(1, ok.length)), downPayloadBpsPerClient: Math.round(wsBytes.out / gameSeconds / Math.max(1, ok.length)) }, bandwidthNote: 'bytes per game second; payload = HTTP bodies; wire = bodies + HTTP/1.1 header bytes measured at the relay (response headers reconstructed)',
    latency: { commands: lat.length, p50: q(0.5) && Math.round(q(0.5) * scale), p90: q(0.9) && Math.round(q(0.9) * scale), max: lat.length && Math.round(lat[lat.length - 1] * scale), unit: 'ms of game time from issue to execution on the issuing client (wall ms when --period 100)' },
    relay: { requests, cpuMsPerRequest: +(cpu.user + cpu.system) / 1000 / Math.max(1, requests), windows, statuses: meter.status, note: 'relay process CPU (HTTP parsing + service + SQLite) / lockstep requests; clients run in other processes' },
    clients: ok.map((r) => ({ seat: r.seat, team: r.team, transport: r.transport, fallback: r.fallback, reconnects: r.reconnects, requests: r.stats.requests, failures: r.stats.failures, lost: r.lost, stalls: r.stats.stalls, stallMs: Math.round(r.stats.stallMs), catchupTurns: r.stats.catchup, rejected: r.stats.rejected, commands: r.stats.commands, rtt: Math.round(r.rtt), delay: r.delay, simMsPerTurn: +r.simMsPerTurn.toFixed(2), maxTurnMs: Math.round(r.maxTurnMs), buildMs: r.buildMs })),
  };
  if (o.json) require('node:fs').writeFileSync(o.json, JSON.stringify(report, null, 1));
  if (!o.quiet) console.log(JSON.stringify(report, (k, v) => (k === 'windows' && v.length > 12 ? v.filter((_, i) => i % Math.ceil(v.length / 12) === 0) : v), 1));
  return report;
}
module.exports = { main, args };
if (require.main === module) main().then((r) => process.exit(r.ok ? 0 : 1)).catch((e) => { console.error(e); process.exit(1); });
