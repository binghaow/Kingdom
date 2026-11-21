/* P3 lockstep transport switch. mode 'http' (v1 default) uses HttpTransport; mode 'ws' tries SocketTransport first and falls
   back to HTTP for the rest of the match when the socket cannot open or keeps dropping. Both talk to the same room state
   (D1 tables, or the room's Durable Object for both), so switching never loses or repeats a turn: the client keeps its
   received turns, and commands not yet seen in a turn are sent again (the relay ignores duplicates by seat+seq). */
import { HttpTransport } from './http-transport.js';
import { SocketTransport } from './socket-transport.js';

export class AutoTransport {
  /* opts: mode, httpUrl, wsUrl, token, client, fetch, WebSocket, onError, onReceive, onSwitch(reason) */
  constructor(opts) { this.opts = opts; this.client = opts.client; this.active = null; this.mode = null; this.fallbackReason = null; }
  get fatal() { return this.active?.fatal || null; }
  start() {
    const o = this.opts, WS = o.WebSocket || globalThis.WebSocket;
    if (o.mode === 'ws' && WS && o.wsUrl) {
      this.mode = 'ws';
      this.active = new SocketTransport({ url: o.wsUrl, token: o.token, client: this.client, WebSocket: WS, onError: o.onError, onReceive: o.onReceive, onMessage: o.onMessage, stallMs: o.stallMs, onFail: (r) => this.fallback(r) }).start();
    } else this.http();
    return this;
  }
  http() { const o = this.opts; this.mode = 'http'; this.active = new HttpTransport({ url: o.httpUrl, token: o.token, client: this.client, fetch: o.fetch, onError: o.onError, onReceive: o.onReceive, timeout: o.timeout }).start(); }
  fallback(reason) { if (this.mode !== 'ws') return; this.fallbackReason = reason; this.client.requeueUnconfirmed(); this.http(); this.opts.onSwitch?.(reason); }
  kick() { this.active?.kick(); }
  wake() { this.active?.wake?.(); }
  resync() { this.active?.resync?.(); }
  stop() { this.active?.stop(); }
}
