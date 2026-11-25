/* v45 computer naval, amphibious and air play (docs/ai/naval-air-audit.md).
   Plugged in through the AI behaviour registry in ai-humanlike.js (K.registerAIBehavior); this file does not extend the Sim
   chain and wraps no function. The registry runs at most ONE job per simulation step for all computer seats together, so the
   work is spread across steps. Computer seats only (the registry checks aiHumanOn), per difficulty (LEVEL below).
   Jobs: 'build' (dock, warships, transports, aerodrome, balloons, bombers), 'fleet' (sea memory, escort, defend fishing and
   coast, raid enemy boats and shore buildings, scout an unseen overseas enemy), 'ferry' (an attack whose target sits on
   another land mass is carried over by transports, landed at a safe beach, regrouped and sent in; transports shuttle back,
   flee when hit), 'air' (bomber raids on weakly defended economy buildings, withdraw on anti-air or heavy losses, support the
   main attack on defences; balloons follow the army for artillery spotting).
   Deterministic: reads simulation state, random only through sim.rand; all memory in s.aiNaval[team] (saved and synced),
   created lazily (servers hydrate with Object.create). Terrain geography (land/sea regions, coast lists) is a pure function
   of the world, memoised per world signature and prewarmed when a simulation is constructed. Orders go through the same
   sim.order / train / construct / research / unload calls the rest of the computer uses. No unit/building numbers change. */
((root)=>{'use strict';
const CELL=48;
/* ferry: carry attacks over water (1) ; alone: only when no enemy can be reached by land (easy keeps its land game);
   ships: transports used by the ferry; loadWait: seconds a transport waits for a full load; full: sail only full (until loadWait);
   beachWait: seconds landed troops regroup at the beach before the assault; abortHp: transport turns back below this hp share;
   navy/navyAge/navyMax: warships wanted on a naval map (base, per age above I, cap); counter: answer seen enemy sea power ×;
   control: own fleet power ≥ enemy × control before the fleet goes raiding; raidMin: warships before raiding;
   bombketch: mortar ships wanted (age III, overseas or coastal targets); airAge: age for the aerodrome (0 = none);
   balloons/bombers: wanted; airEvery: seconds between bomber raids; aa: withdraw when anti-air power > bomber power × aa;
   think: seconds between jobs of one kind; margin: resources kept in the bank on top of a cost. */
const LEVEL={
 beginner:{ferry:1,alone:1,ships:1,loadWait:70,full:0,beachWait:35,abortHp:.35,navy:0,navyAge:0,navyMax:0,counter:0,control:9,raidMin:99,bombketch:0,airAge:0,balloons:0,bombers:0,airEvery:0,aa:1,think:9,margin:250,escort:0},
 easy:{ferry:1,alone:1,ships:1,loadWait:60,full:0,beachWait:40,abortHp:.4,navy:0,navyAge:0,navyMax:0,counter:0,control:9,raidMin:99,bombketch:0,airAge:0,balloons:0,bombers:0,airEvery:0,aa:1,think:7,margin:200,escort:0},
 normal:{ferry:1,alone:0,ships:1,loadWait:50,full:1,beachWait:45,abortHp:.45,navy:2,navyAge:1,navyMax:6,counter:1,control:1.4,raidMin:3,bombketch:0,airAge:4,balloons:1,bombers:2,airEvery:160,aa:.7,think:5,margin:150,escort:1},
 hard:{ferry:1,alone:0,ships:2,loadWait:45,full:1,beachWait:50,abortHp:.5,navy:3,navyAge:1,navyMax:9,counter:1.2,control:1.2,raidMin:3,bombketch:1,airAge:3,balloons:1,bombers:4,airEvery:110,aa:.9,think:3.5,margin:120,escort:1},
 expert:{ferry:1,alone:0,ships:2,loadWait:40,full:1,beachWait:55,abortHp:.55,navy:4,navyAge:2,navyMax:12,counter:1.4,control:1.05,raidMin:3,bombketch:2,airAge:3,balloons:2,bombers:6,airEvery:75,aa:1.1,think:2.5,margin:100,escort:1}};
const JOBS=['build','fleet','ferry','air'];
const ECO_TARGETS=['mill','lumbercamp','miningcamp','quarry','market','farm','dock','house'];
const DEFENCE=['tower','fort','cannonturret','coastbattery'];
const RES=['food','wood','gold','stone'];

function create(K){
 const D=K.defs,dist=K.distance;
 /* ---- terrain geography (pure, memoised) ---- */
 const GEO=new Map();
 const signature=w=>K.worldSignature?K.worldSignature(w):[w.id,w.seed,w.width,w.height,(w.starts||[]).length].join('|');
 function buildGeo(w){
  const R=K.landRegions(w),cols=Math.ceil(w.width/CELL),rows=Math.ceil(w.height/CELL),n=cols*rows,land=new Int32Array(n),sea=new Int32Array(n).fill(-1),water=new Uint8Array(n);
  for(let i=0;i<n;i++){const x=(i%cols)*CELL+24,y=((i/cols)|0)*CELL+24;land[i]=R.at(x,y);if(land[i]<0&&K.worldWater(w,x,y)&&!K.worldBridge?.(w,x,y)&&K.worldPlayable?.(w,x,y)!==false)water[i]=1}
  const seaSize=[];let ns=0;const q=[];
  for(let i=0;i<n;i++){if(!water[i]||sea[i]>=0)continue;sea[i]=ns;q.length=0;q.push(i);let size=0;while(q.length){const j=q.pop();size++;const c=j%cols,r=(j/cols)|0;
    if(c>0&&water[j-1]&&sea[j-1]<0){sea[j-1]=ns;q.push(j-1)}if(c<cols-1&&water[j+1]&&sea[j+1]<0){sea[j+1]=ns;q.push(j+1)}if(r>0&&water[j-cols]&&sea[j-cols]<0){sea[j-cols]=ns;q.push(j-cols)}if(r<rows-1&&water[j+cols]&&sea[j+cols]<0){sea[j+cols]=ns;q.push(j+cols)}}
   seaSize.push(size);ns++}
  /* coast: water cells next to a land cell, listed per land region (x,y = water point for ships, lx,ly = the land cell) */
  const coast={},touches=seaSize.map(()=>new Set());
  for(let i=0;i<n;i++){if(sea[i]<0)continue;const c=i%cols,r=(i/cols)|0;for(const [dc,dr]of[[1,0],[-1,0],[0,1],[0,-1]]){const a=c+dc,b=r+dr;if(a<0||b<0||a>=cols||b>=rows)continue;const k=b*cols+a,l=land[k];if(l<0)continue;touches[sea[i]].add(l);(coast[l]??=[]).push({x:c*CELL+24,y:r*CELL+24,lx:a*CELL+24,ly:b*CELL+24,sea:sea[i]});break}}
  const at=(x,y)=>{const c=Math.min(cols-1,Math.max(0,Math.floor(x/CELL))),r=Math.min(rows-1,Math.max(0,Math.floor(y/CELL)));return r*cols+c};
  return{landAt:(x,y)=>land[at(x,y)],seaAt:(x,y)=>sea[at(x,y)],
   /* nearest sea label within r px of a point (docks stand on land next to the water) */
   seaNear(x,y,r=200){let best=-1,bd=Infinity;const c0=Math.floor(x/CELL),r0=Math.floor(y/CELL),k=Math.ceil(r/CELL);for(let dr=-k;dr<=k;dr++)for(let dc=-k;dc<=k;dc++){const c=c0+dc,rr=r0+dr;if(c<0||rr<0||c>=cols||rr>=rows)continue;const s=sea[rr*cols+c];if(s<0)continue;const d=dc*dc+dr*dr;if(d<bd&&seaSize[s]>=40){bd=d;best=s}}return best},
   seasNear(x,y,r=200){const out=[];const c0=Math.floor(x/CELL),r0=Math.floor(y/CELL),k=Math.ceil(r/CELL);for(let dr=-k;dr<=k;dr++)for(let dc=-k;dc<=k;dc++){const c=c0+dc,rr=r0+dr;if(c<0||rr<0||c>=cols||rr>=rows)continue;const s=sea[rr*cols+c];if(s>=0&&seaSize[s]>=40&&!out.includes(s))out.push(s)}return out},
   waterNear(x,y,label,r=260){let best=null,bd=Infinity;const c0=Math.floor(x/CELL),r0=Math.floor(y/CELL),k=Math.ceil(r/CELL);for(let dr=-k;dr<=k;dr++)for(let dc=-k;dc<=k;dc++){const c=c0+dc,rr=r0+dr;if(c<0||rr<0||c>=cols||rr>=rows||sea[rr*cols+c]!==label)continue;const d=dc*dc+dr*dr;if(d>=2&&d<bd){bd=d;best={x:c*CELL+24,y:rr*CELL+24}}}return best},
   /* land region of the nearest land cell within r px (where an unload would put the troops) */
   landNear(x,y,r=185){let best=-1,bd=Infinity;const c0=Math.floor(x/CELL),r0=Math.floor(y/CELL),k=Math.ceil(r/CELL);for(let dr=-k;dr<=k;dr++)for(let dc=-k;dc<=k;dc++){const c=c0+dc,rr=r0+dr;if(c<0||rr<0||c>=cols||rr>=rows)continue;const l=land[rr*cols+c];if(l<0)continue;const d=dc*dc+dr*dr;if(d<bd&&d*CELL*CELL<=r*r){bd=d;best=l}}return best},
   coast,touches,seaSize}}
 function geo(sim){const w=sim.world;if(!w)return null;if(sim._naGeoW===w&&sim._naGeo)return sim._naGeo;const key=signature(w);let g=GEO.get(key);if(!g){g=buildGeo(w);GEO.set(key,g);if(GEO.size>4)GEO.delete(GEO.keys().next().value)}sim._naGeo=g;sim._naGeoW=w;return g}

 /* ---- helpers ---- */
 const level=(sim,team)=>LEVEL[sim.s.aiDifficulties?.[team]||sim.s.difficulty]||null;
 function state(sim,team){const s=sim.s;s.aiNaval??={};return s.aiNaval[team]??={enemySea:0,enemySeaN:0,ferry:null,air:null,fleet:{mode:'home',target:null,at:0},scout:null,checked:[],
  stats:{docks:0,warships:0,transports:0,loads:0,fullLoads:0,landings:0,landed:0,assaults:0,aborts:0,shipsLost:0,returns:0,adopted:0,fleetDefend:0,fleetRaids:0,escorts:0,seaScouts:0,aerodromes:0,balloons:0,bombers:0,airRaids:0,airSupport:0,airBack:0,cancelled:0}}}
 const live=(sim,id)=>{const u=id&&sim.byId(id);return u&&u.hp>0?u:null};
 const bank=(sim,team,cost,margin)=>{const b=sim.s.resources[team];return RES.every(r=>(b[r]||0)>=(cost[r]||0)+((cost[r]||0)>0?margin:0))};
 const popRoom=(sim,team,kind)=>sim.population(team)+(D[kind]?.pop||1)<=sim.capacity(team)-2;
 const hostileTeams=(sim,team)=>{const s=sim.s,out=[];for(let t=0;t<s.nations.length;t++)if(t!==team&&!s.defeated?.includes(t)&&sim.hostile(team,t)&&!sim.protection?.(team,t))out.push(t);return out};
 const centroid=units=>{let x=0,y=0;for(const u of units){x+=u.x;y+=u.y}return{x:x/units.length,y:y/units.length}};
 const power=(sim,list)=>list.reduce((n,u)=>n+sim.aiPower(u),0);
 const armedShip=(sim,u)=>sim.sea(u)&&D[u.kind]?.damage>0;
 const homeRegion=(sim,team,G)=>{const t=sim.townOf(team);return t?G.landAt(t.x,t.y):-1};
 /* enemy bases this seat knows or can assume: seen/remembered towns, the scouted base, else the hostile seat's start spot (a
    player knows the start positions of the map too) */
 function enemyBases(sim,team,view){const s=sim.s,out=[],teams=hostileTeams(sim,team);for(const b of view.buildings)if(b.kind==='town'&&b.hp>0&&teams.includes(b.team))out.push({x:b.x,y:b.y,id:b.id,team:b.team,known:1});
  for(const t of teams)if(!out.some(o=>o.team===t)){const p=sim.world?.starts?.[t];if(p)out.push({x:p.x,y:p.y,team:t,known:0})}return out}
 /* own docks usable from a sea label (complete, alive) and their sea label */
 function docks(sim,team,G){return sim.s.buildings.filter(b=>b.team===team&&b.kind==='dock'&&b.hp>0).map(b=>({b,sea:G.seaNear(b.x,b.y,200),seas:G.seasNear(b.x,b.y,200)})).filter(x=>x.sea>=0)}
 /* transports claimed by the older frontier island / flank code are left to it */
 function foreignShips(sim,team){const F=sim.s.aiFrontier?.[team],out=new Set();if(F?.isl?.shipId&&F.isl.stage!=='done')out.add(F.isl.shipId);if(F?.naval?.shipId)out.add(F.naval.shipId);return out}
 function wave(sim,team,id){return id?sim.s.aiWar?.[team]?.waves?.find(v=>v.id===id):null}
 function newWave(sim,team,fields){const w=sim.s.aiWar[team],v={id:(w.serial=(w.serial||0)+1),ids:[],via:null,lane:0,start:sim.s.time,launch:sim.s.time,at:sim.s.time,x:0,y:0,...fields};w.waves.push(v);return v}
 function aaPower(sim,team,p,r,view){let n=0;for(const e of view.units)if(e.hp>0&&e.team>=0&&sim.hostile(team,e.team)&&sim.antiAir?.(e)&&D[e.kind]?.damage>0&&dist(e,p)<r)n+=sim.aiPower(e);for(const b of view.buildings)if(b.hp>0&&b.team>=0&&sim.hostile(team,b.team)&&(b.kind==='tower'||D[b.kind]?.antiAir)&&dist(b,p)<r+(D[b.kind].range||0))n+=sim.aiPower(b)*1.3;return n}
 /* units this module holds for a job (a dock runner) sit in a wave of their own so the land planner and scout leave them alone */
 function hold(sim,team,N,key,ids){const w=sim.s.aiWar?.[team];if(!w)return;const id=N.holds?.[key];let v=id&&w.waves.find(x=>x.id===id);if(!ids.length){if(v){v.ids=[];v.done=true}if(N.holds)delete N.holds[key];return}
  if(!v){v=newWave(sim,team,{kind:'hold',stage:'hold',checked:1e12,target:{x:0,y:0,team:-1}});(N.holds??={})[key]=v.id}v.ids=ids.slice();v.stage='hold';v.checked=1e12}
 /* attack a target in sight; one only remembered under the fog gets an attack-move onto its spot (an attack order needs sight) */
 function strike(sim,team,units,t){const e=sim.byId(t.id);if(e&&e.hp>0&&(!sim.canSee||!sim.s.fogEnabled||sim.canSee(team,e)))sim.order(units,{type:'attack',id:e.id});else sim.order(units,{type:'advance',x:t.x,y:t.y})}
 function placeNear(sim,team,kind,p,worker,ring=[0,60,110,170]){for(const r of ring)for(let i=0;i<(r?8:1);i++){const a=i*Math.PI/4+r/97,x=p.x+Math.cos(a)*r,y=p.y+Math.sin(a)*r;if(sim.placementError(kind,x,y,team))continue;const res=sim.construct(kind,x,y,[worker],team);if(!res?.error)return res.building||true}return null}
 function freeWorker(sim,team,p,G,region){const list=(sim.aiWorkers?sim.aiWorkers(team):sim.s.units.filter(u=>u.team===team&&u.kind==='villager'&&u.hp>0&&!u.embarkedOn)).filter(u=>!['build','repair'].includes(u.order?.type)&&(region===undefined||G.landAt(u.x,u.y)===region));let best=null,bd=Infinity;for(const u of list){const d=dist(u,p);if(d<bd){bd=d;best=u}}return best}

 /* ---- the picture of the sea: is this a naval map for this seat, where are the targets ---- */
 function picture(sim,team,G,view){const town=sim.townOf(team);if(!town)return null;const home=G.landAt(town.x,town.y),bases=enemyBases(sim,team,view);
  const over=bases.filter(b=>{const r=G.landAt(b.x,b.y);return r>=0&&r!==home}),land=bases.filter(b=>G.landAt(b.x,b.y)===home);
  /* seas this seat can sail from: near seas, plus any farther sea that reaches an overseas enemy (a long walk to the port beats no port) */
  const seas=new Set();for(const c of G.coast[home]||[])if(G.seaSize[c.sea]>=60&&(dist(c,town)<2200||dist(c,town)<4200&&over.some(b=>G.touches[c.sea].has(G.landAt(b.x,b.y)))))seas.add(c.sea);
  /* a sea is shared with an enemy when an enemy base region touches it */
  const shared=[...seas].filter(sea=>bases.some(b=>G.touches[sea].has(G.landAt(b.x,b.y))));
  return{town,home,bases,over,land,seas:[...seas],shared}}

 /* ======== job: build ======== */
 function jobBuild(sim,team,L,N,G){const s=sim.s,view=sim.view(team),P=picture(sim,team,G,view);if(!P)return L.think*2;const age=s.ages[team],own=s.units.filter(u=>u.team===team&&u.hp>0);
  const ds=docks(sim,team,G),complete=ds.filter(d=>d.b.complete),navy=own.filter(u=>armedShip(sim,u)),transports=own.filter(u=>u.kind==='transport');
  /* a naval map for this seat: an enemy over the water, or enemy warships / boats seen on a shared sea (a lake alone is not) */
  const naval=P.over.length>0||N.enemySea>0||P.shared.length>0&&age>=2&&L.navy>0&&N.enemySea>0;
  /* dock on a sea that reaches the targets (overseas enemy first) */
  const wantSeas=P.over.length?P.seas.filter(sea=>P.over.some(b=>G.touches[sea].has(G.landAt(b.x,b.y)))):P.shared;
  if(naval&&age>=2&&(L.ferry&&P.over.length||L.navy>0)&&wantSeas.length&&!ds.some(d=>d.seas.some(x=>wantSeas.includes(x)))&&!s.buildings.some(b=>b.team===team&&b.kind==='dock'&&!b.complete)){
   const cost=sim.costFor('dock',team),foes=view.units.filter(e=>e.hp>0&&e.team>=0&&sim.hostile(team,e.team)&&D[e.kind]?.damage>0);
   const spots=(G.coast[P.home]||[]).filter(c=>wantSeas.includes(c.sea)&&dist(c,P.town)<4200&&!foes.some(e=>dist(e,c)<(D[e.kind].range||0)+320)).sort((a,b)=>dist(a,P.town)-dist(b,P.town));
   /* a foundation needs a villager next to the shore: one walks to the nearest stretch (held out of other jobs) and builds there */
   if(!spots.length)return L.think*2;let run=live(sim,N.runner);if(run&&(run.team!==team||run.kind!=='villager'||G.landAt(run.x,run.y)!==P.home))run=null;
   if(!run){run=freeWorker(sim,team,spots[0],G,P.home);N.runner=run?.id||0;if(!run)return L.think}
   hold(sim,team,N,'runner',[run.id]);
   const near=spots.filter(c=>dist(c,run)<520);if(!near.length){const to=spots[0];if(!run.order||run.order.type!=='move'||Math.hypot(run.order.x-to.lx,run.order.y-to.ly)>60)sim.order([run],{type:'move',x:to.lx,y:to.ly});return L.think}
   /* the port decides the war over the water: no margin, and look again soon while the bank is short */
   if(!bank(sim,team,cost,0))return 1.5;if(s.time<(N.dockAt||0)||!sim.aiAct(team))return L.think;N.dockAt=s.time+10;
   /* a few stretches per try (placement tests are not free); the next try comes 10 s later */
   for(let i=0;i<near.length&&i<6;i++){const c=near[(i*3+Math.floor(s.time/10))%near.length],v=run;const site={x:(c.lx*2+c.x)/3,y:(c.ly*2+c.y)/3};if(placeNear(sim,team,'dock',site,v,[0,40,80])){N.stats.docks++;sim.emit('aiDock',{team});N.dockAt=s.time+40;hold(sim,team,N,'runner',[]);N.runner=0;
     /* ships shoot foundations on the shore: a few free ranged troops stand guard at the site */
     const guard=(sim.aiFree?sim.aiFree(team):[]).filter(u=>sim.stat(u,'range')>100&&G.landAt(u.x,u.y)===P.home).sort((a,b)=>dist(a,site)-dist(b,site)).slice(0,L.navy>2?6:3);if(guard.length)sim.order(guard,{type:'advance',x:site.x,y:site.y});break}}
   return L.think}
  const dock=complete.filter(d=>!wantSeas.length||d.seas.some(x=>wantSeas.includes(x))).sort((a,b)=>(a.b.queue||[]).length-(b.b.queue||[]).length)[0]?.b;
  if(dock&&(dock.queue||[]).length<2&&!(dock.queue||[]).some(q=>q.type==='research')){
   /* transports for the ferry (in queue counts as owned) */
   const queued=k=>s.buildings.reduce((n,b)=>n+(b.team===team?(b.queue||[]).filter(q=>q.kind===k).length:0),0);
   const fs=foreignShips(sim,team),dseas=ds.find(d=>d.b===dock)?.seas||[],mine=transports.filter(u=>!fs.has(u.id)&&dseas.includes(G.seaAt(u.x,u.y)>=0?G.seaAt(u.x,u.y):G.seaNear(u.x,u.y,150))).length+queued('transport');
   if(L.ferry&&P.over.length&&(!L.alone||!P.land.length)&&mine<L.ships&&popRoom(sim,team,'transport')&&bank(sim,team,sim.costFor('transport',team),L.margin*.5)&&!sim.unitError(dock,'transport')){if(!sim.train(dock,'transport'))N.stats.transports++;return L.think}
   /* warships: base by age, answer what was seen at sea */
   let want=0;if(naval&&L.navy){want=P.over.length?L.navy+L.navyAge*Math.max(0,age-1):Math.min(2,L.navy);const per=age>=3?150:80;if(N.enemySea>0)want=Math.max(want,Math.ceil(N.enemySea*L.counter/per)+1);want=Math.min(want,P.over.length?L.navyMax:L.navy>2?3:2)}
   /* an enemy over the water nobody has seen: at least one ship on this sea to go and look (every level) */
   if(P.over.length&&!P.bases.some(b=>b.known)&&!s.aiWar?.[team]?.enemyBase)want=Math.max(want,1);
   const here=navy.filter(u=>dseas.includes(G.seaAt(u.x,u.y)>=0?G.seaAt(u.x,u.y):G.seaNear(u.x,u.y,150))),have=here.length+queued('sloop')+queued('frigate')+queued('bombketch');
   if(have<want){const ketches=navy.filter(u=>u.kind==='bombketch').length+queued('bombketch'),coastal=age>=3&&L.bombketch&&ketches<L.bombketch&&navy.length>=2&&(P.over.length||view.buildings.some(b=>b.hp>0&&b.team>=0&&sim.hostile(team,b.team)&&G.seaNear(b.x,b.y,380)>=0));
    const sloops=navy.filter(u=>u.kind==='sloop').length;const kind=coastal?'bombketch':age>=3&&(sloops>=2||N.enemySeaN>=2)?'frigate':'sloop';
    if(!sim.unitError(dock,kind)&&popRoom(sim,team,kind)&&bank(sim,team,sim.costFor(kind,team),L.margin)){if(!sim.train(dock,kind))N.stats.warships++}}}
  /* air: aerodrome, balloons, aeronautics, bombers */
  /* air: on a land map the aerodrome waits one more age (the land army comes first) */
  if(L.airAge&&age>=(P.over.length?L.airAge:Math.max(4,L.airAge))){const aero=s.buildings.filter(b=>b.team===team&&b.kind==='aerodrome'&&b.hp>0);
   if(!aero.length){const cost=sim.costFor('aerodrome',team);if(bank(sim,team,cost,L.margin)&&!s.buildings.some(b=>b.team===team&&!b.complete&&b.hp>0&&D[b.kind]?.trains)&&sim.aiAct(team)){const v=freeWorker(sim,team,P.town,G,P.home);if(v){const sp=sim.aiBaseSpread?.(team)??1;for(let i=0;i<14;i++){const a=sim.rand(0,Math.PI*2),r=(280+sim.rand(0,220))*sp,p={x:P.town.x+Math.cos(a)*r,y:P.town.y+Math.sin(a)*r};if(G.landAt(p.x,p.y)!==P.home||sim.placementError('aerodrome',p.x,p.y,team))continue;if(!sim.construct('aerodrome',p.x,p.y,[v],team)?.error){N.stats.aerodromes++;sim.emit('aiAerodrome',{team});break}}}}return L.think}
   const a=aero.find(b=>b.complete&&(b.queue||[]).length<2);if(a){const balloons=own.filter(u=>u.kind==='scoutballoon').length+(a.queue||[]).filter(q=>q.kind==='scoutballoon').length,bombers=own.filter(u=>u.kind==='bomber').length+(a.queue||[]).filter(q=>q.kind==='bomber').length;
    if(balloons<(P.over.length?L.balloons:1)&&!sim.unitError(a,'scoutballoon')&&popRoom(sim,team,'scoutballoon')&&bank(sim,team,sim.costFor('scoutballoon',team),L.margin)){if(!sim.train(a,'scoutballoon'))N.stats.balloons++}
    else if(L.bombers&&age>=5&&!(s.tech[team]?.aeronautics>0)&&!(a.queue||[]).some(q=>q.type==='research')){if(!sim.researchError(a,'aeronautics')&&bank(sim,team,sim.researchCost?sim.researchCost('aeronautics',team):{},L.margin))sim.research(a,'aeronautics')}
    else if(bombers<L.bombers&&!sim.unitError(a,'bomber')&&popRoom(sim,team,'bomber')&&bank(sim,team,sim.costFor('bomber',team),L.margin)){if(!sim.train(a,'bomber'))N.stats.bombers++}}}
  return L.think}

 /* ======== job: fleet ======== */
 function jobFleet(sim,team,L,N,G){const s=sim.s,view=sim.view(team),town=sim.townOf(team);if(!town)return L.think*2;
  /* sea memory: visible hostile warships (decays like the land memory) */
  let seen=0,seenN=0,boats=0;const foes=[];for(const e of view.units){if(e.hp<=0||e.team<0||!sim.hostile(team,e.team)||!sim.sea(e))continue;if(sim.canSee&&s.fogEnabled&&!sim.canSee(team,e))continue;foes.push(e);if(D[e.kind].damage>0){seen+=sim.aiPower(e);seenN++}else boats++}
  markBase(sim,team,view);N.enemySea=Math.round(Math.max(seen,N.enemySea*.97));N.enemySeaN=Math.max(seenN,Math.floor(N.enemySeaN*.97));N.enemyBoats=Math.max(boats,Math.floor((N.enemyBoats||0)*.97));if(N.enemySea<5){N.enemySea=0;N.enemySeaN=0}
  const fleet=s.units.filter(u=>u.team===team&&u.hp>0&&armedShip(sim,u));if(!fleet.length)return L.think*1.5;
  const ds=docks(sim,team,G),home=ds[0],fc=centroid(fleet),own=power(sim,fleet),F=N.fleet;const harbour=(home&&G.waterNear(home.b.x,home.b.y,home.sea,300))||fc;
  /* 0. an unseen overseas enemy: a ship scouts its coast (the land scout cannot cross) */
  const P=picture(sim,team,G,view);if(P)scoutOverseas(sim,team,G,N,view,P,fleet.filter(u=>u.kind==='sloop'||u.kind==='frigate'),'ship');
  const ships=fleet.filter(u=>u.id!==N.scout?.id);if(!ships.length)return L.think;
  if(!ships.length)return L.think;
  /* 1. escort: a loaded transport of the ferry is at sea */
  const Fr=N.ferry,sailing=L.escort&&Fr?.ships?.map(x=>({x,u:live(sim,x.id)})).find(o=>o.u&&(o.x.stage==='sail'||o.x.stage==='load'&&s.units.some(c=>c.embarkedOn===o.u.id)));
  /* 2. threats: enemy ships near own coast, fishing boats, transports */
  const mineSea=s.units.filter(u=>u.team===team&&u.hp>0&&sim.sea(u)&&!armedShip(sim,u)),guard=[town,...ds.map(d=>d.b),...mineSea];
  const threats=foes.filter(e=>guard.some(g=>dist(e,g)<(g===town?1300:650)));
  const threat=threats.length?power(sim,threats.filter(e=>D[e.kind].damage>0)):0;
  if(threats.length&&(threat===0||own>=threat*(L.control>2?.8:.75))){const t=threats.sort((a,b)=>(b.kind==='transport')-(a.kind==='transport')||dist(a,fc)-dist(b,fc))[0];if(sim.aiAct(team)){sim.order(ships.filter(u=>u.kind!=='bombketch'),{type:'attack',id:t.id});const k=ships.filter(u=>u.kind==='bombketch');if(k.length)sim.order(k,{type:'move',x:harbour.x,y:harbour.y});F.mode='defend';F.at=s.time;N.stats.fleetDefend++}return L.think}
  if(threats.length&&threat>own*.75){if(F.mode!=='home'&&sim.aiAct(team)){sim.order(ships,{type:'move',x:harbour.x,y:harbour.y});F.mode='home';F.at=s.time}return L.think}
  if(sailing){const ship=sailing.u,goal=sailing.x.beach||Fr.beach;const lead=goal?{x:ship.x+(goal.x-ship.x)*.18,y:ship.y+(goal.y-ship.y)*.18}:ship;if(G.seaAt(lead.x,lead.y)<0||dist(fc,lead)>160){if(sim.aiAct(team)){sim.order(ships.filter(u=>u.kind!=='bombketch'),{type:'advance',x:G.seaAt(lead.x,lead.y)>=0?lead.x:ship.x,y:G.seaAt(lead.x,lead.y)>=0?lead.y:ship.y});F.mode='escort';F.at=s.time;N.stats.escorts++}}return L.think}
  /* 3. raids: with sea control, hit boats, the enemy dock and shore buildings; withdraw when hurt or outgunned */
  if(F.mode==='raid'){const t=F.target&&sim.byId(F.target);const hp=fleet.reduce((n,u)=>n+u.hp,0)/Math.max(1,fleet.reduce((n,u)=>n+u.maxhp,0));
   let local=0;for(const e of view.units)if(e.hp>0&&e.team>=0&&sim.hostile(team,e.team)&&D[e.kind]?.damage>0&&dist(e,fc)<600&&(sim.sea(e)||(D[e.kind].range||0)>150))local+=sim.aiPower(e);for(const b of view.buildings)if(b.hp>0&&b.team>=0&&sim.hostile(team,b.team)&&D[b.kind]?.damage>0&&dist(b,fc)<(D[b.kind].range||0)+200)local+=sim.aiPower(b)*(b.kind==='fort'?1.6:1);
   if(hp<.45||local>own*(1/Math.max(.8,L.control))){if(sim.aiAct(team)){sim.order(ships,{type:'move',x:harbour.x,y:harbour.y});F.mode='home';F.at=s.time;F.next=s.time+60}return L.think}
   if(t&&t.hp>0&&s.time-F.at<150)return L.think;F.mode='home'}
  if(ships.length>=L.raidMin&&own>=N.enemySea*L.control&&s.time>=(F.next||0)&&P){const sea=G.seaAt(harbour.x,harbour.y);let best=null,bs=-Infinity;
   for(const e of view.units){if(e.hp<=0||e.team<0||!sim.hostile(team,e.team)||!sim.sea(e)||D[e.kind].damage>0)continue;if(G.seaNear(e.x,e.y,96)!==sea&&G.seaAt(e.x,e.y)!==sea)continue;const sc=3-dist(e,fc)/1500;if(sc>bs){bs=sc;best=e}}
   for(const b of view.buildings){if(b.hp<=0||b.team<0||!sim.hostile(team,b.team)||sim.protection?.(team,b.team))continue;if(!(b.kind==='dock'||ECO_TARGETS.includes(b.kind)||D[b.kind]?.trains))continue;const ws=G.seaNear(b.x,b.y,260);if(ws!==sea)continue;const def=view.buildings.filter(x=>x.hp>0&&x.team===b.team&&D[x.kind]?.damage>0&&dist(x,b)<(D[x.kind].range||0)+150).reduce((n,x)=>n+sim.aiPower(x)*(x.kind==='fort'?1.6:1),0);if(def>own*.5)continue;const sc=(b.kind==='dock'?2:1)-dist(b,fc)/2000-def/Math.max(1,own);if(sc>bs){bs=sc;best=b}}
   if(best&&sim.aiAct(team)){const guns=ships.filter(u=>u.kind!=='bombketch'),ketch=ships.filter(u=>u.kind==='bombketch');if(guns.length)strike(sim,team,guns,best);if(ketch.length){if(D[best.kind]?.building)strike(sim,team,ketch,best);else sim.order(ketch,{type:'move',x:fc.x,y:fc.y})};F.mode='raid';F.target=best.id;F.at=s.time;N.stats.fleetRaids++;sim.emit('aiFleetRaid',{team,target:best.team,kind:best.kind});return L.think}}
  /* 4. patrol (sea control, nothing to hit in sight): sweep the coast nearest an enemy base, which also finds its docks and boats */
  if(P&&ships.length>=L.raidMin&&own>=N.enemySea*L.control&&s.time>=(F.next||0)&&F.mode!=='patrol'){const sea=G.seaAt(harbour.x,harbour.y)>=0?G.seaAt(harbour.x,harbour.y):G.seaNear(fc.x,fc.y,150),bases=P.bases.filter(b=>!sim.s.defeated?.includes(b.team));
   const goal=bases.length?bases[Math.floor(sim.rand(0,bases.length))]:null,spot=goal&&(G.coast[G.landAt(goal.x,goal.y)]||[]).filter(c=>c.sea===sea).sort((a,b)=>dist(a,goal)-dist(b,goal))[Math.floor(sim.rand(0,6))];
   if(spot&&sim.aiAct(team)){sim.order(ships,{type:'advance',x:spot.x,y:spot.y});F.mode='patrol';F.at=s.time;F.next=s.time+150;return L.think}}
  if(F.mode==='patrol'&&s.time-F.at<90)return L.think;
  /* 5. idle: gather at the harbour */
  if(F.mode!=='home'||dist(fc,harbour)>500&&s.time-F.at>40){if(sim.aiAct(team)){sim.order(ships.filter(u=>!u.order||u.order.type!=='attack'||!sim.byId(u.order.id)),{type:'move',x:harbour.x,y:harbour.y});F.mode='home';F.at=s.time}}
  return L.think}

 /* any hostile building in sight tells where that seat lives (its start spot when the building is near it), the way the land
    scout marks the enemy base for the attack planner */
 function markBase(sim,team,view){const w=sim.s.aiWar?.[team];if(!w)return;if(w.enemyBase&&sim.hostile(team,w.enemyBase.team)&&!sim.s.defeated?.includes(w.enemyBase.team))return;
  if(view.buildings.some(b=>b.kind==='town'&&b.hp>0&&b.team>=0&&sim.hostile(team,b.team)))return;const b=view.buildings.find(b=>b.hp>0&&b.team>=0&&sim.hostile(team,b.team)&&!D[b.kind]?.wall&&!sim.protection?.(team,b.team));if(!b)return;
  const p=sim.world?.starts?.[b.team],base=p&&dist(p,b)<1600?p:b;w.enemyBase={x:base.x,y:base.y,team:b.team}}
 /* scouting an overseas enemy nobody has seen yet: the nearest unchecked start spot of a hostile seat on another land mass. A
    ship sails to the coast nearest to it (only on a sea that reaches that shore), a balloon flies straight there. Seeing a
    hostile building there marks the enemy base for the attack planner (s.aiWar[team].enemyBase), as the land scout does. */
 function scoutOverseas(sim,team,G,N,view,P,units,mode){const s=sim.s,w=s.aiWar?.[team];if(!w)return false;let S=N.scout;
  if(S){const u=live(sim,S.id);if(!u||u.team!==team){N.scout=null;S=null}
   else{const seen=view.buildings.find(b=>b.hp>0&&b.team>=0&&sim.hostile(team,b.team)&&dist(b,u)<1000);
    if(seen){const p=sim.world?.starts?.[seen.team],base=p&&dist(p,seen)<1400?p:seen;w.enemyBase={x:base.x,y:base.y,team:seen.team};(N.checked??=[]).push(S.goal.team);N.scout=null;const town=sim.townOf(team);if(town)sim.order([u],{type:'move',x:mode==='ship'&&S.home?S.home.x:town.x,y:mode==='ship'&&S.home?S.home.y:town.y});sim.emit('aiSeaScout',{team,found:seen.team,mode:S.mode});return false}
    if(dist(u,S.to)<260||s.time-S.since>240||s.time-S.since>20&&!u.order){(N.checked??=[]).push(S.goal.team);N.checkedAt=s.time;N.scout=null;return false}
    return S.mode===mode}}
  if(w.enemyBase&&sim.hostile(team,w.enemyBase.team)&&!s.defeated?.includes(w.enemyBase.team))return false;
  if(N.checked?.length&&s.time-(N.checkedAt||0)>200)N.checked=[];const cand=P.over.filter(b=>!b.known&&!(N.checked||[]).includes(b.team));if(!cand.length||!units.length)return false;
  for(const goal of cand.sort((a,b)=>dist(a,P.town)-dist(b,P.town))){const region=G.landAt(goal.x,goal.y);
   for(const u of units.slice().sort((a,b)=>sim.stat(b,'speed')-sim.stat(a,'speed'))){let to=goal,home=null;
    if(mode==='ship'){const sea=G.seaAt(u.x,u.y)>=0?G.seaAt(u.x,u.y):G.seaNear(u.x,u.y,150);if(sea<0||!G.touches[sea]?.has(region))continue;to=(G.coast[region]||[]).filter(c=>c.sea===sea).sort((a,b)=>dist(a,goal)-dist(b,goal))[0];if(!to)continue;home={x:u.x,y:u.y}}
    if(!sim.aiAct(team))return false;N.scout={id:u.id,goal:{x:goal.x,y:goal.y,team:goal.team},to:{x:to.x,y:to.y},home,since:s.time,mode};sim.order([u],{type:'move',x:to.x,y:to.y});N.stats.seaScouts++;return true}}
  return false}

 /* ======== job: ferry ======== */
 function chooseBeach(sim,team,G,region,sea,target,view){const list=G.coast[region]||[],step=Math.max(1,Math.floor(list.length/320));let best=null,bs=Infinity;
  const def=view.buildings.filter(b=>b.hp>0&&b.team>=0&&sim.hostile(team,b.team)&&(D[b.kind]?.damage>0||b.kind==='town'));
  for(let i=0;i<list.length;i+=step){const c=list[i];if(c.sea!==sea)continue;const p={x:c.lx,y:c.ly};if(sim.blocked(p.x,p.y))continue;const d=dist(p,target);let sc=Math.abs(d-950);for(const b of def){const r=(D[b.kind].range||200)+260;if(dist(b,p)<r)sc+=b.kind==='fort'?2600:1600}if(sc<bs){bs=sc;best=c}}
  return best}
 /* open land spots 60-150 px from a hull (boarding needs < 165), spread out, nearest first */
 function boardSlots(sim,ship,n){const out=[];for(const r of [90,125,150,65])for(let i=0;i<16;i++){const a=i*Math.PI/8+r/50,p={x:ship.x+Math.cos(a)*r,y:ship.y+Math.sin(a)*r};if(K.worldWater(sim.world,p.x,p.y)||sim.blocked(p.x,p.y)||out.some(q=>dist(q,p)<34))continue;out.push(p);if(out.length>=n)return out}return out}
 /* the boarding place: an open stretch of own shore near the dock (the dock itself and its crowd block the quay) */
 function quay(sim,G,dock,sea,home,bad=[]){let best=null,bd=Infinity;for(const c of G.coast[home]||[]){if(c.sea!==sea||bad.some(q=>Math.abs(q.x-c.lx)<200&&Math.abs(q.y-c.ly)<200))continue;const d=dist(c,dock);if(d<170||d>650)continue;if(sim.blocked(c.lx,c.ly)||sim.s.buildings.some(b=>b.hp>0&&dist(b,{x:c.lx,y:c.ly})<(D[b.kind]?.r||30)+70))continue;if(d<bd){bd=d;best=c}}
  if(best)return best;const w=G.waterNear(dock.x,dock.y,sea,300);return w&&{x:w.x,y:w.y,lx:dock.x,ly:dock.y}}
 function landedWave(sim,team,F){return wave(sim,team,F.landed)}
 function jobFerry(sim,team,L,N,G){const s=sim.s,w=s.aiWar?.[team],town=sim.townOf(team);if(!w||!town)return L.think*2;const home=G.landAt(town.x,town.y),view=sim.view(team);
  let F=N.ferry;
  /* waves aimed at another land mass: harassers go home, the main attack (and its flank) is adopted */
  const overseas=v=>{const r=G.landAt(v.target.x,v.target.y);return r>=0&&r!==home};
  for(const v of w.waves){if(v.ferry||v.landing||v.naval||!v.target||!['muster','march','attack'].includes(v.stage)||!overseas(v))continue;
   if(v.kind==='main'&&!F){const P=picture(sim,team,G,view);if(L.alone&&P.land.length){/* easy: keep fighting on land */const t=sim.nearest(town,P.land.filter(b=>b.known));if(t){v.target={x:t.x,y:t.y,id:t.id,team:t.team};continue}}
    const region=G.landAt(v.target.x,v.target.y);
    F=N.ferry={wave:v.id,target:{x:v.target.x,y:v.target.y,id:v.target.id||0,team:v.target.team},region,sea:-1,dock:0,port:null,beach:null,ships:[],landed:0,start:s.time,trips:0};
    v.stage='ferry';v.ferry=1;v.checked=1e12;N.stats.adopted++;
    const units=v.ids.map(id=>live(sim,id)).filter(Boolean),there=units.filter(u=>G.landAt(u.x,u.y)===region);
    if(there.length){v.ids=v.ids.filter(id=>!there.some(u=>u.id===id));const lw=newWave(sim,team,{kind:'main',target:{...F.target},stage:'attack',landing:1,beach:{x:there[0].x,y:there[0].y},x:there[0].x,y:there[0].y});lw.ids=there.map(u=>u.id);F.landed=lw.id;sim.order(there,{type:'advance',x:F.target.x,y:F.target.y})}
    F.go=1;
    sim.emit('aiFerry',{team,target:F.target.team,size:v.ids.length});continue}
   if(v.kind==='flank'&&F&&!F.done){const fw=wave(sim,team,F.wave);if(fw){fw.ids.push(...v.ids);v.ids=[];v.done=true;continue}}
   /* raiding parties cannot walk there */
   if(v.kind!=='main'){const units=v.ids.map(id=>live(sim,id)).filter(Boolean);v.stage='retreat';v.at=s.time;if(units.length)sim.order(units,{type:'move',x:town.x,y:town.y});N.stats.cancelled++}}
  if(!F)return L.think*1.5;
  const fw=wave(sim,team,F.wave);let lw=landedWave(sim,team,F);
  /* the port: an own complete dock on a sea that touches the target's shore (the build job puts one there) */
  const dock=F.dock&&live(sim,F.dock);if(!dock||!F.port){const ds=docks(sim,team,G).filter(d=>d.b.complete&&d.seas.some(x=>G.touches[x].has(F.region))).sort((a,b)=>dist(a.b,town)-dist(b.b,town));const port=ds[0],psea=port&&port.seas.find(x=>G.touches[x].has(F.region)),water=port&&quay(sim,G,port.b,psea,home,F.bad||[]);
   if(water){F.dock=port.b.id;F.sea=psea;F.port={x:water.x,y:water.y};F.quay={x:water.lx,y:water.ly};F.go=1}else{F.port=null;if(s.time-F.start>240&&!lw){if(fw){fw.stage='retreat';fw.at=s.time;fw.checked=s.time}N.ferry=null;N.stats.cancelled++;return L.think}}}
  if(F.go&&F.port&&fw){F.go=0;const d=F.quay||live(sim,F.dock),go=fw.ids.map(id=>live(sim,id)).filter(u=>u&&!u.embarkedOn&&G.landAt(u.x,u.y)===home);if(go.length&&sim.aiAct(team))sim.order(go,{type:'move',x:d.x+sim.rand(-60,60),y:d.y+sim.rand(-60,60)})}
  /* waiting troops (home land mass, not aboard) */
  const waiting=fw&&fw.stage==='ferry'?fw.ids.map(id=>live(sim,id)).filter(u=>u&&!u.embarkedOn&&G.landAt(u.x,u.y)===home):[];
  if(fw&&fw.stage!=='ferry')fw.ids=fw.ids.filter(id=>{const u=live(sim,id);return u&&!u.embarkedOn});
  /* ships: claim transports, train more in the build job */
  if(!F.port)return L.think;
  const fs=foreignShips(sim,team);F.ships=F.ships.filter(x=>{const u=live(sim,x.id);if(!u){N.stats.shipsLost++;return false}if(fs.has(x.id))return false;return true});
  const onSea=u=>{const a=G.seaAt(u.x,u.y);return (a>=0?a:G.seaNear(u.x,u.y,150))===F.sea};
  if(F.ships.length<L.ships)for(const u of s.units)if(F.ships.length<L.ships&&u.team===team&&u.kind==='transport'&&u.hp>0&&!u.embarkedOn&&!fs.has(u.id)&&!F.ships.some(x=>x.id===u.id)&&onSea(u))F.ships.push({id:u.id,stage:'port',since:s.time,hp0:u.hp});
  const cap=k=>D[k]?.cargoCapacity||D[k]?.cargo||6,cargoOf=ship=>s.units.filter(c=>c.embarkedOn===ship.id),popOf=list=>list.reduce((n,c)=>n+(D[c.kind].pop||1),0);
  const claimed=new Set();for(const x of F.ships){const ship=live(sim,x.id);for(const id of ship?.loadRequests||[])claimed.add(id)}
  for(const x of F.ships){const ship=live(sim,x.id),cargo=cargoOf(ship),load=popOf(cargo);
   if(x.stage==='port'){if(!F.port)continue;if(dist(ship,F.port)>200){if(!ship.order||ship.order.type!=='move'||Math.hypot(ship.order.x-F.port.x,ship.order.y-F.port.y)>60)sim.order([ship],{type:'move',x:F.port.x,y:F.port.y});continue}
    /* board the troops that have reached the quay; a full load when enough are there (or everybody left is there) */
    const quay=F.quay||live(sim,F.dock)||ship,all=waiting.filter(u=>!claimed.has(u.id)),pick=all.filter(u=>dist(u,quay)<420).sort((a,b)=>dist(a,ship)-dist(b,ship));const chosen=[];let p=0;for(const u of pick){const k=D[u.kind].pop||1;if(p+k>cap(ship.kind))continue;chosen.push(u);p+=k}
    if(all.length>pick.length&&s.time-(x.call||0)>20){x.call=s.time;const far=all.filter(u=>dist(u,quay)>=420&&(!u.order||u.order.type!=='move'));if(far.length&&sim.aiAct(team))sim.order(far,{type:'move',x:quay.x+sim.rand(-60,60),y:quay.y+sim.rand(-60,60)})}
    if(chosen.length&&(p>=cap(ship.kind)||!L.full||pick.length===all.length||s.time-x.since>L.loadWait*2)){if(!sim.aiAct(team))continue;
     /* each passenger walks to its own spot on the shore next to the hull (a crowd on one spot never reaches it), then boards */
     const slots=boardSlots(sim,ship,chosen.length);x.pass=chosen.map((u,i)=>({id:u.id,x:slots[i%Math.max(1,slots.length)]?.x??quay.x,y:slots[i%Math.max(1,slots.length)]?.y??quay.y}));
     for(const q of x.pass){const u=live(sim,q.id);if(dist(u,ship)<160)sim.order([u],{type:'embark',id:ship.id});else sim.order([u],{type:'move',x:q.x,y:q.y})}
     for(const u of chosen)claimed.add(u.id);x.stage='load';x.since=s.time;x.progress=s.time;x.load=load}continue}
   if(x.stage==='load'){const full=load>=cap(ship.kind),late=s.time-x.since>L.loadWait,pass=(x.pass||[]).map(q=>({q,u:live(sim,q.id)})).filter(o=>o.u&&!o.u.embarkedOn&&o.u.team===team);
    if(load!==x.load){x.load=load;x.progress=s.time}
    for(const {q,u}of pass){if(dist(u,ship)<160)sim.order([u],{type:'embark',id:ship.id});else if(!u.order||u.order.type!=='move')sim.order([u],{type:'move',x:q.x,y:q.y})}
    const coming=pass.some(o=>dist(o.u,ship)<700);
    if(full||late&&load>0&&(!coming||!L.full||s.time-x.since>L.loadWait*2)){const beach=chooseBeach(sim,team,G,F.region,F.sea,F.target,view);if(!beach){x.stage='flee';sim.order([ship],{type:'move',x:F.port.x,y:F.port.y});continue}F.beach={x:beach.x,y:beach.y,lx:beach.lx,ly:beach.ly};x.beach={...F.beach};sim.order([ship],{type:'stop'});x.pass=[];
     sim.order([ship],{type:'move',x:beach.x,y:beach.y});x.stage='sail';x.since=s.time;x.hp0=ship.hp;N.stats.loads++;if(full)N.stats.fullLoads++;F.trips++;sim.emit('aiSail',{team,size:cargo.length,pop:load,full})}
    else if(late&&!load&&s.time-x.since>L.loadWait*2){sim.order([ship],{type:'stop'});x.pass=[];x.stage='port';x.since=s.time}
    else if(pass.length&&s.time-x.progress>35){/* nobody boarded for a while: this stretch of shore does not work, try another quay */(F.bad??=[]).push({...(F.quay||ship)});F.port=null;F.quay=null;sim.order([ship],{type:'stop'});x.pass=[];x.stage='port';x.since=s.time}
    continue}
   if(x.stage==='sail'){const b=x.beach||F.beach;
    /* under fire: turn back (escort too weak or the hull is going) */
    let near=0;for(const e of view.units)if(e.hp>0&&e.team>=0&&sim.hostile(team,e.team)&&D[e.kind]?.damage>0&&dist(e,ship)<(D[e.kind].range||0)+160&&(sim.sea(e)||(D[e.kind].range||0)>150))near+=sim.aiPower(e);
    const escort=s.units.filter(u=>u.team===team&&u.hp>0&&armedShip(sim,u)&&dist(u,ship)<500).reduce((n,u)=>n+sim.aiPower(u),0);
    if(ship.hp<ship.maxhp*L.abortHp||ship.hp<x.hp0-ship.maxhp*.3&&near>escort){x.stage='flee';x.since=s.time;sim.order([ship],{type:'move',x:F.port.x,y:F.port.y});N.stats.aborts++;sim.emit('aiFerryAbort',{team});continue}
    const arrived=dist(ship,b)<170||dist(ship,{x:b.lx,y:b.ly})<200;
    const stopped=s.time-x.since>30&&!ship.path?.length&&!ship.order?.x;
    if((arrived||stopped)&&G.landNear(ship.x,ship.y)!==F.region&&s.time-x.since<150){const t={x:b.x+(b.lx-b.x)*.45,y:b.y+(b.ly-b.y)*.45};if(!ship.order||Math.hypot((ship.order.x??0)-t.x,(ship.order.y??0)-t.y)>30)sim.order([ship],{type:'move',x:t.x,y:t.y});continue}
    if(arrived||stopped||s.time-x.since>150){/* P4 4a: unload is a command that runs next step - queue it, look at who came ashore on the next run of this job */if(!x.unloading){x.unloading=cargo.map(u=>u.id);sim.unload(ship);continue}const before=x.unloading.map(id=>sim.byId(id)).filter(Boolean);delete x.unloading;const out=before.filter(u=>!u.embarkedOn&&u.hp>0);
     if(out.length){const there=out.filter(u=>G.landNear(u.x,u.y,96)===F.region);for(const u of out)if(fw)fw.ids=fw.ids.filter(id=>id!==u.id);
      if(!lw||lw.stage==='done'){lw=newWave(sim,team,{kind:'main',target:{...F.target},stage:'beach',landing:1,beach:{x:b.lx,y:b.ly},x:b.lx,y:b.ly,checked:s.time});F.landed=lw.id;F.landedAt=s.time}
      lw.ids.push(...out.map(u=>u.id));if(lw.stage==='beach'){const hold={x:b.lx+(F.target.x-b.lx)*.08,y:b.ly+(F.target.y-b.ly)*.08};sim.order(out,{type:'advance',x:hold.x,y:hold.y})}else sim.order(out,{type:'advance',x:lw.target.x,y:lw.target.y});
      N.stats.landings++;N.stats.landed+=out.length;sim.emit('aiLanding',{team,target:F.target.team,size:out.length,x:Math.round(b.lx),y:Math.round(b.ly),region:there.length*2>=out.length?'enemy':'other'});x.stage='return';x.since=s.time;sim.order([ship],{type:'move',x:F.port.x,y:F.port.y})}
     else if(s.time-x.since>160){x.stage='flee';sim.order([ship],{type:'move',x:F.port.x,y:F.port.y})}
     else{const t={x:b.x+(b.lx-b.x)*.5,y:b.y+(b.ly-b.y)*.5};sim.order([ship],{type:'move',x:t.x,y:t.y})}}continue}
   if(x.stage==='return'||x.stage==='flee'){/* F.port can be dropped (a quay that did not work) while a ship is out: treat as home */if(!F.port||dist(ship,F.port)<230||s.time-x.since>150){if(cargo.length){sim.unload(ship);sim.order(cargo,{type:'move',x:town.x,y:town.y})}if(x.stage==='flee')F.retryAt=s.time+30;x.stage='port';x.since=s.time;N.stats.returns++}
    else if(!ship.order||ship.order.type!=='move')sim.order([ship],{type:'move',x:F.port.x,y:F.port.y});continue}}
  /* the landed force: regroup at the beach, then assault; pushed back → regroup at the beach (home is over the water) */
  if(lw){const units=lw.ids.map(id=>live(sim,id)).filter(u=>u&&!u.embarkedOn);lw.ids=units.map(u=>u.id);
   if(!units.length){lw.done=true;F.landed=0;lw=null}
   else if(lw.stage==='beach'){const allIn=!waiting.length&&!F.ships.some(x=>x.stage==='load'||x.stage==='sail'&&cargoOf(live(sim,x.id)).length);
    if(allIn||s.time-(F.landedAt||s.time)>L.beachWait){const t=liveTarget(sim,team,G,F,view);if(t){lw.target=t;lw.stage='attack';lw.at=s.time;lw.checked=s.time;sim.order(units,{type:'advance',x:t.x,y:t.y});N.stats.assaults++;sim.emit('aiAssault',{team,target:t.team,size:units.length});sim.emit('raid',{team,target:t.team,wave:'landing'})}}}
   else if(lw.stage==='retreat'){lw.stage='beach';F.landedAt=s.time;lw.checked=s.time+20;const b=lw.beach;if(sim.aiAct(team))sim.order(units,{type:'move',x:b.x,y:b.y})}
   else if(lw.stage==='attack'){const t=lw.target.id?sim.byId(lw.target.id):null;if(t&&t.hp<=0||!t&&units.every(u=>!u.order)){const n=liveTarget(sim,team,G,F,view);if(n&&sim.aiAct(team)){lw.target=n;lw.at=s.time;sim.order(units,{type:'advance',x:n.x,y:n.y})}}}}
  /* done: nobody left to carry and nobody fighting over there */
  const busyShips=F.ships.some(x=>x.stage!=='port');if((!fw||!fw.ids.length||fw.stage!=='ferry')&&!busyShips&&!lw){if(fw&&fw.stage==='ferry'){fw.done=true}N.ferry=null;return L.think}
  if(s.time-F.start>900&&!lw){if(fw){fw.stage='retreat';fw.at=s.time;fw.checked=s.time}N.ferry=null;N.stats.cancelled++}
  return Math.min(L.think,2.5)}
 function liveTarget(sim,team,G,F,view){const t=F.target.id?sim.byId(F.target.id):null;if(t&&t.hp>0)return{x:t.x,y:t.y,id:t.id,team:t.team};
  let best=null,bd=Infinity;const from=F.beach?{x:F.beach.lx,y:F.beach.ly}:F.target;for(const b of view.buildings){if(b.hp<=0||b.team<0||!sim.hostile(team,b.team)||D[b.kind]?.wall||G.landAt(b.x,b.y)!==F.region)continue;const d=dist(b,from)-(b.kind==='town'?600:0);if(d<bd){bd=d;best=b}}
  if(best)return{x:best.x,y:best.y,id:best.id,team:best.team};return{x:F.target.x,y:F.target.y,id:0,team:F.target.team}}

 /* ======== job: air ======== */
 function jobAir(sim,team,L,N,G){const s=sim.s,w=s.aiWar?.[team],town=sim.townOf(team);if(!w||!town||!L.airAge)return L.think*3;
  const own=s.units.filter(u=>u.team===team&&u.hp>0&&!u.embarkedOn&&sim.air(u)),bombers=own.filter(u=>u.kind==='bomber'),balloons=own.filter(u=>u.kind==='scoutballoon');if(!own.length)return L.think*2;
  const view=sim.view(team),front=w.waves.find(v=>v.kind==='main'&&(v.stage==='attack'||v.stage==='march'||v.stage==='beach')&&v.ids.length);
  /* an overseas enemy nobody has seen: a balloon flies over (no terrain in its way) */
  markBase(sim,team,view);const P=picture(sim,team,G,view);if(P&&balloons.length)scoutOverseas(sim,team,G,N,view,P,balloons.filter(b=>w.scout?.id!==b.id),'air');
  /* balloons that are not the scout follow the army a little behind it (artillery spotting), else hover over the town */
  for(const b of balloons){if(w.scout?.id===b.id||N.scout?.id===b.id)continue;let p=town;if(front){const c={x:front.x||town.x,y:front.y||town.y},t=front.target||c,d=dist(c,t)||1;p={x:c.x-(t.x-c.x)/d*140,y:c.y-(t.y-c.y)/d*140}}if(dist(b,p)>220&&(!b.order||Math.hypot((b.order.x??b.x)-p.x,(b.order.y??b.y)-p.y)>160)&&sim.aiAct(team))sim.order([b],{type:'move',x:p.x,y:p.y})}
  if(!bombers.length)return L.think*1.5;
  /* claim bombers into one air wave the land code leaves alone */
  let A=wave(sim,team,N.air?.wave);if(!A){A=newWave(sim,team,{kind:'air',target:{x:town.x,y:town.y,team:-1},stage:'air',checked:1e12,x:town.x,y:town.y});N.air={wave:A.id,mode:'home',target:0,at:s.time,next:s.time+20,hits:0}}
  const ids=new Set(bombers.map(u=>u.id));for(const v of w.waves)if(v!==A&&v.ids.some(id=>ids.has(id)))v.ids=v.ids.filter(id=>!ids.has(id));A.ids=[...ids];A.stage='air';A.checked=1e12;
  const R=N.air,c=centroid(bombers),base=sim.nearest(c,s.buildings.filter(b=>b.team===team&&b.kind==='aerodrome'&&b.complete&&b.hp>0))||town,grp=power(sim,bombers);
  const hp=bombers.reduce((n,u)=>n+u.hp,0)/bombers.reduce((n,u)=>n+u.maxhp,0);
  if(R.mode==='raid'||R.mode==='support'){const t=R.target&&sim.byId(R.target),aa=aaPower(sim,team,c,420,view);
   if(hp<Math.min(.5,(R.hp0??1)-.3)||hp<.3||aa>grp*L.aa){sim.order(bombers,{type:'move',x:base.x,y:base.y});R.mode='back';R.at=s.time;R.next=s.time+L.airEvery*.6;N.stats.airBack++;sim.emit('aiAirBack',{team,why:aa>grp*L.aa?'antiair':'losses'});return L.think}
   if(t&&t.hp>0&&s.time-R.at<120)return L.think;
   /* target gone: chain to the next soft target in the area (up to three per sortie) */
   if(R.hits<2&&s.time-R.at<160){const n=airTarget(sim,team,G,view,c,R.mode,front,grp,L,700);if(n){R.target=n.id;R.hits++;strike(sim,team,bombers,n);return L.think}}
   sim.order(bombers,{type:'move',x:base.x,y:base.y});R.mode='back';R.at=s.time;return L.think}
  if(R.mode==='back'&&dist(c,base)>320&&s.time-R.at<90)return L.think;R.mode='home';
  if(bombers.length<2||s.time<R.next||bombers.some(u=>u.resupplying))return L.think;R.hp0=hp;
  /* support the main attack on its defences, else raid the economy */
  if(front&&front.stage==='attack'&&dist({x:front.x,y:front.y},front.target)<1100){const t=airTarget(sim,team,G,view,front.target,'support',front,grp,L,900);if(t&&sim.aiAct(team)){strike(sim,team,bombers,t);R.mode='support';R.target=t.id;R.at=s.time;R.hits=0;N.stats.airSupport++;sim.emit('aiAirStrike',{team,target:t.team,kind:t.kind,mode:'support'});return L.think}}
  const t=airTarget(sim,team,G,view,town,'raid',null,grp,L,1e9);if(t&&sim.aiAct(team)){strike(sim,team,bombers,t);R.mode='raid';R.target=t.id;R.at=s.time;R.hits=0;R.next=s.time+L.airEvery*(.85+sim.rand(0,.3));N.stats.airRaids++;sim.emit('aiAirStrike',{team,target:t.team,kind:t.kind,mode:'raid'});sim.emit('raid',{team,target:t.team,wave:'air'})}else R.next=s.time+20;
  return L.think}
 function airTarget(sim,team,G,view,from,mode,front,grp,L,within){let best=null,bs=-Infinity;const towns=view.buildings.filter(b=>b.kind==='town'&&b.hp>0&&b.team>=0&&sim.hostile(team,b.team));
  for(const b of view.buildings){if(b.hp<=0||b.team<0||!sim.hostile(team,b.team)||sim.protection?.(team,b.team)||D[b.kind]?.wall)continue;const d=dist(b,from);if(d>within)continue;
   let v;if(mode==='support'){v=DEFENCE.includes(b.kind)?3:b.kind==='town'?2:D[b.kind]?.trains?1.4:0;if(!v)continue}else{v=ECO_TARGETS.includes(b.kind)?(b.kind==='house'?.6:b.kind==='farm'?.8:1.6):0;if(!v)continue;const nt=towns.reduce((m,t)=>Math.min(m,dist(t,b)),Infinity);v+=Math.min(1,nt/900)}
   const aa=aaPower(sim,team,b,380,view);if(aa>grp*L.aa*(mode==='support'?1.5:1))continue;const sc=v-aa/Math.max(1,grp)*1.5-d/6000+(1-b.hp/Math.max(1,b.maxhp||D[b.kind]?.hp||b.hp))*.5;if(sc>bs){bs=sc;best=b}}
  return best}

 /* ---- registry entry ---- */
 const RUN={build:jobBuild,fleet:jobFleet,ferry:jobFerry,air:jobAir};
 return{id:'naval-air',jobs:JOBS,
  /* eligible seats: computer (checked by the registry), a level for its difficulty, not switched off (checks only) */
  active(sim,team){return !sim.s.aiNavalAirOff&&!!level(sim,team)},
  run(sim,team,job){const L=level(sim,team),G=geo(sim);if(!L||!G)return 30;const N=state(sim,team);return RUN[job](sim,team,L,N,G)},
  prewarm(sim){if(sim.world)geo(sim)},
  stats(sim,team){return sim.s.aiNaval?.[team]?.stats||null}}}

const api={create,LEVEL};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.KingdomAINavalAir=api;
})(typeof window==='undefined'?globalThis:window);
