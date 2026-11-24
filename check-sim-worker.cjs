#!/usr/bin/env node
'use strict';
/* P4 step 4c-1: the simulation worker (public/sim-worker.js, ?simWorker=1) runs the same game as the main thread.
   1. public/sim-worker.js is up to date with src/sim/ and the public/ simulation scripts (esbuild rebuild in memory).
   2. For every standard replay (scripts/replay/fixtures): the main-thread simulation (public/little-ant.js, the page's
      window.KingdomSim) and the bundled worker (Node worker_threads running the real bundle through the same message
      protocol the page uses, steps requested in irregular batches of 1-4 like a varying frame rate) produce the SAME checksum
      sequence (every 20 steps), the same final checksum and the same command results; both equal the recorded checksums.
   3. The frames are complete: a page-side mirror rebuilt only from the frames (state + node deltas, src/sim/frames.js) has the
      worker's checksum at the end, and the worker's own recording replays to the same final state.
   usage: node check-sim-worker.cjs [--quick] */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{Worker}=require('node:worker_threads'),{pathToFileURL}=require('node:url');
const ROOT=__dirname,{buildWorker,WORKER_OUT}=require('./scripts/build-core.cjs'),FIX=path.join(ROOT,'scripts/replay/fixtures');
const quick=process.argv.includes('--quick');
const code=fs.readFileSync(WORKER_OUT,'utf8');assert.equal(code,buildWorker().code,'public/sim-worker.js is stale: run npm run build');
const SHIM=`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;globalThis.postMessage=m=>parentPort.postMessage(m);parentPort.on('message',d=>globalThis.onmessage&&globalThis.onmessage({data:d}));\n`;
function spawn(){const w=new Worker(SHIM+code,{eval:true});const inbox=[],wait=[];w.on('message',m=>{if(wait.length)wait.shift()(m);else inbox.push(m)});w.on('error',e=>{throw e});
  const next=()=>inbox.length?Promise.resolve(inbox.shift()):new Promise(r=>wait.push(r));return {w,next,post:m=>w.postMessage(m)}}
async function main(){
  const {runReplay,prewarm}=await import(pathToFileURL(path.join(ROOT,'src/replay/replay.js')).href),{checksum}=await import(pathToFileURL(path.join(ROOT,'src/core/hash.js')).href);
  const {mergeNodes}=await import(pathToFileURL(path.join(ROOT,'src/sim/frames.js')).href);
  const K=require(path.join(ROOT,'public/little-ant.js'));
  const files=fs.readdirSync(FIX).filter(f=>f.endsWith('.json')).sort().slice(0,quick?2:undefined);let rng=12345;const rand=()=>(rng=(rng*1103515245+12345)>>>0)/4294967296;
  for(const file of files){const fx=JSON.parse(fs.readFileSync(path.join(FIX,file),'utf8')),t0=Date.now();
    // main thread
    const main=runReplay(K,fx,{every:20});assert.equal(main.results.mismatch.length,0,file+': main-thread replay command results differ');
    assert.deepEqual(main.checksums.map(c=>c.hash),fx.checksums.map(c=>c.hash),file+': main-thread replay differs from the recording');
    // worker
    const {w,next,post}=spawn();post({t:'init',difficulty:fx.setup.difficulty,options:JSON.parse(JSON.stringify(fx.setup.options)),saved:null,hashes:20,prewarm:fx.setup.prewarm!==false});
    let m=await next();assert.equal(m.t,'ready',file+': '+JSON.stringify(m).slice(0,300));
    const page=new K.Sim(fx.setup.difficulty,null,JSON.parse(JSON.stringify(fx.setup.options)));assert.equal(m.hash,checksum(page).hash,file+': worker initial state differs from the page');
    let frame=await next();assert.equal(frame.t,'frame');const mirror={s:{...frame.state,world:frame.world,nodes:mergeNodes([],frame.nodes)}};
    const byStep=new Map();for(const c of fx.commands){if(c.dt!==undefined)throw Error(file+': non-standard dt in fixture');if(!byStep.has(c.s))byStep.set(c.s,[]);byStep.get(c.s).push(c)}
    const hashes=[],results=[];let step=0,q=0,bytes=0,frames=0;const v8=require('node:v8');
    while(step<fx.steps){const cmds=(byStep.get(step)||[]).map(c=>({q:++q,m:c.m,a:c.a,want:c.r}));let n=1+Math.floor(rand()*4);for(let k=step+1;k<step+n;k++)if(byStep.has(k)){n=k-step;break}n=Math.min(n,fx.steps-step);
      post({t:'step',n,cmds:cmds.map(({q,m,a})=>({q,m,a}))});frame=await next();if(frame.t==='error')throw Error(file+': worker error '+frame.message);assert.equal(frame.t,'frame');
      for(const [qq,r] of frame.results){const c=cmds.find(c=>c.q===qq);results.push({m:c.m,want:c.want,got:r})}
      hashes.push(...frame.hashes);step+=n;assert.equal(frame.step,step);
      if(frames++%7===0)bytes=Math.max(bytes,v8.serialize(frame).length);
      mirror.s={...frame.state,world:mirror.s.world,nodes:mergeNodes(mirror.s.nodes,frame.nodes)}}
    const workerList=hashes.map(([s,h])=>({step:s,hash:h}));
    assert.deepEqual(workerList,main.checksums,file+': worker checksum sequence differs from the main thread');
    for(const r of results)if(r.want!==undefined)assert.equal(JSON.stringify(r.got),JSON.stringify(r.want),file+': '+r.m+' returned differently in the worker');
    post({t:'checksum',q:++q});m=await next();assert.equal(m.hash,main.final.hash,file+': final checksum differs');assert.equal(checksum(mirror).hash,m.hash,file+': state rebuilt from frames differs from the worker state');
    post({t:'replay',q:++q});m=await next();assert(m.data&&m.data.commands.length===fx.commands.length,file+': worker recording has '+(m.data&&m.data.commands.length)+' commands, fixture '+fx.commands.length);
    const again=runReplay(K,m.data,{every:20});assert.equal(again.final.hash,main.final.hash,file+': the worker recording does not replay to the same state');
    await w.terminate();
    console.log(`  ${file}: ${fx.steps} steps, ${fx.commands.length} commands, ${workerList.length} checksums identical (final ${main.final.hash}); largest frame ${(bytes/1024).toFixed(1)} KiB (v8 serialize), ${Date.now()-t0} ms`)}
  console.log(`PASS sim worker: public/sim-worker.js up to date; ${files.length} replays give identical checksum sequences on the main thread and in the worker (irregular step batches), frames rebuild the exact state, worker recordings replay`);
}
main().catch(e=>{console.error('FAIL',e.stack||e);process.exit(1)});
