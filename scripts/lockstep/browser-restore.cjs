#!/usr/bin/env node
'use strict';
/* 3e acceptance: restore an online room from a save WITH a snapshot, through the real lobby UI, against `node preview.cjs`.
   A loads a save file ("从文件载入存档或录像"), presses "从存档恢复房间" (uploads the segments after the snapshot and the
   snapshot parts), B joins with the 3-digit code (takes the original seat), both ready, A starts. Both tabs must download and
   verify the snapshot, replay only the turns after it, reach the save point with the save's checksum and play on with equal
   checksums. Screenshots of the restore lobby and of the snapshot download state are taken when --shots DIR is given.
   usage: node scripts/lockstep/browser-restore.cjs [--save file.json | --turns 3300] [--after 40] [--port 8765] [--json out.json] [--shots dir] */
const fs = require('node:fs'), path = require('node:path'), argv = process.argv.slice(2), get = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const PORT = +get('port', 8765), AFTER = +get('after', 40), jsonOut = get('json', null), shots = get('shots', null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let file = get('save', null), save;
  if (!file) {
    save = (await require('./synthetic-save.cjs').build({ turns: +get('turns', 3300), seed: 11 })).save;
    file = path.join(require('node:os').tmpdir(), 'kingdom-restore-' + process.pid + '.json'); fs.writeFileSync(file, JSON.stringify(save));
  } else save = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!save.snapshot) throw new Error('save has no snapshot');
  const { chromium } = require('playwright'), browser = await chromium.launch({ args: ['--disable-gpu'] });
  const errors = [], bad = [], statuses = {};
  async function tab(name) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }), page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(name + ': ' + e.message));
    page.on('response', (r) => { const u = new URL(r.url()); if (!u.pathname.startsWith('/api/')) return; const k = u.pathname.split('/')[2] + ' ' + r.status(); statuses[k] = (statuses[k] || 0) + 1; if (r.status() >= 300) bad.push(`${name} ${r.status()} ${u.pathname}`); });
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.KingdomArt && KingdomArt.loaded && window.KingdomCore && window.KingdomNetCommands, null, { timeout: 120000 });
    return { ctx, page, name };
  }
  try {
    const A = await tab('A'), B = await tab('B');
    await A.page.click('#open-online'); await sleep(400); await A.page.fill('#net-name', '甲');
    await A.page.setInputFiles('#net-save-file', file);
    await A.page.waitForSelector('#net-save-list .net-save-row button.primary', { timeout: 20000 });
    const tUpload = Date.now();
    await A.page.click('#net-save-list .net-save-row button.primary'); // 从存档恢复房间
    await A.page.waitForFunction(() => { const r = KingdomOnline.room?.restore; return r && r.uploaded === r.segments && r.snapshot && r.snapshot.uploaded === r.snapshot.parts; }, null, { timeout: 60000 });
    const uploadMs = Date.now() - tUpload, code = (await A.page.textContent('#net-room-code')).trim();
    const restoreInfo = await A.page.textContent('#net-restore-info');
    await B.page.click('#open-online'); await sleep(400); await B.page.fill('#net-name', '乙');
    await B.page.click('#net-code'); await B.page.keyboard.type(code, { delay: 120 });
    await B.page.waitForFunction(() => !document.getElementById('net-lobby').hidden, null, { timeout: 20000 });
    await B.page.click('#net-ready'); await A.page.click('#net-ready'); await sleep(1500);
    await A.page.waitForFunction(() => !document.getElementById('net-start').disabled, null, { timeout: 20000 });
    if (shots) { fs.mkdirSync(shots, { recursive: true }); await A.page.screenshot({ path: path.join(shots, 'restore-snapshot-lobby-desktop-zh.png') }); }
    const tStart = Date.now();
    await A.page.click('#net-start');
    const reach = async (t) => { await t.page.waitForFunction((turn) => KingdomCore.lockstep.current?.client?.nextTurn >= turn, save.turns, { timeout: 180000, polling: 50 }); return Date.now() - tStart; };
    const [ra, rb] = await Promise.all([reach(A), reach(B)]);
    const end = save.turns + AFTER * 10;
    await Promise.all([A, B].map((t) => t.page.waitForFunction((turn) => KingdomCore.lockstep.current.client.nextTurn >= turn, end, { timeout: (AFTER + 60) * 1000 })));
    await sleep(1500);
    const state = (t) => t.page.evaluate(() => { const L = KingdomCore.lockstep.current, c = L.client; return { turn: c.nextTurn, snapshotTurn: c.stats.snapshotTurn ?? null, loads: L.snaps.stats.loads, lastLoad: L.snaps.stats.lastLoad || null, hashes: c.hashLog, desync: c.desync, transport: L.transport.mode, aiTeams: [...c.aiTeams] }; });
    const sa = await state(A), sb = await state(B), ma = new Map(sa.hashes), mb = new Map(sb.hashes);
    let compared = 0, mismatch = null; for (const [step, h] of ma) if (mb.has(step)) { compared++; if (mb.get(step) !== h && !mismatch) mismatch = { step, a: h, b: mb.get(step) }; }
    const res = { save: { turns: save.turns, hash: save.hash, snapshotTurn: save.snapshot.turn, commands: save.commands.length }, room: code, restoreInfo, uploadMs, statuses, nonOk: bad, pageErrors: errors,
      reachSavePointMs: { A: ra, B: rb, note: 'from pressing start (includes the 3 s start lead)' },
      tabs: [sa, sb].map((s, i) => ({ tab: 'AB'[i], turn: s.turn, snapshotTurn: s.snapshotTurn, loads: s.loads, lastLoad: s.lastLoad, savePointHash: (i ? mb : ma).get(save.turns * 2) || null, transport: s.transport, desync: s.desync, aiTeams: s.aiTeams })),
      consistency: { compared, mismatch } };
    res.pass = !bad.length && !errors.length && !mismatch && compared >= AFTER - 5 && res.tabs.every((t) => t.snapshotTurn === save.snapshot.turn && t.savePointHash === save.hash && !t.desync);
    console.log(JSON.stringify(res, null, 1)); if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(res, null, 1));
    if (!res.pass) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
