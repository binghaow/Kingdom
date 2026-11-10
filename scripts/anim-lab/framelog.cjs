// Logs, per rendered frame, which authored frame (or base art 'B') is shown for unit #0 during a duel, plus target flash and effects.
const {open,scene,zoom}=require('./lib.cjs');const fs=require('fs');
(async()=>{const [a,b,gap,secs,name]=process.argv.slice(2);const {b:br,p}=await open({query:process.env.Q||'?'});
const ids=await scene(p,{units:[{kind:a,team:0,x:-+gap/2,y:0,hp:50000},{kind:b,team:1,x:+gap/2,y:0,hp:50000}],attack:[[0,1],[1,0]]});
await zoom(p,2);
const log=await p.evaluate(async([id,secs])=>{const A=KingdomArt,T=KingdomAttackTiming,sim=window.__sim,s=sim.s||sim.state;const u=sim.byId(id),out=[];const t0=performance.now();let lastStrike=-1;
 await new Promise(res=>{function f(){const now=performance.now();const pose=A.attackPose(u);let code='B';if(pose){const fr=T.pair(pose.phase);code=''+(fr.blend<.5?fr.a:fr.b)}
  const tg=sim.byId(id===window.__ids[0]?window.__ids[1]:window.__ids[0]);out.push({ms:+(now-t0).toFixed(1),st:+s.time.toFixed(3),code,flash:+(tg?.flash||0).toFixed(2),cool:+u.cool.toFixed(2),fx:s.effects.map(e=>e.type+':'+(1-e.life/e.max).toFixed(2)).join(','),pulse:+(u.attackPulse||0).toFixed(2)});
  if(now-t0<secs*1000)requestAnimationFrame(f);else res()}requestAnimationFrame(f)});return out},[ids[0],+secs]).catch(e=>String(e));
fs.writeFileSync(process.env.S+'/out/framelog-'+name+'.json',JSON.stringify(log));
if(typeof log==='string'){console.log(log)}else{const fr=log.length;const dur=(log.at(-1).ms-log[0].ms)/1000;console.log(name,'render frames',fr,'fps',(fr/dur).toFixed(1));
 // run-length of codes
 const runs=[];let cur=null;for(const r of log){if(!cur||cur.code!==r.code){cur={code:r.code,t0:r.st,n:0};runs.push(cur)}cur.n++;cur.t1=r.st}console.log(runs.slice(0,40).map(r=>r.code+'@'+r.t0.toFixed(2)+'x'+r.n).join(' '))}
await br.close()})();
