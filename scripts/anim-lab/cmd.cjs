const {open,scene,zoom,strip}=require('./lib.cjs');
(async()=>{const {b,p}=await open({query:'?'});
await scene(p,{units:[{kind:'infantry',team:0,x:-60,y:0}]});await zoom(p,2);
await p.evaluate(()=>{const s=window.__sim;s.fx('command',{x:window.__cx+20,y:window.__cy+20,mode:'move'},.9)});
await strip(p,{w:240,h:160,dx:20,dy:10,interval:70,count:12,cols:6,file:process.env.S+'/out/strips-after/command_ring.png'});
await b.close()})();
