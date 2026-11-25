#!/usr/bin/env node
'use strict';
/* Production-render evidence for fix/lobby-buildings-net: (1) the welcome picture follows the chosen nation (britain, china, usa;
   desktop + phone landscape); (2) mill / mining camp / lumber camp next to their resources in the real game (production
   script order, the page's own renderer) after the resize + offline key. Writes PNGs to docs/art/lobby-buildings/.
   usage: node scripts/art/lobby-buildings-shots.cjs */
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.resolve(__dirname, '../..'), OUT = path.join(ROOT, 'docs/art/lobby-buildings');
const { serve } = require(path.join(ROOT, 'scripts/release/render-cost.cjs'));
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { chromium } = require('playwright'), server = await serve(), browser = await chromium.launch({ args: ['--disable-gpu'] }), out = [];
  try {
    for (const [name, ctxOpts] of [['desktop', { viewport: { width: 1280, height: 800 } }], ['phone', { viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
      const ctx = await browser.newContext(ctxOpts), p = await ctx.newPage(), errors = [];
      p.on('pageerror', (e) => errors.push(e.message));
      if (name === 'desktop') await ctx.addInitScript(() => { let v; Object.defineProperty(window, 'NavalUI', { configurable: true, get() { return v; }, set(x) { const b = x.bind; x.bind = (a) => { window.__api = a; return b.call(x, a); }; v = x; } }); });
      await p.goto(`http://127.0.0.1:${server.address().port}/`);
      await p.waitForFunction(() => window.KingdomArt && KingdomArt.loaded, null, { timeout: 120000 });
      for (const n of ['britain', 'china', 'usa']) {
        await p.click(`.nation-card[data-nation="${n}"]`); await p.waitForTimeout(400);
        const info = await p.evaluate(() => { const e = document.querySelector('.intro-building'), cs = getComputedStyle(e); return { nation: e.dataset.nation, bg: cs.backgroundImage.slice(-40), pos: cs.backgroundPosition, w: e.offsetWidth, h: e.offsetHeight, visible: cs.display !== 'none' && e.offsetWidth > 0 }; });
        const file = `lobby-${name}-${n}.png`; await p.screenshot({ path: path.join(OUT, file) }); out.push({ file, ...info });
      }
      if (name === 'desktop') {
        await p.evaluate(() => { const P = KingdomSim.Sim.prototype, t = P.tick; P.tick = function (...a) { window.__sim = this; return t.apply(this, a); }; });
        await p.click('#start'); await p.waitForFunction(() => !!window.__sim, null, { timeout: 30000 });
        const placed = await p.evaluate(() => {
          const sim = window.__sim, s = sim.s, town = s.buildings.find((b) => b.team === 0 && b.kind === 'town'), D = KingdomSim.defs, res = [];
          s.resources[0].wood = s.resources[0].food = s.resources[0].gold = s.resources[0].stone = 9999;
          for (const [kind, pred] of [['miningcamp', (n) => n.resource === 'gold'], ['mill', (n) => n.subtype === 'berries'], ['lumbercamp', (n) => n.resource === 'wood']]) {
            const node = s.nodes.filter(pred).sort((a, b) => Math.hypot(a.x - town.x, a.y - town.y) - Math.hypot(b.x - town.x, b.y - town.y))[0]; if (!node) continue;
            let spot = null; for (let r = 40; r < 260 && !spot; r += 4) for (let a = 0; a < 48; a++) { const x = node.x + Math.cos(a / 48 * 6.283) * r, y = node.y + Math.sin(a / 48 * 6.283) * r; if (!sim.placementError(kind, x, y, 0)) { spot = { x, y, r }; break; } }
            if (!spot) continue; const b = sim.add(kind, 0, spot.x, spot.y); b.complete = true; b.hp = D[kind].hp; b.progress = 1; res.push({ kind, node: node.id, x: Math.round(node.x), y: Math.round(node.y), dist: spot.r });
          }
          sim.grid = null; return res;
        });
        for (const b of placed) { await p.evaluate((pt) => { window.__api.focusPoint({ x: pt.x, y: pt.y }); }, b); await p.waitForTimeout(900); const file = `game-${b.kind}.png`; await p.screenshot({ path: path.join(OUT, file), clip: { x: 340, y: 160, width: 600, height: 420 } }); out.push({ file, ...b }); }
      }
      out.push({ context: name, errors }); await ctx.close();
    }
  } finally { await browser.close(); server.close(); }
  fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
