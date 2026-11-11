#!/usr/bin/env node
'use strict';
/* Release check (a): unit pathfinding and stuck-unit detection on scripted games (Node, real simulation, no rendering).
   Scenarios: opening (scripted 2-player game), 200-unit battle, siege of a target enclosed by walls, one order to a large formation.
   Instrumentation is attached to the simulation INSTANCE created here (findPath/walk wrappers); no game file is changed and the
   opt-in A* expansion counter in engine.js is enabled only for the duration of each findPath call.
   Stuck unit = alive, on land/sea, has a movement intent (a path, or a move/advance order whose goal is far away, or an
   attack/gather/build/repair target out of reach), is not fighting or working, and its position stayed within STUCK_PX of
   where it was STUCK_SEC simulated seconds earlier. Units squeezed around a shared destination are reported as
   'crowded-at-goal' and not counted as stuck.
   usage: node scripts/release/path-analysis.cjs [--quick] [--json out.json] [--only battle200] */
const fs=require('node:fs'),path=require('node:path'),{ROOT,now,pct,mean,r1,r2,args}=require('./lib.cjs');
const K=require(path.join(ROOT,'public/commander.js')),H=require(path.join(ROOT,'scripts/netcode/harness.cjs')),D=K.defs;
const STUCK_SEC=4,STUCK_PX=16,SAMPLE=.5,KINDS=['infantry','archer','musketeer','cavalry','halberd','cannon'];
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

function instrument(sim){
  const st={calls:0,fails:0,retries:0,air:0,dropped:0,failedGoals:new Set(),lastKey:new Map(),engageMemo:0,engageSearches:0,engageCalls:0,engageNone:0,droppedUnits:new Map(),expanded:[],ms:[],walks:0,cacheHits:0,stepMs:[],stepCalls:[],perStep:0,gridBuilds:0,gridMs:0};
  const findPath=sim.findPath,walk=sim.walk,getGrid=sim.getGrid;
  sim.findPath=function(u,x,y){
    if(this.air?.(u)){st.air++;return findPath.call(this,u,x,y)}
    const key=u.id+':'+Math.floor(x/48)+':'+Math.floor(y/48);if(st.failedGoals.has(key))st.retries++;
    const hadWindow='window' in globalThis,old=globalThis.window;globalThis.window={PerformanceAudit:{}};this._perfPathExpanded=0;
    const t=now();let r;try{r=findPath.call(this,u,x,y)}finally{const ms=now()-t;if(hadWindow)globalThis.window=old;else delete globalThis.window;st.ms.push(ms)}
    st.calls++;st.perStep++;st.expanded.push(this._perfPathExpanded||0);st.lastKey.set(u.id,key);if(!r?.length){st.fails++;st.failedGoals.add(key)}else st.failedGoals.delete(key);return r};
  /* Siege.engagementPoint memoises an attack position (or its absence) for 2 s; count memo hits and the searches it makes. */
  const engagementPoint=sim.engagementPoint;if(engagementPoint)sim.engagementPoint=function(u,e,reach){const old=u.engagement,memo=old&&old.id===e.id&&old.until>this.s.time&&dist(old.target,e)<30,before=st.calls;const r=engagementPoint.call(this,u,e,reach);if(memo)st.engageMemo++;else{st.engageSearches++;st.engageCalls+=st.calls-before;if(!r)st.engageNone++}return r};
  /* walk() as seen from outside: a cache hit is a walk that found the cached failure and did not search; a dropped route is a
     walk that searched successfully but ended with no path and a failure recorded (Siege.walk found the first leg obstructed). */
  sim.walk=function(u,target,stop,dt){const before=st.calls,fails=st.fails;st.walks++;const r=walk.call(this,u,target,stop,dt);const f=this.pathFailures?.get(u.id);
    if(st.calls===before&&!r&&!u.path?.length){if(f&&f.key===this.pathGoals?.get(u.id))st.cacheHits++}
    else if(st.calls>before&&st.fails===fails&&!r&&!u.path?.length&&f){st.dropped++;st.droppedUnits.set(u.id,this.s.time);const k=st.lastKey.get(u.id);if(k)st.failedGoals.add(k)}return r};
  sim.getGrid=function(...a){const cached=!!this.grid,t=now(),r=getGrid.apply(this,a),ms=now()-t;if(ms>.5||!cached){st.gridBuilds+=cached?0:1;st.gridMs+=ms}return r};
  return st}

/* Stuck detection: samples every SAMPLE simulated seconds; history per unit while its intent is unchanged. */
function stuckTracker(sim,label,st,expected){
  const hist=new Map(),flagged=new Map(),events=[];
  function intent(u){const o=u.order;if(!o)return u.path?.length?{type:'path',goal:u.path.at(-1)}:null;
    let goal=null;if(o.type==='move'||o.type==='advance')goal={x:o.x,y:o.y};else if(o.id!==undefined){const t=sim.byId(o.id);if(t)goal={x:t.x,y:t.y,r:D[t.kind]?.r||12}}else if(u.path?.length)goal=u.path.at(-1);
    if(!goal)return null;const reach=(goal.r||0)+(D[u.kind]?.r||10)+(o.type==='move'||o.type==='advance'?40:Math.max(40,sim.stat?.(u,'range')||40));
    if(!u.path?.length&&dist(u,goal)<=reach)return null;return {type:o.type,goal,key:o.type+':'+(o.id??'')+':'+Math.round(goal.x)+':'+Math.round(goal.y)}}
  function busy(u){const s=sim.s;if(u.working)return true;if((u.cool||0)>0)return true;if((u.visualActionAt??-9)>s.time-1.5)return true;const c=u.combatTarget!==undefined&&u.combatTarget!==null?sim.byId(u.combatTarget?.id??u.combatTarget):null;if(c&&c.hp>0&&dist(u,c)<(sim.stat?.(u,'range')||30)+(D[c.kind]?.r||10)+(D[u.kind]?.r||10)+30)return true;return false}
  function heading(v){const p=v.path?.[0];if(!p)return null;const d=Math.hypot(p.x-v.x,p.y-v.y);return d>.5?{x:(p.x-v.x)/d,y:(p.y-v.y)/d}:null}
  function headOn(u){const a=heading(u);if(!a)return null;for(const o of sim.s.units){if(o===u||o.hp<=0||o.embarkedOn||dist(o,u)>(D[o.kind]?.r||10)+(D[u.kind]?.r||10)+4)continue;const b=heading(o);if(b&&a.x*b.x+a.y*b.y<-.7)return o}return null}
  function classify(u,it,h){const s=sim.s,f=sim.pathFailures?.get(u.id),near=[];let crowd=0;for(const o of s.units)if(o!==u&&o.hp>0&&!o.embarkedOn&&dist(o,u)<(D[o.kind]?.r||10)+(D[u.kind]?.r||10)+8)crowd++;
    let nb=null,nbd=1e9;for(const b of s.buildings){if(b.hp<=0)continue;const d=dist(b,u)-(D[b.kind]?.r||30);if(d<nbd){nbd=d;nb=b}}
    const travelled=h.travel,net=dist(u,h.from),blocked=!sim.air?.(u)&&sim.blocked(u.x,u.y,u),toGoal=dist(u,it.goal);
    const dropped=st.droppedUnits.get(u.id);let reason;if(blocked)reason='inside-obstacle';else if(dropped!==undefined&&dropped>=h.since-1e-6&&f)reason='route found but first leg obstructed (dropped, retried every 1.8 s)';else if(!u.path?.length&&expected?.(u,it))reason='expected: target enclosed'+(u.engagementBlocked?' (no reachable attack position)':'');else if(u.engagementBlocked)reason='no reachable attack position (engagementBlocked)';else if(f&&!u.path?.length)reason='no-route (unreachable, retry cached)';else if(toGoal<220&&crowd>=2&&(it.type==='move'||it.type==='advance'))reason='crowded-at-goal';else if(headOn(u))reason='head-on deadlock with unit #'+headOn(u).id+' ('+headOn(u).kind+', opposite heading, collision pushes both back)';else if(travelled>STUCK_PX*3)reason='oscillating (walks in place)';else if(crowd>=2)reason='pinned by crowd';else if(nbd<30)reason='pinned against building ('+nb.kind+')';else reason='not moving (path '+(u.path?.length||0)+' waypoints)';
    const category=[['inside-obstacle','inside-obstacle'],['route found','first-leg-obstructed'],['expected','expected-enclosed'],['no reachable','engagement-blocked'],['no-route','no-route'],['crowded','crowded-at-goal'],['head-on','head-on-deadlock'],['oscillating','oscillating'],['pinned by','pinned-by-crowd'],['pinned against','pinned-by-building']].find(([p])=>reason.startsWith(p))?.[1]||'not-moving';
    return {scenario:label,category,id:u.id,kind:u.kind,team:u.team,x:Math.round(u.x),y:Math.round(u.y),order:it.type,goal:{x:Math.round(it.goal.x),y:Math.round(it.goal.y)},toGoal:Math.round(toGoal),since:r1(h.since),at:r1(s.time),travelled:Math.round(travelled),net:r1(net),pathLeft:u.path?.length||0,routeFailed:!!f,stallTries:sim.walkStall?.get(u.id)?.tries||0,crowd,nearestBuilding:nb?nb.kind+' '+Math.round(nbd)+'px':null,reason}}
  function sample(){const s=sim.s,seen=new Set();
    for(const u of s.units){if(u.hp<=0||u.embarkedOn||D[u.kind]?.building||u.team<0||u.order?.type==='hold')continue;const it=intent(u);seen.add(u.id);let h=hist.get(u.id);
      if(!it||busy(u)){hist.delete(u.id);continue}
      if(!h||h.key!==it.key){hist.set(u.id,{key:it.key,from:{x:u.x,y:u.y},since:s.time,last:{x:u.x,y:u.y},travel:0,trail:[{t:s.time,x:u.x,y:u.y,travel:0}]});continue}
      h.travel+=dist(u,h.last);h.last={x:u.x,y:u.y};h.trail.push({t:s.time,x:u.x,y:u.y,travel:h.travel});while(h.trail.length&&h.trail[0].t<s.time-STUCK_SEC-1e-6)h.trail.shift();
      const first=h.trail[0];if(s.time-first.t<STUCK_SEC-1e-6||s.time-h.since<STUCK_SEC)continue;
      let maxd=0;for(const p of h.trail)maxd=Math.max(maxd,dist(p,first));if(maxd>=STUCK_PX){continue}
      const ev=classify(u,it,{...h,from:first,travel:h.travel-first.travel});const prev=flagged.get(u.id);if(!prev){flagged.set(u.id,ev);events.push(ev)}else prev.at=ev.at,prev.duration=r1(ev.at-prev.since)}
    for(const id of hist.keys())if(!seen.has(id))hist.delete(id)}
  function report(){const all=[...flagged.values()].map(e=>({...e,duration:r1(e.duration??STUCK_SEC)})),stuck=all.filter(e=>e.category!=='crowded-at-goal'&&e.category!=='expected-enclosed'),by={};for(const e of all)by[e.category]=(by[e.category]||0)+1;
    return {stuckUnits:stuck.length,crowdedAtGoal:all.filter(e=>e.category==='crowded-at-goal').length,expectedUnreachable:all.filter(e=>e.category==='expected-enclosed').length,byReason:by,samples:stuck.sort((a,b)=>b.duration-a.duration).slice(0,8)}}
  return {sample,report}}

function runScenario(label,make,seconds,dt){const {sim,after,expected}=make();sim.getGrid(null);if(sim.sea)try{sim.getGrid({kind:'fishingboat',team:0})}catch{}
  const st=instrument(sim),tracker=stuckTracker(sim,label,st,expected);const steps=Math.round(seconds/dt),every=Math.round(SAMPLE/dt);let worst={ms:0,calls:0,at:0};
  for(let i=0;i<steps;i++){after?.(sim,i);st.perStep=0;const t=now();sim.tick(dt);const ms=now()-t;st.stepMs.push(ms);if(ms>worst.ms)worst={ms:r1(ms),calls:st.perStep,at:r1(sim.s.time)};if(i%every===every-1)tracker.sample()}
  const ex=st.expanded,simSec=steps*dt,attempts=st.retries+st.cacheHits;
  return {scenario:label,units:sim.s.units.filter(u=>u.hp>0).length,simSeconds:r1(simSec),dt,
    astar:{calls:st.calls,callsPerSimSec:r1(st.calls/simSec),expandedP50:pct(ex,.5),expandedP95:pct(ex,.95),expandedMax:Math.max(0,...ex),msP50:r2(pct(st.ms,.5)),msP95:r2(pct(st.ms,.95)),msMax:r2(Math.max(0,...st.ms)),msTotal:r1(st.ms.reduce((a,b)=>a+b,0)),failRate:r2(st.calls?st.fails/st.calls:0),fails:st.fails,retryRate:r2(st.calls?st.retries/st.calls:0),retries:st.retries,unreachableCacheHits:st.cacheHits,droppedRoutes:st.dropped,cacheHitRate:r2(attempts?st.cacheHits/attempts:0),engagement:{memoHits:st.engageMemo,searches:st.engageSearches,astarCalls:st.engageCalls,noPosition:st.engageNone,memoHitRate:r2(st.engageMemo+st.engageSearches?st.engageMemo/(st.engageMemo+st.engageSearches):0)},airDirect:st.air,gridBuilds:st.gridBuilds,gridMs:r1(st.gridMs)},
    step:{meanMs:r2(mean(st.stepMs)),p95Ms:r2(pct(st.stepMs,.95)),p99Ms:r2(pct(st.stepMs,.99)),stepsOver50ms:st.stepMs.filter(x=>x>50).length,maxMs:r1(Math.max(...st.stepMs)),worst},
    stuck:tracker.report()}}

function spawnArmy(sim,team,n,cx,cy,r0=150){const out=[];for(let i=0;i<n;i++){const a=i*.61,r=r0+(i*37)%330,u=sim.add(KINDS[i%KINDS.length],team,cx+Math.cos(a)*r,cy+Math.sin(a)*r);sim.freeSpawn?.(u);out.push(u)}return out}
function quiet(sim){sim.ai=()=>{};sim.raids=()=>{};return sim}
const scenarios={
  opening:{seconds:[60,120],make(){const sim=H.createSim({seed:4242,seats:2,mapId:'coast_s',fog:true}),bots=H.mkBots(2,5);return {sim,after(s,i){H.applyCommands(s,H.botCommands(s,bots,i));if(i%10===0)H.boost(s,80)}}},dt:.1,
    title:'开局：2 人脚本对局（采集、建造、训练、首波进攻），NetworkSim 0.1 s 步'},
  battle200:{seconds:[25,40],dt:.05,title:'200 单位会战：coast_s 双方各约 100 混编单位推进对攻',
    make(){const sim=quiet(new K.Sim('easy',null,{nations:['britain','france'],mapId:'coast_s',seed:4242})),towns=[0,1].map(t=>sim.s.buildings.find(b=>b.team===t&&b.kind==='town'));for(let t=0;t<2;t++){const have=sim.s.units.filter(u=>u.team===t).length;spawnArmy(sim,t,100-have,towns[t].x,towns[t].y)}
      const mid={x:(towns[0].x+towns[1].x)/2,y:(towns[0].y+towns[1].y)/2};for(let t=0;t<2;t++){const army=sim.s.units.filter(u=>u.team===t&&u.kind!=='villager'&&D[u.kind].damage>0&&!sim.sea(u)&&!sim.air?.(u));sim.order(army,{type:'advance',x:mid.x,y:mid.y})}return {sim}}},
  siegeEnclosed:{seconds:[20,30],dt:.05,title:'围攻被围死目标：敌方城镇中心被完整城墙环绕（迷雾关），60 单位对其下达攻击',
    make(){const sim=quiet(new K.Sim('easy',null,{nations:['britain','france'],mapId:'coast_s',seed:4242,fog:false})),town=sim.s.buildings.find(b=>b.team===1&&b.kind==='town'),R=384,cx=Math.round(town.x/96)*96,cy=Math.round(town.y/96)*96;
      for(const p of [...K.wallPlan('wall',{x:cx-R,y:cy-R},{x:cx+R,y:cy-R}),...K.wallPlan('wall',{x:cx-R,y:cy+R},{x:cx+R,y:cy+R}),...K.wallPlan('wallvertical',{x:cx-R,y:cy-R+96},{x:cx-R,y:cy+R-96}),...K.wallPlan('wallvertical',{x:cx+R,y:cy-R+96},{x:cx+R,y:cy+R-96})])sim.add(p.kind,1,p.x,p.y);
      sim.s.units=sim.s.units.filter(u=>u.team!==1||Math.max(Math.abs(u.x-cx),Math.abs(u.y-cy))>R+120);sim.grid=null;sim._gateGrids=null;const army=spawnArmy(sim,0,60,cx-R-520,cy,60);sim.order(army,{type:'attack',id:town.id});
      const probe=army[0];if(sim.findPath(probe,town.x,town.y).length)throw Error('siegeEnclosed: the target is reachable; the wall ring has a gap');return {sim,expected:(u,it)=>u.order?.id===town.id}}},
  formation:{seconds:[40,70],dt:.05,title:'大编队一次下令：160 混编单位按界面阵型（每列 √N、间距 25）移动到约 3000 像素外',
    make(){const sim=quiet(new K.Sim('easy',null,{nations:['britain','france'],mapId:'coast_s',seed:4242})),towns=[0,1].map(t=>sim.s.buildings.find(b=>b.team===t&&b.kind==='town')),army=spawnArmy(sim,0,160,towns[0].x,towns[0].y);
      const p={x:towns[0].x+(towns[1].x-towns[0].x)*.72,y:towns[0].y+700},n=army.length,cols=Math.ceil(Math.sqrt(n)),W=K.maps.coast_s.width,Hh=K.maps.coast_s.height,cl=(v,a,b)=>Math.max(a,Math.min(b,v));
      sim.beginOrders?.();army.forEach((u,i)=>sim.order([u],{type:'move',x:cl(p.x+(i%cols-(cols-1)/2)*25,30,W-30),y:cl(p.y+(Math.floor(i/cols)-Math.floor(n/cols)/2)*25,30,Hh-30)}));sim.endOrders?.();return {sim}}},
};
function run({quick=false,only}={}){const out=[];for(const [k,s] of Object.entries(scenarios)){if(only&&!only.split(',').includes(k))continue;const r=runScenario(k,s.make,s.seconds[quick?0:1],s.dt);r.title=s.title;out.push(r)}
  return {stuckRule:{windowSec:STUCK_SEC,thresholdPx:STUCK_PX,sampleSec:SAMPLE},scenarios:out}}
module.exports={run,scenarios};
if(require.main===module){const a=args(),r=run({quick:!!a.quick,only:a.only});if(a.json)fs.writeFileSync(a.json,JSON.stringify(r,null,1));
  for(const s of r.scenarios){const A=s.astar;console.log(`${s.scenario}: ${s.units} units, ${s.simSeconds}s | A* ${A.calls} (${A.callsPerSimSec}/s) expanded p50/p95/max ${A.expandedP50}/${A.expandedP95}/${A.expandedMax} ms p50/p95/max ${A.msP50}/${A.msP95}/${A.msMax} fail ${A.failRate} retry ${A.retryRate} cacheHits ${A.unreachableCacheHits} engage memo/search/A* ${A.engagement.memoHits}/${A.engagement.searches}/${A.engagement.astarCalls} | step mean/p95/max ${s.step.meanMs}/${s.step.p95Ms}/${s.step.maxMs} | dropped ${A.droppedRoutes} | stuck ${s.stuck.stuckUnits} crowded ${s.stuck.crowdedAtGoal} expected ${s.stuck.expectedUnreachable} ${JSON.stringify(s.stuck.byReason)}`);for(const e of s.stuck.samples.slice(0,4))console.log('   ',JSON.stringify(e))}}
