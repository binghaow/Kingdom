/* P3 lockstep, HTTP transport (v1; server/lockstep/http.cjs). One POST per turn period carries any new commands and checksums
   and asks for newly sealed turns; the relay holds a request until the next turn boundary when nothing new is ready, so turns
   arrive right after they are sealed. Up to `maxInFlight` requests overlap, so a round trip longer than one period does not
   slow delivery. A failed request (timeout, network error, 5xx) puts its commands back in front of the queue; the relay
   ignores a command it already stored (seat + seq), so retries are safe. Commands are also sent at once when issued. */

export class HttpTransport {
  /* opts: url (/api/lockstep/<ROOM>), token, client (LockstepClient), fetch, period, timeout, maxInFlight, seatsEvery, onError */
  constructor(opts) {
    this.url = opts.url; this.token = opts.token; this.client = opts.client; this.fetch = opts.fetch || ((...a) => globalThis.fetch(...a));
    this.period = opts.period || this.client.period; this.timeout = opts.timeout || 5000; this.maxInFlight = opts.maxInFlight || 4;
    this.seatsEvery = opts.seatsEvery || 10; this.onError = opts.onError || null; this.onReceive = opts.onReceive || null;
    this.inFlight = 0; this.count = 0; this.polls = []; this.timer = null; this.stopped = false; this.fatal = null; this.lastOk = 0;
    this.fails = 0; this.nextAt = 0; // 3c: consecutive failures back off (250 ms doubling, at most 10 s) instead of retrying every 25 ms
  }
  /* Polls: a new waiting poll starts when none is in flight, or when the oldest one has been out longer than 1.5 periods
     (slow round trip), at most maxInFlight overall. Command posts in between ask for no turn data, so turns are not
     delivered twice. */
  start() {
    this.stopped = false; this.polls = [];
    const loop = () => {
      if (this.stopped) return;
      const now = this.client.now();
      if (now >= this.nextAt && (!this.polls.length || now - this.polls[0] > this.period * 1.5)) this.send(true);
      this.timer = setTimeout(loop, Math.max(10, this.period / 4));
    };
    loop(); return this;
  }
  stop() { this.stopped = true; clearTimeout(this.timer); }
  wake() { this.nextAt = 0; }
  /* Called after issue(): send now unless the pipe is full (the next periodic request will carry it). */
  kick() { if (this.client.outbox.length && this.inFlight < this.maxInFlight) this.send(false); }
  async send(wait = true) {
    if (this.stopped || this.fatal || this.inFlight >= this.maxInFlight) return;
    const token = this.client.outgoing({ wait, turns: wait, reclaim: !!this.client.reclaim, seats: wait && (this.count++ % this.seatsEvery === 0 || this.client.waitingSince !== null) });
    if (!this.helloSent && wait) { token.body.f = 1; this.helloSent = true; } // first poll: the relay takes x as this seat's true executed turn
    const text = JSON.stringify(token.body), stats = this.client.stats, started = token.sentAt;
    this.inFlight++; stats.up += text.length; if (wait) this.polls.push(started);
    let ok = false;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null, timer = setTimeout(() => controller?.abort(), this.timeout);
    try {
      const res = await this.fetch(this.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + this.token }, body: text, cache: 'no-store', signal: controller?.signal });
      const reply = await res.text(); stats.down += reply.length;
      let data = null; try { data = JSON.parse(reply); } catch { /* handled below */ }
      if (!res.ok || !data) {
        const e = new Error(data?.error || 'HTTP ' + res.status); e.status = res.status;
        if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) { this.fatal = e; this.onError?.(e, true); return; }
        throw e;
      }
      this.lastOk = this.client.now(); ok = true; this.fails = 0; this.nextAt = 0;
      this.client.receive(data, token);
      this.onReceive?.(data);
    } catch (e) {
      this.client.failed(token); if (token.body.f) this.helloSent = false;
      this.fails++; this.nextAt = this.client.now() + Math.min(10000, 250 * 2 ** Math.min(6, this.fails - 1));
      this.onError?.(e, false);
    } finally { clearTimeout(timer); this.inFlight--; if (wait) { const i = this.polls.indexOf(started); if (i >= 0) this.polls.splice(i, 1); if (ok && !this.stopped && !this.polls.length) this.send(true); } }
  }
}
