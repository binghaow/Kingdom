#!/usr/bin/env node
'use strict';
/* 3e UI audit (frontier-ui-audit probe): lobby with Lockstep as the default and the "旧联机（备用）" backup option, and the
   in-match Lockstep hint (badge), on phone portrait 390x844, phone landscape 844x390, iPad landscape 1180x820, desktop
   1280x800, against `node preview.cjs`. Chinese: lobby + in-match per viewport; English: lobby per viewport.
   One lockstep and one classic waiting room are created through the API so the open list shows both tags.
   usage: node scripts/lockstep/p3e-shots.cjs [port=8765] [outDir=docs/p3e] */
const fs = require('node:fs'), path = require('node:path'), PORT = +(process.argv[2] || 8765), OUT = process.argv[3] || 'docs/p3e';
const base = `http://127.0.0.1:${PORT}`, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const probe = fs.readFileSync('skills/frontier-ui-audit/scripts/inspect-layout.js', 'utf8');
const VIEWS = [['phone-portrait', 390, 844, true], ['phone-landscape', 844, 390, true], ['ipad-landscape', 1180, 820, true], ['desktop', 1280, 800, false]];
async function api(p, body, token) { const r = await fetch(base + '/api/rooms' + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }); return r.json(); }
const rect = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), inViewport: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1, text: e.innerText ?? e.textContent }; };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const hosts = [];
  for (const [name, nation, config] of [['Lena', 'france', { capacity: 2, mapId: 'coast_s', lockstep: true }], ['王小明', 'china', { capacity: 3, mapId: 'coast_l', fillAI: true }]]) hosts.push(await api('', { name, nation, config }));
  const keep = setInterval(() => { for (const h of hosts) api('/' + h.room.id, {}, h.token).catch(() => {}); }, 5000);
  const { chromium } = require('playwright'), browser = await chromium.launch({ args: ['--disable-gpu'] }), report = [];
  for (const lang of ['zh', 'en']) for (const [label, w, h, touch] of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch && w < 1000, deviceScaleFactor: 1 }), page = await ctx.newPage(), errors = [], bad = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => { if (new URL(r.url()).pathname.startsWith('/api/') && r.status() >= 500) bad.push(r.status() + ' ' + r.url()); });
    await page.addInitScript((l) => { try { localStorage.setItem('kingdom-language', l); localStorage.setItem('kingdom-player-name', l === 'en' ? 'Tester' : '测试员'); } catch {} }, lang);
    await page.goto(base + '/'); await page.waitForFunction(() => window.KingdomArt && KingdomArt.loaded && window.KingdomOnline && window.KingdomCore, null, { timeout: 120000 });
    await page.click('#open-online'); await page.waitForSelector('#net-open-list .net-open-room', { timeout: 15000 }); await sleep(600);
    // Lobby shot: the create section with the backup option in view (on phones it sits below "join a friend").
    await page.$eval('#net-legacy', (e) => e.closest('label').scrollIntoView({ block: 'center' })); await sleep(300);
    const lobbyFile = path.join(OUT, `lobby-${label}-${lang}.png`); await page.screenshot({ path: lobbyFile });
    const legacy = await page.evaluate(rect, 'label:has(#net-legacy)'), checked = await page.$eval('#net-legacy', (e) => e.checked);
    const tags = await page.$$eval('#net-open-list .net-open-tag', (els) => els.map((e) => e.textContent));
    const dlg = await page.$eval('#network-dialog', (d) => ({ sw: d.scrollWidth, cw: d.clientWidth }));
    const entryProbe = await page.evaluate(probe);
    const entry = { lang, view: label, size: `${w}x${h}`, lobbyShot: lobbyFile, backupOption: { ...legacy, checked }, openListTags: tags, dialogOverflowX: dlg.sw > dlg.cw + 1, entryProbe };
    if (lang === 'zh') {
      // In-match hint: create with the defaults (Lockstep), computer fills the seat, start alone.
      await page.$eval('#net-fill', (e) => e.scrollIntoView({ block: 'center' })); await page.check('#net-fill');
      await page.click('#net-create'); await page.waitForFunction(() => document.getElementById('net-room-code')?.textContent?.trim(), null, { timeout: 20000 });
      entry.rules = await page.textContent('#net-rules');
      await page.click('#net-ready'); await page.waitForFunction(() => !document.getElementById('net-start').disabled, null, { timeout: 20000 }); await page.click('#net-start');
      await page.waitForFunction(() => KingdomCore.lockstep.current?.client?.nextTurn > 40 && window.frontier?.state?.networked && !document.getElementById('network-badge').hidden, null, { timeout: 90000 });
      await sleep(1500);
      const gameFile = path.join(OUT, `match-badge-${label}-${lang}.png`); await page.screenshot({ path: gameFile });
      entry.matchShot = gameFile; entry.badge = await page.evaluate(rect, '#network-badge'); entry.transport = await page.evaluate(() => KingdomCore.lockstep.current.transport.mode);
      entry.matchProbe = await page.evaluate(probe);
      await page.evaluate(() => KingdomCore.lockstep.current?.stop());
    }
    entry.errors = errors; entry.server5xx = bad;
    report.push(entry); await ctx.close();
  }
  clearInterval(keep); for (const h of hosts) await api('/' + h.room.id, { action: 'leave' }, h.token).catch(() => {});
  await browser.close(); fs.writeFileSync(path.join(OUT, 'ui-results.json'), JSON.stringify(report, null, 1));
  const n = (p) => (p && (p.findings || p).length) ?? p;
  for (const r of report) console.log(r.lang, r.view, 'backup', JSON.stringify([r.backupOption.text, r.backupOption.w + 'x' + r.backupOption.h, r.backupOption.inViewport, 'checked=' + r.backupOption.checked]), 'tags', JSON.stringify(r.openListTags), 'overflowX', r.dialogOverflowX, 'probe', n(r.entryProbe), r.badge ? 'badge ' + JSON.stringify([r.badge.text, r.badge.w + 'x' + r.badge.h, r.badge.inViewport, r.transport]) + ' rules ' + r.rules + ' probe ' + n(r.matchProbe) : '', 'errors', r.errors.length, '5xx', r.server5xx.length);
})().catch((e) => { console.error(e); process.exit(1); });
