#!/usr/bin/env node
'use strict';
/* P1 browser pre-flight (Playwright).
   A. Capture through the real UI (Chromium): opens the game with ?replay=1, starts a war from the welcome dialog, then plays with
      real input - clicks the "train villager" command button, selects workers (E) and right-clicks a tree, selects the army (Q) and
      right-clicks open ground, opens the villager build menu, places a house on the map and confirms it, selects the town (home
      button) and clicks age-up - while the game runs in real time with rendering, UI events, sounds and the AI. The page's recording
      (setup + captured commands + in-game checksums every 20 steps) is exported and replayed headlessly in Node: the checksum
      sequences must match, which shows every state-changing UI path was captured and the computer players follow the seed.
   B. Cross-browser determinism: the same recordings (the browser one + the standard fixtures) are replayed inside each available
      browser engine (Chromium, WebKit, Firefox) with the page's own simulation code via KingdomCore.replay.run, and compared with Node.
   usage: node scripts/replay/browser-preflight.cjs [--secs 30] [--json out.json] [--save-replay out.json] */
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),{loadK,loadReplay,FIXTURES}=require('./lib.cjs');
const ROOT=path.resolve(__dirname,'../..'),argv=process.argv.slice(2),opt=(k,d)=>{const i=argv.indexOf('--'+k);return i>=0?argv[i+1]:d};
const TYPES={'.png':'image/png','.jpg':'image/jpeg','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.json':'application/json','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav','.m4a':'audio/mp4','.svg':'image/svg+xml','.webp':'image/webp','.webmanifest':'application/manifest+json'};
function serve(){const base=path.join(ROOT,'public');const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://x');if(url.pathname.startsWith('/api/')){res.writeHead(404).end();return}let file=path.join(base,decodeURIComponent(url.pathname));if(!file.startsWith(base)){res.writeHead(403).end();return}if(url.pathname.endsWith('/'))file=path.join(file,'index.html');fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return}res.setHeader('Content-Type',TYPES[path.extname(file)]||'application/octet-stream');res.end(data)})});return new Promise(ok=>server.listen(0,'127.0.0.1',()=>ok(server)))}
async function launch(name){const pw=require('playwright'),type=pw[name];const exe=name==='chromium'&&process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{};try{return {browser:await type.launch({args:name==='chromium'?['--disable-gpu']:[],...exe})}}catch(e){return {error:String(e.message||e).split('\n')[0].slice(0,220)}}}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function playThroughUI(browser,port,secs){const ctx=await browser.newContext({viewport:{width:1280,height:720}}),page=await ctx.newPage(),errors=[],log=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/?replay=1`);await page.waitForFunction(()=>window.KingdomArt&&KingdomArt.loaded&&window.KingdomCore,null,{timeout:120000});
  await page.waitForFunction(()=>!document.getElementById('start').disabled,null,{timeout:60000});await page.click('#start');
  await page.waitForFunction(()=>KingdomCore.replay.current&&KingdomCore.replay.current.step>5,null,{timeout:30000});
  const screen=(x,y)=>page.evaluate(([x,y])=>{const c=document.getElementById('world'),r=c.getBoundingClientRect(),cam=window.frontier.camera;return {x:r.left+(x-cam.x)*cam.z+r.width/2,y:r.top+(y-cam.y)*cam.z+r.height/2}},[x,y]);
  const state=()=>page.evaluate(()=>{const sim=KingdomCore.replay.current.sim,s=sim.s,town=s.buildings.find(b=>b.team===0&&b.kind==='town'),cam=window.frontier.camera;const vis=n=>Math.abs(n.x-cam.x)<500/cam.z&&Math.abs(n.y-cam.y)<280/cam.z;const tree=s.nodes.filter(n=>(n.amount??1)>0&&/tree|wood/.test(n.kind+n.resource+n.type)&&vis(n)).sort((a,b)=>Math.hypot(a.x-town.x,a.y-town.y)-Math.hypot(b.x-town.x,b.y-town.y))[0];return {town:{x:town.x,y:town.y},tree:tree?{x:tree.x,y:tree.y,id:tree.id}:null,step:KingdomCore.replay.current.step}});
  const click=async(sel,what)=>{const el=await page.$(sel);if(!el){log.push(what+': '+sel+' not shown');return false}await el.click();log.push(what);await sleep(400);return true};
  const t0=Date.now();
  await click('#home','select town (home button)');await click('[data-action="train-villager"]','click train villager');
  if(await click('#chat-toggle','open chat')){const input=await page.$('#chat-input');if(input){await input.fill('无限资源');await input.press('Enter');log.push('chat: typed the resource cheat (sendChat)');await sleep(400)}await page.evaluate(()=>{document.getElementById('chat-input')?.blur();document.getElementById('chat-toggle')?.click()});log.push('close chat')}
  let st=await state();await page.keyboard.press('e');log.push('E: select workers');await sleep(300);
  if(st.tree){const p=await screen(st.tree.x,st.tree.y);await page.mouse.click(p.x,p.y,{button:'right'});log.push('right-click tree #'+st.tree.id)}
  await sleep(1500);await page.keyboard.press('q');log.push('Q: select army');await sleep(300);
  st=await state();{const p=await screen(st.town.x+180,st.town.y+120);await page.mouse.click(p.x,p.y,{button:'right'});log.push('right-click ground (move army)')}
  await sleep(1500);await page.keyboard.press('e');await sleep(300);
  if(await click('[data-action="build-house"]','click build house')){st=await state();let placed=false;const spots=await page.evaluate(()=>{const sim=KingdomCore.replay.current.sim,t=sim.s.buildings.find(b=>b.team===0&&b.kind==='town'),cam=window.frontier.camera,out=[];for(let r=180;r<520&&out.length<4;r+=30)for(let k=0;k<16&&out.length<4;k++){const a=k*Math.PI/8,x=t.x+Math.cos(a)*r,y=t.y+Math.sin(a)*r;if(Math.abs(x-cam.x)<520/cam.z&&Math.abs(y-cam.y)<250/cam.z&&!sim.placementError('house',x,y,0))out.push([Math.round(x-t.x),Math.round(y-t.y)])}return out});for(const [dx,dy] of spots){const p=await screen(st.town.x+dx,st.town.y+dy);await page.mouse.click(p.x,p.y);await sleep(300);if(await page.$('#confirm-build:not([hidden])')){const ok=await page.evaluate(()=>{const b=document.getElementById('confirm-build');return b&&b.offsetParent!==null});if(ok){await page.click('#confirm-build');await sleep(200);const r=await page.evaluate(()=>KingdomCore.replay.current.data.commands.filter(c=>c.m==='construct').at(-1)?.r);log.push(`placed house at town${dx>=0?'+':''}${dx},${dy>=0?'+':''}${dy} and confirmed -> ${JSON.stringify(r)}`);if(r&&r.building){placed=true;break}if(!await page.$('[data-action="build-house"]'))break;await page.click('[data-action="build-house"]');await sleep(300)}}}if(!placed)log.push('house: confirm button not shown');await page.keyboard.press('Escape')}
  await sleep(1000);await click('#home','select town');await click('[data-action="tech-age"]','click age-up');await click('[data-action="train-villager"]','click train villager again');
  const left=secs*1000-(Date.now()-t0);if(left>0)await sleep(left);
  await page.keyboard.press('Space');log.push('pause');await sleep(300);
  const rec=await page.evaluate(()=>KingdomCore.replay.export());await ctx.close();return {rec,errors,log}}
async function replayIn(browser,port,datas){const ctx=await browser.newContext(),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/`);await page.waitForFunction(()=>window.KingdomCore&&window.KingdomSim,null,{timeout:120000});
  const ua=await page.evaluate(()=>navigator.userAgent),out=[];for(const d of datas){const t=Date.now();out.push({...(await page.evaluate(d=>KingdomCore.replay.run(d),d)),ms:Date.now()-t})}await ctx.close();return {ua,out,errors}}
(async()=>{const secs=+opt('secs',30),K=loadK(),R=await loadReplay(),server=await serve(),port=server.address().port,report={browsers:{}};
  try{const chromium=await launch('chromium');if(chromium.error)throw Error('chromium unavailable: '+chromium.error);
    // A. capture through the real UI
    const play=await playThroughUI(chromium.browser,port,secs),rec=play.rec;if(opt('save-replay'))fs.writeFileSync(opt('save-replay'),JSON.stringify(rec));
    const node=R.runReplay(K,rec),d=R.firstDifference(node.checksums,rec.checksums);
    report.capture={steps:rec.steps,commands:rec.commands.map(c=>`${c.s}:${c.m}`),log:play.log,pageErrors:play.errors,inGameChecksums:rec.checksums.length,inGameFinal:rec.final.hash,nodeFinal:node.final.hash,match:!d&&node.final.hash===rec.final.hash,firstDifference:d,resultMismatch:node.results.mismatch,unrecordable:!!rec.meta.unrecordable};
    console.log(`A. UI capture (Chromium, ${secs} s real time): ${rec.steps} steps, ${rec.commands.length} commands [${[...new Set(rec.commands.map(c=>c.m))].join(', ')}], in-game final ${rec.final.hash} vs Node replay ${node.final.hash}: ${report.capture.match?'MATCH':'DIFFERENT at step '+(d?.a?.step??d?.b?.step)}; page errors ${play.errors.length}`);
    for(const l of play.log)console.log('   - '+l);
    // B. cross-browser replay of the same recordings
    const fixtures=fs.readdirSync(FIXTURES).filter(f=>f.endsWith('.json')).sort().slice(0,2).map(f=>JSON.parse(fs.readFileSync(path.join(FIXTURES,f),'utf8'))),datas=[rec,...fixtures],names=['ui-capture',...fixtures.map(f=>f.meta.name)];
    const ref=datas.map(x=>R.runReplay(K,x));report.node={version:process.version,final:ref.map(r=>r.final.hash)};
    const engines=[['chromium',chromium],['webkit',await launch('webkit')],['firefox',await launch('firefox')]];
    for(const [name,l] of engines){if(l.error){report.browsers[name]={available:false,error:l.error};console.log(`B. ${name}: NOT AVAILABLE (${l.error})`);continue}
      const r=await replayIn(l.browser,port,datas);const rows=r.out.map((o,i)=>{const diff=R.firstDifference(o.checksums,ref[i].checksums);return {replay:names[i],steps:o.steps,checksums:o.checksums.length,final:o.final.hash,node:ref[i].final.hash,same:!diff&&o.final.hash===ref[i].final.hash,firstDifference:diff,ms:o.ms}});
      report.browsers[name]={available:true,userAgent:r.ua,rows,pageErrors:r.errors};
      console.log(`B. ${name} (${r.ua.match(/(HeadlessChrome|Chrome|Version|Firefox)\/[\d.]+/)?.[0]||r.ua.slice(0,40)}): `+rows.map(x=>`${x.replay} ${x.same?'SAME':'DIFF@'+(x.firstDifference?.a?.step??'?')} ${x.final}`).join('; '))}
    for(const [,l] of engines)await l.browser?.close();
    const fail=!report.capture.match||report.capture.pageErrors.length||Object.values(report.browsers).some(b=>b.available&&b.rows.some(r=>!r.same));report.verdict=fail?'FAIL':'PASS';
    if(opt('json'))fs.writeFileSync(opt('json'),JSON.stringify(report,null,1));console.log(report.verdict);if(fail)process.exitCode=1}
  finally{server.close()}})().catch(e=>{console.error(e);process.exit(1)});
