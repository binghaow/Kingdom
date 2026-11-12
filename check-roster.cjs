/* Roster redesign v39 (docs/design/roster-redesign.md 3, 4, 6; docs/gameplay-v39.md). Real production simulation class. */
const assert=require('node:assert/strict'),K=require('./public/network-model.js'),D=K.defs,T=K.tech,done=[];
function test(n,f){f();done.push(n)}
function make(a='britain',b='france'){const s=new K.Sim('normal',null,{nations:[a,b],groups:[1,2],mapId:'lake_s',fog:false,seed:7});s.s.humanTeams=[0,1];for(const r of s.s.resources)Object.assign(r,{food:20000,wood:20000,gold:20000,stone:20000});s.s.ages=[5,5];return s}
const offered=(s,kind,team=0)=>{const b=s.add(kind,team,s.world.starts[team].x+200,s.world.starts[team].y+200);b.complete=true;const list=s.trainOptions(b);s.s.buildings=s.s.buildings.filter(x=>x!==b);return list};

test('Retired units and merged buildings stay defined but leave the menus',()=>{const s=make();
 for(const k of K.rosterRetired.units){assert(D[k],k);assert(D[k].retired,k);for(const b of ['barracks','range','stable','workshop','dock','aerodrome','town'])assert(!offered(s,b).includes(k),b+' offers '+k)}
 for(const k of Object.keys(K.rosterRetired.buildings)){assert(D[k]?.retired,k);assert.match(s.placementError(k,s.world.starts[0].x+300,s.world.starts[0].y),/合并/)}
 for(const [k,b]of Object.entries({ballistics:'range',smokeless:'range',masonry:'town',telegraph:'town',logistics:'town',fieldmedicine:'church',line_spear:'barracks',line_ranged:'range',line_mortar:'workshop',weapons:'blacksmith',armor:'blacksmith'}))assert.equal(T[k].building,b,k);assert.deepEqual(Object.keys(T).filter(k=>T[k].building==='blacksmith').sort(),['armor','weapons'],'blacksmith keeps only generic attack/armor');for(const k of ['shells','rolledsteel'])assert.equal(T[k].building,'workshop')});

test('National units replace one generic unit in the ordinary buildings',()=>{
 const expect={britain:['range','longbow','archer'],china:['range','repeater','archer'],japan:['barracks','samurai','infantry'],france:['stable','cuirassier','cavalry'],netherlands:['range','nassau','skirmisher'],prussia:['barracks','prussianguard','grenadier']};
 for(const [nation,[b,unit,base]]of Object.entries(expect)){const s=make(nation,nation==='france'?'britain':'france'),list=offered(s,b);assert(list.includes(unit),nation+' '+unit);assert(!list.includes(base),nation+' still offers '+base);assert.equal(s.baseKind(unit),base)}
 const s=make('britain','france');assert(!offered(s,'range').includes('repeater'));assert(offered(s,'range').includes('archer')===false);assert.match(s.unitError({kind:'range',team:0},'archer'),/长弓卫士/)});

test('Ten national landmarks: one per match, own nation only, periodic free national soldier',()=>{
 const landmarks=Object.values(K.nations).map(n=>n.building);assert.equal(new Set(landmarks).size,10);for(const k of landmarks){assert(D[k].landmark,k);assert(!D[k].retired,k);assert.equal(D[k].trains.length,0)}
 const s=make('japan','france'),p=s.world.starts[0];let spot=null;for(let i=0;i<400&&!spot;i++){const x=p.x+((i%20)-10)*40,y=p.y+(Math.floor(i/20)-10)*40;if(!s.placementError('dojo',x,y,0))spot={x,y}}assert(spot,'free spot');
 assert.match(s.placementError('ridingacademy',spot.x,spot.y,0),/本国/);const b=s.add('dojo',0,spot.x,spot.y);b.complete=true;assert.match(s.placementError('dojo',spot.x+600,spot.y,0),/一座/);
 const before=s.s.units.filter(u=>u.team===0&&u.kind==='samurai').length;for(let t=0;t<K.rosterLandmarkEvery+1;t+=.5)s.tick(.5);assert.equal(s.s.units.filter(u=>u.team===0&&u.kind==='samurai').length,before+1)});

test('Air plan A: early cheap balloon, bombers hit only buildings, ranged/towers shoot air at half, forts at full',()=>{const s=make(),p=s.world.starts[0];
 assert.equal(D.scoutballoon.age,3);assert.equal(D.aerodrome.age,3);assert(D.scoutballoon.wood+D.scoutballoon.gold<200);s.s.ages=[3,3];s.s.tech[0].aeronautics=0;const field=s.add('aerodrome',0,p.x+400,p.y);field.complete=true;assert.equal(s.unitError(field,'scoutballoon'),'');assert.match(s.unitError(field,'bomber'),/航空工程|时代/);
 for(const k of ['airtransport','gunship','carrier','airwing'])assert(D[k].retired,k);
 const bomber=s.add('bomber',0,p.x+900,p.y+300),foot=s.add('infantry',1,p.x+905,p.y+300),house=s.add('house',1,p.x+930,p.y+300);assert.equal(s.canTarget(bomber,foot),false);assert.equal(s.canTarget(bomber,house),true);
 const hit=(a,t)=>{const u=s.add(a,0,p.x+900,p.y+600),e=s.add(t,1,p.x+905,p.y+600);e.hp=e.maxhp=1e6;s.strike(u,e);const lost=1e6-e.hp;s.s.units=s.s.units.filter(x=>x!==u&&x!==e);s.s.buildings=s.s.buildings.filter(x=>x!==u&&x!==e);return lost};
 const dmg=(k,t)=>Math.max(1,s.stat({kind:k,team:0},'damage')*K.counterMultiplier(k,t)-s.stat({kind:t,team:1},'armor'));
 for(const a of ['archer','musketeer','tower'])assert(Math.abs(hit(a,'scoutballoon')-dmg(a,'scoutballoon')*.5)<1e-6,a+' vs air is halved');
 assert(Math.abs(hit('fort','scoutballoon')-dmg('fort','scoutballoon'))<1e-6,'fort vs air is full');assert.equal(s.canTarget(s.add('infantry',0,p.x,p.y),bomber),false)});

test('Approved rules: steam crawler x1.35 against buildings, bastion turret takes no unit counters, market makes no passive gold',()=>{const s=make(),p=s.world.starts[0];
 assert.equal(K.structureMultiplier('steamcrawler'),1.35);assert.equal(K.counterMultiplier('cavalry','cannonturret'),1);assert(K.counterMultiplier('cavalry','cannon')>1);for(const [k,d]of Object.entries(D))if(d.building)assert.equal(K.counterMultiplier('cavalry',k),1,k);
 const u=s.add('steamcrawler',0,p.x+900,p.y+300),e=s.add('town',1,p.x+905,p.y+300);e.hp=e.maxhp=1e6;s.strike(u,e);assert(Math.abs(1e6-e.hp-Math.max(1,s.stat(u,'damage')*1.35-s.stat(e,'armor')))<1e-6,'crawler vs town centre');
 const t=make();for(const b of t.s.buildings)if(b.team===0)b.queue=[];const m=t.add('market',0,p.x+300,p.y+300);m.complete=true;t.s.units=t.s.units.filter(u=>u.team!==0);const gold=t.s.resources[0].gold;for(let i=0;i<20;i++)t.tick(.5);assert.equal(t.s.resources[0].gold,gold)});

test('Upgrade lines: research at the producing building upgrades existing and queued units; menus offer only the current tier',()=>{
 const s=make('russia','france'),p=s.world.starts[0],smith=s.add('range',0,p.x+300,p.y+300),range=s.add('range',0,p.x+300,p.y+500);smith.complete=range.complete=true;smith.queue=[];range.queue=[];
 assert.deepEqual(s.lineTiers(0,'ranged'),['archer','streltsy','rifleguard']);assert(offered(s,'range').includes('archer'));assert(!offered(s,'range').includes('streltsy'));assert.match(s.unitError(range,'streltsy'),/射击场/);
 const a=s.add('archer',0,p.x+500,p.y+300);a.hp=a.maxhp/2;assert.equal(s.train(range,'archer'),'');const gold=s.s.resources[0].gold;
 assert.equal(s.research(smith,'line_ranged'),'');assert.equal(s.s.resources[0].gold,gold-150);smith.queue[0].left=.01;s.tick(.1);
 assert.equal(a.kind,'streltsy');assert(Math.abs(a.hp/a.maxhp-.5)<1e-9);assert.equal(range.queue[0].kind,'streltsy');assert(offered(s,'range').includes('streltsy'));assert(!offered(s,'range').includes('archer'));
 s.s.ages[0]=4;assert.match(s.researchError(smith,'line_ranged'),/V|时代/);s.s.ages[0]=5;assert.equal(s.researchCost('line_ranged',0).gold,420);assert.equal(s.research(smith,'line_ranged'),'');smith.queue[0].left=.01;s.tick(.1);assert.equal(a.kind,'rifleguard');assert.match(s.researchError(smith,'line_ranged'),/最高/);
 const b=make('britain','france');assert.deepEqual(b.lineTiers(0,'spear'),['infantry','halberd','eliteguard']);assert.deepEqual(b.lineTiers(0,'mortar'),['mortar','howitzer','fieldmortar']);
 const net=JSON.parse(JSON.stringify(s.s));const back=new K.Sim('normal',net,{});assert.equal(back.lineLevel(0,'ranged'),2);assert(back.s.units.some(u=>u.kind==='rifleguard'))});

test('Numbers: x2 role counters; within each line later tiers are stronger per resource and per population',()=>{
 assert.equal(K.counterMultiplier('infantry','cavalry'),2);assert.equal(K.counterMultiplier('cavalry','musketeer'),2);assert.equal(K.counterMultiplier('archer','infantry'),2);assert.equal(K.counterMultiplier('musketeer','halberd'),2);assert.equal(K.counterMultiplier('musketeer','cavalry'),1);
 const cost=k=>['food','wood','gold','stone'].reduce((n,r)=>n+(D[k][r]||0),0),core=k=>Math.sqrt(D[k].hp*D[k].damage/(D[k].cooldown||1));
 for(const l of [...Object.values(K.rosterLines).map(l=>l.tiers),['hussar','cavalry','dragoon']])for(let i=1;i<l.length;i++){assert(core(l[i])/cost(l[i])>core(l[i-1])/cost(l[i-1]),l[i]+' per resource');assert(core(l[i])/(D[l[i]].pop||1)>core(l[i-1])/(D[l[i-1]].pop||1),l[i]+' per pop');assert(D[l[i]].age>=D[l[i-1]].age)}
 for(const l of ['spear','ranged','mortar'])for(let i=1;i<3;i++)assert.equal(D[K.rosterLines[l].tiers[i]].pop||1,D[K.rosterLines[l].tiers[0]].pop||1,l+' keeps population per tier')});

test('Saves and authoritative commands: retired entities load and keep running; lines, landmarks and refusals go through the server path',()=>{
 const s=make('usa','spain'),p=s.world.starts[0];for(const k of K.rosterRetired.units)s.add(k,0,p.x+300,p.y+300);for(const k of ['university','bath','quarry','cannonturret'])s.add(k,0,p.x-400,p.y+200).complete=true;
 for(const t of s.s.tech)for(const k of Object.keys(t))if(k.startsWith('line_'))delete t[k];const saved=JSON.parse(s.serialize());const n=new K.Sim(saved.difficulty,saved);for(let i=0;i<300;i++)n.tick(.1);
 for(const k of ['trebuchet','carrier','gunship'])assert(n.s.units.some(u=>u.kind===k),k+' survives');assert(n.s.buildings.some(b=>b.kind==='university'));assert(n.s.units.every(u=>Number.isFinite(u.hp)));assert.equal(n.lineLevel(0,'spear'),0);
 const S=require('./server/service.cjs'),net=new K.NetworkSim('normal',null,{nations:['usa','spain'],groups:[1,2],humanTeams:[0,1],fog:false});net.state.ages=[5,5];for(const r of net.state.resources)Object.assign(r,{food:9e3,wood:9e3,gold:9e3,stone:9e3});
 const q=net.world.starts[0],range=net.add('range',0,q.x+300,q.y+300),smith=net.add('range',0,q.x+300,q.y-300);range.complete=smith.complete=true;range.queue=[];smith.queue=[];
 assert.match(S.execute(net,0,{type:'train',args:{id:range.id,kind:'musketeer'}}),/大陆军|替代/);assert.match(S.execute(net,0,{type:'train',args:{id:range.id,kind:'continental'}}),/射击场/);
 S.execute(net,0,{type:'research',args:{id:smith.id,key:'line_ranged'}});assert.equal(smith.queue[0]?.kind,'line_ranged');smith.queue[0].left=.01;net.tick(.1);assert.equal(net.lineLevel(0,'ranged'),1);assert.match(S.execute(net,0,{type:'train',args:{id:range.id,kind:'continental'}}),/排队/)});

console.log('PASS '+done.length+' roster checks:\n'+done.map(n=>'  '+n).join('\n'));
