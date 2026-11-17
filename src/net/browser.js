/* P3 step 3b: lockstep in the browser, behind the lobby's "新联机（测试）/ Lockstep (beta)" option (network-ui.js).
   The page keeps its existing multiplayer presentation: the render-only replica (network-client.js KingdomNetworkClient) and
   all UI code are unchanged. What changes is where the replica's views come from — instead of server snapshots, this driver
   runs the full simulation locally, turn by turn on the relay's command lists, and hands the replica the same filtered
   per-player view (KingdomSim.networkSnapshot, the function the room service uses) about every 100 ms. The replica's local
   prediction (order voice, click marker, units turning and starting to walk) is presentation only and never touches the
   lockstep simulation, which only changes through relayed commands. */

import { LockstepClient } from './lockstep.js';
import { AutoTransport } from './auto-transport.js';

const VIEW_EVERY = 90; // ms between replica views (the relay turn is 100 ms)

export function startBrowserLockstep(root, opts) {
  const K = root.KingdomSim, commands = root.KingdomNetCommands, ls = opts.room.lockstep;
  if (!K || !K.NetworkSim || !commands || !ls) throw new Error('lockstep: simulation or command rules not loaded');
  const now = () => root.performance.timeOrigin + root.performance.now();
  const client = new LockstepClient({ K, commands, setup: ls.setup, seat: opts.seat, seats: ls.seats, startAt: ls.startAt, period: ls.period, now,
    onResult: (result, cmd, latency) => { executed.push({ type: cmd.type, latency, at: now() }); if (executed.length > 500) executed.shift(); opts.onResult?.(result, cmd, latency); } });
  const executed = [];
  // Feature switch: the room's transport (set by the server from LOCKSTEP_TRANSPORT, default http); ?lockstep=ws|http overrides.
  let mode = ls.transport === 'ws' ? 'ws' : 'http';
  try { const q = new URLSearchParams(root.location.search).get('lockstep'); if (q === 'ws' || q === 'http') mode = q; } catch { /* keep */ }
  const wsUrl = root.location ? (root.location.protocol === 'https:' ? 'wss://' : 'ws://') + root.location.host + '/api/lockstep/' + opts.room.id + '/ws' : null;
  const transport = new AutoTransport({ mode, httpUrl: '/api/lockstep/' + opts.room.id, wsUrl, token: opts.token, client,
    onReceive: () => opts.onAlive?.(), onError: (e, fatal) => opts.onError?.(e, fatal), onSwitch: (reason) => opts.onSwitch?.(reason) });
  let lastView = -Infinity, viewTurn = -1, waitShown = false, timer = null, stopped = false;
  const stats = { views: 0, viewMs: 0, maxViewMs: 0 };

  function view() {
    const replica = opts.replica?.(), t0 = root.performance.now();
    const v = K.networkSnapshot(client.sim, client.team, replica?.lastEvent || 0, { slim: true, have: replica?.have?.() || {} });
    // The replica moves drawn positions and attaches presentation state to what it receives; a JSON copy keeps all of that
    // out of the lockstep simulation (the same bytes the server would have sent).
    const copy = JSON.parse(JSON.stringify(v));
    const ms = root.performance.now() - t0; stats.views++; stats.viewMs += ms; stats.maxViewMs = Math.max(stats.maxViewMs, ms);
    viewTurn = client.nextTurn; lastView = now();
    opts.onView(copy);
  }
  function pump() {
    if (stopped) return;
    const behind = client.horizon() - client.nextTurn;
    client.advance(behind > 10 ? 40 : 12);
    if (client.nextTurn > viewTurn && (now() - lastView >= VIEW_EVERY || viewTurn < 0)) view();
    const wait = client.waiting(1000);
    if (wait || waitShown) { waitShown = !!wait; opts.onWait?.(wait); }
    if (client.desync && !stopped) { opts.onDesync?.(client.desync); stop(); }
  }
  function stop() { stopped = true; clearInterval(timer); transport.stop(); }
  transport.start();
  timer = setInterval(pump, 16);
  return {
    client, transport, stats, executed, stop,
    issue(type, args) { if (stopped) return false; const ok = client.issue(type, args); if (ok) transport.kick(); return ok; },
    recording: () => client.recording(),
  };
}
