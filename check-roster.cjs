/* Roster redesign v39 (docs/design/roster-redesign.md 3, 4, 6; docs/gameplay-v39.md). Real production simulation class. */
const assert=require('node:assert/strict'),K=require('./public/network-model.js'),D=K.defs,T=K.tech,done=[];
function test(n,f){f();done.push(n)}
function make(a='britain',b='france'){const s=new K.Sim('normal',null,{nations:[a,b],groups:[1,2],mapId:'lake_s',fog:false,seed:7});s.s.humanTeams=[0,1];for(const r of s.s.resources)Object.assign(r,{food:20000,wood:20000,gold:20000,stone:20000});s.s.ages=[5,5];return s}
const offered=(s,kind,team=0)=>{const b=s.add(kind,team,s.world.starts[team].x+200,s.world.starts[team].y+200);b.complete=true;const list=s.trainOptions(b);s.s.buildings=s.s.buildings.filter(x=>x!==b);return list};

test('Retired units and merged buildings stay defined but leave the menus',()=>{const s=make();
 for(const k of K.rosterRetired.units){assert(D[k],k);assert(D[k].retired,k);for(const b of ['barracks','range','stable','workshop','dock','aerodrome','town'])assert(!offered(s,b).includes(k),b+' offers '+k)}
 for(const k of Object.keys(K.rosterRetired.buildings)){assert(D[k]?.retired,k);assert.match(s.placementError(k,s.world.starts[0].x+300,s.world.starts[0].y),/合并/)}
 for(const k of ['ballistics','masonry','telegraph'])assert.equal(T[k].building,'blacksmith');for(const k of ['shells','rolledsteel'])assert.equal(T[k].building,'workshop')});

test('National units replace one generic unit in the ordinary buildings',()=>{
 const expect={britain:['range','longbow','archer'],china:['range','repeater','archer'],japan:['barracks','samurai','infantry'],france:['stable','cuirassier','cavalry'],netherlands:['range','nassau','skirmisher'],prussia:['barracks','prussianguard','grenadier']};
 for(const [nation,[b,unit,base]]of Object.entries(expect)){const s=make(nation,nation==='france'?'britain':'france'),list=offered(s,b);assert(list.includes(unit),nation+' '+unit);assert(!list.includes(base),nation+' still offers '+base);assert.equal(s.baseKind(unit),base)}
 const s=make('britain','france');assert(!offered(s,'range').includes('repeater'));assert(offered(s,'range').includes('archer')===false);assert.match(s.unitError({kind:'range',team:0},'archer'),/长弓卫士/)});

test('Ten national landmarks: one per match, own nation only, periodic free national soldier',()=>{
 const landmarks=Object.values(K.nations).map(n=>n.building);assert.equal(new Set(landmarks).size,10);for(const k of landmarks){assert(D[k].landmark,k);assert(!D[k].retired,k);assert.equal(D[k].trains.length,0)}
 const s=make('japan','france'),p=s.world.starts[0];let spot=null;for(let i=0;i<400&&!spot;i++){const x=p.x+((i%20)-10)*40,y=p.y+(Math.floor(i/20)-10)*40;if(!s.placementError('dojo',x,y,0))spot={x,y}}assert(spot,'free spot');
 assert.match(s.placementError('ridingacademy',spot.x,spot.y,0),/本国/);const b=s.add('dojo',0,spot.x,spot.y);b.complete=true;assert.match(s.placementError('dojo',spot.x+600,spot.y,0),/一座/);
 const before=s.s.units.filter(u=>u.team===0&&u.kind==='samurai').length;for(let t=0;t<K.rosterLandmarkEvery+1;t+=.5)s.tick(.5);assert.equal(s.s.units.filter(u=>u.team===0&&u.kind==='samurai').length,before+1)});

console.log('PASS '+done.length+' roster checks:\n'+done.map(n=>'  '+n).join('\n'));
