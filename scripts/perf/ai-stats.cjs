#!/usr/bin/env node
/* Computer-vs-computer statistics (P4 4a baseline, docs/p4/ai-baseline.json).
   Headless, deterministic: the production simulation class (public/network-model.js), fixed maps, several seeds, no rendering.
   Every game has three seats: seat 0 is an empty observer (one untouchable town far in the corner, as in check-ai-naval-air.cjs),
   seats 1 and 2 are computers at the given difficulties (seat 1 = first level of the matchup).
   Per seat: result (won / lost / alive at time limit), first main attack time, main attacks launched, army size (combat units,
   no villagers) at the end and the peak, villagers, buildings, age, landings on enemy land (v45 'aiLanding'), v40 island
   claims ('aiIsland'), units trained.
   Games run in child processes (--jobs, default 2) so a whole set finishes in about 15 minutes on this 2-core machine.

   usage: node scripts/perf/ai-stats.cjs [--set=full|quick|land-ee] [--root=<checkout>] [--out=file.json] [--jobs=2]
                                        [--seeds=1,2,3] [--label=text]
   --root runs the same games on another checkout (e.g. a worktree of main b006cf3) for before/after comparisons.
   Step: 0.1 s per tick (like check-ai-naval-air.cjs; the game runs 0.05 s steps - 0.1 halves the cost and every computer
   decision runs on its own seconds-based clock). */
'use strict';
const path=require('node:path'),fs=require('node:fs'),{spawn}=require('node:child_process');
const arg=(k,d)=>{const a=process.argv.find(a=>a.startsWith('--'+k+'='));return a?a.slice(k.length+3):d};
const DT=.1,NATIONS=['britain','france','prussia'];
const SETS={
 /* land: 镜湖盆地 (lake) and 断崖古道 (cliff); island: 潮汐群岛 (straits) */
 full:[{map:'lake_s',levels:['expert','expert'],sec:1500},{map:'lake_s',levels:['expert','normal'],sec:900},{map:'cliff_s',levels:['hard','normal'],sec:900},
  {map:'straits',levels:['expert','expert'],sec:1200}],
 quick:[{map:'lake_s',levels:['expert','normal'],sec:600},{map:'straits',levels:['expert','expert'],sec:900}],
 'land-ee':[{map:'lake_s',levels:['expert','expert'],sec:1500}]};
const SEEDS=arg('seeds','1,2,3,4,5,6').split(',').map(Number);

function game(root,{map,levels,sec,seed}){
 const K=require(path.join(root,'public/network-model.js')),D=K.defs;
 const s=new K.Sim(levels[0],null,{nations:NATIONS,groups:[1,2,3],mapId:map,fog:true,seed});
 levels.forEach((l,i)=>s.setDifficulty(i+1,l));
 s.s.units=s.s.units.filter(u=>u.team!==0);s.s.buildings=s.s.buildings.filter(b=>b.team!==0||b.kind==='town');
 const obs=s.s.buildings.find(b=>b.team===0);obs.x=40;obs.y=40;obs.hp=obs.maxhp=1e9;
 const st=[0,1,2].map(()=>({trained:{},landings:0,landed:0,islands:0,peakArmy:0,endedAt:null,main:[],seen:new Set()}));
 /* aiWar[t].log keeps only the last 40 entries: collect main waves as they appear */
 const scan=t=>{for(const l of s.s.aiWar?.[t]?.log||[])if(!st[t].seen.has(l)){st[t].seen.add(l);if(l.kind==='main')st[t].main.push(l.t)}};
 const emit=s.emit.bind(s);s.emit=(type,p={})=>{const x=st[p.team];if(x){if(type==='trained')x.trained[p.kind]=(x.trained[p.kind]||0)+1;
  if(type==='aiLanding'&&p.region==='enemy'){x.landings++;x.landed+=p.size||0}if(type==='aiIsland')x.islands++}return emit(type,p)};
 const army=t=>s.s.units.filter(u=>u.team===t&&D[u.kind]?.damage>0&&u.kind!=='villager'&&!D[u.kind]?.hero).length;
 const t0=Date.now(),n=Math.round(sec/DT);let i=0;
 for(;i<n&&!s.s.ended;i++){s.tick(DT);if(i%50===0)for(const t of [1,2]){scan(t);st[t].peakArmy=Math.max(st[t].peakArmy,army(t));if(st[t].endedAt===null&&s.s.defeated.includes(t))st[t].endedAt=Math.round(s.s.time)}}
 const seats=[1,2].map(t=>{scan(t);const main=st[t].main;
  return{seat:t,level:levels[t-1],defeated:s.s.defeated.includes(t),defeatedAt:st[t].endedAt,firstAttack:main[0]??null,mainAttacks:main.length,
   army:army(t),peakArmy:Math.max(st[t].peakArmy,army(t)),villagers:s.s.units.filter(u=>u.team===t&&u.kind==='villager').length,
   buildings:s.s.buildings.filter(b=>b.team===t).length,age:s.s.ages[t],landings:st[t].landings,landed:st[t].landed,islandClaims:st[t].islands,
   trained:Object.values(st[t].trained).reduce((a,b)=>a+b,0),warships:['sloop','frigate','bombketch'].reduce((n,k)=>n+(st[t].trained[k]||0),0),
   air:['scoutballoon','bomber'].reduce((n,k)=>n+(st[t].trained[k]||0),0)}});
 const [a,b]=seats,score=x=>x.defeated?-1:x.army*3+x.villagers+x.buildings*4;
 const winner=a.defeated!==b.defeated?(a.defeated?2:1):null;
 return{map,levels,sec,seed,time:Math.round(s.s.time),winner,leader:winner??(score(a)>score(b)?1:score(b)>score(a)?2:0),seats,wallMs:Date.now()-t0}}

function summarize(games){const out={};
 for(const g of games){const key=g.map+' '+g.levels.join('-')+' '+g.sec+'s';const o=out[key]??={games:0,wins:{1:0,2:0},leads:{1:0,2:0,0:0},seat:{1:[],2:[]}};o.games++;if(g.winner)o.wins[g.winner]++;o.leads[g.leader]++;for(const x of g.seats)o.seat[x.seat].push(x)}
 const mean=a=>a.length?+(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1):null,vals=(a,k)=>a.map(x=>x[k]).filter(v=>v!==null&&v!==undefined);
 for(const o of Object.values(out))for(const t of [1,2]){const a=o.seat[t];o.seat[t]={level:a[0].level,firstAttackMean:mean(vals(a,'firstAttack')),noAttackGames:a.filter(x=>x.firstAttack===null).length,
  mainAttacksMean:mean(vals(a,'mainAttacks')),mainAttacks:vals(a,'mainAttacks'),armyEndMean:mean(vals(a,'army')),peakArmyMean:mean(vals(a,'peakArmy')),villagersMean:mean(vals(a,'villagers')),
  buildingsMean:mean(vals(a,'buildings')),ageMean:mean(vals(a,'age')),landingsTotal:vals(a,'landings').reduce((x,y)=>x+y,0),islandClaimsTotal:vals(a,'islandClaims').reduce((x,y)=>x+y,0),
  warshipsMean:mean(vals(a,'warships')),airMean:mean(vals(a,'air')),defeated:a.filter(x=>x.defeated).length}}
 return out}

if(arg('game')){process.stdout.write(JSON.stringify(game(arg('root',path.resolve(__dirname,'../..')),JSON.parse(arg('game'))))+'\n');return}

const root=path.resolve(arg('root',path.resolve(__dirname,'../..'))),set=SETS[arg('set','full')],jobs=+arg('jobs',2);
if(!set)throw Error('unknown --set');
const queue=[];for(const m of set)for(const seed of SEEDS)queue.push({...m,seed});
queue.sort((a,b)=>b.sec-a.sec);
const games=[],t0=Date.now();let next=0;
function run(){if(next>=queue.length)return Promise.resolve();const g=queue[next++];return new Promise((res,rej)=>{let out='';const p=spawn(process.execPath,[__filename,'--game='+JSON.stringify(g),'--root='+root],{stdio:['ignore','pipe','inherit']});
 p.stdout.on('data',d=>out+=d);p.on('close',code=>{if(code)return rej(Error('game failed '+JSON.stringify(g)));const r=JSON.parse(out);games.push(r);
  console.error(`[${games.length}/${queue.length}] ${g.map} ${g.levels.join('-')} seed ${g.seed}: winner ${r.winner??'-'} leader ${r.leader} | `+r.seats.map(x=>`s${x.seat} ${x.level} first ${x.firstAttack??'-'} main ${x.mainAttacks} army ${x.army}/${x.peakArmy} age ${x.age} land ${x.landings}${x.defeated?' DEFEATED':''}`).join(' | ')+` (${(r.wallMs/1000).toFixed(0)} s)`);res()})}).then(run)}
Promise.all(Array.from({length:jobs},run)).then(()=>{games.sort((a,b)=>(a.map+a.levels+a.sec).localeCompare(b.map+b.levels+b.sec)||a.seed-b.seed);
 let commit='';try{commit=require('node:child_process').execSync('git rev-parse --short HEAD',{cwd:root}).toString().trim()}catch{}
 const result={label:arg('label',''),commit,root:path.basename(root),created:new Date().toISOString(),dt:DT,seeds:SEEDS,wallSec:Math.round((Date.now()-t0)/1000),summary:summarize(games),games};
 const out=arg('out');if(out)fs.writeFileSync(out,JSON.stringify(result,null,1)+'\n');
 for(const [k,o] of Object.entries(result.summary))console.log(k,'| wins',o.wins[1]+':'+o.wins[2],'leads',o.leads[1]+':'+o.leads[2]+':'+o.leads[0],'|',[1,2].map(t=>{const x=o.seat[t];return`s${t} ${x.level} first ${x.firstAttackMean}(none ${x.noAttackGames}) main ${x.mainAttacksMean} [${x.mainAttacks}] army ${x.armyEndMean}/${x.peakArmyMean} vill ${x.villagersMean} age ${x.ageMean} landings ${x.landingsTotal} islands ${x.islandClaimsTotal} ships ${x.warshipsMean} air ${x.airMean} defeated ${x.defeated}`}).join(' | '));
}).catch(e=>{console.error(e);process.exit(1)});
