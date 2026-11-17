#!/usr/bin/env node
'use strict';
/* P2: how many source pixels of each atlas actually reach the screen. Runs the REAL game in headless Chromium, spawns a "zoo"
   (every unit kind for two teams, side by side so they fight and play attack frames, plus every building kind and every nation),
   pans the camera over it and records every drawImage:
     - an <img> from assets/ is a root; a canvas drawn from it inherits (root, cumulative scale, min scale along the path);
     - a draw onto the visible game canvas records, per root, the screen scale divided by the camera zoom x render DPR in effect
       ("k": source px needed per device px at zoom 1, DPR 1) and the cap "m" (smallest cumulative scale on the path: an offscreen
       cut that already downsamples to e.g. 256 px means more source pixels can never reach the screen).
   The pipeline then sizes each atlas to  need = min(1, max over paths of min(m, k x ZOOM x DPR))  with ZOOM/DPR the design limits.
   Roots used through createPattern or toDataURL, or CSS/HTML, are recorded as needing full size (we do not track those paths).
   Output: scripts/art/draw-sizes.json (checked in; re-run after art or renderer changes).
   usage: node scripts/art/measure-draw-sizes.cjs [--out file] [--secs 3] */
const fs=require('node:fs'),path=require('node:path');
const ROOT=process.env.KINGDOM_ROOT||path.resolve(__dirname,'../..');process.env.KINGDOM_ROOT=ROOT;
const {serve}=require(path.join(ROOT,'scripts/release/render-cost.cjs'));
const {args}=require(path.join(ROOT,'scripts/release/lib.cjs'));
const HOOK=`(()=>{const prov=new WeakMap(),need={},key=s=>String(s).replace(/^.*?assets\\//,'').replace(/[?#].*$/,'');
  const rootOf=img=>img instanceof HTMLImageElement&&/assets\\//.test(img.src)?key(img.src):null;
  const note=(root,m,k,via)=>{const n=need[root]||(need[root]={m:0,k:0,full:false,draws:0,via:{}});n.draws++;if(m>n.m)n.m=m;if(k>n.k)n.k=k;if(via)n.via[via]=(n.via[via]||0)+1};
  const scaleOf=g=>{const t=g.getTransform();return Math.sqrt(Math.abs(t.a*t.d-t.b*t.c))||1};
  const P=CanvasRenderingContext2D.prototype,draw=P.drawImage;
  P.drawImage=function(src,...a){try{let sw,sh,dw,dh;const W=src.naturalWidth||src.width,H=src.naturalHeight||src.height;
      if(a.length===2){sw=W;sh=H;dw=W;dh=H}else if(a.length===4){sw=W;sh=H;dw=a[2];dh=a[3]}else{sw=a[2];sh=a[3];dw=a[6];dh=a[7]}
      const r=Math.max(Math.abs(dw)/Math.max(1,Math.abs(sw)),Math.abs(dh)/Math.max(1,Math.abs(sh)))*scaleOf(this),dst=this.canvas,screen=dst.isConnected&&dst.width*dst.height>2e5;
      const ins=[];const root=rootOf(src);if(root)ins.push([root,1,1]);else{const p=prov.get(src);if(p)for(const [k,v] of p)ins.push([k,v[0],v[1]])}
      if(ins.length){if(screen){const zd=(window.frontier?.camera?.z||1)*(window.FrontierRenderBudget?.dpr||devicePixelRatio||1);for(const [k,prod,mn] of ins)note(k,mn,prod*r/zd,null)}
        else{let p=prov.get(dst);if(!p)prov.set(dst,p=new Map());for(const [k,prod,mn] of ins){const np=prod*r,nm=Math.min(mn,np),o=p.get(k);p.set(k,o?[Math.max(o[0],np),Math.max(o[1],nm)]:[np,nm])}}}}catch(e){}
    return draw.call(this,src,...a)};
  /* pixels also travel getImageData -> putImageData (often into a new canvas): carry the provenance with the ImageData */
  const dataProv=new WeakMap(),gid=P.getImageData,pid=P.putImageData;P.getImageData=function(...a){const d=gid.apply(this,a);const p=prov.get(this.canvas);if(p)dataProv.set(d,new Map(p));return d};
  P.putImageData=function(d,...a){const p=dataProv.get(d);if(p&&this.canvas){let q=prov.get(this.canvas);if(!q)prov.set(this.canvas,q=new Map());for(const [k,v] of p){const o=q.get(k);q.set(k,o?[Math.max(o[0],v[0]),Math.max(o[1],v[1])]:v)}}return pid.call(this,d,...a)};
  const full=(src,via)=>{const root=rootOf(src);const list=root?[root]:[...(prov.get(src)?.keys()||[])];for(const k of list){note(k,1,0,via);need[k].full=true}};
  const pat=P.createPattern;P.createPattern=function(src,...a){full(src,'pattern');return pat.call(this,src,...a)};
  const url=HTMLCanvasElement.prototype.toDataURL;HTMLCanvasElement.prototype.toDataURL=function(...a){const p=prov.get(this);if(p)for(const [k,v] of p)note(k,Math.min(1,v[1]),0,'dataURL');return url.apply(this,a)};
  window.__drawNeed=()=>need})();`;
/* attack-art.js decode(): the frame cap (px) per action atlas, from the same defs the game uses */
const LIMITS=async()=>{const D=KingdomSim.defs,m=await fetch('attack-manifest.json').then(r=>r.json()),o={};for(const e of m.entries)o[e.source.replace(/^.*assets\//,'')]=D[e.kind]?.monster?224:D[e.kind]?.domain||D[e.kind]?.role==='cannon'?192:160;return o};
async function run({out=path.join(ROOT,'scripts/art/draw-sizes.json'),secs=3}={}){const {chromium}=require('playwright');const server=await serve(),port=server.address().port;
  const browser=await chromium.launch({args:['--disable-gpu'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
  try{const ctx=await browser.newContext({viewport:{width:1280,height:800}}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(HOOK);
    await p.goto(`http://127.0.0.1:${port}/`);await p.waitForFunction(()=>window.KingdomArt&&KingdomArt.loaded,null,{timeout:300000});
    await p.evaluate(()=>{const P=KingdomSim.Sim.prototype,t=P.tick;P.tick=function(...a){window.__zooSim=this;return t.apply(this,a)}});
    await p.click('#start');await p.waitForFunction(()=>!!window.__zooSim,null,{timeout:60000});await p.waitForTimeout(800);
    const plan=await p.evaluate(()=>{const D=KingdomSim.defs;return {units:Object.keys(D).filter(k=>D[k].speed>0),blds:Object.keys(D).filter(k=>!(D[k].speed>0))}});
    /* the camera is not scriptable from outside, so batches of subjects are brought to the camera centre instead */
    const batch=(kinds,building,z)=>p.evaluate(([kinds,building])=>{const sim=window.__zooSim,s=sim.s,c=window.frontier.camera;for(const u of window.__zoo||[]){u.x=-9000;u.y=-9000}window.__zoo=[];let made=0;
      kinds.forEach((kind,i)=>{const cols=building?3:6,dx=building?230:85,dy=building?200:100,x=c.x+((i%cols)-(cols-1)/2)*dx,y=c.y+(Math.floor(i/cols)-.5)*dy;
        for(const t of building?[0]:[0,1])try{const u=sim.add(kind,t,x+(building?0:t?20:-20),y);sim.freeSpawn?.(u);u.hp=u.maxhp=u.maxhp*50;if(building){u.complete=true;u.progress=1}window.__zoo.push(u);made++}catch(e){}});return made},[kinds,building]);
    let made=0;for(const z of [0,1]){if(z){for(let i=0;i<5;i++){await p.click('#zoomin').catch(()=>{});await p.waitForTimeout(80)}}
      for(let i=0;i<plan.units.length;i+=12){made+=await batch(plan.units.slice(i,i+12),false);await p.waitForTimeout(secs*700)}
      for(let i=0;i<plan.blds.length;i+=6){made+=await batch(plan.blds.slice(i,i+6),true);await p.waitForTimeout(secs*300)}}
    await batch([],false);plan.made=made;plan.units=plan.units.length;plan.buildings=plan.blds.length;delete plan.blds;
    const need=await p.evaluate(()=>window.__drawNeed()),loaded=await p.evaluate(()=>[...new Set(performance.getEntriesByType('resource').map(e=>e.name).filter(n=>/assets\/.*\.(png|jpg|webp)/.test(n)).map(n=>n.replace(/^.*?assets\//,'').replace(/[?#].*$/,'')))].sort());const attackLimits=await p.evaluate(LIMITS);const result={attackLimits,generated:new Date().toISOString().slice(0,10),method:'scripts/art/measure-draw-sizes.cjs',plan:{units:plan.units,buildings:plan.buildings,made:plan.made},errors:errors.slice(0,5),loaded,unreached:loaded.filter(k=>!need[k]),need};
    fs.writeFileSync(out,JSON.stringify(result,null,1));return result}
  finally{await browser.close();server.close()}}
module.exports={run};
if(require.main===module){const a=args();run({out:a.out,secs:+(a.secs||3)}).then(r=>{for(const [k,v] of Object.entries(r.need).sort())console.log(k.padEnd(40),'m',v.m.toFixed(2),'k',v.k.toFixed(3),v.full?'FULL':'',JSON.stringify(v.via));console.log('unreached',r.unreached.join(' '));console.log(Object.keys(r.need).length,'roots',JSON.stringify(r.plan),r.errors)}).catch(e=>{console.error(e);process.exit(1)})}
