const assert=require('node:assert/strict'),K=require('./public/companions.js'),D=K.defs;
function scenario(){const s=new K.Sim('sandbox',null,{nations:['britain','france'],groups:[1,2],mapId:'lake_s',fog:false});s.ai=()=>{};s.raids=()=>{};s.s.units=[];s.s.buildings=[];s.pathFailures.clear();s.pathGoals.clear();return s}
function test(name,fn){fn();console.log('PASS '+name)}

test('production exit avoids blocked building cells and crowded unit footprints',()=>{const s=scenario(),home=s.s.world.starts[0],town=s.add('town',0,home.x,home.y),probe={id:-1,kind:'villager',team:0,x:town.x,y:town.y};for(let i=0;i<16;i++){const a=i*Math.PI/8,r=D.town.r+70;s.add('infantry',0,town.x+Math.cos(a)*r,town.y+Math.sin(a)*r)}const p=s.exitPoint(town,probe);assert.equal(s.blocked(p.x,p.y,probe),false);for(const u of s.s.units)assert(K.distance(p,u)>=D[u.kind].r+D.villager.r+6);const g=s.getGrid(probe),cols=K.map.width/48,gx=Math.floor(p.x/48),gy=Math.floor(p.y/48),exits=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]].filter(([dx,dy])=>gx+dx>=0&&gy+dy>=0&&gx+dx<cols&&gy+dy<K.map.height/48&&!g[(gy+dy)*cols+gx+dx]);assert(exits.length>=2)});

test('spawn recovery moves a worker out of a building without overlapping nearby units',()=>{const s=scenario(),home=s.s.world.starts[0],town=s.add('town',0,home.x,home.y),u=s.add('villager',0,town.x,town.y);s.freeSpawn(u);assert.equal(s.blocked(u.x,u.y,u),false);for(const other of s.s.units)if(other.id!==u.id)assert(K.distance(u,other)>=D[u.kind].r+D[other.kind].r+4)});

test('crowd-stalled units receive a safe lateral path waypoint',()=>{const s=scenario(),u=s.add('infantry',0,1400,1300);u.path=[{x:u.x+200,y:u.y}];u.repath=100;s.stat=()=>0;for(let i=0;i<22;i++)s.walk(u,{x:u.x+500,y:u.y},20,.05);assert(s.walkStall.get(u.id)?.tries>0);assert(u.path.length>1);assert.notEqual(u.path[0].x,1600)});

test('tower and cannon turret launch visible projectiles from above the structure',()=>{const s=scenario(),x=1450,y=1300,tower=s.add('tower',0,x,y),cannon=s.add('cannonturret',0,x+260,y),target=s.add('infantry',1,x+90,y);s.tick(.05);const arrow=s.s.effects.find(f=>f.type==='attack'&&f.sourceKind==='tower'),shell=s.s.effects.find(f=>f.type==='attack'&&f.sourceKind==='cannonturret');assert(arrow);assert.equal(arrow.weapon,'towerArrow');assert(arrow.y<y-90);assert(shell);assert.equal(shell.weapon,'cannon');assert(shell.y<cannon.y-60);assert(target.hp<target.maxhp)});

console.log('Unit spawn/recovery checks passed');
