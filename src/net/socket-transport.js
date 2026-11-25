/* P3 lockstep, WebSocket transport (server/lockstep/durable.cjs = B1 Durable Object, http.cjs attachSocket = B2 WebSocket on D1).
   The relay pushes every sealed turn (and an idle 'turns' heartbeat at least once a second); the client sends commands at
   once, and every `ackEvery` ms acknowledges its executed turn + checksums and (every 4th time) measures the round trip.

   Reconnect (3c):
   - The relay asks for a planned reconnect ({type:'reconnect'}) before its per-connection budget runs out; the client
     reopens at once and this does not count as a drop.
   - Watchdog: an open socket that delivers no 'turns' message for `stallMs` (default 4 s; the relay heartbeat is 1 s) is
     treated as dead and closed — the 2026-11-19 field failure was exactly such a silent socket.
   - Progress watchdog: heartbeats arrive but the game has waited for a turn longer than `stuckMs` (default 6 s) and the
     seat holding it is not offline -> silent planned reconnect (docs/p3e/stall-20min.md).
   - Unplanned drops reconnect with exponential backoff: 0, 250, 500 ms, 1, 2, 4, 8 s, then every 10 s (reset once turns
     flow again). wake() (page visible again, network back online) retries at once.
   - hello carries the last turn received, so the relay replays the missed turns (catch-up), and commands sent but not yet
     seen in a turn are sent again (the relay ignores a seat+seq it already has).
   onFail(reason) asks the owner to fall back to HTTP only when the socket has never opened (no WebSocket on the platform),
   or keeps closing right after opening without delivering turns. A network outage after a working start keeps retrying
   the socket with backoff (the HTTP fallback would fail the same way while the network is down). */

export const BACKOFF = [0, 250, 500, 1000, 2000, 4000, 8000, 10000];

export class SocketTransport {
  /* opts: url (ws(s)://…/api/lockstep/<ROOM>/ws), token, client, WebSocket, ackEvery, connectTimeout, stallMs, onFail, onError, onReceive */
  constructor(opts) {
    this.url = opts.url; this.token = opts.token; this.client = opts.client; this.WS = opts.WebSocket || globalThis.WebSocket;
    this.ackEvery = opts.ackEvery || 250; this.connectTimeout = opts.connectTimeout || 3000; this.stallMs = opts.stallMs || 4000;
    this.onFail = opts.onFail || null; this.onError = opts.onError || null; this.onReceive = opts.onReceive || null; this.onMessage = opts.onMessage || null;
    this.ws = null; this.timer = null; this.retry = null; this.stopped = false; this.fatal = null; this.open = false; this.pings = 0;
    this.everOpen = false; this.failedConnects = 0; this.drops = []; this.reconnects = 0; this.lastTurnsAt = 0; this.attempt = 0;
    this.planned = false; this.openedAt = 0; this.stats = { planned: 0, watchdog: 0, stuck: 0, backoffMs: 0, maxBackoff: 0 };
    this.stuckMs = opts.stuckMs || 6000; this.lastStuck = -Infinity;
  }
  start() {
    if (this.stopped || this.fatal) return this;
    clearTimeout(this.retry); this.retry = null;
    const c = this.client; let ws;
    try { ws = this.ws = new this.WS(this.url); } catch (e) { this.fail('socket unavailable: ' + (e?.message || e)); return this; }
    let opened = false, ended = false;
    // Some runtimes (Node's undici) report a refused upgrade only as 'error' and never fire 'close', so every way a socket
    // can end goes through end(), once.
    const guard = setTimeout(() => { if (!opened) end(); }, this.connectTimeout);
    ws.onopen = () => {
      opened = true; clearTimeout(guard); this.open = true; this.everOpen = true; this.failedConnects = 0; this.openedAt = this.lastTurnsAt = c.now();
      this.raw({ type: 'hello', seat: c.seat, token: this.token, proto: 1, last: c.sealed, x: c.nextTurn - 1 });
      c.requeueUnconfirmed(); this.flush();
    };
    ws.onmessage = (e) => {
      if (ws !== this.ws) return;
      const text = typeof e.data === 'string' ? e.data : String(e.data); c.stats.down += text.length;
      let msg; try { msg = JSON.parse(text); } catch { return; }
      if (msg.type === 'turns') { c.stats.requests++; this.lastTurnsAt = c.now(); this.attempt = 0; c.receive(msg, null); this.onReceive?.(msg); }
      else if (msg.type === 'pong') c.receive({ n: msg.n }, { sentAt: msg.t, cmds: [], hashes: [] });
      else if (msg.type === 'start') { if (Number.isFinite(msg.d)) c.delay = msg.d; }
      else if (msg.type === 'reconnect') { this.planned = true; this.stats.planned++; }
      else if (msg.type === 'desync') c.receive({ ds: msg.ds });
      else if (msg.type === 'error' && !msg.retry) { this.fatal = new Error(msg.error); this.onError?.(this.fatal, true); }
      this.onMessage?.(msg);
    };
    const end = () => {
      if (ended) return; ended = true; try { ws.close(); } catch { /* ignore */ }
      clearTimeout(guard); const was = this.open; this.open = false;
      if (this.stopped || this.fatal || ws !== this.ws) return;
      if (this.planned) { this.planned = false; this.reconnects++; c.stats.reconnects = this.reconnects; return this.start(); }
      if (!opened) {
        if (!this.everOpen && ++this.failedConnects >= 2) return this.fail('connect failed');
        return this.later();
      }
      const now = c.now(); this.drops = this.drops.filter((t) => now - t < 10000); this.drops.push(now);
      if (this.drops.length >= 3 && now - this.lastTurnsAt > 3000 && now - this.openedAt < 3000) return this.fail('socket keeps closing');
      this.reconnects++; c.stats.reconnects = this.reconnects;
      if (was && this.attempt === 0) { this.attempt = 1; return this.start(); }
      this.later();
    };
    ws.onclose = end;
    ws.onerror = () => { if (!opened) end(); };
    this.end = end;
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (!this.open || ws !== this.ws) return;
      // Watchdog: a socket that is open but delivers nothing (not even the relay's 1 s heartbeat) is dead.
      if (c.now() - this.lastTurnsAt > this.stallMs) { this.stats.watchdog++; c.stats.watchdog = this.stats.watchdog; end(); return; }
      // Progress watchdog (field report 2026-11-25: about 20 minutes into a 2-player match every unit stopped until the player
      // dropped and reconnected by hand). The socket was alive (heartbeats, so the watchdog above never fired) but no new turn
      // came. When the game has waited longer than stuckMs and the seat it waits for is not simply offline (that case has its
      // own countdown and computer takeover), do what the manual reconnect did: reopen silently. hello is a fresh connection,
      // so the relay re-reads this seat's executed turn and resends every turn after the last one received. At most every 15 s.
      const now = c.now();
      if (c.waitingSince !== null && now - c.waitingSince > this.stuckMs && now - this.lastStuck > 15000 && !c.waiting(0)?.offline) {
        this.lastStuck = now; this.stats.stuck++; c.stats.stuckReconnects = this.stats.stuck; this.planned = true; end(); return;
      }
      const hashes = c.hashQueue.splice(0, 16), ack = { type: 'ack', x: c.nextTurn - 1 }; if (hashes.length) ack.h = hashes;
      if (c.reclaim) ack.k = 1;
      if (this.pings % 4 === 0) ack.s = 1; // seat table about once a second (who is behind, takeover countdown)
      this.raw(ack);
      if (this.pings++ % 4 === 0) this.raw({ type: 'ping', t: c.now(), r: c.rtt === null ? undefined : Math.round(c.rtt) });
    }, this.ackEvery);
    return this;
  }
  /* Exponential backoff for the next attempt. */
  later() {
    const ms = BACKOFF[Math.min(this.attempt, BACKOFF.length - 1)]; this.attempt++;
    this.stats.backoffMs += ms; this.stats.maxBackoff = Math.max(this.stats.maxBackoff, ms);
    clearTimeout(this.retry); this.retry = setTimeout(() => this.start(), ms);
  }
  /* Page visible again / network back: check the socket now instead of waiting for the watchdog or the backoff timer. */
  wake() {
    if (this.stopped || this.fatal) return;
    if (this.open) { if (this.client.now() - this.lastTurnsAt > 2000) this.end?.(); return; }
    if (this.retry) { this.attempt = Math.max(1, this.attempt); this.start(); }
  }
  /* After the client jumped ahead (snapshot loaded): reopen so hello asks only for turns after the client's new position. */
  resync() { if (this.open && this.ws) { this.planned = true; try { this.ws.close(); } catch { /* end() reconnects */ } } }
  fail(reason) { if (this.stopped) return; this.stop(); this.onFail?.(reason); }
  raw(msg) { const text = JSON.stringify(msg); this.client.stats.up += text.length; try { this.ws.send(text); } catch { /* reconnect path */ } }
  flush() { const c = this.client; if (!this.open || !c.outbox.length) return; const cmds = c.outbox.splice(0, 32); this.raw({ type: 'cmd', c: cmds.map((x) => [x.seq, x.cmd]) }); if (c.outbox.length) this.flush(); }
  kick() { this.flush(); }
  stop() { this.stopped = true; this.open = false; clearInterval(this.timer); clearTimeout(this.retry); try { this.ws?.close(); } catch { /* ignore */ } }
}
