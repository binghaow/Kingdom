'use strict';
/* P3 lockstep relay core (docs/architecture/p3-lockstep-design.md). Transport-agnostic and simulation-free: it never loads
   the Sim. Both adapters use it — server/lockstep/http.cjs (D1 tables, HTTP polling; v1, runs on the current hosting) and
   server/lockstep/durable.cjs (WebSocket + Durable Object; written and tested locally, enabled once hosting supports it).

   Time model (design section 4): 20 simulation steps per second, 2 steps per turn, so one turn = 100 ms of game time.
   The relay owns a turn clock: turn c is "open" during [startAt + c*period, startAt + (c+1)*period). A command is assigned
   the earliest turn that is still open when it reaches the relay (never an already sealed one); a turn is sealed once its
   window has passed, and from then on its command list is final and is delivered to everybody in the same order
   (turn, seat, seq). Every client runs the same Sim on the same ordered commands, so every client computes the same game.

   Command delay D (2–5 turns, design section 4): the relay recommends D from the seats' p90 round-trip time + 50 ms. Clients
   use it as their playback horizon — they execute turn T about D turns after the moment a command for T could still be
   issued — so a click takes effect about D*100 ms later on every screen. D only paces playback; which turn a command runs
   in is decided by the relay alone, so changing D can never cause a desync.

   Hold: the relay stops sealing new turns while an active human seat has fallen more than AHEAD turns behind (slow device or
   stalled connection); everyone then shows "waiting for <player>". A seat with no request for ACTIVE_MS no longer holds the
   game (3c adds AI takeover after 60 s and reconnect/catch-up). */
/* 3c: TAKEOVER_MS — a seat with no message for this long is handed to the computer (design section 9: 60 s, reclaimable);
   until then it holds the game ("等待 X，N 秒后由电脑接管"). CATCHUP — a seat more than this many turns behind the sealed turn
   is catching up (refresh, reconnect, restored room) and does not hold the others; when every active seat is that far
   behind, the relay waits for the most advanced one instead of running ahead with nobody playing. SYSTEM_SEAT — commands
   the relay itself inserts (computer takeover / release), delivered in the same ordered stream as player commands. */
const TAKEOVER_MS = 60000, CATCHUP = 50, SYSTEM_SEAT = 99;
const PERIOD = 100, STEPS_PER_TURN = 2, STEP = 0.05, HASH_EVERY = 20, D_MIN = 2, D_MAX = 5, AHEAD = 10, ACTIVE_MS = 5000,
  MAX_SEATS = 8, MAX_CMDS = 32, MAX_CMD_BYTES = 4096, MAX_HASHES = 16, MAX_ROWS = 2000, PROTOCOL = 1;

/* Turn whose window contains `now` (negative before the start). */
function clockTurn(startAt, period, now) { return Math.floor((now - startAt) / period); }

/* Highest turn that may be sealed now: every fully elapsed turn, but not more than AHEAD turns past the slowest active human
   seat (its executed turn). seats: [{human, seen, at, mode}] (mode 0 = playing, 1 = computer takeover, 2 = left after a
   desync). With `sealed` given (3c), seats more than CATCHUP turns behind it are catching up and do not hold; if every active
   seat is catching up, the most advanced one paces the relay. The SQL in http.cjs (HOLD) is the same rule. */
function sealLimit(startAt, period, now, seats, ahead = AHEAD, activeMs = TAKEOVER_MS, sealed = -Infinity) {
  const elapsed = clockTurn(startAt, period, now) - 1;
  const active = (seats || []).filter((s) => s && s.human && !s.mode && now - s.seen <= activeMs);
  if (!active.length) return elapsed;
  const near = active.filter((s) => s.at >= sealed - CATCHUP);
  const pace = near.length ? Math.min(...near.map((s) => s.at)) : Math.max(...active.map((s) => s.at));
  return Math.min(elapsed, pace + ahead);
}

/* Turn a command reaching the relay now is assigned to: the current clock turn, but never a sealed one, and never past the
   first turn the hold rule still keeps open (limit = sealLimit(...)) — otherwise, while everyone waits for a slow seat, a
   command would be parked at the far-ahead wall-clock turn and run seconds late once the hold ends. */
function assignTurn(sealed, startAt, period, now, limit = Infinity) { return Math.max(sealed + 1, Math.min(clockTurn(startAt, period, now), limit + 1)); }

/* Recommended delay in turns: ceil((p90 rtt + 50 ms) / period), clamped to [D_MIN, D_MAX], moved one turn at a time. */
function adaptDelay(current, rtts, period = PERIOD) {
  const list = rtts.filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  if (!list.length) return current;
  const p90 = list[Math.min(list.length - 1, Math.ceil(list.length * 0.9) - 1)];
  const want = Math.max(D_MIN, Math.min(D_MAX, Math.ceil((p90 + 50) / period)));
  return want > current ? current + 1 : want < current ? current - 1 : current;
}

/* Envelope check only: the command itself is validated by every client's Sim (public/network-commands.js execute), which
   rejects foreign units, bad targets etc. identically everywhere. Returns the canonical JSON text or null. */
function commandText(cmd) {
  if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd) || typeof cmd.type !== 'string' || !/^[A-Za-z]{1,24}$/.test(cmd.type)) return null;
  const args = cmd.args === undefined ? {} : cmd.args;
  if (!args || typeof args !== 'object' || Array.isArray(args)) return null;
  const text = JSON.stringify({ type: cmd.type, args });
  return text.length <= MAX_CMD_BYTES ? text : null;
}

/* Parses a client message body: { a: last turn received, x: last turn executed, r: rtt ms, c: [[seq, cmd]], h: [[step, hash]] } */
function parseClient(body) {
  const out = { after: -1, at: -1, rtt: null, cmds: [], hashes: [], wait: body?.w !== 0, turns: body?.q !== 0, seats: !!body?.s, replay: !!body?.replay, reclaim: body?.k === 1, fresh: body?.f === 1 };
  if (!body || typeof body !== 'object') return out;
  if (Number.isSafeInteger(body.a)) out.after = Math.max(-1, body.a);
  if (Number.isSafeInteger(body.x)) out.at = Math.max(-1, body.x);
  if (Number.isFinite(body.r)) out.rtt = Math.max(0, Math.min(10000, Math.round(body.r)));
  if (Array.isArray(body.c)) {
    if (body.c.length > MAX_CMDS) throw Object.assign(new Error('指令过多'), { status: 400 });
    for (const item of body.c) {
      if (!Array.isArray(item) || !Number.isSafeInteger(item[0]) || item[0] <= 0) throw Object.assign(new Error('无效指令序号'), { status: 400 });
      const text = commandText(item[1]);
      if (!text) throw Object.assign(new Error('无效指令'), { status: 400 });
      out.cmds.push({ seq: item[0], text });
    }
  }
  if (Array.isArray(body.h)) for (const item of body.h.slice(0, MAX_HASHES))
    if (Array.isArray(item) && Number.isSafeInteger(item[0]) && item[0] > 0 && item[0] % HASH_EVERY === 0 && typeof item[1] === 'string' && /^[0-9a-f]{8}$/.test(item[1])) out.hashes.push({ step: item[0], hash: item[1] });
  return out;
}

/* Hash bookkeeping for one step: first report fixes the reference, later reports either agree (bit set) or are recorded as bad.
   entry: {hash, agree, bad:[[seat,hash]]} -> returns true when this report disagrees. */
function recordHash(entry, seat, hash) {
  if (!entry.hash) { entry.hash = hash; entry.agree = 1 << seat; entry.bad = []; return false; }
  if (entry.hash === hash) { entry.agree |= 1 << seat; return false; }
  entry.bad.push([seat, hash]); return true;
}

/* Rows [{turn, seat, seq, text}] in delivery order; the wire form keeps each command's JSON text verbatim. */
function sortRows(rows) { return rows.sort((a, b) => a.turn - b.turn || a.seat - b.seat || a.seq - b.seq); }
function rowsJSON(rows) { return '[' + rows.map((r) => '[' + r.turn + ',' + r.seat + ',' + r.seq + ',' + r.text + ']').join(',') + ']'; }

/* Setup every client builds its Sim from (design section 6, start). Same fields as the authoritative room service's start(). */
function makeSetup({ difficulty, nations, groups, mapId, minerals, fog, seed, humanTeams, names, netMode }) {
  return { difficulty, options: { nations, groups, mapId, minerals, fog, seed, humanTeams }, names, netMode, step: STEP, stepsPerTurn: STEPS_PER_TURN, hashEvery: HASH_EVERY };
}

/* Downloadable match recording: setup + every relayed command in delivery order (design section 9 item 4). */
function recording(setup, rows, meta = {}) {
  return { format: 'kingdom-lockstep', version: 1, protocol: PROTOCOL, setup, period: meta.period || PERIOD, seats: meta.seats || [], sealed: meta.sealed ?? null,
    commands: sortRows(rows.slice()).map((r) => ({ turn: r.turn, seat: r.seat, seq: r.seq, c: typeof r.text === 'string' ? JSON.parse(r.text) : r.c })), desync: meta.desync || null };
}

/* System command text (relay-inserted, seat SYSTEM_SEAT). */
function systemCommand(type, args) { return JSON.stringify({ type, args }); }

/* Desync v1 (design section 6 / 9.3): majority wins. reports [[seat, hash]] for one step -> {hash, winners, losers} or null
   while undecided. Largest group wins; a tie goes to the group holding the lowest seat (the host is seat 0). */
function majority(reports) {
  const groups = new Map();
  for (const [seat, hash] of reports) { if (!groups.has(hash)) groups.set(hash, []); if (!groups.get(hash).includes(seat)) groups.get(hash).push(seat); }
  if (groups.size < 2) return null;
  const list = [...groups].map(([hash, seats]) => ({ hash, seats: seats.sort((a, b) => a - b) })).sort((a, b) => b.seats.length - a.seats.length || a.seats[0] - b.seats[0]);
  return { hash: list[0].hash, winners: list[0].seats, losers: list.slice(1).flatMap((g) => g.seats).sort((a, b) => a - b), tie: list[1].seats.length === list[0].seats.length };
}
/* Expands the hashes-table row of one step into reports: agree is a seat bit mask for `hash`, bad is "seat:hash,seat:hash". */
function hashReports(row) {
  const out = [];
  for (let seat = 0; seat < 31; seat++) if (row.agree & (1 << seat)) out.push([seat, row.hash]);
  for (const part of String(row.bad || '').split(',')) { const m = part.match(/^(\d+):([0-9a-f]{8})$/); if (m) out.push([+m[1], m[2]]); }
  return out;
}

module.exports = { TAKEOVER_MS, CATCHUP, SYSTEM_SEAT, systemCommand, majority, hashReports, PERIOD, STEPS_PER_TURN, STEP, HASH_EVERY, D_MIN, D_MAX, AHEAD, ACTIVE_MS, MAX_SEATS, MAX_CMDS, MAX_ROWS, PROTOCOL,
  clockTurn, sealLimit, assignTurn, adaptDelay, commandText, parseClient, recordHash, sortRows, rowsJSON, makeSetup, recording };
