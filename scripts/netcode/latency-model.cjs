#!/usr/bin/env node
'use strict';
/* Monte-Carlo model of input -> first visible reaction, built from the REAL client/server constants:
   network-ui.js:  poll loop  next start = max(end+80ms, start+350ms); commands are only sent at the next request START (issue() just queues).
   network-client.js: units lerp toward the snapshot at rate 12/s (~80 ms to 63%).
   service.cjs:    advance() runs whole 100 ms steps BEFORE commands execute, snapshot built AFTER the command, so a move order shows
                   up as 'order set' in the SAME response but the unit only MOVES in the NEXT response (>= 1 step later).
   service.cjs Store.mutate: optimistic revision CAS, retry up to 6x after sleep 10-40 ms, each retry re-does decode+hydrate+tick+encode.
   Inputs you can change: --rtt (ms, client<->edge round trip), --cpu (ms server CPU per poll), --d1 (ms one D1 round trip), --seats.
   D1 latency / RTT values are ASSUMPTIONS (no network here); CPU values come from server-cost.cjs. */
const argv=Object.fromEntries(process.argv.slice(2).reduce((a,x,i,arr)=>{if(x.startsWith('--'))a.push([x.slice(2),arr[i+1]]);return a},[]));
function rng(seed){let x=seed>>>0||1;return ()=>{x^=x<<13;x>>>=0;x^=x>>>17;x^=x<<5;x>>>=0;return x/4294967296}}
function simulateHttp({rtt,cpu,d1,seats=4,secs=600,smooth=80,seed=1,pollMs=350,cores=Infinity}){
  const R=rng(seed),jit=()=>1+(R()-.5)*.3;
  // event-driven: each client loops; server commits tracked with revision counter
  let rev=0;const clients=Array.from({length:seats},(_,i)=>({next:R()*pollMs,inputs:[],lastEnd:0}));
  const horizon=secs*1000;const acks=[],reactions=[];let conflicts=0,reqs=0,failed=0;const cpuBusy=[];
  // generate requests in time order by repeatedly picking the client with the earliest start
  const execLog=[];
  while(true){
    clients.sort((a,b)=>a.next-b.next);const c=clients[0];if(c.next>horizon)break;
    const S=c.next;reqs++;
    const up=rtt/2*jit();let t=S+up,attempts=0,ok=false;
    // pending inputs queued before S
    let tries=0;
    while(tries<6){tries++;
      const readAt=t+d1/2*jit();const myRev=rev; // read snapshot of revision at readAt (approximation: rev is committed state at that time)
      const cpuMs=cpu*jit();const writeAt=readAt+d1/2*jit()+cpuMs+d1/2*jit();
      // conflict if any other client committed between readAt and writeAt: check commits log
      const clash=execLog.some(e=>e.t>readAt&&e.t<=writeAt);
      if(!clash){rev++;execLog.push({t:writeAt});if(execLog.length>50)execLog.shift();t=writeAt;ok=true;cpuBusy.push(cpuMs);break}
      conflicts++;t=writeAt+10+R()*30;
    }
    const E=t+rtt/2*jit()+(ok?0:0);
    c.reqs=(c.reqs||0)+1;
    // inputs that were queued while previous request in flight are sent in this request: model one input per client per ~1.7 s, uniformly
    // We evaluate a probe input generated at a random time within each polling cycle instead (below).
    c.starts=c.starts||[];c.starts.push({S,E,ok,execAt:ok?t:null});
    if(!ok)failed++;
    const delay=ok?Math.max(80,pollMs-(E-S)):1000;
    c.next=E+delay;
  }
  // probes: for client 0 sample random input times, find first request starting after input, then its response E, then next ok response
  const st=clients.find(c=>true);const lat=[],ack=[];
  for(const c of clients){const s=c.starts;for(let i=0;i<s.length-2;i++){// input uniformly between previous request START and this START
      const prevS=i?s[i-1].S:0;const x=prevS+R()*(s[i].S-prevS);if(!s[i].ok)continue;
      let j=i+1;while(j<s.length&&!s[j].ok)j++;if(j>=s.length)continue;
      ack.push(s[i].E-x);lat.push(s[j].E-x+smooth)}}
  const q=(a,p)=>{a.sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.floor(p*a.length))]};
  const cycle=[];for(const c of clients)for(let i=1;i<c.starts.length;i++)cycle.push(c.starts[i].S-c.starts[i-1].S);
  return {reqPerSec:+(reqs/secs).toFixed(1),conflictsPerReq:+(conflicts/reqs).toFixed(2),failedPct:+(100*failed/reqs).toFixed(1),pollCycleMs:Math.round(cycle.reduce((a,b)=>a+b,0)/cycle.length),ackMean:Math.round(ack.reduce((a,b)=>a+b,0)/ack.length),ackP95:Math.round(q(ack,.95)),
    reactMean:Math.round(lat.reduce((a,b)=>a+b,0)/lat.length),reactP50:Math.round(q(lat,.5)),reactP95:Math.round(q(lat,.95)),reactMax:Math.round(q(lat,.999)),cpuPerSecMs:Math.round(cpuBusy.reduce((a,b)=>a+b,0)/secs)}}
// relay-clocked lockstep: turn length T ms, jitter buffer J turns, uplink/downlink = rtt/2
function lockstep({rtt,T=100,J=1,secs=600,seed=2,D=1,smoothRender=8}){
  const R=rng(seed),jit=()=>1+(R()-.5)*.3,out=[];
  for(let k=0;k<20000;k++){const u=rtt/2*jit(),d=rtt/2*jit();const phase=R()*T; // click time relative to relay turn clock
    const arrive=phase+u;const n=Math.ceil(arrive/T);const execTurn=n+(D-1);const sendAt=execTurn*T;const recv=sendAt+d;
    out.push(recv-phase+J*T*0+smoothRender)} // J added separately below
  const q=(a,p)=>{a.sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.floor(p*a.length))]};
  const mean=out.reduce((a,b)=>a+b,0)/out.length;
  return {mean:Math.round(mean),p95:Math.round(q(out,.95)),withJitterBuffer:Math.round(mean+J*T)}}
/* After P0 (netcode-p0.md): a command is sent at once (it only waits for a request already in flight), the next poll follows after
   200 ms, and own units are predicted locally on the next frame. Conflict rate is taken from the event model above at the same CPU.
   Same assumptions: RTT and D1 round trip are inputs, not measurements. */
function simulateP0({rtt,cpu,d1,seats=4,pollMs=350,fastMs=200,smooth=80,seed=3}){const base=simulateHttp({rtt,cpu,d1,seats,pollMs}),R=rng(seed),jit=()=>1+(R()-.5)*.3,retry=base.conflictsPerReq/(1+base.conflictsPerReq);
  const dur=()=>{let t=rtt*jit()+d1*1.5*jit()+cpu*jit(),n=0;while(n++<5&&R()<retry)t+=cpu*jit()+d1*1.5*jit()+25;return t},ack=[],move=[];
  for(let i=0;i<20000;i++){const d0=dur(),cycle=Math.max(d0+80,pollMs),wait=R()<d0/cycle?R()*d0+30:4,d1r=dur(),gap=Math.max(80,fastMs-d1r);let d2=dur(),extra=0;if(gap+d2-rtt/2<100)extra=Math.max(80,fastMs-d2)+dur();ack.push(wait+d1r);move.push(wait+d1r+gap+d2+extra+smooth)}
  const q=(a,p)=>{a.sort((x,y)=>x-y);return a[Math.floor(p*a.length)]},mean=a=>a.reduce((x,y)=>x+y,0)/a.length;return {conflictsPerReq:base.conflictsPerReq,ackMean:Math.round(mean(ack)),ackP95:Math.round(q(ack,.95)),moveMean:Math.round(mean(move)),moveP95:Math.round(q(move,.95))}}
module.exports={simulateHttp,simulateP0,lockstep};
if(require.main!==module){/* required as a library (scripts/release/net-cost.cjs): no tables */}
else{
if(argv.p0!==undefined||process.argv.includes('--p0')){
  const cases=[['opening, 2 seats, ~12 units each',{seats:2},52,20],['4 seats, ~170 units',{seats:4},446,68],['4 seats, ~570 units, combat',{seats:4},778,244],['4 seats, ~810 units, combat',{seats:4},1050,369]];
  console.log('## Order -> first movement, before vs after P0 (model; RTT and D1=20 ms are assumptions, CPU from server-cost.cjs)');
  console.log('| scenario | RTT | CPU/poll before -> after | conflicts/req before -> after | order confirmed, mean (p95) before -> after | authoritative first movement visible, mean (p95) before -> after | own unit starts moving on screen (local prediction) |');console.log('|---|---|---|---|---|---|---|');
  for(const [name,o,before,after] of cases)for(const rtt of [40,100,200]){const b=simulateHttp({rtt,d1:20,cpu:before,...o}),a=simulateP0({rtt,d1:20,cpu:after,...o});console.log(`| ${name} | ${rtt} | ${before} -> ${after} | ${b.conflictsPerReq} -> ${a.conflictsPerReq} | ${b.ackMean} (${b.ackP95}) -> ${a.ackMean} (${a.ackP95}) | ${b.reactMean} (${b.reactP95}) -> ${a.moveMean} (${a.moveP95}) | next frame (<= 33 ms at 60 fps), not network dependent |`)}
  process.exit(0)}
const rows=[];
const cases=[
 ['2 seats, small map, measured CPU ~200 ms/poll',{cpu:200,seats:2}],
 ['4 seats, ~170 units, measured CPU ~450 ms/poll',{cpu:450,seats:4}],
 ['4 seats, ~800 units, measured CPU ~1170 ms/poll',{cpu:1170,seats:4}],
 ['4 seats, nav-grid cached (CPU 40 ms/poll)',{cpu:40,seats:4}],
 ['2 seats, nav-grid cached (CPU 25 ms/poll)',{cpu:25,seats:2}],
 ['4 seats, CPU 40 ms, poll interval 150 ms',{cpu:40,seats:4,pollMs:150}],
];
console.log('## HTTP polling (current architecture), 4 seats; times in ms');
console.log('| scenario | RTT | D1 RTT | req/s | conflicts/req | failed% | poll cycle | ack mean (p95) | first MOVE visible mean / p50 / p95 / p99.9 | server CPU ms/s |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for(const [name,o] of cases)for(const rtt of [40,100,200]){const r=simulateHttp({rtt,d1:20,...o});console.log(`| ${name} | ${rtt} | 20 | ${r.reqPerSec} | ${r.conflictsPerReq} | ${r.failedPct} | ${r.pollCycleMs} | ${r.ackMean} (${r.ackP95}) | ${r.reactMean} / ${r.reactP50} / ${r.reactP95} / ${r.reactMax} | ${r.cpuPerSecMs} |`)}
console.log('\n## Relay-clocked lockstep (WebSocket -> Durable Object), input delay D turns, jitter buffer J turns');
console.log('| turn | D | J | RTT | click -> own unit moves, mean | p95 | + jitter buffer |');console.log('|---|---|---|---|---|---|---|');
for(const T of [100,50])for(const D of [1,2])for(const rtt of [40,100,200]){const r=lockstep({rtt,T,D,J:1});console.log(`| ${T} ms | ${D} | 1 | ${rtt} | ${r.mean} | ${r.p95} | ${r.withJitterBuffer} |`)}
}
