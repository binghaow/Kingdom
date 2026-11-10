#!/usr/bin/env node
/*
 * Hearthfall benchmark / audit harness.
 *   node bench.js <game.html> [--only=sim,stress,path,render,ui,soak,det,bugs,map] [--quick] [--out=result.json]
 * Prints one JSON document to stdout (progress goes to stderr).
 * Requires: playwright + chromium already installed. No network needed.
 * Timing: the page is served from a local http server with COOP/COEP headers so that
 * performance.now() has 5us resolution (crossOriginIsolated).
 * NOTE: headless Chromium rasterises canvas on the CPU (SwiftShader), so render numbers are an
 * UPPER BOUND on raster cost; JS-side recording cost ("js") is the portable number.
 */
const {chromium} = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const argv = process.argv.slice(2);
const gamePath = path.resolve(argv.find(a => !a.startsWith('--')) || 'game.html');
const flag = (n, d) => { const a = argv.find(x => x.startsWith('--' + n + '=')); return a ? a.split('=')[1] : d; };
const QUICK = argv.includes('--quick');
const ONLY = (flag('only', 'sim,stress,path,render,ui,soak,det,bugs,map')).split(',');
const OUT = flag('out', null);
const log = (...a) => console.error('[bench]', ...a);

/* ---------------------------------------------------------------------------------------------
 * In-page helper library (serialised with toString and injected after the game loads)
 * ------------------------------------------------------------------------------------------- */
function pageLib() {
  const B = {};
  const stats = (arr) => {
    const n = arr.length; if (!n) return null;
    const s = Float64Array.from(arr).sort(); let sum = 0; for (let i = 0; i < n; i++) sum += s[i];
    const q = p => s[Math.min(n - 1, Math.floor(p * n))];
    return {n, mean: sum / n, p50: q(.5), p95: q(.95), p99: q(.99), max: s[n - 1]};
  };
  B.stats = stats;
  B.seed = s => { Math.random = mulberry32(s); };
  B.fresh = (seed, o = {}) => {
    B.seed(seed * 7919 + 13);
    $('menu').hidden = true;
    newGame(o.diff || 'normal', seed);
    G.paused = true;
    if (o.aiBoth) { G.aiBoth = true; ais.push(makeAI(0, o.diff0 || o.diff || 'normal')); }
    if (o.noAI) ais = [];
    if (o.immortal) for (const t of T) if (t.tc) t.tc.hp = t.tc.maxhp = 1e9;
  };
  const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
  B.hash = () => {
    let h = 2166136261 >>> 0;
    const mix = v => { h ^= v; h = Math.imul(h, 16777619) >>> 0; };
    const mf = v => { f64[0] = v; mix(u32[0]); mix(u32[1]); };
    for (const u of units) { mix(u.id); mf(u.x); mf(u.y); mf(u.hp); mix(u.ord.t.charCodeAt(0)); }
    for (const b of blds) { mix(b.id); mf(b.hp); mf(b.prog); mix(b.queue.length); }
    for (const t of T) { mf(t.food); mf(t.wood); mf(t.gold); mix(t.pop); mix(t.cap); }
    mix(nextId);
    return h >>> 0;
  };
  /* wrap global functions with inclusive timers */
  B.wrap = names => {
    const acc = {}, orig = {};
    for (const n of names) {
      if (typeof window[n] !== 'function') continue;
      const f = window[n]; orig[n] = f;
      const a = acc[n] = {calls: 0, tot: 0, max: 0, tick: 0, ticks: []};
      window[n] = function () { const t = performance.now(); const r = f.apply(this, arguments); const d = performance.now() - t; a.calls++; a.tot += d; if (d > a.max) a.max = d; a.tick += d; return r; };
    }
    return {acc, orig, endTick() { for (const n in acc) { acc[n].ticks.push(acc[n].tick); acc[n].tick = 0; } },
      restore() { for (const n in orig) window[n] = orig[n]; },
      summary() { const o = {}; for (const n in acc) { const a = acc[n]; o[n] = {calls: a.calls, totalMs: a.tot, meanUs: a.calls ? a.tot / a.calls * 1000 : 0, maxMs: a.max, perTick: stats(a.ticks)}; } return o; }};
  };
  B.PHASES = ['rebuildHash', 'tickBld', 'updUnit', 'separate', 'aiThink', 'updateFog', 'purge', 'updProj',
    'findPath', 'smoothPath', 'goPoint', 'goTarget', 'findRes', 'farmers', 'findEnemy', 'nearestDrop', 'nearU', 'nearestWalkable'];

  B.run = (ticks, W) => {
    const ts = new Float64Array(ticks);
    for (let i = 0; i < ticks; i++) { const t = performance.now(); step(STEP); ts[i] = performance.now() - t; if (W) W.endTick(); }
    return ts;
  };

  B.sample = () => {
    if (typeof gc === 'function') gc();
    const idle = [0, 0], vil = [0, 0], mil = [0, 0];
    for (const u of units) { if (u.dead) continue; if (u.type === 'villager') { vil[u.team]++; if (u.ord.t === 'idle') idle[u.team]++; } else mil[u.team]++; }
    const rem = {wood: 0, food: 0, gold: 0}; let nres = {tree: 0, berry: 0, gold: 0};
    for (const r of ress) { if (!r.dead) { rem[RDEF[r.type].res] += r.amt; nres[r.type]++; } }
    let cells = 0; for (const c of hash) cells += c.length;
    return {t: Math.round(G.t), units: units.length, blds: blds.length, ress: ress.length, projs: projs.length, fx: fx.length,
      byId: byId.size, selSet: selSet.size, sel: sel.length, hashItems: cells, dom: document.getElementsByTagName('*').length,
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(2) : null,
      vil, mil, idleVil: idle, pop: [T[0].pop, T[1].pop], cap: [T[0].cap, T[1].cap], age: [T[0].age, T[1].age],
      stock0: [Math.floor(T[0].food), Math.floor(T[0].wood), Math.floor(T[0].gold)], stock1: [Math.floor(T[1].food), Math.floor(T[1].wood), Math.floor(T[1].gold)],
      remaining: rem, nres, nextId};
  };

  /* AI-vs-AI simulation. wrapNames = null for clean timing pass. */
  B.sim = (seed, minutes, wrapNames, o = {}) => {
    B.fresh(seed, {aiBoth: true, immortal: !!o.immortal, diff: o.diff});
    const W = wrapNames ? B.wrap(wrapNames) : null;
    const total = Math.round(minutes * 1800), ts = new Float64Array(total), pc = new Uint16Array(total), samples = [];
    const cmdNames = ['orderGather', 'placeBuilding', 'enqueue', 'startAge', 'goPoint', 'goTarget'];
    const cmdCnt = {}, cmdPerSec = []; let secAcc = {};
    const cw = {};
    if (o.countCmds) for (const n of cmdNames) { const f = window[n]; cmdCnt[n] = 0; cw[n] = f; window[n] = function () { cmdCnt[n]++; secAcc[n] = (secAcc[n] || 0) + 1; return f.apply(this, arguments); }; }
    const fp = W && W.acc.findPath;
    let lastCalls = 0, over = null;
    for (let i = 0; i < total; i++) {
      const t = performance.now(); step(STEP); ts[i] = performance.now() - t;
      if (W) { W.endTick(); pc[i] = fp.calls - lastCalls; lastCalls = fp.calls; }
      if ((i + 1) % 30 === 0 && o.countCmds) { cmdPerSec.push(secAcc); secAcc = {}; }
      if (o.sampleEvery && (i + 1) % o.sampleEvery === 0) { if (o.render) { drawWorld(); drawMini(); refreshPanels(); } samples.push(B.sample()); }
      if (G.over && !over) over = {t: G.t, winner: G.winner};
    }
    if (o.countCmds) for (const n of cmdNames) window[n] = cw[n];
    const res = {ts: Array.from(ts), samples, over, summary: W ? W.summary() : null, pathCallsPerTick: W ? Array.from(pc) : null, cmdCnt, cmdPerSec};
    if (W) W.restore();
    return res;
  };

  /* ---------- stress scenarios ---------- */
  B.openCenter = R => {
    let best = null, bs = -1e9;
    for (let ty = R + 2; ty < MH - R - 2; ty += 2) for (let tx = R + 2; tx < MW - R - 2; tx += 2) {
      let c = 0; for (let y = ty - R; y <= ty + R; y += 2) for (let x = tx - R; x <= tx + R; x += 2) if (walkable(x, y)) c++;
      const sc = c - 0.05 * Math.hypot(tx - 40, ty - 40);
      if (sc > bs) { bs = sc; best = {x: (tx + .5) * TILE, y: (ty + .5) * TILE}; }
    }
    return best;
  };
  B.spawn = (type, team, n, cx, cy, sp = 15) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = i * 2.399963, r = sp * Math.sqrt(i + 1); let x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (!walkPx(x, y)) { const w = nearestWalkable(Math.floor(x / TILE), Math.floor(y / TILE), 20); if (!w) continue; x = (w[0] + .5) * TILE; y = (w[1] + .5) * TILE; }
      out.push(addUnit(type, team, x, y));
    }
    return out;
  };
  const MIX = ['spear', 'archer', 'spear', 'archer', 'knight'];
  B.scenario = (name, n, seconds, wrapNames, seed = 5) => {
    B.fresh(seed, {noAI: true});
    for (const t of T) { t.cap = 9999; }
    let issueMs = 0, extra = {};
    const ticks = Math.round(seconds * 30);
    if (name === 'battle' || name === 'pack') {
      const c = B.openCenter(10);
      if (name === 'battle') {
        const half = n >> 1, cxA = c.x - 5 * TILE, cxB = c.x + 5 * TILE;
        const mk = (team, cx) => { const all = B.spawn('spear', team, half, cx, c.y, 15); all.forEach((u, i) => { const ty = MIX[i % 5]; if (ty !== 'spear') { u.type = ty; const d = UDEF[ty]; u.r = d.r; u.hp = u.maxhp = d.hp; } }); return all; };
        const a = mk(0, cxA), b = mk(1, cxB);
        const t0 = performance.now();
        for (const u of a) { u.ord = {t: 'amove', x: cxB, y: c.y}; goPoint(u, cxB, c.y); }
        for (const u of b) { u.ord = {t: 'amove', x: cxA, y: c.y}; goPoint(u, cxA, c.y); }
        issueMs = performance.now() - t0;
        extra.center = c;
      } else {
        const us = B.spawn('spear', 0, n, c.x, c.y, 4);
        extra.center = c;
      }
    } else if (name === 'eco') {
      const tc = T[0].tc, vs = B.spawn('villager', 0, n, tc.x, tc.y + 90, 12);
      const t0 = performance.now(); const rts = ['wood', 'food', 'gold'];
      vs.forEach((u, i) => { const r = findRes(u, rts[i % 3], null, 60) || findRes(u, 'wood', null, 80); if (r) orderGather(u, r); });
      issueMs = performance.now() - t0;
    } else if (name === 'massmove') {
      const b0 = T[0].tc, us = B.spawn('spear', 0, n, b0.x, b0.y + 90, 12), tg = T[1].tc;
      const t0 = performance.now();
      us.forEach((u, i) => { const p = formation(us.length, i, tg.x, tg.y + 100); u.ord = {t: 'move', x: p.x, y: p.y}; goPoint(u, p.x, p.y); });
      issueMs = performance.now() - t0;
    } else if (name === 'attackTC') {
      const b0 = T[0].tc, us = B.spawn('spear', 0, n, b0.x, b0.y + 90, 12), tg = T[1].tc;
      const t0 = performance.now();
      for (const u of us) { u.ord = {t: 'attack', tgt: tg, fails: 0}; u.path = null; u.repath = 0; }
      issueMs = performance.now() - t0;
    } else if (name === 'unreach') {
      const c = B.openCenter(10), px = Math.floor(c.x / TILE), py = Math.floor(c.y / TILE);
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (i || j) terr[(py + j) * MW + px + i] = 1;
      const v = addUnit('villager', 1, (px + .5) * TILE, (py + .5) * TILE);
      const us = B.spawn('spear', 0, n, c.x - 9 * TILE, c.y, 15).filter(u => { if (Math.abs(u.x - v.x) < 40 && Math.abs(u.y - v.y) < 40) { u.dead = true; T[0].pop--; return false; } return true; });
      for (const u of us) { u.ord = {t: 'attack', tgt: v, fails: 0}; u.path = null; u.repath = 0; }
      extra.pocket = {px, py};
    }
    const W = wrapNames ? B.wrap(wrapNames) : null;
    const ts = B.run(ticks, W);
    const res = {n, name, seconds, issueMs, ts: Array.from(ts), summary: W ? W.summary() : null, extra, alive: units.filter(u => !u.dead).length};
    if (name === 'unreach') res.extra.fails = units.filter(u => u.ord && u.ord.fails).reduce((a, u) => Math.max(a, u.ord.fails), 0);
    if (name === 'unreach') res.extra.stillAttacking = units.filter(u => !u.dead && u.team === 0 && u.ord.t === 'attack').length;
    if (W) W.restore();
    return res;
  };

  /* ---------- pathfinding ---------- */
  B.expanded = () => { let c = 0; for (let i = 0; i < PN; i++) if (gCl[i] === stampC) c++; return c; };
  B.randWalk = rng => { for (;;) { const x = 1 + Math.floor(rng() * (MW - 2)), y = 1 + Math.floor(rng() * (MH - 2)); if (walkable(x, y)) return [x, y]; } };
  B.pathBench = (pairs) => {
    B.fresh(42, {aiBoth: true}); B.run(1800 * 3); // populate with 3 min of buildings/trees gone
    const rng = mulberry32(99), rows = [];
    for (let i = 0; i < pairs; i++) {
      const s = B.randWalk(rng), g = B.randWalk(rng);
      const t = performance.now(); const r = findPath(s[0], s[1], (a, b) => a === g[0] && b === g[1], g[0], g[1]); const dt = performance.now() - t;
      rows.push({dt, exp: B.expanded(), len: r.nodes.length, ok: r.ok, cheb: Math.max(Math.abs(s[0] - g[0]), Math.abs(s[1] - g[1]))});
    }
    // full buildPath incl. smoothing and los counting
    let losCalls = 0; const losOrig = window.los; window.los = function () { losCalls++; return losOrig.apply(this, arguments); };
    const spW = B.wrap(['smoothPath', 'findPath']); const bp = [];
    for (let i = 0; i < Math.min(pairs, 800); i++) {
      const s = B.randWalk(rng), g = B.randWalk(rng), u = {x: (s[0] + .5) * TILE, y: (s[1] + .5) * TILE};
      const l0 = losCalls, t = performance.now(); buildPath(u, (a, b) => a === g[0] && b === g[1], g[0], g[1], null); const dt = performance.now() - t;
      bp.push({dt, los: losCalls - l0, pts: u.path ? u.path.length : 0});
    }
    const sum = spW.summary(); spW.restore(); window.los = losOrig;
    return {rows, bp, wrapSummary: sum};
  };
  B.worstPath = () => {
    B.fresh(42, {noAI: true});
    const c = B.openCenter(10), px = Math.floor(c.x / TILE), py = Math.floor(c.y / TILE);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (i || j) terr[(py + j) * MW + px + i] = 1;
    let sx0 = Math.max(2, px - 20); while (!walkable(sx0, py) && sx0 > 1) sx0--; const s = [sx0, py], out = {};
    const reps = 20, ts = [];
    let e = 0;
    for (let k = 0; k < reps; k++) { const t = performance.now(); const r = findPath(s[0], s[1], (a, b) => a === px && b === py, px, py); ts.push(performance.now() - t); e = B.expanded(); out.ok = r.ok; out.nodes = r.nodes.length; }
    out.unreachable = {ms: stats(ts), expanded: e};
    // unreachable by rectDist goal (what goTarget uses)
    const v = {kind: 'u', x: (px + .5) * TILE, y: (py + .5) * TILE, r: 7};
    const ts2 = []; for (let k = 0; k < reps; k++) { const u = {x: (s[0] + .5) * TILE, y: (s[1] + .5) * TILE}; const t = performance.now(); buildPath(u, (a, b) => rectDist(a * TILE + 16, b * TILE + 16, v) <= 24, px, py, null); ts2.push(performance.now() - t); }
    out.goTargetUnreachable = {ms: stats(ts2)};
    // nearestWalkable worst case: big blocked block
    for (let y = 20; y < 52; y++) for (let x = 20; x < 52; x++) terr[y * MW + x] = 1;
    const ts3 = []; for (let k = 0; k < 200; k++) { const t = performance.now(); nearestWalkable(36, 36, 14); ts3.push(performance.now() - t); }
    out.nearestWalkableFail = {ms: stats(ts3)};
    return out;
  };

  /* ---------- rendering ---------- */
  B.countCanvas = fn => {
    const P = CanvasRenderingContext2D.prototype, cnt = {}, orig = {};
    const methods = ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'arc', 'ellipse', 'rect', 'closePath', 'fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect', 'drawImage', 'setLineDash', 'translate', 'scale', 'rotate', 'clip', 'setTransform', 'putImageData', 'createRadialGradient'];
    for (const m of methods) { const f = P[m]; orig[m] = f; cnt[m] = 0; P[m] = function () { cnt[m]++; return f.apply(this, arguments); }; }
    const props = ['fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha'], pd = {};
    for (const p of props) { const d = Object.getOwnPropertyDescriptor(P, p); pd[p] = d; cnt['set:' + p] = 0; Object.defineProperty(P, p, {configurable: true, get: d.get, set(v) { cnt['set:' + p]++; d.set.call(this, v); }}); }
    fn();
    for (const m of methods) P[m] = orig[m];
    for (const p of props) Object.defineProperty(P, p, pd[p]);
    cnt.rasterOps = cnt.fill + cnt.stroke + cnt.fillRect + cnt.strokeRect + cnt.drawImage + cnt.putImageData;
    cnt.pathOps = cnt.beginPath + cnt.moveTo + cnt.lineTo + cnt.arc + cnt.ellipse + cnt.rect;
    cnt.stateOps = cnt.save + cnt.restore + cnt.setTransform + cnt.translate + cnt.scale + cnt.rotate + cnt['set:fillStyle'] + cnt['set:strokeStyle'] + cnt['set:lineWidth'] + cnt['set:globalAlpha'] + cnt.setLineDash;
    return cnt;
  };
  B.timeDraw = (frames) => {
    const js = [], full = [], mjs = [], mfull = [], fog = [];
    drawWorld(); ctx.getImageData(0, 0, 1, 1);
    for (let i = 0; i < frames; i++) { const t0 = performance.now(); drawWorld(); const t1 = performance.now(); ctx.getImageData(0, 0, 1, 1); const t2 = performance.now(); js.push(t1 - t0); full.push(t2 - t0); }
    for (let i = 0; i < frames; i++) { const t0 = performance.now(); drawMini(); const t1 = performance.now(); mctx.getImageData(0, 0, 1, 1); const t2 = performance.now(); mjs.push(t1 - t0); mfull.push(t2 - t0); }
    for (let i = 0; i < frames; i++) { const t0 = performance.now(); updFogImg(); fog.push(performance.now() - t0); }
    // pieces
    const piece = (fn) => { const a = []; for (let i = 0; i < frames; i++) { const t0 = performance.now(); fn(); ctx.getImageData(0, 0, 1, 1); a.push(performance.now() - t0); } return stats(a); };
    const base = () => { ctx.setTransform(DPR * cam.z, 0, 0, DPR * cam.z, -cam.x * DPR * cam.z, -cam.y * DPR * cam.z); };
    const worldBlit = piece(() => { base(); ctx.drawImage(worldCv, 0, 0); });
    const fogBlit = piece(() => { base(); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(fogCv, 0, 0, WW, WH); });
    const miniBlit = (() => { const a = []; for (let i = 0; i < frames; i++) { const t0 = performance.now(); mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.drawImage(worldCv, 0, 0, mmc.width, mmc.width); mctx.getImageData(0, 0, 1, 1); a.push(performance.now() - t0); } return stats(a); })();
    return {drawWorldJs: stats(js), drawWorldFlushed: stats(full), drawMiniJs: stats(mjs), drawMiniFlushed: stats(mfull), updFogImg: stats(fog), worldBlitFlushed: worldBlit, fogBlitFlushed: fogBlit, miniWorldBlitFlushed: miniBlit};
  };
  B.allocPerFrame = (fn, frames) => {
    if (!performance.memory || typeof gc !== 'function') return null;
    gc(); const h0 = performance.memory.usedJSHeapSize; for (let i = 0; i < frames; i++) fn(); const h1 = performance.memory.usedJSHeapSize;
    return h1 >= h0 ? (h1 - h0) / frames : null;
  };
  B.visibleCounts = () => {
    const vx0 = cam.x - 40, vy0 = cam.y - 40, vx1 = cam.x + VW / cam.z + 40, vy1 = cam.y + VH / cam.z + 40, inV = (x, y) => x > vx0 && x < vx1 && y > vy0 && y < vy1;
    let r = 0, b = 0, u = 0; for (const e of ress) if (inV(e.x, e.y) && visPx(e.x, e.y, 1)) r++; for (const e of blds) if (inV(e.x, e.y)) b++; for (const e of units) if (inV(e.x, e.y)) u++;
    return {res: r, blds: b, units: u, fx: fx.length, projs: projs.length};
  };
  B.rafStats = (ms) => new Promise(res => {
    const d = []; let last = performance.now(); const t0 = last; const lt = [];
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) lt.push(e.duration); }).observe({entryTypes: ['longtask']}); } catch (e) {}
    function f(t) { d.push(t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else res({frames: d.length, ms: stats(d.slice(5)), over20: d.filter(x => x > 20).length, over34: d.filter(x => x > 34).length, longtasks: lt.length}); }
    requestAnimationFrame(f);
  });
  B.setupBattle = (n, seconds) => {
    B.fresh(5, {noAI: true}); for (const t of T) t.cap = 9999;
    const c = B.openCenter(10), half = n >> 1, cxA = c.x - 5 * TILE, cxB = c.x + 5 * TILE;
    const mk = (team, cx) => { const all = B.spawn('spear', team, half, cx, c.y, 15); all.forEach((u, i) => { const ty = MIX[i % 5]; if (ty !== 'spear') { u.type = ty; const d = UDEF[ty]; u.r = d.r; u.hp = u.maxhp = d.hp; } }); return all; };
    const a = mk(0, cxA), b = mk(1, cxB);
    for (const u of a) { u.ord = {t: 'amove', x: cxB, y: c.y}; goPoint(u, cxB, c.y); }
    for (const u of b) { u.ord = {t: 'amove', x: cxA, y: c.y}; goPoint(u, cxA, c.y); }
    for (let i = 0; i < seconds * 30; i++) step(STEP);
    updateFog(0, true);
    return c;
  };

  /* ---------- UI ---------- */
  B.refreshCost = (state) => {
    const reps = 300; const a = [], b = [];
    for (let i = 0; i < reps; i++) { const t = performance.now(); refreshPanels(); a.push(performance.now() - t); }
    for (let i = 0; i < reps; i++) { infoSig = ''; cmdSig = ''; const t = performance.now(); refreshPanels(); b.push(performance.now() - t); }
    return {unchanged: stats(a), forcedRebuild: stats(b)};
  };

  window.__B = B;
}

/* ---------------------------------------------------------------------------------------------
 * Node-side orchestration
 * ------------------------------------------------------------------------------------------- */
const html = fs.readFileSync(gamePath);
const srv = http.createServer((q, r) => {
  r.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp'});
  r.end(html);
});
let PORT;
let browser;
const errors = [];

async function openPage(profile = {}) {
  const ctx = await browser.newContext({viewport: profile.viewport || {width: 1280, height: 800}, deviceScaleFactor: profile.dpr || 1, isMobile: !!profile.mobile, hasTouch: !!profile.touch});
  await ctx.route('**/*', r => r.request().url().startsWith('http://localhost:' + PORT) ? r.continue() : r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('PAGEERR ' + e.message));
  await page.goto('http://localhost:' + PORT + '/', {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => typeof newGame === 'function' && typeof G !== 'undefined' && G && typeof worldCv !== 'undefined' && worldCv);
  await page.evaluate('(' + pageLib.toString() + ')()');
  return {ctx, page};
}
const r2 = x => typeof x === 'number' ? +x.toFixed(4) : x;
function st(a) { // stats of number array in node
  const n = a.length; if (!n) return null; const s = Float64Array.from(a).sort(); let sum = 0; for (const v of s) sum += v;
  const q = p => s[Math.min(n - 1, Math.floor(p * n))];
  return {n, mean: sum / n, p50: q(.5), p95: q(.95), p99: q(.99), max: s[n - 1]};
}
const fixObj = o => JSON.parse(JSON.stringify(o, (k, v) => typeof v === 'number' ? +v.toPrecision(5) : v));
function fitExponent(xs, ys) { // log-log least squares
  const lx = xs.map(Math.log), ly = ys.map(Math.log), n = xs.length, mx = lx.reduce((a, b) => a + b) / n, my = ly.reduce((a, b) => a + b) / n;
  let num = 0, den = 0; for (let i = 0; i < n; i++) { num += (lx[i] - mx) * (ly[i] - my); den += (lx[i] - mx) ** 2; } return num / den;
}

async function secSim() {
  log('sim');
  const {ctx, page} = await openPage();
  const mins = QUICK ? 3 : 8, out = {};
  for (const seed of (QUICK ? [42] : [42, 7])) {
    const clean = await page.evaluate(([s, m]) => __B.sim(s, m, null, {sampleEvery: 900, countCmds: false}), [seed, mins]);
    const ts = clean.ts, checkpoints = {};
    for (const m of [1, 3, 5, 8].filter(x => x <= mins)) {
      const w = ts.slice(0, m * 1800); const s = st(w);
      checkpoints[m + 'min'] = {...s, meanMs: s.mean, ticksOver4ms: w.filter(x => x > 4).length, ticksOver16ms: w.filter(x => x > 16).length};
    }
    const perMin = []; for (let m = 0; m < mins; m++) perMin.push({min: m + 1, ...st(ts.slice(m * 1800, (m + 1) * 1800))});
    // wrapped breakdown (separate pass, same seed + seeded Math.random => same trajectory)
    const wr = await page.evaluate(([s, m, names]) => { const r = __B.sim(s, m, names, {countCmds: false}); return {summary: r.summary, pc: r.pathCallsPerTick, ts: r.ts, over: r.over}; }, [seed, mins, await page.evaluate(() => __B.PHASES)]);
    const totalWrapped = wr.ts.reduce((a, b) => a + b, 0);
    const phases = {};
    for (const k in wr.summary) { const x = wr.summary[k]; phases[k] = {calls: x.calls, totalMs: x.totalMs, shareOfTick: x.totalMs / totalWrapped, meanUs: x.meanUs, maxMs: x.maxMs, perTickMeanUs: x.perTick.mean * 1000, perTickP95Us: x.perTick.p95 * 1000, perTickMaxMs: x.perTick.max}; }
    const pcSec = []; for (let i = 0; i + 30 <= wr.pc.length; i += 30) pcSec.push(wr.pc.slice(i, i + 30).reduce((a, b) => a + b, 0));
    // commands (for network estimate)
    const cmd = await page.evaluate(([s, m]) => { const r = __B.sim(s, m, null, {countCmds: true, sampleEvery: 900}); return {cmdCnt: r.cmdCnt, cmdPerSec: r.cmdPerSec, samples: r.samples}; }, [seed, Math.min(mins, 5)]);
    const aiOrders = cmd.cmdPerSec.map(o => (o.orderGather || 0) + (o.placeBuilding || 0) + (o.enqueue || 0) + (o.startAge || 0));
    out['seed' + seed] = {gameOver: clean.over, checkpoints, perMin, phases, pathCalls: {perSecond: st(pcSec), perTickMax: Math.max(...wr.pc), total: wr.summary.findPath ? wr.summary.findPath.calls : null},
      samples: clean.samples, commandCounts: cmd.cmdCnt, aiEconomicCmdsPerSec: st(aiOrders), aiGoPointCallsPerSec: st(cmd.cmdPerSec.map(o => (o.goPoint || 0) + (o.goTarget || 0)))};
  }
  await ctx.close(); return out;
}

async function secStress() {
  log('stress');
  const {ctx, page} = await openPage();
  const names = await page.evaluate(() => __B.PHASES);
  const out = {scenarios: {}, scaling: {}};
  const defs = QUICK ? [['battle', 150, 20], ['battle', 300, 20]] : [
    ['battle', 150, 40], ['battle', 300, 40], ['eco', 150, 30], ['eco', 300, 30], ['massmove', 100, 40], ['massmove', 300, 40],
    ['attackTC', 100, 20], ['attackTC', 300, 20], ['pack', 150, 10], ['pack', 300, 10], ['unreach', 100, 20], ['unreach', 300, 20]];
  for (const [name, n, sec] of defs) {
    log(' ', name, n);
    const clean = await page.evaluate(([a, b, c]) => { const r = __B.scenario(a, b, c, null); return {ts: r.ts, issueMs: r.issueMs, extra: r.extra, alive: r.alive}; }, [name, n, sec]);
    const wrr = await page.evaluate(([a, b, c, nm]) => { const r = __B.scenario(a, b, c, nm); return {summary: r.summary, ts: r.ts}; }, [name, n, sec, names]);
    const wr = wrr.summary, wtot = wrr.ts.reduce((a, b) => a + b, 0); // shares are vs. the instrumented run (timer overhead included)
    const phases = {}; for (const k in wr) { const x = wr[k]; phases[k] = {calls: x.calls, totalMs: x.totalMs, share: x.totalMs / wtot, meanUs: x.meanUs, maxMs: x.maxMs, perTickMaxMs: x.perTick.max}; }
    const ts = clean.ts;
    out.scenarios[name + '_' + n] = {simSeconds: sec, issueMs: clean.issueMs, tick: st(ts), firstTickMs: ts[0], first10TickMax: Math.max(...ts.slice(0, 10)), ticksOver33ms: ts.filter(x => x > 33).length, ticksOver16ms: ts.filter(x => x > 16).length, alive: clean.alive, extra: clean.extra, phases};
  }
  if (!QUICK) {
    for (const sc of ['battle', 'pack']) {
      const ns = [50, 100, 150, 300, 600], means = [];
      for (const n of ns) { const r = await page.evaluate(([a, b]) => { const x = __B.scenario(a, b, 12, null); return x.ts; }, [sc, n]); means.push(st(r).mean); }
      out.scaling[sc] = {n: ns, meanTickMs: means, logLogExponent: fitExponent(ns, means), msPerUnit: means.map((m, i) => m / ns[i])};
    }
  }
  await ctx.close(); return out;
}

async function secPath() {
  log('path');
  const {ctx, page} = await openPage();
  const pb = await page.evaluate(n => __B.pathBench(n), QUICK ? 400 : 2000);
  const rows = pb.rows, bins = {'<10': [], '10-30': [], '30-60': [], '>60': []};
  for (const r of rows) (r.cheb < 10 ? bins['<10'] : r.cheb < 30 ? bins['10-30'] : r.cheb < 60 ? bins['30-60'] : bins['>60']).push(r);
  const binStats = {}; for (const k in bins) binStats[k] = {count: bins[k].length, ms: st(bins[k].map(r => r.dt)), expanded: st(bins[k].map(r => r.exp))};
  const out = {astar: {ms: st(rows.map(r => r.dt)), expanded: st(rows.map(r => r.exp)), pathLenNodes: st(rows.map(r => r.len)), failedToReach: rows.filter(r => !r.ok).length, byChebyshevDistance: binStats},
    buildPathWithSmoothing: {ms: st(pb.bp.map(r => r.dt)), losCalls: st(pb.bp.map(r => r.los)), waypointsAfterSmoothing: st(pb.bp.map(r => r.pts)), smoothPathMs: pb.wrapSummary.smoothPath, findPathMs: pb.wrapSummary.findPath}};
  out.worstCase = await page.evaluate(() => __B.worstPath());
  // microbench hypot vs sqrt
  out.micro = await page.evaluate(() => { const N = 3e6; let s = 0, t = performance.now(); for (let i = 0; i < N; i++) s += Math.hypot(i * .37, i * .11); const h = performance.now() - t; t = performance.now(); for (let i = 0; i < N; i++) { const a = i * .37, b = i * .11; s += Math.sqrt(a * a + b * b); } const q = performance.now() - t; return {hypotNsPerCall: h / N * 1e6, sqrtNsPerCall: q / N * 1e6, sink: s > 0}; });
  await ctx.close(); return out;
}

async function secRender() {
  log('render');
  const profiles = {
    desktop1280x800_dpr1: {viewport: {width: 1280, height: 800}, dpr: 1},
    desktop1440x900_dpr2: {viewport: {width: 1440, height: 900}, dpr: 2},
    iphone_landscape_874x402_dpr3: {viewport: {width: 874, height: 402}, dpr: 3, mobile: true, touch: true}
  };
  const out = {};
  const frames = QUICK ? 40 : 120;
  for (const pn in profiles) {
    const {ctx, page} = await openPage(profiles[pn]);
    const cdp = await ctx.newCDPSession(page);
    const o = {};
    o.canvas = await page.evaluate(() => ({cssW: VW, cssH: VH, DPR, backingW: cv.width, backingH: cv.height, backingMB: cv.width * cv.height * 4 / 1048576, worldCv: worldCv.width + 'x' + worldCv.height, worldMB: worldCv.width * worldCv.height * 4 / 1048576, fogCv: fogCv.width + 'x' + fogCv.height, miniBacking: mmc.width, devicePixelRatio: window.devicePixelRatio}));
    o.buildWorldCanvasMs = await page.evaluate(() => { const a = []; for (let i = 0; i < 5; i++) { const t = performance.now(); buildWorldCanvas(); a.push(performance.now() - t); } return __B.stats(a); });
    const states = {};
    // mid-game natural AI-vs-AI (4 min)
    await page.evaluate(() => { __B.fresh(42, {aiBoth: true}); __B.run(1800 * 4); const c = T[0].tc; centerOn((T[0].tc.x + T[1].tc.x) / 2, (T[0].tc.y + T[1].tc.y) / 2); updateFog(0, true); });
    states.mid4min_defaultZoom = {zoom: await page.evaluate(() => { cam.z = 1.1; clampCam(); centerOn(T[0].tc.x, T[0].tc.y + 30); return cam.z; })};
    const meas = async (key, throttle) => {
      await cdp.send('Emulation.setCPUThrottlingRate', {rate: throttle || 1});
      const r = await page.evaluate(f => ({vis: __B.visibleCounts(), counts: (() => { let c1, c2; c1 = __B.countCanvas(() => drawWorld()); c2 = __B.countCanvas(() => drawMini()); return {drawWorld: c1, drawMini: c2}; })(), time: __B.timeDraw(f), allocBytesPerFrame: {drawWorld: __B.allocPerFrame(() => drawWorld(), 60), drawMini: __B.allocPerFrame(() => drawMini(), 60), refreshPanels: __B.allocPerFrame(() => refreshPanels(), 60)}}), frames);
      await cdp.send('Emulation.setCPUThrottlingRate', {rate: 1});
      return r;
    };
    states.mid4min_defaultZoom = {...states.mid4min_defaultZoom, ...(await meas())};
    await page.evaluate(() => { cam.z = 0.5; clampCam(); centerOn(T[0].tc.x + 600, T[0].tc.y - 600); });
    states.mid4min_minZoom = await meas();
    // heavy battle 300
    await page.evaluate(() => { const c = __B.setupBattle(300, 8); cam.z = 1.1; clampCam(); centerOn(c.x, c.y); updateFog(0, true); });
    states.battle300_defaultZoom = await meas();
    await page.evaluate(() => { cam.z = 0.5; clampCam(); });
    states.battle300_minZoom = await meas();
    if (pn.startsWith('iphone')) states.battle300_minZoom_cpuThrottle4x = await meas('t', 4);
    o.states = states;
    // real-time frame pacing with the game's own loop running
    o.realtime = {};
    await page.evaluate(() => { __B.fresh(42, {aiBoth: true}); G.paused = false; cam.z = 1.1; clampCam(); centerOn(T[0].tc.x, T[0].tc.y + 30); });
    o.realtime.mid_game_5s = await page.evaluate(() => __B.rafStats(5000));
    await page.evaluate(() => { const c = __B.setupBattle(300, 5); G.paused = false; cam.z = 1.1; clampCam(); centerOn(c.x, c.y); });
    o.realtime.battle300_5s = await page.evaluate(() => __B.rafStats(5000));
    out[pn] = o;
    await ctx.close();
  }
  // memory estimates (analytic)
  out.memoryModel = {
    worldCanvas_2560: 2560 * 2560 * 4 / 1048576, worldCanvas_if_64px_tiles_5120: 5120 * 5120 * 4 / 1048576,
    iosMaxCanvasPixels: 16777216, note: '2560^2 = 6.55 MP (OK vs 16.7 MP limit). 5120^2 = 26 MP exceeds the iOS single-canvas limit -> must be tiled if art moves to 64px tiles/2x res.'
  };
  return out;
}

async function secUI() {
  log('ui');
  const {ctx, page} = await openPage();
  const out = {};
  // refreshPanels cost
  out.refreshCost = {};
  for (const st_ of ['none', 'oneUnit', 'tcWithQueue', 'group60']) {
    await page.evaluate(s => {
      __B.fresh(42, {aiBoth: true}); __B.run(1800 * 2);
      if (s === 'none') setSel([]);
      if (s === 'oneUnit') setSel([units.find(u => u.team === 0)]);
      if (s === 'tcWithQueue') { T[0].food = T[0].wood = T[0].gold = 9999; setSel([T[0].tc]); for (let i = 0; i < 5; i++) enqueue(T[0].tc, 'villager'); }
      if (s === 'group60') { while (units.filter(u => u.team === 0).length < 60) __B.spawn('spear', 0, 5, T[0].tc.x, T[0].tc.y + 80); setSel(units.filter(u => u.team === 0)); }
    }, st_);
    out.refreshCost[st_] = await page.evaluate(() => __B.refreshCost());
  }
  // rebuild rates in real time
  out.domRebuildsPerSecond = {};
  for (const s of ['none', 'oneUnitMoving', 'tcWithQueue', 'barracksQueue', 'group20']) {
    const r = await page.evaluate(async s => {
      __B.fresh(42, {aiBoth: true}); __B.run(1800 * 3); T[0].food = T[0].wood = T[0].gold = 9999;
      const u0 = units.find(u => u.team === 0 && u.type === 'villager');
      if (s === 'none') setSel([]);
      if (s === 'oneUnitMoving') { setSel([u0]); }
      if (s === 'tcWithQueue') { setSel([T[0].tc]); for (let i = 0; i < 5; i++) enqueue(T[0].tc, 'villager'); }
      if (s === 'barracksQueue') { let b = blds.find(b => b.team === 0 && b.type === 'barracks' && b.done); if (!b) b = addBld('barracks', 0, 20, 52, true); setSel([b]); for (let i = 0; i < 5; i++) enqueue(b, 'spear'); }
      if (s === 'group20') { __B.spawn('spear', 0, 20, T[0].tc.x, T[0].tc.y + 80); setSel(units.filter(u => u.team === 0 && u.type === 'spear')); }
      G.paused = false; let info = 0, cmds = 0;
      const mo1 = new MutationObserver(l => { info += l.filter(m => m.type === 'childList' && m.addedNodes.length).length; }), mo2 = new MutationObserver(l => { cmds += l.filter(m => m.type === 'childList' && m.addedNodes.length).length; });
      mo1.observe($('info'), {childList: true}); mo2.observe($('cmds'), {childList: true});
      const t0 = performance.now(); await new Promise(r => setTimeout(r, 8000)); const dt = (performance.now() - t0) / 1000;
      mo1.disconnect(); mo2.disconnect(); G.paused = true;
      return {infoRebuildsPerSec: info / dt, cmdRebuildsPerSec: cmds / dt};
    }, s);
    out.domRebuildsPerSecond[s] = r;
  }
  // click-loss test: press on a queue-cancel button; release after variable delay
  out.clickLoss = {};
  for (const hold of [60, 100, 150, 250]) {
    await page.evaluate(() => { __B.fresh(42, {aiBoth: true}); __B.run(1800 * 2); T[0].food = T[0].wood = T[0].gold = 99999; G.paused = false; setSel([T[0].tc]); window.__cq = 0; if (!window.__cqW) { window.__cqW = 1; const f = cancelQueue; window.cancelQueue = function () { window.__cq++; return f.apply(this, arguments); }; } });
    let ok = 0, trials = QUICK ? 6 : 14;
    for (let i = 0; i < trials; i++) {
      await page.evaluate(() => { const tc = T[0].tc; while (tc.queue.length < 5) enqueue(tc, 'villager'); selDirty = true; refreshPanels(); });
      await page.waitForTimeout(40 + (i * 37) % 200);
      const box = await page.evaluate(() => { const b = document.querySelector('#info .qi:last-child'); if (!b) return null; const r = b.getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; });
      if (!box) continue;
      const before = await page.evaluate(() => window.__cq);
      await page.mouse.move(box.x, box.y); await page.mouse.down(); await page.waitForTimeout(hold); await page.mouse.up(); await page.waitForTimeout(30);
      const after = await page.evaluate(() => window.__cq);
      if (after > before) ok++;
    }
    out.clickLoss['hold' + hold + 'ms'] = {trials, delivered: ok, lostPct: +(100 * (trials - ok) / trials).toFixed(1)};
  }
  await ctx.close();
  // touch edge-scroll residue + stuck keys
  const t = await openPage({viewport: {width: 874, height: 402}, dpr: 3, mobile: true, touch: true});
  out.touchEdgeScroll = await t.page.evaluate(async () => {
    __B.fresh(42, {aiBoth: true}); G.paused = false; cam.z = 1.1; clampCam(); centerOn(1280, 1280);
    const r = cv.getBoundingClientRect(); const x0 = cam.x;
    return {r: [r.left, r.top, r.width, r.height], x0};
  });
  const cr = out.touchEdgeScroll.r;
  await t.page.touchscreen.tap(cr[0] + cr[2] - 6, cr[1] + cr[3] / 2);
  await t.page.waitForTimeout(800);
  out.touchEdgeScroll = {...out.touchEdgeScroll, ...(await t.page.evaluate(() => ({mouseInAfterTap: mouse.in, camX: cam.x}))), note: 'camX != x0 (and mouseInAfterTap=true) means camera keeps scrolling after a tap near the edge'};
  await t.page.waitForTimeout(500);
  out.touchEdgeScroll.camXlater = await t.page.evaluate(() => cam.x);
  await t.ctx.close();
  const k = await openPage();
  out.stuckKeys = await k.page.evaluate(async () => {
    __B.fresh(42, {aiBoth: true}); G.paused = false; cam.z = 1.5; clampCam(); centerOn(800, 800);
    window.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight'})); const x0 = cam.x;
    await new Promise(r => setTimeout(r, 200));
    window.dispatchEvent(new Event('blur')); document.dispatchEvent(new Event('visibilitychange'));
    const x1 = cam.x; await new Promise(r => setTimeout(r, 400));
    return {camAtBlur: x1, camAfter400ms: cam.x, stillScrollingAfterBlur: cam.x > x1 + 1, keyStillDown: !!keys.ArrowRight};
  });
  await k.ctx.close();
  return out;
}

async function secSoak() {
  log('soak');
  const {ctx, page} = await openPage();
  const mins = QUICK ? 3 : 10;
  const r = await page.evaluate(m => { __B.fresh(3, {aiBoth: true, immortal: true}); setSel([T[0].tc]); T[0].tc.queue.length = 0;
    const samples = [__B.sample()], ts = [];
    for (let i = 1; i <= m * 1800; i++) { const t = performance.now(); step(STEP); ts.push(performance.now() - t); if (i % 30 === 0) { drawWorld(); drawMini(); refreshPanels(); } if (i % 900 === 0) samples.push(__B.sample()); }
    return {samples, ts};
  }, mins);
  const perMin = []; for (let m = 0; m < mins; m++) perMin.push({min: m + 1, ...st(r.ts.slice(m * 1800, (m + 1) * 1800))});
  await ctx.close(); return {minutes: mins, samples: r.samples, tickPerMinute: perMin};
}

async function secDet() {
  log('determinism');
  const {ctx, page} = await openPage();
  const out = {};
  // static scan of the script text
  const src = html.toString('utf8'); const m = src.match(/<script>([\s\S]*)<\/script>/); const js = m ? m[1] : src; const lines = js.split('\n');
  const findFn = (i) => { for (let j = i; j >= 0; j--) { const mm = lines[j].match(/function\s+([A-Za-z0-9_$]+)\s*\(/); if (mm) return mm[1]; } return '?'; };
  const scan = (re) => { const o = []; lines.forEach((l, i) => { const mm = l.match(re); if (mm) o.push({line: i + 1, fn: findFn(i), n: (l.match(new RegExp(re.source, 'g')) || []).length}); }); return o; };
  out.static = {mathRandom: scan(/Math\.random\(/), mathHypot: scan(/Math\.hypot\(/), trig: scan(/Math\.(sin|cos|atan2|pow|exp|log)\(/), dateOrPerfNow: scan(/(Date\.now|performance\.now|new Date)/), sortCalls: scan(/\.sort\(/)};
  out.static.summary = {mathRandomSites: out.static.mathRandom.reduce((a, b) => a + b.n, 0), hypotSites: out.static.mathHypot.reduce((a, b) => a + b.n, 0)};
  // Run helper in-page: returns hash every 10 ticks
  const hashRun = (mode) => page.evaluate(m => {
    const nativeRandom = window.__nativeRandom || (window.__nativeRandom = Math.random.bind(Math)); const nativeHypot = window.__nativeHypot || (window.__nativeHypot = Math.hypot);
    Math.hypot = nativeHypot; Math.random = nativeRandom;
    if (m.hypot) Math.hypot = (a, b) => Math.sqrt(a * a + b * b);
    // fresh() seeds Math.random; for unseeded mode override afterwards
    __B.fresh(11, {aiBoth: true});
    if (!m.seeded) Math.random = nativeRandom;
    const hs = [];
    for (let i = 0; i < m.ticks; i++) { step(STEP); if (m.render) { drawWorld(); drawMini(); refreshPanels(); } if (i % 10 === 0) hs.push(__B.hash()); }
    Math.hypot = nativeHypot; return hs;
  }, mode);
  const ticks = QUICK ? 1800 : 5400;
  const A = await hashRun({seeded: true, ticks}), B2 = await hashRun({seeded: true, ticks});
  const firstDiff = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i * 10; return null; };
  out.dynamic = {ticksCompared: ticks,
    seededVsSeeded_firstDivergentTick: firstDiff(A, B2),
    unseededVsSeeded_firstDivergentTick: firstDiff(A, await hashRun({seeded: false, ticks})),
    unseededRunA_vs_runB_firstDivergentTick: firstDiff(await hashRun({seeded: false, ticks}), await hashRun({seeded: false, ticks})),
    hypotReplacedBySqrt_firstDivergentTick: firstDiff(A, await hashRun({seeded: true, hypot: true, ticks})),
    withRenderAndUiCalledEveryTick_firstDivergentTick: firstDiff(A, await hashRun({seeded: true, ticks: Math.min(ticks, 1800), render: true}).then(h => h.concat(A.slice(h.length))))};
  // cost of state hash / snapshot at 300 units
  out.costs = await page.evaluate(() => {
    __B.setupBattle(300, 5);
    const th = []; for (let i = 0; i < 200; i++) { const t = performance.now(); __B.hash(); th.push(performance.now() - t); }
    const tc = []; let cloneOk = true, size = 0; for (let i = 0; i < 20; i++) { const t = performance.now(); try { structuredClone({units, blds, ress, projs, fx, T, G, occ, terr, vis}); } catch (e) { cloneOk = false; } tc.push(performance.now() - t); }
    let jsonOk = true; try { JSON.stringify(units); } catch (e) { jsonOk = false; }
    // compact network snapshot of 200 units
    const snap = units.slice(0, 200).map(u => [u.id, Math.round(u.x), Math.round(u.y), Math.round(u.hp), u.ord.t[0]]);
    const bytesJson = JSON.stringify(snap).length;
    const ticks = []; for (let i = 0; i < 60; i++) { const t = performance.now(); step(STEP); ticks.push(performance.now() - t); }
    return {hash300UnitsMs: __B.stats(th), structuredCloneStateMs: __B.stats(tc), structuredCloneWorks: cloneOk, jsonStringifyUnitsWorks: jsonOk, snapshot200UnitsJsonBytes: bytesJson, snapshot200UnitsBinaryBytes: 200 * (2 + 2 + 2 + 1 + 1), tick300Ms: __B.stats(ticks)};
  });
  // dependency of sim on UI/view state: look for sim code touching UI globals
  out.simUiCoupling = ['sel (kill splices it, sets selDirty)', 'toast/uiToast/uiEnd called from sim', 'vis[] fog is computed for team 0 only and read by findEnemy/canPlace', 'G.aiBoth flag changes canPlace rule', 'commands (commandAt/doCmd) mutate sim state immediately at pointer-event time, not at a tick boundary', 'Math.random in 8 sim sites', 'Math.hypot in sim hot paths'];
  await ctx.close(); return out;
}

async function secBugs() {
  log('bugs');
  const {ctx, page} = await openPage();
  const out = {};
  out.difficultyGatherMultiplier = await page.evaluate(() => { newGame('hard', 5); const u = units.find(x => x.team === 1); return {aisLength: ais.length, gmulForTeam1: gmul(u), expectedForHard: AIP.hard.gather}; });
  out.buildOverMovingUnit = await page.evaluate(() => {
    __B.fresh(5, {noAI: true}); const tc = T[0].tc, u = __B.spawn('spear', 0, 1, tc.x + 160, tc.y + 40)[0]; goPoint(u, tc.x + 400, tc.y + 40); u.ord = {t: 'move', x: tc.x + 400, y: tc.y + 40};
    for (let i = 0; i < 5; i++) step(STEP); const tx = Math.floor(u.x / TILE), ty = Math.floor(u.y / TILE);
    T[0].wood = 999; const b = placeBuilding(0, 'house', tx, ty, []);
    for (let i = 0; i < 3; i++) step(STEP);
    return {placed: !!b, ordAfter: u.ord.t, pathAfter: !!u.path};
  });
  out.selSetStale = await page.evaluate(() => { __B.fresh(5, {noAI: true}); const us = __B.spawn('spear', 0, 3, T[0].tc.x, T[0].tc.y + 90); setSel(us); kill(us[0], null); return {selLen: sel.length, selSetSize: selSet.size}; });
  out.restuckPersists = 'code reading: u.restuck never reset on success -> every 5th lifetime stuck event aborts path (p3 stepPath)';
  out.mapSanity = await page.evaluate(n => {
    const res = {seeds: n, tcDisconnected: 0, unreachableGold: 0, unreachableBerry: 0, unreachableTreesPct: [], asym: [], startGoldDiff: 0, startBerryDiff: 0, lakeOverlapBase: 0};
    for (let s = 11; s < 11 + n; s++) {
      resetState(); genMap(s); startBases();
      const seen = new Uint8Array(MW * MH), q = []; const t0 = T[0].tc; let sx = -1, sy = -1;
      for (let y = t0.ty - 1; y <= t0.ty + t0.h && sx < 0; y++) for (let x = t0.tx - 1; x <= t0.tx + t0.w; x++) if (walkable(x, y)) { sx = x; sy = y; break; }
      seen[sy * MW + sx] = 1; q.push(sy * MW + sx);
      for (let h = 0; h < q.length; h++) { const c = q[h], cx = c % MW, cy = (c / MW) | 0; for (const d of DIRS) { const nx = cx + d[0], ny = cy + d[1]; if (!walkable(nx, ny) || seen[ny * MW + nx]) continue; seen[ny * MW + nx] = 1; q.push(ny * MW + nx); } }
      const t1 = T[1].tc; let ok1 = false; for (let y = t1.ty - 1; y <= t1.ty + t1.h; y++) for (let x = t1.tx - 1; x <= t1.tx + t1.w; x++) if (walkable(x, y) && seen[y * MW + x]) ok1 = true;
      if (!ok1) res.tcDisconnected++;
      let gU = 0, bU = 0, tU = 0, tN = 0;
      for (const r of ress) { let reach = false; for (let y = r.ty - 1; y <= r.ty + r.h && !reach; y++) for (let x = r.tx - 1; x <= r.tx + r.w; x++) if (walkable(x, y) && seen[y * MW + x]) { reach = true; break; } if (r.type === 'tree') { tN++; if (!reach) tU++; } else if (!reach) { if (r.type === 'gold') gU++; else bU++; } }
      if (gU) res.unreachableGold++; if (bU) res.unreachableBerry++; res.unreachableTreesPct.push(tN ? 100 * tU / tN : 0);
      const near = (b) => { const c = {tree: 0, berry: 0, gold: 0}; for (const r of ress) if (Math.hypot(r.x - b.x, r.y - b.y) / TILE < 14) c[r.type]++; return c; };
      const a = near(T[0].tc), b = near(T[1].tc);
      res.asym.push(Math.abs(a.tree - b.tree) / Math.max(1, a.tree));
      if (a.gold !== b.gold) res.startGoldDiff++; if (a.berry !== b.berry) res.startBerryDiff++;
      // mirror integrity
      let miss = 0; for (const r of ress) { const m = mir(r.tx, r.ty, r.w, r.h); if (!ress.some(o => o.type === r.type && o.tx === m[0] && o.ty === m[1])) miss++; }
      res.lakeOverlapBase += miss > 0 ? 1 : 0;
    }
    res.treeAsymmetryRelMean = res.asym.reduce((a, b) => a + b, 0) / n; res.treeAsymmetryRelMax = Math.max(...res.asym); res.unreachableTreesPctMean = res.unreachableTreesPct.reduce((a, b) => a + b, 0) / n; res.unreachableTreesPctMax = Math.max(...res.unreachableTreesPct);
    res.seedsWithNonMirroredResources = res.lakeOverlapBase; delete res.lakeOverlapBase; delete res.asym; delete res.unreachableTreesPct;
    return res;
  }, QUICK ? 40 : 300);
  out.popAndQueue = await page.evaluate(() => {
    __B.fresh(5, {noAI: true}); T[0].food = T[0].wood = T[0].gold = 9999; const tc = T[0].tc;
    T[0].cap = 5; const pop0 = T[0].pop; for (let i = 0; i < 5; i++) enqueue(tc, 'villager');
    for (let i = 0; i < 30 * 60; i++) step(STEP);
    return {capAfterCapDrop: T[0].cap, popStart: pop0, popAfter: T[0].pop, queueLeft: tc.queue.length, note: 'queue stalls (not drops) when pop>=cap; resources already paid are held'};
  });
  out.gameOverKeepsSim = await page.evaluate(() => { __B.fresh(5, {aiBoth: true}); T[0].tc.hp = 1; damage(T[0].tc, 5, T[1].tc); G.paused = false; return {over: G.over, winner: G.winner, note: 'frame() stops step() when G.over; keyboard commands are blocked by $("end").hidden check; pointerdown blocked by G.over'}; });
  out.trappedSpawn = await page.evaluate(() => {
    __B.fresh(5, {noAI: true}); const tc = T[0].tc; T[0].wood = 9999;
    // ring TC with farms (farm exempt from spacing rule)
    let placed = 0; for (let y = tc.ty - 2; y <= tc.ty + tc.h; y += 2) for (let x = tc.tx - 2; x <= tc.tx + tc.w; x += 2) { if (x >= tc.tx - 1 && x < tc.tx + tc.w + 1 && y >= tc.ty - 1 && y < tc.ty + tc.h + 1 && (x > tc.tx - 2 && y > tc.ty - 2 && x < tc.tx + tc.w && y < tc.ty + tc.h)) continue; if (placeBuilding(0, 'farm', x, y, [])) placed++; }
    T[0].food = 999; enqueue(tc, 'villager'); for (let i = 0; i < 30 * 12; i++) step(STEP);
    const nu = units[units.length - 1]; const r = findPath(Math.floor(nu.x / TILE), Math.floor(nu.y / TILE), (a, b) => a === 5 && b === 5, 5, 5);
    return {farmsPlaced: placed, newestUnitCanReachMapCorner: r.ok};
  });
  await ctx.close(); return out;
}

(async () => {
  await new Promise(r => srv.listen(0, r)); PORT = srv.address().port;
  browser = await chromium.launch({args: ['--js-flags=--expose-gc', '--enable-precise-memory-info', '--enable-benchmarking']});
  const result = {meta: {game: gamePath, bytes: html.length, date: new Date().toISOString(), quick: QUICK, node: process.version, chromium: browser.version(), note: 'headless Chromium, software raster; 5us timer'}};
  const secs = {sim: secSim, stress: secStress, path: secPath, render: secRender, ui: secUI, soak: secSoak, det: secDet, bugs: secBugs};
  for (const k of Object.keys(secs)) if (ONLY.includes(k)) { const t0 = Date.now(); try { result[k] = fixObj(await secs[k]()); } catch (e) { result[k] = {error: String(e && e.stack || e)}; } log(k, 'done in', ((Date.now() - t0) / 1000).toFixed(1) + 's'); }
  if (ONLY.includes('map')) {} // map sanity lives in bugs.mapSanity
  result.pageErrors = errors.slice(0, 20);
  const s = JSON.stringify(result, null, 1);
  if (OUT) fs.writeFileSync(OUT, s);
  console.log(s);
  await browser.close(); srv.close();
})();
