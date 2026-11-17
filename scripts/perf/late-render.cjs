#!/usr/bin/env node
'use strict';
/* Late-game browser scene (v44): the REAL game in headless Chromium at 1920x1080 (32-inch desktop class window), four nations
   (player + 3 AI, separate teams) on coast_l with AI on, about 110 units per nation. Each nation keeps its villagers at home and
   sends about 70 soldiers into one battle 350 px from the player's town, inside the camera view, so four armies fight on screen.
   Measures, after warm-up: rAF frame interval p50/p95, sim.tick ms p50/p95, the ?perf=1 HUD render/scene times, and per-frame
   Canvas counters (drawImage, save, getImageData). Optional --profile <file> writes a CPU profile and prints the self-time top.
   headless --disable-gpu (Skia software raster, shared CPU): numbers compare commits on this machine, they are not a device frame rate.
   usage: node scripts/perf/late-render.cjs [--secs 10] [--json out.json] [--profile out.cpuprofile] [--shot out.png] */
const fs=require('node:fs'),path=require('node:path');
const ROOT=process.env.KINGDOM_ROOT||path.resolve(__dirname,'../..');
process.env.KINGDOM_ROOT=ROOT;
const {serve}=require(path.join(__dirname,'../release/render-cost.cjs'));
const {pct,median,r1,args}=require(path.join(__dirname,'../release/lib.cjs'));
async function run({secs=10,profile,shot,warm=4,stacks:stacksMode=false}={}){let chromium;try{({chromium}=require('playwright'))}catch(e){return {skipped:'playwright not available: '+e.message}}
  const server=await serve(),browser=await chromium.launch({args:['--disable-gpu'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
  const ctx=await browser.newContext({viewport:{width:1920,height:1080}}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  try{await p.goto(`http://127.0.0.1:${server.address().port}/?perf=1`);await p.waitForFunction(()=>window.KingdomArt&&KingdomArt.loaded,null,{timeout:120000});
    await p.evaluate(()=>{const P=KingdomSim.Sim.prototype,t=P.tick;window.__simMs=[];P.tick=function(...a){window.__lateSim=this;const t0=performance.now();const r=t.apply(this,a);window.__simMs.push(performance.now()-t0);return r}});
    await p.evaluate(()=>{const set=(id,v)=>{const e=document.getElementById(id);if(!e)return;if(e.tagName==='SELECT'&&![...e.options].some(o=>o.value===String(v))){const o=document.createElement('option');o.value=String(v);o.textContent=String(v);e.append(o)}e.value=String(v);e.dispatchEvent(new Event('change',{bubbles:true}))};
      set('ai-count',3);for(const t of [1,2,3])set('ai-group-'+t,t+1);set('world-map','coast_l')});
    await p.click('#start');await p.waitForFunction(()=>!!window.__lateSim,null,{timeout:30000});await p.waitForTimeout(500);
    const setup=await p.evaluate(()=>{const sim=window.__lateSim,s=sim.s,D=KingdomSim.defs,soldiers=['infantry','archer','musketeer','cavalry','halberd','pikeman','longbow'];
      const towns=s.nations.map((_,t)=>s.buildings.find(b=>b.team===t&&b.kind==='town'));const home=towns[0],cx=s.world?s.world.width/2:home.x,cy=s.world?s.world.height/2:home.y,d=Math.hypot(cx-home.x,cy-home.y)||1;
      const bx=home.x+(cx-home.x)/d*350,by=home.y+(cy-home.y)/d*350;let made=0;for(const t of towns)if(t){t.hp=t.maxhp=t.maxhp*500}/* keep every nation alive for the whole sample: a fallen town ends the match */
      towns.forEach((town,t)=>{if(!town)return;let have=s.units.filter(u=>u.team===t).length;const ang=t*Math.PI/2+Math.PI/4;
        for(let i=0;have<110;i++,have++){let x,y,kind;if(i<38){kind='villager';x=town.x+Math.cos(i*.7)*(150+(i*37)%200);y=town.y+Math.sin(i*.7)*(150+(i*37)%200)}else{const j=i-38,row=Math.floor(j/10),col=j%10;kind=soldiers[j%soldiers.length];
          x=bx+Math.cos(ang)*(230+row*30)+Math.cos(ang+Math.PI/2)*(col-4.5)*30;y=by+Math.sin(ang)*(230+row*30)+Math.sin(ang+Math.PI/2)*(col-4.5)*30}
          try{const u=sim.add(kind,t,x,y);sim.freeSpawn?.(u);if(kind!=='villager')u.hp=u.maxhp=u.maxhp*6;made++}catch(e){}}
        const army=s.units.filter(u=>u.team===t&&u.kind!=='villager'&&D[u.kind].damage>0&&!sim.sea?.(u)&&!sim.air?.(u)&&Math.hypot(u.x-bx,u.y-by)<700);sim.order(army,{type:'advance',x:bx,y:by})});
      sim.grid=null;sim._gateGrids=null;return {made,units:s.units.length,towns:towns.filter(Boolean).length,battle:{x:Math.round(bx),y:Math.round(by)},camera:window.frontier.camera}});
    await p.waitForFunction(()=>!(KingdomArt.attackStatus?.().pending>0),null,{timeout:120000,polling:250}).catch(()=>{});await p.waitForTimeout(warm*1000);
    let cdp;if(profile){cdp=await ctx.newCDPSession(p);await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:200});await cdp.send('Profiler.start')}
    if(stacksMode)await p.evaluate(()=>{window.__lateStacks=true});const sample=await p.evaluate(({secs})=>new Promise(done=>{window.__simMs.length=0;const P=CanvasRenderingContext2D.prototype,orig={drawImage:P.drawImage,save:P.save,getImageData:P.getImageData},n={drawImage:0,save:0,getImageData:0};
      const stacks={};for(const k of Object.keys(orig))P[k]=function(...a){n[k]++;if(window.__lateStacks&&n[k]%7===0){const f=(new Error().stack||'').split('\n').slice(2,4).map(l=>l.trim().replace(/^at /,'').replace(/https?:\/\/[^/]+\//,'').replace(/\)$/,'')).join(' < ');const key=k+' '+f;stacks[key]=(stacks[key]||0)+7}return orig[k].apply(this,a)};window.__lateStackOut=stacks;const t=[],per={drawImage:[],save:[],getImageData:[]};let start=0;
      function f(now){if(start)for(const k in n)per[k].push(n[k]);for(const k in n)n[k]=0;if(!start)start=now;t.push(now);if(now-start<secs*1000)requestAnimationFrame(f);else{Object.assign(P,orig);done({t,per,sim:window.__simMs.slice(),stacks:Object.entries(stacks).sort((a,b)=>b[1]-a[1]).slice(0,30)})}}requestAnimationFrame(f)}),{secs});
    let top=null;if(profile){const {profile:pr}=await cdp.send('Profiler.stop');fs.writeFileSync(profile,JSON.stringify(pr));const by={},self={};let total=0;for(const nd of pr.nodes)by[nd.id]=nd;pr.samples.forEach((id,i)=>{const nd=by[id],k=(nd.callFrame.functionName||'(anon)')+' '+path.basename(nd.callFrame.url||'')+':'+(nd.callFrame.lineNumber+1),d=pr.timeDeltas[i]||0;self[k]=(self[k]||0)+d;total+=d});top=Object.entries(self).sort((a,b)=>b[1]-a[1]).slice(0,25).map(([k,v])=>`${(v/total*100).toFixed(1)}% ${k}`)}
    const hud=await p.evaluate(()=>document.getElementById('performance-audit')?.textContent||'');if(shot)await p.screenshot({path:shot});
    const g=re=>{const m=hud.match(re);return m?m.slice(1).map(Number):[]},iv=[];for(let i=1;i<sample.t.length;i++)iv.push(sample.t[i]-sample.t[i-1]);
    const alive=await p.evaluate(()=>{const s=window.__lateSim.s;const st=KingdomArt.attackStatus?.();return {alive:s.units.filter(u=>u.hp>0).length,dpr:window.FrontierRenderBudget?.dpr??null,attack:st&&{sets:st.loaded.length,mb:Math.round(st.bytes/1048576),limitMb:Math.round(st.limit/1048576),tints:st.tints}}});
    return {viewport:'1920x1080',setup,unitsAlive:alive.alive,renderDpr:alive.dpr,attackCache:alive.attack,frames:iv.length,fps:r1(1000/(median(iv)||1)),frameP50:r1(pct(iv,.5)),frameP95:r1(pct(iv,.95)),
      simSteps:sample.sim.length,simP50:r1(pct(sample.sim,.5)),simP95:r1(pct(sample.sim,.95)),drawImagePerFrame:median(sample.per.drawImage),savePerFrame:median(sample.per.save),getImageDataPerFrame:median(sample.per.getImageData),
      hudRender:g(/render ([\d.]+)\/([\d.]+)/),hudScene:g(/scene ([\d.]+)\/([\d.]+)/),hudUpdate:g(/update ([\d.]+)\/([\d.]+)/),hud:hud.replace(/\s+/g,' ').slice(0,600),errors,top,...(stacksMode?{stacks:sample.stacks.map(([k,v])=>`${Math.round(v/Math.max(1,iv.length))}/frame ${k}`)}:{})}}
  finally{await browser.close();server.close()}}
module.exports={run};
if(require.main===module){const a=args();run({secs:+(a.secs||10),profile:a.profile,shot:a.shot,stacks:!!a.stacks}).then(r=>{if(a.json)fs.writeFileSync(a.json,JSON.stringify(r,null,1));console.log(JSON.stringify(r,null,1))}).catch(e=>{console.error(e);process.exit(1)})}
