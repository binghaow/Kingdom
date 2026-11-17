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
    this.inFlight = 0; this.count = 0; this.timer = null; this.stopped = false; this.fatal = null; this.lastOk = 0;
  }
  start() { this.stopped = false; const loop = () => { if (this.stopped) return; this.send(); this.timer = setTimeout(loop, this.period); }; loop(); return this; }
  stop() { this.stopped = true; clearTimeout(this.timer); }
  /* Called after issue(): send now unless the pipe is full (the next periodic request will carry it). */
  kick() { if (this.client.outbox.length && this.inFlight < this.maxInFlight) this.send(false); }
  async send(wait = true) {
    if (this.stopped || this.fatal || this.inFlight >= this.maxInFlight) return;
    const token = this.client.outgoing({ wait, seats: this.count++ % this.seatsEvery === 0 || this.client.waitingSince !== null });
    const text = JSON.stringify(token.body), stats = this.client.stats;
    this.inFlight++; stats.up += text.length;
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
      this.lastOk = this.client.now();
      this.client.receive(data, token);
      this.onReceive?.(data);
    } catch (e) {
      this.client.failed(token);
      this.onError?.(e, false);
    } finally { clearTimeout(timer); this.inFlight--; }
  }
}
