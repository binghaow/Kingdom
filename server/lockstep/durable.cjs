'use strict';
/* P3 lockstep relay, WebSocket + Durable Object adapter — written and tested locally (scripts/lockstep/ws-harness.cjs with
   Node `ws`), NOT enabled: it waits until the hosting is confirmed to support WebSockets and Durable Objects
   (docs/p3-lockstep-progress.md lists what to confirm and the wiring still needed: a durable_objects binding + migration in
   wrangler.json, a named export of LockstepRoomDurable from the Worker entry, and a route for /api/lockstep/ws/<ROOM>).

   Selection (http.cjs handle/handleSocket): when the Worker has a Durable Object binding named LOCKSTEP, every lockstep request
   of a room (socket and HTTP poll) goes to that room's object (B1); without it, sockets use the WebSocket-on-D1 backend (B2,
   http.cjs attachSocket) and polls use plain HTTP on D1.

   One object per room keeps the room in memory (MemoryRelay below), seals a turn every period and pushes it to every socket
   (design section 5 messages). Rules are the same relay core as the HTTP adapter (relay-core.cjs).

   client -> relay  {type:'hello', seat, token, proto, last}     relay -> client {type:'start', setup, seats, startAt, period, d, n}
                    {type:'cmd', c:[[seq, cmd]]}                                 {type:'turns', n, se, d, t:[[turn, seat, seq, cmd]]}
                    {type:'ack', x, h:[[step, hash]]}                            {type:'pong', t, n}
                    {type:'ping', t, r}                                          {type:'desync', ds}  {type:'seat', seats}
   'turns' is sent every period (empty turns included, as the heartbeat); hello with last = K replays turns K+1.. (catch-up). */
const core = require('./relay-core.cjs');

async function sha256(text) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join(''); }

class MemoryRelay {
  /* seats: [{seat, team, token: sha256 hash, human}] */
  constructor({ setup, seats, startAt, period = core.PERIOD }) {
    this.setup = setup; this.startAt = startAt; this.period = period; this.sealed = -1; this.delay = core.D_MIN; this.desync = null;
    this.seats = new Map(seats.map((s) => [s.seat, { seat: s.seat, team: s.team, token: s.token, human: s.human !== false, seen: 0, at: -1, rtt: null }]));
    this.rows = []; this.open = []; this.keys = new Set(); this.hashes = new Map();
  }
  seatFor(tokenHash) { for (const s of this.seats.values()) if (s.token === tokenHash) return s; return null; }
  touch(seat, now, at, rtt) { const s = this.seats.get(seat); if (!s) return; s.seen = now; if (Number.isSafeInteger(at)) s.at = Math.max(s.at, at); if (Number.isFinite(rtt)) s.rtt = rtt; }
  submit(seat, cmds, now) {
    const turn = core.assignTurn(this.sealed, this.startAt, this.period, now, core.sealLimit(this.startAt, this.period, now, [...this.seats.values()], core.AHEAD, core.ACTIVE_MS));
    for (const c of cmds) { const key = seat + ':' + c.seq; if (this.keys.has(key)) continue; this.keys.add(key); this.open.push({ turn, seat, seq: c.seq, text: c.text }); }
  }
  /* Returns the first mismatching report, if any. */
  report(seat, hashes) {
    for (const h of hashes) {
      let e = this.hashes.get(h.step); if (!e) this.hashes.set(h.step, e = {});
      if (core.recordHash(e, seat, h.hash) && !this.desync) this.desync = { step: h.step, reference: e.hash, agree: e.agree, reports: [[seat, h.hash]] };
    }
    return this.desync;
  }
  /* Seals every due turn; returns the newly sealed rows (possibly none) and the new sealed turn. */
  seal(now) {
    const limit = core.sealLimit(this.startAt, this.period, now, [...this.seats.values()], core.AHEAD, core.ACTIVE_MS);
    if (limit <= this.sealed) return null;
    const from = this.sealed; this.sealed = limit;
    const fresh = core.sortRows(this.open.filter((r) => r.turn <= limit)); this.open = this.open.filter((r) => r.turn > limit);
    this.rows.push(...fresh);
    return { from, sealed: limit, rows: fresh };
  }
  since(after) { return this.rows.filter((r) => r.turn > after); }
  adapt(now) {
    const rtts = [...this.seats.values()].filter((s) => s.human && now - s.seen <= core.ACTIVE_MS && s.rtt !== null).map((s) => s.rtt);
    this.delay = core.adaptDelay(this.delay, rtts, this.period); return this.delay;
  }
}

/* Durable Object class. `state.storage` keeps the setup and the command log in chunks so an evicted object can resume. */
class LockstepRoomDurable {
  constructor(state, env, { now = Date.now, setInterval: si = setInterval, clearInterval: ci = clearInterval } = {}) {
    this.state = state; this.env = env; this.now = now; this.si = si; this.ci = ci;
    this.relay = null; this.sockets = new Map(); this.timer = null; this.ticks = 0; this.saved = 0; this.bytesOut = 0;
  }
  async load() {
    if (this.relay) return this.relay;
    let init = await this.state.storage.get('init');
    if (!init && this.env?.DB && this.roomId) init = await this.fromD1(this.roomId);
    if (!init) return null;
    await this.state.storage.put('init', init);
    this.relay = new MemoryRelay(init);
    const chunks = await this.state.storage.list({ prefix: 'rows:' });
    for (const rows of chunks.values()) { this.relay.rows.push(...rows); for (const r of rows) this.relay.keys.add(r.seat + ':' + r.seq); }
    if (this.relay.rows.length) this.relay.sealed = this.relay.rows[this.relay.rows.length - 1].turn;
    this.saved = this.relay.rows.length;
    return this.relay;
  }
  /* The lobby writes the room to D1 (lockstep_rooms/lockstep_seats, http.cjs createRoom) for every backend; the object
     copies setup and seats from there on first use, so the lobby needs no separate call to the object. */
  async fromD1(id) {
    const db = this.env.DB.withSession ? this.env.DB.withSession('first-primary') : this.env.DB;
    const room = await db.prepare('SELECT start_at, period, setup FROM lockstep_rooms WHERE id = ?').bind(id).first(); if (!room) return null;
    const seats = (await db.prepare('SELECT seat, team, token, human FROM lockstep_seats WHERE room = ? ORDER BY seat').bind(id).all()).results;
    return { setup: JSON.parse(room.setup), startAt: room.start_at, period: room.period, seats: seats.map((x) => ({ seat: x.seat, team: x.team, token: x.token, human: !!x.human })) };
  }
  /* WebSocket upgrade (/api/lockstep/<ROOM>/ws), or an HTTP poll (POST /api/lockstep/<ROOM>, same body and reply as http.cjs)
     so a client whose socket fails can fall back to HTTP against the same room state. */
  async fetch(request) {
    this.roomId ??= new URL(request.url).pathname.match(/\/api\/lockstep\/([A-Z2-9]{8})/)?.[1] || null;
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair(); this.accept(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    return this.poll(request);
  }
  async poll(request) {
    const out = (text, status = 200) => new Response(text, { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private' } });
    const relay = await this.load(); if (!relay) return out('{"error":"房间不存在或已过期"}', 404);
    const auth = request.headers.get('Authorization') || '', seat = relay.seatFor(await sha256(auth.startsWith('Bearer ') ? auth.slice(7) : ''));
    if (!seat) return out('{"error":"席位凭据无效，请重新加入房间"}', 401);
    let msg; try { msg = core.parseClient(await request.json()); } catch (e) { return out(JSON.stringify({ error: e.message || '请求格式错误' }), 400); }
    if (msg.replay) return out(JSON.stringify(core.recording(relay.setup, relay.rows, { period: relay.period, seats: [...relay.seats.values()].map((x) => ({ seat: x.seat, team: x.team })), sealed: relay.sealed, desync: relay.desync })));
    const now = this.now(); relay.touch(seat.seat, now, msg.at, msg.rtt ?? undefined); relay.submit(seat.seat, msg.cmds, now);
    if (msg.hashes.length) relay.report(seat.seat, msg.hashes);
    this.tick(); if (!this.timer) this.timer = this.si(() => this.tick(), relay.period);
    const seats = msg.seats ? [...relay.seats.values()].map((x) => [x.seat, x.team, x.at, now - x.seen]) : null;
    return out('{"n":' + (now - relay.startAt) + ',"se":' + relay.sealed + ',"d":' + relay.delay + (relay.desync ? ',"ds":' + JSON.stringify(relay.desync) : '')
      + (seats ? ',"st":' + relay.startAt + ',"p":' + relay.period + ',"me":' + seat.seat + ',"seats":' + JSON.stringify(seats) : '') + (msg.turns ? ',"t":' + core.rowsJSON(relay.since(msg.after)) : '') + '}');
  }
  accept(ws) {
    ws.accept();
    const info = { ws, seat: null };
    ws.addEventListener('message', (e) => this.onMessage(info, e.data).catch(() => this.send(ws, { type: 'error', error: '无效消息' })));
    ws.addEventListener('close', () => { this.sockets.delete(info); if (!this.sockets.size && this.timer) { this.ci(this.timer); this.timer = null; } });
  }
  send(ws, msg) { const text = typeof msg === 'string' ? msg : JSON.stringify(msg); this.bytesOut += text.length; try { ws.send(text); } catch { /* closed */ } }
  async onMessage(info, data) {
    const msg = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data)), now = this.now();
    if (msg.type === 'hello') {
      const relay = await this.load(); if (!relay) return this.send(info.ws, { type: 'error', error: '房间不存在或已过期' });
      const seat = relay.seatFor(await sha256(String(msg.token || '')));
      if (!seat || seat.seat !== msg.seat) return this.send(info.ws, { type: 'error', error: '席位凭据无效，请重新加入房间' });
      info.seat = seat.seat; this.sockets.set(info, info); relay.touch(seat.seat, now);
      this.send(info.ws, { type: 'start', setup: relay.setup, seats: [...relay.seats.values()].map((s) => ({ seat: s.seat, team: s.team })), startAt: relay.startAt, period: relay.period, d: relay.delay, n: now - relay.startAt });
      const last = Number.isSafeInteger(msg.last) ? msg.last : -1;
      if (relay.sealed > last) this.send(info.ws, '{"type":"turns","n":' + (now - relay.startAt) + ',"se":' + relay.sealed + ',"d":' + relay.delay + ',"t":' + core.rowsJSON(relay.since(last)) + '}');
      if (!this.timer) this.timer = this.si(() => this.tick(), relay.period);
      return;
    }
    if (info.seat === null || !this.relay) return;
    const relay = this.relay, parsed = core.parseClient(msg);
    if (msg.type === 'cmd') { relay.touch(info.seat, now); relay.submit(info.seat, parsed.cmds, now); }
    else if (msg.type === 'ack') { relay.touch(info.seat, now, parsed.at); if (parsed.hashes.length && relay.report(info.seat, parsed.hashes)) this.broadcast({ type: 'desync', ds: relay.desync }); }
    else if (msg.type === 'ping') { relay.touch(info.seat, now, undefined, parsed.rtt ?? undefined); this.send(info.ws, { type: 'pong', t: msg.t, n: now - relay.startAt }); }
  }
  broadcast(msg) { const text = typeof msg === 'string' ? msg : JSON.stringify(msg); for (const s of this.sockets.keys()) this.send(s.ws, text); }
  tick() {
    const relay = this.relay, now = this.now(); if (!relay) return;
    if (++this.ticks % 10 === 0) relay.adapt(now);
    const out = relay.seal(now); if (!out) return;
    this.broadcast('{"type":"turns","n":' + (now - relay.startAt) + ',"se":' + out.sealed + ',"d":' + relay.delay + ',"t":' + core.rowsJSON(out.rows) + '}');
    if (relay.rows.length - this.saved >= 64) { const rows = relay.rows.slice(this.saved); this.state.storage.put('rows:' + String(this.saved).padStart(9, '0'), rows); this.saved = relay.rows.length; }
  }
}

module.exports = { MemoryRelay, LockstepRoomDurable, sha256 };
