/* ================= fog of war ================= */
let fogTick=0,fogDirty=true;
function revealCircle(x,y,r){
  const tx=Math.floor(x/TILE),ty=Math.floor(y/TILE),R=Math.ceil(r);
  for(let j=-R;j<=R;j++)for(let i=-R;i<=R;i++){
    if(i*i+j*j>r*r)continue;
    const X=tx+i,Y=ty+j;
    if(X<0||Y<0||X>=MW||Y>=MH)continue;
    vis[Y*MW+X]=2;
  }
}
function updateFog(dt,force){
  fogTick-=dt;
  if(fogTick>0&&!force)return;
  fogTick=0.2;
  for(let i=0;i<vis.length;i++)if(vis[i]===2)vis[i]=1;
  for(const u of units)if(u.team===0&&!u.dead)revealCircle(u.x,u.y,UDEF[u.type].sight);
  for(const b of blds)if(b.team===0&&!b.dead)revealCircle(b.x,b.y,BDEF[b.type].sight);
  fogDirty=true;
}

/* ================= AI ================= */
const AIP={
  easy:{vcap:16,wave:6,grow:2,delay:330,gather:0.85,gap:80},
  normal:{vcap:24,wave:9,grow:3,delay:260,gather:1.0,gap:65},
  hard:{vcap:34,wave:12,grow:4,delay:210,gather:1.15,gap:50}
};
function makeAI(team,diff){
  const P=AIP[diff]||AIP.normal;
  return {team,P,t:0,acc:0,attacking:false,next:P.delay,waveSize:P.wave,target:null};
}
function findSpot(type,team,cx,cy,rmin,rmax){
  const d=BDEF[type];
  const ctx=Math.floor(cx/TILE),cty=Math.floor(cy/TILE);
  for(let r=rmin;r<=rmax;r++){
    const cand=[];
    for(let y=cty-r;y<=cty+r;y++)for(let x=ctx-r;x<=ctx+r;x++){
      if(Math.max(Math.abs(x-ctx),Math.abs(y-cty))!==r)continue;
      cand.push([x,y]);
    }
    for(let i=cand.length-1;i>0;i--){const j=Math.floor(simRnd()*(i+1));const t=cand[i];cand[i]=cand[j];cand[j]=t;}
    for(const c of cand)if(canPlace(type,c[0],c[1],team))return c;
  }
  return null;
}
function aiBuild(ai,type,vils,cx,cy,rmin,rmax,builder){
  const t=T[ai.team],d=BDEF[type];
  if(!canAfford(t,d.cost)||(d.age&&t.age<d.age))return null;
  const spot=findSpot(type,ai.team,cx,cy,rmin,rmax);
  if(!spot)return null;
  const px=(spot[0]+d.w/2)*TILE,py=(spot[1]+d.h/2)*TILE;
  let bu=builder;
  if(!bu){
    let bd=1e12;
    for(const v of vils){
      if(v.dead||v.ord.t==='build')continue;
      const dd=(v.x-px)*(v.x-px)+(v.y-py)*(v.y-py);
      if(dd<bd){bd=dd;bu=v;}
    }
  }
  if(!bu)return null;
  return placeBuilding(ai.team,type,spot[0],spot[1],[bu]);
}
function aiThink(ai){
  const me=T[ai.team],tc=me.tc;
  if(!tc||tc.dead)return;
  const enemy=1-ai.team,etc=T[enemy].tc,P=ai.P;
  const my=units.filter(u=>u.team===ai.team&&!u.dead);
  const vils=my.filter(u=>u.type==='villager'),army=my.filter(u=>u.type!=='villager');
  const mb=blds.filter(b=>b.team===ai.team&&!b.dead);
  const count=(type,doneOnly)=>{let n=0;for(const b of mb)if(b.type===type&&(!doneOnly||b.done))n++;return n;};
  const building=(type)=>{let n=0;for(const b of mb)if(b.type===type&&!b.done)n++;return n;};

  // villagers
  if(vils.length+tc.queue.length<P.vcap&&tc.queue.length<2)enqueue(tc,'villager');

  // houses
  const capSoon=me.cap+building('house')*5;
  if(me.pop+tc.queue.length+4>=capSoon&&me.cap<100&&building('house')<2)aiBuild(ai,'house',vils,tc.x,tc.y,4,10);

  // barracks / age / towers
  const wantBarracks=vils.length>=10?(vils.length>=18?2:1):0;
  if(count('barracks')<wantBarracks&&building('barracks')<1)aiBuild(ai,'barracks',vils,tc.x,tc.y,5,11);
  if(me.age<2&&vils.length>=14&&count('barracks',true)>=1&&!me.research){startAge(tc);}
  if(me.age>=2&&count('tower')<2&&vils.length>=18&&building('tower')<1)aiBuild(ai,'tower',vils,tc.x,tc.y,6,11);

  // rally + army production
  const cxm=MW*TILE/2,cym=MH*TILE/2;
  const rally={x:tc.x+(cxm-tc.x)*0.14,y:tc.y+(cym-tc.y)*0.14};
  let sp=0,ar=0,kn=0;for(const a of army){if(a.type==='spear')sp++;else if(a.type==='archer')ar++;else kn++;}
  for(const b of mb){
    if(b.type!=='barracks'||!b.done)continue;
    b.rally=rally;
    if(b.queue.length<1&&vils.length>=9&&me.pop<me.cap){
      let pick=sp<=ar?'spear':'archer';
      if(me.age>=2&&kn<Math.max(2,(sp+ar)/2)&&canAfford(me,UDEF.knight.cost))pick='knight';
      if(!canAfford(me,UDEF[pick].cost))pick=canAfford(me,UDEF.archer.cost)?'archer':(canAfford(me,UDEF.spear.cost)?'spear':null);
      if(pick)enqueue(b,pick);
    }
  }

  // idle villagers: assign work
  const gat={wood:0,food:0,gold:0};
  for(const v of vils)if(v.ord.t==='gather')gat[v.ord.rt]++;
  const n=vils.length,want={food:Math.ceil(n*0.36),wood:Math.ceil(n*0.42),gold:n>=12?Math.floor(n*0.22):0};
  const farms=count('farm');
  for(const v of vils){
    if(v.ord.t!=='idle')continue;
    let rt='wood',bestDef=-99;
    for(const k of ['food','wood','gold']){const df=want[k]-gat[k];if(df>bestDef){bestDef=df;rt=k;}}
    let r=findRes(v,rt,null,40);
    if(!r&&rt==='food'){
      if(farms<7&&me.wood>=BDEF.farm.cost.wood){
        const fb=aiBuild(ai,'farm',vils,tc.x,tc.y,3,9,v);
        if(fb){gat.food++;continue;}
      }
      rt='wood';r=findRes(v,rt,null,40);
    }
    if(!r)continue;
    // drop-off near the resource?
    let dd=1e12;
    for(const b of mb)if(BDEF[b.type].drop&&b.done){const q=rectDist(r.x,r.y,b);if(q<dd)dd=q;}
    if(dd>7*TILE&&me.wood>=BDEF.store.cost.wood&&building('store')<1){
      const sb=aiBuild(ai,'store',vils,r.x,r.y,2,4,v);
      if(sb){gat[rt]++;continue;}
    }
    orderGather(v,r);gat[rt]++;
  }

  // army orders
  let threat=null,td=1e12;
  for(const u of units){
    if(u.dead||u.team!==enemy)continue;
    for(const b of mb){
      const d=hyp(u.x-b.x,u.y-b.y);
      if(d<12*TILE&&d<td){td=d;threat=u;}
    }
  }
  if(threat){
    for(const a of army)if(a.ord.t==='idle'||a.ord.t==='move'||(a.ord.t==='amove'&&hyp(a.ord.x-threat.x,a.ord.y-threat.y)>8*TILE)){a.ord={t:'amove',x:threat.x,y:threat.y};goPoint(a,threat.x,threat.y);}
  }else if(ai.attacking){
    if(army.length<3)ai.attacking=false;
    else{
      // nearest enemy structure to the army
      let cx=0,cy=0;for(const a of army){cx+=a.x;cy+=a.y;}cx/=army.length;cy/=army.length;
      let tgt=null,bd=1e12;
      for(const b of blds){if(b.dead||b.team!==enemy)continue;const d=hyp(b.x-cx,b.y-cy);if(d<bd){bd=d;tgt=b;}}
      if(!tgt&&etc)tgt=etc;
      if(tgt)for(const a of army)if(a.ord.t==='idle'){a.ord={t:'amove',x:tgt.x,y:tgt.y};goPoint(a,tgt.x,tgt.y);}
    }
  }else if(ai.t>=ai.next&&army.length>=ai.waveSize&&etc){
    ai.attacking=true;ai.waveSize+=P.grow;ai.next=ai.t+P.gap;
    for(const a of army){a.ord={t:'amove',x:etc.x,y:etc.y};goPoint(a,etc.x,etc.y);}
  }
}

/* ================= simulation step ================= */
function purge(){
  let dirty=false;
  for(const u of units)if(u.dead){byId.delete(u.id);dirty=true;}
  if(dirty)units=units.filter(u=>!u.dead);
  dirty=false;
  for(const b of blds)if(b.dead){byId.delete(b.id);dirty=true;}
  if(dirty)blds=blds.filter(b=>!b.dead);
  dirty=false;
  for(const r of ress)if(r.dead){byId.delete(r.id);dirty=true;}
  if(dirty)ress=ress.filter(r=>!r.dead);
  projs=projs.filter(p=>!p.dead);
}
function step(dt){
  G.t+=dt;G.tick++;PB=PB_TICK;
  for(const b of blds)if(b.type==='farm')b.nfm=0;
  for(const u of units){const o=u.ord;if(o.t==='gather'&&o.tgt&&o.tgt.type==='farm'&&!u.dead)o.tgt.nfm=(o.tgt.nfm||0)+1;}
  if(typeof runCommands==='function')runCommands();
  rebuildHash();
  for(const b of blds)if(!b.dead)tickBld(b,dt);
  for(const u of units)if(!u.dead)updUnit(u,dt);
  for(const u of units)separate(u);
  for(const p of projs)updProj(p,dt);
  for(const a of ais){a.t+=dt;a.acc+=dt;if(a.acc>=1){a.acc=0;aiThink(a);}}
  for(const f of fx)f.life-=dt;
  fx=fx.filter(f=>f.life>0);
  purge();
  updateFog(dt);
}
