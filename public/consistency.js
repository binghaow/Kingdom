/* Device consistency check page (public/consistency.html, docs/device-consistency-check.md). Not part of the game UI.
   Loads the standard recordings in consistency/ and the answer key consistency/expected.json (made by Node replaying the same files,
   scripts/replay/make-device-fixtures.cjs), replays each recording with THIS browser's simulation (window.KingdomSim, the same scripts
   index.html loads) and compares the state checksum every 20 steps (1 s of game time). On the first difference it compares the
   checksum parts to say which kind of state differs (units / buildings / resource nodes / economy, else random-number state or clock).
   The replay runs a slice of steps per animation frame so phones stay responsive. window.__consistency holds the result (checks). */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id), K = window.KingdomSim, C = window.KingdomCore;
  const PART = { units: '单位 units', buildings: '建筑 buildings', nodes: '资源点 resource nodes', economy: '经济/科技 economy & tech' };
  const state = { started: new Date().toISOString(), device: null, recordings: [], done: false, ok: null, error: null };
  window.__consistency = state;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const frame = () => new Promise((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));
  function device() {
    const n = navigator, s = window.screen || {};
    /* a few transcendental results: if a recording differs, these show whether this engine's Math differs from V8 in the last bits */
    const probe = [Math.sin(1e6), Math.cos(12345.678), Math.atan2(0.3, -0.7), Math.exp(2.5), Math.pow(1.1, 37.3), Math.hypot(3.3, 4.4), Math.log(7.77)];
    return {
      userAgent: n.userAgent, platform: n.platform || '', language: n.language || '', touchPoints: n.maxTouchPoints || 0,
      cores: n.hardwareConcurrency || null, memoryGB: n.deviceMemory || null, screen: `${s.width || '?'}x${s.height || '?'} @${window.devicePixelRatio || 1}x`,
      viewport: `${window.innerWidth}x${window.innerHeight}`, mathProbe: C && C.hash ? C.hash.fnvString(probe.map((x) => x.toPrecision(17)).join(',')) : null,
    };
  }
  function card(rec) {
    const el = document.createElement('div'); el.className = 'rec';
    el.innerHTML = `<h2><span>${esc(rec.title[0])} · ${esc(rec.title[1])}</span><span style="font-size:15px;color:var(--muted)">${esc(rec.map)} · ${rec.seconds} s</span></h2><div class="state run">等待 · Waiting</div><div class="detail"></div><div class="bar"><i></i></div>`;
    $('list').append(el);
    return { state: el.querySelector('.state'), detail: el.querySelector('.detail'), bar: el.querySelector('.bar i'), barBox: el.querySelector('.bar') };
  }
  function diffParts(a, b) { return Object.keys(PART).filter((k) => a && b && a[k] !== b[k]); }
  async function check(rec, ui) {
    const t0 = performance.now(), res = await fetch('consistency/' + rec.file, { cache: 'no-store' });
    if (!res.ok) throw Error(`HTTP ${res.status} consistency/${rec.file}`);
    const data = await res.json(), expected = new Map(rec.checksums.map((c) => [c.step, c])), out = { name: rec.name, steps: rec.steps, checkpoints: rec.checksums.length, ok: true, firstDiff: null };
    ui.state.textContent = '回放中 · Replaying…';
    const runner = C.replay.createReplayRunner(K, data, {
      Sim: K.Sim.Base || K.Sim,
      onCheckpoint: (sim, step, entry) => {
        if (out.firstDiff) return;
        const want = expected.get(step);
        if (!want || want.hash === entry.hash) return;
        const got = C.hash.checksum(sim), parts = diffParts(want.parts, got.parts);
        out.firstDiff = { step, seconds: step * data.step, expected: want.hash, got: entry.hash, parts, kinds: parts.length ? parts.map((p) => PART[p]) : ['随机数状态或时钟 RNG state / clock'] };
      },
    });
    const slice = 40;
    let lastPaint = 0;
    while (!runner.run(slice)) {
      const now = performance.now();
      if (now - lastPaint > 100) { ui.bar.style.width = (100 * runner.step / runner.total).toFixed(1) + '%'; lastPaint = now; await frame(); }
    }
    const r = runner.result();
    if (!out.firstDiff && rec.final && r.final.hash !== rec.final.hash) out.firstDiff = { step: r.final.step, seconds: r.final.step * data.step, expected: rec.final.hash, got: r.final.hash, parts: diffParts(rec.final.parts, r.final.parts), kinds: [] };
    out.commandMismatches = r.results.mismatch.length;
    out.final = r.final.hash; out.expectedFinal = rec.final.hash;
    out.ok = !out.firstDiff && out.commandMismatches === 0 && r.checksums.length === rec.checksums.length;
    out.ms = Math.round(performance.now() - t0);
    ui.bar.style.width = '100%'; ui.barBox.style.display = 'none';
    if (out.ok) {
      ui.state.className = 'state ok'; ui.state.textContent = '✅ 一致 · Consistent';
      ui.detail.textContent = `${rec.checksums.length} 个检查点全部相同 · all ${rec.checksums.length} checkpoints match · ${(out.ms / 1000).toFixed(1)} s`;
    } else {
      ui.state.className = 'state bad'; ui.state.textContent = '❌ 不一致 · Mismatch';
      const d = out.firstDiff;
      ui.detail.textContent = d
        ? `从第 ${d.step} 步（第 ${d.seconds} 秒）开始不同 · first differs at step ${d.step} (${d.seconds} s) · 差异 differs in: ${(d.kinds.length ? d.kinds : d.parts).join('、') || '—'} · ${(out.ms / 1000).toFixed(1)} s`
        : `指令结果不同 ${out.commandMismatches} 处 · ${out.commandMismatches} command results differ · ${(out.ms / 1000).toFixed(1)} s`;
    }
    return out;
  }
  function summary() {
    const d = state.device || {}, lines = [`边境王国 真机一致性检查 / Frontier Kingdom consistency check`, `结果 Result: ${state.ok ? '全部一致 ALL CONSISTENT' : state.error ? '出错 ERROR: ' + state.error : '有不一致 MISMATCH'}`];
    for (const r of state.recordings) lines.push(`- ${r.name}: ${r.ok ? 'OK 一致' : 'DIFF 不一致'}${r.firstDiff ? ` @ step ${r.firstDiff.step} (${r.firstDiff.seconds}s) [${(r.firstDiff.parts.length ? r.firstDiff.parts : ['rng/clock']).join(',')}] expected ${r.firstDiff.expected} got ${r.firstDiff.got}` : ''}${r.commandMismatches ? ` cmd-mismatch ${r.commandMismatches}` : ''} · final ${r.final || '—'} · ${r.ms ?? '—'} ms`);
    lines.push(`设备 Device: ${d.userAgent}`, `platform ${d.platform} · screen ${d.screen} · viewport ${d.viewport} · touch ${d.touchPoints} · cores ${d.cores ?? '?'} · memory ${d.memoryGB ?? '?'} GB · math ${d.mathProbe}`, `时间 Time: ${state.started} · total ${state.totalMs ?? '—'} ms · core v${C?.version ?? '?'}`);
    return lines.join('\n');
  }
  async function copy() {
    const text = summary();
    try { await navigator.clipboard.writeText(text); $('copied').textContent = '已复制，可以粘贴发送 · Copied'; return; } catch (e) { /* fall back below */ }
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.append(ta); ta.select(); ta.setSelectionRange(0, text.length);
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    $('copied').textContent = ok ? '已复制，可以粘贴发送 · Copied' : '请长按下方文字手动复制 · Please copy the text below manually';
    if (!ok) { $('raw').textContent = text; $('raw').closest('details').open = true; }
  }
  async function main() {
    const t0 = performance.now();
    state.device = device();
    $('copy').onclick = copy;
    try {
      if (!K || !K.Sim) throw Error('simulation scripts did not load');
      if (!C || !C.replay || !C.replay.createReplayRunner) throw Error('kingdom-core.js did not load');
      const res = await fetch('consistency/expected.json', { cache: 'no-store' });
      if (!res.ok) throw Error('HTTP ' + res.status + ' consistency/expected.json');
      const key = await res.json(), cards = key.recordings.map(card);
      $('overall').textContent = '检查中… Checking…';
      for (let i = 0; i < key.recordings.length; i++) {
        let r;
        try { r = await check(key.recordings[i], cards[i]); } catch (e) {
          r = { name: key.recordings[i].name, ok: false, error: String(e && e.message || e) };
          cards[i].state.className = 'state bad'; cards[i].state.textContent = '❌ 出错 · Error'; cards[i].detail.textContent = r.error;
        }
        state.recordings.push(r);
        await frame();
      }
      state.ok = state.recordings.length > 0 && state.recordings.every((r) => r.ok);
    } catch (e) { state.ok = false; state.error = String(e && e.message || e); }
    state.totalMs = Math.round(performance.now() - t0); state.done = true;
    const o = $('overall');
    o.className = state.ok ? 'ok' : 'bad';
    o.textContent = state.ok ? '✅ 全部一致 · All consistent' : state.error ? '❌ 出错 · Error: ' + state.error : `❌ ${state.recordings.filter((r) => !r.ok).length} 个录像不一致 · mismatch`;
    $('raw').textContent = summary() + '\n\n' + JSON.stringify({ device: state.device, recordings: state.recordings }, null, 1);
    $('copy').disabled = false;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main); else main();
})();
