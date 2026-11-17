#!/usr/bin/env node
'use strict';
/* P1 scale benchmark (scale-target.md: 1000 units, 8 sides). Node, no rendering, AI on.
   The simulation allows at most 5 nations per map (worlds.js), so "8 sides" is modelled as 5 nations (the seat maximum) on the
   largest map (coast_l) with 200 units each = 1000 units, whose armies are split into 8 battle groups that converge on 4 fronts
   (8 independent movement/combat orders at once). Prints ms per 0.05 s step: mean/p50/p95/max, steps over 40 ms (all and after
   the first 20 steps of JIT warm-up), plus a state checksum (src/core/hash.js) at the end so runs can be compared.
   usage: node scripts/perf/scale-1000.cjs [steps=600] [out.json] [--per 200] [--seed 8080] [--map coast_l] */
const path=require('node:path'),fs=require('node:fs'),{pathToFileURL}=require('node:url'),ROOT=process.env.KINGDOM_ROOT||path.resolve(__dirname,'../..');
const argv=process.argv.slice(2),opt=k=>{const i=argv.indexOf('--'+k);return i>=0?argv[i+1]:undefined},pos=argv.filter((a,i)=>!a.startsWith('--')&&!(i&&argv[i-1].startsWith('--')));
const K=require(path.join(ROOT,'public/network-model.js'));
const steps=+(pos[0]||600),out=pos[1],per=+(opt('per')||200),seed=+(opt('seed')||8080),mapId=opt('map')||'coast_l',NATIONS=['britain','france','china','japan','russia'];
const now=()=>Number(process.hrtime.bigint())/1e6,kinds=['infantry','archer','musketeer','cavalry','halberd','pikeman','longbow','villager'];
(async()=>{const {checksum}=await import(pathToFileURL(path.resolve(__dirname,'../../src/core/hash.js')).href);
  const sim=new K.Sim('normal',null,{nations:NATIONS,groups:[1,2,3,4,5],mapId,seed,fog:true}),s=sim.s,T=NATIONS.length;
  const towns=[...Array(T).keys()].map(t=>s.buildings.find(b=>b.team===t&&b.kind==='town'));
  for(let t=0;t<T;t++){if(!towns[t])continue;let have=s.units.filter(u=>u.team===t).length;for(let i=0;have<per&&i<per*3;i++){const a=i*.61,r=150+(i*37)%360;let u;try{u=sim.add(kinds[i%kinds.length],t,towns[t].x+Math.cos(a)*r,towns[t].y+Math.sin(a)*r)}catch(e){continue}sim.freeSpawn?.(u);have++}}
  const live=towns.filter(Boolean),mid={x:live.reduce((a,b)=>a+b.x,0)/live.length,y:live.reduce((a,b)=>a+b.y,0)/live.length};
  /* 8 battle groups: every nation's army splits in two (10 halves); halves are paired onto 4 fronts around the map centre, and the
     two leftover halves attack-move on the centre itself -> 8 groups with their own target. */
  const fronts=[[-1,-1],[1,-1],[-1,1],[1,1]].map(([dx,dy])=>({x:mid.x+dx*700,y:mid.y+dy*500})),groups=[];
  for(let t=0;t<T;t++){const army=s.units.filter(u=>u.team===t&&u.kind!=='villager'&&K.defs[u.kind].damage>0&&!sim.sea?.(u)&&!sim.air?.(u));groups.push(army.filter((_,i)=>i%2===0),army.filter((_,i)=>i%2===1))}
  const targets=[...fronts,...fronts,mid,mid];let ordered=0;for(let g=0;g<8;g++){const units=groups[g];if(units?.length){sim.order(units,{type:'advance',x:targets[g].x+(g%3-1)*60,y:targets[g].y});ordered++}}
  {const land=s.units.find(u=>!sim.sea?.(u)&&!sim.air?.(u)),ship=s.units.find(u=>sim.sea?.(u));sim.getGrid?.(null);if(land)sim.getGrid?.(land);if(ship)sim.getGrid?.(ship)}
  const units0=s.units.length,ticks=[];for(let i=1;i<=steps;i++){const t=now();sim.tick(.05);ticks.push(now()-t)}
  const sorted=[...ticks].sort((a,b)=>a-b),f=x=>+x.toFixed(2);
  const res={root:ROOT,seed,mapId,nations:T,sides:ordered,groupsNote:'5 nations (seat maximum) x '+per+' units; armies split into 8 battle groups',steps,unitsStart:units0,unitsEnd:s.units.length,alive:s.units.filter(u=>u.hp>0).length,
    meanMs:f(ticks.reduce((a,b)=>a+b,0)/steps),p50:f(sorted[steps>>1]),p95:f(sorted[Math.floor(steps*.95)]),max:f(sorted.at(-1)),over40:ticks.filter(t=>t>40).length,over40Steady:ticks.filter((t,i)=>i>=20&&t>40).length,maxSteady:f(Math.max(...ticks.slice(20))),over16:ticks.filter(t=>t>16).length,checksum:checksum(sim).hash};
  if(out)fs.writeFileSync(out,JSON.stringify(res,null,1));console.log(JSON.stringify(res))})().catch(e=>{console.error(e);process.exit(1)});
