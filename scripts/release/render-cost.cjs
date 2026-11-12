#!/usr/bin/env node
'use strict';
/* Release check (c): frame time of the REAL game in headless Chromium (Playwright), desktop 1280x720 and phone 393x852 (DPR 3,
   touch). Scene: about 200 units (100 per side, mixed kinds, high HP so the melee lasts) fighting in open field at the camera
   centre, buildings moved out of view, AI off. Frame interval comes from requestAnimationFrame timestamps; render/scene/update come from the opt-in ?perf=1 HUD
   (public/performance-audit.js), which is how diagnostics are enabled on purpose. The test hooks (window.__releaseSim) are
   injected by this script through page.evaluate; nothing is added to the game files.
   IMPORTANT: headless Chromium here runs with --disable-gpu (Skia software raster on the main thread) and shares two CPU cores. These numbers are an
   upper bound for regressions between commits on this machine, NOT a device frame rate.
   Static files are served from public/ by a throwaway server on a free port (single-player needs no /api).
   usage: node scripts/release/render-cost.cjs [--quick] [--json out.json] [--shots dir] */
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),{ROOT,pct,median,r1,args}=require('./lib.cjs');
const TYPES={'.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.json':'application/json','.mp3':'audio/mpeg','.ogg':'audio/ogg','.m4a':'audio/mp4','.svg':'image/svg+xml','.webp':'image/webp'};
function serve(){const base=path.join(ROOT,'public');const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://x');if(url.pathname.startsWith('/api/')){res.writeHead(404).end();return}let file=path.join(base,decodeURIComponent(url.pathname));if(!file.startsWith(base)){res.writeHead(403).end();return}if(url.pathname.endsWith('/'))file=path.join(file,'index.html');fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return}res.setHeader('Content-Type',TYPES[path.extname(file)]||'application/octet-stream');res.end(data)})});
  return new Promise(ok=>server.listen(0,'127.0.0.1',()=>ok(server)))}
const VIEWPORTS={desktop:{w:1280,h:720,dpr:1,touch:false,zoom:1.1},phone:{w:393,h:852,dpr:3,touch:true,zoom:.9}};
const KINDS=['infantry','archer','cavalry','musketeer','cannon','halberd','longbow','grenadier','villager'];
async function measure(browser,port,name,{warm,secs,shots}){const v=VIEWPORTS[name];const ctx=await browser.newContext({viewport:{width:v.w,height:v.h},deviceScaleFactor:v.dpr,hasTouch:v.touch,isMobile:v.touch});const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  try{await p.goto(`http://127.0.0.1:${port}/?perf=1`);await p.waitForFunction(()=>window.KingdomArt&&KingdomArt.loaded,null,{timeout:90000});
    await p.evaluate(()=>{const P=KingdomSim.Sim.prototype,t=P.tick;P.tick=function(...a){window.__releaseSim=this;return t.apply(this,a)}});
    await p.click('#start');await p.waitForFunction(()=>!!window.__releaseSim,null,{timeout:30000});await p.waitForTimeout(800);
    const n=await p.evaluate(({kinds})=>{const sim=window.__releaseSim,s=sim.s;sim.ai=()=>{};sim.raids=()=>{};s.units=s.units.filter(u=>u.team===0&&u.kind==='villager').slice(0,3);s.effects=[];
      const base=s.buildings.find(b=>b.team===0&&b.kind==='town'),cx=base.x+80,cy=base.y-80;for(const b of s.buildings){b.x+=1500;b.y+=1100}
      for(let i=0;i<100;i++){const row=Math.floor(i/10),col=i%10;for(const [team,dir] of [[0,-1],[1,1]]){const u=sim.add(kinds[(i+(team?3:0))%kinds.length],team,cx+dir*(170+row*26),cy-170+col*38+((row&1)*10));u.hp=u.maxhp=6000}}
      const A=s.units.filter(u=>u.team===0&&u.kind!=='villager'),B=s.units.filter(u=>u.team===1);sim.order(A,{type:'advance',x:cx+200,y:cy});sim.order(B,{type:'advance',x:cx-200,y:cy});sim.grid=null;return s.units.length},{kinds:KINDS});
    await p.evaluate(z=>{const c=document.getElementById('world');const n=Math.round(Math.log(z/window.frontier.camera.z)/Math.log(1.1));for(let i=0;i<Math.abs(n);i++)c.dispatchEvent(new WheelEvent('wheel',{deltaY:n>0?-1:1,bubbles:true,cancelable:true}))},v.zoom);
    /* warm-up: wait for the attack-animation atlases this scene needs to finish decoding (one-time cold-start cost), then a few frames */
    await p.waitForFunction(()=>!(KingdomArt.attackStatus?.().pending>0),null,{timeout:120000,polling:250});await p.waitForTimeout(warm*1000);
    /* frame sampler + per-frame Canvas work counters (drawImage calls, filtered draws), installed in this test page only */
    const sample=await p.evaluate(({secs,max})=>new Promise(done=>{const P=CanvasRenderingContext2D.prototype,di=P.drawImage,fd=Object.getOwnPropertyDescriptor(P,'filter');let draws=0,filters=0;
      P.drawImage=function(...a){draws++;return di.apply(this,a)};Object.defineProperty(P,'filter',{get(){return fd.get.call(this)},set(v){if(v&&v!=='none')filters++;fd.set.call(this,v)},configurable:true});
      const t=[],perDraw=[],perFilter=[];let start=0;function f(now){if(start){perDraw.push(draws);perFilter.push(filters)}draws=0;filters=0;if(!start)start=now;t.push(now);if(now-start<secs*1000&&t.length<=max)requestAnimationFrame(f);else{P.drawImage=di;Object.defineProperty(P,'filter',fd);done({t,perDraw,perFilter})}}requestAnimationFrame(f)}),{secs,max:180}),frames=sample.t;
    const hud=await p.evaluate(()=>document.getElementById('performance-audit')?.textContent||'');
    if(shots){fs.mkdirSync(shots,{recursive:true});await p.screenshot({path:path.join(shots,`render-${name}.png`)})}
    const g=re=>{const m=hud.match(re);return m?m.slice(1).map(Number):[]},iv=[];for(let i=1;i<frames.length;i++)iv.push(frames[i]-frames[i-1]);
    const units=await p.evaluate(()=>window.__releaseSim.s.units.filter(u=>u.hp>0).length);
    return {viewport:`${v.w}x${v.h}@${v.dpr}`,drawImagePerFrame:median(sample.perDraw),filteredDrawsPerFrame:median(sample.perFilter),unitsSpawned:n,unitsAlive:units,frames:iv.length,frameP50:r1(pct(iv,.5)),frameP95:r1(pct(iv,.95)),fps:r1(1000/(median(iv)||1)),hudRender:g(/render ([\d.]+)\/([\d.]+)/),hudScene:g(/scene ([\d.]+)\/([\d.]+)/),hudUpdate:g(/update ([\d.]+)\/([\d.]+)/),visible:g(/visible (\d+)/)[0]??null,dpr:(hud.match(/DPR ([\d.]+\/[\d.]+)/)||[])[1]||null,errors:errors.slice(0,3)}}
  finally{await ctx.close()}}
async function run({quick=false,shots}={}){let chromium;try{({chromium}=require('playwright'))}catch(e){return {skipped:'playwright not available: '+e.message}}
  const server=await serve(),port=server.address().port,browser=await chromium.launch({args:['--disable-gpu'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});const reps=quick?1:2,out={note:'headless Chromium --disable-gpu（CPU 软件光栅，无 GPU），2 个共享 CPU 核：只作提交之间的回退信号，不是真机帧率',reps};
  try{for(const name of Object.keys(VIEWPORTS)){const runs=[];for(let i=0;i<reps;i++)runs.push(await measure(browser,port,name,{warm:quick?2:3,secs:quick?10:16,shots:i===0?shots:null}));
      const m=k=>r1(median(runs.map(r=>r[k]))),h=(k,j)=>r1(median(runs.map(r=>r[k][j]).filter(Number.isFinite)));
      out[name]={viewport:runs[0].viewport,frames:runs.map(r=>r.frames),drawImagePerFrame:m('drawImagePerFrame'),filteredDrawsPerFrame:m('filteredDrawsPerFrame'),units:runs[0].unitsSpawned,unitsAlive:m('unitsAlive'),visible:runs[0].visible,dpr:runs[0].dpr,frameP50:m('frameP50'),frameP95:m('frameP95'),fps:m('fps'),renderP50:h('hudRender',0),renderP95:h('hudRender',1),sceneP50:h('hudScene',0),sceneP95:h('hudScene',1),updateP50:h('hudUpdate',0),updateP95:h('hudUpdate',1),runs:runs.map(r=>({frameP50:r.frameP50,frameP95:r.frameP95,renderP50:r.hudRender[0],renderP95:r.hudRender[1]})),errors:[...new Set(runs.flatMap(r=>r.errors))]}}}
  finally{await browser.close();server.close()}return out}
module.exports={run};
if(require.main===module){const a=args();run({quick:!!a.quick,shots:a.shots}).then(r=>{if(a.json)fs.writeFileSync(a.json,JSON.stringify(r,null,1));console.log(JSON.stringify(r,null,1))}).catch(e=>{console.error(e);process.exit(1)})}
