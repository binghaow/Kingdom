/* Real drawRally + real game simulation: rendering must not reserve spawn slots. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),K=require('./public/network-model.js');
const ctx=new Proxy({moves:[]},{get(o,key){if(key in o)return o[key];if(key==='moveTo')return(x,y)=>o.moves.push({x,y});return()=>{}}});
const A={ready:Promise.resolve(),unit(){},node(){},icon(){},worldEffect(){}};
vm.runInNewContext(fs.readFileSync('./public/interaction-art.js','utf8'),{window:{KingdomArt:A,KingdomSim:K,KingdomArtProfiles:{}},document:{createElement(){return{getContext(){return ctx}}}},Image:class{}});
function draw(sim,b){ctx.moves=[];A.drawRally(ctx,b,sim);return ctx.moves.map(p=>({...p}))}
for(const mode of ['campaign','network']){
 const sim=new (mode==='network'?K.NetworkSim:K.Sim)('sandbox',null,{fog:false,mapId:'coast_s'}),s=sim.state;
 const producers=s.buildings.filter(b=>b.team===0&&K.defs[b.kind].trains?.length);
 for(const b of producers){const before=sim.serialize(),first=draw(sim,b);for(let i=0;i<600;i++)assert.deepEqual(draw(sim,b),first);assert.equal(sim.serialize(),before,'drawing mutated '+mode+' '+b.kind);
 const u={kind:K.defs[b.kind].trains[0],team:0,x:b.x,y:b.y},cursor=b.spawnCursor,p=sim.exitPoint(b,u);assert.deepEqual(sim.exitPoint(b,u),p);assert.equal(b.spawnCursor,cursor,'exit query reserved a slot');
 const born=[];for(let i=0;i<10;i++){const v=sim.add(u.kind,0,b.x,b.y);sim.rallySpawn(v,b);born.push(v);assert.deepEqual(draw(sim,b),first,'flag moved when producing '+b.kind)}
 for(let i=0;i<born.length;i++)for(let j=i+1;j<born.length;j++)assert(K.distance(born[i],born[j])>18,'stacked actual units');
 const chosen=sim.exitPoint(b,u);assert.equal(sim.setRally(b,chosen),'');const custom=draw(sim,b);assert.equal(custom[1].x,chosen.x);assert.equal(custom[1].y,chosen.y);assert.equal(sim.setRally(b,null),'');assert.deepEqual(draw(sim,b),first);
 b.spawnCursor=987654;const saved=new (mode==='network'?K.NetworkSim:K.Sim)('sandbox',JSON.parse(sim.serialize()));const building=saved.byId(b.id),snapshot=saved.serialize();assert.deepEqual(draw(saved,building),first);assert.equal(saved.serialize(),snapshot,'old save changed by preview');}
}
console.log('PASS campaign/network rally rendering is read-only across 600 frames, flag stays fixed through 10 separated spawns per producer, custom/reset rally and old high-cursor saves');
