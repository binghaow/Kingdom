#!/usr/bin/env node
'use strict';
/* Generates the standard P1 replays in scripts/replay/fixtures/ by PLAYING games through the recorder: a scripted player (team 0)
   calls the same simulation methods the UI calls (order: gather/move/advance/attack, construct, train, research incl. age-up,
   setRally), the computer players run on their own, every call is captured by attachRecorder exactly as in the browser.
   Each fixture = setup + recorded commands + checksum every 20 steps; check-replay.cjs replays them and demands identical checksums.
   Re-run only when gameplay changes on purpose, and say why in the commit (redesign-plan.md section 3).
   usage: node scripts/replay/make-fixtures.cjs [--steps 1200] [--dry: compare with the committed fixtures, write nothing] */
const fs=require('node:fs'),path=require('node:path'),{loadK,loadReplay,FIXTURES}=require('./lib.cjs');
const argv=process.argv.slice(2),dry=argv.includes('--dry'),steps=+(argv[argv.indexOf('--steps')+1]||0)||1200;
const CASES=[
  {name:'coast_s-2p',difficulty:'normal',options:{nations:['britain','france'],mapId:'coast_s',seed:4242,fog:true}},
  {name:'lake_s-3p',difficulty:'hard',options:{nations:['china','japan','spain'],groups:[1,2,3],mapId:'lake_s',seed:777,fog:true}},
  {name:'straits-4p',difficulty:'normal',options:{nations:['russia','prussia','ottoman','usa'],groups:[1,1,2,2],mapId:'straits',seed:2024,fog:true}},
  {name:'cliff_s-2p',difficulty:'easy',options:{nations:['netherlands','britain'],mapId:'cliff_s',seed:31337,fog:false}},
];
const near=(a,list)=>list.slice().sort((x,y)=>Math.hypot(x.x-a.x,x.y-a.y)-Math.hypot(y.x-a.x,y.y-a.y)||x.id-y.id)[0];
function spot(sim,kind,town,start){for(let r=start;r<760;r+=40)for(let k=0;k<16;k++){const a=k*Math.PI/8+r/97,x=town.x+Math.cos(a)*r,y=town.y+Math.sin(a)*r;if(!sim.placementError(kind,x,y,0))return {x,y}}return {x:town.x+start,y:town.y+start}}
/* Scripted player: decisions read only simulation state, so the same script always issues the same commands. */
function player(sim,step,K){const s=sim.s,D=K.defs,town=s.buildings.find(b=>b.team===0&&b.kind==='town'&&b.hp>0);if(!town)return;
  const vills=s.units.filter(u=>u.team===0&&u.kind==='villager'&&u.hp>0),army=s.units.filter(u=>u.team===0&&u.hp>0&&u.kind!=='villager'&&D[u.kind].damage>0&&!sim.sea?.(u)&&!sim.air?.(u));
  const nodes=s.nodes.filter(n=>(n.amount??1)>0&&Math.hypot(n.x-town.x,n.y-town.y)<900);
  if(step===1){const half=Math.ceil(vills.length/2);for(const [group,pick] of [[vills.slice(0,half),n=>n.kind==='berries'||n.resource==='food'||n.type==='food'],[vills.slice(half),n=>n.kind==='tree'||n.resource==='wood'||n.type==='wood']]){const g=group.filter(Boolean);const cand=nodes.filter(n=>g.length&&sim.canGather(g[0],n)&&pick(n));const n=near(town,cand.length?cand:nodes.filter(n=>g.length&&sim.canGather(g[0],n)));if(n&&g.length)sim.order(g,{type:'gather',id:n.id})}}
  if(step%180===20)sim.train(town,'villager');
  if(step===90&&vills[0]){const p=spot(sim,'house',town,160);sim.construct('house',p.x,p.y,[vills[0]],0)}
  if(step===240)sim.setRally(town,{x:town.x+110,y:town.y-90});
  if(step===330)sim.research(town,'age');
  if(step===420&&vills[1]){const p=spot(sim,'barracks',town,240);sim.construct('barracks',p.x,p.y,[vills[1]],0)}
  if(step===1150)sim.research(town,'age');
  if(step===600&&army.length)sim.order(army,{type:'move',x:town.x+220,y:town.y-40});
  if(step===760){const idle=vills.filter(u=>!u.order);const n=near(town,nodes.filter(n=>idle[0]&&sim.canGather(idle[0],n)));if(n)sim.order(idle,{type:'gather',id:n.id})}
  if(step===900&&army.length){const foe=near(town,s.buildings.filter(b=>b.team>0&&b.kind==='town'&&!sim.allied(0,b.team)));if(foe)sim.order(army,{type:'advance',x:foe.x,y:foe.y})}
  if(step===1050&&army.length){const e=near(army[0],s.units.filter(u=>u.hp>0&&u.team!==0&&!sim.allied(0,u.team)&&sim.canSee(0,u)));if(e)sim.order(army,{type:'attack',id:e.id})}}
(async()=>{const K=loadK(),R=await loadReplay();fs.mkdirSync(FIXTURES,{recursive:true});
  for(const c of CASES){const sim=new K.Sim(c.difficulty,null,JSON.parse(JSON.stringify(c.options)));R.prewarm(sim);
    const rec=R.attachRecorder(sim,{difficulty:c.difficulty,options:c.options,source:'scripts/replay/make-fixtures.cjs'});
    for(let i=0;i<steps;i++){player(sim,i,K);sim.tick(R.STEP)}
    const out=rec.export();out.meta.created=null;out.meta.name=c.name;
    const ai=new Set(sim.s.units.filter(u=>u.team>0).map(u=>u.team));
    const text=JSON.stringify(out,null,0)+'\n',target=path.join(FIXTURES,c.name+'.json');
    if(dry){const same=fs.existsSync(target)&&fs.readFileSync(target,'utf8')===text;console.log(`${c.name}: ${same?'IDENTICAL to fixtures':'DIFFERENT from fixtures'}`);if(!same)process.exitCode=1;continue}
    fs.writeFileSync(target,text);
    console.log(`${c.name}: ${out.steps} steps, ${out.commands.length} player commands (${[...new Set(out.commands.map(c=>c.m))].join(',')}), ${out.checksums.length} checksums, final ${out.final.hash}, units ${out.final.units}, computer teams active ${[...ai].join(',')}`)}})().catch(e=>{console.error(e);process.exit(1)});
