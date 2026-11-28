'use strict';
const assert=require('node:assert/strict');
(async()=>{
 const F=await import('./src/sim/frames.js'),{createSimWorker}=await import('./src/sim/client.js'),{checksum}=await import('./src/core/hash.js');
 let failures=0;
 async function test(name,fn){try{await fn();console.log('PASS '+name)}catch(e){failures++;console.error('FAIL '+name+': '+e.message)}}
 const stub=units=>({s:{world:{},time:0,units,buildings:[],nodes:[]},events:[]});
 await test('delta accepts truthy scalar -> nested object',()=>{const sim=stub([{id:1,kind:'villager',value:1,path:[]}]),src=F.createFrameSource();F.buildFrame(sim,src,0);sim.s.units[0].value={x:2};assert.doesNotThrow(()=>F.buildFrame(sim,src,1))});
 await test('delta detects delete plus add with same key count',()=>{const sim=stub([{id:1,kind:'villager',before:1,path:[]}]),src=F.createFrameSource(),mirror=F.createFrameMirror();F.applyFrameState(mirror,structuredClone(F.buildFrame(sim,src,0)));delete sim.s.units[0].before;sim.s.units[0].after=2;const s=F.applyFrameState(mirror,structuredClone(F.buildFrame(sim,src,1)));assert(!('before'in s.units[0]));assert.equal(s.units[0].after,2)});
 await test('real spell prediction cannot dirty unchanged authoritative cooldown',()=>{
  const K=require('./public/little-ant.js'),master=new K.Sim('easy');
  const hero=master.add('hero_britain',0,master.s.units[0].x,master.s.units[0].y);hero.mana=100;hero.spellCooldowns={};master.s.loot[0]={chosen:'book'};
  const page=new K.Sim('easy');page.s=structuredClone(master.s);
  let worker;class W{constructor(){worker=this}postMessage(){}terminate(){}}
  const root={Worker:W,performance:{now:()=>100},KingdomSim:K};const api=createSimWorker(root,{getK:()=>K});api.adopt(page,{difficulty:'easy'});
  const src=F.createFrameSource(),initial=structuredClone(F.buildFrame(master,src,0));initial.init=true;
  worker.onmessage({data:initial});worker.onmessage({data:{t:'ready',hash:checksum(page).hash}});api.pump(100);
  const answer=page.castSpell(page.byId(hero.id),'ward');assert.match(answer,/已施放/);assert(page.byId(hero.id).spellCooldowns.ward>0);
  // No authoritative spell happened. A rejection/unchanged next frame must remove speculative cooldowns.
  worker.onmessage({data:structuredClone(F.buildFrame(master,src,1))});api.pump(150);
  try{assert.deepEqual(page.byId(hero.id).spellCooldowns,{})}finally{api.release()}
 });
 const {startWorkerLockstep}=await import('./src/net/worker-lockstep.js'),{makeSave}=await import('./src/net/saves.js');
 async function driver(){let worker;const oldFetch=global.fetch;global.fetch=async()=>({ok:true,text:async()=>JSON.stringify({n:0,t:[],se:-1})});
  class W{constructor(){worker=this}postMessage(m){if(m.t==='lsInit')queueMicrotask(()=>this.onmessage({data:{t:'lsReady',nextTurn:0,step:0,hash:'00000000'}}));if(m.t==='lsChecksum')queueMicrotask(()=>this.onmessage({data:{t:'lsChecksum',q:m.q,turn:10,step:20,hash:'aaaaaaaa',aiSeats:[],logFrom:0}}))}terminate(){}}
  const room={id:'test',players:[],config:{},lockstep:{setup:{options:{}},seats:[{seat:0,team:0}],startAt:0,period:100}};
  const root={Worker:W,performance:{timeOrigin:0,now:()=>0},location:{search:'',protocol:'http:',host:'localhost'}};
  const d=startWorkerLockstep(root,{room,seat:0,token:'test',onView(){},onError(){}});await Promise.resolve();
  const frame=(turn,hash)=>worker.onmessage({data:{t:'lsFrame',nextTurn:turn,step:turn*2,aiSeats:[],aiTeams:[],rejected:0,n:0,simMs:0,hashes:hash?[[turn*2,hash]]:[],checkpoint:hash?{turn,step:turn*2,hash,aiSeats:[],logFrom:0}:null}});
  frame(10,'aaaaaaaa');return {d,room,worker,frame,close(){d.stop();global.fetch=oldFetch}};
 }
 await test('save checkpoint survives asynchronous relay recording fetch',async()=>{const x=await driver();try{const point=await x.d.prepareSave();x.frame(11);const save=makeSave(point.checkpoint||x.d.client,x.room);assert.equal(save.turns,10);assert.equal(save.step,20);assert.equal(save.hash,'aaaaaaaa')}finally{x.close()}});
 await test('unprepared worker save uses an exact verified checkpoint',async()=>{const x=await driver();try{x.frame(11);const save=makeSave(x.d.client,x.room);assert.equal(save.turns,10);assert.equal(save.step,20);assert.equal(save.hash,'aaaaaaaa')}finally{x.close()}});
 await test('fatal worker error settles pending RPCs and stops transport',async()=>{const x=await driver();try{x.worker.postMessage=()=>{};const pending=x.d.prepareSave();await Promise.resolve();await Promise.resolve();x.worker.onerror({message:'test crash',preventDefault(){}});const state=await Promise.race([pending.then(()=> 'resolved',()=> 'rejected'),new Promise(r=>setTimeout(()=>r('hung'),100))]);assert.equal(state,'rejected');assert.equal(x.d.stopped,true)}finally{x.close()}});
 if(failures)process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1});
