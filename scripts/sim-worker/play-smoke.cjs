#!/usr/bin/env node
'use strict';
/* P4 4c-1: play a single-player game with ?simWorker=1 in headless Chromium (the real page, real Web Worker) through the same
   Sim entry points the HUD buttons call: debug mode (single-player cheat: free resources, ~1 s build/train/research), build a
   barracks, train soldiers, age up, summon the little ant and the red panda easter eggs, attack, pause (save), reload and
   continue the saved game in the worker. Also replays a standard recording inside the browser worker and compares checksums
   with the recording. Fails on page errors, a fallback to the main thread, or anything not happening.
   usage: node scripts/sim-worker/play-smoke.cjs [--json out.json] [--headed] */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ROOT=process.env.KINGDOM_ROOT||path.resolve(__dirname,'../..');process.env.KINGDOM_ROOT=ROOT;
const {serve}=require(path.join(ROOT,'scripts/release/render-cost.cjs'));
const HOOK=()=>{let v;Object.defineProperty(window,'NavalUI',{configurable:true,get(){return v},set(x){const b=x.bind;x.bind=a=>{window.__api=a;return b.call(x,a)};v=x}})};
async function run({headed=false}={}){const {chromium}=require('playwright');
  const server=await serve(),port=server.address().port,browser=await chromium.launch({headless:!headed,args:['--disable-gpu'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
  const ctx=await browser.newContext({viewport:{width:1280,height:720}}),p=await ctx.newPage(),errors=[],log=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='warning'||m.type()==='error')log.push(m.text())});
  await ctx.addInitScript(HOOK);const out={steps:[]},note=(k,v)=>{out.steps.push([k,v]);console.log('  '+k+': '+JSON.stringify(v))};
  const until=async(fn,arg,ms=30000)=>p.waitForFunction(fn,arg,{timeout:ms,polling:100});
  try{
    await p.goto(`http://127.0.0.1:${port}/?simWorker=1`);await until(()=>window.KingdomArt&&KingdomArt.loaded&&!document.getElementById('start').disabled,null,120000);
    await p.evaluate(()=>{try{localStorage.clear()}catch{}});
    await p.click('#start');await until(()=>{const W=KingdomCore.simWorker,sim=window.__api?.getSim();return W&&W.owns(sim)&&W.ready&&W.stats.frames>5});
    note('worker owns the game',await p.evaluate(()=>({frames:KingdomCore.simWorker.stats.frames,time:+window.frontier.state.time.toFixed(2)})));
    const r=await p.evaluate(()=>{const sim=__api.getSim(),s=sim.state,town=s.buildings.find(b=>b.team===0&&b.kind==='town'),vills=s.units.filter(u=>u.team===0&&u.kind==='villager');
      const spot=kind=>{for(let r=200;r<760;r+=40)for(let k=0;k<16;k++){const a=k*Math.PI/8+r/97,x=town.x+Math.cos(a)*r,y=town.y+Math.sin(a)*r;if(!sim.placementError(kind,x,y,0))return {x,y}}return null};
      const debug=sim.sendChat('debug'),p=spot('barracks'),built=p&&sim.construct('barracks',p.x,p.y,vills.slice(0,3),0);
      return {debug:String(debug?.text||debug||''),built:built&&(built.error||'building '+built.building?.id),spot:p}});
    note('debug + construct barracks',r);
    await until(()=>__api.getSim().state.buildings.some(b=>b.team===0&&b.kind==='barracks'&&b.complete),null,40000);note('barracks complete',await p.evaluate(()=>+frontier.state.time.toFixed(1)));
    const t=await p.evaluate(()=>{const sim=__api.getSim(),s=sim.state,b=s.buildings.find(b=>b.team===0&&b.kind==='barracks'&&b.complete),town=s.buildings.find(b=>b.team===0&&b.kind==='town');
      const kind=(sim.trainOptions?sim.trainOptions(b):KingdomSim.defs.barracks.trains).find(k=>!sim.unitError(b,k))||'infantry';const r=[];for(let i=0;i<3;i++)r.push(sim.train(b,kind));r.push(sim.research(town,'age'));return {kind,results:r,age:s.ages[0]}});
    note('train ×3 + age up',t);
    await until(k=>__api.getSim().state.units.filter(u=>u.team===0&&u.kind===k).length>=3&&__api.getSim().state.ages[0]>=2,t.kind,40000);
    note('trained and aged',await p.evaluate(k=>({soldiers:frontier.state.units.filter(u=>u.team===0&&u.kind===k).length,age:frontier.state.ages[0]}),t.kind));
    await p.evaluate(()=>{const sim=__api.getSim();sim.sendChat('小蚂蚁');sim.sendChat('小熊猫')});
    await until(()=>['ant','panda'].every(k=>frontier.state.units.some(u=>u.team===0&&u.kind===k&&u.hp>0)),null,15000);note('little ant + red panda summoned','ok');
    const a=await p.evaluate(()=>{const sim=__api.getSim(),s=sim.state,D=KingdomSim.defs,army=s.units.filter(u=>u.team===0&&u.hp>0&&u.kind!=='villager'&&u.kind!=='ant'&&D[u.kind].damage>0),c={x:army.reduce((n,u)=>n+u.x,0)/army.length,y:army.reduce((n,u)=>n+u.y,0)/army.length};
      /* test setup: an enemy soldier next to our army (Sim.add is a forwarded entry point, the tutorial uses it) */const foe=sim.add('infantry',1,c.x+90,c.y);sim.freeSpawn?.(foe);const e=foe&&sim.byId(foe.id);
      if(!e)return null;sim.order(army,{type:'attack',id:e.id});return {army:army.length,target:e.id,kind:e.kind,hp:e.hp,team:e.team,dist:Math.round(Math.hypot(e.x-c.x,e.y-c.y))}});
    note('attack ordered',a);assert(a,'no enemy to attack');
    await until(a=>{const e=frontier.state.units.find(u=>u.id===a.target);return e&&e.hp<a.hp||e&&e.hp<=0},a,60000);note('target damaged',await p.evaluate(a=>{const e=frontier.state.units.find(u=>u.id===a.target);return e?{hp:e.hp}:'gone'},a));
    // pause -> save from the worker
    await p.click('#pause');await until(()=>{try{const v=JSON.parse(localStorage.getItem('frontier-kingdom-v7'));return v&&v.state&&v.state.units.some(u=>u.kind==='ant')}catch{return false}},null,10000);
    const saved=await p.evaluate(()=>{const v=JSON.parse(localStorage.getItem('frontier-kingdom-v7'));return {time:+v.state.time.toFixed(2),units:v.state.units.length,live:+frontier.state.time.toFixed(2)}});note('saved on pause',saved);
    const rep=await p.evaluate(async()=>{const d=await KingdomCore.simWorker.replay();return {commands:d.commands.length,steps:d.steps,final:d.final.hash,names:[...new Set(d.commands.map(c=>c.m))]}});note('worker recording',rep);
    const stats=await p.evaluate(()=>{const W=KingdomCore.simWorker;return {frames:W.stats.frames,applyMsMean:+(W.stats.applyMs/W.stats.frames).toFixed(2),maxApplyMs:+W.stats.maxApplyMs.toFixed(1),requests:W.stats.requests,owedDropped:W.stats.owedDropped,mismatches:W.stats.mismatches.length,worker:W.stats.worker,fallback:W.failed}});note('client stats',stats);
    assert(!stats.fallback,'fell back to the main thread: '+stats.fallback);
    // reload: continue the saved game in the worker
    await p.reload();await until(()=>window.KingdomArt&&KingdomArt.loaded&&!document.getElementById('start').disabled,null,120000);
    await p.click('#start');await until(t=>{const W=KingdomCore.simWorker;return W.owns(__api.getSim())&&W.ready&&frontier.state.time>t+2},saved.time,30000);
    note('continued after reload',await p.evaluate(()=>({time:+frontier.state.time.toFixed(2),ant:frontier.state.units.some(u=>u.kind==='ant'),fallback:KingdomCore.simWorker.failed})));
    // a standard recording replayed by the page's worker == the recording
    const fx=JSON.parse(fs.readFileSync(path.join(ROOT,'scripts/replay/fixtures/coast_s-2p.json'),'utf8'));
    const cmp=await p.evaluate(async fx=>{const w=new Worker('sim-worker.js'),q=[],wait=[];w.onmessage=e=>{if(wait.length)wait.shift()(e.data);else q.push(e.data)};const next=()=>q.length?Promise.resolve(q.shift()):new Promise(r=>wait.push(r));
      w.postMessage({t:'init',difficulty:fx.setup.difficulty,options:fx.setup.options,saved:null,hashes:20});await next();await next();const by=new Map();for(const c of fx.commands){if(!by.has(c.s))by.set(c.s,[]);by.get(c.s).push(c)}
      let step=0,hashes=[];while(step<fx.steps){let n=3;for(let k=step+1;k<step+n;k++)if(by.has(k)){n=k-step;break}n=Math.min(n,fx.steps-step);w.postMessage({t:'step',n,cmds:(by.get(step)||[]).map((c,i)=>({q:i,m:c.m,a:c.a}))});const f=await next();hashes.push(...f.hashes);step+=n}
      w.terminate();const want=fx.checksums.map(c=>c.step+':'+c.hash),got=hashes.map(([s,h])=>s+':'+h);return {same:JSON.stringify(want)===JSON.stringify(got),n:got.length,last:got.at(-1)}},fx);
    note('browser worker replays coast_s-2p',cmp);assert(cmp.same,'browser worker checksums differ from the recording');
    assert.equal(errors.length,0,'page errors: '+errors.join(' | '));
    out.errors=errors;out.warnings=log.filter(l=>/simWorker/.test(l));assert.equal(out.warnings.length,0,'warnings: '+out.warnings.join(' | '));out.ok=true;return out}
  finally{await browser.close();server.close()}}
module.exports={run};
if(require.main===module){const a=process.argv.slice(2),j=a.indexOf('--json');run({headed:a.includes('--headed')}).then(r=>{if(j>=0)fs.writeFileSync(a[j+1],JSON.stringify(r,null,1));console.log('PASS simWorker play smoke')}).catch(e=>{console.error('FAIL',e.stack||e);process.exit(1)})}
