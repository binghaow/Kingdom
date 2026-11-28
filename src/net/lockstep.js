/* P3 lockstep client core (docs/architecture/p3-lockstep-design.md). Shared by the browser (bundled into kingdom-core.js)
   and the Node headless clients (scripts/lockstep/). It owns one full simulation built from the room setup and runs it turn
   by turn on the command lists the relay delivers; it never changes simulation code (the Sim, its AI and the command rules in
   public/network-commands.js are the same files every peer and the old room service use).

   Turn t = steps 2t and 2t+1 (0.05 s each). Commands of turn t are applied, in the relay's order (seat, seq), before its first
   step. Every 20 steps the client queues the P1 checksum for the relay to compare. */

import { checksum } from '../core/hash.js';
import { caretaker } from './caretaker.js';

export const STEP = 0.05, STEPS_PER_TURN = 2, HASH_EVERY = 20, DEFAULT_PERIOD = 100;
/* 3c: relay-inserted commands come from SYSTEM_SEAT in the ordered stream (computer takeover / release), so every client
   switches control in the same turn. A client more than CATCHUP turns behind the sealed turn is catching up (refresh,
   reconnect, restored room): it runs turns as fast as its budget allows and checksums only every CATCHUP_HASH steps. */
export const SYSTEM_SEAT = 99, CATCHUP = 50, CATCHUP_HASH = 600, TAKEOVER_MS = 60000;
/* 3c snapshots: at the end of every SNAP_EVERY-th turn (5 game minutes) every client round-trips its simulation through
   the room service's own persistence (networkPersistent -> JSON -> networkHydrate, what the old server-authoritative mode
   does on every request). All clients do it in the same turn, so they stay identical, and the JSON text is a snapshot any
   client can load to resume at that turn instead of replaying from turn 0. The step hash reported right after it is taken
   on the normalized state, so the relay's majority-agreed checksum verifies the snapshot. */
export const SNAP_EVERY = 3000;
const clone = (v) => JSON.parse(JSON.stringify(v));

/* Same construction sequence as the authoritative room service start() (server/service.cjs). */
export function buildSim(K, setup) {
  const sim = new K.NetworkSim(setup.difficulty, null, clone(setup.options));
  sim.s.playerNames = setup.names.slice();
  sim.s.netMode = setup.netMode;
  sim.prewarmNav();
  sim.announce('联机战役已开始');
  return sim;
}

export class LockstepClient {
  /* opts: K (window.KingdomSim / network-model.js), commands (network-commands.js), setup, seat, seats [{seat,team}],
     startAt (relay clock ms), period, now() local ms clock, onResult(text, cmd, latencyMs), hashes (default true) */
  constructor(opts) {
    this.K = opts.K; this.commands = opts.commands; this.setup = opts.setup; this.seat = opts.seat;
    this.teams = new Map((opts.seats || []).map((s) => [s.seat, s.team]));
    this.team = this.teams.has(opts.seat) ? this.teams.get(opts.seat) : -1;
    this.startAt = opts.startAt; this.period = opts.period || DEFAULT_PERIOD; this.now = opts.now || (() => Date.now());
    this.onResult = opts.onResult || null; this.onTurn = opts.onTurn || null; this.hashes = opts.hashes !== false;
    this.sim = opts.sim || buildSim(this.K, this.setup);
    this.nextTurn = 0; this.step = 0; this.sealed = -1; this.delay = 2; this.turns = new Map(); this.seen = new Set();
    this.outbox = []; this.sentCmds = new Map(); this.seq = 0; this.issued = new Map(); this.hashQueue = []; this.hashLog = [];
    this.offset = null; this.samples = []; this.rtt = null; this.seatInfo = null; this.desync = null;
    this.waitingSince = null; this.log = []; this.margin = 30;
    this.aiSeats = new Set(); this.aiTeams = new Set(); this.desyncInfo = null; this.reclaim = false; this.control = [];
    this.stats = { requests: 0, failures: 0, up: 0, down: 0, latency: [], turnLatency: [], catchup: 0, stalls: 0, stallMs: 0, commands: 0, rejected: 0 };
    /* 3e: a room restored from a save that carries a snapshot has no commands before the snapshot turn (the host uploads
       only the turns after it). resumeAt {turn, hash}: no turn runs until a snapshot of at least that turn is loaded and
       verified (src/net/snapshots.js fetches it from the relay). lastSnap: the newest snapshot this client made or loaded
       ({turn, step, hash, text, aiSeats}); online saves include it (src/net/saves.js). */
    this.resumeAt = opts.resumeAt && Number.isSafeInteger(opts.resumeAt.turn) && opts.resumeAt.turn > 0 ? { turn: opts.resumeAt.turn, hash: opts.resumeAt.hash } : null;
    this.lastSnap = null;
  }

  /* ---- clock ---- */
  serverNow() { return this.now() + (this.offset ?? 0); }
  clockTurn() { return (this.serverNow() - this.startAt) / this.period; }
  /* Playback horizon (design section 4): a command reaching the relay in turn T's window runs about D*period after it was
     issued; never closer to the seal than half a round trip plus a jitter margin. The margin starts at 30 ms, grows after
     each wait longer than 50 ms (turn not here yet when due) and shrinks again by 5 ms per second, so a jittery link or a busy device trades a little
     delay for smooth playback instead of stopping and starting. */
  lagTurns() {
    const rtt = this.rtt ?? 100, half = rtt / 2;
    return Math.max((half + this.margin) / this.period, this.delay - (half + this.period / 2) / this.period);
  }
  horizon() { return Math.floor(this.clockTurn() - 1 - this.lagTurns()); }

  /* ---- outgoing ---- */
  issue(type, args) {
    if (this.team < 0 || this.desync) return false;
    const item = { seq: ++this.seq, cmd: { type, args: args || {} }, at: this.now(), clock: this.clockTurn() };
    this.outbox.push(item); this.issued.set(item.seq, item); this.stats.commands++;
    return true;
  }
  /* Message for the relay; the caller passes the returned token back to sent()/failed(). */
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
  }
  /* Commands sent but not yet seen in a delivered turn go back to the front of the queue (after a reconnect or a transport
     switch); the relay ignores a seat+seq it already stored. */
  requeueUnconfirmed() {
    const waiting = [...this.issued.values()].filter((i) => !this.seen.has(this.seat + ':' + i.seq) && !this.outbox.includes(i));
    this.outbox.unshift(...waiting.sort((a, b) => a.seq - b.seq));
  }
  failed(token) {
    this.stats.failures++;
    this.outbox.unshift(...token.cmds.filter((c) => !this.outbox.includes(c)));
    this.hashQueue.unshift(...token.hashes);
  }

  /* ---- incoming ---- */
  receive(msg, token, recvAt = this.now()) {
    this.stats.requests++;
    if (token) {
      const net = Math.max(0, recvAt - token.sentAt - (msg.hw || 0));
      this.rtt = this.rtt === null ? net : this.rtt * 0.8 + net * 0.2;
      // Clock offset from the fastest recent exchange (NTP style): the reply was produced about net/2 before it arrived.
      this.samples.push({ net, offset: this.startAt + msg.n - (recvAt - net / 2) }); if (this.samples.length > 30) this.samples.shift();
      this.offset = this.samples.reduce((a, b) => (b.net < a.net ? b : a)).offset;
    }
    if (Number.isFinite(msg.d)) this.delay = msg.d;
    if (msg.snap && (!this.offer || msg.snap.turn > this.offer.turn)) this.offer = msg.snap; // 3c: newest verified relay snapshot
    if (msg.seats) this.seatInfo = msg.seats.map(([seat, team, at, age, mode]) => ({ seat, team, at, age, mode: mode || 0 }));
    // Desync v1: the relay names the minority seats; only they stop (the majority plays on, the computer takes the others).
    if (msg.ds) { this.desyncInfo = msg.ds; if (!this.desync && (!Array.isArray(msg.ds.losers) || msg.ds.losers.includes(this.seat))) this.desync = msg.ds; }
    for (const row of msg.t || []) {
      const [turn, seat, seq, cmd] = row, key = seat + ':' + seq;
      // A refreshed page / restored room starts its own numbering again: never reuse a seq the relay already stored for this seat.
      if (seat === this.seat && seq > this.seq) this.seq = seq;
      if (turn < this.nextTurn || this.seen.has(key)) continue;
      this.seen.add(key);
      let list = this.turns.get(turn); if (!list) this.turns.set(turn, list = []);
      list.push({ seat, seq, cmd });
    }
    if (Number.isFinite(msg.se) && msg.t && msg.se > this.sealed) this.sealed = msg.se;
  }

  /* ---- simulation ---- */
  runTurn() {
    const turn = this.nextTurn, list = (this.turns.get(turn) || []).sort((a, b) => a.seat - b.seat || a.seq - b.seq), now = this.now();
    for (const r of list) {
      if (r.seat === SYSTEM_SEAT) { this.applySystem(r.cmd, turn); this.log.push({ turn, seat: r.seat, seq: r.seq, c: r.cmd }); continue; }
      const team = this.teams.has(r.seat) ? this.teams.get(r.seat) : -1;
      let result;
      try { result = team >= 0 ? this.commands.execute(this.sim, team, r.cmd) : '观战席位不能下令'; } catch (e) { result = { error: String(e?.message || e) }; this.stats.rejected++; }
      this.log.push({ turn, seat: r.seat, seq: r.seq, c: r.cmd });
      if (r.seat === this.seat) {
        const mine = this.issued.get(r.seq); this.issued.delete(r.seq);
        const latency = mine ? now - mine.at : null;
        if (latency !== null) this.stats.latency.push(latency);
        if (mine && this.stats.trace) this.stats.trace.push([+(mine.clock).toFixed(2), turn, +this.clockTurn().toFixed(2)]);
        this.onResult?.(result, r.cmd, latency, r.seq);
      }
    }
    this.turns.delete(turn);
    // Team 0 has no built-in computer player (the Sim's AI starts at team 1): while it is taken over, a small deterministic
    // caretaker computed from the shared state keeps its economy and defence going, identically on every client.
    if (this.aiTeams.has(0)) for (const [type, args] of caretaker(this.K, this.sim, 0, turn)) { try { this.commands.execute(this.sim, 0, { type, args }); } catch { /* same rejection everywhere */ } }
    const catching = this.sparseCatchup !== false && this.nextTurn < this.sealed - CATCHUP;
    for (let i = 0; i < STEPS_PER_TURN; i++) {
      this.sim.tick(STEP); this.step++;
      if (i === STEPS_PER_TURN - 1 && (turn + 1) % SNAP_EVERY === 0) this.normalize(turn + 1);
      if (this.hashes && this.step % (catching ? CATCHUP_HASH : HASH_EVERY) === 0) { const h = checksum(this.sim).hash; this.hashQueue.push([this.step, h]); this.hashLog.push([this.step, h]); if (this.snapshot && this.snapshot.step === this.step) { this.snapshot.hash = h; this.lastSnap = { ...this.snapshot }; this.onSnapshot?.(this.snapshot); } }
    }
    this.nextTurn++;
    this.onTurn?.(turn);
  }
  /* System command (relay seat SYSTEM_SEAT): {type:'aiTakeover'|'aiRelease', args:{seat, team, reason}}. A team is computer
     controlled while every human seat of it is taken over. Teams >= 1 use the Sim's own computer player (removed from
     s.humanTeams, thinking from now); team 0 uses the caretaker above. */
  applySystem(cmd, turn) {
    const seat = cmd?.args?.seat; if (!Number.isSafeInteger(seat) || !this.teams.has(seat)) return;
    if (cmd.type === 'aiTakeover') this.aiSeats.add(seat); else if (cmd.type === 'aiRelease') this.aiSeats.delete(seat); else return;
    const team = this.teams.get(seat), seats = [...this.teams].filter(([, t]) => t === team).map(([s]) => s), ai = seats.every((x) => this.aiSeats.has(x));
    const s = this.sim.s, was = this.aiTeams.has(team);
    if (ai && !was) { this.aiTeams.add(team); if (team > 0) { s.humanTeams = (s.humanTeams || []).filter((t) => t !== team); if (s.nextThink) s.nextThink[team] = s.time; } }
    else if (!ai && was) { this.aiTeams.delete(team); if (team > 0) s.humanTeams = (this.setup.options.humanTeams || []).filter((t) => !this.aiTeams.has(t)); }
    this.control.push({ turn, seat, team, type: cmd.type, reason: cmd.args.reason || null });
    this.onControl?.({ turn, seat, team, type: cmd.type, reason: cmd.args.reason || null, ai });
  }
  /* Snapshot (see SNAP_EVERY): normalize the simulation in place and keep the JSON text for upload. */
  normalize(turn) {
    const text = JSON.stringify(this.K.networkPersistent(this.sim));
    this.sim = this.K.networkHydrate(JSON.parse(text), { room: this.navRoom || null });
    this.snapshot = { turn, step: turn * STEPS_PER_TURN, text, aiSeats: [...this.aiSeats], hash: null, live: this.nextTurn >= this.sealed - CATCHUP };
  }
  /* Resume from a relay snapshot (verified by the caller against the majority checksum): the state at the start of `turn`. */
  loadSnapshot(snap) {
    const sim = this.K.networkHydrate(JSON.parse(snap.text), { room: this.navRoom || null });
    const hash = checksum(sim).hash;
    if (hash !== snap.hash) return { ok: false, hash };
    sim.prewarmNav?.();
    this.sim = sim; this.nextTurn = snap.turn; this.step = snap.turn * STEPS_PER_TURN; this.sealed = Math.max(this.sealed, snap.turn - 1);
    for (const t of [...this.turns.keys()]) if (t < snap.turn) this.turns.delete(t);
    this.aiSeats = new Set(snap.aiSeats || []); this.aiTeams = new Set();
    for (const team of new Set(this.teams.values())) { const seats = [...this.teams].filter(([, t]) => t === team).map(([x]) => x); if (seats.length && seats.every((x) => this.aiSeats.has(x))) this.aiTeams.add(team); }
    if (Number.isSafeInteger(snap.seq) && snap.seq > this.seq) this.seq = snap.seq;
    this.logFrom = snap.turn; this.log = []; this.hashLog.push([this.step, hash]);
    this.stats.snapshotTurn = snap.turn;
    this.lastSnap = { turn: snap.turn, step: this.step, hash, text: snap.text, aiSeats: [...this.aiSeats], encoded: snap.encoded || null };
    if (this.resumeAt && snap.turn >= this.resumeAt.turn) this.resumeAt = null;
    return { ok: true, hash };
  }
  /* Catch-up progress (refresh / reconnect / restored room): null when on time. */
  progress() {
    if (this.resumeAt) return { turn: this.nextTurn, target: Math.max(this.sealed, this.resumeAt.turn), behind: Math.max(this.sealed, this.resumeAt.turn) - this.nextTurn, snapshot: true };
    const behind = this.sealed - this.nextTurn; return behind > CATCHUP ? { turn: this.nextTurn, target: this.sealed, behind } : null;
  }
  /* Runs every turn that is both sealed and due, within a time budget (ms). A device that fell behind (background tab,
     slow frame) runs extra turns until it is back on the horizon (catch-up). Returns turns executed. */
  advance(budget = 12) {
    if (this.resumeAt) return 0; // waiting for the restore snapshot (see resumeAt)
    const start = this.now(), limit = Math.min(this.horizon(), this.sealed);
    let n = 0;
    while (this.nextTurn <= limit && !this.desync) {
      this.runTurn(); n++;
      if (this.now() - start > budget) break;
    }
    if (n > 1) this.stats.catchup += n - 1;
    const due = this.horizon() >= this.nextTurn && this.nextTurn > this.sealed;
    if (due && !this.desync) { if (this.waitingSince === null) { this.waitingSince = this.now(); this.stats.stalls++; } }
    else if (this.waitingSince !== null) { const ms = this.now() - this.waitingSince; this.stats.stallMs += ms; this.waitingSince = null; if (ms > 50) this.margin = Math.min(250, this.margin + Math.min(40, ms / 2)); }
    if (n) this.margin = Math.max(30, this.margin - 0.5 * n);
    // Back after a computer takeover: ask the relay to hand the seat back once this client has caught up (3c).
    const me = this.seatInfo?.find((x) => x.seat === this.seat);
    this.reclaim = !!me && me.mode === 1 && this.nextTurn >= this.sealed - 20;
    return n;
  }
  /* Who the game is waiting for, once a wait exceeds 1 s (design section 6): the slowest seat that is behind, else the network. */
  waiting(limitMs = 1000) {
    if (this.waitingSince === null || this.now() - this.waitingSince < limitMs) return null;
    const behind = (this.seatInfo || []).filter((s) => s.seat !== this.seat && s.team >= 0 && !s.mode && (s.at < this.sealed - 5 || s.age > 1500)).sort((a, b) => a.at - b.at)[0];
    // takeover: seconds until the relay hands that seat to the computer (it counts from the seat's last message)
    return behind ? { seat: behind.seat, team: behind.team, ms: this.now() - this.waitingSince, takeoverIn: Math.max(0, Math.ceil((TAKEOVER_MS - behind.age) / 1000)), offline: behind.age > 1500 } : { seat: null, team: null, ms: this.now() - this.waitingSince };
  }
  recording() {
    return { format: 'kingdom-lockstep', version: 1, setup: this.setup, period: this.period, seats: [...this.teams].map(([seat, team]) => ({ seat, team })),
      turns: this.nextTurn, logFrom: this.logFrom || 0, commands: this.log.slice(), checksums: this.hashLog.map(([step, hash]) => ({ step, hash })), aiSeats: [...this.aiSeats] };
  }
}

/* Replays a lockstep recording headless (Node or browser): same Sim, same command order. Returns the checksum list.
   snapshot {turn, hash, text, aiSeats} (3e): start from that verified snapshot instead of turn 0 (a recording of a room
   restored from a snapshot has no commands before it). */
export function replayLockstep(K, commands, rec, { turns = rec.turns, snapshot = null } = {}) {
  const c = new LockstepClient({ K, commands, setup: rec.setup, seat: -1, seats: rec.seats, startAt: 0, period: rec.period, now: () => 0 });
  for (const r of rec.commands) c.receive({ t: [[r.turn, r.seat, r.seq, r.c]] });
  if (snapshot) { const l = c.loadSnapshot(snapshot); if (!l.ok) throw new Error('snapshot checksum ' + l.hash + ' != ' + snapshot.hash); }
  c.sealed = turns - 1; c.hashes = rec.hashes !== false; c.sparseCatchup = false;
  while (c.nextTurn < turns) c.runTurn();
  return { checksums: c.hashLog.map(([step, hash]) => ({ step, hash })), final: checksum(c.sim) };
}
