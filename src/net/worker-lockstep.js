/* P4 step 4c-2: lockstep multiplayer simulation inside the Web Worker (opt-in: ?simWorker=1 or "多线程").
   Network transport (AutoTransport: WebSocket / HTTP), snapshot HTTP transfer (attachSnapshots) and the render-only
   replica (KingdomNetworkClient) stay on the main thread unchanged. The worker owns LockstepClient + NetworkSim +
   network-commands, runs turns/catch-up/checksums/snapshots off the main thread and sends back slim per-player views
   (structured clone gives the replica its own copy without main-thread JSON.parse(JSON.stringify)). */

import { DEFAULT_PERIOD, CATCHUP, TAKEOVER_MS } from './lockstep.js';
import { AutoTransport } from './auto-transport.js';
import { attachSnapshots } from './snapshots.js';

const VIEW_EVERY = 90;

function mergeProfile(into, add) {
  if (!add) return into;
  const out = into || {};
  for (const k of Object.keys(add)) {
    const v = add[k], e = out[k] || (out[k] = { ms: 0, n: 0, max: 0 });
    e.ms += v.ms; e.n += v.n; if (v.max > e.max) e.max = v.max;
  }
  return out;
}

export function startWorkerLockstep(root, opts) {
  const ls = opts.room.lockstep;
  if (!ls) throw new Error('lockstep: room lockstep metadata missing');
  const url = opts.url || 'sim-worker.js';
  const worker = new root.Worker(url);
  const now = () => root.performance.timeOrigin + root.performance.now();
  const executed = [];
  const teams = new Map((ls.seats || []).map((s) => [s.seat, s.team]));
  const team = teams.has(opts.seat) ? teams.get(opts.seat) : -1;
  const resumeAt = ls.snap && Number.isSafeInteger(ls.snap.turn) && ls.snap.turn > 0 ? { turn: ls.snap.turn, hash: ls.snap.hash } : null;

  let ready = false, busy = false, loadingSnap = false, saving = false, stopped = false;
  let lastView = -Infinity, viewTurn = -1, waitShown = false, progressShown = false, timer = null, reqSeq = 0;
  let pendingRows = [], wasCatchup = false, profiling = !!opts.profile, sysProf = null;
  const waiting = new Map(), idleWaiters = [];
  const stats = { views: 0, viewMs: 0, maxViewMs: 0, catchupMs: 0, catchupTurns: 0, workerSimMs: 0, workerTurns: 0 };

  const proxy = {
    setup: ls.setup, seat: opts.seat, teams, team,
    startAt: ls.startAt, period: ls.period || DEFAULT_PERIOD, now, navRoom: opts.room.id,
    nextTurn: 0, step: 0, sealed: -1, delay: 2, seen: new Set(),
    outbox: [], seq: 0, issued: new Map(), hashQueue: [], hashLog: [],
    offset: null, samples: [], rtt: null, seatInfo: null, desync: null, desyncInfo: null, offer: null,
    waitingSince: null, log: [], logFrom: 0, margin: 30,
    aiSeats: new Set(), aiTeams: new Set(), reclaim: false, control: [],
    resumeAt, lastSnap: null, saveHash: null, onSnapshot: null,
    stats: { requests: 0, failures: 0, up: 0, down: 0, latency: [], turnLatency: [], catchup: 0, stalls: 0, stallMs: 0, commands: 0, rejected: 0 },

    serverNow() { return this.now() + (this.offset ?? 0); },
    clockTurn() { return (this.serverNow() - this.startAt) / this.period; },
    lagTurns() {
      const rtt = this.rtt ?? 100, half = rtt / 2;
      return Math.max((half + this.margin) / this.period, this.delay - (half + this.period / 2) / this.period);
    },
    horizon() { return Math.floor(this.clockTurn() - 1 - this.lagTurns()); },

    issue(type, args) {
      if (this.team < 0 || this.desync) return false;
      const item = { seq: ++this.seq, cmd: { type, args: args || {} }, at: this.now(), clock: this.clockTurn() };
      this.outbox.push(item); this.issued.set(item.seq, item); this.stats.commands++;
      return true;
    },
    outgoing({ wait = true, turns = true, seats = false, reclaim = false } = {}) {
      const cmds = this.outbox.splice(0, 32), hashes = this.hashQueue.splice(0, 16);
      const body = { a: this.sealed, x: this.nextTurn - 1 };
      if (!wait) body.w = 0;
      if (!turns) body.q = 0;
      if (this.rtt !== null) body.r = Math.round(this.rtt);
      if (cmds.length) body.c = cmds.map((c) => [c.seq, c.cmd]);
      if (hashes.length) body.h = hashes;
      if (seats) body.s = 1;
      if (reclaim) body.k = 1;
      return { body, cmds, hashes, sentAt: this.now() };
    },
    requeueUnconfirmed() {
      const list = [...this.issued.values()].filter((i) => !this.seen.has(this.seat + ':' + i.seq) && !this.outbox.includes(i));
      this.outbox.unshift(...list.sort((a, b) => a.seq - b.seq));
    },
    failed(token) {
      this.stats.failures++;
      this.outbox.unshift(...token.cmds.filter((c) => !this.outbox.includes(c)));
      this.hashQueue.unshift(...token.hashes);
    },
    receive(msg, token, recvAt = this.now()) {
      this.stats.requests++;
      if (token) {
        const net = Math.max(0, recvAt - token.sentAt - (msg.hw || 0));
        this.rtt = this.rtt === null ? net : this.rtt * 0.8 + net * 0.2;
        this.samples.push({ net, offset: this.startAt + msg.n - (recvAt - net / 2) }); if (this.samples.length > 30) this.samples.shift();
        this.offset = this.samples.reduce((a, b) => (b.net < a.net ? b : a)).offset;
      }
      if (Number.isFinite(msg.d)) this.delay = msg.d;
      if (msg.snap && (!this.offer || msg.snap.turn > this.offer.turn)) this.offer = msg.snap;
      if (msg.seats) this.seatInfo = msg.seats.map(([seat, t, at, age, mode]) => ({ seat, team: t, at, age, mode: mode || 0 }));
      if (msg.ds) { this.desyncInfo = msg.ds; if (!this.desync && (!Array.isArray(msg.ds.losers) || msg.ds.losers.includes(this.seat))) this.desync = msg.ds; }
      for (const row of msg.t || []) {
        const [turn, seat, seq] = row, key = seat + ':' + seq;
        if (seat === this.seat && seq > this.seq) this.seq = seq;
        if (turn < this.nextTurn || this.seen.has(key)) continue;
        this.seen.add(key);
        pendingRows.push(row);
      }
      if (Number.isFinite(msg.se) && msg.t && msg.se > this.sealed) this.sealed = msg.se;
    },
    progress() {
      if (this.resumeAt) return { turn: this.nextTurn, target: Math.max(this.sealed, this.resumeAt.turn), behind: Math.max(this.sealed, this.resumeAt.turn) - this.nextTurn, snapshot: true };
      const behind = this.sealed - this.nextTurn; return behind > CATCHUP ? { turn: this.nextTurn, target: this.sealed, behind } : null;
    },
    waiting(limitMs = 1000) {
      if (this.waitingSince === null || this.now() - this.waitingSince < limitMs) return null;
      const behind = (this.seatInfo || []).filter((s) => s.seat !== this.seat && s.team >= 0 && !s.mode && (s.at < this.sealed - 5 || s.age > 1500)).sort((a, b) => a.at - b.at)[0];
      return behind ? { seat: behind.seat, team: behind.team, ms: this.now() - this.waitingSince, takeoverIn: Math.max(0, Math.ceil((TAKEOVER_MS - behind.age) / 1000)), offline: behind.age > 1500 } : { seat: null, team: null, ms: this.now() - this.waitingSince };
    },
    async loadSnapshot(snap) {
      if (stopped) return { ok: false, hash: null };
      loadingSnap = true;
      try {
        const msg = await ask('lsLoadSnapshot', { snap: { turn: snap.turn, hash: snap.hash, text: snap.text, aiSeats: snap.aiSeats || [], seq: snap.seq } });
        if (!msg.ok) return { ok: false, hash: msg.hash };
        this.nextTurn = msg.nextTurn; this.step = msg.step; this.sealed = Math.max(this.sealed, msg.sealed);
        pendingRows = pendingRows.filter((r) => r[0] >= snap.turn);
        this.aiSeats = new Set(msg.aiSeats); this.aiTeams = new Set(msg.aiTeams);
        if (Number.isSafeInteger(snap.seq) && snap.seq > this.seq) this.seq = snap.seq;
        this.logFrom = msg.logFrom; this.log = []; this.hashLog.push([msg.step, msg.hash]);
        this.stats.snapshotTurn = msg.snapshotTurn;
        this.lastSnap = { turn: snap.turn, step: msg.step, hash: msg.hash, text: snap.text, aiSeats: [...this.aiSeats], encoded: snap.encoded || null };
        this.saveHash = { turn: msg.nextTurn, hash: msg.hash };
        if (this.resumeAt && snap.turn >= this.resumeAt.turn) this.resumeAt = null;
        viewTurn = -1;
        return { ok: true, hash: msg.hash };
      } finally { loadingSnap = false; }
    },
    recording() {
      return {
        format: 'kingdom-lockstep', version: 1, setup: this.setup, period: this.period,
        seats: [...this.teams].map(([seat, t]) => ({ seat, team: t })),
        turns: this.nextTurn, logFrom: this.logFrom || 0, commands: this.log.slice(),
        checksums: this.hashLog.map(([step, hash]) => ({ step, hash })), aiSeats: [...this.aiSeats],
      };
    },
  };

  function ask(type, extra = {}) {
    if (stopped) return Promise.reject(Error('lockstep worker stopped'));
    const q = ++reqSeq;
    return new Promise((resolve, reject) => {
      waiting.set(q, { resolve, reject });
      worker.postMessage({ t: type, q, ...extra });
    });
  }
  function waitIdle() {
    if (!busy) return Promise.resolve();
    return new Promise((resolve) => idleWaiters.push(resolve));
  }
  function flushIdle() {
    if (busy || !idleWaiters.length) return;
    const list = idleWaiters.splice(0);
    for (const fn of list) fn();
  }
  function updateStall(executedTurns) {
    if (!proxy.resumeAt) {
      const due = proxy.horizon() >= proxy.nextTurn && proxy.nextTurn > proxy.sealed;
      if (due && !proxy.desync) { if (proxy.waitingSince === null) { proxy.waitingSince = now(); proxy.stats.stalls++; } }
      else if (proxy.waitingSince !== null) {
        const ms = now() - proxy.waitingSince; proxy.stats.stallMs += ms; proxy.waitingSince = null;
        if (ms > 50) proxy.margin = Math.min(250, proxy.margin + Math.min(40, ms / 2));
      }
      if (executedTurns) proxy.margin = Math.max(30, proxy.margin - 0.5 * executedTurns);
    }
    const me = proxy.seatInfo?.find((x) => x.seat === proxy.seat);
    proxy.reclaim = !!me && me.mode === 1 && proxy.nextTurn >= proxy.sealed - 20;
  }

  worker.onmessage = (e) => {
    const msg = e.data;
    if (!msg || stopped) return;
    if (msg.t === 'lsReady') {
      ready = true;
      proxy.saveHash = { turn: msg.nextTurn, hash: msg.hash };
      pump();
      return;
    }
    if (msg.t === 'lsFrame') {
      busy = false;
      proxy.nextTurn = msg.nextTurn; proxy.step = msg.step;
      proxy.aiSeats = new Set(msg.aiSeats); proxy.aiTeams = new Set(msg.aiTeams);
      proxy.stats.rejected = msg.rejected;
      if (msg.n > 1) proxy.stats.catchup += msg.n - 1;
      if (wasCatchup) { stats.catchupMs += msg.simMs; stats.catchupTurns += msg.n; }
      stats.workerSimMs += msg.simMs; stats.workerTurns += msg.n;
      if (msg.log?.length) proxy.log.push(...msg.log);
      if (msg.hashes?.length) {
        for (const h of msg.hashes) { proxy.hashQueue.push(h); proxy.hashLog.push(h); }
      }
      const at = now();
      for (const r of msg.results || []) {
        const mine = proxy.issued.get(r.seq); proxy.issued.delete(r.seq);
        const latency = mine ? at - mine.at : null;
        if (latency !== null) proxy.stats.latency.push(latency);
        if (mine && proxy.stats.trace) proxy.stats.trace.push([+(mine.clock).toFixed(2), r.turn, +proxy.clockTurn().toFixed(2)]);
        executed.push({ type: r.cmd.type, latency, at }); if (executed.length > 500) executed.shift();
        opts.onResult?.(r.result, r.cmd, latency);
      }
      for (const ev of msg.controls || []) {
        proxy.control.push(ev);
        opts.onControl?.(ev, proxy);
      }
      for (const snap of msg.snaps || []) {
        proxy.lastSnap = { ...snap };
        proxy.onSnapshot?.(snap);
      }
      if (msg.sysProfile) sysProf = mergeProfile(sysProf, msg.sysProfile);
      if (msg.diag) root.PerformanceAudit?.mergeWorkerDiag?.(msg.diag);
      updateStall(msg.n);
      if (msg.view) {
        stats.views++; stats.viewMs += msg.viewMs; stats.maxViewMs = Math.max(stats.maxViewMs, msg.viewMs);
        viewTurn = msg.viewTurn; lastView = now();
        opts.onView(msg.view);
      }
      const p = proxy.progress();
      if (p || progressShown) { progressShown = !!p; opts.onProgress?.(p); }
      const wait = p ? null : proxy.waiting(1000);
      if (wait || waitShown) { waitShown = !!wait; opts.onWait?.(wait); }
      flushIdle();
      return;
    }
    if (msg.t === 'error') {
      const w = msg.q != null && waiting.get(msg.q);
      if (w) { waiting.delete(msg.q); w.reject(Error(msg.message)); return; }
      busy = false; flushIdle();
      opts.onError?.(new Error('lockstep worker: ' + msg.message), true);
      return;
    }
    const w = waiting.get(msg.q);
    if (w) { waiting.delete(msg.q); w.resolve(msg); }
  };
  worker.onerror = (ev) => {
    ev?.preventDefault?.();
    busy = false; flushIdle();
    opts.onError?.(new Error('lockstep worker failed: ' + (ev?.message || 'script error')), true);
  };

  let mode = ls.transport === 'ws' ? 'ws' : 'http';
  try { const q = new URLSearchParams(root.location.search).get('lockstep'); if (q === 'ws' || q === 'http') mode = q; } catch { /* keep */ }
  const wsUrl = root.location ? (root.location.protocol === 'https:' ? 'wss://' : 'ws://') + root.location.host + '/api/lockstep/' + opts.room.id + '/ws' : null;
  const transport = new AutoTransport({
    mode, httpUrl: '/api/lockstep/' + opts.room.id, wsUrl, token: opts.token, client: proxy,
    onReceive: () => opts.onAlive?.(), onError: (e, fatal) => opts.onError?.(e, fatal), onSwitch: (reason) => opts.onSwitch?.(reason),
  });
  const snaps = attachSnapshots(proxy, { url: '/api/lockstep/' + opts.room.id, token: opts.token, onLoaded: (turn, ms) => { transport.resync(); opts.onSnapshot?.(turn, ms); } });

  function pump() {
    if (stopped) return;
    snaps.tick();
    const p = proxy.progress();
    if (p || progressShown) { progressShown = !!p; opts.onProgress?.(p); }
    updateStall(0);
    const wait = p ? null : proxy.waiting(1000);
    if (wait || waitShown) { waitShown = !!wait; opts.onWait?.(wait); }
    if (proxy.desync && !stopped) { opts.onDesync?.(proxy.desync, proxy); stop(); return; }
    opts.onPump?.(proxy);
    if (!ready || busy || loadingSnap || saving || proxy.resumeAt || proxy.desync) return;
    const limit = Math.min(proxy.horizon(), proxy.sealed);
    const canAdvance = proxy.nextTurn <= limit;
    const wantView = (!p && (now() - lastView >= VIEW_EVERY || viewTurn < 0) && (canAdvance || proxy.nextTurn > viewTurn))
      || (!!p && viewTurn < 0 && (canAdvance || proxy.nextTurn > 0));
    if (!canAdvance && !wantView) return;
    const rows = pendingRows; pendingRows = [];
    const behind = proxy.horizon() - proxy.nextTurn;
    const budget = p ? 60 : behind > 10 ? 40 : 12;
    const replica = opts.replica?.();
    wasCatchup = !!p;
    busy = true;
    worker.postMessage({
      t: 'lsStep', rows, sealed: proxy.sealed, limit, budget,
      wantView, viewTurn,
      eventAfter: wantView ? (replica?.lastEvent || 0) : 0,
      have: wantView ? (replica?.have?.() || {}) : null,
    });
  }

  const wake = () => { if (!root.document || !root.document.hidden) transport.wake(); };
  function stop() {
    if (stopped) return;
    stopped = true; clearInterval(timer); transport.stop();
    root.document?.removeEventListener?.('visibilitychange', wake);
    root.removeEventListener?.('online', wake);
    root.removeEventListener?.('pageshow', wake);
    for (const w of waiting.values()) w.reject(Error('lockstep worker stopped'));
    waiting.clear(); flushIdle();
    try { worker.postMessage({ t: 'stop' }); } catch { /* gone */ }
    try { worker.terminate(); } catch { /* gone */ }
  }

  async function prepareSave() {
    if (stopped || !ready) return null;
    saving = true;
    try {
      await waitIdle();
      const m = await ask('lsChecksum');
      proxy.saveHash = { turn: m.turn, hash: m.hash };
      return m;
    } finally { saving = false; }
  }
  function setProfile(on) {
    profiling = !!on;
    if (!profiling) sysProf = null;
    if (!stopped) try { worker.postMessage({ t: 'profile', on: profiling }); } catch { /* gone */ }
  }
  function takeSystemProfile() {
    const p = sysProf; sysProf = null; return p;
  }

  transport.start();
  timer = setInterval(pump, 16);
  root.document?.addEventListener?.('visibilitychange', wake);
  root.addEventListener?.('online', wake);
  root.addEventListener?.('pageshow', wake);

  worker.postMessage({
    t: 'lsInit', setup: ls.setup, seat: opts.seat, seats: ls.seats,
    startAt: ls.startAt, period: ls.period, resumeAt, navRoom: opts.room.id, hashes: true, profile: profiling,
  });

  return {
    client: proxy, transport, stats, stop, executed, snaps, mode: 'live', worker: true,
    get stopped() { return stopped; },
    get ready() { return ready; },
    recording: () => proxy.recording(),
    prepareSave, setProfile, takeSystemProfile,
    issue(type, args) { if (stopped) return false; if (proxy.progress()) { opts.onRefused?.('catchup'); return false; } const ok = proxy.issue(type, args); if (ok) transport.kick(); return ok; },
  };
}
