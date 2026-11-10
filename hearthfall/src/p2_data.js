'use strict';
/* ================= constants & data ================= */
const TILE=32,MW=80,MH=80,WW=MW*TILE,WH=MH*TILE,STEP=1/30,CARRY=12;
const TEAMC=['#4f8cf0','#e8573a'],TEAMD=['#27468a','#86280f'],TEAMN=['蓝方','红方'];
const AGEN=['','黑暗时代','封建时代'];
const RN={food:'食物',wood:'木材',gold:'黄金'};
const RC={food:'#e0795b',wood:'#b58b55',gold:'#e5b447'};
const GATHER={wood:0.95,food:0.8,gold:0.8};
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
let rnd=mulberry32(1);
/* Simulation RNG: seeded, state serialisable. Use simRnd() for anything that affects game state; Math.random only for render/fx. */
let simS=1;
function simSeed(s){simS=(s|0)||1;}
function simRnd(){simS=(simS+0x6D2B79F5)|0;let t=Math.imul(simS^simS>>>15,1|simS);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}
/* sqrt-based distance: Math.hypot is not bit-identical across JS engines, sqrt is (needed for lockstep) */
const hyp=(a,b)=>Math.sqrt(a*a+b*b);

const UDEF={
  villager:{name:'村民',hp:30,speed:64,atk:3,range:12,cd:1.4,armor:0,cost:{food:50},time:10,sight:6,r:7,desc:'采集、建造、修理'},
  spear:{name:'长矛兵',hp:55,speed:60,atk:7,range:14,cd:1.1,armor:1,cost:{food:50,wood:30},time:14,sight:6,r:8,bonus:{knight:2.5},desc:'克制骑士'},
  archer:{name:'弓箭手',hp:34,speed:62,atk:6,range:128,cd:1.5,armor:0,cost:{wood:50,gold:30},time:15,sight:8,r:7,proj:true,bonus:{spear:1.4},desc:'远程，克制长矛兵'},
  knight:{name:'骑士',hp:110,speed:108,atk:10,range:16,cd:1.2,armor:2,cost:{food:70,gold:80},time:20,sight:7,r:9,age:2,bonus:{archer:1.6},desc:'高速近战，克制弓箭手'}
};
const BDEF={
  tc:{name:'城镇中心',w:3,h:3,hp:1800,cost:{},time:0,pop:10,sight:10,drop:true,train:['villager'],atk:7,range:170,cd:1.6},
  house:{name:'房屋',w:2,h:2,hp:350,cost:{wood:35},time:14,pop:5,sight:3},
  store:{name:'仓库',w:2,h:2,hp:450,cost:{wood:80},time:20,drop:true,sight:4},
  farm:{name:'农田',w:2,h:2,hp:200,cost:{wood:60},time:12,food:400,sight:3},
  barracks:{name:'兵营',w:3,h:3,hp:900,cost:{wood:160},time:34,train:['spear','archer','knight'],sight:5},
  tower:{name:'哨塔',w:2,h:2,hp:600,cost:{wood:100,gold:60},time:30,sight:9,atk:8,range:176,cd:1.5,age:2}
};
const RDEF={
  tree:{name:'树木',res:'wood',amt:120,w:1,h:1},
  berry:{name:'浆果丛',res:'food',amt:140,w:1,h:1},
  gold:{name:'金矿',res:'gold',amt:1000,w:2,h:2}
};
const AGE_COST={food:350,gold:120},AGE_TIME=30;
const BUILD_ORDER=['house','store','farm','barracks','tower'];
const KEYS='QWERASDF';

/* ================= game state ================= */
let T,units,blds,ress,projs,fx,byId,nextId,G,terr,occ,vis,sel,ais,cam={x:0,y:0,z:1},selDirty=true;
function mkTeam(){return {autoFarm:false,food:0,wood:0,gold:0,pop:0,cap:0,age:1,tc:null,research:null,st:{gathered:0,kills:0,lost:0,made:0}};}
function resetState(){
  T=[mkTeam(),mkTeam()];units=[];blds=[];ress=[];projs=[];fx=[];byId=new Map();nextId=1;sel=[];ais=[];selDirty=true;
  PB=PB_TICK;qUid=0;G={t:0,tick:0,over:false,paused:false,speed:1,diff:'normal',alertT:-99,winner:-1};
  terr=new Uint8Array(MW*MH);occ=new Int32Array(MW*MH);vis=new Uint8Array(MW*MH);
}
function canAfford(t,c){for(const k in c)if(t[k]<c[k])return false;return true;}
function pay(t,c){for(const k in c)t[k]-=c[k];}
function refund(t,c){for(const k in c)t[k]+=c[k];}
function costStr(c){const o=[];if(c.food)o.push(c.food+'食');if(c.wood)o.push(c.wood+'木');if(c.gold)o.push(c.gold+'金');return o.join(' ')||'免费';}
function fmtTime(s){s=Math.floor(s);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}

/* ================= entities ================= */
let occVer=0; /* bumped whenever tile occupancy changes: invalidates connectivity labels / unreachable cache */
function markOcc(e,v){for(let j=0;j<e.h;j++)for(let i=0;i<e.w;i++)occ[(e.ty+j)*MW+e.tx+i]=v;occVer++;}
function addRes(type,tx,ty){
  const d=RDEF[type];
  const e={id:nextId++,kind:'r',type,team:-1,tx,ty,w:d.w,h:d.h,x:(tx+d.w/2)*TILE,y:(ty+d.h/2)*TILE,amt:d.amt,max:d.amt,hp:1,maxhp:1,seed:rnd(),dead:false};
  ress.push(e);byId.set(e.id,e);markOcc(e,e.id);return e;
}
function addBld(type,team,tx,ty,done){
  const d=BDEF[type];
  const e={id:nextId++,kind:'b',type,team,tx,ty,w:d.w,h:d.h,x:(tx+d.w/2)*TILE,y:(ty+d.h/2)*TILE,maxhp:d.hp,hp:done?d.hp:Math.max(12,d.hp*0.1),
    done:!!done,prog:done?1:0,queue:[],qt:0,cd:0,rally:null,amt:d.food||0,nb:0,nbCur:0,flash:0,dead:false};
  blds.push(e);byId.set(e.id,e);markOcc(e,e.id);
  if(done)onBuilt(e);
  return e;
}
function onBuilt(e){
  const d=BDEF[e.type],t=T[e.team];
  if(d.pop)t.cap+=d.pop;
  if(e.type==='tc')t.tc=e;
}
function addUnit(type,team,x,y){
  const d=UDEF[type];
  const e={id:nextId++,kind:'u',type,team,x,y,r:d.r,hp:d.hp,maxhp:d.hp,ord:{t:'idle'},path:null,pi:0,cd:0,carry:0,ctype:null,face:1,anim:(nextId*0.37)%6,
    gt:0,repath:0,stuck:0,scan:simRnd()*0.4,flash:0,moving:false,working:false,swing:0,dead:false};
  units.push(e);byId.set(e.id,e);T[team].pop++;T[team].st.made++;return e;
}

/* ================= map generation ================= */
const BASE=[{x:16,y:63},{x:63,y:16}];
const mir=(tx,ty,w,h)=>[MW-tx-w,MH-ty-h];
function nearBase(tx,ty,r){for(const b of BASE)if(hyp(tx-b.x,ty-b.y)<r)return true;return false;}
function areaFree(tx,ty,w,h,ignoreBase){
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){
    const x=tx+i,y=ty+j;
    if(x<1||y<1||x>=MW-1||y>=MH-1)return false;
    const k=y*MW+x;
    if(terr[k]||occ[k])return false;
    if(!ignoreBase&&nearBase(x,y,6.5))return false;
  }
  return true;
}
function placeRes(type,tx,ty,ignoreBase){const d=RDEF[type];if(areaFree(tx,ty,d.w,d.h,ignoreBase)){addRes(type,tx,ty);return true;}return false;}
function placeMirrored(type,tx,ty,ignoreBase){
  const d=RDEF[type];
  placeRes(type,tx,ty,ignoreBase);
  const m=mir(tx,ty,d.w,d.h);
  if(m[0]!==tx||m[1]!==ty)placeRes(type,m[0],m[1],ignoreBase);
}
function forest(cx,cy,r,dens){
  for(let y=cy-r;y<=cy+r;y++)for(let x=cx-r;x<=cx+r;x++){
    const d=hyp(x-cx,y-cy)/r;
    if(d<=1&&rnd()<dens*(1.15-d))placeMirrored('tree',x,y,false);
  }
}
function lake(cx,cy,rx,ry){
  const ph=rnd()*6;
  for(let y=cy-ry-2;y<=cy+ry+2;y++)for(let x=cx-rx-2;x<=cx+rx+2;x++){
    if(x<2||y<2||x>=MW-2||y>=MH-2)continue;
    const dx=(x-cx)/rx,dy=(y-cy)/ry;
    const a=Math.atan2(dy,dx);
    const wob=1+0.22*Math.sin(a*3+ph)+0.12*Math.sin(a*5+ph*2);
    if(hyp(dx,dy)<wob*0.95){
      if(nearBase(x,y,13))continue;
      terr[y*MW+x]=1;
      const m=mir(x,y,1,1);terr[m[1]*MW+m[0]]=1;
    }
  }
}
function genMap(seed){
  rnd=mulberry32(seed);
  lake(40,40,5,4);
  lake(24+Math.floor(rnd()*6),20+Math.floor(rnd()*6),4,3);
  const b=BASE[0];
  // berries: loose ring east of the base
  const bx=b.x+7,by=b.y-2;
  const bpos=[[0,0],[1,1],[2,0],[0,2],[2,2],[1,-1]];
  for(const p of bpos)placeMirrored('berry',bx+p[0],by+p[1],true);
  // gold: two mines north-west
  placeMirrored('gold',b.x-10,b.y-7,true);
  placeMirrored('gold',b.x+2,b.y-12,true);
  // starting forests
  forest(b.x-9,b.y+3,4,0.9);
  forest(b.x+9,b.y+7,5,0.85);
  forest(b.x+4,b.y-9,3,0.85);
  // mid-map
  for(let i=0;i<9;i++){
    const cx=12+Math.floor(rnd()*56),cy=12+Math.floor(rnd()*56);
    if(hyp(cx-b.x,cy-b.y)<14)continue;
    forest(cx,cy,2+Math.floor(rnd()*3),0.8);
  }
  placeMirrored('gold',30,30,false);
  placeMirrored('gold',46,25,false);
  placeMirrored('berry',34,46,false);placeMirrored('berry',35,46,false);placeMirrored('berry',34,47,false);
}
function startBases(){
  for(let t=0;t<2;t++){
    const c=BASE[t],tc=addBld('tc',t,c.x-1,c.y-1,true);
    T[t].tc=tc;T[t].food=250;T[t].wood=250;T[t].gold=100;
    const dir=t===0?1:-1;
    for(let i=0;i<4;i++){
      const u=addUnit('villager',t,tc.x+(i-1.5)*22,tc.y+dir*(2*TILE+10));
      u.face=dir;
    }
  }
}

/* ===== event bus: logic emits, art/audio (p7_fx.js) consumes =====
 types: 'hit'{src,tgt,ranged}, 'shoot'{src,tgt}, 'proj_hit'{x,y,tgt}, 'death'{e}, 'bld_destroyed'{b},
        'bld_done'{b}, 'train_done'{u}, 'gather'{u,res}, 'drop'{u}, 'age_up'{team}, 'alert'{x,y}, 'ui'{kind}, 'place'{b} */
function emit(t,d){ if(typeof onGameEvent==='function'){ try{ onGameEvent(t,d); }catch(err){ if(!emit.warned){emit.warned=1;console.warn('onGameEvent error',err);} } } }
