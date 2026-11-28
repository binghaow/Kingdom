/* P3 step 3b: lockstep in the browser. Since 3e it is the lobby default ("新联机 / Lockstep"); the old server-authoritative
   polling stays one release as the "旧联机（备用）/ Classic online (backup)" option (network-ui.js).
   The page keeps its existing multiplayer presentation: the render-only replica (network-client.js KingdomNetworkClient) and
   all UI code are unchanged. What changes is where the replica's views come from — instead of server snapshots, this driver
   runs the full simulation locally, turn by turn on the relay's command lists, and hands the replica the same filtered
   per-player view (KingdomSim.networkSnapshot, the function the room service uses) about every 100 ms. The replica's local
   prediction (order voice, click marker, units turning and starting to walk) is presentation only and never touches the
   lockstep simulation, which only changes through relayed commands.

   3c: catch-up after a refresh / reconnect / restored room runs headless (no views) with a larger time budget and reports
   progress (onProgress) for the progress bar; commands are refused until caught up. Computer takeover / release events are
   reported (onControl). startReplayViewer plays a saved recording locally (single player, no relay). */

import { LockstepClient, CATCHUP } from './lockstep.js';
import { AutoTransport } from './auto-transport.js';
import { attachSnapshots } from './snapshots.js';
import { startWorkerLockstep } from './worker-lockstep.js';

const VIEW_EVERY = 90; // ms between replica views (the relay turn is 100 ms)

function driver(root, client, opts, transport, extra = null) {
  const K = root.KingdomSim, now = client.now;
  let lastView = -Infinity, viewTurn = -1, waitShown = false, progressShown = false, timer = null, stopped = false;
  const stats = { views: 0, viewMs: 0, maxViewMs: 0, catchupMs: 0, catchupTurns: 0 };
  function view() {
    const replica = opts.replica?.(), t0 = root.performance.now();
    const v = K.networkSnapshot(client.sim, Math.max(0, client.team), replica?.lastEvent || 0, { slim: true, have: replica?.have?.() || {} });
    // The replica moves drawn positions and attaches presentation state to what it receives; a JSON copy keeps all of that
    // out of the lockstep simulation (the same bytes the server would have sent).
    const copy = JSON.parse(JSON.stringify(v));
    const ms = root.performance.now() - t0; stats.views++; stats.viewMs += ms; stats.maxViewMs = Math.max(stats.maxViewMs, ms);
    viewTurn = client.nextTurn; lastView = now();
    opts.onView(copy);
  }
  function pump() {
    if (stopped) return;
    extra?.tick();
    const progress = client.progress(), behind = client.horizon() - client.nextTurn, t0 = now(), from = client.nextTurn;
    // Catching up: run headless in ~60 ms slices (the page stays responsive and the progress bar repaints between slices).
    client.advance(progress ? 60 : behind > 10 ? 40 : 12);
    if (progress) { stats.catchupMs += now() - t0; stats.catchupTurns += client.nextTurn - from; }
    const p = client.progress();
    if (p || progressShown) { progressShown = !!p; opts.onProgress?.(p); }
    if (!p && client.nextTurn > viewTurn && (now() - lastView >= VIEW_EVERY || viewTurn < 0)) view();
    else if (p && viewTurn < 0 && client.nextTurn > 0) view(); // one early view so the battlefield is not empty while catching up
    const wait = p ? null : client.waiting(1000);
    if (wait || waitShown) { waitShown = !!wait; opts.onWait?.(wait); }
    if (client.desync && !stopped) { opts.onDesync?.(client.desync, client); stop(); }
    opts.onPump?.(client);
  }
  function stop() { stopped = true; clearInterval(timer); transport?.stop(); }
  transport?.start();
  timer = setInterval(pump, 16);
  if (transport) {
    // Back from the background (iPad app switch / lock screen) or network restored -> check the socket at once.
    const wake = () => { if (!root.document || !root.document.hidden) transport.wake(); };
    root.document?.addEventListener?.('visibilitychange', wake); root.addEventListener?.('online', wake); root.addEventListener?.('pageshow', wake);
  }
  return { client, transport, stats, stop, get stopped() { return stopped; }, recording: () => client.recording() };
}

export function startBrowserLockstep(root, opts) {
  if (opts.worker && typeof root.Worker === 'function') {
    try { return startWorkerLockstep(root, opts); } catch (e) { try { root.console?.warn?.('lockstep worker fallback to main thread:', e?.message || e); } catch { /* ignore */ } }
  }
  const K = root.KingdomSim, commands = root.KingdomNetCommands, ls = opts.room.lockstep;
  if (!K || !K.NetworkSim || !commands || !ls) throw new Error('lockstep: simulation or command rules not loaded');
  const now = () => root.performance.timeOrigin + root.performance.now();
  const executed = [];
  // 3e: a room restored from a save with a snapshot starts from that snapshot (ls.snap), not from turn 0.
  const client = new LockstepClient({ K, commands, setup: ls.setup, seat: opts.seat, seats: ls.seats, startAt: ls.startAt, period: ls.period, now, resumeAt: ls.snap || null,
    onResult: (result, cmd, latency) => { executed.push({ type: cmd.type, latency, at: now() }); if (executed.length > 500) executed.shift(); opts.onResult?.(result, cmd, latency); } });
  client.onControl = (e) => opts.onControl?.(e, client);
  // Feature switch: the room's transport (set by the server: default ws since net lobby v2, LOCKSTEP_TRANSPORT=http forces HTTP); ?lockstep=ws|http overrides.
  let mode = ls.transport === 'ws' ? 'ws' : 'http';
  try { const q = new URLSearchParams(root.location.search).get('lockstep'); if (q === 'ws' || q === 'http') mode = q; } catch { /* keep */ }
  const wsUrl = root.location ? (root.location.protocol === 'https:' ? 'wss://' : 'ws://') + root.location.host + '/api/lockstep/' + opts.room.id + '/ws' : null;
  const transport = new AutoTransport({ mode, httpUrl: '/api/lockstep/' + opts.room.id, wsUrl, token: opts.token, client,
    onReceive: () => opts.onAlive?.(), onError: (e, fatal) => opts.onError?.(e, fatal), onSwitch: (reason) => opts.onSwitch?.(reason) });
  client.navRoom = opts.room.id;
  const snaps = attachSnapshots(client, { url: '/api/lockstep/' + opts.room.id, token: opts.token, onLoaded: (turn, ms) => { transport.resync(); opts.onSnapshot?.(turn, ms); } });
  const d = driver(root, client, opts, transport, snaps);
  return {
    ...d, executed, snaps, mode: 'live',
    issue(type, args) { if (d.stopped) return false; if (client.progress()) { opts.onRefused?.('catchup'); return false; } const ok = client.issue(type, args); if (ok) transport.kick(); return ok; },
  };
}

/* Local playback of a saved match (kingdom-lockstep-save or kingdom-lockstep recording): same Sim, same command order, no
   relay. speed = game turns per real turn period (1, 2, 4, 8); seek(turn) runs headless to that turn. */
export function startReplayViewer(root, opts) {
  const K = root.KingdomSim, commands = root.KingdomNetCommands, rec = opts.recording;
  const seat = Number.isSafeInteger(opts.seat) ? opts.seat : rec.self ?? rec.seats?.[0]?.seat ?? 0;
  let last = root.performance.now(), speed = opts.speed || 1, paused = false;
  const total = rec.turns ?? (rec.commands.length ? rec.commands[rec.commands.length - 1].turn + 1 : 0);
  const client = new LockstepClient({ K, commands, setup: rec.setup, seat, seats: rec.seats, startAt: 0, period: rec.period || 100, now: () => root.performance.timeOrigin + root.performance.now(), hashes: false });
  client.issue = () => false;
  for (const r of rec.commands) client.receive({ t: [[r.turn, r.seat, r.seq, r.c]] });
  // 3e: a save whose commands start after turn 0 (match restored from a snapshot) plays from its snapshot (opts.snapshot, decoded).
  if (opts.snapshot) { const l = client.loadSnapshot(opts.snapshot); if (!l.ok) throw new Error('snapshot checksum'); }
  client.sealed = total - 1; client.sparseCatchup = false;
  let clock = client.nextTurn;
  // Playhead: turns advance at `speed` per 100 ms; a seek target moves it at once (the driver then catches up headless).
  client.horizon = () => { const t = root.performance.now(); if (!paused) clock += (t - last) / client.period * speed; last = t; return Math.min(total - 1, Math.floor(clock)); };
  client.progress = () => { const behind = Math.min(total - 1, Math.floor(clock)) - client.nextTurn; return behind > CATCHUP ? { turn: client.nextTurn, target: Math.floor(clock), behind } : null; };
  client.waiting = () => null;
  client.onControl = (e) => opts.onControl?.(e, client);
  const d = driver(root, client, opts, null);
  return { ...d, mode: 'replay', total, issue: () => false,
    get turn() { return client.nextTurn; }, get speed() { return speed; },
    setSpeed(v) { speed = v; }, pause(v = !paused) { paused = v; return paused; },
    seek(turn) { clock = Math.max(client.nextTurn, Math.min(total - 1, turn)); } };
}
