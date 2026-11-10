/* V37 combat effects. Render-only: reads the simulation's cosmetic effect list, owns its own pooled particle store and never writes
   simulation state. Math.random is used only for visual jitter. Off switch: ?fx37=0 (legacy effects), tiers: ?fx37=low|mid|high. */
(()=>{'use strict';
const A=window.KingdomArt,D=window.KingdomSim.defs,query=new URLSearchParams(location.search),flag=query.get('fx37');
let stored=null;try{stored=localStorage.getItem('fk-fx37')}catch{}
const TIERS={off:{cap:0,d:0,proj:0},low:{cap:150,d:.45,proj:48},mid:{cap:320,d:.75,proj:96},high:{cap:600,d:1,proj:160}};
const coarse=typeof matchMedia==='function'&&matchMedia('(pointer:coarse)').matches;
let tier=flag==='0'||flag==='off'?'off':TIERS[flag]?flag:TIERS[stored]?stored:(coarse?'mid':'high');
const MAXP=600,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),rnd=Math.random,TAU=Math.PI*2;
/* Particle store (structure of arrays, swap-remove). kinds: 0 puff, 1 spark, 2 chip, 3 ground ring, 4 glow, 5 slash arc. */
const X=new Float32Array(MAXP),Y=new Float32Array(MAXP),VX=new Float32Array(MAXP),VY=new Float32Array(MAXP),AGE=new Float32Array(MAXP),LIFE=new Float32Array(MAXP),S0=new Float32Array(MAXP),S1=new Float32Array(MAXP),ROT=new Float32Array(MAXP),AL=new Float32Array(MAXP),GR=new Float32Array(MAXP),DR=new Float32Array(MAXP),KIND=new Uint8Array(MAXP),COL=new Uint8Array(MAXP),LAY=new Uint8Array(MAXP);
let count=0,spawned=0,dropped=0,clock=0,lastReal=0,density=1,ema=.016,view={l:-1e9,t:-1e9,r:1e9,b:1e9,z:1};
const seen=new WeakSet(),delays=new WeakMap(),recent=[],later=[],proj=[],ambient=new Map();
const make=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
/* Soft sprites are painted once and reused, so a particle costs one drawImage. */
function radial(size,stops){const c=make(size,size),g=c.getContext('2d'),r=size/2,gr=g.createRadialGradient(r,r,0,r,r,r);for(const [o,col]of stops)gr.addColorStop(o,col);g.fillStyle=gr;g.fillRect(0,0,size,size);return c}
const PUFF=[radial(64,[[0,'#cdbf9fe0'],[.55,'#b3a584a0'],[1,'#9c8f7000']]),radial(64,[[0,'#a9a89ee0'],[.55,'#8b8a82a0'],[1,'#6f6e6800']]),radial(64,[[0,'#7b2f27a0'],[.6,'#5e262060'],[1,'#4a1d1800']]),radial(64,[[0,'#d8d4c8d0'],[.6,'#bdb9ac80'],[1,'#a6a29600']])],
GLOW=[radial(64,[[0,'#fff3c8'],[.25,'#ffd48a'],[.6,'#e58b3c60'],[1,'#a2441a00']]),radial(64,[[0,'#ffffffe0'],[.4,'#f6ecd0a0'],[1,'#f6ecd000']])];
const CHIP=['#7d725c','#a39880','#5d4f3e','#8c8776','#b3a98d'];
const api={get tier(){return tier},get active(){return tier!=='off'},get density(){return density},
 setTier(t){if(!TIERS[t])return;tier=t;density=Math.min(density,1);try{localStorage.setItem('fk-fx37',t)}catch{}if(t==='off'){count=0;proj.length=0;later.length=0}},
 stats(){return{tier,particles:count,projectiles:proj.length,spawned,dropped,density:+density.toFixed(2),cap:TIERS[tier].cap}},
 view(l,t,r,b,z){view.l=l;view.t=t;view.r=r;view.b=b;view.z=z}};
const inView=(x,y,m=60)=>x>view.l-m&&x<view.r+m&&y>view.t-m&&y<view.b+m;
const budget=()=>TIERS[tier].cap*Math.max(.35,density);
const n_=n=>{const v=n*TIERS[tier].d*density,f=Math.floor(v);return f+(rnd()<v-f?1:0)};
function add(kind,x,y,vx,vy,life,s0,s1,al,col=0,lay=1,rot=0,gr=0,dr=0,vr=0){if(count>=MAXP||count>=budget()){dropped++;return -1}const i=count++;X[i]=x;Y[i]=y;VX[i]=vx;VY[i]=vy;AGE[i]=0;LIFE[i]=life;S0[i]=s0;S1[i]=s1;AL[i]=al;KIND[i]=kind;COL[i]=col;LAY[i]=lay;ROT[i]=rot;GR[i]=gr;DR[i]=dr;spawned++;return i}
function remove(i){const j=--count;if(i!==j){X[i]=X[j];Y[i]=Y[j];VX[i]=VX[j];VY[i]=VY[j];AGE[i]=AGE[j];LIFE[i]=LIFE[j];S0[i]=S0[j];S1[i]=S1[j];AL[i]=AL[j];KIND[i]=KIND[j];COL[i]=COL[j];LAY[i]=LAY[j];ROT[i]=ROT[j];GR[i]=GR[j];DR[i]=DR[j]}}
const puff=(x,y,vx,vy,life,s0,s1,al,col=0,lay=1)=>add(0,x,y,vx,vy,life,s0,s1,al,col,lay,0,0,1.6);
const spark=(x,y,a,sp,life=.28)=>add(1,x,y,Math.cos(a)*sp,Math.sin(a)*sp,life,1,1,.9,0,1,0,380,2.4);
const chip=(x,y,a,sp,life=.6,size=2.2)=>add(2,x,y,Math.cos(a)*sp,Math.sin(a)*sp-sp*.45,life,size,size*.6,1,Math.floor(rnd()*CHIP.length),1,rnd()*TAU,520,1.2);
const ring=(x,y,r0,r1,life,al=.45)=>add(3,x,y,0,0,life,r0,r1,al,0,0);
const glow=(x,y,s0,s1,life,al,col=0)=>add(4,x,y,0,0,life,s0,s1,al,col,1);
function slash(x,y,ang,r,life=.18){add(5,x,y,0,0,life,r,r,.9,0,1,ang)}
function after(sec,fn){if(later.length<96)later.push({t:clock+sec,fn})}
/* Entity lookup for cosmetic effect events (matches the exact offsets the simulation uses when it emits them). */
function find(sim,x,y){const s=sim.state||sim.s,e=.75;for(const u of s.units)if(Math.abs(u.x-x)<e&&(Math.abs(u.y-y)<e)&&u.hp>0)return u;for(const b of s.buildings)if(Math.abs(b.x-x)<e&&Math.abs(b.y-y)<e)return b;return null}
const isBuilding=e=>!!(e&&D[e.kind]?.building);
const speed={arrow:760,towerArrow:820,musket:2800,cannon:1150,boulder:560,grenade:430};
function flight(f){const dist=Math.hypot(f.tx-f.x,f.ty-f.y),w=f.weapon;if(w==='melee')return .07;const v=speed[w]||700,lo={musket:.05,cannon:.2,boulder:.55,grenade:.42}[w]||.16,hi={musket:.16,cannon:.62,boulder:1.1,grenade:.75}[w]||.55;return clamp(dist/v,lo,hi)}
const hitAnim=()=>window.KingdomAnim37;
/* ---- events from the simulation's cosmetic list ---- */
function muzzle(f,ang,dur){const w=f.weapon;if(!inView(f.x,f.y,120))return;const dx=Math.cos(ang),dy=Math.sin(ang);
 if(w==='musket'){glow(f.x+dx*10,f.y+dy*10,26,10,.09,.8);for(let i=0;i<n_(3);i++)spark(f.x+dx*12,f.y+dy*12,ang+(rnd()-.5)*.7,160+rnd()*160,.14);puff(f.x+dx*14,f.y+dy*14-2,dx*14+(rnd()-.5)*8,-12-rnd()*8,1.3,6,22,.5,3);puff(f.x+dx*8,f.y+dy*8,dx*6,-8,1.8,5,26,.35,3)}
 else if(w==='cannon'){glow(f.x+dx*22,f.y+dy*22,60,24,.13,.85);glow(f.x+dx*14,f.y+dy*14,34,12,.1,.9,1);for(let i=0;i<n_(6);i++)spark(f.x+dx*22,f.y+dy*22,ang+(rnd()-.5)*.9,140+rnd()*260,.22);for(let i=0;i<n_(4);i++)puff(f.x+dx*(16+i*9),f.y+dy*(16+i*6)-3,dx*(24-i*4),-10-rnd()*10,1.6+rnd()*.7,10+i*3,34+i*6,.5,3);const gy=f.y+(f.gy||26);ring(f.x,gy,6,48,.5,.35);for(let i=0;i<n_(4);i++)puff(f.x+(rnd()-.5)*30,gy,(rnd()-.5)*40,-4-rnd()*5,1,6,20,.32,0,0)}
 else if(w==='boulder'){for(let i=0;i<n_(4);i++)puff(f.x+(rnd()-.5)*26,f.y+14,(rnd()-.5)*34,-6-rnd()*8,1,8,22,.3,0,0)}
 else if(w==='grenade'){puff(f.x,f.y,dx*10,-8,.8,4,12,.28,3)}
}
function impact(f,tgt,building,ang){const w=f.weapon,x=f.tx,y=f.ty,gy=tgt?tgt.y:y+25;if(!inView(x,y,100))return;const hz=hitAnim();
 const vx=Math.cos(ang),vy=Math.sin(ang);
 if(tgt&&!building&&hz)hz.hit(tgt.id,clock,vx,vy,w==='cannon'||w==='boulder'||w==='grenade'?7:w==='musket'?3.6:w==='arrow'||w==='towerArrow'?2.6:4.2,w==='cannon'||w==='boulder'||w==='grenade');
 if(building){const heavy=w==='cannon'||w==='boulder',nChips=heavy?10:w==='melee'?3:3;for(let i=0;i<n_(nChips);i++)chip(x+(rnd()-.5)*14,y+(rnd()-.5)*10,-Math.PI/2+(rnd()-.5)*2.4,70+rnd()*(heavy?170:90),.5+rnd()*.4,heavy?3:2.2);for(let i=0;i<n_(heavy?4:1.5);i++)puff(x+(rnd()-.5)*20,y+(rnd()-.5)*10,(rnd()-.5)*26,-8-rnd()*10,1.1+rnd()*.5,7,heavy?30:16,heavy?.5:.32,0);if(heavy)ring(x,gy,8,58,.45,.4);return}
 if(w==='melee'){slash(x,y,ang,15+rnd()*4,.2);for(let i=0;i<n_(4);i++)spark(x,y,ang+Math.PI+(rnd()-.5)*1.6,110+rnd()*150,.2);glow(x,y,16,6,.08,.5,1)}
 else if(w==='arrow'||w==='towerArrow'){for(let i=0;i<n_(2);i++)spark(x,y,ang+Math.PI+(rnd()-.5)*1.2,70+rnd()*80,.16);puff(x,y+4,0,-6,.5,4,10,.22,0)}
 else if(w==='musket'){for(let i=0;i<n_(4);i++)spark(x,y,ang+Math.PI+(rnd()-.5)*1.4,120+rnd()*150,.18);glow(x,y,14,6,.07,.6);puff(x,y+3,0,-6,.6,4,11,.22,0)}
 else{ring(x,gy,6,48,.42,.42);for(let i=0;i<n_(4);i++)puff(x+(rnd()-.5)*26,gy-2,(rnd()-.5)*44,-6-rnd()*8,.9+rnd()*.5,8,26,.4,0,0);for(let i=0;i<n_(7);i++)chip(x,gy-4,-Math.PI/2+(rnd()-.5)*2.6,90+rnd()*160,.5+rnd()*.35,2.4)}
}
function launch(f){const tgt=find(window.KingdomFX37Sim,f.tx,f.ty+25)||find(window.KingdomFX37Sim,f.tx,f.ty),building=isBuilding(tgt),dur=flight(f),ang=Math.atan2(f.ty-f.y,f.tx-f.x);
 delays.set(f,dur);recent.push({tx:f.tx,ty:f.ty,dur,t:clock});if(recent.length>48)recent.shift();
 f.gy=tgt?0:0;const w=f.weapon;
 muzzle({...f,gy:26},ang,dur);
 const rec={tx:f.tx,ty:f.ty,weapon:w,x:f.x,y:f.y};
 if(w==='melee'){after(dur,()=>impact(f,tgt,building,ang));return}
 if(proj.length>=TIERS[tier].proj)return after(dur,()=>impact(f,tgt,building,ang));
 const arc=w==='arrow'||w==='towerArrow'?clamp(Math.hypot(f.tx-f.x,f.ty-f.y)*.16,14,46):w==='grenade'?52:w==='boulder'?clamp(Math.hypot(f.tx-f.x,f.ty-f.y)*.3,40,110):w==='cannon'?10:3;
 proj.push({w,x0:f.x,y0:f.y,x1:f.tx,y1:f.ty,t0:clock,dur,arc,ang,trail:0,fuse:0,done:()=>impact(f,tgt,building,ang)});
}
function handle(f,sim){
 switch(f.type){
 case'attack':launch(f);break;
 case'damage':{for(let i=recent.length-1;i>=0;i--){const r=recent[i];if(clock-r.t>.2)break;if(Math.abs(f.x-r.tx)<1.2&&Math.abs(f.y-(r.ty-20))<2){delays.set(f,r.dur);break}}break}
 case'explosion':{let dl=0;for(let i=recent.length-1;i>=0;i--){const r=recent[i];if(clock-r.t>.2)break;if(Math.abs(f.x-r.tx)<1.2&&Math.abs(f.y-(r.ty+17))<2){dl=r.dur;break}}delays.set(f,dl);after(dl,()=>explode(f));break}
 case'death':{if(D[f.kind]?.domain==='sea'||D[f.kind]?.domain==='air')break;const siege=D[f.kind]?.role==='cannon';after(siege?.05:.42,()=>{if(!inView(f.x,f.y,80))return;const big=siege?2:1;ring(f.x,f.y+6,4,26*big,.5,.25);for(let i=0;i<n_(3*big);i++)puff(f.x+(rnd()-.5)*20,f.y+4,(rnd()-.5)*30,-4-rnd()*6,.9+rnd()*.5,6,18*big,.3,0,0);if(query.get('blood')==='1')for(let i=0;i<n_(3);i++)puff(f.x+(rnd()-.5)*14,f.y+2,(rnd()-.5)*20,-3,.8,5,14,.28,2,0)});break}
 case'collapse':{if(!inView(f.x,f.y,200))break;const r=D[f.kind]?.r||40;after(.35,()=>{ring(f.x,f.y+8,10,r*2.6,.9,.4);for(let i=0;i<n_(10);i++)puff(f.x+(rnd()-.5)*r*1.6,f.y-rnd()*r*.6,(rnd()-.5)*40,-10-rnd()*22,1.8+rnd()*1.2,r*.3,r*.9,.5,0);for(let i=0;i<n_(16);i++)chip(f.x+(rnd()-.5)*r*1.4,f.y-rnd()*r*.8,-Math.PI/2+(rnd()-.5)*2.8,80+rnd()*190,.6+rnd()*.6,3.2)});break}
 }
}
function explode(f){if(!inView(f.x,f.y,160))return;const s=f.size||50;ring(f.x,f.y+14,8,s*1.2,.5,.45);glow(f.x,f.y-6,s*.9,s*.45,.2,.75);glow(f.x,f.y-10,s*.55,s*.25,.14,.9,1);for(let i=0;i<n_(5);i++)puff(f.x+(rnd()-.5)*s*.5,f.y-rnd()*s*.2,(rnd()-.5)*30,-14-rnd()*20,1.4+rnd()*.8,s*.18,s*.55,.42,i%2?1:0);for(let i=0;i<n_(8);i++)spark(f.x,f.y-8,rnd()*TAU,90+rnd()*210,.3);for(let i=0;i<n_(9);i++)chip(f.x,f.y,-Math.PI/2+(rnd()-.5)*3,100+rnd()*180,.55+rnd()*.4,2.6)}
api.observe=(effects,sim)=>{if(tier==='off')return;window.KingdomFX37Sim=sim;for(const f of effects){if(seen.has(f))continue;seen.add(f);try{handle(f,sim)}catch(e){}}};
api.delayOf=f=>delays.get(f)||0;
/* ---- ambient damage smoke on wounded buildings (called by the building painter; bounded by the same particle budget) ---- */
api.buildingAmbient=(b,stage,x,y)=>{if(tier==='off'||stage<1||!inView(b.x,b.y,100))return;let t=ambient.get(b.id);if(t===undefined)t=clock+rnd();if(clock<t)return;ambient.set(b.id,clock+(stage===2?.45:1.3)*(1+rnd()*.6)/Math.max(.5,density));if(ambient.size>300)ambient.delete(ambient.keys().next().value);puff(x+(rnd()-.5)*8,y,(rnd()-.3)*8,-9-rnd()*7,2.2+rnd(),5,stage===2?24:15,stage===2?.34:.22,1);if(stage===2&&rnd()<.5)glow(x,y+4,10,4,.3,.35,0)};
/* ---- frame update ---- */
api.tick=(nowSec,paused)=>{if(tier==='off'){lastReal=nowSec;return}let dt=clamp(nowSec-(lastReal||nowSec),0,.1);lastReal=nowSec;if(paused)dt=0;ema+=(Math.min(dt||ema,.1)-ema)*.05;if(!paused){if(ema>.034)density=Math.max(.3,density-dt*.12);else if(ema<.024)density=Math.min(1,density+dt*.05)}clock+=dt;
 for(let i=later.length-1;i>=0;i--)if(later[i].t<=clock){const j=later[i];later.splice(i,1);try{j.fn()}catch{}}
 for(let i=proj.length-1;i>=0;i--){const p=proj[i],q=(clock-p.t0)/p.dur;if(q>=1){proj.splice(i,1);try{p.done()}catch{}continue}if(p.w==='cannon'||p.w==='boulder'||p.w==='grenade'){p.trail+=dt;if(p.trail>(p.w==='cannon'?.045:.05)&&inView(p.x0+(p.x1-p.x0)*q,p.y0+(p.y1-p.y0)*q,40)){p.trail=0;const x=p.x0+(p.x1-p.x0)*q,y=p.y0+(p.y1-p.y0)*q-Math.sin(q*Math.PI)*p.arc;if(rnd()<density)puff(x,y,(rnd()-.5)*8,-4,.7,3,p.w==='boulder'?9:7,p.w==='boulder'?.22:.26,p.w==='boulder'?0:3)}}}
 for(let i=count-1;i>=0;i--){AGE[i]+=dt;if(AGE[i]>=LIFE[i]){remove(i);continue}if(dt){const k=Math.exp(-DR[i]*dt);VX[i]*=k;VY[i]=VY[i]*k+GR[i]*dt;X[i]+=VX[i]*dt;Y[i]+=VY[i]*dt}}};
const pathPoint=(p,q)=>({x:p.x0+(p.x1-p.x0)*q,y:p.y0+(p.y1-p.y0)*q-Math.sin(q*Math.PI)*p.arc});
function drawProjectiles(c){for(const p of proj){const q=clamp((clock-p.t0)/p.dur,0,1),a=pathPoint(p,q);if(!inView(a.x,a.y,40))continue;const b=pathPoint(p,Math.max(0,q-.06)),ang=Math.atan2(a.y-b.y,a.x-b.x);c.save();
  if(p.w==='arrow'||p.w==='towerArrow'){const tail=pathPoint(p,Math.max(0,q-.2));c.globalAlpha=.28;c.strokeStyle='#e9e1c4';c.lineWidth=1;c.beginPath();c.moveTo(tail.x,tail.y);c.lineTo(a.x,a.y);c.stroke();c.globalAlpha=1;c.translate(a.x,a.y);c.rotate(ang);const L=p.w==='towerArrow'?22:14;c.strokeStyle='#6a4b2e';c.lineWidth=p.w==='towerArrow'?2.4:1.5;c.beginPath();c.moveTo(-L,0);c.lineTo(0,0);c.stroke();c.fillStyle='#cfd3c0';c.beginPath();c.moveTo(4,0);c.lineTo(-1,-2);c.lineTo(-1,2);c.fill();c.strokeStyle='#e3dcc0';c.lineWidth=1;c.beginPath();c.moveTo(-L,0);c.lineTo(-L-3,-2.5);c.moveTo(-L,0);c.lineTo(-L-3,2.5);c.stroke()}
  else if(p.w==='musket'){const t=pathPoint(p,Math.max(0,q-.25));const g=c.createLinearGradient(t.x,t.y,a.x,a.y);g.addColorStop(0,'#ffe7a800');g.addColorStop(1,'#fff0c4e6');c.strokeStyle=g;c.lineWidth=1.8;c.beginPath();c.moveTo(t.x,t.y);c.lineTo(a.x,a.y);c.stroke()}
  else{const r=p.w==='boulder'?6:p.w==='cannon'?3.6:3.4;c.fillStyle=p.w==='boulder'?'#7b7568':'#2f302d';c.beginPath();c.arc(a.x,a.y,r,0,TAU);c.fill();c.fillStyle='#ffffff30';c.beginPath();c.arc(a.x-r*.3,a.y-r*.3,r*.4,0,TAU);c.fill();if(p.w==='grenade'){c.fillStyle='#ffd27a';c.beginPath();c.arc(a.x+rnd()*2,a.y-r-1,1.3,0,TAU);c.fill()}}
  c.restore()}}
function drawParticles(c,layer){for(let i=0;i<count;i++){if(LAY[i]!==layer)continue;const x=X[i],y=Y[i];if(x<view.l-80||x>view.r+80||y<view.t-80||y>view.b+80)continue;const t=AGE[i]/LIFE[i],k=KIND[i];
  switch(k){
  case 0:{const s=S0[i]+(S1[i]-S0[i])*Math.sqrt(t),a=AL[i]*Math.min(1,t*8)*(1-t)*(1-t*.3);c.globalAlpha=a;c.drawImage(PUFF[COL[i]],x-s,y-s*.85,s*2,s*1.7);break}
  case 1:{c.globalAlpha=(1-t)*AL[i];c.strokeStyle='#ffe2a6';c.lineWidth=1.2;c.beginPath();c.moveTo(x,y);c.lineTo(x-VX[i]*.035,y-VY[i]*.035);c.stroke();break}
  case 2:{c.globalAlpha=Math.min(1,(1-t)*1.6);c.fillStyle=CHIP[COL[i]];const s=S0[i]+(S1[i]-S0[i])*t;c.fillRect(x-s/2,y-s/2,s,s*.8);break}
  case 3:{const r=S0[i]+(S1[i]-S0[i])*(1-(1-t)*(1-t));c.globalAlpha=AL[i]*(1-t);c.strokeStyle='#d8ccb0';c.lineWidth=Math.max(.6,2.6*(1-t));c.beginPath();c.ellipse(x,y,r,r*.42,0,0,TAU);c.stroke();break}
  case 4:{const s=S0[i]+(S1[i]-S0[i])*t;c.globalCompositeOperation='lighter';c.globalAlpha=AL[i]*(1-t);c.drawImage(GLOW[COL[i]],x-s,y-s,s*2,s*2);c.globalCompositeOperation='source-over';break}
  case 5:{const r=S0[i],sweep=1.9,head=ROT[i]-.95+sweep*Math.min(1,t*2.2);c.globalAlpha=(1-t)*AL[i];c.lineCap='round';c.strokeStyle='#f1e6c6';c.lineWidth=3.2*(1-t)+.8;c.beginPath();c.arc(x,y,r,head-1.1,head);c.stroke();c.strokeStyle='#fffbe8';c.lineWidth=1.1;c.beginPath();c.arc(x,y,r,head-.55,head);c.stroke();break}
  }}c.globalAlpha=1}
api.drawGround=c=>{if(tier==='off'||!count)return;c.save();drawParticles(c,0);c.restore()};
api.drawAir=c=>{if(tier==='off')return;c.save();drawProjectiles(c);drawParticles(c,1);c.restore()};
/* ---- command click feedback: contracting lock-on ring, expanding pulse, four ticks (muted palette) ---- */
api.command=(c,f,p,tint,label)=>{const r=16+(1-Math.pow(1-Math.min(1,p/.4),3))*0+0,lock=Math.min(1,p/.32),ease=1-Math.pow(1-lock,3),R=(30-14*ease),a=p<.32?.35+ease*.65:1-(p-.32)/.68;c.save();c.globalAlpha=a*.95;c.strokeStyle=tint;c.lineWidth=2.1*(1-p*.5);c.beginPath();c.ellipse(f.x,f.y,R,R*.45,0,0,TAU);c.stroke();if(p>.18){const q=(p-.18)/.82;c.globalAlpha=(1-q)*.55;c.lineWidth=1.4;c.beginPath();c.ellipse(f.x,f.y,12+q*34,(12+q*34)*.45,0,0,TAU);c.stroke()}c.globalAlpha=a*.9;for(let i=0;i<4;i++){const ang=i*Math.PI/2+Math.PI/4,cx=Math.cos(ang),cy=Math.sin(ang)*.45;c.beginPath();c.moveTo(f.x+cx*(R+2),f.y+cy*(R+2));c.lineTo(f.x+cx*(R+7-ease*2),f.y+cy*(R+7-ease*2));c.stroke()}c.fillStyle=tint;c.globalAlpha=a*.8;c.beginPath();c.ellipse(f.x,f.y,2.6,1.2,0,0,TAU);c.fill();c.restore()};
api.selectRing=(c,x,y,rx,k)=>{c.save();c.globalAlpha=(1-k)*.7;c.strokeStyle='#f2e3b0';c.lineWidth=2*(1-k)+.6;const r=rx+k*16;c.beginPath();c.ellipse(x,y,r,r*.38,0,0,TAU);c.stroke();c.restore()};
/* ---- death pose: gravity fall with a small hop, settle bounce, long lie and late fade (replaces the 0.1 s rigid snap) ---- */
api.deathPose=(f,age,max)=>{const FALL=.46,tau=Math.min(age,FALL)/FALL,ease=tau*tau*(3-2*tau)*.35+tau*tau*tau*.65,bounce=age>FALL&&age<FALL+.25?Math.sin((age-FALL)/.25*Math.PI)*.06:0,hop=age<.14?Math.sin(age/.14*Math.PI)*5:0,sign=f.facing||1,life=max-age;return{rot:sign*(1.35*ease-bounce),ox:-sign*ease*9,oy:-hop,alpha:clamp(life/1.8,0,1)}};
window.KingdomFX=api;
})();
