#!/usr/bin/env node
'use strict';
/* Net lobby v2 UI audit: open-room list on phone portrait/landscape, iPad landscape and desktop, Chinese and English,
   against `node preview.cjs`. Creates a few waiting rooms through the API (kept alive by polling), screenshots the entry page
   with the list, runs the frontier-ui-audit read-only DOM probe on the entry page and on the joined lobby (share button).
   usage: node scripts/lockstep/lobby-shots.cjs [port=8765] [outDir=docs/net-lobby-v2] */
const fs = require('node:fs'), path = require('node:path'), PORT = +(process.argv[2] || 8765), OUT = process.argv[3] || 'docs/net-lobby-v2';
const base = `http://127.0.0.1:${PORT}`, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const probe = fs.readFileSync('skills/frontier-ui-audit/scripts/inspect-layout.js', 'utf8');
const VIEWS = [['phone-portrait', 390, 844, true], ['phone-landscape', 844, 390, true], ['ipad-landscape', 1180, 820, true], ['desktop', 1280, 800, false]];
async function api(p, body, token) { const r = await fetch(base + '/api/rooms' + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }); return r.json(); }
(async () => {
  const hosts = [];
  for (const [name, nation, config] of [['Lena', 'france', { capacity: 4, mapId: 'coast_l', lockstep: true }], ['王小明', 'china', { capacity: 2, mapId: 'coast_s' }], ['Hiro', 'japan', { capacity: 3, mapId: 'coast_l', fillAI: true }]]) hosts.push(await api('', { name, nation, config }));
  const keep = setInterval(() => { for (const h of hosts) api('/' + h.room.id, {}, h.token).catch(() => {}); }, 5000);
  const { chromium } = require('playwright'), browser = await chromium.launch({ args: ['--disable-gpu'] }), report = [];
  for (const lang of ['zh', 'en']) for (const [label, w, h, touch] of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch && w < 1000, deviceScaleFactor: 1 }), page = await ctx.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript((l) => { try { localStorage.setItem('kingdom-language', l); localStorage.setItem('kingdom-player-name', l === 'en' ? 'Tester' : '测试员'); } catch {} }, lang);
    await page.goto(base + '/'); await page.waitForFunction(() => window.KingdomArt && KingdomArt.loaded && window.KingdomOnline, null, { timeout: 120000 });
    await page.click('#open-online'); await page.waitForSelector('#net-open-list .net-open-room', { timeout: 15000 }); await sleep(600);
    const file = path.join(OUT, `lobby-${label}-${lang}.png`); await page.screenshot({ path: file });
    const entry = await page.evaluate(probe), rows = await page.$$eval('#net-open-list .net-open-room', (els) => els.map((e) => { const b = e.querySelector('button').getBoundingClientRect(), r = e.getBoundingClientRect(); return { text: e.innerText.replace(/\s+/g, ' '), btn: [Math.round(b.width), Math.round(b.height)], inside: b.right <= r.right + 1 && b.left >= r.left - 1 }; }));
    const summary = await page.$eval('#net-code', (e) => { const r = e.getBoundingClientRect(), b = document.getElementById('net-join').getBoundingClientRect(); return { inputmode: e.inputMode, w: Math.round(r.width), h: Math.round(r.height), join: [Math.round(b.width), Math.round(b.height)], visibleWithoutScroll: r.bottom <= innerHeight }; });
    const dlg = await page.$eval('#network-dialog', (d) => ({ sw: d.scrollWidth, cw: d.clientWidth }));
    // Joined lobby: click "Join" on the first listed room (the 4-player lockstep room), check the share button and code.
    await page.click('#net-open-list .net-open-room button'); await page.waitForFunction(() => !document.getElementById('net-lobby').hidden, null, { timeout: 15000 });
    const lobby = await page.evaluate(probe), share = await page.$eval('#net-copy', (e) => { const r = e.getBoundingClientRect(); return { text: e.textContent, w: Math.round(r.width), h: Math.round(r.height), onScreen: r.right <= innerWidth && r.bottom <= innerHeight + 2000 }; }), code = await page.textContent('#net-room-code'), codeFont = await page.$eval('#net-room-code', (e) => getComputedStyle(e).fontSize);
    await page.click('#net-leave', { timeout: 5000 }).catch(() => {});
    report.push({ lang, view: label, size: `${w}x${h}`, screenshot: file, rows, summary, dialogOverflowX: dlg.sw > dlg.cw + 1, entryFindings: (entry.findings || entry).length ?? entry, entryProbe: entry, lobbyFindings: (lobby.findings || lobby).length ?? lobby, lobbyProbe: lobby, share, code, codeFont, errors });
    await ctx.close();
  }
  clearInterval(keep); for (const h of hosts) await api('/' + h.room.id, { action: 'leave' }, h.token).catch(() => {});
  await browser.close(); fs.writeFileSync(path.join(OUT, 'ui-audit.json'), JSON.stringify(report, null, 1));
  for (const r of report) console.log(r.lang, r.view, 'rows', r.rows.length, 'btn', JSON.stringify(r.rows.map((x) => x.btn)), 'inside', r.rows.every((x) => x.inside), 'codeBox', JSON.stringify(r.summary), 'overflowX', r.dialogOverflowX, 'probe entry/lobby', r.entryFindings, r.lobbyFindings, 'share', r.share.text, r.share.w + 'x' + r.share.h, 'code', r.code, r.codeFont, 'errors', r.errors.length);
})().catch((e) => { console.error(e); process.exit(1); });
