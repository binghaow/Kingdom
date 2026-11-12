/* v40 map resources: limited home gold/stone, equal per-player gold/stone in every zone (home, outer, islands, camps)
   on every map and several seeds, islands worth a transport where a map has them, deterministic, and saves do not
   re-roll the layout. */
const assert=require('node:assert/strict'),K=require('./public/network-model.js'),L=K.v40Layout,done=[];
function test(n,f){try{f();done.push(n);console.log('PASS',n)}catch(e){console.error('FAILED',n);throw e}}
const make=(mapId,seed,minerals)=>new K.Sim('normal',null,{nations:['britain','france'],groups:[1,2],mapId,fog:false,seed,minerals});
const MAPS=Object.keys(K.maps),SEEDS=[3,7,19];
test('home gold/stone is limited and the same for both players',()=>{for(const m of MAPS)for(const sd of SEEDS){const z=K.resourceZones(make(m,sd));for(const t of z){assert((t.home.gold||0)<=10000,m+' '+sd+' home gold '+t.home.gold);assert((t.home.stone||0)<=7000,m+' home stone '+t.home.stone);assert((t.home.gold||0)>=5000,m+' home gold enough to open')}assert.equal(z[0].home.gold,z[1].home.gold);assert.equal(z[0].home.stone,z[1].home.stone)}});
test('outside home: equal per-player gold/stone in every zone and clearly more than at home',()=>{const eq=(a,b)=>Math.abs((a||0)-(b||0))<=Math.max(1,.02*Math.max(a||0,b||0));for(const m of MAPS)for(const sd of SEEDS){const z=K.resourceZones(make(m,sd));for(const zone of ['outer','island','camp'])for(const r of ['gold','stone'])assert(eq(z[0][zone][r],z[1][zone][r]),m+' seed '+sd+' '+zone+' '+r+': '+z[0][zone][r]+' vs '+z[1][zone][r]);
 const outside=t=>(t.outer.gold||0)+(t.island.gold||0)+(t.camp.gold||0);assert(outside(z[0])>=2*(z[0].home.gold||0),m+' outside gold '+outside(z[0]))}});
test('islands carry riches worth a transport on maps that have islands',()=>{let maps=0;for(const m of MAPS){const s=make(m,7),z=K.resourceZones(s);if(!s.s.nodes.some(n=>n.island&&n.resource==='gold'))continue;maps++;assert((z[0].island.gold||0)>=1.5*(z[0].home.gold||0),m+' island gold '+z[0].island.gold)}assert(maps>=3,'maps with island gold: '+maps)});
test('layout is deterministic per seed, differs between seeds, and is not re-rolled on load',()=>{const a=make('straits',7),b=make('straits',7),c=make('straits',8),sig=s=>JSON.stringify(s.s.nodes.filter(n=>n.site).map(n=>[n.resource,Math.round(n.x),Math.round(n.y),n.amount]));assert.equal(sig(a),sig(b));assert.notEqual(sig(a),sig(c));const back=new K.Sim('normal',JSON.parse(JSON.stringify(a.s)),{});assert.equal(sig(back),sig(a));assert.equal(back.s.nodes.length,a.s.nodes.length)});
test('rich minerals double the new sites too',()=>{const a=K.resourceZones(make('lake_s',7)),b=K.resourceZones(make('lake_s',7,'rich'));assert.equal(b[0].outer.gold,2*a[0].outer.gold)});
console.log('PASS',done.length,'resource layout checks');
