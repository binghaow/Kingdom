/* Hidden computer doctrines (docs/design/roster-redesign.md 7.1, docs/gameplay-v39.md).
   Deterministic: real production simulation class (network-model.js), fixed map and seeds, no rendering.
   Prints each doctrine's first-10-minute build / train / scout / warning / attack / retreat timeline and asserts that the
   four doctrines open differently, that attack timing is not a fixed interval, and that replays are identical. */
const assert=require('node:assert/strict'),K=require('./public/network-model.js'),D=K.defs,MAP='lake_s',DT=.1;
function make(seed,doctrine,level='normal',map=MAP){const s=new K.Sim(level,null,{nations:['britain','france'],groups:[1,2],mapId:map,fog:true,seed});
 // Player 0 is a passive but defended opponent so a ten-minute timeline is observable for every doctrine.
 const home=s.s.buildings.find(b=>b.team===0&&b.kind==='town');for(let i=0;i<6;i++)s.add('infantry',0,home.x-160+i*40,home.y+170);for(let i=0;i<4;i++)s.add('archer',0,home.x-80+i*40,home.y+215);
 for(const [dx,dy]of[[230,-120],[230,140]]){const t=s.add('tower',0,home.x+dx,home.y+dy);t.complete=true;t.hp=t.maxhp||D.tower.hp}
 if(doctrine)s.setDoctrine(1,doctrine);const log=[];const emit=s.emit.bind(s);
 s.emit=(type,p={})=>{if(p.team===1){const t=Math.round(s.s.time);if(type==='built'&&!['house','farm'].includes(p.kind))log.push([t,'build',p.kind]);else if(type==='trained'&&D[p.kind]?.damage>0&&p.kind!=='villager')log.push([t,'train',p.kind]);else if(type==='research'&&/时代/.test(p.name||''))log.push([t,'age',p.name.split(' ')[0]]);else if(type==='aiScoutOut')log.push([t,'scout',p.kind]);else if(type==='raidWarning')log.push([t,'warning',p.size+' troops, '+p.eta+'s']);else if(type==='raid')log.push([t,'attack',p.wave||'']);else if(type==='aiRetreat')log.push([t,'retreat',p.why||''])
 else if(type==='aiResearch')log.push([t,'tech',p.key])
 else if(type==='aiExpand')log.push([t,'expand',p.own?'own':'enemy-side'])
 else if(type==='aiIsland')log.push([t,'island','landed'])
 else if(type==='aiFlank')log.push([t,'flank',p.mode+' '+p.size])
 else if(type==='aiRemoteRaid')log.push([t,'remote raid',p.size+' units'])}return emit(type,p)};
 return {s,log}}
function run(seed,doctrine,seconds,level,map,setup){const r=make(seed,doctrine,level,map);setup?.(r.s);for(let i=0;i<Math.round(seconds/DT)&&!r.s.s.ended;i++)r.s.tick(DT);return r}
function first(log,kind,detail){return log.find(e=>e[1]===kind&&(!detail||e[2]===detail))?.[0]??Infinity}
function summary(key,r){const w=r.s.s.aiWar[1],lines=[],trains={};for(const e of r.log)if(e[1]==='train'){const m=Math.floor(e[0]/60);trains[m]=(trains[m]||0)+1}
 const events=r.log.filter(e=>e[1]!=='train').map(e=>String(Math.floor(e[0]/60)).padStart(2,'0')+':'+String(e[0]%60).padStart(2,'0')+' '+e[1]+' '+e[2]);
 lines.push('== '+key+' ('+K.aiDoctrines[key].name+') age '+r.s.s.ages[1]+', villagers '+r.s.s.units.filter(u=>u.team===1&&u.kind==='villager').length+', army '+r.s.armyFor(1).length+', retreats '+(w.retreats||0));
 const st=r.s.s.aiFrontier?.[1]?.stats;if(st)lines.push('   frontier: claims '+st.claims+' (enemy-side '+st.enemySites+'), towers '+st.towers+', walls '+st.walls+', island '+(st.islandAt??'—')+', flanks '+st.flanks+' (sea '+st.naval+'), remote raids '+st.remote);
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
 assert(L('turtle').filter(e=>e[1]==='build'&&e[2]==='tower').length>=2&&L('turtle').some(e=>e[1]==='build'&&['wall','wallvertical'].includes(e[2])),'turtle fortifies with towers and walls');
 const claims=k=>out[k].s.s.aiFrontier?.[1]?.stats.claims||0;assert(claims('expand')>claims('rush')&&claims('expand')>=1,'expand claims more outside resource points (v40 frontier)');assert(first(L('expand'),'expand')<=Math.min(...['rush','boom','turtle'].map(k=>first(L(k),'expand'))),'expand is the first to expand');
 for(const k of Object.keys(out))assert(first(L(k),'scout')<150,k+' scouts early')});
test('every main attack is announced by a war-drum warning before it marches',()=>{for(const [k,r]of Object.entries(out)){const w=r.log.filter(e=>e[1]==='warning').map(e=>e[0]),a=r.log.filter(e=>e[1]==='attack'&&e[2]==='main').map(e=>e[0]);for(const t of a)assert(w.some(x=>x<=t&&t-x<=45),k+' main attack at '+t+' without warning')}});
test('attack timing is not a fixed interval and differs between seeds',()=>{const times=[...Object.values(out)].flatMap(r=>r.log.filter(e=>e[1]==='attack').map(e=>e[0])).sort((a,b)=>a-b),gaps=new Set(times.slice(1).map((t,i)=>t-times[i]));assert(times.length>=4&&gaps.size>=3,'gaps '+[...gaps]);
 const sched=seed=>{const r=make(seed,'rush');return [Math.round(r.s.s.aiWar[1].next.harass),Math.round(r.s.s.aiWar[1].next.main)]};assert.notDeepEqual(sched(7),sched(8))});
test('different seeds on the same map draw all four doctrines',()=>{const seen={};for(let seed=1;seed<=40&&Object.keys(seen).length<4;seed++){const r=make(seed);for(let i=0;i<120&&!r.s.s.aiWar[1];i++)r.s.tick(DT);seen[r.s.s.aiWar[1].key]??=seed}assert.deepEqual(Object.keys(seen).sort(),Object.keys(K.aiDoctrines).sort());console.log('  seeds → doctrine: '+JSON.stringify(seen))});
test('fixed seed and doctrine replay identically (lockstep safety)',()=>{const a=run(11,null,200),b=run(11,null,200);assert.deepEqual(a.log,b.log);assert.deepEqual(a.s.s.aiWar,b.s.s.aiWar);assert.equal(JSON.stringify(a.s.s.units.map(u=>[u.id,Math.round(u.x),Math.round(u.y)])),JSON.stringify(b.s.s.units.map(u=>[u.id,Math.round(u.x),Math.round(u.y)])))});
test('sandbox and human seats never run a doctrine',()=>{const s=new K.Sim('sandbox',null,{nations:['britain','france'],groups:[1,2],mapId:MAP,fog:true,seed:3});for(let i=0;i<100;i++)s.tick(DT);assert(!s.s.aiWar[1]);assert(!s.doctrineActive(0))});
/* v40 frontier metrics by difficulty (straits has islands; doctrine fixed to expand so only difficulty changes). The
   player keeps an outlying mining camp with three miners at its own middle site, so remote raids have a target, and
   its buildings cannot fall, so the full 14 minutes are observed. */
const front={};function outpost(s){for(const b of s.s.buildings)if(b.team===0)b.maxhp=b.hp=1e7;const site=(s.s.resourceSites||[]).find(x=>x.id==='mid-gold');if(!site)return;const p=site.spots[0];let camp=null;for(let i=0;i<24&&!camp;i++){const a=i*.55,r=190+i*12,x=p.x+Math.cos(a)*r,y=p.y+Math.sin(a)*r;if(!s.blocked(x,y)&&!s.s.nodes.some(n=>Math.hypot(n.x-x,n.y-y)<70)){camp=s.add('miningcamp',0,x,y);camp.complete=true}}const gold=s.s.nodes.filter(n=>n.site==='mid-gold-0');for(let i=0;i<3;i++){const v=s.add('villager',0,p.x+40*i,p.y+120);if(gold[i])s.order([v],{type:'gather',id:gold[i].id,resource:'gold'})}}
for(const level of ['easy','normal','expert']){const r=run(7,'expand',840,level,'straits',outpost),st=r.s.s.aiFrontier?.[1]?.stats||{},age3=r.log.find(e=>e[1]==='age'&&/III/.test(e[2]))?.[0]??Infinity;front[level]={...st,age3,flankLog:r.log.filter(e=>e[1]==='flank').length};console.log('frontier '+level.padEnd(6)+' claims '+st.claims+' (enemy-side '+st.enemySites+'), towers '+st.towers+', walls '+st.walls+', island landing '+(st.islandAt??'—')+' s, flank groups '+st.flanks+', remote raids '+st.remote+', age III '+(age3===Infinity?'—':age3+' s'))}
test('difficulty scales expansion, defence, island landings, raids and age pace without changing the doctrine',()=>{const {easy,normal,expert}=front;
 assert(easy.claims<normal.claims&&normal.claims<expert.claims,'claims '+[easy.claims,normal.claims,expert.claims]);assert.equal(easy.towers,0);assert(expert.walls>0&&normal.walls===0,'only expert walls its points');
 assert(easy.islandAt===null&&expert.islandAt!==null,'expert lands on an island, easy never tries');assert(normal.remote+expert.remote>=1&&easy.remote===0,'remote raids on the outlying miners (normal/expert; random per seed), never on easy');
 assert(expert.age3<normal.age3&&normal.age3<easy.age3,'age III pace '+[easy.age3,normal.age3,expert.age3]);assert(expert.enemySites>=1,'expert takes a point on the player side after scouting')});
console.log('PASS '+done.length+' doctrine checks');
