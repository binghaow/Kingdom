/* Computer naval, amphibious and air play (docs/ai/naval-air-audit.md). Headless, deterministic: production simulation class
   (network-model.js), fixed maps and seeds, no rendering. "off" = the same class with s.aiNavalAirOff (the v45 behaviour
   module off, everything else identical).
   1. Island duel (潮汐群岛 straits, three seats: seat 0 an empty observer, seat 1 mainland expert, seat 2 island expert):
      docks/warships, full transport loads unloaded on the enemy land mass, flying units, the island side is attacked.
   2. Player on an island (straits, seat 2 is an idle human seat on the island, seat 0 an idle ally of computer seat 1):
      the computer reaches and attacks it (expert and normal).
   3. Air: both computers start in age V with a bank; bombers are built and raid economy buildings, withdraw from anti-air.
   4. Land map (镜湖 lake_s, expert vs normal): army size, attacks launched and outcome with the module on vs off.
   5. Determinism: identical replays; identical replays when rebuilt from saved state every 10 s (server/lockstep style).
   Prints numbers for the docs. usage: node check-ai-naval-air.cjs [--quick] [--only=1,3] */
'use strict';
const assert=require('node:assert/strict'),K=require('./public/network-model.js'),D=K.defs,DT=.1;
const QUICK=process.argv.includes('--quick'),ONLY=(process.argv.find(a=>a.startsWith('--only='))||'').slice(7).split(',').filter(Boolean),want=k=>!ONLY.length||ONLY.includes(k);
const now=()=>Number(process.hrtime.bigint())/1e6;
const NATIONS=['britain','france','prussia'];
function make({map='straits',seed=7,level='expert',levels=null,groups=[1,2,3],net=false,humans=null,off=false,observer=true}){
 const s=new (net?K.NetworkSim:K.Sim)(level,null,{nations:NATIONS,groups,mapId:map,fog:true,seed,...(net?{humanTeams:humans||[0]}:{})});
 if(levels)levels.forEach((l,i)=>l&&s.setDifficulty(i,l));if(off)s.s.aiNavalAirOff=true;
 if(observer){s.s.units=s.s.units.filter(u=>u.team!==0);s.s.buildings=s.s.buildings.filter(b=>b.team!==0||b.kind==='town');const obs=s.s.buildings.find(b=>b.team===0);obs.x=40;obs.y=40;obs.hp=obs.maxhp=1e9}
 const R=K.landRegions(s.world),home=NATIONS.map((_,t)=>{const b=s.s.buildings.find(b=>b.team===t&&b.kind==='town');return b?R.at(b.x,b.y):-2});
 const log=[],st=NATIONS.map(()=>({trained:{},built:{},hits:0,hitsByLanded:0,hitsByAir:0,hitsBySea:0}));
 const emit=s.emit.bind(s);s.emit=(type,p={})=>{const t=p.team;if(t>=0&&st[t]){if(type==='trained')st[t].trained[p.kind]=(st[t].trained[p.kind]||0)+1;if(type==='built')st[t].built[p.kind]=(st[t].built[p.kind]||0)+1}if(/^ai[A-Z]/.test(type)&&type!=='aiResearch')log.push({t:Math.round(s.s.time),type,...p});return emit(type,p)};
 /* damage taken, split by the attacker's domain / whether it stands on the victim's land mass */
 const dmg=s.damage.bind(s);s.damage=(e,a,src)=>{if(src&&src.team>=0&&e&&e.team>=0&&src.team!==e.team&&st[e.team]&&a>0){const v=st[e.team];v.hits+=a;if(s.air(src))v.hitsByAir+=a;else if(s.sea(src))v.hitsBySea+=a;else if(R.at(src.x,src.y)===home[e.team]&&home[src.team]!==home[e.team])v.hitsByLanded+=a}return dmg(e,a,src)};
 let ms=0;const f=s.aiBehaviorStep.bind(s);s.aiBehaviorStep=()=>{const t=now();f();ms+=now()-t};
 return{s,R,home,log,st,ms:()=>ms}}
const run=(r,seconds,each)=>{const n=Math.round(seconds/DT);for(let i=0;i<n&&!r.s.s.ended;i++){r.s.tick(DT);each?.(r.s,i)}return r};
const naval=(r,t)=>r.s.s.aiNaval?.[t]?.stats||{};
const count=(r,t,type,f=()=>true)=>r.log.filter(e=>e.team===t&&e.type===type&&f(e)).length;
const sum=(o,keys)=>keys.reduce((n,k)=>n+(o[k]||0),0);
const out=[];const row=(...a)=>{out.push(a.join(' | '));console.log(a.join(' | '))};

/* ---- 1. island duel ---- */
if(want('1')){const SEC=QUICK?1200:1500;console.log('== 1. island duel (straits seed 7, seat 1 mainland expert vs seat 2 island expert, seat 0 empty observer, '+SEC+' s) ==');
 const R={};for(const off of [true,false]){const t0=now(),r=run(make({off}),SEC);R[off]=r;const wall=now()-t0;
  for(const t of [1,2]){const N=naval(r,t),tr=r.st[t].trained;row(off?'off':'on','seat '+t+(t===2?' (island)':' (mainland)'),'docks built '+(r.st[t].built.dock||0),'warships '+sum(tr,['sloop','frigate','bombketch']),'transports '+(tr.transport||0),
   'loads '+(N.loads||0)+' (full '+(N.fullLoads||0)+')','landings '+count(r,t,'aiLanding',e=>e.region==='enemy')+' units '+(N.landed||0),'assaults '+(N.assaults||0),'aborts '+(N.aborts||0),'fleet defend/raid '+(N.fleetDefend||0)+'/'+(N.fleetRaids||0),
   'air units '+sum(tr,['scoutballoon','bomber'])+' (bombers '+(tr.bomber||0)+')','air raids '+(N.airRaids||0)+' back '+(N.airBack||0),'damage taken '+Math.round(r.st[t].hits)+' (landed '+Math.round(r.st[t].hitsByLanded)+', sea '+Math.round(r.st[t].hitsBySea)+', air '+Math.round(r.st[t].hitsByAir)+')','age '+r.s.s.ages[t])}
  row(off?'off':'on','behaviour module time '+Math.round(r.ms())+' ms over '+SEC+' s sim, wall '+Math.round(wall)+' ms')}
 const on=R[false],o=R[true];
 const docks=[1,2].some(t=>(on.st[t].built.dock||0)+(naval(on,t).docks||0)>0||on.s.s.buildings.some(b=>b.team===t&&b.kind==='dock'&&b.complete));
 assert(docks,'a dock stands on a naval map');assert([1,2].some(t=>sum(on.st[t].trained,['sloop','frigate','bombketch'])>=3),'warships trained');
 const full=on.log.filter(e=>e.type==='aiSail'&&e.full).length,landed=on.log.filter(e=>e.type==='aiLanding'&&e.region==='enemy');
 assert(full>=1,'at least one full transport load sails');assert(landed.length>=1,'troops unloaded on the enemy land mass');
 assert(on.st[2].hitsByLanded>0||on.st[1].hitsByLanded>0,'landed troops hurt the other side');
 assert(on.st[2].hits>0,'the island side is attacked');
 assert([1,2].some(t=>sum(on.st[t].trained,['scoutballoon','bomber'])>0),'flying units trained');
 assert.equal(o.log.filter(e=>e.type==='aiLanding').length,0,'off: no landings from this module');
 row('summary','island side damage taken off/on '+Math.round(o.st[2].hits)+' / '+Math.round(on.st[2].hits),'landings off/on 0 / '+landed.length,'full loads '+full)}

/* ---- 2. a human on the island ---- */
if(want('2')){const SEC=QUICK?900:1080;console.log('== 2. idle human seat on the island (straits seed 7, seat 2 human, seat 0 idle ally of computer seat 1, '+SEC+' s) ==');
 for(const level of ['expert','normal']){const r=run(make({level,net:true,humans:[0,2],groups:[1,1,2],observer:false}),SEC),N=naval(r,1);
  const first=r.log.find(e=>e.type==='aiLanding'&&e.team===1&&e.region==='enemy');
  row(level,'landings '+count(r,1,'aiLanding',e=>e.region==='enemy')+' (first at '+(first?first.t+' s':'-')+')','units landed '+(N.landed||0),'full loads '+(N.fullLoads||0)+'/'+(N.loads||0),'assaults '+(N.assaults||0),'island damage taken '+Math.round(r.st[2].hits)+' (by landed troops '+Math.round(r.st[2].hitsByLanded)+')','island buildings left '+r.s.s.buildings.filter(b=>b.team===2).length);
  assert(first,level+': the computer lands on the island');assert(r.st[2].hitsByLanded>0,level+': landed troops attack the island')}}

/* ---- 3. air ---- */
if(want('3')){const SEC=QUICK?420:540;console.log('== 3. air (lake_s seed 5, both computers start in age V with a bank, '+SEC+' s) ==');
 const r=make({map:'lake_s',seed:5});for(const t of [1,2]){r.s.s.ages[t]=5;Object.assign(r.s.s.resources[t],{food:6000,wood:6000,gold:6000,stone:3000})}
 run(r,SEC);for(const t of [1,2]){const N=naval(r,t),tr=r.st[t].trained;row('seat '+t,'aerodromes '+(N.aerodromes||0),'balloons '+(tr.scoutballoon||0),'bombers '+(tr.bomber||0),'raids '+(N.airRaids||0)+' support '+(N.airSupport||0)+' withdrew '+(N.airBack||0),'damage dealt by air '+Math.round(r.st[3-t].hitsByAir))}
 assert([1,2].some(t=>(r.st[t].trained.bomber||0)>=2),'bombers trained');assert([1,2].some(t=>(naval(r,t).airRaids||0)+(naval(r,t).airSupport||0)>=1),'bombers sent on a raid');assert(r.st[1].hitsByAir+r.st[2].hitsByAir>0,'bombs hit')}

/* ---- 4. land map unchanged ---- */
if(want('4')){const SEC=QUICK?600:720;console.log('== 4. land map (lake_s seed 7, three seats, seat 0 empty observer, '+SEC+' s): module off vs on ==');
 const strength=(r,t)=>{const army=r.s.s.units.filter(u=>u.team===t&&D[u.kind]?.damage>0&&u.kind!=='villager');return{army:army.length,power:Math.round(army.reduce((n,u)=>n+r.s.aiPower(u),0)),villagers:r.s.s.units.filter(u=>u.team===t&&u.kind==='villager').length,buildings:r.s.s.buildings.filter(b=>b.team===t).length,waves:(r.s.s.aiWar[t].log||[]).filter(l=>l.kind==='main').length,first:(r.s.s.aiWar[t].log||[]).find(l=>l.kind==='main')?.t??null,defeated:r.s.s.defeated.includes(t)}};
 const V={};for(const levels of [['expert','normal'],['normal','expert']])for(const off of [true,false]){const r=run(make({map:'lake_s',seed:7,levels:[null,...levels],off}),SEC),k=levels.join('-')+(off?' off':' on');V[k]=[null,strength(r,1),strength(r,2)];
  for(const t of [1,2]){const x=V[k][t];row(k,'seat '+t+' '+levels[t-1],'army '+x.army+' power '+x.power,'villagers '+x.villagers,'buildings '+x.buildings,'main attacks '+x.waves+' (first '+(x.first??'-')+' s)',x.defeated?'DEFEATED':'alive','air units '+sum(r.st[t].trained,['scoutballoon','bomber'])+', warships '+sum(r.st[t].trained,['sloop','frigate','bombketch']))}}
 const score=x=>x.power+x.buildings*40+x.villagers*10;
 for(const levels of [['expert','normal'],['normal','expert']]){const e=levels.indexOf('expert')+1,n=3-e,on=V[levels.join('-')+' on'],off=V[levels.join('-')+' off'];
  assert(score(on[e])>score(on[n]),'on: expert stronger than normal ('+levels.join(' vs ')+')');
  for(const t of [1,2])assert(on[t].waves>=Math.max(0,off[t].waves-2),'on: attack rhythm kept (seat '+t+', '+levels.join(' vs ')+')')}}

/* ---- 5. determinism ---- */
if(want('5')){const SEC=QUICK?300:420;console.log('== 5. determinism (straits seed 9, expert vs hard, '+SEC+' s; hydrated = rebuilt from saved state every 10 s) ==');
 function replay(hydrate){let s=make({seed:9,levels:[null,'expert','hard'],net:true}).s;for(let i=0;i<Math.round(SEC/DT);i++){s.tick(DT);if(hydrate&&i%100===99)s=K.networkHydrate(JSON.parse(JSON.stringify(K.networkPersistent(s))))}
  return JSON.stringify({u:s.s.units.map(u=>[u.id,u.kind,Math.round(u.x),Math.round(u.y),Math.round(u.hp)]),n:s.s.aiNaval,j:s.s.aiJobs,r:s.s.resources})}
 const a=replay(false),b=replay(false);assert.equal(a,b,'identical replays');const h1=replay(true),h2=replay(true);assert.equal(h1,h2,'identical replays with hydration every 10 s');
 const n=JSON.parse(h1).n;assert(n?.[1]?.stats&&n?.[2]?.stats,'module state kept across hydration');row('replays identical; hydrated replays identical; module state saved ('+Object.keys(n).length+' seats)')}
console.log('ai naval/air checks passed');
