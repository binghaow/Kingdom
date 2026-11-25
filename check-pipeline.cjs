/* P4 4b: the simulation step is a named system pipeline (public/engine.js addSimLayer / registerSystem), not a chain of tick overrides.
   1. No simulation layer overrides tick() any more (new per-step behaviour must use registerSystem / addSimLayer).
   2. Pipeline order: commands first, the layers' pre systems from the outermost class inwards, the core systems, then the post systems
      from the innermost class outwards; the single-player class (LittleAnt) and the online class (NetworkSim) both have it.
   3. registerSystem inserts a system at a named place and it runs once per step, in that place.
   4. profileSystems times every system (opt-in); a finished game skips the inner systems exactly like the old early returns.
   Bit-for-bit equality with the old tick chain is shown by check-replay.cjs (fixtures unchanged by 4b). */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const CHAIN=['engine','empires','coalitions','dynasties','worlds','frontiers','siege','fortification','tactics','companions','campaign','clarity','guardians','terrain','economy','wildlands','commander','roster','frontier-v40','ai-humanlike','network-model','little-ant'];
for(const f of CHAIN){const src=fs.readFileSync(path.join(__dirname,'public',f+'.js'),'utf8');const n=(src.match(/\n tick\(dt\)\{/g)||[]).length;assert.equal(n,f==='engine'?1:0,f+'.js overrides tick(): register a system instead (engine.js registerSystem)');
 if(f!=='engine')assert(!/super\.tick\(/.test(src),f+'.js calls super.tick')}
console.log('PASS no tick overrides in the '+CHAIN.length+' simulation layers');
const K=require('./public/little-ant.js'),N=require('./public/network-model.js');
const CORE=['engine.ended','engine.clock','buildings','units','collision','deaths','cleanup','ai.turns'];
for(const [label,sim] of [['single-player',new K.Sim('normal',null,{nations:['britain','france'],mapId:'coast_s',seed:3})],['online',new N.NetworkSim('normal',null,{nations:['britain','france'],mapId:'coast_s',seed:3,humanTeams:[0]})]]){
 const names=sim.systemNames();assert.equal(names[0],'commands');const at=names.indexOf('engine.ended');assert.deepEqual(names.slice(at,at+CORE.length),CORE,label+': core systems in order');
 for(const x of ['wildlife','monsters+lastKnown','fog','ai.scout','ai.raids','ai.humanlike'])assert(names.includes(x),label+' has '+x);
 assert(names.indexOf('wildlife')<at&&names.indexOf('fog')>at&&names.indexOf('ai.humanlike')>names.indexOf('fog'),label+': pre before core, post after');
 if(label==='online')assert(names.indexOf('net.treaties')===1,'online: treaties are the outermost pre system');else assert.equal(names.at(-1),'ants','single-player: the outermost post system is last');
 console.log(`PASS ${label} pipeline: ${names.length} systems: ${names.join(' > ')}`)}
{let calls=0,order=null;K.registerSystem({name:'check.afterFog',after:'fog',run(dt,c){calls++;order=c.seen;c.seen=(c.seen||0)+1}});K.registerSystem({name:'check.beforeFog',before:'fog',run(dt,c){c.seen=10}});
 const sim=new K.Sim('normal',null,{nations:['britain','france'],mapId:'coast_s',seed:3}),names=sim.systemNames(),f=names.indexOf('fog');assert.equal(names[f-1],'check.beforeFog');assert.equal(names[f+1],'check.afterFog');
 const prof=sim.profileSystems(true);for(let i=0;i<40;i++)sim.tick(.05);assert.equal(calls,40,'registered system runs once per step');assert.equal(order,10,'registered systems run in their places');
 for(const n of names)assert.equal(prof[n]?.n,40,'profiled '+n);const top=Object.entries(prof).sort((a,b)=>b[1].ms-a[1].ms).slice(0,5).map(([k,v])=>k+' '+(v.ms/v.n).toFixed(3)+' ms');
 console.log('PASS registerSystem places and runs systems; profileSystems times all '+names.length+' (slowest: '+top.join(', ')+')');
 for(const b of sim.s.buildings)if(b.team===1)b.hp=0;sim.tick(.05);assert(sim.s.ended,'game ended');const before=prof.units.n,clock=sim.s.time;sim.tick(.05);sim.tick(.05);
 assert.equal(prof.units.n,before,'a finished game skips the core systems');assert.equal(sim.s.time,clock,'clock stops');assert.equal(prof.commands.n,before+2,'outer systems still run as before');
 console.log('PASS a finished game skips the inner systems (old early returns)')}
console.log('pipeline checks passed');
