#!/usr/bin/env node
'use strict';
/* P3 step 3c browser run + UI audit (frontier-ui-audit) against `node preview.cjs` (started here on --port, default 8766, with
   the D1 latency model and a shortened takeover time). Two Playwright contexts play a lockstep room with a computer seat
   through the real lobby UI, then:
     - B's page is frozen (main thread blocked 9 s, socket left open: the backgrounded-tab state) -> A shows
       "等待 乙… · N 秒后由电脑接管";
     - B goes offline (context offline + socket closed) longer than the takeover time -> computer takeover toast on A, then
       B comes back, reconnects, catches up and reclaims;
     - B reloads the page (CPU throttled 6x so the catch-up progress bar stays visible) and catches up from turn 0;
     - A saves ("保存联机进度") and downloads the replay file;
     - A restores the online room from the save (new code), B joins and is seated in its old seat, both replay to the save
       point (checksum = save) and play on;
     - B reports corrupted checksums -> desync: tie goes to the host, B sees the desync dialog;
     - A watches the save as a replay (8x).
   Screenshots of the new states on phone portrait 390x844, phone landscape 844x390, iPad landscape 1180x820, desktop
   1280x800 (+ English on two views) with the read-only layout probe -> docs/p3c/.
   usage: node scripts/lockstep/resilience-ui.cjs [--port 8766] [--takeover 15000] [--out docs/p3c] */
const fs = require('node:fs'), path = require('node:path'), { spawn } = require('node:child_process');
const argv = process.argv.slice(2), get = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const PORT = +get('port', 8766), TAKEOVER = +get('takeover', 15000), OUT = get('out', 'docs/p3c'), ROOT = path.resolve(__dirname, '../..');
const base = `http://127.0.0.1:${PORT}`, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const probe = fs.readFileSync(path.join(ROOT, 'skills/frontier-ui-audit/scripts/inspect-layout.js'), 'utf8');
const VIEWS = [['phone-portrait', 390, 844], ['phone-landscape', 844, 390], ['ipad-landscape', 1180, 820], ['desktop', 1280, 800]];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const preview = spawn(process.execPath, [path.join(ROOT, 'preview.cjs')], { env: { ...process.env, PORT: String(PORT), PREVIEW_D1_LATENCY: '47', PREVIEW_INVOCATION_LIMIT: '10000', LOCKSTEP_TAKEOVER_MS: String(TAKEOVER) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let plog = ''; preview.stdout.on('data', (d) => (plog += d)); preview.stderr.on('data', (d) => (plog += d));
  for (let i = 0; i < 100 && !plog.includes('127.0.0.1'); i++) await sleep(100);
  const { chromium } = require('playwright'), browser = await chromium.launch({ args: ['--disable-gpu'] });
  const errors = [], statuses = {}, shots = [], steps = [];
  const step = (name, data = {}) => { steps.push({ name, at: new Date().toISOString(), ...data }); console.log('STEP', name, JSON.stringify(data)); };
  async function tab(name, lang = 'zh') {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true }), page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(name + ': ' + e.message));
    page.on('response', (r) => { const u = new URL(r.url()); if (!u.pathname.startsWith('/api/')) return; const k = name + ' ' + u.pathname.split('/')[2] + ' ' + r.status(); statuses[k] = (statuses[k] || 0) + 1; });
    await page.addInitScript((l) => { try { if (!localStorage.getItem('kingdom-language')) localStorage.setItem('kingdom-language', l); } catch {} }, lang);
    await page.goto(base + '/');
    await ready(page);
    return { ctx, page, name, cdp: await ctx.newCDPSession(page) };
  }
  const ready = (page) => page.waitForFunction(() => window.KingdomArt && KingdomArt.loaded && window.KingdomOnline && window.KingdomCore && window.KingdomNetCommands, null, { timeout: 120000 });
  async function shoot(t, state, lang = 'zh', views = VIEWS) {
    for (const [label, w, h] of views) {
      await t.page.setViewportSize({ width: w, height: h }); await sleep(350);
      if (state === 'saves-list') await t.page.evaluate(() => document.getElementById('net-saves')?.scrollIntoView({ block: 'end' }));
      const file = path.join(OUT, `${state}-${label}-${lang}.png`); await t.page.screenshot({ path: file });
      const p = await t.page.evaluate(probe).catch((e) => ({ error: String(e) }));
      const extra = await t.page.evaluate(() => { const box = (sel) => { const e = document.querySelector(sel); if (!e || e.hidden || !e.offsetParent && getComputedStyle(e).position !== 'fixed') return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), inView: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1, text: e.innerText.replace(/\s+/g, ' ').slice(0, 120) }; }; return { badge: box('#network-badge'), catchup: box('#net-catchup'), replay: box('#net-replay-bar'), desync: box('#net-desync[open]'), toast: document.getElementById('toast')?.classList.contains('show') ? document.getElementById('toast').innerText : null, hscroll: document.documentElement.scrollWidth > innerWidth + 1 }; });
      shots.push({ state, lang, view: label, size: `${w}x${h}`, file, findings: Array.isArray(p?.findings) ? p.findings.length : p?.findings ?? null, probe: p, ...extra });
    }
    await t.page.setViewportSize({ width: 1280, height: 800 });
  }
  const lsState = (t) => t.page.evaluate(() => { const c = KingdomCore.lockstep.current?.client; return c ? { turn: c.nextTurn, sealed: c.sealed, ai: [...c.aiSeats], progress: c.progress(), hashes: c.hashLog.slice(-400), desync: !!c.desync, transport: KingdomCore.lockstep.current.transport?.mode, reconnects: c.stats.reconnects || 0 } : null; });
  const playSome = async (t, n = 4) => { for (let i = 0; i < n; i++) { await t.page.keyboard.press(i % 2 ? 'e' : 'q'); const pt = await t.page.evaluate(() => { const c = document.getElementById('world').getBoundingClientRect(); return { x: c.left + c.width / 2 + ((Math.random() * 300) | 0) - 150, y: c.top + c.height / 2 + ((Math.random() * 160) | 0) - 40 }; }); await t.page.mouse.click(pt.x, pt.y, { button: 'right' }); await sleep(600); } };
  const compare = (a, b) => { const m = new Map(a.hashes); let n = 0, bad = null; for (const [s, h] of b.hashes) if (m.has(s)) { n++; if (m.get(s) !== h && !bad) bad = s; } return { compared: n, mismatchAt: bad }; };
  const result = { pass: false };
  try {
    const A = await tab('A'), B = await tab('B');
    // Lobby: 3 seats, computer fills the third, lockstep.
    await A.page.click('#open-online'); await sleep(400); await A.page.fill('#net-name', '甲'); await A.page.selectOption('#net-capacity', '3');
    await A.page.check('#net-fill'); await A.page.check('#net-lockstep'); await A.page.click('#net-create');
    await A.page.waitForFunction(() => document.getElementById('net-room-code')?.textContent?.trim(), null, { timeout: 20000 });
    const code = (await A.page.textContent('#net-room-code')).trim();
    await B.page.click('#open-online'); await sleep(400); await B.page.fill('#net-name', '乙'); await B.page.click('#net-code'); await B.page.keyboard.type(code, { delay: 100 });
    await B.page.waitForFunction(() => !document.getElementById('net-lobby').hidden, null, { timeout: 20000 });
    await B.page.click('#net-ready'); await A.page.click('#net-ready'); await sleep(1500);
    await A.page.waitForFunction(() => !document.getElementById('net-start').disabled, null, { timeout: 20000 }); await A.page.click('#net-start');
    for (const t of [A, B]) await t.page.waitForFunction(() => KingdomCore.lockstep.current?.client.nextTurn > 30 && window.frontier?.state?.networked, null, { timeout: 60000 });
    step('started', { code });
    for (let i = 0; i < 3; i++) { await playSome(A, 2); await playSome(B, 2); }

    // 1. B's page frozen (background) -> A waits with the takeover countdown.
    // Frozen tab: B's main thread is blocked (no timers, no socket handling, socket stays open) — what a backgrounded iPad tab does.
    const frozen = B.page.evaluate(() => { const end = Date.now() + 9000; while (Date.now() < end); }).catch(() => {});
    await A.page.waitForFunction(() => document.getElementById('network-badge').classList.contains('net-waiting') && /电脑接管/.test(document.getElementById('network-badge').textContent), null, { timeout: 15000 });
    step('wait-hint', { badge: await A.page.textContent('#network-badge') });
    await shoot(A, 'wait-takeover-countdown');
    await frozen;
    await A.page.waitForFunction(() => !document.getElementById('network-badge').classList.contains('net-waiting'), null, { timeout: 20000 });
    step('freeze-recovered', { A: (await lsState(A)).turn, B: (await lsState(B)).turn, aiB: (await lsState(A)).ai });

    // 2. B offline longer than the takeover time -> takeover, then back -> catch-up + reclaim.
    await B.ctx.setOffline(true); await B.page.evaluate(() => KingdomCore.lockstep.current.transport.active.ws?.close());
    await A.page.waitForFunction(() => KingdomCore.lockstep.current.client.aiSeats.has(1), null, { timeout: TAKEOVER + 30000 });
    step('takeover', { toast: await A.page.textContent('#toast') });
    await shoot(A, 'takeover-toast', 'zh', [VIEWS[0], VIEWS[3]]);
    await sleep(4000);
    await B.ctx.setOffline(false); await B.page.evaluate(() => dispatchEvent(new Event('online')));
    await B.page.waitForFunction(() => { const c = KingdomCore.lockstep.current.client; return !c.aiSeats.has(1) && !c.progress(); }, null, { timeout: 60000 });
    await A.page.waitForFunction(() => !KingdomCore.lockstep.current.client.aiSeats.has(1), null, { timeout: 30000 });
    step('reclaimed', { B: await lsState(B).then((s) => ({ turn: s.turn, reconnects: s.reconnects, transport: s.transport })), toastB: await B.page.textContent('#toast') });
    await shoot(B, 'reclaimed-toast', 'zh', [VIEWS[0], VIEWS[3]]);
    await playSome(B, 2);

    // 3. B reloads (CPU 6x slower so the catch-up bar is visible) and catches up from turn 0.
    await sleep(15000);
    await B.cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    await B.page.reload(); await ready(B.page);
    await B.page.waitForFunction(() => !document.getElementById('net-catchup')?.hidden && KingdomCore.lockstep.current?.client.progress(), null, { timeout: 90000 });
    step('catchup-visible', { bar: await B.page.textContent('#net-catchup') });
    await shoot(B, 'catchup-progress');
    await B.cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const tReload = Date.now();
    await B.page.waitForFunction(() => { const c = KingdomCore.lockstep.current?.client; return c && !c.progress() && c.nextTurn > 0 && document.getElementById('net-catchup').hidden; }, null, { timeout: 120000 });
    await sleep(3000);
    const cmp1 = compare(await lsState(A), await lsState(B));
    step('reload-caught-up', { msAfterThrottleOff: Date.now() - tReload, ...cmp1 });

    // 4. Save + download on A (pause menu).
    await A.page.click('#pause'); await sleep(500);
    await shoot(A, 'pause-save-buttons', 'zh');
    await A.page.click('#net-save-progress'); await A.page.waitForFunction(() => /联机进度已保存/.test(document.getElementById('toast').textContent), null, { timeout: 10000 });
    const [dl] = await Promise.all([A.page.waitForEvent('download', { timeout: 20000 }), A.page.click('#net-download-recording')]);
    const dlPath = path.join(OUT, 'downloaded-save.json'); await dl.saveAs(dlPath);
    const save = JSON.parse(fs.readFileSync(dlPath, 'utf8'));
    step('saved', { file: dl.suggestedFilename(), turns: save.turns, commands: save.commands.length, bytes: fs.statSync(dlPath).size, hash: save.hash });
    fs.unlinkSync(dlPath);
    await A.page.click('#resume').catch(() => {});

    // 5. Restore: A opens a new room from the save; B joins with the new code and gets its old seat.
    const original = await lsState(A); // checksums of the original room up to now (compared at steps <= the save point)
    await A.page.goto(base + '/'); await ready(A.page); await A.page.click('#open-online');
    await A.page.waitForSelector('#net-save-list .net-save-row', { timeout: 15000 }); await sleep(500);
    await shoot(A, 'saves-list');
    await A.page.click('#net-save-list .net-save-row .net-save-actions .primary');
    await A.page.waitForFunction(() => { const r = KingdomOnline.room; return r?.restore && r.restore.uploaded === r.restore.segments; }, null, { timeout: 60000 });
    const code2 = (await A.page.textContent('#net-room-code')).trim();
    await B.page.goto(base + '/'); await ready(B.page); await B.page.click('#open-online'); await sleep(400); await B.page.click('#net-code'); await B.page.keyboard.type(code2, { delay: 100 });
    await B.page.waitForFunction(() => !document.getElementById('net-lobby').hidden && KingdomOnline.room?.restore, null, { timeout: 20000 });
    const seatB = await B.page.evaluate(() => KingdomOnline.room.self);
    await sleep(1200);
    await shoot(A, 'restore-lobby');
    await B.page.click('#net-ready'); await A.page.click('#net-ready'); await sleep(1500);
    await A.page.waitForFunction(() => !document.getElementById('net-start').disabled, null, { timeout: 20000 }); await A.page.click('#net-start');
    for (const t of [A, B]) await t.page.waitForFunction((n) => { const c = KingdomCore.lockstep.current?.client; return c && !c.progress() && c.nextTurn > n + 30; }, save.turns, { timeout: 180000 });
    await playSome(A, 2); await playSome(B, 2); await sleep(3000);
    const sa = await lsState(A), sb = await lsState(B), full = (t) => t.page.evaluate(() => KingdomCore.lockstep.current.client.hashLog);
    const cmp2 = compare(sa, sb), upTo = save.turns * 2, orig = new Map(original.hashes.filter(([st]) => st <= upTo));
    const vsOriginal = (await full(A)).filter(([st]) => orig.has(st)).map(([st, h]) => [st, h === orig.get(st)]);
    step('restored', { code2, seatB, turnA: sa.turn, turnB: sb.turn, saveStep: upTo, vsOriginal, ...cmp2 });

    // 6. Desync: B corrupts its checksums -> tie goes to the host; B sees the dialog.
    await B.page.evaluate(() => { const c = KingdomCore.lockstep.current.client, push = c.hashQueue.push.bind(c.hashQueue); c.hashQueue.push = (...items) => push(...items.map(([s, h]) => [s, (h[0] === 'f' ? '0' : 'f') + h.slice(1)])); });
    await B.page.waitForFunction(() => document.getElementById('net-desync')?.open, null, { timeout: 30000 });
    await A.page.waitForFunction(() => KingdomCore.lockstep.current.client.aiSeats.size > 0, null, { timeout: 15000 });
    step('desync', { dialog: await B.page.textContent('#net-desync p'), aOnTime: !(await lsState(A)).desync });
    await shoot(B, 'desync-dialog');

    // 7. Replay viewer on A (the restored save), 8x.
    await A.page.goto(base + '/'); await ready(A.page); await A.page.click('#open-online');
    await A.page.waitForSelector('#net-save-list .net-save-row', { timeout: 15000 });
    await A.page.click('#net-save-list .net-save-row .net-save-actions button:nth-child(2)');
    await A.page.waitForSelector('#net-replay-bar button', { timeout: 30000 });
    await A.page.click('#net-replay-bar button:has-text("8×")'); await sleep(4000);
    step('replay', { turn: await A.page.evaluate(() => KingdomCore.lockstep.current.turn), bar: await A.page.textContent('#net-replay-bar') });
    await shoot(A, 'replay-bar');

    // English: saves list + replay bar on phone portrait and desktop.
    await A.page.evaluate(() => localStorage.setItem('kingdom-language', 'en'));
    await A.page.goto(base + '/'); await ready(A.page); await A.page.click('#open-online'); await A.page.waitForSelector('#net-save-list .net-save-row', { timeout: 15000 });
    await shoot(A, 'saves-list', 'en', [VIEWS[0], VIEWS[3]]);
    await A.page.click('#net-save-list .net-save-row .net-save-actions button:nth-child(2)'); await A.page.waitForSelector('#net-replay-bar button', { timeout: 30000 }); await sleep(1500);
    await shoot(A, 'replay-bar', 'en', [VIEWS[0], VIEWS[3]]);

    const bad5xx = Object.entries(statuses).filter(([k]) => / 5\d\d$/.test(k));
    const s = (n) => steps.find((x) => x.name === n) || {};
    result.pass = !errors.length && !bad5xx.length && s('reload-caught-up').mismatchAt === null && s('reload-caught-up').compared > 10 && s('restored').mismatchAt === null && s('restored').vsOriginal?.length > 0 && s('restored').vsOriginal.every(([, ok]) => ok) && s('restored').seatB === 1 && !!s('desync').aOnTime && shots.every((x) => !x.hscroll);
    Object.assign(result, { steps, statuses, pageErrors: errors, shots: shots.map(({ probe, ...x }) => x), probes: shots.map((x) => ({ state: x.state, view: x.view, lang: x.lang, probe: x.probe })) });
  } catch (e) {
    Object.assign(result, { error: String(e && e.stack || e), steps, statuses, pageErrors: errors, shots: shots.map(({ probe, ...x }) => x) });
  } finally {
    await browser.close(); preview.kill('SIGTERM');
    fs.writeFileSync(path.join(OUT, 'ui-results.json'), JSON.stringify(result, null, 1));
    console.log(JSON.stringify({ pass: result.pass, error: result.error, steps: result.steps?.map((x) => x.name), pageErrors: result.pageErrors, shots: result.shots?.length }, null, 1));
    process.exit(result.pass ? 0 : 1);
  }
})();
