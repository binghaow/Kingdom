/* P4 4a: computer players change the simulation only through commands (src/commands/index.js, docs/p4/progress.md).
   1. Purity: around every AI phase (sim.aiScope) the whole state except AI memory (s.ai*, nextThink, nextRaid, raidPulse), the
      command queue and the shared random generator is byte-identical - on a land map and an island map with naval/air AI.
   2. Queue: computer commands are queued in the AI phase and applied at the start of the next step; almost none are rejected.
   3. Validation: a command naming another seat's units / buildings is rejected; a player command (no team) is applied.
   4. Restoring (lockstep / server path) with commands still queued resumes exactly like the uninterrupted game (the queue is state).
   usage: node check-ai-commands.cjs [--long] */
'use strict';
const assert=require('node:assert/strict'),K=require('./public/little-ant.js'),C=require('./public/kingdom-commands.js'),D=K.defs;
const LONG=process.argv.includes('--long'),DT=.1;
const ALLOW=/^(commandQueue|rng|effects|events|ai[A-Z]\w*|nextThink|nextRaid|raidPulse)$/;
function make(map,seed){const s=new K.Sim('expert',null,{nations:['britain','france','prussia'],groups:[1,2,3],mapId:map,fog:true,seed});s.setDifficulty(1,'expert');s.setDifficulty(2,'hard');return s}
function strip(s){const o={};for(const k of Object.keys(s))if(!ALLOW.test(k))o[k]=s[k];return JSON.stringify(o)}

/* 1 + 2 */
for(const [map,seed,sec] of [['lake_s',3,LONG?600:300],['straits',7,LONG?900:420]]){
 const sim=make(map,seed),orig=sim.aiScope;let scopes=0,dirty=[];
 sim.aiScope=function(fn){const before=strip(this.s);const r=orig.call(this,fn);scopes++;if(strip(this.s)!==before&&dirty.length<5)dirty.push({t:Math.round(this.s.time),at:new Error().stack.split('\n')[2].trim()});return r};
 let queuedBefore=0,appliedNext=true;
 for(let i=0;i<sec/DT;i++){const q=sim.s.commandQueue?.length||0;const applied=sim.commandStats.applied;sim.tick(DT);if(q&&sim.commandStats.applied-applied<q)appliedNext=false;queuedBefore+=q}
 const st=sim.commandStats;console.log(`${map} seed ${seed} ${sec} s: AI phases ${scopes}, commands queued ${st.queued}, applied ${st.applied}, rejected at apply ${st.rejected}, state changes outside AI memory ${dirty.length}`);
 assert.deepEqual(dirty,[],'AI phase changed simulation state directly: '+JSON.stringify(dirty));
 assert(st.queued>100,'computers issued commands');assert(appliedNext,'queued commands run at the start of the next step');
 assert(st.rejected<=st.applied*.1,'few computer commands rejected ('+st.rejected+'/'+st.applied+')')}

/* 3 */
{const sim=make('lake_s',4);for(let i=0;i<50;i++)sim.tick(DT);
 const mine=sim.s.units.find(u=>u.team===1&&u.kind==='villager'),theirs=sim.s.units.find(u=>u.team===2&&u.kind==='villager'),town2=sim.s.buildings.find(b=>b.team===2&&b.kind==='town');
 const forged=[C.make(sim,'order',1,[[theirs],{type:'move',x:100,y:100}]),C.make(sim,'train',1,[town2,'villager'])];
 for(const c of forged)assert.match(String(C.applyCommand(sim,c).error),/not owned/,'forged command for another seat is rejected');
 const ok=C.applyCommand(sim,C.make(sim,'order',1,[[mine,theirs],{type:'move',x:mine.x+50,y:mine.y}]));assert.equal(ok?.error,undefined);
 assert.equal(mine.order?.type,'move','own unit obeys');assert.notEqual(theirs.order?.x,mine.x+50,'the other seat\'s unit is dropped from the command');
 const player=C.applyCommand(sim,{type:'order',args:C.make(sim,'order',0,[[theirs],{type:'move',x:theirs.x+40,y:theirs.y}]).args});assert.equal(player?.error,undefined,'a player command (no team) is applied as before');
 assert.throws(()=>sim.aiScope(()=>sim.sendChat('hi')),/not a computer command/,'non-computer entry points are refused in the AI phase');
 console.log('validation: forged commands rejected, own units obey, player commands unchanged')}

/* 4 (the lockstep / server restore path: at a snapshot turn every peer normalizes to networkHydrate(networkPersistent(state)), as
   check-ai-naval-air.cjs section 5). The queue travels with the state: a peer restored from the snapshot continues exactly like the
   peers that normalized, and dropping the queue would change the game. */
{const a=new K.NetworkSim('expert',null,{nations:['britain','france','prussia'],groups:[1,2,3],mapId:'straits',fog:true,seed:5,humanTeams:[0]});let at=-1;
 for(let step=0;step<1600;step++){a.tick(.05);if(step>600&&a.s.commandQueue?.length){at=step;break}}
 assert(at>0,'a step with queued commands was found');const snap=JSON.stringify(K.networkPersistent(a)),queued=JSON.parse(snap).commandQueue.length;
 const peer=K.networkHydrate(JSON.parse(snap)),restored=K.networkHydrate(JSON.parse(snap)),dropped=K.networkHydrate({...JSON.parse(snap),commandQueue:[]});
 for(let i=0;i<400;i++){peer.tick(.05);restored.tick(.05);dropped.tick(.05)}
 const sig=s=>JSON.stringify([s.s.units.map(u=>[u.id,Math.round(u.x),Math.round(u.y),Math.round(u.hp),u.order?.type||'']),s.s.resources,s.s.buildings.map(b=>[b.id,b.queue.length])]);
 assert.equal(sig(restored),sig(peer),'restored game with a non-empty command queue matches the peers');assert.notEqual(sig(dropped),sig(peer),'the queued commands matter (dropping them changes the game)');
 console.log(`snapshot at step ${at} with ${queued} queued commands: restored peer identical after 400 steps; without the queue it differs`)}
console.log('ai command checks passed');
