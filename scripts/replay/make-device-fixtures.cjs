#!/usr/bin/env node
'use strict';
/* Device consistency check (public/consistency.html): generates the standard recordings it replays and their "answer key".
   - public/consistency/<name>.json      P1 replay format v1 (setup + captured player commands + checksum every 20 steps), recorded by
                                         playing a scripted game through attachRecorder exactly like make-fixtures.cjs does;
   - public/consistency/expected.json    answer key produced by REPLAYING each recording in Node: for every 20 steps the checksum and
                                         its parts (units / buildings / nodes / economy), so the page can say which kind of state differs.
   Three cases, 40-60 s each: battle (two armies + towers fighting), build (houses, barracks, farms, wall line, age-up, debug fast build),
   economy (gathering all four resources, villager production, market tech, rally point).
   Re-run only when gameplay changes on purpose (say why in the commit), like the P1 fixtures.
   usage: node scripts/replay/make-device-fixtures.cjs [--dry: compare with the committed files, write nothing] */
const fs=require('node:fs'),path=require('node:path'),{loadK,loadReplay,ROOT}=require('./lib.cjs');
const OUT=path.join(ROOT,'public/consistency'),dry=process.argv.includes('--dry');
const near=(a,list)=>list.slice().sort((x,y)=>Math.hypot(x.x-a.x,x.y-a.y)-Math.hypot(y.x-a.x,y.y-a.y)||x.id-y.id)[0];
function spot(sim,kind,town,start){for(let r=start;r<900;r+=40)for(let k=0;k<16;k++){const a=k*Math.PI/8+r/97,x=town.x+Math.cos(a)*r,y=town.y+Math.sin(a)*r;if(!sim.placementError(kind,x,y,0))return {x,y}}return {x:town.x+start,y:town.y+start}}
const alive=(sim,f)=>sim.s.units.filter(u=>u.hp>0&&f(u));
const townOf=(sim,team)=>sim.s.buildings.find(b=>b.team===team&&b.kind==='town'&&b.hp>0);
const gatherAll=(sim,K,group,pick,town)=>{if(!group.length)return;const nodes=sim.s.nodes.filter(n=>(n.amount??1)>0&&Math.hypot(n.x-town.x,n.y-town.y)<1100&&sim.canGather(group[0],n));const want=nodes.filter(pick);const n=near(town,want.length?want:nodes);if(n)sim.order(group,{type:'gather',id:n.id})};
const res=k=>n=>n.kind===k||n.resource===k||n.type===k;
/* Battle: both sides get the same mixed army half way between their towns (sim.add is a captured command), then fight with
   advance / attack / regroup orders while the computer opponent also reacts. */
function battle(sim,step,K){const s=sim.s,t0=townOf(sim,0),t1=townOf(sim,1);if(!t0||!t1)return;
  const mx=(t0.x+t1.x)/2,my=(t0.y+t1.y)/2,dx=(t1.x-t0.x),dy=(t1.y-t0.y),len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;
  if(step===1){const kinds=['infantry','infantry','infantry','archer','archer','infantry','archer','infantry'];
    for(const [team,side] of [[0,-1],[1,1]])for(let i=0;i<16;i++){const row=Math.floor(i/8),col=i%8-3.5,x=mx+ux*side*(150+row*40)-uy*col*34,y=my+uy*side*(150+row*40)+ux*col*34;sim.add(kinds[i%8],team,Math.round(x),Math.round(y))}}
  const mine=alive(sim,u=>u.team===0&&u.kind!=='villager'&&K.defs[u.kind].damage>0);
  if(step===20&&mine.length)sim.order(mine,{type:'advance',x:Math.round(mx+ux*120),y:Math.round(my+uy*120)});
  if(step===240&&mine.length){const e=near(mine[0],alive(sim,u=>u.team!==0&&!sim.allied(0,u.team)));if(e)sim.order(mine,{type:'attack',id:e.id})}
  if(step===420&&mine.length)sim.order(mine.filter((u,i)=>i%2===0),{type:'move',x:Math.round(mx-ux*60),y:Math.round(my-uy*60)});
  if(step===520&&mine.length)sim.order(mine,{type:'advance',x:t1.x,y:t1.y});
  if(step===40){const v=alive(sim,u=>u.team===0&&u.kind==='villager');gatherAll(sim,K,v,res('food'),t0)}
  if(step%200===30)sim.train(t0,'villager')}
/* Build: debug mode (unlimited resources, ~1 s construction) so a 45 s recording covers many building kinds and a wall line. */
function build(sim,step,K){const t=townOf(sim,0);if(!t)return;const v=alive(sim,u=>u.team===0&&u.kind==='villager');
  if(step===1)sim.sendChat('debug');
  const plan={20:'house',60:'barracks',100:'farm',140:'house',180:'blacksmith',220:'market',260:'farm',300:'range',340:'stable',380:'tower'};
  if(plan[step]&&v.length){const kind=plan[step];if(K.defs[kind]){const p=spot(sim,kind,t,180+(step%7)*20);sim.construct(kind,Math.round(p.x),Math.round(p.y),[v[step/20%v.length|0],v[(step/20+1)%v.length|0]],0)}}
  if(step===420&&v.length>=3&&typeof sim.constructLine==='function'){const a={x:Math.round(t.x-260),y:Math.round(t.y+300)},b={x:Math.round(t.x+40),y:Math.round(t.y+360)};sim.constructLine('wall',a,b,v.slice(0,3),0)}
  if(step===500)sim.research(t,'age');
  if(step%120===10)sim.train(t,'villager');
  if(step===600){const farm=sim.s.buildings.find(b=>b.team===0&&b.kind==='farm'&&b.complete&&b.hp>0);const idle=v.filter(u=>!u.order).slice(0,2);if(farm&&idle.length)sim.order(idle,{type:'gather',id:farm.id})}
  if(step===700){const bar=sim.s.buildings.find(b=>b.team===0&&b.kind==='barracks'&&b.complete&&b.hp>0);if(bar){sim.train(bar,'infantry');sim.setRally(bar,{x:Math.round(t.x+150),y:Math.round(t.y-120)})}}}
/* Economy: villagers split over food / wood / gold / stone, continuous villager training with a rally point onto wood, a house,
   a market and its gather tech, re-tasking idle villagers. Normal resources (no debug). */
function economy(sim,step,K){const t=townOf(sim,0);if(!t)return;const v=alive(sim,u=>u.team===0&&u.kind==='villager');
  if(step===1){const q=Math.ceil(v.length/4);gatherAll(sim,K,v.slice(0,q),res('food'),t);gatherAll(sim,K,v.slice(q,2*q),res('wood'),t);gatherAll(sim,K,v.slice(2*q,3*q),res('gold'),t);gatherAll(sim,K,v.slice(3*q),res('stone'),t)}
  if(step%150===5)sim.train(t,'villager');
  if(step===60){const tree=near(t,sim.s.nodes.filter(res('wood')));if(tree)sim.setRally(t,{type:'gather',id:tree.id,x:tree.x,y:tree.y})}
  if(step===200&&v[0]){const p=spot(sim,'house',t,170);sim.construct('house',Math.round(p.x),Math.round(p.y),[v[0]],0)}
  if(step===420&&v[1]){const p=spot(sim,'market',t,240);sim.construct('market',Math.round(p.x),Math.round(p.y),[v[1],v[2]].filter(Boolean),0)}
  if(step===640){const idle=v.filter(u=>!u.order);gatherAll(sim,K,idle,res('gold'),t)}
  if(step===900){const m=sim.s.buildings.find(b=>b.team===0&&b.kind==='market'&&b.complete&&b.hp>0);if(m)sim.research(m,'gather')}
  if(step===1000){const idle=v.filter(u=>!u.order);gatherAll(sim,K,idle,res('food'),t)}}
const CASES=[
  {name:'battle',title:['战斗','Battle'],steps:800,play:battle,difficulty:'normal',options:{nations:['britain','france'],mapId:'coast_s',seed:5150,fog:true}},
  {name:'build',title:['建造','Building'],steps:900,play:build,difficulty:'easy',options:{nations:['china','japan'],mapId:'cliff_s',seed:8080,fog:false}},
  {name:'economy',title:['经济','Economy'],steps:1200,play:economy,difficulty:'hard',options:{nations:['spain','ottoman','russia'],groups:[1,2,3],mapId:'lake_s',seed:2718,fog:true}},
];
/* The answer key: replay each recording (NOT the recording run itself) so it is exactly what the browser page computes. */
function answer(R,K,data,checksum){const parts=[];const r=R.runReplay(K,data,{onStep:(sim,step)=>{if(step%data.every===0)parts.push(checksum(sim))}});
  return {steps:r.steps,every:data.every,checksums:r.checksums.map((c,i)=>({step:c.step,hash:c.hash,parts:parts[i].parts})),final:{step:r.final.step,hash:r.final.hash,parts:r.final.parts,units:r.final.units},mismatch:r.results.mismatch.length}}
module.exports={CASES,OUT,answer};
if(require.main===module)(async()=>{const K=loadK(),R=await loadReplay(),{checksum}=await require('./lib.cjs').loadHash();
  const key={format:'kingdom-consistency-answers',version:1,every:20,source:'scripts/replay/make-device-fixtures.cjs (Node replay)',recordings:[]};const texts=new Map();
  for(const c of CASES){const sim=new K.Sim(c.difficulty,null,JSON.parse(JSON.stringify(c.options)));R.prewarm(sim);
    const rec=R.attachRecorder(sim,{difficulty:c.difficulty,options:c.options,source:'scripts/replay/make-device-fixtures.cjs'});
    for(let i=0;i<c.steps;i++){c.play(sim,i,K);sim.tick(R.STEP)}
    const out=rec.export();out.meta.created=null;out.meta.name=c.name;
    const a=answer(R,K,out,checksum),diff=R.firstDifference(a.checksums,out.checksums);
    if(diff||a.final.hash!==out.final.hash||a.mismatch)throw Error(`${c.name}: Node replay differs from the recorded game (${JSON.stringify(diff)}) - cannot make an answer key`);
    texts.set(c.name+'.json',JSON.stringify(out)+'\n');
    key.recordings.push({name:c.name,file:c.name+'.json',title:c.title,map:c.options.mapId,steps:out.steps,seconds:out.steps*out.step,commands:out.commands.length,methods:[...new Set(out.commands.map(x=>x.m))],units:a.final.units,checksums:a.checksums,final:a.final});
    console.log(`${c.name}: ${out.steps} steps (${out.steps*out.step} s), ${out.commands.length} commands (${[...new Set(out.commands.map(x=>x.m))].join(',')}), final ${out.final.hash}, ${a.final.units} units`)}
  texts.set('expected.json',JSON.stringify(key)+'\n');
  if(dry){let ok=true;for(const [f,t] of texts){const p=path.join(OUT,f),same=fs.existsSync(p)&&fs.readFileSync(p,'utf8')===t;console.log(`${f}: ${same?'IDENTICAL':'DIFFERENT'}`);ok=ok&&same}if(!ok)process.exitCode=1;return}
  fs.mkdirSync(OUT,{recursive:true});for(const [f,t] of texts)fs.writeFileSync(path.join(OUT,f),t);console.log('wrote '+[...texts.keys()].map(f=>'public/consistency/'+f).join(', '))})().catch(e=>{console.error(e);process.exit(1)});
