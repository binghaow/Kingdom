#!/usr/bin/env node
'use strict';
/* P7 assessment probe (record only, not a gate): N computer nations, all AI-driven from the normal opening, on the largest map.
   Reports whether the engine accepts N nations, start positions / spacing, colors available, and ms per 0.05 s step
   (mean / p50 / p95 / max) over the run, sampled per game-minute.
   usage: node scripts/p7/eight-players.cjs [players=8] [minutes=8] [--uncap] [--map coast_l] [--difficulty normal] [--json out.json] */
const path=require('node:path'),fs=require('node:fs'),ROOT=process.env.KINGDOM_ROOT||path.resolve(__dirname,'../..');
const argv=process.argv.slice(2),opt=k=>{const i=argv.indexOf('--'+k);return i>=0?argv[i+1]:undefined},pos=argv.filter((a,i)=>!a.startsWith('--')&&!(i&&argv[i-1].startsWith('--')));
/* --uncap: experiment only. public/worlds.js keeps at most 5 nations (options.nations.slice(0,5)); this rewrites that one
   expression to slice(0,N) in memory while loading (the files on disk are untouched) to see what else breaks at N > 5. */
if(argv.includes('--uncap')){const Module=require('node:module'),fsr=require('node:fs'),orig=Module._extensions['.js'];Module._extensions['.js']=(m,f)=>{if(f.endsWith(path.join('public','worlds.js'))){let src=fsr.readFileSync(f,'utf8');const n=src.split('.slice(0,5),id=options.mapId').length-1;if(n!==1)throw Error('worlds.js nation cap not found');src=src.replace('.slice(0,5),id=options.mapId','.slice(0,64),id=options.mapId');return m._compile(src,f)}return orig(m,f)}}
const K=require(path.join(ROOT,'public/little-ant.js'));
const players=+(pos[0]||8),minutes=+(pos[1]||8),mapId=opt('map')||'coast_l',difficulty=opt('difficulty')||'normal',seed=+(opt('seed')||4242);
const now=()=>Number(process.hrtime.bigint())/1e6;
const ids=Object.keys(K.nations),nations=Array.from({length:players},(_,i)=>ids[i%ids.length]),groups=Array.from({length:players},(_,i)=>i+1);
const t0=now();const sim=new K.Sim(difficulty,null,{nations,groups,mapId,seed,fog:true});const setupMs=now()-t0,s=sim.s;
const towns=Array.from({length:players},(_,t)=>s.buildings.find(b=>b.team===t&&b.kind==='town'));
const pairs=[];for(let a=0;a<players;a++)for(let b=a+1;b<players;b++)if(towns[a]&&towns[b])pairs.push(Math.hypot(towns[a].x-towns[b].x,towns[a].y-towns[b].y));
const colorsDistinct=new Set(Array.from({length:players},(_,t)=>K.colors[t]||'(none)')).size;
{const land=s.units.find(u=>!sim.sea?.(u)&&!sim.air?.(u));sim.getGrid?.(null);if(land)sim.getGrid?.(land)}
/* team 0 is the player slot and stays idle (1 player + N-1 computers, as a lobby game would start); the AI runs teams 1..N-1 */
const steps=minutes*60*20,ticks=new Float64Array(steps);const perMinute=[];
for(let i=0;i<steps;i++){const a=now();sim.tick(.05);const b=now();ticks[i]=b-a;
  if((i+1)%1200===0){const w=Array.from(ticks.slice(i-1199,i+1)).sort((x,y)=>x-y);perMinute.push({minute:(i+1)/1200,unitsPerTeam:Array.from({length:s.nations.length},(_,t)=>s.units.filter(u=>u.team===t&&u.hp>0).length).join('/'),units:s.units.filter(u=>u.hp>0).length,buildings:s.buildings.filter(b=>b.hp>0).length,mean:+(w.reduce((x,y)=>x+y,0)/w.length).toFixed(2),p95:+w[Math.floor(w.length*.95)].toFixed(2),max:+w.at(-1).toFixed(1),over50:w.filter(x=>x>50).length,defeated:s.defeated.length})}}
const all=Array.from(ticks).sort((a,b)=>a-b);
const res={players,engineNations:s.nations.length,uncapped:argv.includes('--uncap'),mapId,map:{width:K.map.width,height:K.map.height},difficulty,minutes,setupMs:+setupMs.toFixed(0),towns:towns.filter(Boolean).length,
  minTownDistance:Math.round(Math.min(...pairs)),colorsDistinct,colorTable:K.colors.length,
  stepMs:{mean:+(all.reduce((a,b)=>a+b,0)/all.length).toFixed(2),p50:+all[all.length>>1].toFixed(2),p95:+all[Math.floor(all.length*.95)].toFixed(2),max:+all.at(-1).toFixed(1),over50:all.filter(x=>x>50).length},perMinute};
if(opt('json'))fs.writeFileSync(opt('json'),JSON.stringify(res,null,1));console.log(JSON.stringify(res));
