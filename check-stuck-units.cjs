/* Deterministic regressions for the three stuck-unit classes found by release-check (docs/performance-audit.md,
   "2026-11-11 卡住单位修复"): first leg grazing an obstacle, head-on deadlock, and attacking a target sealed by walls.
   Real simulation (network-model.js, the production class), no rendering, a few seconds of CPU. */
const assert=require('node:assert/strict'),K=require('./public/network-model.js'),D=K.defs,dist=K.distance;
function sandbox(){const s=new K.Sim('sandbox',null,{nations:['britain','france'],groups:[1,2],mapId:'lake_s',fog:false,seed:7});s.ai=()=>{};s.raids=()=>{};s.s.units=[];s.s.buildings=[];s.s.nodes=[];s.pathFailures.clear();s.pathGoals.clear();s.grid=s.seaGrid=null;return s}
function test(name,fn){fn();console.log('PASS '+name)}
function open(s,cx,cy,r){for(let y=cy-r;y<=cy+r;y+=24)for(let x=cx-r;x<=cx+r;x+=24)if(s.blocked(x,y))return false;return true}
function clearing(s,r){const w=s.world,far=(x,y)=>![...s.s.units,...s.s.buildings].some(e=>Math.hypot(e.x-x,e.y-y)<r+250);for(let y=400;y<w.height-400;y+=96)for(let x=400;x<w.width-400;x+=96)if(far(x,y)&&open(s,x,y,r))return {x:Math.floor(x/96)*96,y:Math.floor(y/96)*96};throw Error('no open clearing on lake_s')}

test('first leg grazing a building keeps the route through a clear local detour (no drop / 1.8 s retry loop)',()=>{
 const s=sandbox(),c=clearing(s,420),b=s.add('range',0,c.x,c.y);b.complete=true;const probe=s.add('villager',0,c.x,c.y+300);s.getGrid(probe);
 // Scan the building edge (fixed order) for a free standing point whose A* first leg is refused by walk()'s own test.
 let found=null;for(let a=0;a<64&&!found;a++){const ang=a*Math.PI/32;for(let r=40;r<160;r+=.5){const x=c.x+Math.cos(ang)*r,y=c.y+Math.sin(ang)*r;if(s.blocked(x,y,probe))continue;const goal={x:c.x+Math.cos(ang+Math.PI/2)*260,y:c.y+Math.sin(ang+Math.PI/2)*260};probe.x=x;probe.y=y;const p=s.findPath(probe,goal.x,goal.y);if(p.length&&!s.legClear(probe,probe,p[0]))found={x,y,goal};break}}
 assert(found,'expected a grazing first leg next to a building (grid centre test vs real-radius leg test)');
 const u=probe;u.x=found.x;u.y=found.y;s.order([u],{type:'move',x:found.goal.x,y:found.goal.y});let dropped=0;
 for(let i=0;i<400&&u.order;i++){s.tick(.05);if(s.pathFailures.has(u.id))dropped++;assert(!s.blocked(u.x,u.y,u),'walked into the building')}
 assert.equal(u.order,null,'villager never reached a goal 260 px away');assert(dropped<=2,'route dropped and cached as unreachable '+dropped+' ticks')});

test('first leg grazing rock or water edge: same detour, no repeated drop',()=>{
 const s=sandbox(),probe=s.add('cannon',0,0,0),g=s.getGrid(probe),cols=K.map.width/48,rows=K.map.height/48;let hits=0,fixed=0;
 for(let gy=4;gy<rows-4&&hits<12;gy++)for(let gx=4;gx<cols-4&&hits<12;gx++){const i=gy*cols+gx;if(g[i]||!(g[i+1]||g[i-1]||g[i+cols]||g[i-cols]))continue;
  const x0=gx*48+24,y0=gy*48+24;for(const [dx,dy] of [[23,0],[-23,0],[0,23],[0,-23],[20,20],[-20,-20],[20,-20],[-20,20],[12,-23],[-23,12]]){probe.x=x0+dx;probe.y=y0+dy;if(s.blocked(probe.x,probe.y,probe))continue;const goal={x:x0-dy*12,y:y0+dx*12},p=s.findPath(probe,goal.x,goal.y);if(!p.length||s.legClear(probe,probe,p[0]))continue;hits++;
   probe.path=p;probe.repath=1.8;s.pathFailures.delete(probe.id);s.pathGoals.delete(probe.id);const sx=probe.x,sy=probe.y;for(let k=0;k<40;k++)s.walk(probe,goal,8,.05);if(!s.pathFailures.has(probe.id)&&dist({x:sx,y:sy},probe)>40)fixed++;break}}
 assert(hits>=3,'expected terrain-edge grazing legs on lake_s, found '+hits);assert(fixed>=hits-1,'detour kept the route in '+fixed+'/'+hits+' terrain cases')});

test('two units meeting head-on on one line sidestep (right-hand rule) instead of pushing each other back forever',()=>{
 const s=sandbox(),c=clearing(s,300),y=c.y+24,a=s.add('infantry',0,c.x-240+24,y),b=s.add('villager',0,c.x+240+24,y);
 s.order([a],{type:'move',x:c.x+24+260,y});s.order([b],{type:'move',x:c.x+24-260,y});
 for(let i=0;i<300&&(a.order||b.order);i++)s.tick(.05);
 assert(a.x>c.x+24+150&&b.x<c.x+24-150,`still blocked: infantry x=${Math.round(a.x)} villager x=${Math.round(b.x)}`)});

test('head-on sidestep also works on the multiplayer server, which re-hydrates the simulation every poll (anchor kept in unit state)',()=>{
 const H=require('./scripts/netcode/harness.cjs');let s=H.createSim({seed:4242,seats:2,mapId:'coast_s',fog:false});const c=clearing(s,300),y=c.y+24,a=s.add('infantry',0,c.x-240+24,y),b=s.add('villager',0,c.x+240+24,y);
 s.order([a],{type:'move',x:c.x+24+260,y});s.order([b],{type:'move',x:c.x+24-260,y});
 for(let i=0;i<150;i++){s.tick(.1);if(i%5===4)s=H.hydrateRoundTrip(s)}const A=s.byId(a.id),B=s.byId(b.id);
 assert(A.x>c.x+24+150&&B.x<c.x+24-150,`still blocked across polls: infantry x=${Math.round(A.x)} villager x=${Math.round(B.x)}`)});

function sealed(){const s=sandbox(),c=clearing(s,700),R=288,town=s.add('town',1,c.x,c.y);town.complete=true;
 for(const p of [...K.wallPlan('wall',{x:c.x-R,y:c.y-R},{x:c.x+R,y:c.y-R}),...K.wallPlan('wall',{x:c.x-R,y:c.y+R},{x:c.x+R,y:c.y+R}),...K.wallPlan('wallvertical',{x:c.x-R,y:c.y-R+96},{x:c.x-R,y:c.y+R-96}),...K.wallPlan('wallvertical',{x:c.x+R,y:c.y-R+96},{x:c.x+R,y:c.y+R-96})]){const w=s.add(p.kind,1,p.x,p.y);w.complete=true}
 const army=[];for(let i=0;i<16;i++){const u=s.add(['infantry','halberd','infantry','archer'][i%4],0,c.x-R-300+(i%4)*30,c.y-90+Math.floor(i/4)*60);s.freeSpawn(u);army.push(u)}return {s,c,town,army}}

test('a target sealed by walls is unreachable without expanding the map (region check), and attackers breach the wall instead of standing still',()=>{
 const {s,town,army}=sealed(),probe=army[0];globalThis.window={PerformanceAudit:{}};s._perfPathExpanded=0;const r=s.findPath(probe,town.x,town.y);const expanded=s._perfPathExpanded;delete globalThis.window;
 assert.deepEqual(r,[]);assert.equal(expanded,0,'unreachable goal expanded '+expanded+' cells');
 const walls0=s.s.buildings.filter(b=>D[b.kind].wall).reduce((n,b)=>n+b.hp,0);let calls=0,perTick=[],blockedFor=new Map(),worstBlocked=0;const fp=s.findPath;s.findPath=function(...a){calls++;return fp.apply(this,a)};
 s.order(army,{type:'attack',id:town.id});
 for(let i=0;i<500&&!s.s.ended;i++){calls=0;s.tick(.05);perTick.push(calls);for(const u of army){if(u.hp<=0)continue;const t=u.engagementBlocked?(blockedFor.get(u.id)||0)+.05:0;blockedFor.set(u.id,t);worstBlocked=Math.max(worstBlocked,t)}}
 const walls1=s.s.buildings.filter(b=>D[b.kind].wall&&b.hp>0).reduce((n,b)=>n+b.hp,0);
 assert(walls1<walls0-1500,'walls barely damaged: '+Math.round(walls0-walls1)+' hp');assert(worstBlocked<3,'an attacker stood engagement-blocked for '+worstBlocked.toFixed(1)+' s');
 assert(army.some(u=>u.order?.resume?.id===town.id)||town.hp<town.maxhp,'no attacker turned to the wall while keeping the original order');
 const late=perTick.slice(20);assert(Math.max(...late)<=40,'synchronised path-search burst of '+Math.max(...late)+' A* in one tick')});

test('an attacker whose wall falls resumes its original attack order',()=>{
 const {s,town,army}=sealed();s.order(army,{type:'attack',id:town.id});let resumed=false;
 for(let i=0;i<900&&!s.s.ended&&!resumed;i++){s.tick(.05);resumed=army.some(u=>u.hp>0&&u.order?.type==='attack'&&u.order.id===town.id&&!u.order.resume&&s.s.buildings.some(b=>D[b.kind].wall&&b.hp<=0||!s.s.buildings.includes(b)))}
 const gone=s.s.buildings.filter(b=>D[b.kind].wall).length<36||s.s.buildings.some(b=>D[b.kind].wall&&b.hp<=0);assert(gone,'no wall destroyed in 45 s');assert(resumed||town.hp<town.maxhp,'attackers did not return to the original target')});

test('melee units can strike a wall built on the 96 px grid (final approach from the free cell centre)',()=>{
 const s=sandbox(),c=clearing(s,300),w=s.add('wallvertical',1,c.x,c.y);w.complete=true;const us=['infantry','halberd','villager'].map((k,i)=>s.add(k,0,c.x-260,c.y-60+i*60));s.order(us,{type:'attack',id:w.id});
 for(let i=0;i<400;i++)s.tick(.05);assert(w.hp<w.maxhp-300,'wall took only '+Math.round(w.maxhp-w.hp)+' damage');for(const u of us)assert(!u.engagementBlocked,u.kind+' still engagement-blocked')});

test('stuck fixes stay deterministic: identical runs give identical positions and orders',()=>{
 const run=()=>{const {s,town,army}=sealed();s.order(army,{type:'attack',id:town.id});for(let i=0;i<300;i++)s.tick(.05);return JSON.stringify(army.map(u=>[u.id,Math.round(u.x*1000),Math.round(u.y*1000),u.hp,u.order]))};assert.equal(run(),run())});

test('vertical path start is clamped to the row count',()=>{const s=sandbox(),u=s.add('villager',0,600,600);u.y=K.map.height*3;const p=s.findPath(u,600,600);for(const q of p)assert(q.y>=0&&q.y<K.map.height&&q.x>=0&&q.x<K.map.width)});

console.log('Stuck-unit regression checks passed');
