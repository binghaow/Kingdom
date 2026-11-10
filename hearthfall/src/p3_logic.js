/* ================= pathfinding ================= */
const PN=MW*MH,gS=new Float32Array(PN),gP=new Int32Array(PN),gSt=new Int32Array(PN),gCl=new Int32Array(PN);
let stampC=0;
const hN=[],hF=[];
function hpush(n,f){let i=hN.length;hN.push(n);hF.push(f);while(i>0){const p=(i-1)>>1;if(hF[p]<=f)break;hN[i]=hN[p];hF[i]=hF[p];i=p;}hN[i]=n;hF[i]=f;}
function hpop(){
  const top=hN[0],n=hN.pop(),f=hF.pop(),L=hN.length;
  if(L>0){let i=0;for(;;){let c=2*i+1;if(c>=L)break;if(c+1<L&&hF[c+1]<hF[c])c++;if(hF[c]>=f)break;hN[i]=hN[c];hF[i]=hF[c];i=c;}hN[i]=n;hF[i]=f;}
  return top;
}
const DIRS=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
function walkable(tx,ty){return tx>=0&&ty>=0&&tx<MW&&ty<MH&&!terr[ty*MW+tx]&&!occ[ty*MW+tx];}
function walkPx(x,y){return walkable(Math.floor(x/TILE),Math.floor(y/TILE));}
function nearestWalkable(tx,ty,maxR){
  maxR=maxR||14;
  if(walkable(tx,ty))return [tx,ty];
  for(let r=1;r<=maxR;r++){
    let best=null,bd=1e9;
    for(let y=ty-r;y<=ty+r;y++)for(let x=tx-r;x<=tx+r;x++){
      if(Math.max(Math.abs(x-tx),Math.abs(y-ty))!==r||!walkable(x,y))continue;
      const d=(x-tx)*(x-tx)+(y-ty)*(y-ty);
      if(d<bd){bd=d;best=[x,y];}
    }
    if(best)return best;
  }
  return null;
}
/* Path budget: findPath is capped (FIND_CAP expansions, far below the 6400 tiles of the map) and each tick only PB_TICK
   expansions are spent in total; requests beyond that get a straight-line fallback path and retry a few ticks later.
   All counters are integers -> deterministic. */
const FIND_CAP=1800,PB_TICK=5000;let PB=PB_TICK,lastExp=0,lastCap=false;
function findPath(sx,sy,goalFn,hx,hy,cap){
  cap=cap||FIND_CAP;lastCap=false;
  const st=++stampC;
  hN.length=0;hF.length=0;
  const hh=(x,y)=>{const dx=Math.abs(x-hx),dy=Math.abs(y-hy);return dx+dy-0.586*Math.min(dx,dy);};
  const si=sy*MW+sx;gS[si]=0;gP[si]=-1;gSt[si]=st;hpush(si,hh(sx,sy));
  let best=si,bestH=hh(sx,sy),exp=0,found=-1;
  while(hN.length){
    const cur=hpop();
    if(gCl[cur]===st)continue;
    gCl[cur]=st;
    const cx=cur%MW,cy=(cur/MW)|0;
    if(goalFn(cx,cy)){found=cur;break;}
    if(++exp>cap){lastCap=true;break;}
    const h0=hh(cx,cy);if(h0<bestH){bestH=h0;best=cur;}
    for(let k=0;k<8;k++){
      const d=DIRS[k],nx=cx+d[0],ny=cy+d[1];
      if(!walkable(nx,ny))continue;
      if(k>=4&&(!walkable(cx+d[0],cy)||!walkable(cx,cy+d[1])))continue;
      const ni=ny*MW+nx;
      if(gCl[ni]===st)continue;
      const ng=gS[cur]+(k>=4?1.414:1);
      if(gSt[ni]!==st||ng<gS[ni]){gSt[ni]=st;gS[ni]=ng;gP[ni]=cur;hpush(ni,ng+hh(nx,ny));}
    }
  }
  lastExp=exp;
  const end=found>=0?found:best,nodes=[];
  for(let c=end;c!==-1;c=gP[c])nodes.push(c);
  nodes.reverse();
  return {nodes,ok:found>=0};
}
function los(x0,y0,x1,y1){
  const dx=x1-x0,dy=y1-y0,d=hyp(dx,dy),n=Math.ceil(d/8),nx=-dy/(d||1)*5,ny=dx/(d||1)*5;
  for(let k=1;k<=n;k++){
    const t=k/n,px=x0+dx*t,py=y0+dy*t;
    if(!walkPx(px,py)||!walkPx(px+nx,py+ny)||!walkPx(px-nx,py-ny))return false;
  }
  return true;
}
function smoothPath(pts){
  if(pts.length<3)return pts;
  const out=[pts[0]];let i=0;
  while(i<pts.length-1){
    let j=pts.length-1;
    while(j>i+1&&!los(pts[i].x,pts[i].y,pts[j].x,pts[j].y))j--;
    out.push(pts[j]);i=j;
  }
  return out;
}
/* connectivity labels (4-neighbour components of walkable tiles == what A* with the corner rule can reach) */
const lbl=new Int32Array(PN),lblQ=new Int32Array(PN);let lblV=-1;
function regions(){
  if(lblV===occVer)return;
  lblV=occVer;lbl.fill(0);unreach.clear();
  let n=0;
  for(let i=0;i<PN;i++){
    if(lbl[i]||!walkable(i%MW,(i/MW)|0))continue;
    n++;let qh=0,qt=0;lblQ[qt++]=i;lbl[i]=n;
    while(qh<qt){
      const c=lblQ[qh++],cx=c%MW,cy=(c/MW)|0;
      for(let k=0;k<4;k++){
        const d=DIRS[k],nx=cx+d[0],ny=cy+d[1];
        if(!walkable(nx,ny))continue;
        const ni=ny*MW+nx;if(lbl[ni])continue;
        lbl[ni]=n;lblQ[qt++]=ni;
      }
    }
  }
}
const unreach=new Map(); /* key (target id, start region) -> tick until which the target is treated as unreachable */
function tileLbl(x,y){return lbl[clamp(Math.floor(y/TILE),0,MH-1)*MW+clamp(Math.floor(x/TILE),0,MW-1)];}
function canReach(u,e,reach){
  regions();
  const sl=tileLbl(u.x,u.y);
  if(!sl)return true; /* unit stands on a blocked tile: let A* decide */
  if(e.kind==='u'){const l=tileLbl(e.x,e.y);return !l||l===sl;}
  const r=Math.ceil(reach/TILE)+1;
  for(let y=e.ty-r;y<e.ty+e.h+r;y++)for(let x=e.tx-r;x<e.tx+e.w+r;x++){
    if(x<0||y<0||x>=MW||y>=MH||lbl[y*MW+x]!==sl)continue;
    if(rectDist(x*TILE+16,y*TILE+16,e)<=reach)return true;
  }
  return false;
}
function deferPath(u,tx,ty){
  u.path=[{x:tx,y:ty}];u.pi=0;u.stuck=0;u.pathOk=false;
  u.defer=G.tick+4+((simRnd()*16)|0);
}
function buildPath(u,goalFn,hx,hy,fin,cap){
  u.unreach=false;
  if(PB<=0){deferPath(u,fin?fin.x:(hx+0.5)*TILE,fin?fin.y:(hy+0.5)*TILE);return false;}
  const sx=clamp(Math.floor(u.x/TILE),0,MW-1),sy=clamp(Math.floor(u.y/TILE),0,MH-1);
  const r=findPath(sx,sy,goalFn,hx,hy,cap);
  PB-=lastExp+60;u.defer=0;u.restuck=0;
  let pts=r.nodes.map(n=>({x:(n%MW+0.5)*TILE,y:(Math.floor(n/MW)+0.5)*TILE}));
  pts.shift();
  if(fin&&r.ok&&walkPx(fin.x,fin.y)){
    if(pts.length)pts[pts.length-1]={x:fin.x,y:fin.y};else pts.push({x:fin.x,y:fin.y});
  }
  pts.unshift({x:u.x,y:u.y});
  pts=smoothPath(pts);pts.shift();
  u.path=pts.length?pts:null;u.pi=0;u.stuck=0;u.pathOk=r.ok;
  return r.ok;
}
function rectDist(px,py,e){
  if(e.kind==='u')return hyp(px-e.x,py-e.y);
  const x0=e.tx*TILE,y0=e.ty*TILE,x1=x0+e.w*TILE,y1=y0+e.h*TILE;
  const dx=Math.max(x0-px,0,px-x1),dy=Math.max(y0-py,0,py-y1);
  return hyp(dx,dy);
}
function goPoint(u,x,y){
  let gx=clamp(Math.floor(x/TILE),0,MW-1),gy=clamp(Math.floor(y/TILE),0,MH-1),fin={x,y};
  if(!walkable(gx,gy)){
    const w=nearestWalkable(gx,gy);
    if(!w){u.path=null;return false;}
    gx=w[0];gy=w[1];fin=null;
  }
  regions();
  const sl=tileLbl(u.x,u.y),cap=(sl&&lbl[gy*MW+gx]!==sl)?500:0; /* other region: best-effort partial path only */
  return buildPath(u,(a,b)=>a===gx&&b===gy,gx,gy,fin,cap);
}
function goTarget(u,e,reach){
  u.unreach=false;
  if(!canReach(u,e,reach)){u.path=null;u.pathOk=false;u.unreach=true;return false;}
  const key=e.id*4096+tileLbl(u.x,u.y),ex=unreach.get(key);
  if(ex!==undefined&&ex>G.tick){u.path=null;u.pathOk=false;u.unreach=true;return false;}
  const tx=clamp(Math.floor(e.x/TILE),0,MW-1),ty=clamp(Math.floor(e.y/TILE),0,MH-1);
  const ok=buildPath(u,(a,b)=>rectDist(a*TILE+16,b*TILE+16,e)<=reach,tx,ty,null);
  if(!ok&&!u.defer&&lastCap){unreach.set(key,G.tick+120);} /* searched to the cap without success: back off */
  if(!u.path&&e.kind!=='u'&&rectDist(u.x,u.y,e)>reach+2){
    /* tile centre was within reach but the unit got pushed away: step back toward the rect */
    const x0=e.tx*TILE,y0=e.ty*TILE,cx=clamp(u.x,x0,x0+e.w*TILE),cy=clamp(u.y,y0,y0+e.h*TILE);
    const dx=u.x-cx,dy=u.y-cy,dd=hyp(dx,dy)||1,k=Math.max(8,reach-8);
    const px=cx+dx/dd*k,py=cy+dy/dd*k;
    if(walkPx(px,py)){u.path=[{x:px,y:py}];u.pi=0;}
  }
  return ok;
}

/* ================= spatial hash ================= */
const HC=64,HW=Math.ceil(WW/HC),HH=Math.ceil(WH/HC),hash=Array.from({length:HW*HH},()=>[]);
const hashUsed=[]; /* only non-empty buckets are cleared each tick */
function rebuildHash(){
  for(let i=0;i<hashUsed.length;i++)hash[hashUsed[i]].length=0;
  hashUsed.length=0;
  for(const u of units){
    if(u.dead)continue;
    const idx=clamp(Math.floor(u.x/HC),0,HW-1)+clamp(Math.floor(u.y/HC),0,HH-1)*HW,c=hash[idx];
    if(c.length===0)hashUsed.push(idx);
    c.push(u);
  }
}
function nearU(x,y,r,fn){
  const x0=clamp(Math.floor((x-r)/HC),0,HW-1),x1=clamp(Math.floor((x+r)/HC),0,HW-1),y0=clamp(Math.floor((y-r)/HC),0,HH-1),y1=clamp(Math.floor((y+r)/HC),0,HH-1),r2=r*r;
  for(let cy=y0;cy<=y1;cy++)for(let cx=x0;cx<=x1;cx++){
    const c=hash[cx+cy*HW];
    for(let i=0;i<c.length;i++){const u=c[i];if(u.dead)continue;const dx=u.x-x,dy=u.y-y;if(dx*dx+dy*dy<=r2)fn(u);}
  }
}

/* ================= movement ================= */
function tryMove(u,nx,ny){
  if(walkPx(nx,ny)){u.x=nx;u.y=ny;return true;}
  if(walkPx(nx,u.y)){u.x=nx;return true;}
  if(walkPx(u.x,ny)){u.y=ny;return true;}
  return false;
}
function stepPath(u,dt){
  if(!u.path)return false;
  const wp=u.path[u.pi];
  if(!wp){u.path=null;return false;}
  const sp=UDEF[u.type].speed,dx=wp.x-u.x,dy=wp.y-u.y,dd=hyp(dx,dy);
  if(dd<=sp*dt+0.5){
    u.x=wp.x;u.y=wp.y;u.pi++;
    if(u.pi>=u.path.length){u.path=null;return false;}
  }else{
    const ok=tryMove(u,u.x+dx/dd*sp*dt,u.y+dy/dd*sp*dt);
    if(!ok){
      if(++u.stuck>12){
        u.stuck=0;u.restuck=(u.restuck||0)+1;
        const last=u.path[u.path.length-1];
        if(u.restuck>4){u.path=null;u.restuck=0;return false;}
        const rs=u.restuck;goPoint(u,last.x,last.y);u.restuck=rs;
      }
    }else u.stuck=0;
  }
  if(Math.abs(dx)>0.5)u.face=dx>0?1:-1;
  u.moving=true;
  return !!u.path;
}
function relocateUnit(u){
  const w=nearestWalkable(clamp(Math.floor(u.x/TILE),0,MW-1),clamp(Math.floor(u.y/TILE),0,MH-1),20);
  if(w){
    u.x=(w[0]+0.5)*TILE;u.y=(w[1]+0.5)*TILE;u.path=null;
    const o=u.ord; /* keep the order alive: re-path instead of silently going idle */
    if(o.t==='move'||o.t==='amove')goPoint(u,o.x,o.y);
  }
}

/* ================= combat ================= */
function toast(msg,kind){if(typeof uiToast==='function')uiToast(msg,kind);}
function ping(x,y){fx.push({t:'ping',x,y,life:2.5,max:2.5});}
function fire(u,e){
  const d=UDEF[u.type];
  let dmg=d.atk*((d.bonus&&d.bonus[e.type])||1);
  if(e.kind==='b')dmg*=d.proj?0.35:(u.type==='villager'?0.3:0.6);
  u.swing=0.25;
  if(d.proj){projs.push({x:u.x,y:u.y-6,sx:u.x,sy:u.y,tx:e.x,ty:e.y,tgt:e,dmg,sp:340,src:u,team:u.team,life:3,dead:false});emit('shoot',{src:u,tgt:e});}
  else{emit('hit',{src:u,tgt:e,ranged:false});damage(e,dmg,u);}
}
function damage(t,amt,src){
  if(t.dead)return;
  if(t.kind==='u')amt=Math.max(1,amt-UDEF[t.type].armor);
  t.hp-=amt;t.flash=0.14;
  if(t.team===0&&G.t-G.alertT>8){G.alertT=G.t;toast('我方正在遭到攻击！','alert');ping(t.x,t.y);emit('alert',{x:t.x,y:t.y});}
  if(t.hp<=0){kill(t,src);return;}
  if(t.kind==='u'&&src&&!src.dead&&src.team!==t.team&&t.type!=='villager'&&t.ord.t==='idle'){t.ord={t:'attack',tgt:src};t.path=null;t.repath=0;}
}
function kill(e,src){
  if(e.dead)return;
  e.dead=true;e.hp=0;
  if(e.kind==='u'){
    T[e.team].pop--;T[e.team].st.lost++;
    if(src&&src.team>=0&&src.team!==e.team)T[src.team].st.kills++;
    fx.push({t:'corpse',x:e.x,y:e.y,life:8,max:8,team:e.team,r:e.r});
    emit('death',{e});
  }else if(e.kind==='b'){
    markOcc(e,0);
    if(e.done&&BDEF[e.type].pop)T[e.team].cap-=BDEF[e.type].pop;
    if(!(e.type==='farm'&&src===null))T[e.team].st.lost++;
    fx.push({t:'rubble',x:e.x,y:e.y,w:e.w*TILE,h:e.h*TILE,life:12,max:12});
    emit('bld_destroyed',{b:e});
    if(e.type==='tc'){T[e.team].tc=null;gameOver(e.team===0?1:0);}
  }else markOcc(e,0);
  const i=sel.indexOf(e);if(i>=0){sel.splice(i,1);selDirty=true;}
  if(typeof selSet!=='undefined')selSet.delete(e);
}
function gameOver(winner){
  if(G.over)return;
  G.over=true;G.winner=winner;
  if(typeof uiEnd==='function')uiEnd(winner===0);
}
function findEnemy(u,rad){
  const d=UDEF[u.type];
  let best=null,bs=1e12;
  const blk=u.blkT>G.tick?u.blkId:-1;
  nearU(u.x,u.y,rad,n=>{
    if(n.team===u.team||n.id===blk)return;
    if(u.team===0&&!visPx(n.x,n.y,2))return;
    const s=hyp(n.x-u.x,n.y-u.y)-(n.type!=='villager'?40:0);
    if(s<bs){bs=s;best=n;}
  });
  if(best)return best;
  const r2=rad*0.8;
  for(const b of blds){
    if(b.dead||b.team===u.team||b.id===blk)continue;
    if(u.team===0&&!visPx(b.x,b.y,1))continue;
    const dd=rectDist(u.x,u.y,b);
    if(dd<r2&&dd<bs){bs=dd;best=b;}
  }
  return best;
}
function visPx(x,y,lvl){const tx=clamp(Math.floor(x/TILE),0,MW-1),ty=clamp(Math.floor(y/TILE),0,MH-1);return vis[ty*MW+tx]>=lvl;}
function endAttack(u){
  const o=u.ord;u.path=null;
  if(o.amove){u.ord={t:'amove',x:o.amove.x,y:o.amove.y};goPoint(u,o.amove.x,o.amove.y);}
  else u.ord={t:'idle'};
}
function updAttack(u,dt){
  const o=u.ord,e=o.tgt,d=UDEF[u.type];
  if(!e||e.dead||e.team===u.team){endAttack(u);return;}
  const reach=d.range+u.r+(e.kind==='u'?e.r:3);
  const dd=rectDist(u.x,u.y,e);
  if(dd<=reach){
    u.path=null;u.face=e.x>=u.x?1:-1;
    if(u.cd<=0){u.cd=d.cd;fire(u,e);}
  }else{
    u.repath-=dt;
    let need=!u.path;
    if(!need&&u.repath<=0){
      /* path exists: only refresh when a mobile target has actually moved away from where the path was computed */
      if(e.kind==='u'&&hyp(e.x-(o.px||0),e.y-(o.py||0))>TILE*1.5)need=true;else u.repath=0.7+simRnd()*0.5;
    }
    if(need){
      u.repath=0.7+simRnd()*0.3;o.px=e.x;o.py=e.y;
      goTarget(u,e,Math.max(24,d.range*0.85));
      if(u.unreach){o.fails=(o.fails||0)+1;if(o.fails>=2){giveUp(u,e);return;}}
      else if(!u.path){o.fails=(o.fails||0)+1;if(o.fails>4){endAttack(u);return;}}
      else o.fails=0;
    }
    stepPath(u,dt);
  }
}
/* target cannot be reached (walled in / other island): remember it, switch to the nearest reachable enemy building
   (siege/attack-move orders) or stand by */
function giveUp(u,e){
  const o=u.ord;
  u.blkId=e.id;u.blkT=G.tick+450;u.path=null;
  let alt=null;
  if(e.kind==='b'||o.amove){
    let bd=1e12;
    for(const b of blds){
      if(b.dead||b.team===u.team||b===e)continue;
      const dd=rectDist(u.x,u.y,b);
      if(dd<bd&&canReach(u,b,24)){bd=dd;alt=b;}
    }
  }
  if(alt){u.ord={t:'attack',tgt:alt,amove:o.amove,fails:0};u.repath=0;}
  else endAttack(u);
}
function scanEngage(u,dt,rad){
  u.scan-=dt;if(u.scan>0)return false;
  u.scan=0.35+simRnd()*0.1;
  const e=findEnemy(u,rad);
  if(!e)return false;
  const am=u.ord.t==='amove'?{x:u.ord.x,y:u.ord.y}:null;
  u.ord={t:'attack',tgt:e,amove:am};u.path=null;u.repath=0;
  return true;
}

/* ================= economy: gather & build ================= */
function resOK(e,u){return e&&!e.dead&&e.amt>0&&(e.kind==='r'||(e.type==='farm'&&e.done&&e.team===u.team));}
/* b.nfm is recounted once per tick in step() and bumped on new gather orders */
function farmers(b,except){return (b.nfm||0)-((except&&except.ord.t==='gather'&&except.ord.tgt===b)?1:0);}
function findRes(u,rt,avoid,maxTiles){
  let best=null,bd=Math.pow((maxTiles||40)*TILE,2);
  for(const r of ress){
    if(r.dead||r.amt<=0||r===avoid||RDEF[r.type].res!==rt)continue;
    const d=(r.x-u.x)*(r.x-u.x)+(r.y-u.y)*(r.y-u.y);
    if(d<bd){bd=d;best=r;}
  }
  if(rt==='food'){
    for(const b of blds){
      if(b.type!=='farm'||b.dead||!b.done||b.team!==u.team||b.amt<=0||b===avoid)continue;
      if(farmers(b,u)>=1)continue;
      const d=(b.x-u.x)*(b.x-u.x)+(b.y-u.y)*(b.y-u.y);
      if(d<bd){bd=d;best=b;}
    }
  }
  return best;
}
let lastGatherEmit=-9;
function reseedFarm(u,old){
  const t=T[u.team];
  if(!canAfford(t,BDEF.farm.cost)||!canPlace('farm',old.tx,old.ty,u.team))return false;
  const b=placeBuilding(u.team,'farm',old.tx,old.ty,[u]);
  if(b&&u.team===0)toast('自动补种农田','good');
  return !!b;
}
function resType(e){return e.kind==='b'?'food':RDEF[e.type].res;}
function orderGather(u,e){
  const rt=resType(e);
  if(u.ctype&&u.ctype!==rt){u.carry=0;u.ctype=null;}
  u.ord={t:'gather',tgt:e,rt,st:'go'};u.path=null;u.gt=0;u.restuck=0;
  if(e.type==='farm')e.nfm=(e.nfm||0)+1;
}
function nearestDrop(u){
  let best=null,bd=1e12;
  for(const b of blds){
    if(b.dead||b.team!==u.team||!b.done||!BDEF[b.type].drop)continue;
    const d=rectDist(u.x,u.y,b);
    if(d<bd){bd=d;best=b;}
  }
  return best;
}
function gmul(u){for(let i=0;i<ais.length;i++)if(ais[i].team===u.team)return ais[i].P.gather;return 1;}
function updGather(u,dt){
  const o=u.ord;
  if(o.st==='go'){
    let e=o.tgt;
    if(!resOK(e,u)){
      e=o.tgt=findRes(u,o.rt,null,30);
      if(!e){if(u.carry>0){o.st='drop';u.path=null;}else{u.ord={t:'idle'};u.path=null;}return;}
      u.path=null;
    }
    if(rectDist(u.x,u.y,e)<=26){o.st='work';u.path=null;u.gt=0;return;}
    if(!u.path){
      goTarget(u,e,24);
      if(!u.path){
        o.tries=(o.tries||0)+1;
        if(o.tries>3){o.tries=0;const n=findRes(u,o.rt,e,30);if(n)o.tgt=n;else{u.ord={t:'idle'};}}
        return;
      }
    }
    stepPath(u,dt);
  }else if(o.st==='work'){
    const e=o.tgt;
    if(!resOK(e,u)){o.st='go';return;}
    u.face=e.x>=u.x?1:-1;u.working=true;
    u.gt+=dt*GATHER[o.rt]*gmul(u)*(e.kind==='b'?0.8:1);
    if(u.gt>=1){
      const take=Math.min(Math.floor(u.gt),e.amt,CARRY-u.carry);
      u.gt-=Math.floor(u.gt);
      e.amt-=take;u.carry+=take;u.ctype=o.rt;
      if(G.t-lastGatherEmit>=0.12&&(u.team===0||visPx(u.x,u.y,2))){lastGatherEmit=G.t;emit('gather',{u,res:e});}
      if(e.amt<=0){
        kill(e,null);
        if(e.kind==='b'&&e.type==='farm'&&T[u.team].autoFarm)reseedFarm(u,e);
      }
      if(u.carry>=CARRY){o.st='drop';u.path=null;}
    }
  }else{
    if(u.carry<=0){o.st='go';u.path=null;return;}
    let d=o.drop;
    if(!d||d.dead||!d.done){d=o.drop=nearestDrop(u);u.path=null;}
    if(!d){u.ord={t:'idle'};u.path=null;return;}
    if(rectDist(u.x,u.y,d)<=26){
      T[u.team][u.ctype]+=u.carry;T[u.team].st.gathered+=u.carry;u.carry=0;u.ctype=null;
      if(u.team===0||visPx(u.x,u.y,2))emit('drop',{u});
      o.st='go';o.drop=null;u.path=null;return;
    }
    if(!u.path){
      goTarget(u,d,24);
      if(!u.path){o.tries=(o.tries||0)+1;if(o.tries>3){u.ord={t:'idle'};}return;}
    }
    stepPath(u,dt);
  }
}
function nearestAnyRes(u,maxTiles){
  let best=null,bd=Math.pow(maxTiles*TILE,2);
  for(const r of ress){if(r.dead||r.amt<=0)continue;const d=(r.x-u.x)*(r.x-u.x)+(r.y-u.y)*(r.y-u.y);if(d<bd){bd=d;best=r;}}
  return best;
}
function finishBuild(u,b){
  u.path=null;
  if(b.type==='farm'&&b.team===u.team&&b.amt>0){orderGather(u,b);return;}
  if(b.type==='store'||b.type==='tc'){
    const r=nearestAnyRes(u,9);
    if(r){orderGather(u,r);return;}
  }
  u.ord={t:'idle'};
}
function updBuild(u,dt){
  const o=u.ord,b=o.tgt;
  if(!b||b.dead){u.ord={t:'idle'};u.path=null;return;}
  if(b.done&&b.hp>=b.maxhp){finishBuild(u,b);return;}
  if(rectDist(u.x,u.y,b)<=26){
    u.path=null;u.working=true;u.face=b.x>=u.x?1:-1;
    const d=BDEF[b.type];
    if(!b.done){
      b.nbCur++;
      const n=Math.max(1,b.nb),inc=dt/d.time/(1+0.35*(n-1));
      b.prog+=inc;b.hp=Math.min(b.maxhp,b.hp+b.maxhp*inc*0.95);
      if(b.prog>=1){
        b.prog=1;b.done=true;onBuilt(b);emit('bld_done',{b});
        if(b.team===0)toast(BDEF[b.type].name+'建造完成','good');
        finishBuild(u,b);
      }
    }else b.hp=Math.min(b.maxhp,b.hp+b.maxhp/Math.max(20,d.time*1.5)*dt);
  }else{
    if(!u.path){
      goTarget(u,b,24);
      if(!u.path){o.tries=(o.tries||0)+1;if(o.tries>4){u.ord={t:'idle'};}return;}
    }
    stepPath(u,dt);
  }
}
function updUnit(u,dt){
  u.cd-=dt;if(u.flash>0)u.flash-=dt;if(u.swing>0)u.swing-=dt;
  u.moving=false;u.working=false;
  const o=u.ord;
  if(u.defer&&G.tick>=u.defer){ /* straight-line placeholder path: now compute the real one */
    u.defer=0;
    if(o.t==='move'||o.t==='amove')goPoint(u,o.x,o.y);
    else if(o.t==='attack')u.repath=0,u.path=null;
    else u.path=null;
  }
  switch(o.t){
    case 'idle':
      if(u.type!=='villager')scanEngage(u,dt,UDEF[u.type].sight*TILE*0.85);
      break;
    case 'move': if(!stepPath(u,dt))u.ord={t:'idle'};break;
    case 'amove':
      if(u.type!=='villager'&&scanEngage(u,dt,UDEF[u.type].sight*TILE))break;
      if(!stepPath(u,dt))u.ord={t:'idle'};
      break;
    case 'attack':updAttack(u,dt);break;
    case 'gather':updGather(u,dt);break;
    case 'build':updBuild(u,dt);break;
  }
  if(u.moving||u.working)u.anim+=dt;
}
function separate(u){
  if(u.dead)return;
  nearU(u.x,u.y,20,n=>{
    if(n===u)return;
    const dx=u.x-n.x,dy=u.y-n.y,d=hyp(dx,dy),m=u.r+n.r-3;
    if(d<m){
      let nx,ny;
      if(d<0.01){nx=simRnd()-0.5;ny=simRnd()-0.5;}else{nx=dx/d;ny=dy/d;}
      const p=(m-d)*0.35;
      tryMove(u,u.x+nx*p,u.y+ny*p);
    }
  });
  if(!walkPx(u.x,u.y))relocateUnit(u);
}

/* ================= buildings: production, research, defense ================= */
function spawnPos(b){
  const rx=b.rally?b.rally.x:(MW*TILE/2),ry=b.rally?b.rally.y:(MH*TILE/2);
  let best=null,bd=1e12;
  for(let y=b.ty-1;y<=b.ty+b.h;y++)for(let x=b.tx-1;x<=b.tx+b.w;x++){
    if(x>=b.tx&&x<b.tx+b.w&&y>=b.ty&&y<b.ty+b.h)continue;
    if(!walkable(x,y))continue;
    const px=(x+0.5)*TILE,py=(y+0.5)*TILE,d=(px-rx)*(px-rx)+(py-ry)*(py-ry);
    if(d<bd){bd=d;best=[px,py];}
  }
  if(!best){const w=nearestWalkable(b.tx+b.w,b.ty+b.h,8);if(w)best=[(w[0]+0.5)*TILE,(w[1]+0.5)*TILE];else best=[b.x,b.y+b.h*TILE/2+16];}
  return {x:best[0]+(simRnd()-0.5)*8,y:best[1]+(simRnd()-0.5)*8};
}
let qUid=0; /* unique id per queued item (stable DOM keys in the UI) */
function enqueue(b,type){
  const t=T[b.team];
  if(b.queue.length>=5)return false;
  const d=UDEF[type];
  if(!canAfford(t,d.cost))return false;
  if(d.age&&t.age<d.age)return false;
  pay(t,d.cost);b.queue.push({type,uid:++qUid});
  if(b.queue.length===1)b.qt=0;
  return true;
}
function cancelQueue(b,i){
  const q=b.queue[i];if(!q)return;
  refund(T[b.team],UDEF[q.type].cost);
  b.queue.splice(i,1);if(i===0)b.qt=0;
}
function startAge(b){
  const t=T[b.team];
  if(t.age>=2||t.research||!b.done)return false;
  if(!canAfford(t,AGE_COST))return false;
  pay(t,AGE_COST);t.research={t:0};return true;
}
function spawnUnit(b,type){
  const p=spawnPos(b),u=addUnit(type,b.team,p.x,p.y);
  emit('train_done',{u});
  if(b.rally){
    const r=b.rally;
    if(r.tgt&&!r.tgt.dead&&type==='villager'&&(r.tgt.kind==='r'||r.tgt.type==='farm'))orderGather(u,r.tgt);
    else{u.ord={t:'move',x:r.x,y:r.y};goPoint(u,r.x,r.y);}
  }
  return u;
}
function tickBld(b,dt){
  if(b.flash>0)b.flash-=dt;
  if(!b.done){b.nb=b.nbCur;b.nbCur=0;return;}
  const t=T[b.team],d=BDEF[b.type];
  if(b.queue.length){
    const q=b.queue[0];
    if(t.pop<Math.min(t.cap,100)){
      b.qt+=dt;
      if(b.qt>=UDEF[q.type].time){b.queue.shift();b.qt=0;spawnUnit(b,q.type);if(b.team===0)selDirty=true;}
    }else if(b.team===0&&G.t-(G.popWarn||-99)>10){G.popWarn=G.t;toast('人口已满，需要建造更多房屋','warn');}
  }
  if(b.type==='tc'&&t.research&&t.tc===b){
    t.research.t+=dt;
    if(t.research.t>=AGE_TIME){t.research=null;t.age=2;if(b.team===0)toast('已晋升封建时代：解锁骑士与哨塔','good');selDirty=true;emit('age_up',{team:b.team});}
  }
  if(d.atk){
    b.cd-=dt;
    if(b.cd<=0){
      let best=null,bd=1e12;
      nearU(b.x,b.y,d.range,n=>{
        if(n.team===b.team)return;
        const dd=hyp(n.x-b.x,n.y-b.y);
        if(dd<bd){bd=dd;best=n;}
      });
      if(best){b.cd=d.cd;projs.push({x:b.x,y:b.y-b.h*TILE*0.4,sx:b.x,sy:b.y,tx:best.x,ty:best.y,tgt:best,dmg:d.atk,sp:360,src:b,team:b.team,life:3,dead:false});emit('shoot',{src:b,tgt:best});}
      else b.cd=0.25;
    }
  }
}
function updProj(p,dt){
  const tg=p.tgt;
  if(tg&&!tg.dead){p.tx=tg.x;p.ty=tg.y;}
  const dx=p.tx-p.x,dy=p.ty-p.y,dd=hyp(dx,dy),s=p.sp*dt;
  if(dd<=s+4){
    emit('proj_hit',{x:p.tx,y:p.ty,tgt:tg});
    if(tg&&!tg.dead){emit('hit',{src:p.src,tgt:tg,ranged:true});damage(tg,p.dmg,p.src);}
    p.dead=true;
  }
  else{p.x+=dx/dd*s;p.y+=dy/dd*s;}
  p.life-=dt;if(p.life<0)p.dead=true;
}

/* ================= placement ================= */
function canPlace(type,tx,ty,team){
  const d=BDEF[type];
  for(let j=0;j<d.h;j++)for(let i=0;i<d.w;i++){
    if(!walkable(tx+i,ty+j))return false;
    if(team===0&&!G.aiBoth&&vis[(ty+j)*MW+tx+i]<1)return false;
  }
  if(type!=='farm'){
    for(let j=-1;j<=d.h;j++)for(let i=-1;i<=d.w;i++){
      if(i>=0&&i<d.w&&j>=0&&j<d.h)continue;
      const x=tx+i,y=ty+j;
      if(x<0||y<0||x>=MW||y>=MH)continue;
      const o=occ[y*MW+x];
      if(o){const e=byId.get(o);if(e&&e.kind==='b'&&e.type!=='farm')return false;}
    }
  }
  return true;
}
function nudgeUnits(b){
  const x0=b.tx*TILE-6,y0=b.ty*TILE-6,x1=(b.tx+b.w)*TILE+6,y1=(b.ty+b.h)*TILE+6;
  for(const u of units){
    if(u.dead)continue;
    if(u.x>x0&&u.x<x1&&u.y>y0&&u.y<y1)relocateUnit(u);
  }
}
function placeBuilding(team,type,tx,ty,builders){
  const d=BDEF[type],t=T[team];
  if(!canPlace(type,tx,ty,team))return null;
  if(!canAfford(t,d.cost))return null;
  if(d.age&&t.age<d.age)return null;
  pay(t,d.cost);
  const b=addBld(type,team,tx,ty,false);
  nudgeUnits(b);
  for(const u of builders||[]){u.ord={t:'build',tgt:b,st:'go'};u.path=null;}
  emit('place',{b});
  return b;
}
