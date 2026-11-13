/* Human-like computer play (docs/ai-humanlike-v42.md). Headless, deterministic: production simulation class
   (network-model.js), fixed maps and seeds, no rendering. "before" = the same class with s.aiHumanOff (the v42 layer off).
   Checks: counters follow scouted enemy units only; outmatched armies withdraw; mid-game harassment; villagers flee and
   economy buildings are rebuilt; expert beats normal; difficulty changes reaction/actions; replays and server
   hydration are identical. Prints before/after numbers. usage: node check-ai-humanlike.cjs [--quick] */
const assert=require('node:assert/strict'),K=require('./public/network-model.js'),D=K.defs,DT=.1,QUICK=process.argv.includes('--quick'),ONLY=(process.argv.find(a=>a.startsWith('--only='))||'').slice(7).split(',').filter(Boolean),want=k=>!ONLY.length||ONLY.includes(k);
const now=()=>Number(process.hrtime.bigint())/1e6;
function sim({seed=5,map='lake_s',level='normal',off=false,seats=2,doctrine=null,levels=null,doctrines=null,net=false}){
 const nations=['britain','france','prussia'].slice(0,seats),s=new (net?K.NetworkSim:K.Sim)(level,null,{nations,groups:nations.map((_,i)=>i+1),mapId:map,fog:true,seed,...(net?{humanTeams:[0]}:{})});if(off)s.s.aiHumanOff=true;
 if(levels)levels.forEach((l,i)=>l&&s.setDifficulty(i,l));if(doctrine)s.setDoctrine(1,doctrine);if(doctrines)doctrines.forEach((d,i)=>d&&s.setDoctrine(i,d));
 const log=[],emit=s.emit.bind(s);s.emit=(type,p={})=>{if(p.team>0&&(type==='trained'||/^ai|^raid/.test(type)))log.push({t:s.s.time,type,team:p.team,kind:p.kind,why:p.why});return emit(type,p)};
 let aiMs=0;for(const key of ['ai','raids','aiMicro']){const f=s[key].bind(s);s[key]=(...a)=>{const t=now();const r=f(...a);aiMs+=now()-t;return r}}
 return {s,log,ms:()=>aiMs}}
const run=(r,seconds,each)=>{const n=Math.round(seconds/DT);for(let i=0;i<n&&!r.s.s.ended;i++){r.s.tick(DT);each?.(r.s,i)}return r};
const town=(s,t)=>s.s.buildings.find(b=>b.team===t&&b.kind==='town');
const military=k=>D[k]&&D[k].damage>0&&k!=='villager'&&!D[k].building;
const stats=(s,t)=>s.s.aiHuman?.[t]?.stats||{};
const pct=v=>Math.round(v*100)+'%';
const out=[];const row=(...a)=>{out.push(a.join(' | '));console.log(a.join(' | '))};

/* ---- 1. scouting and counters ---- */
function counterRun(enemyKind,off,hidden=false,from=null){const r=sim({seed:5,doctrine:'expand',off}),s=r.s,home=town(s,0),t1=town(s,1);let spot={x:(home.x+t1.x)/2,y:(home.y+t1.y)/2};for(let i=0;i<30&&!K.worldPlayable(s.world,spot.x,spot.y);i++){spot.x=(spot.x*3+home.x)/4;spot.y=(spot.y*3+home.y)/4}
 if(hidden){spot={x:Math.min(s.world.width-80,Math.max(80,2*home.x-t1.x)),y:Math.min(s.world.height-80,Math.max(80,2*home.y-t1.y))};for(let i=0;i<30&&!K.worldPlayable(s.world,spot.x,spot.y);i++){spot.x=(spot.x+home.x)/2;spot.y=(spot.y+home.y)/2}}
 for(let i=0;i<12;i++){const u=s.add(enemyKind,0,spot.x-180+(i%6)*60,spot.y+Math.floor(i/6)*50);u.order={type:'hold'}}
 for(const [dx,dy]of[[230,-120],[230,140]]){const t=s.add('tower',0,home.x+dx,home.y+dy);t.complete=true;t.hp=t.maxhp||D.tower.hp}
 let seenEarly=null,first=Infinity;run(r,QUICK?600:720,(x)=>{if(seenEarly===null&&x.s.time>=25)seenEarly={...(x.s.aiHuman?.[1]?.seen||{})};if(first===Infinity&&x.s.aiWar?.[1]?.intel?.[enemyKind]>0)first=x.s.time});
 const trained=r.log.filter(e=>e.type==='trained'&&e.team===1&&military(e.kind)&&e.t>=(from??first)).map(e=>e.kind),counter=trained.filter(k=>K.counterMultiplier(k,enemyKind)>1&&K.counterMultiplier(enemyKind,k)<=1);
 return {first,share:trained.length?counter.length/trained.length:0,n:trained.length,seen:s.s.aiHuman?.[1]?.seen||{},seenEarly,halls:stats(s,1).counterHalls||0,trains:stats(s,1).counterTrains||0}}
if(want('1')){console.log('== 1. scouting and counters (lake_s seed 5, normal, expand doctrine; enemy holds 12 units at the map middle; share of military trained after the first sighting that counters it) ==');
const C={};for(const kind of ['cavalry','archer'])for(const off of [false,true]){C[kind+off]=counterRun(kind,off,false,off?Math.min(C[kind+'false'].first,QUICK?600:720):null);row('enemy '+kind,off?'before':'after',(off?'counted from the after-run sighting':'first seen '+Math.round(C[kind+off].first)+' s'),pct(C[kind+off].share)+' of '+C[kind+off].n,'counter halls '+C[kind+off].halls,'extra counter trains '+C[kind+off].trains)}
assert(C.cavalryfalse.share>C.cavalrytrue.share,'after: more anti-cavalry than before');assert(C.archerfalse.share>=C.archertrue.share,'after: at least as many anti-archer units as before');
assert(C.cavalryfalse.seen.cavalry>0&&C.archerfalse.seen.archer>0,'scouted enemy units are remembered');
assert.deepEqual(C.cavalryfalse.seenEarly,{},'no knowledge before anything was seen');
const H=counterRun('cavalry',false,true);row('hidden cavalry (never in sight)','after','seen '+JSON.stringify(H.seen));assert(!H.seen.cavalry,'units never in sight are not known (no cheating)');}

/* ---- 2. outmatched armies withdraw to safety ---- */
function retreatRun(off,level='normal'){const r=sim({seed:5,doctrine:'rush',off,levels:[null,level]}),s=r.s,home=town(s,0),own=town(s,1);
 s.s.units=s.s.units.filter(u=>u.team!==0||u.kind==='villager');const camp={x:home.x+(own.x-home.x)/Math.hypot(own.x-home.x,own.y-home.y)*260,y:home.y+(own.y-home.y)/Math.hypot(own.x-home.x,own.y-home.y)*260};for(let i=0;i<20;i++)s.add('musketeer',0,camp.x-200+(i%8)*50,camp.y-50+Math.floor(i/8)*45);for(const [dx,dy]of[[0,-160],[0,160]]){const t=s.add('tower',0,camp.x+dx,camp.y+dy);t.complete=true;t.hp=t.maxhp||D.tower.hp}
 for(const sg of[1,-1]){const a=Math.atan2(camp.y-own.y,camp.x-own.x)+sg*.5,t=s.add('tower',1,own.x+Math.cos(a)*330,own.y+Math.sin(a)*330);t.complete=true;t.hp=t.maxhp||D.tower.hp}const ids=[];for(let i=0;i<10;i++)ids.push(s.add('infantry',1,own.x-150+(i%5)*55,own.y+160+Math.floor(i/5)*45).id);
 const w=s.doctrine(1);w.enemyBase={x:camp.x,y:camp.y,team:0};w.next.main=150;w.next.harass=1e9;
 run(r,300);const alive=ids.map(id=>s.byId(id)).filter(u=>u?.hp>0),safe=alive.filter(u=>s.s.buildings.some(b=>b.team===1&&(b.kind==='town'||D[b.kind]?.damage>0)&&Math.hypot(b.x-u.x,b.y-u.y)<520));
 return {alive:alive.length,safe:safe.length,retreats:r.log.filter(e=>e.type==='aiRetreat'&&e.team===1).length,focus:stats(s,1).focus||0}}
if(want('2')){console.log('== 2. 10 infantry attack a forward camp of 20 musketeers + 2 towers at the enemy town (AI home has 2 towers) (lake_s seed 5, main army due at 150 s, 300 s) ==');
const R={};for(const [lv,off]of[['normal',true],['normal',false],['expert',true],['expert',false]]){const k=lv+off;R[k]=retreatRun(off,lv);row(lv,off?'before':'after','survivors '+R[k].alive+'/10','near own town/tower '+R[k].safe,'retreat orders '+R[k].retreats,'focus orders '+R[k].focus)}
assert(R.expertfalse.retreats>=1,'outmatched wave withdraws');assert(R.expertfalse.alive>R.experttrue.alive,'expert after: more survivors than before');assert(R.normalfalse.alive>=R.normaltrue.alive,'normal after: no more losses than before');assert(R.expertfalse.safe>=1,'survivors end near a town/tower');}

/* ---- 3/5. computer vs computer: harassment, multiple fronts, expert vs normal ---- */
function duel(levels,off,seconds){const r=sim({seed:7,seats:3,levels:[null,...levels],off}),s=r.s;s.s.units=s.s.units.filter(u=>u.team!==0);s.s.buildings=s.s.buildings.filter(b=>b.team!==0||b.kind==='town');const obs=town(s,0);obs.x=40;obs.y=40;obs.hp=obs.maxhp=1e9;
 const t0=now();run(r,seconds);const wall=now()-t0,score=t=>{const army=s.s.units.filter(u=>u.team===t&&military(u.kind));return {army:army.length,power:Math.round(army.reduce((n,u)=>n+s.aiPower(u),0)),buildings:s.s.buildings.filter(b=>b.team===t).length,villagers:s.s.units.filter(u=>u.team===t&&u.kind==='villager').length,defeated:s.s.defeated.includes(t)}};
 const harass=t=>r.log.filter(e=>e.type==='aiHarass'&&e.team===t).length,withMain=t=>r.log.filter(e=>e.type==='aiHarass'&&e.team===t).length,legacy=t=>r.log.filter(e=>e.type==='raid'&&e.team===t).length;
 return {r,s,wall,ms:r.ms(),score:[null,score(1),score(2)],harass:[0,harass(1),harass(2)],raids:[0,legacy(1),legacy(2)],back:[0,stats(s,1).harassBack||0,stats(s,2).harassBack||0],orders:[0,stats(s,1).orders||0,stats(s,2).orders||0],doctrines:[s.s.aiWar[1].key,s.s.aiWar[2].key]}}
if(want('3')){const SEC=QUICK?600:720;console.log('== 3/5. computer vs computer (lake_s seed 7, three seats, seat 0 empty observer, '+SEC+' s) ==');
const strength=x=>x.power+x.buildings*40+x.villagers*10;const V={};
for(const off of [true,false])for(const levels of [['expert','normal'],['normal','expert']]){const k=levels.join('-')+(off?' before':' after'),d=duel(levels,off,SEC);V[k]=d;
 for(const t of [1,2])row(k,'seat '+t+' '+levels[t-1]+' ('+d.doctrines[t-1]+')','army '+d.score[t].army+' power '+d.score[t].power,'buildings '+d.score[t].buildings,'villagers '+d.score[t].villagers,d.score[t].defeated?'DEFEATED':'alive','harass parties '+d.harass[t]+' (withdrew '+d.back[t]+')','raids '+d.raids[t],'layer orders '+d.orders[t]);
 row(k,'computer decision time '+Math.round(d.ms)+' ms over '+SEC+' s sim ('+(d.ms/SEC*60).toFixed(1)+' ms per sim-minute), wall '+Math.round(d.wall)+' ms')}
for(const levels of [['expert','normal'],['normal','expert']]){const d=V[levels.join('-')+' after'],e=levels.indexOf('expert')+1,n=3-e;assert(strength(d.score[e])>strength(d.score[n]),'expert stronger than normal ('+levels.join(' vs ')+')');}
assert(V['expert-normal after'].harass[1]+V['normal-expert after'].harass[2]>=1,'expert harasses');assert(V['expert-normal before'].harass[1]===0,'before: no harass parties from this layer');
const msOn=V['expert-normal after'].ms+V['normal-expert after'].ms,msOff=V['expert-normal before'].ms+V['normal-expert before'].ms;row('computer decision time before/after',Math.round(msOff)+' ms / '+Math.round(msOn)+' ms');}

/* ---- 4/5. defense: villagers flee, troops answer, buildings are rebuilt; reaction by difficulty ---- */
function raidRun(level,off){const r=sim({seed:5,doctrine:'boom',off,levels:[null,level]}),s=r.s;run(r,300);const own=town(s,1),workers=s.s.units.filter(u=>u.team===1&&u.kind==='villager'&&u.order?.type==='gather').sort((a,b)=>Math.hypot(b.x-own.x,b.y-own.y)-Math.hypot(a.x-own.x,a.y-own.y)),v=workers[0];
 const vill=s.s.units.filter(u=>u.team===1&&u.kind==='villager').map(u=>u.id),spawn=s.s.time;for(let i=0;i<5;i++){const u=s.add('hussar',0,v.x+120+(i%3)*30,v.y+40+Math.floor(i/3)*30);s.order([u],{type:'advance',x:v.x,y:v.y})}
 const camp=s.s.buildings.filter(b=>b.team===1&&['lumbercamp','miningcamp'].includes(b.kind)&&b.complete).sort((a,b)=>Math.hypot(b.x-own.x,b.y-own.y)-Math.hypot(a.x-own.x,a.y-own.y))[0],campKind=camp?.kind,campAt=camp&&{x:camp.x,y:camp.y};if(camp)camp.hp=0;
 let firstFlee=null,lost60=null;run(r,180,(x)=>{if(firstFlee===null&&(x.s.aiHuman?.[1]?.stats?.flees||0)>0)firstFlee=x.s.time-spawn;if(lost60===null&&x.s.time-spawn>=60)lost60=vill.filter(id=>!x.byId(id)).length});
 const rebuilt=campAt&&s.s.buildings.some(b=>b.team===1&&b.kind===campKind&&Math.hypot(b.x-campAt.x,b.y-campAt.y)<200);const st=stats(s,1);
 return {layerRebuilt:st.rebuilt||0,lost60,flees:st.flees||0,returns:st.returns||0,answers:st.answers||0,rebuilt:!!rebuilt,campKind,react:firstFlee,orders:st.orders||0,mistakes:st.mistakes||0,skipped:st.skipped||0,minutes:(s.s.time-0)/60}}
if(want('4')){console.log('== 4/5. 5 hussars hit the farthest gatherers at 5:00, a drop site is destroyed (lake_s seed 5, boom doctrine, 180 s after) ==');
const F={};for(const [lv,off]of[['normal',true],['normal',false],['easy',false],['expert',true],['expert',false]]){const k=lv+off,x=F[k]=raidRun(lv,off);row(lv,off?'before':'after','villagers lost in 60 s '+x.lost60,'fled '+x.flees+' returned '+x.returns,'troops sent '+x.answers,x.campKind+' rebuilt '+x.rebuilt+' (by this layer '+x.layerRebuilt+')','first flee after '+(x.react===null?'-':x.react.toFixed(1)+' s'),'layer orders '+x.orders+' ('+(x.orders/x.minutes).toFixed(1)+'/min), skipped by APM '+x.skipped+', mistakes '+x.mistakes)}
assert(F.normalfalse.flees>0,'villagers flee');assert(F.normalfalse.lost60<=F.normaltrue.lost60&&F.expertfalse.lost60<F.experttrue.lost60,'after: fewer villagers lost than before');assert(F.normalfalse.rebuilt&&F.expertfalse.rebuilt,'drop site rebuilt');
assert(F.expertfalse.react!==null&&(F.easyfalse.react===null||F.expertfalse.react<F.easyfalse.react),'expert reacts faster than easy');
const apm=K.aiHumanSkill;assert(apm.expert.apm>apm.normal.apm&&apm.normal.apm>apm.easy.apm&&apm.easy.react>apm.expert.react,'difficulty table ordered');}

/* ---- determinism and server hydration (rebuild from saved state every 10 s, as each poll does) ---- */
function replay(hydrate){let r=sim({seed:9,seats:3,levels:[null,'expert','hard'],net:true});const s0=r.s;s0.s.units=s0.s.units.filter(u=>u.team!==0);s0.s.buildings=s0.s.buildings.filter(b=>b.team!==0||b.kind==='town');let s=s0;
 for(let i=0;i<Math.round((QUICK?300:420)/DT);i++){s.tick(DT);if(hydrate&&i%100===99)s=K.networkHydrate(JSON.parse(JSON.stringify(K.networkPersistent(s))))}
 return JSON.stringify({u:s.s.units.map(u=>[u.id,u.kind,Math.round(u.x),Math.round(u.y),Math.round(u.hp)]),h:s.s.aiHuman,r:s.s.resources})}
if(want('6')){const a=replay(false),b=replay(false);assert.equal(a,b,'identical replays');const h1=replay(true),h2=replay(true);assert.equal(h1,h2,'identical replays with hydration every 10 s');
const hh=JSON.parse(h1).h;assert(hh?.[1]?.stats&&Object.keys(hh[1].eco).length>0&&hh[2].ep>=0,'layer state kept and updated across hydration');console.log('replays identical; hydrated (server-style) replays identical and active')}
console.log('ai humanlike checks passed');
