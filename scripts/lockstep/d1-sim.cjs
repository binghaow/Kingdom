'use strict';
/* Platform model for local lockstep runs (preview.cjs, harness, checks): wraps the node:sqlite D1 adapter so each D1 call
   (first / all / run / batch) costs `latency` ms (Sites measurement: D1 batch p50 47 ms) and counts against a per-invocation
   budget. A WebSocket connection is ONE Worker invocation for its whole life, so every D1 call made on behalf of that socket
   is counted on one wrapper; once `limit` calls are used, further calls throw the platform error (Cloudflare reports
   "Too many API requests by single worker invocation"). An HTTP request is a fresh invocation, so it gets a fresh wrapper.
   This reproduces the 2026-11-19 field failure: at one exchange per 100 ms turn a socket used up a ~10 000-call budget after
   about 16.7 minutes, every later D1 call failed, and the relay kept the socket open but silent. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function simulatedD1(DB, { latency = 0, limit = 0, stats = null } = {}) {
  let calls = 0;
  const cost = async () => {
    calls++; if (stats) stats.calls = (stats.calls || 0) + 1;
    if (limit && calls > limit) { if (stats) stats.refused = (stats.refused || 0) + 1; throw new Error('Too many API requests by single worker invocation.'); }
    if (latency > 0) await sleep(latency);
  };
  const statement = (inner) => ({
    bind(...args) {
      const b = inner.bind(...args);
      return { _inner: b, _sync: b._sync, async first() { await cost(); return b.first(); }, async all() { await cost(); return b.all(); }, async run() { await cost(); return b.run(); } };
    },
  });
  const api = {
    schemaKey: DB.schemaKey || DB,
    withSession() { return api; },
    prepare: (sql) => statement(DB.prepare(sql)),
    async batch(list) { await cost(); return DB.batch(list.map((s) => s._inner || s)); },
    get calls() { return calls; },
  };
  return api;
}

/* env.DB factory: per-invocation wrappers sharing one SQLite database. */
function platform(DB, { latency = 0, limit = 0 } = {}) {
  const stats = { calls: 0, refused: 0, sockets: 0 };
  return { stats, invocation: () => (latency || limit ? simulatedD1(DB, { latency, limit, stats }) : DB) };
}

module.exports = { simulatedD1, platform };
