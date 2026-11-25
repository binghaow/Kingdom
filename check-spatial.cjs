/* P5 spatial service (src/core/spatial.js, docs/p5/progress.md): every shortcut must give the answers of the full test it replaces.
   1. landClear: points in a "certainly clear" cell are never blocked terrain (sampled on every map, plus a dense grid near features).
   2. building / wall indexes: blocked() through the indexes == the full scan over every building and wall rectangle.
   3. PointGrid: cell queries == brute force, ascending order. */
const assert=require('node:assert/strict'),K=require('./public/network-model.js'),SP=require('./public/kingdom-spatial.js'),D=K.defs;
function test(name,fn){fn();console.log('PASS '+name)}
let seed=4242;const rnd=()=>(seed=seed*16807%2147483647)/2147483647;

test('certainly-clear terrain cells contain no blocked terrain point, on every map (incl. straits, delta, cliffs, coast)',()=>{
 for(const mapId of Object.keys(K.maps))for(const count of [2,4]){
  const s=new K.Sim('normal',null,{nations:['britain','france','china','japan'].slice(0,count),groups:[1,2,3,4].slice(0,count),mapId,seed:9,fog:false}),w=s.world,c=SP.landClear(w);let tested=0;
  assert(c.clear>.25,mapId+': most of the map is certainly clear ('+(c.clear*100).toFixed(0)+'%)');
  // random points in clear cells, and a 4 px lattice over every clear cell that touches a non-clear cell (the boundary band)
  for(let i=0;i<60000;i++){const x=rnd()*w.width,y=rnd()*w.height;if(!SP.clearAt(c,x,y))continue;tested++;assert.equal(s.blockedTerrain(x,y,null),false,`${mapId}: clear cell point ${x},${y} is blocked`)}
  const C=SP.TERRAIN_CELL;for(let r=1;r<c.rows-1;r++)for(let q=1;q<c.cols-1;q++){const k=r*c.cols+q;if(!c.mask[k]||c.mask[k-1]&&c.mask[k+1]&&c.mask[k-c.cols]&&c.mask[k+c.cols])continue;
   for(let y=r*C;y<(r+1)*C;y+=4)for(let x=q*C;x<(q+1)*C;x+=4){tested++;assert.equal(s.blockedTerrain(x+.5,y+.5,null),false,`${mapId}: boundary clear cell point ${x},${y} is blocked`)}}
  assert(tested>20000,mapId+' tested '+tested)}});

function lateGame(){const s=new K.Sim('normal',null,{nations:['britain','france','china','japan'],groups:[1,2,3,4],mapId:'lake_l',seed:31,fog:false});
 for(let i=0;i<20*60*6;i++)s.tick(.05);return s}
const fullBuildings=(s,x,y,u)=>s.s.buildings.some(b=>b.hp>0&&s.blocksPoint(b,x,y,u));
test('blocked() through the building and wall indexes == full scans (6-minute 4-side game with added walls)',()=>{
 const s=lateGame(),W=s.world.width,H=s.world.height,town=s.s.buildings.find(b=>b.kind==='town');
 // a few walls and a gate near a town so the wall index has work
 for(let i=0;i<6;i++){const w=s.add(i===3?'gate':'wall',town.team,Math.round((town.x-288+i*96)/96)*96,Math.round((town.y+384)/96)*96);w.complete=true}s._wallParts=null;s.refreshWalls();
 const probes=[null,s.s.units.find(u=>u.kind==='villager'),s.s.units.find(u=>u.team!==town.team)].filter(x=>x!==undefined);let n=0,hits=0;
 const fullWalls=(x,y,u)=>{for(const b of s.wallList()){if(b.hp<=0||!D[b.kind]?.wall||D[b.kind].gate&&u&&s.allied(b.team,u.team))continue;for(const r of s._wallParts.get(b.id)||[])if(Math.abs(x-r.x)<r.rx+15&&Math.abs(y-r.y)<r.ry+15)return true}return false};
 for(let i=0;i<120000;i++){const b=s.s.buildings[i%s.s.buildings.length],u=probes[i%probes.length],x=i%3?b.x+(rnd()-.5)*260:rnd()*W,y=i%3?b.y+(rnd()-.5)*260:rnd()*H;
  const a=s.buildingAt(x,y,u),f=fullBuildings(s,x,y,u);assert.equal(a,f,`building test at ${x},${y}`);
  const aw=s.blocked(x,y,u),fw=(s.blockedTerrain(x,y,u)||(!s.air(u)&&f))||(!s.air(u)&&fullWalls(x,y,u));if(u?.kind!=='ant')assert.equal(aw,fw,`blocked() at ${x},${y}`);n++;if(f)hits++}
 assert(hits>2000,'enough points inside buildings ('+hits+')');console.log('  '+n+' points, '+hits+' inside a building')});

test('PointGrid cell queries == brute force, ascending',()=>{const g=new SP.PointGrid(5000,4000,128),n=3000,xs=new Float64Array(n),ys=new Float64Array(n);
 for(let i=0;i<n;i++){xs[i]=rnd()*5400-200;ys[i]=rnd()*4400-200}const keep=i=>i%7!==3;g.build(n,xs,ys,keep);const col=x=>Math.min(g.cols-1,Math.max(0,Math.floor(x/128))),row=y=>Math.min(g.rows-1,Math.max(0,Math.floor(y/128)));
 for(let t=0;t<2000;t++){const q0=Math.floor(rnd()*44)-2,r0=Math.floor(rnd()*35)-2,q1=q0+Math.floor(rnd()*4),r1=r0+Math.floor(rnd()*4),after=Math.floor(rnd()*n)-1;const m=g.queryCells(q0,r0,q1,r1,after),got=Array.from(g.out.subarray(0,m));
  const cq0=Math.max(0,Math.min(g.cols-1,q0)),cq1=Math.max(0,Math.min(g.cols-1,q1)),cr0=Math.max(0,Math.min(g.rows-1,r0)),cr1=Math.max(0,Math.min(g.rows-1,r1));
  const want=[];for(let i=after+1;i<n;i++)if(keep(i)&&col(xs[i])>=cq0&&col(xs[i])<=cq1&&row(ys[i])>=cr0&&row(ys[i])<=cr1)want.push(i);assert.deepEqual(got,want)}});
