/* P3 lockstep client core (docs/architecture/p3-lockstep-design.md). Shared by the browser (bundled into kingdom-core.js)
   and the Node headless clients (scripts/lockstep/). It owns one full simulation built from the room setup and runs it turn
   by turn on the command lists the relay delivers; it never changes simulation code (the Sim, its AI and the command rules in
   public/network-commands.js are the same files every peer and the old room service use).

   Turn t = steps 2t and 2t+1 (0.05 s each). Commands of turn t are applied, in the relay's order (seat, seq), before its first
   step. Every 20 steps the client queues the P1 checksum for the relay to compare. */

import { checksum } from '../core/hash.js';

export const STEP = 0.05, STEPS_PER_TURN = 2, HASH_EVERY = 20, DEFAULT_PERIOD = 100;
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
    this.stats = { requests: 0, failures: 0, up: 0, down: 0, latency: [], turnLatency: [], catchup: 0, stalls: 0, stallMs: 0, commands: 0, rejected: 0 };
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
  outgoing({ wait = true, turns = true, seats = false } = {}) {
    const cmds = this.outbox.splice(0, 32), hashes = this.hashQueue.splice(0, 16);
    const body = { a: this.sealed, x: this.nextTurn - 1 };
    if (!wait) body.w = 0;
    if (!turns) body.q = 0;
    if (this.rtt !== null) body.r = Math.round(this.rtt);
    if (cmds.length) body.c = cmds.map((c) => [c.seq, c.cmd]);
    if (hashes.length) body.h = hashes;
    if (seats) body.s = 1;
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
    if (msg.seats) this.seatInfo = msg.seats.map(([seat, team, at, age]) => ({ seat, team, at, age }));
    if (msg.ds && !this.desync) this.desync = msg.ds;
    for (const row of msg.t || []) {
      const [turn, seat, seq, cmd] = row, key = seat + ':' + seq;
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
      const team = this.teams.has(r.seat) ? this.teams.get(r.seat) : -1;
      let result;
      try { result = team >= 0 ? this.commands.execute(this.sim, team, r.cmd) : '观战席位不能下令'; } catch (e) { result = { error: String(e?.message || e) }; this.stats.rejected++; }
      this.log.push({ turn, seat: r.seat, seq: r.seq, c: r.cmd });
      if (r.seat === this.seat) {
        const mine = this.issued.get(r.seq); this.issued.delete(r.seq);
        const latency = mine ? now - mine.at : null;
        if (latency !== null) this.stats.latency.push(latency);
        if (mine && this.stats.trace) this.stats.trace.push([+(mine.clock).toFixed(2), turn, +this.clockTurn().toFixed(2)]);
        this.onResult?.(result, r.cmd, latency);
      }
    }
    this.turns.delete(turn);
    for (let i = 0; i < STEPS_PER_TURN; i++) {
      this.sim.tick(STEP); this.step++;
      if (this.hashes && this.step % HASH_EVERY === 0) { const h = checksum(this.sim).hash; this.hashQueue.push([this.step, h]); this.hashLog.push([this.step, h]); }
    }
    this.nextTurn++;
    this.onTurn?.(turn);
  }
  /* Runs every turn that is both sealed and due, within a time budget (ms). A device that fell behind (background tab,
     slow frame) runs extra turns until it is back on the horizon (catch-up). Returns turns executed. */
  advance(budget = 12) {
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
    return n;
  }
  /* Who the game is waiting for, once a wait exceeds 1 s (design section 6): the slowest seat that is behind, else the network. */
  waiting(limitMs = 1000) {
    if (this.waitingSince === null || this.now() - this.waitingSince < limitMs) return null;
    const behind = (this.seatInfo || []).filter((s) => s.seat !== this.seat && s.team >= 0 && (s.at < this.sealed - 5 || s.age > 1500)).sort((a, b) => a.at - b.at)[0];
    return behind ? { seat: behind.seat, team: behind.team, ms: this.now() - this.waitingSince } : { seat: null, team: null, ms: this.now() - this.waitingSince };
  }
  recording() {
    return { format: 'kingdom-lockstep', version: 1, setup: this.setup, period: this.period, seats: [...this.teams].map(([seat, team]) => ({ seat, team })),
      turns: this.nextTurn, commands: this.log.slice(), checksums: this.hashLog.map(([step, hash]) => ({ step, hash })) };
  }
}

/* Replays a lockstep recording headless (Node or browser): same Sim, same command order. Returns the checksum list. */
export function replayLockstep(K, commands, rec, { turns = rec.turns } = {}) {
  const c = new LockstepClient({ K, commands, setup: rec.setup, seat: -1, seats: rec.seats, startAt: 0, period: rec.period, now: () => 0 });
  for (const r of rec.commands) c.receive({ t: [[r.turn, r.seat, r.seq, r.c]] });
  c.sealed = turns - 1;
  while (c.nextTurn < turns) c.runTurn();
  return { checksums: c.hashLog.map(([step, hash]) => ({ step, hash })), final: checksum(c.sim) };
}
