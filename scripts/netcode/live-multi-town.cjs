/* v43 live multiplayer check against a running local preview (node preview.cjs, port 8765).
   1. Creates a 2-seat room with a computer seat (fillAI, expert, fog), readies and starts it, then polls like a client for
      SECONDS (default 70) and records every HTTP status, frame and error.
   2. "Save -> server rebuild": after SAVE_AT seconds it edits the saved room row in .local/rooms.sqlite the way a
      long game would look (both seats in age II with a completed second town centre, the computer's start town destroyed),
      then keeps polling; every later poll rebuilds the simulation from that saved state (networkHydrate).
   Pass = no non-200 response, frames keep advancing after the edit, the computer seat keeps its second town and acts.
   usage: node scripts/netcode/live-multi-town.cjs [seconds] [port] */
const path=require('node:path'),{DatabaseSync}=require('node:sqlite'),root=path.join(__dirname,'..','..'),K=require(path.join(root,'public/network-model.js')),{encode,decode}=require(path.join(root,'server/service.cjs'));
const SECONDS=Number(process.argv[2]||70),PORT=Number(process.argv[3]||8765),BASE='http://127.0.0.1:'+PORT,SAVE_AT=Math.min(25,SECONDS/3);
const statuses={},errors=[];let token='',id='';
async function call(p,body){const r=await fetch(BASE+p,{method:'POST',headers:{'Content-Type':'application/json',Origin:BASE,...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});statuses[r.status]=(statuses[r.status]||0)+1;const j=await r.json().catch(()=>({}));if(r.status>=300)errors.push(r.status+' '+(j.error||''));return j}
function editSave(){const db=new DatabaseSync(path.join(root,'.local/rooms.sqlite'));const row=db.prepare('SELECT revision, payload FROM multiplayer_rooms WHERE id = ?').get(id);return {db,row}}
async function makeExpansions(){const {db,row}=editSave(),room=await decode(row.payload),sim=K.networkHydrate(room.state,{room:room.id}),made=[];
 for(const team of [0,1]){sim.s.ages[team]=Math.max(2,sim.s.ages[team]);sim.s.resources[team].wood+=600;sim.s.resources[team].stone+=300;const home=sim.townOf(team);let done=false;
  for(let r=760;r<1500&&!done;r+=40)for(let i=0;i<24&&!done;i++){const a=i*Math.PI/12,x=home.x+Math.cos(a)*r,y=home.y+Math.sin(a)*r;const v=sim.add('villager',team,x+90,y+90);sim.updateFog?.();if(!sim.placementError('town',x,y,team)&&!sim.construct('town',x,y,[v],team)?.error){const b=sim.s.buildings.filter(b=>b.team===team&&b.kind==='town').at(-1);b.complete=true;b.progress=1;b.hp=b.maxhp||K.defs.town.hp;made.push({team,x:Math.round(x),y:Math.round(y)});done=true}else sim.s.units=sim.s.units.filter(u=>u!==v)}}
 const main=sim.s.buildings.find(b=>b.team===1&&b.kind==='town');main.hp=0;sim.tick(.1);
 room.state=K.networkPersistent(sim);const payload=await encode(room),r=db.prepare('UPDATE multiplayer_rooms SET revision = revision + 1, payload = ? WHERE id = ? AND revision = ?').run(payload,id,row.revision);db.close();return {made,changed:r.changes,defeated:room.state.defeated}}
async function seatTowns(){const {db,row}=editSave(),room=await decode(row.payload);db.close();const s=room.state;return {time:Math.round(s.time),towns:[0,1].map(t=>s.buildings.filter(b=>b.team===t&&b.kind==='town'&&b.hp>0).length),defeated:s.defeated,ended:!!s.ended,villagers1:s.units.filter(u=>u.team===1&&u.kind==='villager').length,aiTowns:s.aiTowns||null}}
(async()=>{const created=await call('/api/rooms',{name:'Check',nation:'britain',config:{capacity:2,mapId:'coast_s',fillAI:true,difficulty:'expert',fog:true}});token=created.token;id=created.room?.id;if(!id)throw new Error('room not created '+JSON.stringify(created));
 await call('/api/rooms/'+id,{action:'settings',ready:true});const started=await call('/api/rooms/'+id,{action:'start',proto:2});if(started.room?.status!=='playing')throw new Error('not started '+JSON.stringify(started.room||started));
 const t0=Date.now();let lastFrame=0,frameAtEdit=null,edit=null,before=null,polls=0,eventAfter=0,maxPollMs=0;
 while(Date.now()-t0<SECONDS*1000){const t=Date.now();const v=await call('/api/rooms/'+id,{proto:2,eventAfter});maxPollMs=Math.max(maxPollMs,Date.now()-t);polls++;lastFrame=v.room?.frame??lastFrame;if(v.view?.events?.length)eventAfter=v.view.events.at(-1).id||eventAfter;
  if(!edit&&Date.now()-t0>SAVE_AT*1000){before=await seatTowns();edit=await makeExpansions();frameAtEdit=lastFrame}await new Promise(r=>setTimeout(r,250))}
 const after=await seatTowns(),report={room:id,seconds:SECONDS,polls,statuses,errors:errors.slice(0,5),maxPollMs,frames:lastFrame,frameAtEdit,before,edit,after};console.log(JSON.stringify(report,null,1));
 const ok=!errors.length&&Object.keys(statuses).every(s=>s==='200'||s==='201')&&lastFrame>frameAtEdit+300&&after.towns[1]>=1&&!after.defeated.includes(1)&&!after.ended;console.log(ok?'PASS live multi-town room':'FAIL live multi-town room');process.exit(ok?0:1)})().catch(e=>{console.error('FAIL',e);process.exit(1)});
