'use strict';
// Shared harness: loads the REAL simulation stack (same files the Worker bundles) read-only from a repo root.
const path=require('node:path');
const ROOT=process.env.KINGDOM_ROOT||path.resolve(__dirname,'../..');
const K=require(path.join(ROOT,'public/network-model.js'));
const S=require(path.join(ROOT,'server/service.cjs'));
const DT=0.1; // server step (server/service.cjs advance()). Single player uses 0.05 (expansion.js).
function createSim({seed=12345,seats=4,mapId='coast_l',fog=true,minerals='standard',difficulty='beginner'}={}){
  const nat=['china','japan','britain','france'].slice(0,seats);
  const sim=new K.NetworkSim(difficulty,null,{nations:nat,groups:nat.map((_,i)=>i+1),mapId,minerals,fog,seed,humanTeams:nat.map((_,i)=>i)});
  sim.s.playerNames=nat.map((_,i)=>'P'+i);sim.s.netMode='ffa';sim.announce('start');return sim;
}
// ---- deterministic scripted "players" (own LCG: never touches sim RNG, never reads wall clock) ----
function botRng(seed){let x=seed>>>0||1;return ()=>{x=Math.imul(x,1664525)+1013904223>>>0;return x/4294967296}}
function mkBots(n,seed){return Array.from({length:n},(_,i)=>({r:botRng(seed*7919+i*104729+1),phase:i}))}
const MIL=['barracks','range','stable','workshop','dock'];
function botCommands(sim,bots,tick){
  const out=[],s=sim.s;if(tick%10)return out; // 1 command round per game second
  for(let a=0;a<bots.length;a++){
    if(s.defeated.includes(a))continue;const b=bots[a],mine=s.units.filter(u=>u.team===a),blds=s.buildings.filter(x=>x.team===a),town=blds.find(x=>x.kind==='town');if(!town)continue;
    const vill=mine.filter(u=>u.kind==='villager'),idle=vill.filter(u=>!u.order&&!u.buildQueue?.length);
    const pop=mine.length,cap=sim.capacity?sim.capacity(a):140;
    // gather
    for(const u of idle.slice(0,8)){const res=['food','wood','gold'][(u.id+a)%3];let best=null,bd=1e9;for(const n of s.nodes){if(n.amount<=0||(n.resource||n.kind)!==res||D(n)||!sim.canSee(a,n))continue;const d=(n.x-u.x)**2+(n.y-u.y)**2;if(d<bd){bd=d;best=n}}if(best)out.push([a,{type:'order',args:{ids:[u.id],order:{type:'gather',id:best.id}}}])}
    // economy: villagers
    if(vill.length<45&&pop<cap&&town.queue.length<2)out.push([a,{type:'train',args:{id:town.id,kind:'villager'}}]);
    // houses / military buildings via a free villager
    const free=vill.find(u=>!u.order&&!u.buildQueue?.length)||vill.find(u=>u.order?.type!=='build');
    const want=pop>=cap-4?'house':MIL.find(k=>D2[k]&&D2[k].age<=s.ages[a]&&!blds.some(x=>x.kind===k)&&k!=='dock'&&k!=='workshop')||(blds.filter(x=>x.kind==='house').length<18&&tick%200===0?'house':null);
    if(want&&free&&!blds.some(x=>!x.complete)){const ang=b.r()*6.283,rad=160+b.r()*260;out.push([a,{type:'construct',args:{kind:want,x:town.x+Math.cos(ang)*rad,y:town.y+Math.sin(ang)*rad,ids:[free.id]}}])}
    // military production
    for(const x of blds){if(!x.complete||x.kind==='town'||!D2[x.kind]?.trains||x.queue.length>=2)continue;const opts=D2[x.kind].trains.filter(k=>(D2[k].age||1)<=s.ages[a]&&!D2[k].hero&&!D2[k].companion);if(opts.length&&pop<cap)out.push([a,{type:'train',args:{id:x.id,kind:opts[Math.floor(b.r()*opts.length)]}}])}
    // age up
    if(tick%100===0&&!town.queue.length)out.push([a,{type:'research',args:{id:town.id,key:'age'}}]);
    // attack waves every 60 s once army >= 12
    const army=mine.filter(u=>u.kind!=='villager'&&D2[u.kind]?.damage>0&&!sim.sea(u)&&!sim.air(u)&&!u.embarkedOn);
    if(tick%600===300&&army.length>=12){const foes=blds.length?s.buildings.filter(x=>x.kind==='town'&&x.team!==a&&!s.defeated.includes(x.team)):[];if(foes.length){const f=foes[(b.phase+Math.floor(tick/600))%foes.length];out.push([a,{type:'order',args:{ids:army.slice(0,150).map(u=>u.id),order:{type:'advance',x:f.x,y:f.y}}}])}}
  }
  return out;
}
const D2=K.defs;function D(n){return !!D2[n.kind]?.building}
function boost(sim,perSecond){for(let a=0;a<sim.s.nations.length;a++){const r=sim.s.resources[a];r.food+=perSecond;r.wood+=perSecond;r.gold+=perSecond*.6;r.stone+=perSecond*.2}}
function applyCommands(sim,cmds){let ok=0,bad=0;for(const [a,c] of cmds){try{S.execute(sim,a,c);ok++}catch(e){if(e instanceof S.Problem)bad++;else throw e}}return {ok,bad}}
// ---- hashing ----
function fnv(str){let h=0x811c9dc5;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,0x01000193)}return h>>>0}
const SKIP=new Set(['explored','fogMemory']);// written only by persistent(); not simulation state
function fieldHashes(sim){const o={};for(const k of Object.keys(sim.s)){if(SKIP.has(k))continue;o[k]=fnv(JSON.stringify(sim.s[k]))}
  if(sim.fog){o['@fog.visible']=fnv(sim.fog.visible.map(a=>Array.from(a).join('')).join('|'));o['@fog.explored']=fnv(sim.fog.explored.map(a=>Array.from(a).join('')).join('|'))}return o}
function combine(h){let x=0;for(const k of Object.keys(h).sort())x=(Math.imul(x^h[k],0x01000193)^fnv(k))>>>0;return x}
function deepDiff(a,b,p='',out=[],lim=8){if(out.length>=lim)return out;if(a===b)return out;if(typeof a==='number'&&typeof b==='number'){if(!(Number.isNaN(a)&&Number.isNaN(b)))out.push(`${p}: ${a} vs ${b}`);return out}
  if(a===null||b===null||typeof a!=='object'||typeof b!=='object'){out.push(`${p}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);return out}
  if(Array.isArray(a)!==Array.isArray(b)){out.push(p+': array/object mismatch');return out}
  if(Array.isArray(a)){if(a.length!==b.length){out.push(`${p}.length: ${a.length} vs ${b.length}`);}const n=Math.min(a.length,b.length);for(let i=0;i<n&&out.length<lim;i++){deepDiff(a[i],b[i],`${p}[${i}]${a[i]&&a[i].id!==undefined?'(id='+a[i].id+',kind='+(a[i].kind||'')+')':''}`,out,lim)}return out}
  const ka=Object.keys(a),kb=Object.keys(b);for(const k of new Set([...ka,...kb])){if(out.length>=lim)break;if(a[k]===undefined&&b[k]===undefined)continue;if(a[k]===undefined||b[k]===undefined){if(!(k in a)||!(k in b)||true){out.push(`${p}.${k}: key only in ${a[k]===undefined?'B':'A'}`);}continue}deepDiff(a[k],b[k],p+'.'+k,out,lim)}return out}
function hydrateRoundTrip(sim,room){const st=JSON.parse(JSON.stringify(K.networkPersistent(sim)));return room?K.networkHydrate(st,{room}):K.networkHydrate(st)}
module.exports={boost,K,S,ROOT,DT,createSim,mkBots,botCommands,applyCommands,fieldHashes,combine,deepDiff,hydrateRoundTrip,fnv};
