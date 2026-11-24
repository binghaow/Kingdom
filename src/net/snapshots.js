/* 3c snapshot transfer (see SNAP_EVERY in lockstep.js and putSnapshot/getSnapshot in server/lockstep/http.cjs).
   - Upload: right after the normalization turn, the "keeper" (lowest playing seat that is online) gzips the JSON state,
     base64-encodes it and posts it in <= 48 KB parts (HTTP, also when the match itself runs on the WebSocket).
   - Download: a client that is far behind (refresh, long reconnect) and was offered a snapshot whose checksum the relay
     holds as an undisputed step hash fetches it, checks the checksum of the loaded state and resumes at that turn; the
     relay then delivers only the commands after it. If anything fails it simply keeps replaying from the turn it has. */
const PART = 48000;

function toBase64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
function fromBase64(text) { const s = atob(text), out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
async function pipe(bytes, Stream, mode) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new Stream(mode))).arrayBuffer()); }

export async function encode(text) {
  const raw = new TextEncoder().encode(text);
  if (typeof CompressionStream !== 'undefined') return { enc: 'gzip', data: toBase64(await pipe(raw, CompressionStream, 'gzip')) };
  return { enc: 'json', data: toBase64(raw) };
}
export async function decode(data, enc) {
  const bytes = fromBase64(data);
  return new TextDecoder().decode(enc === 'gzip' ? await pipe(bytes, DecompressionStream, 'gzip') : bytes);
}

/* Wires a LockstepClient to the relay's snapshot endpoint. Returns { tick() } to call from the client's pump loop. */
export function attachSnapshots(client, { url, token, fetch = (...a) => globalThis.fetch(...a), onLoaded = null, onError = null } = {}) {
  const post = async (body) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body), cache: 'no-store' });
    const data = JSON.parse(await res.text()); if (!res.ok) throw new Error(data?.error || 'HTTP ' + res.status); return data;
  };
  const stats = { uploads: 0, uploadBytes: 0, uploadMs: 0, loads: 0, loadMs: 0, failures: 0 };
  let busy = false, tried = new Set(), retryAt = 0;
  const keeper = () => {
    const live = (client.seatInfo || []).filter((s) => !s.mode && s.age < 5000).map((s) => s.seat).sort((a, b) => a - b);
    return live.length ? live[0] === client.seat : client.seat === Math.min(...client.teams.keys());
  };
  client.onSnapshot = (snap) => {
    if (!snap.live || !keeper() || client.team < 0) return;
    const t0 = Date.now();
    (async () => {
      const { enc, data } = await encode(snap.text), parts = Math.max(1, Math.ceil(data.length / PART));
      for (let i = 0; i < parts; i++) await post({ snap: { turn: snap.turn, step: snap.step, hash: snap.hash, part: i, parts, data: data.slice(i * PART, (i + 1) * PART), meta: { aiSeats: snap.aiSeats, enc } } });
      stats.uploads++; stats.uploadBytes += data.length; stats.uploadMs += Date.now() - t0;
    })().catch((e) => { stats.failures++; onError?.(e); });
    snap.text = null; // do not keep the text once handed over
  };
  return {
    stats,
    /* Called every pump: load an offered snapshot when it saves more than ~1 minute of replay. */
    tick() {
      // 3e restored room (client.resumeAt): the room's own snapshot (or a newer verified offer) is required before any turn
      // runs, so a failed download is retried every 2 s instead of being given up.
      const need = client.resumeAt, offer = need ? (client.offer && client.offer.turn >= need.turn ? client.offer : need) : client.offer;
      if (busy || !offer || (!need && tried.has(offer.turn)) || (need && Date.now() < retryAt) || client.nextTurn >= offer.turn - (need ? 0 : 600)) return;
      busy = true; tried.add(offer.turn); const t0 = Date.now();
      (async () => {
        const r = await post({ snapget: offer.turn });
        if (r.hash !== offer.hash || client.nextTurn >= r.turn) { if (need) { stats.failures++; retryAt = Date.now() + 2000; } return; }
        const text = (await Promise.all(r.data.map((p) => p))).join('');
        const loaded = client.loadSnapshot({ turn: r.turn, hash: r.hash, text: await decode(text, r.meta?.enc), aiSeats: r.meta?.aiSeats || [], seq: r.seq, encoded: { enc: r.meta?.enc === 'gzip' ? 'gzip' : 'json', data: text } });
        if (loaded.ok) { stats.loads++; stats.loadMs += Date.now() - t0; stats.lastLoad = { turn: r.turn, ms: Date.now() - t0, bytes: text.length }; onLoaded?.(r.turn, Date.now() - t0); } else { stats.failures++; retryAt = Date.now() + 2000; }
      })().catch((e) => { stats.failures++; retryAt = Date.now() + 2000; onError?.(e); }).finally(() => { busy = false; });
    },
  };
}
