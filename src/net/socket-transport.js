/* P3 lockstep, WebSocket transport (server/lockstep/durable.cjs = B1 Durable Object, http.cjs attachSocket = B2 WebSocket on D1).
   The relay pushes every sealed turn; the client sends commands at once, and every `ackEvery` ms acknowledges its executed
   turn + checksums and (every 4th time) measures the round trip.
   Reconnect: a socket the platform closes (connection time limit, network change) is reopened at once; hello carries the
   last turn received, so the relay replays the missed turns (catch-up), and commands sent but not yet seen in a turn are
   sent again (the relay ignores a seat+seq it already has). onFail(reason) asks the owner to fall back to HTTP when the
   socket never opens, or keeps dropping without delivering turns. */

export class SocketTransport {
  /* opts: url (ws(s)://…/api/lockstep/<ROOM>/ws), token, client, WebSocket, ackEvery, connectTimeout, onFail, onError, onReceive */
  constructor(opts) {
    this.url = opts.url; this.token = opts.token; this.client = opts.client; this.WS = opts.WebSocket || globalThis.WebSocket;
    this.ackEvery = opts.ackEvery || 250; this.connectTimeout = opts.connectTimeout || 3000;
    this.onFail = opts.onFail || null; this.onError = opts.onError || null; this.onReceive = opts.onReceive || null;
    this.ws = null; this.timer = null; this.stopped = false; this.fatal = null; this.open = false; this.pings = 0;
    this.everOpen = false; this.failedConnects = 0; this.drops = []; this.reconnects = 0; this.lastTurnsAt = 0;
  }
  start() {
    if (this.stopped || this.fatal) return this;
    const c = this.client; let ws;
    try { ws = this.ws = new this.WS(this.url); } catch (e) { this.fail('socket unavailable: ' + (e?.message || e)); return this; }
    let opened = false, ended = false;
    // Some runtimes (Node's undici) report a refused upgrade only as 'error' and never fire 'close', so every way a socket
    // can end goes through ended(), once.
    const guard = setTimeout(() => { if (!opened) end(); }, this.connectTimeout);
    ws.onopen = () => {
      opened = true; clearTimeout(guard); this.open = true; this.everOpen = true; this.failedConnects = 0;
      this.raw({ type: 'hello', seat: c.seat, token: this.token, proto: 1, last: c.sealed });
      c.requeueUnconfirmed(); this.flush();
    };
    ws.onmessage = (e) => {
      const text = typeof e.data === 'string' ? e.data : String(e.data); c.stats.down += text.length;
      let msg; try { msg = JSON.parse(text); } catch { return; }
      if (msg.type === 'turns') { c.stats.requests++; this.lastTurnsAt = c.now(); c.receive(msg, null); this.onReceive?.(msg); }
      else if (msg.type === 'pong') c.receive({ n: msg.n }, { sentAt: msg.t, cmds: [], hashes: [] });
      else if (msg.type === 'start') { if (Number.isFinite(msg.d)) c.delay = msg.d; }
      else if (msg.type === 'desync') c.desync = msg.ds;
      else if (msg.type === 'error' && !msg.retry) { this.fatal = new Error(msg.error); this.onError?.(this.fatal, true); }
    };
    const end = () => {
      if (ended) return; ended = true; try { ws.close(); } catch { /* ignore */ }
      clearTimeout(guard); const was = this.open; this.open = false;
      if (this.stopped || this.fatal || ws !== this.ws) return;
      if (!opened) { if (++this.failedConnects >= 2) return this.fail('connect failed'); return setTimeout(() => this.start(), 300); }
      const now = c.now(); this.drops = this.drops.filter((t) => now - t < 10000); this.drops.push(now);
      if (this.drops.length >= 3 && now - this.lastTurnsAt > 3000) return this.fail('socket keeps closing');
      this.reconnects++; c.stats.reconnects = this.reconnects;
      setTimeout(() => this.start(), was && this.drops.length === 1 ? 0 : 250 * this.drops.length);
    };
    ws.onclose = end;
    ws.onerror = () => { if (!opened) end(); };
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (!this.open) return;
      const hashes = c.hashQueue.splice(0, 16), ack = { type: 'ack', x: c.nextTurn - 1 }; if (hashes.length) ack.h = hashes;
      this.raw(ack);
      if (this.pings++ % 4 === 0) this.raw({ type: 'ping', t: c.now(), r: c.rtt === null ? undefined : Math.round(c.rtt) });
    }, this.ackEvery);
    return this;
  }
  fail(reason) { if (this.stopped) return; this.stop(); this.onFail?.(reason); }
  raw(msg) { const text = JSON.stringify(msg); this.client.stats.up += text.length; try { this.ws.send(text); } catch { /* reconnect path */ } }
  flush() { const c = this.client; if (!this.open || !c.outbox.length) return; const cmds = c.outbox.splice(0, 32); this.raw({ type: 'cmd', c: cmds.map((x) => [x.seq, x.cmd]) }); if (c.outbox.length) this.flush(); }
  kick() { this.flush(); }
  stop() { this.stopped = true; this.open = false; clearInterval(this.timer); try { this.ws?.close(); } catch { /* ignore */ } }
}
