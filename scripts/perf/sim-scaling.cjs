#!/usr/bin/env node
'use strict';
/* Single-player simulation cost versus army size (Node, no rendering). Two nations on coast_s; N mixed land units split between
   them are ordered to advance on each other, so the run covers marching, contact and melee. Reports ms per 0.05 s step (the
   single-player step) and inclusive time of the usual suspects, to show which part grows faster than the unit count.
   usage: node scripts/perf/sim-scaling.cjs [counts=50,100,200,400] [steps=240]
   Node timings are not device evidence (AGENTS.md); use ?perf=1 on the device for frame/render numbers. */
const path=require('node:path'),ROOT=process.env.KINGDOM_ROOT||path.resolve(__dirname,'../..'),K=require(path.join(ROOT,'public/roster.js'));
const counts=(process.argv[2]||'50,100,200,400').split(',').map(Number),steps=+(process.argv[3]||240),kinds=['infantry','archer','musketeer','cavalry','halberd','cannon'];
const now=()=>Number(process.hrtime.bigint())/1e6,parts=['separateCrowd','acquireAutoTarget','findPath','updateFog','ai','view'];
function run(n){const sim=new K.Sim('easy',null,{nations:['britain','france'],mapId:'coast_s',seed:4242}),spent=Object.fromEntries(parts.map(k=>[k,0])),calls=Object.fromEntries(parts.map(k=>[k,0]));let depth=0;
 for(const k of parts){const original=sim[k];if(typeof original!=='function')continue;sim[k]=function(...a){if(depth)return original.apply(this,a);depth++;const t=now();try{return original.apply(this,a)}finally{spent[k]+=now()-t;calls[k]++;depth--}}}
 const towns=[0,1].map(t=>sim.s.buildings.find(b=>b.team===t&&b.kind==='town'));for(let t=0;t<2;t++){let have=sim.s.units.filter(u=>u.team===t).length;for(let i=0;have<n/2;i++,have++){const a=i*.61,r=150+(i*37)%330,u=sim.add(kinds[i%kinds.length],t,towns[t].x+Math.cos(a)*r,towns[t].y+Math.sin(a)*r);sim.freeSpawn?.(u)}}
 for(let t=0;t<2;t++){const army=sim.s.units.filter(u=>u.team===t&&u.kind!=='villager'&&K.defs[u.kind].damage>0&&!sim.sea(u)&&!sim.air?.(u));const mid={x:(towns[0].x+towns[1].x)/2,y:(towns[0].y+towns[1].y)/2};sim.order(army,{type:'advance',x:mid.x,y:mid.y})}
 sim.getGrid(null);const ticks=[];let viewMs=0;for(let i=0;i<steps;i++){const t=now();sim.tick(.05);ticks.push(now()-t);if(i%10===0){const v=now();sim.view(0);viewMs+=now()-v}}
 const sorted=[...ticks].sort((a,b)=>a-b),mean=ticks.reduce((a,b)=>a+b,0)/steps,row={units:sim.s.units.length,alive:sim.s.units.filter(u=>u.hp>0).length,meanMs:+mean.toFixed(2),p50:+sorted[steps>>1].toFixed(2),p95:+sorted[Math.floor(steps*.95)].toFixed(2),max:+sorted.at(-1).toFixed(1)};
 for(const k of parts)if(k!=='view')row[k]=+(spent[k]/steps).toFixed(2);row.other=+(mean-parts.filter(k=>k!=='view').reduce((a,k)=>a+spent[k]/steps,0)).toFixed(2);row.viewPerCall=+(viewMs/Math.ceil(steps/10)).toFixed(2);row.pathCalls=calls.findPath;return row}
const rows=counts.map(run);
console.log('| units requested | on field | step mean ms | p50 | p95 | max | collision | auto-target | pathfinding | fog | AI | other | view(0) per call | path calls |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
rows.forEach((r,i)=>console.log(`| ${counts[i]} | ${r.units} | ${r.meanMs} | ${r.p50} | ${r.p95} | ${r.max} | ${r.separateCrowd} | ${r.acquireAutoTarget} | ${r.findPath} | ${r.updateFog} | ${r.ai} | ${r.other} | ${r.viewPerCall} | ${r.pathCalls} |`));
if(process.argv[4])require('node:fs').writeFileSync(process.argv[4],JSON.stringify(rows,null,1));
