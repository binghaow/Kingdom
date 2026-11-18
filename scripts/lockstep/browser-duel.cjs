#!/usr/bin/env node
'use strict';
/* P3 step 3b acceptance: two browser tabs (two Playwright contexts = two players) play a lockstep match through the real
   lobby UI against `node preview.cjs`. Each tab gives orders the way a player does (Q = select army, right-click the map;
   home button + train villager) every few seconds.
   Measures:
     - consistency: both tabs' checksum lists (every 20 steps) and the relay's desync flag;
     - operation latency: Node timestamp right before the click -> the tab's lockstep simulation executes that command
       (same machine clock), plus the client's own issue->execute numbers;
     - with --delay MS: every /api/lockstep request of both tabs is held MS/2 before it is sent and MS/2 before its reply is
       delivered (Playwright route), i.e. MS extra round-trip time.
        --join list (default: B taps "Join" in the open-room list) | code (types the 3-digit code; joins automatically) | id (legacy 8-character code + Join)
     --legacy: the old server-authoritative online mode (no lockstep checkbox) with computer seats; checks 2xx/no page errors
     --private: host ticks "invite only"; B checks the room is NOT in the list and enters through the invite link
   usage: node scripts/lockstep/browser-duel.cjs [--seconds 65] [--port 8765] [--delay 100] [--join list|code|id] [--legacy] [--private] [--json out.json] */
const fs = require('node:fs'), argv = process.argv.slice(2), get = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const JOIN = get('join', 'list'), LEGACY = argv.includes('--legacy'), PRIVATE = argv.includes('--private');
const VIEW = (get('viewport', '1280x720')).split('x').map(Number), SECONDS = +get('seconds', 65), PORT = +get('port', 8765), DELAY = +get('delay', 0), jsonOut = get('json', null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { chromium } = require('playwright'), browser = await chromium.launch({ args: ['--disable-gpu'] });
  const errors = [], bad = [], statuses = {};
  async function tab(name) {
    const ctx = await browser.newContext({ viewport: { width: VIEW[0], height: VIEW[1] } }), page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(name + ': ' + e.message));
    page.on('response', (r) => { const u = new URL(r.url()); if (!u.pathname.startsWith('/api/')) return; const k = u.pathname.split('/')[2] + ' ' + r.status(); statuses[k] = (statuses[k] || 0) + 1; if (r.status() >= 300) bad.push(`${name} ${r.status()} ${u.pathname}`); });
    if (DELAY > 0) await ctx.route('**/api/lockstep/**', async (route) => { await sleep(DELAY / 2); const resp = await route.fetch().catch(() => null); if (!resp) return route.abort().catch(() => {}); await sleep(DELAY / 2); await route.fulfill({ response: resp }).catch(() => {}); });
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.KingdomArt && KingdomArt.loaded && window.KingdomCore && window.KingdomNetCommands, null, { timeout: 120000 });
    return { ctx, page, name };
  }
  try {
    const A = await tab('A'), B = await tab('B');
    await A.page.click('#open-online'); await sleep(400);
    await A.page.fill('#net-name', '甲'); await A.page.selectOption('#net-capacity', LEGACY ? '3' : '2');
    if (LEGACY) await A.page.check('#net-fill'); else await A.page.check('#net-lockstep');
    if (PRIVATE) await A.page.check('#net-private');
    await A.page.click('#net-create');
    await A.page.waitForFunction(() => document.getElementById('net-room-code')?.textContent?.trim(), null, { timeout: 20000 });
    const code = (await A.page.textContent('#net-room-code')).trim(), roomId = await A.page.evaluate(() => KingdomOnline.room.id), invite = await A.page.inputValue('#net-invite-link');
    const joinInfo = { mode: PRIVATE ? 'invite-link' : JOIN, code, roomId };
    if (PRIVATE) {
      await B.page.click('#open-online'); await sleep(5000);
      joinInfo.listedWhilePrivate = await B.page.evaluate((id) => !!document.querySelector('#net-open-list [data-room="' + id + '"]'), roomId);
      joinInfo.listText = await B.page.textContent('#net-open-list');
      await B.page.evaluate(() => localStorage.setItem('kingdom-player-name', '乙'));
      await B.page.goto(invite); await B.page.waitForFunction(() => window.KingdomArt && KingdomArt.loaded && window.KingdomCore, null, { timeout: 120000 });
    } else {
      await B.page.click('#open-online'); await sleep(400);
      await B.page.fill('#net-name', '乙');
      if (JOIN === 'list') { const t = Date.now(); await B.page.waitForSelector('#net-open-list [data-room="' + roomId + '"]', { timeout: 15000 }); joinInfo.listMs = Date.now() - t; await B.page.click('#net-open-list [data-room="' + roomId + '"]'); }
      else if (JOIN === 'code') { await B.page.click('#net-code'); await B.page.keyboard.type(code, { delay: 120 }); /* auto-joins after 3 digits */ }
      else { await B.page.fill('#net-code', roomId); await B.page.click('#net-join'); }
    }
    await B.page.waitForFunction(() => !document.getElementById('net-lobby').hidden, null, { timeout: 20000 });
    await B.page.click('#net-ready'); await A.page.click('#net-ready'); await sleep(1500);
    await A.page.waitForFunction(() => !document.getElementById('net-start').disabled, null, { timeout: 20000 });
    await A.page.click('#net-start');
    if (LEGACY) {
      for (const t of [A, B]) await t.page.waitForFunction(() => window.frontier?.state?.networked && window.frontier.state.time > 1, null, { timeout: 60000 });
      const t0 = Date.now();
      while (Date.now() - t0 < SECONDS * 1000) { for (const t of [A, B]) { const p = t.page; await p.keyboard.press('q'); const pt = await p.evaluate(() => { const c = document.getElementById('world').getBoundingClientRect(); return { x: c.left + c.width / 2 + ((Math.random() * 300) | 0) - 150, y: c.top + c.height / 2 + 60 }; }); await p.mouse.click(pt.x, pt.y, { button: 'right' }); await p.keyboard.press('Escape'); } await sleep(4000); }
      const st = async (t) => t.page.evaluate(() => ({ time: +window.frontier.state.time.toFixed(1), nations: window.frontier.state.nations?.length, connected: KingdomOnline.connected }));
      const res = { legacy: true, seconds: SECONDS, join: joinInfo, statuses, nonOk: bad, pageErrors: errors, tabs: [await st(A), await st(B)] };
      res.pass = !bad.length && !errors.length && res.tabs.every((x) => x.time > SECONDS * 0.8 && x.connected) && !joinInfo.listedWhilePrivate;
      console.log(JSON.stringify(res, null, 1)); if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(res, null, 1));
      await browser.close(); process.exitCode = res.pass ? 0 : 1; return;
    }
    for (const t of [A, B]) await t.page.waitForFunction(() => KingdomCore.lockstep.current && KingdomCore.lockstep.current.client.nextTurn > 20 && window.frontier?.state?.networked, null, { timeout: 60000 });
    const clicks = [];
    const t0 = Date.now(); let round = 0;
    while (Date.now() - t0 < SECONDS * 1000) {
      for (const t of [A, B]) {
        const p = t.page;
        await p.keyboard.press(round % 2 ? 'e' : 'q');
        const pt = await p.evaluate(() => { const c = document.getElementById('world').getBoundingClientRect(); return { x: c.left + c.width / 2 + ((Math.random() * 300) | 0) - 150, y: c.top + c.height / 2 + ((Math.random() * 160) | 0) - 40 }; });
        const before = await p.evaluate(() => KingdomCore.lockstep.current.executed.length);
        const at = Date.now(); await p.mouse.click(pt.x, pt.y, { button: 'right' });
        clicks.push({ tab: t.name, at, before });
        await p.keyboard.press('Escape');
        if (round % 3 === 0) { const home = await p.$('#home'); if (home) { await home.click().catch(() => {}); await sleep(150); const trn = await p.$('[data-action="train-villager"]'); if (trn) await trn.click().catch(() => {}); } }
      }
      round++; await sleep(2500);
    }
    await sleep(1500);
    const state = async (t) => t.page.evaluate(() => { const L = KingdomCore.lockstep.current, c = L.client; return { turn: c.nextTurn, step: c.step, hashes: c.hashLog, desync: c.desync, executed: L.executed, stats: { ...c.stats, latency: c.stats.latency }, rtt: c.rtt, delay: c.delay, lag: c.lagTurns(), view: L.stats, time: window.frontier.state.time, units: window.frontier.state.units.length }; });
    // Main-thread frame interval of each tab (headless Chromium renders in software on this VM; real devices use the GPU).
    const frames = async (t) => t.page.evaluate(() => new Promise((res) => { const ts = []; const f = (x) => { ts.push(x); if (ts.length < 40) requestAnimationFrame(f); else { const d = ts.slice(1).map((v, i) => v - ts[i]).sort((a, b) => a - b); res({ p50: Math.round(d[d.length >> 1]), p90: Math.round(d[Math.floor(d.length * 0.9)]) }); } }; requestAnimationFrame(f); }));
    const fa = await frames(A), fb = await frames(B);
    const sa = await state(A), sb = await state(B);
    // Click -> execution: the first command of that tab executed after the click (orders issued by that click).
    const lat = [];
    for (const c of clicks) { const s = c.tab === 'A' ? sa : sb; const e = s.executed.slice(c.before).find((x) => x.at >= c.at && (x.type === 'orders' || x.type === 'order')); if (e) lat.push(Math.round(e.at - c.at)); }
    lat.sort((a, b) => a - b);
    const q = (arr, p) => (arr.length ? Math.round(arr[Math.min(arr.length - 1, Math.floor(p * arr.length))]) : null);
    const n = Math.min(sa.hashes.length, sb.hashes.length); let mismatch = null;
    for (let i = 0; i < n; i++) if (sa.hashes[i][1] !== sb.hashes[i][1]) { mismatch = { step: sa.hashes[i][0], a: sa.hashes[i][1], b: sb.hashes[i][1] }; break; }
    const internal = [...sa.stats.latency, ...sb.stats.latency].sort((a, b) => a - b);
    const transport = async (t) => t.page.evaluate(() => { const tr = KingdomCore.lockstep.current.transport; return { mode: tr.mode, fallbackReason: tr.fallbackReason || null }; });
    const res = { seconds: SECONDS, delayMs: DELAY, room: code, join: joinInfo, transport: { A: await transport(A), B: await transport(B) }, statuses, nonOk: bad, pageErrors: errors,
      consistency: { comparedChecksums: n, mismatch, desyncA: sa.desync, desyncB: sb.desync, lastStep: Math.min(sa.step, sb.step), lastHash: sa.hashes[n - 1] },
      clickToExecute: { n: lat.length, of: clicks.length, p50: q(lat, 0.5), p90: q(lat, 0.9), max: lat.at(-1) ?? null },
      issueToExecute: { n: internal.length, p50: q(internal, 0.5), p90: q(internal, 0.9), max: internal.length ? Math.round(internal.at(-1)) : null },
      tabs: [sa, sb].map((s, i) => ({ tab: 'AB'[i], turn: s.turn, gameTime: +s.time.toFixed(1), units: s.units, rtt: Math.round(s.rtt), delay: s.delay, lagTurns: +s.lag.toFixed(2), stalls: s.stats.stalls, stallMs: Math.round(s.stats.stallMs), catchup: s.stats.catchup, requests: s.stats.requests, failures: s.stats.failures, upBps: Math.round(s.stats.up / (s.turn / 10)), downBps: Math.round(s.stats.down / (s.turn / 10)), rejected: s.stats.rejected, commands: s.stats.commands, viewMsAvg: +(s.view.viewMs / Math.max(1, s.view.views)).toFixed(2), viewMsMax: +s.view.maxViewMs.toFixed(1) })) };
    res.frameIntervalMs = { A: fa, B: fb };
    res.pass = !joinInfo.listedWhilePrivate && !bad.length && !errors.length && !mismatch && !sa.desync && !sb.desync && n >= SECONDS - 5 && lat.length >= clicks.length * 0.8;
    console.log(JSON.stringify(res, null, 1)); if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(res, null, 1));
    if (!res.pass) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
