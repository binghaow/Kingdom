// Large-battle render timing. node perf.cjs label desktop|phone [query]
const {open,scene,zoom}=require('./lib.cjs');const fs=require('fs');
(async()=>{const [label,dev,q]=process.argv.slice(2);const phone=dev==='phone';
const {b,p}=await open({w:phone?393:1280,h:phone?852:720,dpr:phone?3:1,touch:phone,query:q||'?perf=1'});
const kinds=['infantry','archer','cavalry','musketeer','cannon','halberd','longbow','grenadier','villager'];
const units=[];const N=+(process.env.N||100);
for(let i=0;i<N;i++){const k=kinds[i%kinds.length],row=Math.floor(i/10),col=i%10;units.push({kind:k,team:0,x:-170-row*26,y:-170+col*38+((row&1)*10),hp:6000});units.push({kind:kinds[(i+3)%kinds.length],team:1,x:170+row*26,y:-170+col*38+((row&1)*10),hp:6000})}
await scene(p,{units});await zoom(p,phone?.9:1.2);
await p.evaluate(()=>{const s=(window.__sim.s||window.__sim.state);for(const u of s.units){u.maxhp=u.hp}});
const samples=[];const t0=Date.now();const secs=+(process.env.SECS||24);
while(Date.now()-t0<secs*1000){await p.waitForTimeout(1000);const t=await p.evaluate(()=>{const n=document.getElementById('performance-audit');return n?n.textContent:''});samples.push(t)}
const last=samples.slice(-6);
const parse=t=>{const g=re=>{const m=t.match(re);return m?m.slice(1).map(Number):[]};return{fps:g(/FPS ([\d.]+)/)[0],frame:g(/frame p50\/p95 ([\d.]+)\/([\d.]+)/),update:g(/update ([\d.]+)\/([\d.]+)/),render:g(/render ([\d.]+)\/([\d.]+)/),scene:g(/scene ([\d.]+)\/([\d.]+)/),visible:g(/visible (\d+)/)[0],units:g(/active (\d+) units/)[0],passes:(t.match(/scene passes (.*)/)||[])[1]}};
const rows=last.map(parse);const med=a=>{a=a.filter(x=>x!==undefined&&!isNaN(x)).sort((x,y)=>x-y);return a[a.length>>1]};
const out={label,dev,fps:med(rows.map(r=>r.fps)),frameP50:med(rows.map(r=>r.frame[0])),frameP95:med(rows.map(r=>r.frame[1])),renderP50:med(rows.map(r=>r.render[0])),renderP95:med(rows.map(r=>r.render[1])),sceneP50:med(rows.map(r=>r.scene[0])),sceneP95:med(rows.map(r=>r.scene[1])),updateP50:med(rows.map(r=>r.update[0])),visible:med(rows.map(r=>r.visible)),units:med(rows.map(r=>r.units)),passes:rows.at(-1).passes};
console.log(JSON.stringify(out));fs.appendFileSync(process.env.S+'/out/perf-results.jsonl',JSON.stringify(out)+'\n');
if(process.env.SHOT)await p.screenshot({path:process.env.S+'/out/'+process.env.SHOT});
await b.close()})();
