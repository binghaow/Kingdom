#!/usr/bin/env node
'use strict';
/* Production-render screenshots of the Little Ant (real index.html script order, headless Chromium).
   Summons through the real chat box, then captures grass / swimming / sleeping / gathering into
   docs/art/drafts/little-ant/shots/. Also records whether the atlas was requested before summoning. */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const ROOT=path.join(__dirname,'..','..'),OUT=path.join(ROOT,'docs/art/drafts/little-ant/shots');
function serve(){const base=path.join(ROOT,'public');const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://x');if(url.pathname.startsWith('/api/')){res.writeHead(404).end();return}let file=path.join(base,decodeURIComponent(url.pathname));if(!file.startsWith(base)){res.writeHead(403).end();return}if(url.pathname.endsWith('/'))file=path.join(file,'index.html');fs.readFile(file,(e,b)=>{if(e){res.writeHead(404).end();return}const ext=path.extname(file),type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.json':'application/json','.svg':'image/svg+xml','.ogg':'audio/ogg','.mp3':'audio/mpeg'}[ext]||'application/octet-stream';res.writeHead(200,{'content-type':type});res.end(b)})});return new Promise(ok=>server.listen(0,'127.0.0.1',()=>ok(server)))}
(async()=>{fs.mkdirSync(OUT,{recursive:true});const server=await serve(),port=server.address().port,browser=await chromium.launch({args:['--disable-gpu']});const report={antRequestsBeforeSummon:[],antRequestsAfterSummon:[],shots:[]};
 try{const p=await browser.newPage({viewport:{width:1280,height:720}});let summoned=false;p.on('request',r=>{if(/little-ant[^/]*\.(png|webp)/.test(r.url()))(summoned?report.antRequestsAfterSummon:report.antRequestsBeforeSummon).push(r.url().replace(/^.*\/assets\//,'assets/'))});
  await p.addInitScript(()=>{let n;Object.defineProperty(window,'NavalUI',{configurable:true,get(){return n},set(v){n=v;const b=v.bind.bind(v);v.bind=a=>{window.__api=a;return b(a)}}})});
  await p.goto(`http://127.0.0.1:${port}/`);await p.waitForFunction(()=>document.getElementById('start'),null,{timeout:30000});await p.click('#start');await p.waitForFunction(()=>!!window.__api?.getSim,null,{timeout:30000});await p.waitForTimeout(1500);
  await p.evaluate(()=>{const sim=window.__api.getSim();sim.ai=()=>{};sim.raids=()=>{}});
  summoned=true;await p.keyboard.press('Enter');await p.fill('#chat-input','小蚂蚁');await p.keyboard.press('Enter');await p.keyboard.press('Escape');
  await p.waitForFunction(()=>window.KingdomAntArt?.status().loaded,null,{timeout:20000});
  const focus=async(select)=>{await p.evaluate(select=>{const s=window.__api.getSim().state,a=s.units.find(u=>u.kind==='ant');window.__api.selectIds(select?[a.id]:[]);window.__api.focusPoint({x:a.x,y:a.y})},select)};
  const waitSim=async sec=>{const t0=await p.evaluate(()=>window.__api.getSim().state.time);await p.waitForFunction(t=>window.__api.getSim().state.time>=t,t0+sec,{timeout:60000})};
  const shot=async(name,note,select=false)=>{await focus(select);await p.waitForTimeout(350);const file=path.join(OUT,name);await p.screenshot({path:file,clip:{x:340,y:160,width:600,height:400}});report.shots.push({file:path.relative(ROOT,file),note})};
  // grass: walking a short hop on open land
  await p.evaluate(()=>{const sim=window.__api.getSim(),a=sim.state.units.find(u=>u.kind==='ant');sim.order([a],{type:'move',x:a.x+260,y:a.y+20})});await waitSim(.8);await shot('ant-grass.png','草地行走（召唤后，真实渲染顺序，选中）',true);
  // water: move next to the nearest water and swim in
  const water=await p.evaluate(()=>{const K=window.KingdomSim,sim=window.__api.getSim(),w=sim.world,a=sim.state.units.find(u=>u.kind==='ant');let best=null,bd=1e9;for(let y=72;y<w.height;y+=48)for(let x=72;x<w.width;x+=48){if(!K.worldWater(w,x,y)||K.worldWater(w,x-150,y))continue;const wx=x+420;if(!K.worldWater(w,wx,y))continue;const d=Math.hypot(x-a.x,y-a.y);if(d<bd){bd=d;best={x,y,wx}}}if(!best)return null;a.x=best.x-90;a.y=best.y;a.path=[];sim.order([a],{type:'move',x:best.wx,y:best.y});sim.state.fogEnabled=false;sim.state.units=sim.state.units.filter(u=>!(u.team!==undefined&&sim.sea(u)&&Math.hypot(u.x-best.wx,u.y-best.y)<500));return best});
  if(water){await p.waitForFunction(()=>window.__api.getSim().state.units.find(u=>u.kind==='ant')?.swimming,null,{timeout:20000});await waitSim(4);report.swim=await p.evaluate(b=>{const a=window.__api.getSim().state.units.find(u=>u.kind==='ant');return{target:b,at:{x:Math.round(a.x),y:Math.round(a.y)},swimming:a.swimming,order:a.order?.type||null}},water);await shot('ant-swim.png','游泳：下半身被水面遮住、轻微起伏、透明涟漪')}
  // sleep: back on land, idle long enough
  await p.evaluate(()=>{const sim=window.__api.getSim(),s=sim.state,a=s.units.find(u=>u.kind==='ant'),t=s.buildings.find(b=>b.team===0&&b.kind==='town');a.x=t.x+130;a.y=t.y+175;sim.freeSpawn(a);a.order=null;a.path=[];a.swimming=false;a.antEmote=null;a.antIdleSince=s.time-60});
  await p.waitForFunction(()=>window.__api.getSim().state.units.find(u=>u.kind==='ant')?.antSleeping,null,{timeout:20000});await p.evaluate(()=>window.__api.selectIds([]));await waitSim(5);
  await p.evaluate(()=>{const s=window.__api.getSim().state,a=s.units.find(u=>u.kind==='ant');window.__api.focusPoint({x:a.x,y:a.y})});await p.waitForTimeout(300);{const file=path.join(OUT,'ant-sleep.png');await p.screenshot({path:file,clip:{x:340,y:160,width:600,height:400}});report.shots.push({file:path.relative(ROOT,file),note:'闲置后入睡（睡眠循环帧，Zzz）'})}
  // gather: nearest wood / food node
  await p.evaluate(()=>{const sim=window.__api.getSim(),a=sim.state.units.find(u=>u.kind==='ant'),n=sim.nearest(a,sim.resources().filter(n=>n.amount>0&&sim.canGather(a,n)));sim.order([a],{type:'gather',id:n.id,resource:n.resource||n.kind})});
  await p.waitForFunction(()=>window.__api.getSim().state.units.find(u=>u.kind==='ant')?.working,null,{timeout:30000});await waitSim(1);await shot('ant-gather.png','采集（挖掘/采集帧，小负重 4）');
  await p.waitForFunction(()=>{const a=window.__api.getSim().state.units.find(u=>u.kind==='ant');return a?.cargoPhase==='return'&&a.path?.length},null,{timeout:60000});await waitSim(.6);await shot('ant-carry.png','满载 4 单位后搬运回城（搬运帧）');
 }finally{await browser.close();server.close()}
 fs.writeFileSync(path.join(OUT,'shots.json'),JSON.stringify(report,null,1)+'\n');console.log(JSON.stringify(report,null,1))})().catch(e=>{console.error(e);process.exit(1)});
