/* ================= command queue (lockstep-ready) =================
   All player intents become plain-data command objects (ids, not object refs).
   issue(c) -> cmdQ + cmdLog; runCommands() applies them at the start of step() (tick c.tick).
   Replay: set replayLog=[...cmdLog] on a fresh game with the same seed; issue() is then ignored.
   For networking later: ship {tick,team,c,...} objects; each peer applies them in (tick,order). */
const ME=0;
let cmdQ=[],cmdLog=[],replayLog=null,replayPos=0;
function resetCmds(){cmdQ=[];cmdLog=[];replayLog=null;replayPos=0;}
function startReplay(log){replayLog=log.map(c=>Object.assign({},c));replayPos=0;}
function issue(c){
  if(replayLog)return;
  if(c.team===undefined)c.team=ME;
  c.tick=G.tick+1;
  cmdQ.push(c);cmdLog.push(c);selDirty=true;
}
function flushCmds(){while(cmdQ.length)execCmd(cmdQ.shift());}
function runCommands(){
  if(replayLog){while(replayPos<replayLog.length&&replayLog[replayPos].tick<=G.tick)execCmd(replayLog[replayPos++]);return;}
  flushCmds();
}
function listOf(ids,kind,team){
  const o=[];
  if(ids)for(let i=0;i<ids.length;i++){const e=byId.get(ids[i]);if(e&&!e.dead&&e.kind===kind&&e.team===team)o.push(e);}
  return o;
}
function formation(n,i,x,y){
  if(n<=1)return {x,y};
  const cols=Math.ceil(Math.sqrt(n)),r=Math.floor(i/cols),c=i%cols;
  return {x:x+(c-(cols-1)/2)*22,y:y+(r-(Math.ceil(n/cols)-1)/2)*22};
}
function orderMove(u,x,y){u.ord={t:'move',x,y};goPoint(u,x,y);}
function orderMoveGroup(list,wx,wy){list.forEach((u,i)=>{const p=formation(list.length,i,wx,wy);orderMove(u,p.x,p.y);});}
function popStallWarn(team){
  if(team!==ME)return;
  const t=T[team];
  if(t.pop>=Math.min(t.cap,100)&&G.t-(G.popWarn||-99)>4){
    G.popWarn=G.t;
    toast(t.cap>=100?'已达人口上限 100':'人口已满，需要建造更多房屋','warn');
  }
}
function execCmd(c){
  const team=c.team,t=T[team];
  if(!t)return;
  switch(c.c){
    case 'cmd':{ // right-click semantics: attack / gather / repair-build / move
      const us=listOf(c.ids,'u',team),tgt=c.tgt?byId.get(c.tgt):null,wx=c.x,wy=c.y;
      if(!us.length)return;
      if(tgt&&!tgt.dead&&tgt.team>=0&&tgt.team!==team){
        for(const u of us){u.ord={t:'attack',tgt,fails:0};u.path=null;u.repath=0;}
        return;
      }
      const vs=us.filter(u=>u.type==='villager'),rest=us.filter(u=>u.type!=='villager');
      if(tgt&&!tgt.dead&&tgt.kind==='r'){
        for(const u of vs)orderGather(u,tgt);
        orderMoveGroup(rest,wx,wy);return;
      }
      if(tgt&&!tgt.dead&&tgt.kind==='b'&&tgt.team===team){
        if(vs.length){
          if(tgt.type==='farm'&&tgt.done&&tgt.amt>0)for(const u of vs)orderGather(u,tgt);
          else if(!tgt.done||tgt.hp<tgt.maxhp)for(const u of vs){u.ord={t:'build',tgt,st:'go'};u.path=null;}
          else orderMoveGroup(vs,wx,wy);
        }
        orderMoveGroup(rest,wx,wy);return;
      }
      orderMoveGroup(us,wx,wy);return;
    }
    case 'amove':{
      const us=listOf(c.ids,'u',team);
      us.forEach((u,i)=>{
        const p=formation(us.length,i,c.x,c.y);
        if(u.type==='villager')u.ord={t:'move',x:p.x,y:p.y};else u.ord={t:'amove',x:p.x,y:p.y};
        goPoint(u,p.x,p.y);
      });
      return;
    }
    case 'rally':{
      const tgt=c.tgt?byId.get(c.tgt):null;
      for(const b of listOf(c.bids,'b',team)){
        if(!b.done||!BDEF[b.type].train)continue;
        b.rally={x:c.x,y:c.y,tgt:(tgt&&!tgt.dead&&tgt.kind!=='u'&&(tgt.team===-1||tgt.team===team))?tgt:null};
      }
      return;
    }
    case 'build':{
      const vs=listOf(c.ids,'u',team).filter(u=>u.type==='villager');
      if(!vs.length||!BDEF[c.type])return;
      const d=BDEF[c.type];
      if(!canPlace(c.type,c.tx,c.ty,team)){if(team===ME)toast('无法在此处建造','warn');return;}
      if(d.age&&t.age<d.age){if(team===ME)toast('需要晋升封建时代','warn');return;}
      if(!canAfford(t,d.cost)){if(team===ME)toast('资源不足','warn');return;}
      placeBuilding(team,c.type,c.tx,c.ty,vs);
      return;
    }
    case 'train':{
      const U=UDEF[c.type];if(!U)return;
      const bs=listOf(c.bids,'b',team).filter(b=>b.done&&BDEF[b.type].train&&BDEF[b.type].train.includes(c.type));
      if(!bs.length)return;
      const n=Math.max(1,Math.min(5,c.n|0||1));
      let made=0,why='';
      for(let k=0;k<n;k++){
        let best=null;
        for(const b of bs)if(b.queue.length<5&&(!best||b.queue.length<best.queue.length))best=b;
        if(!best){why='队列已满';break;}
        if(U.age&&t.age<U.age){why='需要晋升封建时代';break;}
        if(!canAfford(t,U.cost)){why='资源不足';break;}
        if(enqueue(best,c.type))made++;else{why='资源不足';break;}
      }
      if(!made&&team===ME&&why)toast(why,'warn');
      else if(made){
        if(team===ME){
          let queued=0;for(const b of blds)if(b.team===team&&!b.dead)queued+=b.queue.length;
          if(t.pop+queued>=Math.min(t.cap,100)&&G.t-(G.popWarn||-99)>4){G.popWarn=G.t;toast(t.cap>=100?'已达人口上限 100':'人口将满，建议再造房屋','warn');}
        }
      }
      return;
    }
    case 'cancelq':{
      const b=byId.get(c.bid);
      if(b&&!b.dead&&b.kind==='b'&&b.team===team){const i=c.uid!==undefined?b.queue.findIndex(q=>q.uid===c.uid):(c.i|0);if(i>=0)cancelQueue(b,i);}
      return;
    }
    case 'age':{
      const tc=listOf(c.bids,'b',team).find(b=>b.type==='tc'&&b.done);
      if(tc&&!startAge(tc)&&team===ME)toast(t.research?'正在研究中':'资源不足','warn');
      return;
    }
    case 'stop':{
      for(const u of listOf(c.ids,'u',team)){u.ord={t:'idle'};u.path=null;}
      return;
    }
    case 'del':{
      for(const b of listOf(c.bids,'b',team))if(b.type!=='tc'){refund(t,{wood:Math.floor((BDEF[b.type].cost.wood||0)*0.5)});kill(b,null);}
      for(const u of listOf(c.ids,'u',team))kill(u,null);
      return;
    }
    case 'autofarm':{t.autoFarm=!!c.v;return;}
  }
}

/* ================= deterministic state hash ================= */
function stateHash(){
  let h=2166136261>>>0;
  const mix=v=>{h^=(v|0);h=Math.imul(h,16777619)>>>0;};
  for(const u of units){if(u.dead)continue;mix(u.id);mix(Math.round(u.x*64));mix(Math.round(u.y*64));mix(Math.round(u.hp*16));}
  for(const b of blds){if(b.dead)continue;mix(b.id);mix(Math.round(b.hp));mix(b.queue.length);}
  for(let i=0;i<2;i++){const t=T[i];mix(Math.floor(t.food));mix(Math.floor(t.wood));mix(Math.floor(t.gold));mix(t.pop);mix(t.age);}
  mix(G.tick);
  return (h>>>0).toString(16).padStart(8,'0');
}

/* ================= save / load =================
   localStorage may be missing or throw (private mode, sandboxed iframe, artifact host): every access is guarded and
   an in-memory slot keeps save/load working for the current session. */
const SAVE_KEYS={manual:'hearthfall_save_v1',auto:'hearthfall_auto_v1'};
const memStore={};
let storageMode='?';
function stoGet(k){
  try{const v=window.localStorage.getItem(k);if(v!==null){storageMode='local';return v;}}catch(e){storageMode='mem';}
  return memStore[k]||null;
}
function stoSet(k,v){
  memStore[k]=v;
  try{window.localStorage.setItem(k,v);storageMode='local';return true;}catch(e){storageMode='mem';return false;}
}
function b64enc(u8){let s='';for(let i=0;i<u8.length;i+=8192)s+=String.fromCharCode.apply(null,u8.subarray(i,i+8192));return btoa(s);}
function b64dec(str,n){const s=atob(str),u=new Uint8Array(n);for(let i=0;i<n&&i<s.length;i++)u[i]=s.charCodeAt(i);return u;}
function encv(v){
  if(v===null||typeof v!=='object')return v;
  if(Array.isArray(v))return v.map(encv);
  if(typeof v.kind==='string'&&typeof v.id==='number')return {$ref:v.id};
  const o={};for(const k in v)o[k]=encv(v[k]);return o;
}
function decv(v){
  if(v===null||typeof v!=='object')return v;
  if(Array.isArray(v)){for(let i=0;i<v.length;i++)v[i]=decv(v[i]);return v;}
  if(v.$ref!==undefined)return byId.get(v.$ref)||null;
  for(const k in v)v[k]=decv(v[k]);return v;
}
function serializeGame(){
  const ent=e=>{const o={};for(const k in e){if(k.charCodeAt(0)===95)continue;o[k]=encv(e[k]);}return o;};
  return JSON.stringify({
    v:1,simS,nextId,qUid,G:Object.assign({},G,{paused:false}),T:T.map(encv),
    units:units.filter(u=>!u.dead).map(ent),blds:blds.filter(b=>!b.dead).map(ent),ress:ress.filter(r=>!r.dead).map(ent),
    projs:projs.filter(p=>!p.dead).map(ent),ais:ais.map(encv),
    terr:b64enc(terr),vis:b64enc(vis),cam:{x:cam.x,y:cam.y,z:cam.z},
    groups:(typeof groups!=='undefined')?groups:{}
  });
}
function saveGame(kind){
  if(!G||G.over)return {ok:false,why:'对局已结束'};
  try{
    const key=SAVE_KEYS[kind||'manual'];
    const data=serializeGame();
    const persisted=stoSet(key,data);
    stoSet(key+'_meta',JSON.stringify({time:Date.now(),t:G.t,pop:T[0].pop}));
    return {ok:true,persisted,size:data.length};
  }catch(e){return {ok:false,why:'存档失败'};}
}
function saveInfo(kind){
  try{const m=stoGet(SAVE_KEYS[kind||'manual']+'_meta');return m?JSON.parse(m):null;}catch(e){return null;}
}
function loadGame(kind){
  let s;
  try{
    const raw=stoGet(SAVE_KEYS[kind||'manual']);
    if(!raw)return {ok:false,why:'没有存档'};
    s=JSON.parse(raw);
    if(!s||s.v!==1)return {ok:false,why:'存档版本不兼容'};
  }catch(e){return {ok:false,why:'存档已损坏'};}
  try{
    resetState();resetCmds();
    Object.assign(G,s.G);G.paused=false;
    simS=s.simS;nextId=s.nextId;qUid=s.qUid||0;
    terr=b64dec(s.terr,MW*MH);vis=b64dec(s.vis,MW*MH);
    for(const e of s.units){units.push(e);byId.set(e.id,e);}
    for(const e of s.blds){blds.push(e);byId.set(e.id,e);markOcc(e,e.id);}
    for(const e of s.ress){ress.push(e);byId.set(e.id,e);markOcc(e,e.id);}
    for(const e of units)for(const k in e)e[k]=decv(e[k]);
    for(const e of blds)for(const k in e)e[k]=decv(e[k]);
    for(const e of ress)for(const k in e)e[k]=decv(e[k]);
    projs=s.projs.map(p=>{for(const k in p)p[k]=decv(p[k]);return p;});
    for(let i=0;i<2;i++){T[i]=decv(s.T[i]);}
    ais=s.ais.map(a=>{for(const k in a)a[k]=decv(a[k]);return a;});
    if(typeof groups!=='undefined')groups=s.groups||{};
    fx.length=0;
    buildWorldCanvas();
    if(typeof afterLoad==='function')afterLoad(s);
    return {ok:true};
  }catch(e){
    console.warn('load failed',e);
    return {ok:false,why:'读档失败'};
  }
}
