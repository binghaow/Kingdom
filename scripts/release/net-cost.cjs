#!/usr/bin/env node
'use strict';
/* Release check (d): server cost per poll and multiplayer latency.
   1. scripts/netcode/server-cost.cjs on the real handler (in-memory SQLite): CPU per poll, response size before/after gzip,
      2-seat opening (fog off) and 4-seat scripted game (fog on); several runs, per-field median.
   2. Conflict recompute, measured in-process: all seats of a 4-seat room poll at the same instant for several rounds; every
      UPDATE that matches no row is a lost optimistic-lock race and costs one more decode/hydrate/tick/encode. This is the
      worst case (simultaneous arrival, no network spread); production rates depend on D1 latency.
   3. scripts/netcode/latency-model.cjs (protocol 2 / P0 client): order confirmed and first authoritative movement for
      RTT 40/100/200 ms, D1 round trip 20 ms (assumptions, no network here), CPU = the measured mean above.
   usage: node scripts/release/net-cost.cjs [--quick] [--json out.json] */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{ROOT,node,medianOf,r1,r2,args,mean}=require('./lib.cjs');
const L=require(path.join(ROOT,'scripts/netcode/latency-model.cjs'));
function serverCost(argv,reps){const runs=[];for(let i=0;i<reps;i++){const out=path.join(os.tmpdir(),`kingdom-server-cost-${process.pid}-${i}.json`);node(path.join(ROOT,'scripts/netcode/server-cost.cjs'),[...argv,'--json',out]);runs.push(JSON.parse(fs.readFileSync(out,'utf8')).results);fs.rmSync(out,{force:true})}
  return medianOf(runs).map(r=>({label:r.label,units:r.units,cpuMeanMs:r1(r.cpuMeanMs),cpuP50:r1(r.cpuP50),cpuP95:r1(r.cpuP95),cpuMax:r1(r.cpuMax),respKB:r1(r.respKB),respGzKB:r1(r.respGzKB),storedGzKB:r1(r.storedGzKB),firstTickAfterHydrateMs:r1(r.stages.firstTickAfterHydrate),firstTickCachedMs:r1(r.stages.firstTickCached)}))}
async function burst(rounds){const {DatabaseSync}=require('node:sqlite'),{sqliteD1}=require(path.join(ROOT,'scripts/sqlite-d1.cjs')),S=require(path.join(ROOT,'server/service.cjs'));
  const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(path.join(ROOT,'drizzle/0000_multiplayer.sql'),'utf8'));db.exec(fs.readFileSync(path.join(ROOT,'drizzle/0001_room_limits.sql'),'utf8'));
  const base=sqliteD1(db),tally={updates:0,lost:0};const DB={withSession(){return DB},prepare(sql){const p=base.prepare(sql);return {bind(...a){const b=p.bind(...a);return {...b,async run(){const r=await b.run();if(/^UPDATE multiplayer_rooms SET revision/.test(sql)){tally.updates++;if(!r.meta.changes)tally.lost++}return r}}}}}};
  const env={DB};let clock=1793910000000;const realNow=Date.now;Date.now=()=>clock;const realRandom=crypto.getRandomValues.bind(crypto);crypto.getRandomValues=x=>x instanceof Uint32Array?(x[0]=4242,x):realRandom(x);
  const cpu=()=>{const u=process.cpuUsage();return (u.user+u.system)/1000};
  async function call(p,body,token){const headers={'Content-Type':'application/json'};if(token)headers.Authorization='Bearer '+token;const r=await S.handle(new Request('https://k.test'+p,{method:'POST',headers,body:JSON.stringify(body)}),env);return {status:r.status,json:JSON.parse(await r.text())}}
  try{const created=await call('/api/rooms',{name:'A',nation:'china',config:{capacity:4,mode:'ffa',mapId:'coast_l',fog:true,minerals:'standard'}}),id=created.json.room.id,seats=[{token:created.json.token}];
    for(let i=1;i<4;i++){const j=await call('/api/rooms/'+id+'/join',{name:'P'+i,nation:['china','japan','britain','france'][i]});seats.push({token:j.json.token})}
    for(const s of seats)await call('/api/rooms/'+id,{action:'settings',ready:true},s.token);await call('/api/rooms/'+id,{action:'start'},seats[0].token);
    const seqCpu=[],burstCpu=[];let failed=0;
    for(let r=0;r<rounds;r++){clock+=350;let a=cpu();for(const s of seats){await call('/api/rooms/'+id,{proto:2,have:{}},s.token)}seqCpu.push(cpu()-a);}
    tally.updates=0;tally.lost=0;
    for(let r=0;r<rounds;r++){clock+=350;const a=cpu();const res=await Promise.all(seats.map(s=>call('/api/rooms/'+id,{proto:2,have:{}},s.token)));burstCpu.push(cpu()-a);failed+=res.filter(x=>x.status!==200).length}
    const requests=rounds*4;return {rounds,requests,lostRaces:tally.lost,conflictsPerReq:r2(tally.lost/requests),failedRequests:failed,cpuPerRoundSequentialMs:r1(mean(seqCpu)),cpuPerRoundSimultaneousMs:r1(mean(burstCpu)),extraCpuPct:Math.round((mean(burstCpu)/mean(seqCpu)-1)*100)}}
  finally{Date.now=realNow;crypto.getRandomValues=realRandom}}
async function run({quick=false}={}){const reps=quick?2:3;
  const opening=serverCost(['--seats','2','--fog','0','--seed','4242','--checkpoints','2','--polls','40'],reps);
  const four=serverCost(['--seats','4','--fog','1','--seed','4242','--checkpoints',quick?'3':'4','--polls',quick?'30':'40'],reps);
  const conflicts=await burst(quick?6:12);
  const latency=[];for(const [name,seats,cpu] of [['2 人开局',2,opening[0].cpuMeanMs],['4 人 ~170 单位',4,four[2].cpuMeanMs],...(four[3]?[['4 人 ~570 单位对攻',4,four[3].cpuMeanMs]]:[])])for(const rtt of [40,100,200]){const m=L.simulateP0({rtt,cpu,d1:20,seats});latency.push({scenario:name,seats,rttMs:rtt,d1Ms:20,cpuMs:cpu,conflictsPerReqModel:m.conflictsPerReq,ackMeanMs:m.ackMean,ackP95Ms:m.ackP95,firstMoveMeanMs:m.moveMean,firstMoveP95Ms:m.moveP95,ownUnitOnScreen:'next frame (local prediction)'})}
  return {reps,opening,fourSeats:four,conflicts,latency,assumptions:'RTT 40/100/200 ms 与 D1 往返 20 ms 为假设值；CPU 为本机 Node 实测（内存 SQLite），不是 Cloudflare Worker / D1 实测。'}}
module.exports={run};
if(require.main===module){const a=args();run({quick:!!a.quick}).then(r=>{if(a.json)fs.writeFileSync(a.json,JSON.stringify(r,null,1));console.log(JSON.stringify(r,null,1))})}
