'use strict';
/* Local stand-in for the platform's WebSocket upgrade (preview.cjs and the lockstep harnesses): wraps a Node `ws` socket in
   the Worker WebSocket shape (accept / addEventListener / send / close) and serves /api/lockstep/<ROOM>/ws with the same
   code the Worker would run — B2 (http.cjs attachSocket, WebSocket on D1) by default, or B1 (durable.cjs, one in-memory
   Durable Object per room with a Map-backed storage) when opts.durable is set. Without the `ws` package nothing is attached
   and browsers fall back to HTTP. `ws` is only a transitive dev dependency; the Worker never loads this file. */
const path = require('node:path');
function attachUpgrade(server, env, opts = {}) {
  let WebSocketServer; try { ({ WebSocketServer } = require('ws')); } catch { return null; }
  const Lockstep = require(path.join(__dirname, '../../server/lockstep/http.cjs')), { LockstepRoomDurable } = require(path.join(__dirname, '../../server/lockstep/durable.cjs'));
  const wss = new WebSocketServer({ noServer: true }), objects = new Map(), meter = { bytesIn: 0, bytesOut: 0, sockets: 0, bySocket: new Map() };
  const storage = () => { const m = new Map(); return { get: async (k) => m.get(k), put: async (k, v) => { m.set(k, v); }, list: async ({ prefix }) => new Map([...m].filter(([k]) => k.startsWith(prefix)).sort()) }; };
  server.on('upgrade', (req, socket, head) => {
    const m = new URL(req.url, 'http://x').pathname.match(/^\/api\/lockstep\/([A-HJ-NP-Z2-9]{8})\/ws$/);
    if (!m) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (raw) => {
      meter.sockets++;
      const listeners = { message: [], close: [] }, stat = { in: 0, out: 0 };
      meter.bySocket.set(raw, stat);
      const ws = { accept() {}, addEventListener: (t, f) => listeners[t]?.push(f), send: (d) => { stat.out += d.length; meter.bytesOut += d.length; raw.send(d); }, close: (c, r) => raw.close(c, r) };
      raw.on('message', (d) => { const text = d.toString(); stat.in += text.length; meter.bytesIn += text.length; for (const f of listeners.message) f({ data: text }); });
      raw.on('close', (code) => { for (const f of listeners.close) f({ code }); });
      if (opts.durable) {
        let o = objects.get(m[1]); if (!o) { o = new LockstepRoomDurable({ storage: storage() }, env); o.roomId = m[1]; objects.set(m[1], o); }
        o.accept(ws);
      } else Lockstep.attachSocket(ws, opts.invocation ? { ...env, DB: opts.invocation() } : env, m[1]); // one socket = one Worker invocation (d1-sim.cjs)
    });
  });
  return { wss, meter, objects, closeAll: () => { for (const c of wss.clients) c.terminate(); } };
}
module.exports = { attachUpgrade };
