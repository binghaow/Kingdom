#!/usr/bin/env node
'use strict';
/* Server-path cost, measured on the REAL handler (server/service.cjs handle(), node:sqlite via scripts/sqlite-d1.cjs = what preview.cjs runs).
   CPU only: in-memory SQLite, no network, no real D1 latency. CPU time = process.cpuUsage() (robust to a busy machine).
   Method: fast-forward the authoritative state with the sim directly, write it into the room row, then drive N real polls
   (4 seats, each every 350 ms => one request every 87.5 ms of game clock) and record per-request CPU, response size, stored size.
   usage: node server-cost.cjs [--fog 1] [--polls 40] [--seats 4] [--proto 1|2] [--seed N] [--checkpoints N] [--json out]
   stages.firstTickAfterHydrate = cold isolate (no nav cache); stages.firstTickCached = same isolate, cache hit. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),{DatabaseSync}=require('node:sqlite');
const H=require('./harness.cjs'),{K,S,ROOT}=H;const {sqliteD1}=require(path.join(ROOT,'scripts/sqlite-d1.cjs'));
const argv=Object.fromEntries(process.argv.slice(2).reduce((a,x,i,arr)=>{if(x.startsWith('--'))a.push([x.slice(2),arr[i+1]&&!arr[i+1].startsWith('--')?arr[i+1]:'1']);return a},[]));
const SEATS=+(argv.seats||4),FOG=(argv.fog??'1')==='1',POLLS=+(argv.polls||40),POLL=350;
const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(path.join(ROOT,'drizzle/0000_multiplayer.sql'),'utf8'));db.exec(fs.readFileSync(path.join(ROOT,'drizzle/0001_room_limits.sql'),'utf8'));
const env={DB:sqliteD1(db)};let clock=1793910000000;Date.now=()=>clock;
/* --seed N pins the world seed chosen by start() so runs are comparable; --checkpoints N stops early (1 = opening only). */
if(argv.seed){const real=crypto.getRandomValues.bind(crypto);crypto.getRandomValues=x=>x instanceof Uint32Array?(x[0]=+argv.seed,x):real(x)}
const LIMIT=+(argv.checkpoints||5),PROTO=+(argv.proto||2);
const cpu=()=>{const u=process.cpuUsage();return (u.user+u.system)/1000};
async function call(p,body,token){const headers={'Content-Type':'application/json'};if(token)headers.Authorization='Bearer '+token;const a=cpu();const r=await S.handle(new Request('https://k.test'+p,{method:'POST',headers,body:JSON.stringify(body)}),env);const text=await r.text();const ms=cpu()-a;return {status:r.status,ms,bytes:Buffer.byteLength(text),json:r.status<500?JSON.parse(text):null,text}}
const pct=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(p*s.length))]},mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
(async()=>{
 const created=await call('/api/rooms',{name:'A',nation:'china',config:{capacity:SEATS,mode:'ffa',mapId:SEATS>2?'coast_l':'coast_s',fog:FOG,minerals:'standard'}});const id=created.json.room.id;const seats=[{token:created.json.token,seq:0}];
 for(let i=1;i<SEATS;i++){const j=await call('/api/rooms/'+id+'/join',{name:'P'+i,nation:['china','japan','britain','france'][i]});seats.push({token:j.json.token,seq:0})}
 for(const s of seats)await call('/api/rooms/'+id,{action:'settings',ready:true},s.token);
 const st=await call('/api/rooms/'+id,{action:'start'},seats[0].token);if(st.status!==200)throw Error(JSON.stringify(st.json));
 const row0=()=>db.prepare('SELECT payload FROM multiplayer_rooms WHERE id=?').get(id);
 let room=await S.decode(row0().payload);let sim=K.networkHydrate(room.state);const bots=H.mkBots(SEATS,5);let tick=0;
 const kinds=['infantry','archer','musketeer','cavalry','halberd','cannon'];
 const forward=(sec)=>{for(const end=tick+sec*10;tick<end;tick++){const cmds=H.botCommands(sim,bots,tick);H.applyCommands(sim,cmds);if(tick%10===0)H.boost(sim,80);sim.tick(H.DT)}};
 const inject=(per)=>{for(let t=0;t<SEATS;t++){const town=sim.s.buildings.find(b=>b.team===t&&b.kind==='town');if(!town)continue;let have=sim.s.units.filter(u=>u.team===t).length;for(let i=0;have<per&&i<500;i++,have++){const a=i*0.61,r=140+((i*37)%320);const u=sim.add(kinds[i%kinds.length],t,town.x+Math.cos(a)*r,town.y+Math.sin(a)*r);sim.freeSpawn?.(u)}}
   for(let t=0;t<SEATS;t++){const army=sim.s.units.filter(u=>u.team===t&&u.kind!=='villager'&&!sim.sea(u)&&!sim.air(u));const foe=sim.s.buildings.find(b=>b.kind==='town'&&b.team===(t+1)%SEATS);if(foe&&army.length)S.execute(sim,t,{type:'order',args:{ids:army.slice(0,150).map(u=>u.id),order:{type:'advance',x:foe.x,y:foe.y}}})}};
 const results=[];
 async function checkpoint(label){
   // write sim -> room row, then drive real polls
   room.state=K.networkPersistent(sim);room.lastAt=clock;await db.prepare('UPDATE multiplayer_rooms SET payload=?,revision=revision+1 WHERE id=?').run(await S.encode(room),id);
   const polls=[],bytes=[],withCmd=[];let gz=0,raw=0,respGz=[];let stages=null;
   for(let i=0;i<POLLS;i++){const seat=i%SEATS;clock+=POLL/SEATS;const s=seats[seat];
     const cur=await S.decode(db.prepare('SELECT payload FROM multiplayer_rooms WHERE id=?').get(id).payload);const sh=K.networkHydrate(cur.state);const cmds=H.botCommands(sh,bots,Math.floor((clock-1793910000000)/100)).filter(c=>c[0]===seat).slice(0,6).map(c=>c[1]);
     const batch=cmds.map(c=>({seq:++s.seq,type:c.type,args:c.args}));
     const r=await call('/api/rooms/'+id,PROTO>=2?{commands:batch,eventAfter:s.eventAfter||0,proto:2,have:s.have||{}}:{commands:batch,eventAfter:s.eventAfter||0},s.token);if(r.status!==200){s.seq-=batch.length;continue}s.eventAfter=r.json.view.eventSeq;if(r.json.view.slim){s.have={...r.json.view.slim};s.cache??={};if(!K.networkExpand(r.json.view,s.cache))s.have={}}
     polls.push(r.ms);bytes.push(r.bytes);if(i%8===0)respGz.push(zlib.gzipSync(r.text).length);(batch.length?withCmd:[]).push(r.ms)}
   const pl=db.prepare('SELECT payload FROM multiplayer_rooms WHERE id=?').get(id).payload;gz=pl.byteLength;const rm=await S.decode(pl);raw=Buffer.byteLength(JSON.stringify(rm));
   // stage breakdown on this exact state (5 repetitions, CPU ms)
   const T={decode:[],hydrate:[],firstTickAfterHydrate:[],firstTickCached:[],tickWarm:[],persist:[],encode:[],snapshot:[],respStringify:[]};
   for(let k=0;k<5;k++){let a=cpu();const d=await S.decode(pl);T.decode.push(cpu()-a);a=cpu();const hs=K.networkHydrate(d.state);T.hydrate.push(cpu()-a);a=cpu();hs.tick(.1);T.firstTickAfterHydrate.push(cpu()-a);const hc=K.networkHydrate(d.state,{room:id});a=cpu();hc.tick(.1);T.firstTickCached.push(cpu()-a);a=cpu();hs.tick(.1);T.tickWarm.push(cpu()-a);a=cpu();K.networkPersistent(hs);T.persist.push(cpu()-a);a=cpu();await S.encode(d);T.encode.push(cpu()-a);a=cpu();const v=K.networkSnapshot(hs,0,0);T.snapshot.push(cpu()-a);a=cpu();JSON.stringify({view:v});T.respStringify.push(cpu()-a)}
   stages=Object.fromEntries(Object.entries(T).map(([k,v])=>[k,+pct(v,.5).toFixed(1)]));
   const o={label,units:rm.state.units.length,buildings:rm.state.buildings.length,nodes:rm.state.nodes.length,n:polls.length,cpuMeanMs:+mean(polls).toFixed(1),cpuP50:+pct(polls,.5).toFixed(1),cpuP95:+pct(polls,.95).toFixed(1),cpuMax:+Math.max(...polls).toFixed(1),respKB:+(mean(bytes)/1024).toFixed(1),respGzKB:+(mean(respGz)/1024).toFixed(1),storedGzKB:+(gz/1024).toFixed(1),storedRawKB:+(raw/1024).toFixed(1),stages};
   console.log(JSON.stringify(o));results.push(o);
   room=rm;sim=K.networkHydrate(rm.state); // continue from what the server wrote
 }
 await checkpoint('t=0s (47 units)');
 const save=()=>{if(argv.json)fs.writeFileSync(argv.json,JSON.stringify({fog:FOG,seats:SEATS,polls:POLLS,results},null,1))};if(LIMIT<2)return save();
 forward(60);await checkpoint('bot t~60s');if(LIMIT<3)return save();
 forward(120);await checkpoint('bot t~180s');
 inject(140);forward(5);await checkpoint('4x140 units, advancing/combat');
 inject(200);forward(5);await checkpoint('4x200 units, advancing/combat');
 if(argv.json)fs.writeFileSync(argv.json,JSON.stringify({fog:FOG,seats:SEATS,polls:POLLS,results},null,1));
})();
