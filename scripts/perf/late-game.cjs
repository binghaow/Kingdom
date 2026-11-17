#!/usr/bin/env node
'use strict';
/* Late-game simulation cost + determinism fingerprint (Node, no rendering). Four nations on a large map, about 110 units each
   (mixed kinds, villagers included), AI on; part of every army is ordered to advance on the map centre so armies meet and fight.
   Prints ms per 0.05 s step (median/p95/max) and a state fingerprint every `every` steps (unit positions/hp, building hp,
   resources, node amounts). Two code versions given the same seed and command list must print the same fingerprints.
   usage: node scripts/perf/late-game.cjs [steps=600] [out.json] [--per 110] [--seed 9090] [--map coast_l]
   KINGDOM_ROOT=<other checkout> runs another version of the engine (used for the before/after determinism comparison). */
const path=require('node:path'),fs=require('node:fs'),ROOT=process.env.KINGDOM_ROOT||path.resolve(__dirname,'../..');
const argv=process.argv.slice(2),opt=k=>{const i=argv.indexOf('--'+k);return i>=0?argv[i+1]:undefined},pos=argv.filter((a,i)=>!a.startsWith('--')&&!(i&&argv[i-1].startsWith('--')));
const K=require(path.join(ROOT,'public/ai-humanlike.js'));
const steps=+(pos[0]||600),out=pos[1],per=+(opt('per')||110),seed=+(opt('seed')||9090),mapId=opt('map')||'coast_l',every=+(opt('every')||50);
const now=()=>Number(process.hrtime.bigint())/1e6;
const kinds=['infantry','archer','musketeer','cavalry','halberd','pikeman','longbow','villager'];
function fnv(str){let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16)}
function fingerprint(s){const q=x=>Math.round((x||0)*100);
  const u=s.units.map(u=>[u.id,u.kind,u.team,q(u.x),q(u.y),q(u.hp)].join(',')).join(';');
  const b=s.buildings.map(b=>[b.id,b.kind,b.team,q(b.hp),b.done?1:0].join(',')).join(';');
  const n=s.nodes.map(n=>[n.id,q(n.amount)].join(',')).join(';');
  const r=JSON.stringify(s.resources);
  return {units:s.units.length,alive:s.units.filter(u=>u.hp>0).length,hash:fnv(u+'|'+b+'|'+n+'|'+r),uh:fnv(u),bh:fnv(b),nh:fnv(n),rh:fnv(r)}}
function setup(){const sim=new K.Sim('normal',null,{nations:['britain','france','china','japan'],groups:[1,2,3,4],mapId,seed,fog:true});
  const towns=[0,1,2,3].map(t=>sim.s.buildings.find(b=>b.team===t&&b.kind==='town'));
  for(let t=0;t<4;t++){if(!towns[t])continue;let have=sim.s.units.filter(u=>u.team===t).length;for(let i=0;have<per;i++,have++){const a=i*.61,r=150+(i*37)%330;let u;try{u=sim.add(kinds[i%kinds.length],t,towns[t].x+Math.cos(a)*r,towns[t].y+Math.sin(a)*r)}catch(e){continue}sim.freeSpawn?.(u)}}
  const live=towns.filter(Boolean),mid={x:live.reduce((a,b)=>a+b.x,0)/live.length,y:live.reduce((a,b)=>a+b.y,0)/live.length};
  for(let t=0;t<4;t++){const army=sim.s.units.filter(u=>u.team===t&&u.kind!=='villager'&&K.defs[u.kind].damage>0&&!sim.sea?.(u)&&!sim.air?.(u));
    sim.order(army.filter((_,i)=>i%3!==2),{type:'advance',x:mid.x+(t-1.5)*60,y:mid.y})}
  return {sim,towns:live.length,mid}}
/* Fixed player command script (same on both code versions): step 300 team 0 attacks the nearest enemy unit with its idle soldiers,
   step 600 team 1 retreats half of its army home, step 900 team 2 attack-moves on team 3's town. */
function commands(sim,step,mid){const s=sim.s,army=t=>s.units.filter(u=>u.team===t&&u.hp>0&&u.kind!=='villager'&&K.defs[u.kind].damage>0&&!sim.sea?.(u)&&!sim.air?.(u));
  if(step===300){const a=army(0),e=s.units.filter(u=>u.team!==0&&u.hp>0).sort((x,y)=>Math.hypot(x.x-mid.x,x.y-mid.y)-Math.hypot(y.x-mid.x,y.y-mid.y)||x.id-y.id)[0];if(a.length&&e)sim.order(a.filter(u=>!u.order),{type:'attack',id:e.id})}
  if(step===600){const a=army(1),home=sim.townOf(1);if(home)sim.order(a.filter((_,i)=>i%2===0),{type:'move',x:home.x,y:home.y+120,retreat:true})}
  if(step===900){const a=army(2),t=sim.townOf(3);if(t)sim.order(a,{type:'advance',x:t.x,y:t.y})}}
const {sim,towns,mid}=setup();sim.getGrid?.(null);
const ticks=[],prints=[];for(let i=1;i<=steps;i++){commands(sim,i,mid);const t=now();sim.tick(.05);ticks.push(now()-t);if(i%every===0)prints.push({step:i,...fingerprint(sim.s)})}
const sorted=[...ticks].sort((a,b)=>a-b),res={root:ROOT,seed,mapId,towns,steps,units:sim.s.units.length,alive:sim.s.units.filter(u=>u.hp>0).length,
  meanMs:+(ticks.reduce((a,b)=>a+b,0)/steps).toFixed(2),p50:+sorted[steps>>1].toFixed(2),p95:+sorted[Math.floor(steps*.95)].toFixed(2),max:+sorted.at(-1).toFixed(1),prints};
if(out)fs.writeFileSync(out,JSON.stringify(res,null,1));
console.log(JSON.stringify({...res,prints:res.prints.map(p=>`${p.step}:${p.alive}/${p.units}:${p.hash}`)},null,0));
