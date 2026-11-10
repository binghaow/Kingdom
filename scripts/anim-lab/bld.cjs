const {open,scene,zoom,strip}=require('./lib.cjs');
(async()=>{const tag=process.argv[2];const {b,p}=await open({query:process.env.Q||'?'});
const ids=await scene(p,{units:[{kind:'cannon',team:0,x:-230,y:40,hp:50000},{kind:'infantry',team:0,x:-70,y:50,hp:50000},{kind:'house',team:1,x:30,y:20}],attack:[[0,2],[1,2]]});
await zoom(p,1.3);await p.evaluate(id=>{const h=window.__sim.byId(id);h.hp=h.maxhp=900;h.complete=true},ids[2]);
await strip(p,{w:520,h:260,dy:-60,interval:110,count:12,cols:3,file:process.env.S+'/out/strips-'+tag+'/building_hit.png'});
await p.evaluate(id=>{const h=window.__sim.byId(id);if(h)h.hp=Math.min(h.hp,40)},ids[2]);
await strip(p,{w:520,h:260,dy:-60,interval:200,count:12,cols:3,file:process.env.S+'/out/strips-'+tag+'/building_collapse.png'});
await b.close()})();
