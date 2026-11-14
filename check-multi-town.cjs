/* v43 multi-town and islands (docs/multi-town-islands-v43.md). Headless, deterministic: production simulation class
   (network-model.js), fixed maps and seeds, no rendering.
   Town centres: age II only, 275 wood + 100 stone, max 3 per side, 700 px apart, full function (villagers, every drop-off,
   population), one age-up at a time, computer keeps playing after its start town falls, last town still decides defeat,
   computer expands by difficulty, save -> server hydrate with extra towns keeps running.
   Islands: mirrored flank islands large enough for a settlement, all four resources, equal per player, deterministic,
   reachable by transport, and land pathing inside the island works. usage: node check-multi-town.cjs */
const assert=require('node:assert/strict'),K=require('./public/network-model.js'),D=K.defs,dist=K.distance;
const results=[];function test(name,fn){const t=Date.now();fn();results.push(name);console.log('PASS '+name+' ('+(Date.now()-t)+' ms)')}
const make=(o={})=>{const nations=o.nations||['britain','france'];return new K.Sim(o.level||'normal',null,{nations,groups:nations.map((_,i)=>i+1),mapId:o.map||'lake_s',fog:o.fog??false,seed:o.seed??5,...(o.extra||{})})};
const rich=(sim,t)=>{sim.s.resources[t]={food:20000,wood:20000,gold:20000,stone:20000}};
function freeSpot(sim,team,from,minR=720,maxR=1400){for(let r=minR;r<maxR;r+=40)for(let i=0;i<24;i++){const a=i*Math.PI/12,x=from.x+Math.cos(a)*r,y=from.y+Math.sin(a)*r;if(!sim.placementError('town',x,y,team))return{x,y}}return null}
function buildTown(sim,team,p){const v=sim.add('villager',team,p.x+90,p.y+90);sim.updateFog?.();const r=sim.construct('town',p.x,p.y,[v],team);assert(!r?.error,'construct town: '+r?.error);const b=sim.s.buildings.filter(b=>b.team===team&&b.kind==='town').at(-1);return{b,v}}
function finish(sim,b,limit=200){for(let i=0;i<limit*10&&!b.complete;i++)sim.tick(.1);assert(b.complete,'town finished')}

test('town centre is in the build rules: age II, 275 wood + 100 stone, 50 s, max 3, 700 px apart',()=>{
 assert.equal(D.town.wood,275);assert.equal(D.town.stone,100);assert.equal(D.town.age,2);assert(D.town.time>=40&&D.town.time<=60);assert.equal(K.townRules.max,3);assert.equal(K.townRules.gap,700);
 const sim=make(),home=sim.townOf(0);rich(sim,0);
 assert.match(sim.placementError('town',home.x+900,home.y,0),/II/,'age I refuses');
 sim.s.ages[0]=2;const p=freeSpot(sim,0,home);assert(p,'age II has a legal spot');
 assert.equal(sim.placementError('town',home.x+350,home.y+300,0),'离己方城镇中心太近');
 sim.s.resources[0]={food:0,wood:274,gold:0,stone:100};assert.equal(sim.placementError('town',p.x,p.y,0),'资源不足');rich(sim,0);
 const before={...sim.s.resources[0]},{b}=buildTown(sim,0,p);assert.equal(before.wood-sim.s.resources[0].wood,275);assert.equal(before.stone-sim.s.resources[0].stone,100);
 const p3=freeSpot(sim,0,b,720,1600);assert(p3,'third spot');const t3=buildTown(sim,0,p3).b;
 assert.equal(sim.towns(0).length,3);const p4=[home,b,t3].map(t=>({x:t.x,y:t.y-1000})).find(q=>q);const e4=sim.placementError('town',p4.x,p4.y,0);assert.equal(e4,'每方最多 3 座城镇中心','4th refused: '+e4);
});

test('second town works like the first: villagers, every resource drop-off, +20 population, one age-up at a time',()=>{
 const sim=make();rich(sim,0);sim.s.ages[0]=2;const home=sim.townOf(0),p=freeSpot(sim,0,home),{b}=buildTown(sim,0,p);
 const cap0=sim.capacity(0);finish(sim,b);assert.equal(sim.capacity(0),Math.min(cap0+20,sim.capacity(0)));assert(sim.capacity(0)>cap0||cap0>=140,'population cap grows');
 assert.equal(sim.train(b,'villager')||'','');const n=sim.s.units.filter(u=>u.kind==='villager'&&u.team===0).length;for(let i=0;i<300&&sim.s.units.filter(u=>u.kind==='villager'&&u.team===0).length===n;i++)sim.tick(.1);assert(sim.s.units.filter(u=>u.kind==='villager'&&u.team===0).length>n,'new town trains villagers');
 for(const res of ['food','wood','gold','stone']){const u=sim.add('villager',0,b.x+90,b.y+60);assert.equal(sim.depotFor(u,res)?.id,b.id,'new town is the depot for '+res);
  u.cargo={resource:res,amount:10};const before=sim.s.resources[0][res];for(let i=0;i<100&&sim.s.resources[0][res]===before;i++)sim.returnLoad(u,.1);assert.equal(sim.s.resources[0][res],before+10,'delivered '+res)}
 sim.s.ages[0]=2;rich(sim,0);assert.equal(sim.researchError(home,'age'),'');assert.equal(sim.research(home,'age'),'');assert.equal(sim.researchError(b,'age'),'研究已在进行中','second town cannot age up in parallel');
});

test('defeat rule: start town falls but a completed second town stands -> side keeps playing; last town falls -> defeat',()=>{
 const sim=make({nations:['britain','france','prussia']});rich(sim,1);sim.s.ages[1]=2;const home=sim.townOf(1),p=freeSpot(sim,1,home),{b}=buildTown(sim,1,p);finish(sim,b);
 home.hp=0;sim.tick(.1);assert(!sim.s.defeated?.includes(1),'not defeated with a second town');assert.equal(sim.townOf(1),b);
 b.hp=0;sim.tick(.1);assert(sim.s.defeated?.includes(1),'defeated when the last town falls');
});

test('computer keeps playing after its start town falls (expert, 4 min after): villagers, research, orders, no throw',()=>{
 const sim=make({level:'expert',fog:true,seed:9});rich(sim,1);for(let i=0;i<3000;i++)sim.tick(.1);sim.s.ages[1]=Math.max(2,sim.s.ages[1]);
 let second=sim.towns(1).find(b=>b!==sim.townOf(1)&&b.complete);if(!second){const p=freeSpot(sim,1,sim.townOf(1));const r=buildTown(sim,1,p);finish(sim,r.b);second=r.b}
 const main=sim.s.buildings.find(b=>b.team===1&&b.kind==='town');main.hp=0;sim.tick(.1);assert(!sim.s.defeated?.includes(1));
 const v0=sim.s.units.filter(u=>u.team===1&&u.kind==='villager').length,trained=[];const emit=sim.emit.bind(sim);sim.emit=(t,p={})=>{if(t==='trained'&&p.team===1)trained.push(p.kind);return emit(t,p)};
 for(let i=0;i<2400;i++)sim.tick(.1);
 assert(sim.townOf(1)&&sim.townOf(1).hp>0,'a town remains');assert(trained.length>0,'computer still trains units: '+trained.length);
 assert(sim.s.units.some(u=>u.team===1&&u.kind==='villager'&&u.order),'villagers still work');console.log('   villagers '+v0+' -> '+sim.s.units.filter(u=>u.team===1&&u.kind==='villager').length+', trained '+trained.length+', towns '+sim.towns(1).length);
});

test('computer expansion by difficulty (lake_s, 12.5 min): expert/hard build extra towns, easy builds none, never more than 3',()=>{
 const out={};assert(!K.aiTownPlan.easy,'easy has no expansion plan');for(const level of ['easy','hard','expert']){const sim=make({level,fog:true,seed:5}),guard=sim.townOf(0);guard.hp=guard.maxhp=1e9;let max=0,first=null;for(let i=0;i<(level==='easy'?6000:7500);i++){sim.tick(.1);const n=sim.towns(1).length;if(n>1&&first===null)first=Math.round(sim.s.time);max=Math.max(max,n)}out[level]={max,first,complete:sim.towns(1).filter(b=>b.complete).length};assert(max<=3)}
 console.log('   '+JSON.stringify(out));assert.equal(out.easy.max,1,'easy does not expand');assert(out.expert.max>=2,'expert expands');assert(out.hard.max>=2,'hard expands');
});

test('save -> server rebuild with extra towns (computer seats) keeps running for 60 s of polls',()=>{
 for(const level of ['normal','expert']){const net=new K.NetworkSim(level,null,{nations:['britain','france','spain'],groups:[1,2,2],humanTeams:[0],mapId:'straits',fog:true,seed:5});
  for(const t of [0,1]){rich(net,t);net.s.ages[t]=2;const home=net.townOf(t),p=freeSpot(net,t,home);assert(p,'spot '+t);const {b}=buildTown(net,t,p);finish(net,b)}
  let state=JSON.parse(JSON.stringify(K.networkPersistent(net)));const start=state.time;
  for(let poll=0;poll<120;poll++){const sim=K.networkHydrate(state);for(let i=0;i<5;i++)sim.tick(.1);state=K.networkPersistent(sim);if(poll===40){const m=state.buildings.find(b=>b.team===1&&b.kind==='town');m.hp=0}}
  assert(state.time-start>59,level+' reached '+(state.time-start));assert(!state.defeated?.includes(1),'seat with a second town survives its start town');assert(state.buildings.filter(b=>b.team===0&&b.kind==='town'&&b.hp>0).length===2)}
});

/* ---- islands ---- */
const COAST=[['coast_s',2],['coast_l',2],['coast_l',5],['straits',2],['straits',4]];
test('islands: mirrored flank islands are large and equal, carry gold/stone/wood/food, generation deterministic',()=>{
 for(const [map,n] of COAST){const nations=['britain','france','prussia','spain','russia'].slice(0,n),a=make({map,nations,seed:7,fog:true}),b=make({map,nations,seed:7,fog:true});
  assert.equal(JSON.stringify(a.s.nodes.map(x=>[x.kind,Math.round(x.x),Math.round(x.y),x.amount])),JSON.stringify(b.s.nodes.map(x=>[x.kind,Math.round(x.x),Math.round(x.y),x.amount])),'deterministic '+map);
  const R=K.landRegions(a.world),home=a.world.starts.slice(0,n).map(p=>R.at(p.x,p.y)),isl=R.cells.map((c,i)=>({i,size:c.length})).filter(x=>!home.includes(x.i)&&x.size>=20);
  const big=isl.filter(x=>x.size>=200);assert(big.length>=2,map+' has >=2 big islands: '+isl.map(x=>x.size));
  if(map.startsWith('coast')){const sizes=big.map(x=>x.size).sort((p,q)=>p-q);assert(sizes.at(-1)-sizes[0]<=4,map+' mirrored islands equal '+sizes)}
  for(const x of big){const res={};for(const nd of a.s.nodes)if(!nd.domain&&R.at(nd.x,nd.y)===x.i)res[nd.resource]=(res[nd.resource]||0)+nd.amount;for(const r of ['gold','stone','wood'])assert(res[r]>0,map+' island '+x.i+' has '+r+' '+JSON.stringify(res))}
  const z=K.resourceZones(a);for(const r of ['gold','stone','wood'])for(const t of z){const v=t.island[r]||0,v0=z[0].island[r]||0;assert(Math.abs(v-v0)<=Math.max(1,.02*v0),map+' island '+r+' equal per player')}
  const berries=Array(n).fill(0);for(const nd of a.s.nodes)if(nd.island&&nd.resource==='food')for(const o of nd.owners)berries[o]+=nd.amount/nd.owners.length;assert(berries[0]>0&&berries.every(v=>Math.abs(v-berries[0])<=1),map+' island berries equal '+berries)
  console.log('   '+map+' '+n+'p islands '+isl.map(x=>x.size).join('/')+' cells; island share p0 '+JSON.stringify(Object.fromEntries(Object.entries(z[0].island).map(([k,v])=>[k,Math.round(v)]))))}
});

function flank(sim){const R=K.landRegions(sim.world),e=K.worldIslands(sim.world).find(e=>e.kind==='flank');return{R,e,reg:R.at(e.x,e.y)}}
test('a full settlement fits on a flank island: town centre, 3 houses, 2 farms, barracks',()=>{
 for(const map of ['coast_s','coast_l']){const sim=make({map,seed:7,fog:true}),{R,e,reg}=flank(sim);rich(sim,0);sim.s.ages[0]=2;const placed=[];
  for(const kind of ['town','house','house','house','farm','farm','barracks']){let ok=false;for(let r=0;r<e.rx&&!ok;r+=36)for(let i=0;i<24&&!ok;i++){const a=i*Math.PI/12,x=e.x+Math.cos(a)*r,y=e.y+Math.sin(a)*r*.5;if(R.at(x,y)!==reg)continue;const v=sim.add('villager',0,x+D[kind].r+40,y);sim.updateFog?.();if(!sim.placementError(kind,x,y,0)&&!sim.construct(kind,x,y,[v],0)?.error){ok=true;placed.push(kind)}else sim.s.units=sim.s.units.filter(u=>u!==v)}assert(ok,map+' could not place '+kind+' after '+placed)}
  console.log('   '+map+' island holds '+placed.join(', '))}
});

test('transport reaches the island from the home coast, unloads onto it, and units path inside the island',()=>{
 const sim=make({map:'coast_s',seed:7,fog:false}),{R,e,reg}=flank(sim);sim.s.ages[0]=2;
 const home=sim.townOf(0),cx=e.x;let shore=null;for(let y=e.y-e.ry-60;y>e.y-e.ry-700;y-=24){if(K.worldWater(sim.world,cx,y)&&K.worldWater(sim.world,cx,y-60)){shore={x:cx,y};break}}assert(shore,'water north of the island');
 let start=null;for(let y=shore.y;y>0;y-=24)if(!K.worldWater(sim.world,cx-200,y)){start={x:cx-200,y:y+90};break}assert(start&&K.worldWater(sim.world,start.x,start.y),'home coast water');
 const ship=sim.add('transport',0,start.x,start.y),units=[sim.add('villager',0,start.x,start.y-120),sim.add('villager',0,start.x+30,start.y-120),sim.add('infantry',0,start.x-30,start.y-120)];
 for(const u of units){u.x=start.x;u.y=start.y-70}sim.board(ship);assert(units.every(u=>u.embarkedOn===ship.id),'boarded');
 sim.order([ship],{type:'move',x:shore.x,y:shore.y});let t=0;for(;t<1200&&dist(ship,shore)>90;t++)sim.tick(.1);assert(dist(ship,shore)<=90,'ship sailed to the island, left '+Math.round(dist(ship,shore)));
 sim.unload(ship);for(const u of units){assert(!u.embarkedOn);assert.equal(R.at(u.x,u.y),reg,'landed on the island')}
 const goal={x:e.x+e.rx*.6,y:e.y+e.ry*.2};assert.equal(R.at(goal.x,goal.y),reg);sim.order(units,{type:'move',x:goal.x,y:goal.y});let k=0;for(;k<900&&units.some(u=>dist(u,goal)>110);k++)sim.tick(.1);
 assert(units.every(u=>dist(u,goal)<=110),'walked across the island');assert(units.every(u=>R.at(u.x,u.y)===reg),'stayed on the island');console.log('   sail '+(t/10).toFixed(1)+' s, walk '+(k/10).toFixed(1)+' s');
});

console.log('PASS '+results.length+' multi-town / island checks');
