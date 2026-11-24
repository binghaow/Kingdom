#!/usr/bin/env node
'use strict';
/* P4 4c-1: size and cost of the simulation worker's frames in the late-game scene (Node; same V8 structured clone as Chromium).
   Scene = scripts/perf/late-game.cjs (four nations x ~110 units on coast_l, AI on, armies advancing on the centre).
   (1) main thread: step time of the page's Sim (public/little-ant.js) for N steps;
   (2) the bundled worker (public/sim-worker.js in worker_threads, the page's message protocol, one step per request):
       worker step time, frame build time, frame bytes (v8.serialize = the structured-clone wire format), the receiving
       thread's decode time (v8.deserialize of the same bytes) and the page-side apply (node merge) time.
   usage: node scripts/perf/worker-frames.cjs [steps=300] [--json out.json] */
const fs=require('node:fs'),path=require('node:path'),v8=require('node:v8'),{Worker}=require('node:worker_threads'),{pathToFileURL}=require('node:url');
const ROOT=path.resolve(__dirname,'../..'),argv=process.argv.slice(2),steps=+(argv.find(a=>/^\d+$/.test(a))||300),jo=argv.indexOf('--json');
const now=()=>Number(process.hrtime.bigint())/1e6,pct=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(s.length*p))]},mean=a=>a.reduce((x,y)=>x+y,0)/Math.max(1,a.length),r2=x=>Math.round(x*100)/100;
const OPTIONS={nations:['britain','france','china','japan'],groups:[1,2,3,4],mapId:'coast_l',seed:9090,fog:true};
/* scene setup, run with (sim, K) on the main thread and inside the worker (same code, same result) */
const SCENE=`const kinds=['infantry','archer','musketeer','cavalry','halberd','pikeman','longbow','villager'];const towns=[0,1,2,3].map(t=>sim.s.buildings.find(b=>b.team===t&&b.kind==='town'));
for(let t=0;t<4;t++){if(!towns[t])continue;let have=sim.s.units.filter(u=>u.team===t).length;for(let i=0;have<110;i++,have++){const a=i*.61,r=150+(i*37)%330;let u;try{u=sim.add(kinds[i%kinds.length],t,towns[t].x+Math.cos(a)*r,towns[t].y+Math.sin(a)*r)}catch(e){continue}sim.freeSpawn&&sim.freeSpawn(u)}}
const live=towns.filter(Boolean),mid={x:live.reduce((a,b)=>a+b.x,0)/live.length,y:live.reduce((a,b)=>a+b.y,0)/live.length};
for(let t=0;t<4;t++){const army=sim.s.units.filter(u=>u.team===t&&u.kind!=='villager'&&K.defs[u.kind].damage>0&&!(sim.sea&&sim.sea(u))&&!(sim.air&&sim.air(u)));sim.order(army.filter((_,i)=>i%3!==2),{type:'advance',x:mid.x+(t-1.5)*60,y:mid.y})}
return sim.s.units.length;`;
async function main(){
  const K=require(path.join(ROOT,'public/little-ant.js')),{prewarm}=await import(pathToFileURL(path.join(ROOT,'src/replay/replay.js')).href),{mergeNodes,restorePaths}=await import(pathToFileURL(path.join(ROOT,'src/sim/frames.js')).href),{checksum}=await import(pathToFileURL(path.join(ROOT,'src/core/hash.js')).href);
  // (1) main thread
  const sim=new K.Sim('normal',null,JSON.parse(JSON.stringify(OPTIONS)));prewarm(sim);const units=new Function('sim','K',SCENE)(sim,K);const mainMs=[];
  for(let i=0;i<steps;i++){const t=now();sim.tick(.05);mainMs.push(now()-t)}const mainHash=checksum(sim).hash;
  // (2) worker
  const code=fs.readFileSync(path.join(ROOT,'public/sim-worker.js'),'utf8'),SHIM=`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;globalThis.postMessage=m=>parentPort.postMessage(m);parentPort.on('message',d=>globalThis.onmessage&&globalThis.onmessage({data:d}));\n`;
  const w=new Worker(SHIM+code,{eval:true}),inbox=[],wait=[];w.on('message',m=>{if(wait.length)wait.shift()(m);else inbox.push(m)});const next=()=>inbox.length?Promise.resolve(inbox.shift()):new Promise(r=>wait.push(r));
  w.postMessage({t:'init',difficulty:'normal',options:JSON.parse(JSON.stringify(OPTIONS)),saved:null});await next();let f=await next();
  w.postMessage({t:'eval',q:1,src:SCENE});const ev=await next();if(ev.t!=='eval')throw Error(JSON.stringify(ev).slice(0,300));
  let mirror={s:{...f.state,world:f.world,nodes:mergeNodes([],f.nodes)}};w.postMessage({t:'step',n:0,cmds:[]});f=await next();mirror.s={...f.state,world:mirror.s.world,nodes:mergeNodes(mirror.s.nodes,f.nodes)};restorePaths(mirror.s.units);
  const bytes=[],decode=[],apply=[],tick=[],build=[],nodeCounts=[],fogFrames=[];let last=f.stats;
  for(let i=0;i<steps;i++){w.postMessage({t:'step',n:1,cmds:[]});f=await next();
    const buf=v8.serialize(f);bytes.push(buf.length);let t=now();v8.deserialize(buf);decode.push(now()-t);
    t=now();mirror.s={...f.state,world:mirror.s.world,nodes:mergeNodes(mirror.s.nodes,f.nodes)};restorePaths(mirror.s.units);apply.push(now()-t);
    tick.push(f.stats.tickMs-last.tickMs);build.push(f.stats.frameMs-last.frameMs);last=f.stats;nodeCounts.push(f.nodes.changed.length);if(f.fog)fogFrames.push(i)}
  // build time of the frame just posted is counted in the NEXT frame's stats: shift by one
  build.shift();
  w.postMessage({t:'checksum',q:2});const cs=await next();await w.terminate();
  const part=k=>v8.serialize(f.state[k]).length;
  const res={steps,units,main:{tickMean:r2(mean(mainMs)),tickP95:r2(pct(mainMs,.95)),hash:mainHash},
    worker:{tickMean:r2(mean(tick)),tickP95:r2(pct(tick,.95)),frameBuildMean:r2(mean(build)),frameBuildP95:r2(pct(build,.95)),hash:cs.hash,mirrorHash:checksum(mirror).hash},
    frame:{bytesMean:Math.round(mean(bytes)),bytesP95:pct(bytes,.95),bytesMax:Math.max(...bytes),kbPerSecondAt20:Math.round(mean(bytes)*20/1024),decodeMean:r2(mean(decode)),decodeP95:r2(pct(decode,.95)),applyMean:r2(mean(apply)),applyP95:r2(pct(apply,.95)),
      nodesChangedMean:Math.round(mean(nodeCounts)),fogFramesShare:r2(fogFrames.length/steps),parts:{units:part('units'),buildings:part('buildings'),effects:part('effects'),tech:part('tech')}}};
  res.same=res.main.hash===res.worker.hash&&res.worker.hash===res.worker.mirrorHash;
  if(jo>=0)fs.writeFileSync(argv[jo+1],JSON.stringify(res,null,1));console.log(JSON.stringify(res,null,1));if(!res.same){console.error('FAIL main / worker / mirror checksums differ');process.exit(1)}}
main().catch(e=>{console.error(e);process.exit(1)});
