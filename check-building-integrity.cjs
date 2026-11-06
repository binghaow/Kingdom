const assert=require('node:assert/strict'),K=require('./public/network-model.js'),P=require('./public/art-profiles.js'),C=require('./public/building-condition.js');
const s=new K.Sim('sandbox',null,{mapId:'cliff_s',fog:false,nations:['britain','france'],groups:[1,2],seed:33});s.ai=()=>{};s.raids=()=>{};const home=s.world.starts[0];s.s.buildings=[];s.s.units=[];s.s.nodes=[];s.grid=s.seaGrid=null;const b=s.add('town',0,home.x,home.y);b.complete=true;const u=s.add('villager',0,b.x-230,b.y+10);u.order={type:'move',x:b.x+230,y:b.y+10};u.path=[{x:b.x+230,y:b.y+10}];u.repath=100;
// A stale direct path and even a long frame may not tunnel through a solid foundation.
s.walk(u,u.order,5,3);assert(!s.blocked(u.x,u.y,u));assert(u.x<b.x);assert.deepEqual(u.path,[]);
for(let i=0;i<450;i++){s.walk(u,u.order,5,.05);assert(!s.blocked(u.x,u.y,u),'walk penetrated foundation')}assert(Math.hypot(u.x-u.order.x,u.y-u.order.y)<65,'could not route around town');
// Collision matches a wider foundation, not just the old centre circle.
assert(s.blocked(b.x+P.sizes.town[0]*.35,b.y,u));
const embedded=s.add('infantry',0,b.x,b.y);s.freeSpawn(embedded);assert(!s.blocked(embedded.x,embedded.y,embedded));
const air=s.add('scoutballoon',0,b.x-200,b.y);s.walk(air,{x:b.x,y:b.y},0,5);assert.equal(air.x,b.x);assert.equal(air.y,b.y);
// Repair remains reachable and restores both building health and each damage stage.
u.x=b.x;u.y=b.y+K.defs.town.r+25;u.path=[];u.order={type:'repair',id:b.id};b.hp=b.maxhp*.2;s.s.resources[0].wood=s.s.resources[0].stone=10000;assert.equal(C.stage(b),2);let observed=new Set([2]);for(let i=0;i<5000&&b.hp<b.maxhp;i++){s.repairTick(u,b,.1);observed.add(C.stage(b))}assert.equal(b.hp,b.maxhp);assert.deepEqual([...observed],[2,1,0]);
assert.equal(C.stage({...b,complete:false,hp:1}),0);assert.deepEqual([.3,1.5,2,3.5].map(C.collapse),[0,1,2,3]);
let site;for(const dx of [280,-280,360,-360])for(const dy of [0,160,-160])if(!site&&!s.placementError('house',b.x+dx,b.y+dy,0))site={x:b.x+dx,y:b.y+dy};assert(site,'no construction test site');const idle=s.add('infantry',0,site.x,site.y);const made=s.construct('house',site.x,site.y,[u],0);assert(made.building,made.error);assert(!s.blocked(idle.x,idle.y,idle),'construction trapped idle unit');
embedded.x=b.x;embedded.y=b.y;embedded.order={type:'hold'};const restored=new K.Sim('sandbox',JSON.parse(s.serialize()));const migrated=restored.byId(embedded.id);assert(!restored.blocked(migrated.x,migrated.y,migrated),'old save retained embedded idle unit');
console.log('PASS foundation segment sweep, detour, widened footprint, embedded-unit recovery, aircraft overflight, reachable paid repair 2→1→0 and four collapse phases');
