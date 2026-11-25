/* P5 shared flow fields (docs/p5/progress.md): routes read from a field are a pure function of (grid, start cell, goal cell) and as
   short as A*'s; a big group ordered across the map arrives like (or better than) A*-only routing, never stands on blocked
   ground, never crosses a wall, and does not end up stuck in a clump. Real simulation (network-model.js), no rendering. */
const assert=require('node:assert/strict'),K=require('./public/network-model.js');
function test(name,fn){fn();console.log('PASS '+name)}
function sandbox(mapId='lake_l',seed=11){const s=new K.Sim('sandbox',null,{nations:['britain','france'],groups:[1,2],mapId,fog:false,seed,keepLayout:true});s.ai=()=>{};s.raids=()=>{};s.s.units=[];s.s.buildings=[];s.s.nodes=[];s.pathFailures.clear();s.pathGoals.clear();s.grid=s.seaGrid=null;return s}
const cost=(cols,path,start)=>{let c=0,px=start%cols,py=Math.floor(start/cols);for(const p of path){const x=Math.floor(p.x/48),y=Math.floor(p.y/48),dx=Math.abs(x-px),dy=Math.abs(y-py);assert(dx<=1&&dy<=1&&dx+dy>0,'route steps to a neighbour cell');c+=dx&&dy?Math.SQRT2:1;px=x;py=y}return c};
let seed=12345;const rnd=()=>(seed=seed*16807%2147483647)/2147483647;

test('field routes are the same however the field was grown, end at the goal and are exactly as short as A*',()=>{
 const s=sandbox(),probe=s.add('villager',0,600,600),g=s.getGrid(probe),cols=K.map.width/48,rows=K.map.height/48;let compared=0,tie=0;
 for(let trial=0;trial<6;trial++){let goal;do{goal={x:200+rnd()*(K.map.width-400),y:200+rnd()*(K.map.height-400)}}while(g[Math.floor(goal.y/48)*cols+Math.floor(goal.x/48)]);
  const fieldRoute=()=>{s._flow=null;for(let i=0;i<400;i++){s.s.time+=.05;const r=s.flowPath(probe,goal.x,goal.y,g);if(r)return r}return null};
  for(let k=0;k<60;k++){let sx,sy;do{sx=Math.floor(rnd()*cols);sy=Math.floor(rnd()*rows)}while(g[sy*cols+sx]);probe.x=sx*48+24;probe.y=sy*48+24;
   const a=fieldRoute(),star=s.findPathAStar(probe,goal.x,goal.y);if(!a){assert(star.length<=1,'no field route only when A* has none (or a one-cell route)');continue}
   // the same field grown in slices of 97 cells (no step budget): same route
   s._flow=null;for(let i=0;i<5;i++)assert.equal(s.flowPath(probe,goal.x,goal.y,g),null);s._flow.budgetAt=s.s.time;s._flow.left=0;assert.equal(s.flowPath(probe,goal.x,goal.y,g),null);
   const f=[...s._flow.fields.values()][0];assert(f,'field created at the 6th request');let b=null;for(let step=0;step<2000&&!b;step++){f.grow(sy*cols+sx,97);if(f.done[sy*cols+sx])b=f.route(sy*cols+sx,48)}
   assert.deepEqual(b,a,'same route whether the field grew in one go or in slices');
   assert.deepEqual(a.at(-1),star.at(-1),'route ends in the same goal cell as A*');
   const ca=cost(cols,a,sy*cols+sx),cs=cost(cols,star,sy*cols+sx);assert(Math.abs(ca-cs)<1e-9,`field route as short as A* (${ca} vs ${cs})`);
   if(JSON.stringify(a)!==JSON.stringify(star))tie++;compared++}}
 assert(compared>=200,'compared '+compared+' routes');console.log(`  ${compared} routes compared, ${tie} take a different but equally short line than A*`)});

function groupRun(useField){const s=sandbox('lake_l',5);if(!useField)s.flowPath=()=>null;const W=K.map.width,H=K.map.height;
 // west shore -> east shore of the central lake: the straight line is water, every route goes round it
 const home={x:W*.2,y:H*.55},goal={x:W*.8,y:H*.5},units=[];for(let i=0;i<120;i++){const u=s.add(['infantry','archer','cavalry','musketeer'][i%4],0,home.x+(i%12)*30-165,home.y+Math.floor(i/12)*30-135);s.freeSpawn(u);units.push(u)}
 s.getGrid(units[0]);s.order(units,{type:'move',x:goal.x,y:goal.y});let blocked=0,t=0;const arrived=new Map();
 for(let i=0;i<2400;i++){s.tick(.05);t+=.05;for(const u of units){if(s.blocked(u.x,u.y,u))blocked++;if(!arrived.has(u.id)&&Math.hypot(u.x-goal.x,u.y-goal.y)<260)arrived.set(u.id,t)}if(arrived.size===units.length)break}
 const times=[...arrived.values()].sort((a,b)=>a-b),spread=Math.max(...units.map(u=>Math.hypot(u.x-goal.x,u.y-goal.y)));
 return {arrived:arrived.size,p50:times[times.length>>1],p90:times[Math.floor(times.length*.9)],last:times.at(-1),blocked,flowRoutes:s._flowRoutes||0,spread:Math.round(spread)}}
test('120 soldiers ordered round a lake: field routing arrives like A*-only routing, never on blocked ground, no clump left behind',()=>{
 const a=groupRun(false),f=groupRun(true);console.log('  A* only',JSON.stringify(a));console.log('  fields ',JSON.stringify(f));
 assert(f.flowRoutes>50,'the group used the shared field');assert.equal(f.blocked,0,'no unit stood on blocked ground');assert.equal(f.arrived,120,'every soldier arrived');
 assert(f.p90<=a.p90*1.1+1&&f.last<=a.last*1.15+2,'arrival times within 10-15% of A*-only routing');assert(f.spread<=Math.max(a.spread*1.25,400),'the group gathers as tightly as before')});

function wallRun(useField){const s=sandbox('lake_s',7),W=K.map.width,H=K.map.height,x0=Math.round(W*.3/96)*96,y0=Math.round(H*.25/96)*96;if(!useField)s.flowPath=()=>null;
 for(let i=-6;i<=6;i++){if(i===0)continue;const w=s.add('wallvertical',1,x0,y0+i*96);w.complete=true}
 const units=[];for(let i=0;i<60;i++){const u=s.add('infantry',0,x0-420+(i%6)*30,y0-150+Math.floor(i/6)*30);s.freeSpawn(u);units.push(u)}
 s.getGrid(units[0]);s.order(units,{type:'move',x:x0+420,y:y0});let crossed=0;const side=u=>u.x<x0,was=new Map(units.map(u=>[u.id,side(u)]));
 for(let i=0;i<1200;i++){s.tick(.05);for(const u of units){const now=side(u);if(now!==was.get(u.id)){if(Math.abs(u.y-y0)>60&&Math.abs(u.y-y0)<6*96+40)crossed++;was.set(u.id,now)}}}
 return {crossed,through:units.filter(u=>u.x>x0+200).length,flowRoutes:s._flowRoutes||0}}
test('60 soldiers ordered past a wall line with one gate-wide gap: nobody crosses the wall, they file through the gap like A*-only routing',()=>{
 const a=wallRun(false),f=wallRun(true);console.log('  A* only',JSON.stringify(a));console.log('  fields ',JSON.stringify(f));
 assert(f.flowRoutes>0,'the group used a shared field');assert.equal(f.crossed,0,'nobody crossed the wall line');assert(f.through>=Math.min(57,a.through),'the group got past the wall ('+f.through+'/60)')});
test('a group ordered into a sealed wall ring stays outside',()=>{
 const s=sandbox('lake_s',7),W=K.map.width,H=K.map.height,c={x:Math.round(W*.3/96)*96,y:Math.round(H*.3/96)*96},R=288;
 for(const p of [...K.wallPlan('wall',{x:c.x-R,y:c.y-R},{x:c.x+R,y:c.y-R}),...K.wallPlan('wall',{x:c.x-R,y:c.y+R},{x:c.x+R,y:c.y+R}),...K.wallPlan('wallvertical',{x:c.x-R,y:c.y-R+96},{x:c.x-R,y:c.y+R-96}),...K.wallPlan('wallvertical',{x:c.x+R,y:c.y-R+96},{x:c.x+R,y:c.y+R-96})]){const w=s.add(p.kind,1,p.x,p.y);w.complete=true}
 const g=[];for(let i=0;i<40;i++){const u=s.add('infantry',0,c.x-R-400+(i%8)*30,c.y-60+Math.floor(i/8)*30);s.freeSpawn(u);g.push(u)}s.order(g,{type:'move',x:c.x,y:c.y});
 for(let i=0;i<800;i++){s.tick(.05);for(const u of g)assert(!(Math.abs(u.x-c.x)<R-30&&Math.abs(u.y-c.y)<R-30),'a unit got inside the sealed ring')}});
