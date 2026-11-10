// Before/after scenario strips: node scen.cjs <tag> [scenario...]
const {open,scene,zoom,strip}=require('./lib.cjs');const fs=require('fs');
const tag=process.argv[2],only=process.argv.slice(3);const out=process.env.S+'/out/strips-'+tag;fs.mkdirSync(out,{recursive:true});
const SC={
 inf_duel:{units:[{kind:'infantry',team:0,x:-22,y:0,hp:50000},{kind:'infantry',team:1,x:22,y:0,hp:50000}],attack:[[0,1],[1,0]],z:2,cap:{w:260,h:230,dy:-40,interval:70,count:18,cols:6}},
 archer_vs_inf:{units:[{kind:'archer',team:0,x:-120,y:0,hp:50000},{kind:'infantry',team:1,x:90,y:0,hp:50000}],attack:[[0,1]],z:1.5,cap:{w:360,h:200,dy:-30,interval:70,count:18,cols:6}},
 musket_vs_inf:{units:[{kind:'musketeer',team:0,x:-110,y:0,hp:50000},{kind:'infantry',team:1,x:90,y:0,hp:50000}],attack:[[0,1]],z:1.5,cap:{w:360,h:200,dy:-30,interval:70,count:18,cols:6}},
 cannon_vs_house:{units:[{kind:'cannon',team:0,x:-180,y:60,hp:50000},{kind:'infantry',team:1,x:150,y:60,hp:50000}],attack:[[0,1]],z:1.1,cap:{w:520,h:240,dy:-20,interval:80,count:18,cols:4}},
 cav_charge:{units:[{kind:'cavalry',team:0,x:-110,y:0,hp:50000},{kind:'infantry',team:1,x:60,y:0,hp:50000}],attack:[[0,1]],z:1.5,cap:{w:360,h:200,dy:-30,interval:80,count:18,cols:6}},
 walk:{units:[{kind:'infantry',team:0,x:-90,y:0}],move:[{i:0,x:200,y:0}],z:2,cap:{w:300,h:230,dy:-35,interval:90,count:18,cols:6,follow:true}},
 turn:{units:[{kind:'infantry',team:0,x:0,y:0}],path:[[100,0],[100,100],[-30,100],[-30,-20]],z:2,cap:{w:300,h:230,dy:-10,interval:100,count:18,cols:6,follow:true}},
 death:{units:[{kind:'infantry',team:0,x:-24,y:0,hp:50000},{kind:'infantry',team:1,x:24,y:0,hp:60}],attack:[[0,1]],z:2,cap:{w:260,h:230,dy:-40,interval:90,count:18,cols:6}},
};
(async()=>{const {b,p}=await open({query:process.env.Q||'?'});
for(const [name,sc] of Object.entries(SC)){if(only.length&&!only.includes(name))continue;
 const ids=await scene(p,{units:sc.units,attack:sc.attack});await zoom(p,sc.z);
 if(sc.move)await p.evaluate(([id,m])=>{const sim=window.__sim;sim.order([sim.byId(id)],{type:'move',x:window.__cx+m.x,y:window.__cy+m.y})},[ids[0],sc.move[0]]);
 if(sc.path){await p.evaluate(([id,path])=>{const sim=window.__sim;const u=sim.byId(id);let i=0;sim.order([u],{type:'move',x:window.__cx+path[0][0],y:window.__cy+path[0][1]});window.__pi=setInterval(()=>{const d=Math.hypot(u.x-(window.__cx+path[i][0]),u.y-(window.__cy+path[i][1]));if(d<12&&i<path.length-1){i++;sim.order([u],{type:'move',x:window.__cx+path[i][0],y:window.__cy+path[i][1]})}},50)},[ids[0],sc.path])}
 await p.waitForTimeout(sc.wait||400);
 await strip(p,{...sc.cap,file:out+'/'+name+'.png'});console.log('wrote',name)}
await b.close()})();
