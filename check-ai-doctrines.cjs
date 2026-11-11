/* Hidden computer doctrines (docs/design/roster-redesign.md 7.1, docs/gameplay-v39.md).
   Deterministic: real production simulation class (network-model.js), fixed map and seeds, no rendering.
   Prints each doctrine's first-10-minute build / train / scout / warning / attack / retreat timeline and asserts that the
   four doctrines open differently, that attack timing is not a fixed interval, and that replays are identical. */
const assert=require('node:assert/strict'),K=require('./public/network-model.js'),D=K.defs,MAP='lake_s',DT=.1;
function make(seed,doctrine){const s=new K.Sim('normal',null,{nations:['britain','france'],groups:[1,2],mapId:MAP,fog:true,seed});
 // Player 0 is a passive but defended opponent so a ten-minute timeline is observable for every doctrine.
 const home=s.s.buildings.find(b=>b.team===0&&b.kind==='town');for(let i=0;i<6;i++)s.add('infantry',0,home.x-160+i*40,home.y+170);for(let i=0;i<4;i++)s.add('archer',0,home.x-80+i*40,home.y+215);
 for(const [dx,dy]of[[230,-120],[230,140]]){const t=s.add('tower',0,home.x+dx,home.y+dy);t.complete=true;t.hp=t.maxhp||D.tower.hp}
 if(doctrine)s.setDoctrine(1,doctrine);const log=[];const emit=s.emit.bind(s);
 s.emit=(type,p={})=>{if(p.team===1){const t=Math.round(s.s.time);if(type==='built'&&!['house','farm'].includes(p.kind))log.push([t,'build',p.kind]);else if(type==='trained'&&D[p.kind]?.damage>0)log.push([t,'train',p.kind]);else if(type==='research'&&/时代/.test(p.name||''))log.push([t,'age',p.name.split(' ')[0]]);else if(type==='aiScoutOut')log.push([t,'scout',p.kind]);else if(type==='raidWarning')log.push([t,'warning',p.size+' troops, '+p.eta+'s']);else if(type==='raid')log.push([t,'attack',p.wave||'']);else if(type==='aiRetreat')log.push([t,'retreat',p.why||''])}return emit(type,p)};
 return {s,log}}
function run(seed,doctrine,seconds){const r=make(seed,doctrine);for(let i=0;i<Math.round(seconds/DT)&&!r.s.s.ended;i++)r.s.tick(DT);return r}
function first(log,kind,detail){return log.find(e=>e[1]===kind&&(!detail||e[2]===detail))?.[0]??Infinity}
function summary(key,r){const w=r.s.s.aiWar[1],lines=[],trains={};for(const e of r.log)if(e[1]==='train'){const m=Math.floor(e[0]/60);trains[m]=(trains[m]||0)+1}
 const events=r.log.filter(e=>e[1]!=='train').map(e=>String(Math.floor(e[0]/60)).padStart(2,'0')+':'+String(e[0]%60).padStart(2,'0')+' '+e[1]+' '+e[2]);
 lines.push('== '+key+' ('+K.aiDoctrines[key].name+') age '+r.s.s.ages[1]+', villagers '+r.s.s.units.filter(u=>u.team===1&&u.kind==='villager').length+', army '+r.s.armyFor(1).length+', retreats '+(w.retreats||0));
 lines.push('   military trained per minute: '+Array.from({length:10},(_,m)=>trains[m]||0).join(' '));for(const e of events)lines.push('   '+e);return lines.join('\n')}
const out={},done=[];function test(name,fn){fn();done.push(name);console.log('PASS '+name)}
for(const key of Object.keys(K.aiDoctrines))out[key]=run(7,key,600);
for(const key of Object.keys(out))console.log(summary(key,out[key]));
test('four doctrines produce different openings within ten minutes',()=>{const {rush,boom,expand,turtle}=out,L=k=>out[k].log;
 assert(first(L('rush'),'attack','harass')<240,'rush harasses before 4:00');
 assert(first(L('rush'),'attack')<first(L('expand'),'attack')&&first(L('expand'),'attack')<first(L('boom'),'attack'),'attack order rush < expand < boom');
 assert(first(L('boom'),'attack')>=450&&first(L('turtle'),'attack')>=540,'boom and turtle stay quiet early');
 assert(boom.s.s.ages[1]>=3&&L('boom').some(e=>e[1]==='age'&&e[0]<560),'boom reaches age III early');
 assert(boom.s.s.units.filter(u=>u.team===1&&u.kind==='villager').length>rush.s.s.units.filter(u=>u.team===1&&u.kind==='villager').length,'boom out-builds rush economically');
 const before=(k,t)=>L(k).filter(e=>e[1]==='train'&&e[0]<t).length;assert(before('rush',300)>before('boom',300)*2,'rush trains far more early military than boom');
 assert(L('turtle').filter(e=>e[1]==='build'&&e[2]==='tower').length>=2&&L('turtle').some(e=>e[1]==='build'&&e[2]==='wall'),'turtle fortifies with towers and walls');
 const drops=k=>out[k].s.s.buildings.filter(b=>b.team===1&&['lumbercamp','miningcamp','quarry'].includes(b.kind)).length;assert(drops('expand')>drops('rush'),'expand builds more drop sites');
 for(const k of Object.keys(out))assert(first(L(k),'scout')<150,k+' scouts early')});
test('every main attack is announced by a war-drum warning before it marches',()=>{for(const [k,r]of Object.entries(out)){const w=r.log.filter(e=>e[1]==='warning').map(e=>e[0]),a=r.log.filter(e=>e[1]==='attack'&&e[2]==='main').map(e=>e[0]);for(const t of a)assert(w.some(x=>x<=t&&t-x<=45),k+' main attack at '+t+' without warning')}});
test('attack timing is not a fixed interval and differs between seeds',()=>{const times=[...Object.values(out)].flatMap(r=>r.log.filter(e=>e[1]==='attack').map(e=>e[0])).sort((a,b)=>a-b),gaps=new Set(times.slice(1).map((t,i)=>t-times[i]));assert(times.length>=4&&gaps.size>=3,'gaps '+[...gaps]);
 const sched=seed=>{const r=make(seed,'rush');return [Math.round(r.s.s.aiWar[1].next.harass),Math.round(r.s.s.aiWar[1].next.main)]};assert.notDeepEqual(sched(7),sched(8))});
test('different seeds on the same map draw all four doctrines',()=>{const seen={};for(let seed=1;seed<=40&&Object.keys(seen).length<4;seed++){const r=make(seed);for(let i=0;i<120&&!r.s.s.aiWar[1];i++)r.s.tick(DT);seen[r.s.s.aiWar[1].key]??=seed}assert.deepEqual(Object.keys(seen).sort(),Object.keys(K.aiDoctrines).sort());console.log('  seeds → doctrine: '+JSON.stringify(seen))});
test('fixed seed and doctrine replay identically (lockstep safety)',()=>{const a=run(11,null,200),b=run(11,null,200);assert.deepEqual(a.log,b.log);assert.deepEqual(a.s.s.aiWar,b.s.s.aiWar);assert.equal(JSON.stringify(a.s.s.units.map(u=>[u.id,Math.round(u.x),Math.round(u.y)])),JSON.stringify(b.s.s.units.map(u=>[u.id,Math.round(u.x),Math.round(u.y)])))});
test('sandbox and human seats never run a doctrine',()=>{const s=new K.Sim('sandbox',null,{nations:['britain','france'],groups:[1,2],mapId:MAP,fog:true,seed:3});for(let i=0;i<100;i++)s.tick(DT);assert(!s.s.aiWar[1]);assert(!s.doctrineActive(0))});
console.log('PASS '+done.length+' doctrine checks');
