#!/usr/bin/env node
'use strict';
/* P1 live multiplayer smoke test with the bundle loaded: against a running `node preview.cjs` (port 8765) a real browser client opens
   the online dialog, creates a room with computer seats (fill AI), readies, starts, then plays for SECONDS while recording every
   /api response status and page error, and issues a few commands (select army + right-click, train) through the normal UI.
   Pass = no non-2xx /api response (no 503), no page error, the frame counter advances, and KingdomCore did NOT start a recording for the
   online game (multiplayer replicas are NetworkSim, never K.Sim).
   usage: node scripts/replay/live-online.cjs [seconds=65] [port=8765] [--json out.json] */
const fs=require('node:fs'),argv=process.argv.slice(2),SECONDS=+(argv[0]||65),PORT=+(argv[1]||8765),jsonOut=argv.includes('--json')?argv[argv.indexOf('--json')+1]:null;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const {chromium}=require('playwright'),browser=await chromium.launch({args:['--disable-gpu']}),ctx=await browser.newContext({viewport:{width:1280,height:720}}),page=await ctx.newPage();
  const statuses={},bad=[],errors=[],log=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{const u=new URL(r.url());if(!u.pathname.startsWith('/api/'))return;const k=r.request().method()+' '+r.status();statuses[k]=(statuses[k]||0)+1;if(r.status()>=300)bad.push(`${r.status()} ${r.request().method()} ${u.pathname}`)});
  try{await page.goto(`http://127.0.0.1:${PORT}/`);await page.waitForFunction(()=>window.KingdomArt&&KingdomArt.loaded&&window.KingdomCore,null,{timeout:120000});
    const recordersBefore=await page.evaluate(()=>KingdomCore.replay.recorders);
    await page.click('#open-online');log.push('open online');await sleep(500);
    if(await page.$('#net-name'))await page.fill('#net-name','P1 测试');
    const fill=await page.$('#net-fill');if(fill&&!(await fill.isChecked()))await fill.check();log.push('fill computer seats');/* 3e: the old server-authoritative mode is the backup option now (Lockstep is the default). */const legacy=await page.$('#net-legacy');if(legacy&&!(await legacy.isChecked())){await legacy.check();log.push('classic online (backup)')}
    await page.click('#net-create');log.push('create room');await page.waitForFunction(()=>document.getElementById('net-room-code')?.textContent?.trim(),null,{timeout:20000});
    const code=await page.textContent('#net-room-code');log.push('room '+code.trim());
    await page.click('#net-ready');await sleep(1200);await page.click('#net-start');log.push('ready + start');
    await page.waitForFunction(()=>window.frontier&&window.frontier.state&&window.frontier.state.networked&&window.frontier.state.time>1,null,{timeout:30000});
    const t0=await page.evaluate(()=>window.frontier.state.time);log.push('game running, time '+t0.toFixed(1));
    const t=Date.now();let actions=0;while(Date.now()-t<SECONDS*1000){await sleep(8000);
      await page.keyboard.press('q');const p=await page.evaluate(()=>{const c=document.getElementById('world').getBoundingClientRect();return {x:c.left+c.width/2+((Math.random()*200)|0)-100,y:c.top+c.height/2+80}});await page.mouse.click(p.x,p.y,{button:'right'});
      await page.keyboard.press('Escape');const home=await page.$('#home');if(home){await home.click();await sleep(300);const tr=await page.$('[data-action="train-villager"]');if(tr){await tr.click().catch(()=>{});actions++}}actions++}
    const end=await page.evaluate(()=>({time:window.frontier.state.time,units:window.frontier.state.units.length,humans:window.frontier.state.humanTeams,nations:window.frontier.state.nations.length}));
    const recordersAfter=await page.evaluate(()=>KingdomCore.replay.recorders),recordingSim=await page.evaluate(()=>!!KingdomCore.replay.current?.sim?.s?.networked);
    const res={seconds:SECONDS,room:code.trim(),classicRoom:await page.evaluate(()=>!window.KingdomOnline?.room?.config?.lockstep),statuses,nonOk:bad,pageErrors:errors,start:t0,end,uiActions:actions,recordersBefore,recordersAfter,recordingAttachedToOnlineGame:recordingSim,log};
    res.pass=!bad.length&&!errors.length&&end.time>t0+SECONDS*.8&&!recordingSim;
    console.log(JSON.stringify(res,null,1));if(jsonOut)fs.writeFileSync(jsonOut,JSON.stringify(res,null,1));if(!res.pass)process.exitCode=1}
  finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
