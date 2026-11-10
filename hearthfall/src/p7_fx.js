/* ================= p7_fx.js : quality tiers, audio engine, particles, ambient animals, game-event bus =================
   Public: FXQ (quality), FXX (runtime flags), onGameEvent(type,data), fxUpdate(dt), fxDraw(g), fxDrawGround(g), fxDrawScreen(g,w,h),
           fxAnimals, fxReset(), drawAnimal(g,a), fxShake, AU (audio state) */
const FXQ={
  level:'high',auto:true,cur:null,dyn:1,
  cfg:{
    high:{rs:1,particles:700,pmul:1,animals:14,water:true,sway:true,voices:20,decals:80,trail:true,smoke:true},
    medium:{rs:0.9,particles:360,pmul:0.6,animals:8,water:true,sway:true,voices:12,decals:40,trail:true,smoke:true},
    low:{rs:0.75,particles:150,pmul:0.35,animals:4,water:false,sway:false,voices:6,decals:16,trail:false,smoke:false}
  },
  set(l){if(!this.cfg[l])return;this.level=l;this.cur=this.cfg[l];this.dyn=1;if(typeof resize==='function'&&typeof cv!=='undefined')resize();if(typeof AU!=='undefined')AU.cap=this.cur.voices;if(typeof fxAnimals!=='undefined'&&typeof fxReset==='function'&&worldCv)fxSpawnAnimals();}
};
FXQ.cur=FXQ.cfg.high;
(function(){try{const ua=navigator.userAgent||'',mobile=/iPhone|iPad|Android|Mobile/.test(ua)||(navigator.maxTouchPoints>1&&/Mac/.test(ua));
  if(mobile||(navigator.hardwareConcurrency||8)<=4){FXQ.level='medium';FXQ.cur=FXQ.cfg.medium;}
  const q=(location.search.match(/fxq=(high|medium|low)/)||[])[1];if(q){FXQ.level=q;FXQ.cur=FXQ.cfg[q];FXQ.auto=false;}}catch(e){}})();
const FXX={dmg:true,muted:false};
const fxShake={x:0,y:0,t:0,a:0};
const rr01=Math.random;

/* ---------------- audio engine ---------------- */
const AU={ctx:null,master:null,comp:null,sfx:null,amb:null,noise:null,pink:null,vol:0.7,muted:false,voices:0,cap:FXQ.cur.voices,last:{},ambOn:false,nextBird:0};
try{const v=localStorage.getItem('hf_vol'),m=localStorage.getItem('hf_mute'),d=localStorage.getItem('hf_dmg');if(v!==null)AU.vol=clamp(+v,0,1);if(m==='1')AU.muted=true;if(d==='0')FXX.dmg=false;}catch(e){}
function auInit(){
  if(AU.ctx)return;
  try{
    const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
    const c=AU.ctx=new C();
    AU.master=c.createGain();AU.master.gain.value=AU.muted?0:AU.vol;
    AU.comp=c.createDynamicsCompressor();AU.comp.threshold.value=-16;AU.comp.ratio.value=5;AU.comp.attack.value=0.004;AU.comp.release.value=0.18;
    AU.sfx=c.createGain();AU.sfx.gain.value=0.9;AU.amb=c.createGain();AU.amb.gain.value=0.5;
    AU.sfx.connect(AU.comp);AU.amb.connect(AU.comp);AU.comp.connect(AU.master);AU.master.connect(c.destination);
    const n=c.sampleRate*2,b=c.createBuffer(1,n,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;AU.noise=b;
    const b2=c.createBuffer(1,n,c.sampleRate),d2=b2.getChannelData(0);let a=0,b0=0,b1=0,b3=0;
    for(let i=0;i<n;i++){const w=Math.random()*2-1;b0=0.99765*b0+w*0.099046;b1=0.963*b1+w*0.2965164;a=0.57*a+w*1.0526;d2[i]=(b0+b1+a+w*0.1848)*0.18;}
    AU.pink=b2;
  }catch(e){AU.ctx=null;}
}
function auResume(){
  if(!AU.ctx)auInit();
  const c=AU.ctx;if(!c)return;
  if(c.state!=='running'&&c.resume)c.resume();
  if(!AU.ambOn&&c.state==='running'){AU.ambOn=true;auAmbient();}
}
['pointerdown','touchend','mousedown','keydown'].forEach(ev=>window.addEventListener(ev,auResume,{passive:true,capture:true}));
function auApply(){if(AU.master)AU.master.gain.setTargetAtTime(AU.muted?0:AU.vol,AU.ctx.currentTime,0.03);try{localStorage.setItem('hf_vol',AU.vol);localStorage.setItem('hf_mute',AU.muted?'1':'0');}catch(e){}}
function auAmbient(){
  const c=AU.ctx;
  const s=c.createBufferSource();s.buffer=AU.pink;s.loop=true;
  const f=c.createBiquadFilter();f.type='bandpass';f.frequency.value=420;f.Q.value=0.5;
  const g=c.createGain();g.gain.value=0.16;
  const lfo=c.createOscillator();lfo.frequency.value=0.11;const lg=c.createGain();lg.gain.value=0.09;lfo.connect(lg);lg.connect(g.gain);
  const lfo2=c.createOscillator();lfo2.frequency.value=0.07;const lg2=c.createGain();lg2.gain.value=160;lfo2.connect(lg2);lg2.connect(f.frequency);
  s.connect(f);f.connect(g);g.connect(AU.amb);s.start();lfo.start();lfo2.start();
}
function auBird(t){
  const c=AU.ctx,o=c.createOscillator(),g=c.createGain();o.type='sine';
  const base=2400+Math.random()*1800,n=2+(Math.random()*4|0);
  g.gain.setValueAtTime(0,t);
  for(let i=0;i<n;i++){const t0=t+i*0.11;o.frequency.setValueAtTime(base*(1+Math.random()*0.2),t0);o.frequency.exponentialRampToValueAtTime(base*(0.7+Math.random()*0.5),t0+0.08);g.gain.setValueAtTime(0.0001,t0);g.gain.linearRampToValueAtTime(0.05,t0+0.015);g.gain.exponentialRampToValueAtTime(0.0001,t0+0.09);}
  o.connect(g);g.connect(AU.amb);o.start(t);o.stop(t+n*0.11+0.1);
}
function auTick(){
  if(!AU.ctx||AU.ctx.state!=='running'||AU.muted)return;
  const t=AU.ctx.currentTime;
  if(t>AU.nextBird){AU.nextBird=t+3+Math.random()*7;if(Math.random()<0.8)auBird(t+0.05);}
}
function voice(dur,pan,vol,prio){
  const c=AU.ctx;if(!c||AU.muted||c.state!=='running')return null;
  if(AU.voices>=AU.cap+(prio?4:0))return null;
  const g=c.createGain();g.gain.value=vol;
  if(c.createStereoPanner&&pan){const p=c.createStereoPanner();p.pan.value=clamp(pan,-1,1);g.connect(p);p.connect(AU.sfx);}else g.connect(AU.sfx);
  AU.voices++;setTimeout(()=>{AU.voices--;try{g.disconnect();}catch(e){}},(dur+0.15)*1000);
  return g;
}
function tone(o,type,f0,f1,dur,vol,delay,cut){
  const c=AU.ctx,t=c.currentTime+(delay||0),os=c.createOscillator(),e=c.createGain();
  os.type=type;os.frequency.setValueAtTime(Math.max(20,f0),t);if(f1!==f0)os.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);
  e.gain.setValueAtTime(0.0001,t);e.gain.linearRampToValueAtTime(vol,t+Math.min(0.006,dur*0.2));e.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  let out=os;if(cut){const f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=cut;os.connect(f);out=f;}
  out.connect(e);e.connect(o);os.start(t);os.stop(t+dur+0.02);
}
function nz(o,dur,type,f0,f1,q,vol,delay,pink){
  const c=AU.ctx,t=c.currentTime+(delay||0),s=c.createBufferSource(),f=c.createBiquadFilter(),e=c.createGain();
  s.buffer=pink?AU.pink:AU.noise;f.type=type;f.Q.value=q;f.frequency.setValueAtTime(Math.max(20,f0),t);if(f1!==f0)f.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);
  e.gain.setValueAtTime(0.0001,t);e.gain.linearRampToValueAtTime(vol,t+Math.min(0.004,dur*0.2));e.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  s.connect(f);f.connect(e);e.connect(o);s.start(t,Math.random()*1.4,dur+0.05);
}
const SND={
  chop:(o,p)=>{nz(o,.07,'bandpass',1100*p,500*p,1.2,.8);tone(o,'sine',190*p,70*p,.12,.9);nz(o,.03,'highpass',3000,3000,.7,.25);},
  mine:(o,p)=>{tone(o,'triangle',2300*p,2100*p,.2,.3);tone(o,'sine',3350*p,3300*p,.15,.18);nz(o,.04,'highpass',4500,4500,.8,.5);tone(o,'square',900*p,300*p,.05,.1);},
  berry:(o,p)=>{nz(o,.12,'bandpass',3400,2600,1.5,.35);tone(o,'sine',520*p,900*p,.07,.15);},
  hammer:(o,p)=>{tone(o,'triangle',320*p,110*p,.1,.8);nz(o,.04,'bandpass',1800,1000,1,.5);tone(o,'sine',1700*p,1500*p,.09,.12,.01);},
  hoe:(o,p)=>{nz(o,.09,'lowpass',900,300,.8,.6);tone(o,'sine',120*p,60*p,.08,.4);},
  sword:(o,p)=>{nz(o,.09,'highpass',2400,5000,.7,.45);tone(o,'triangle',1900*p,1800*p,.24,.2);tone(o,'sine',2790*p,2700*p,.18,.12);tone(o,'sine',140*p,70*p,.1,.55);},
  spear:(o,p)=>{nz(o,.07,'bandpass',900,300,1,.7);tone(o,'sawtooth',320*p,90*p,.08,.16,0,1200);nz(o,.05,'highpass',2500,2500,.8,.2);tone(o,'sine',130*p,60*p,.09,.45);},
  punch:(o,p)=>{tone(o,'sine',160*p,60*p,.09,.6);nz(o,.05,'lowpass',900,300,.8,.5);},
  shoot:(o,p)=>{tone(o,'sine',520*p,140*p,.09,.5);nz(o,.14,'bandpass',900,3200,1.8,.28,.01);tone(o,'triangle',90*p,60*p,.12,.2);},
  ahit:(o,p)=>{tone(o,'sine',240*p,90*p,.07,.5);nz(o,.05,'bandpass',1400,700,1.2,.45);},
  bhit:(o,p)=>{tone(o,'sine',110*p,45*p,.22,.9);nz(o,.14,'lowpass',700,200,.8,.8);nz(o,.05,'bandpass',2200,1200,1,.3);},
  collapse:(o,p)=>{nz(o,1.5,'lowpass',500,70,.7,1.2,0,true);tone(o,'sine',70*p,28*p,1.2,.9);for(let i=0;i<7;i++)nz(o,.12,'bandpass',900+Math.random()*900,300,1,.5,.05+i*.16+Math.random()*.1);},
  death:(o,p)=>{tone(o,'sawtooth',230*p,70*p,.34,.22,0,700);nz(o,.12,'lowpass',500,150,.8,.5,.1);tone(o,'sine',90*p,45*p,.15,.5,.18);},
  train:(o)=>{tone(o,'sine',784,784,.5,.4);tone(o,'sine',1175,1175,.7,.35,.12);tone(o,'sine',2350,2350,.3,.07,.12);},
  done:(o)=>{[523,659,784,1047].forEach((f,i)=>{tone(o,'triangle',f,f,.35,.35,i*.09);tone(o,'sine',f*2,f*2,.2,.08,i*.09);});nz(o,.12,'lowpass',900,200,.8,.35);},
  age:(o)=>{[[196,0,.9],[294,.35,.9],[392,.7,1.5],[523,1.0,1.7]].forEach(n=>{tone(o,'sawtooth',n[0],n[0]*1.01,n[2],.2,n[1],1400);tone(o,'sawtooth',n[0]*1.005,n[0]*0.995,n[2],.14,n[1],1100);tone(o,'sine',n[0]/2,n[0]/2,n[2],.3,n[1]);});},
  alert:(o)=>{for(let i=0;i<2;i++){tone(o,'sawtooth',392,392,.22,.3,i*.5,900);tone(o,'sawtooth',311,311,.26,.3,i*.5+.22,900);}},
  click:(o)=>{tone(o,'sine',1400,900,.04,.3);nz(o,.02,'highpass',4000,4000,.7,.15);},
  err:(o)=>{tone(o,'square',190,140,.14,.15,0,600);},
  place:(o,p)=>{tone(o,'sine',150*p,60*p,.16,.8);nz(o,.08,'bandpass',900,400,1,.6);tone(o,'triangle',420*p,200*p,.07,.3);},
  coin:(o)=>{tone(o,'sine',1568,1568,.09,.25);tone(o,'sine',2093,2093,.16,.25,.055);},
  select:(o)=>{tone(o,'triangle',660,880,.05,.18);}
};
const SMIN={chop:.07,mine:.07,hammer:.08,hoe:.09,berry:.1,sword:.05,spear:.05,punch:.06,shoot:.05,ahit:.04,bhit:.07,collapse:.2,death:.06,click:.04,select:.05,coin:.1,train:.3,done:.3,age:2,alert:1.5,err:.1,place:.1};
const SVOL={chop:.8,mine:.7,hammer:.8,hoe:.5,berry:.5,sword:.8,spear:.8,punch:.5,shoot:.5,ahit:.5,bhit:.8,collapse:1,death:.6,click:.6,select:.4,coin:.5,train:.7,done:.7,age:.8,alert:.8,err:.5,place:.7};
const SPRIO={collapse:1,age:1,alert:1,train:1,done:1,click:1,err:1};
function sfx(name,x,y,vscale){
  if(!AU.ctx||AU.muted||AU.ctx.state!=='running')return;
  const now=AU.ctx.currentTime;if(AU.last[name]&&now-AU.last[name]<(SMIN[name]||.03))return;
  let vol=SVOL[name]||.6,pan=0;
  if(x!==undefined){
    const s=w2s(x,y),dx=(s.x-VW/2)/(VW/2),dy=(s.y-VH/2)/(VH/2),out=Math.max(Math.abs(dx),Math.abs(dy));
    if(out>1.6)return;
    if(out>1)vol*=Math.max(0,1-(out-1)/0.6);
    pan=clamp(dx,-1,1)*0.7;vol*=clamp(cam.z,0.65,1.15);
  }
  const f=SND[name];if(!f)return;
  const o=voice(1.6,pan,vol*(vscale||1),SPRIO[name]);if(!o)return;
  AU.last[name]=now;
  try{f(o,1+(Math.random()-0.5)*0.2);}catch(e){}
}

/* ---------------- particle pool ---------------- */
const PP=[];
for(let i=0;i<700;i++)PP.push({on:false,k:0,x:0,y:0,z:0,vx:0,vy:0,vz:0,life:0,max:1,s:1,s1:1,col:'#fff',a:1,rot:0,vr:0,grav:0,drag:0,add:false,txt:'',bounce:0});
let ppi=0;
const GLOW={};
function glowSpr(col){
  let c=GLOW[col];if(c)return c;
  c=mkc(32,32);const g=c.getContext('2d'),gr=g.createRadialGradient(16,16,0,16,16,16);
  gr.addColorStop(0,col);gr.addColorStop(0.45,col.replace('rgb(','rgba(').replace(')',',0.55)'));gr.addColorStop(1,col.replace('rgb(','rgba(').replace(')',',0)'));
  g.fillStyle=gr;g.fillRect(0,0,32,32);return GLOW[col]=c;
}
function hexRgb(h){const r=rgbOf(h);return 'rgb('+r[0]+','+r[1]+','+r[2]+')';}
function emitP(k,x,y,z,vx,vy,vz,life,s,s1,col,o){
  const lim=FXQ.cur.particles;let p=null;
  for(let t=0;t<24;t++){ppi=(ppi+1)%lim;const q=PP[ppi];if(!q.on){p=q;break;}}
  if(!p){if(k===3)return;p=PP[(ppi=(ppi+1)%lim)];}
  p.on=true;p.k=k;p.x=x;p.y=y;p.z=z;p.vx=vx;p.vy=vy;p.vz=vz;p.life=p.max=life;p.s=s;p.s1=s1;p.col=col;
  p.a=1;p.rot=0;p.vr=0;p.grav=0;p.drag=0;p.add=false;p.txt='';p.bounce=0;
  if(o)for(const key in o)p[key]=o[key];
  return p;
}
const cnt=n=>Math.max(1,Math.round(n*FXQ.cur.pmul));
function inView(x,y,m){return x>cam.x-(m||40)&&x<cam.x+VW/cam.z+(m||40)&&y>cam.y-(m||40)&&y<cam.y+VH/cam.z+(m||40);}
function shown(x,y,team){return inView(x,y)&&(team===0||visPx(x,y,2));}
function fxSparks(x,y,z,n,col,sp,dirx,diry){
  for(let i=0;i<cnt(n);i++){const a=rr01()*6.28,v=sp*(0.4+rr01()*0.8);emitP(1,x,y,z,Math.cos(a)*v+(dirx||0)*sp*0.5,Math.sin(a)*v*0.6+(diry||0)*sp*0.5,40+rr01()*80,0.18+rr01()*0.25,1.1,0.4,col,{add:true,grav:260});}
}
function fxBlood(x,y,z,n,dirx,diry){
  for(let i=0;i<cnt(n);i++){const a=rr01()*6.28,v=20+rr01()*60;emitP(6,x,y,z,Math.cos(a)*v+(dirx||0)*40,Math.sin(a)*v*0.5+(diry||0)*20,30+rr01()*70,0.4+rr01()*0.4,1.1+rr01()*1.2,0.6,i%3?'#a31522':'#6e0e16',{grav:300,bounce:0.1});}
  emitP(0,x,y,z,(dirx||0)*18,(diry||0)*10,6,0.35,4,9,'rgb(150,20,28)',{a:0.55,drag:3});
}
function fxDust(x,y,z,n,col,sz,spread,life){
  col=hexRgb(col||'#b8a47e');
  for(let i=0;i<cnt(n);i++){const a=rr01()*6.28,v=(spread||18)*(0.3+rr01());emitP(0,x+(rr01()-0.5)*6,y+(rr01()-0.5)*4,z,Math.cos(a)*v,Math.sin(a)*v*0.5,8+rr01()*14,(life||0.7)*(0.7+rr01()*0.6),(sz||5)*0.6,(sz||5)*(1.4+rr01()),col,{a:0.5,drag:1.8});}
}
function fxDebris(x,y,z,n,cols,sp){
  for(let i=0;i<cnt(n);i++){const a=rr01()*6.28,v=sp*(0.3+rr01());emitP(2,x,y,z,Math.cos(a)*v,Math.sin(a)*v*0.55,60+rr01()*90,0.7+rr01()*0.6,1.4+rr01()*2.4,1,cols[(rr01()*cols.length)|0],{grav:380,bounce:0.35,rot:rr01()*6,vr:(rr01()-0.5)*18,drag:0.6});}
}
function fxSmoke(x,y,big){emitP(0,x,y,4,6+rr01()*6,-1,16+rr01()*10,big?3.2:2.2,big?7:4,big?20:12,rr01()<0.5?'rgb(88,84,80)':'rgb(60,56,54)',{a:big?0.5:0.4,drag:0.4});}
function fxFire(x,y){emitP(0,x+(rr01()-0.5)*8,y,2,(rr01()-0.5)*6,0,22+rr01()*14,0.5+rr01()*0.3,4,1.5,rr01()<0.5?'rgb(255,150,40)':'rgb(255,210,90)',{add:true,a:0.9,drag:0.5});}
function fxRing(x,y,col,max,life,w){emitP(4,x,y,0,0,0,0,life||0.5,max*0.25,max,col,{a:0.9,rot:w||2});}
function fxStar(x,y,z,col,sz,vz){emitP(5,x,y,z,(rr01()-0.5)*20,(rr01()-0.5)*8,vz===undefined?30+rr01()*30:vz,0.5+rr01()*0.4,sz,0,col,{add:true,grav:-10});}
function fxText(x,y,txt,col){emitP(3,x,y,14,(rr01()-0.5)*8,0,40,0.9,1,1,col,{txt});}
function fxSlash(x,y,z,dir){emitP(7,x,y,z,0,0,0,0.14,10,13,'rgb(255,255,255)',{rot:dir,add:true});}
function fxLeaves(x,y,n,col){for(let i=0;i<cnt(n);i++)emitP(2,x+(rr01()-0.5)*14,y-12-rr01()*8,rr01()*10,(rr01()-0.2)*22,0,8,1+rr01()*0.7,1.2,0.8,col||'#4c9a3c',{grav:30,rot:rr01()*6,vr:(rr01()-0.5)*10,drag:1.2});}

/* ground decals */
const DEC=[];
function addDecal(d){const lim=FXQ.cur.decals;DEC.push(d);if(DEC.length>lim)DEC.shift();}
function fxDrawGround(g){
  for(let i=DEC.length-1;i>=0;i--){
    const d=DEC[i];if(d.life<=0){DEC.splice(i,1);continue;}
    if(!inView(d.x,d.y,60)||(d.team===1&&!visPx(d.x,d.y,1)))continue;
    const a=Math.min(1,d.life/(d.max*0.35));
    if(d.t==='blood'){g.globalAlpha=0.5*a;g.fillStyle='#5a0f14';g.beginPath();g.ellipse(d.x,d.y,d.s,d.s*0.55,d.rot,0,7);g.fill();g.globalAlpha=1;}
    else if(d.t==='scorch'){g.globalAlpha=0.55*a;const gr=g.createRadialGradient(d.x,d.y,0,d.x,d.y,d.s);gr.addColorStop(0,'rgba(10,8,6,.9)');gr.addColorStop(1,'rgba(10,8,6,0)');g.fillStyle=gr;g.fillRect(d.x-d.s,d.y-d.s,d.s*2,d.s*2);g.globalAlpha=1;}
    else if(d.t==='corpse'){
      const k=Math.min(1,d.age/0.38),e=k*k*(3-2*k),sp=unitSpr(d.type,d.team,'idle',0,'','');
      g.save();g.translate(d.x,d.y+3-Math.sin(k*3.14)*3);
      if(d.face<0)g.scale(-1,1);
      if(d.type==='knight'){g.rotate(-0.12*e);g.scale(1,1-1.5*e);}   // horse rolls onto its side: flipped + squashed
      else{g.rotate(1.5*e);g.scale(1,1-0.25*e);}
      g.globalAlpha=0.9*a;g.drawImage(sp.c,-sp.ox,-sp.oy,sp.w,sp.h);g.globalAlpha=0.3*a;g.drawImage(flashOf(sp),-sp.ox,-sp.oy,sp.w,sp.h);g.restore();
      g.globalAlpha=1;
    }
  }
}

/* ---------------- arrows ---------------- */
function drawProjs(g){
  for(const p of projs){
    if(p.dead)continue;
    if(p._t0===undefined)p._t0=FXT;
    if(FXT-p._t0<0.06)continue;
    const dx=p.tx-p.x,dy=p.ty-p.y,a=Math.atan2(dy,dx),tower=p.src&&p.src.kind==='b';
    const dist=Math.hypot(p.tx-p.sx,p.ty-p.sy)||1,tt=clamp(Math.hypot(p.x-p.sx,p.y-p.sy)/dist,0,1),arc=Math.sin(tt*Math.PI)*dist*0.08;
    g.fillStyle='rgba(0,0,0,.22)';g.beginPath();g.ellipse(p.x,p.y+4,3.5,1.2,0,0,7);g.fill();
    g.save();g.translate(p.x,p.y-arc);g.rotate(a+(tt-0.5)*0.25);
    if(tower){g.strokeStyle='#4a3420';g.lineWidth=2.2;g.beginPath();g.moveTo(-9,0);g.lineTo(5,0);g.stroke();g.fillStyle='#d8dde4';g.beginPath();g.moveTo(5,-2.2);g.lineTo(10,0);g.lineTo(5,2.2);g.fill();}
    else{
      g.strokeStyle='#d8c9a0';g.lineWidth=1.3;g.beginPath();g.moveTo(-7,0);g.lineTo(5,0);g.stroke();
      g.fillStyle='#e8ecf0';g.beginPath();g.moveTo(4,-1.6);g.lineTo(8,0);g.lineTo(4,1.6);g.fill();
      g.fillStyle=TEAMC[p.team>=0?p.team:0];g.beginPath();g.moveTo(-7,0);g.lineTo(-9.5,-2);g.lineTo(-5.5,-0.2);g.moveTo(-7,0);g.lineTo(-9.5,2);g.lineTo(-5.5,0.2);g.fill();
    }
    g.restore();
  }
}
function fxDraw(g){
  drawProjs(g);
  const N=Math.min(PP.length,FXQ.cur.particles);
  for(let pass=0;pass<2;pass++){
    if(pass)g.globalCompositeOperation='lighter';
    for(let i=0;i<N;i++){
      const p=PP[i];if(!p.on||p.add!==(pass===1))continue;
      const k=1-p.life/p.max,s=p.s+(p.s1-p.s)*k,y=p.y-p.z;
      switch(p.k){
        case 0:{const gs=glowSpr(p.col);g.globalAlpha=p.a*(1-k)*(k<0.1?k*10:1);g.drawImage(gs,p.x-s,y-s,s*2,s*2);break;}
        case 1:{g.globalAlpha=1-k;g.strokeStyle=p.col;g.lineWidth=s;g.beginPath();g.moveTo(p.x,y);g.lineTo(p.x-p.vx*0.04,y+p.vz*0.04-p.vy*0.04);g.stroke();break;}
        case 2:{g.globalAlpha=Math.min(1,(1-k)*2.2);g.save();g.translate(p.x,y);g.rotate(p.rot);g.fillStyle=p.col;g.fillRect(-s,-s*0.6,s*2,s*1.2);g.restore();break;}
        case 3:{g.globalAlpha=Math.min(1,(1-k)*2);g.font='bold 11px system-ui,sans-serif';g.textAlign='center';g.lineWidth=3;g.strokeStyle='rgba(0,0,0,.75)';g.strokeText(p.txt,p.x,y);g.fillStyle=p.col;g.fillText(p.txt,p.x,y);break;}
        case 4:{g.globalAlpha=p.a*(1-k);g.strokeStyle=p.col;g.lineWidth=p.rot*(1-k)+0.5;g.beginPath();g.ellipse(p.x,p.y,s,s*0.5,0,0,7);g.stroke();break;}
        case 5:{g.globalAlpha=Math.sin(k*Math.PI);g.fillStyle=p.col;const r=p.s;g.beginPath();g.moveTo(p.x-r,y);g.lineTo(p.x,y-0.8);g.lineTo(p.x+r,y);g.lineTo(p.x,y+0.8);g.closePath();g.fill();g.beginPath();g.moveTo(p.x,y-r);g.lineTo(p.x+0.8,y);g.lineTo(p.x,y+r);g.lineTo(p.x-0.8,y);g.closePath();g.fill();break;}
        case 6:{g.globalAlpha=1-k*0.6;g.fillStyle=p.col;g.beginPath();g.arc(p.x,y,s,0,7);g.fill();break;}
        case 7:{g.globalAlpha=(1-k)*0.9;g.strokeStyle=p.col;g.lineWidth=2.2*(1-k)+0.5;g.beginPath();g.arc(p.x,y,s,p.rot-1+k*0.6,p.rot+1+k*0.6);g.stroke();break;}
      }
    }
    if(pass)g.globalCompositeOperation='source-over';
  }
  g.globalAlpha=1;g.textAlign='left';
}
let ageFx=null,alertFx=0,vigT=0;
function fxDrawScreen(g,w,h){
  if(ageFx){
    const k=ageFx.t/ageFx.max,cx=w/2,cy=h/2,R=Math.hypot(w,h)/2;
    g.save();g.globalCompositeOperation='lighter';
    const gr=g.createRadialGradient(cx,cy,R*k*0.6,cx,cy,R*(0.15+k*0.95));gr.addColorStop(0,'rgba(255,210,90,0)');gr.addColorStop(0.75,'rgba(255,200,80,'+(0.34*(1-k))+')');gr.addColorStop(1,'rgba(255,200,80,0)');
    g.fillStyle=gr;g.fillRect(0,0,w,h);
    g.strokeStyle='rgba(255,226,140,'+(0.8*(1-k))+')';g.lineWidth=6*(1-k)+1;g.beginPath();g.arc(cx,cy,R*k*1.05,0,7);g.stroke();
    g.lineWidth=2;g.beginPath();g.arc(cx,cy,R*k*0.8,0,7);g.stroke();
    g.globalCompositeOperation='source-over';
    const v=g.createRadialGradient(cx,cy,R*0.5,cx,cy,R);v.addColorStop(0,'rgba(255,190,60,0)');v.addColorStop(1,'rgba(255,190,60,'+(0.35*Math.sin(k*Math.PI))+')');g.fillStyle=v;g.fillRect(0,0,w,h);
    g.restore();
  }
  if(alertFx>0){const v=g.createRadialGradient(w/2,h/2,Math.min(w,h)*0.35,w/2,h/2,Math.hypot(w,h)/2);v.addColorStop(0,'rgba(255,40,30,0)');v.addColorStop(1,'rgba(255,40,30,'+(0.28*Math.min(1,alertFx))+')');g.fillStyle=v;g.fillRect(0,0,w,h);}
}

/* ---------------- ambient animals (decorative, no logic) ---------------- */
const fxAnimals=[];
const ASPD={deer:30,boar:24,sheep:15};
function fxWalkablePx(x,y){const tx=Math.floor(x/TILE),ty=Math.floor(y/TILE);return tx>1&&ty>1&&tx<MW-2&&ty<MH-2&&!terr[ty*MW+tx]&&!occ[ty*MW+tx]&&(!WF||wfAt(x,y)<0.14);}
function fxSpawnAnimals(){
  fxAnimals.length=0;if(!worldCv)return;
  const want=FXQ.cur.animals,types=['deer','sheep','boar'];let tries=0;
  while(fxAnimals.length<want&&tries++<600){
    const type=types[(rr01()*3)|0],cx=(6+rr01()*(MW-12))*TILE,cy=(6+rr01()*(MH-12))*TILE;
    let near=false;for(const b of BASE)if(Math.hypot(cx/TILE-b.x,cy/TILE-b.y)<13)near=true;
    if(near||!fxWalkablePx(cx,cy))continue;
    const n=Math.min(want-fxAnimals.length,type==='boar'?1+(rr01()*2|0):2+(rr01()*2|0));
    for(let i=0;i<n;i++){const x=cx+(rr01()-0.5)*50,y=cy+(rr01()-0.5)*50;if(!fxWalkablePx(x,y))continue;fxAnimals.push({x,y,type,face:rr01()<0.5?1:-1,tx:x,ty:y,wait:rr01()*4,mode:'wait',anim:rr01()*6,fl:0,flee:0,seed:rr01(),young:rr01()<0.25});}
  }
}
function fxReset(){FXQ.dyn=1;DEC.length=0;for(const p of PP)p.on=false;ageFx=null;fxSpawnAnimals();}
let fleeT=0;
function updAnimals(dt){
  fleeT-=dt;const scan=fleeT<=0;if(scan)fleeT=0.4;
  for(const a of fxAnimals){
    if(scan&&a.flee<=0){for(const u of units){if(u.dead)continue;const dx=a.x-u.x,dy=a.y-u.y;if(dx*dx+dy*dy<3600){const d=Math.hypot(dx,dy)||1,fx=a.x+dx/d*90,fy=a.y+dy/d*90;if(fxWalkablePx(fx,fy)){a.tx=fx;a.ty=fy;a.mode='walk';a.flee=1.4;}break;}}}
    if(a.flee>0)a.flee-=dt;
    if(a.mode==='wait'){a.wait-=dt;a.anim+=dt*0.8;if(a.wait<=0){const ang=rr01()*6.28,d=40+rr01()*90,x=a.x+Math.cos(ang)*d,y=a.y+Math.sin(ang)*d;if(fxWalkablePx(x,y)&&fxWalkablePx((x+a.x)/2,(y+a.y)/2)){a.tx=x;a.ty=y;a.mode='walk';}else a.wait=0.5;}}
    else{
      const dx=a.tx-a.x,dy=a.ty-a.y,d=Math.hypot(dx,dy),sp=ASPD[a.type]*(a.flee>0?3.2:1)*(a.young?0.8:1);
      if(d<3||!fxWalkablePx(a.x+dx/d*6,a.y+dy/d*6)){a.mode='wait';a.wait=2+rr01()*6;a.flee=0;}
      else{a.x+=dx/d*sp*dt;a.y+=dy/d*sp*dt;if(Math.abs(dx)>1)a.face=dx>0?1:-1;a.anim+=dt*sp*0.13;}
    }
  }
}
const ADRAW={
  deer:(g,mode,i)=>{
    const ph=i/4*6.283,w=mode==='walk',gz=mode==='wait';
    g.fillStyle='rgba(0,0,0,.25)';g.beginPath();g.ellipse(0,8,11,2.8,0,0,7);g.fill();
    const leg=(x,off,far)=>{const a=w?Math.sin(ph+off)*0.6:0,k=w?Math.max(0,-Math.sin(ph+off))*0.7:0;const kx=x+Math.sin(a)*4,ky=2+Math.cos(a)*4,fx=kx+Math.sin(a-k)*4,fy=ky+Math.cos(a-k)*4;ln(g,x,2,kx,ky,1.8,far?'#6a4426':'#855a34');ln(g,kx,ky,fx,fy,1.4,far?'#4e301a':'#5f3d20');};
    leg(-6,0,true);leg(6,3.14,true);
    const gr=g.createLinearGradient(0,-5,0,5);gr.addColorStop(0,'#bf8a52');gr.addColorStop(0.7,'#9a6a3a');gr.addColorStop(1,'#d9bc8e');g.fillStyle=gr;g.strokeStyle=OUT;g.lineWidth=0.9;g.beginPath();g.ellipse(0,-1,9.5,4.8,0,0,7);g.fill();g.stroke();
    g.fillStyle='rgba(255,246,220,.7)';[[-5,-3],[-1,-4],[3,-2.6],[-3,0],[1,0.4],[5,-0.4],[-6.5,-0.5]].forEach(p=>{g.beginPath();g.arc(p[0],p[1],0.7,0,7);g.fill();});
    leg(-5,1.6,false);leg(7,4.7,false);
    g.fillStyle='#f4ecd8';g.beginPath();g.arc(-9.4,-3,1.7,0,7);g.fill();
    const hx=gz?13:12,hy=gz?3:-11,bob=w?Math.sin(ph*2)*0.4:0;
    g.fillStyle='#a8754a';g.strokeStyle=OUT;g.beginPath();g.moveTo(5.5,-3.8);g.quadraticCurveTo(9,gz?-4:-10,hx-2,hy-2+bob);g.lineTo(hx+1,hy+2+bob);g.quadraticCurveTo(10,gz?2:-2,7,1);g.closePath();g.fill();g.stroke();
    g.fillStyle='#b88457';g.beginPath();g.ellipse(hx+1.5,hy+bob,3.6,2,gz?0.6:0.5,0,7);g.fill();g.stroke();g.fillStyle='#2a1a10';g.beginPath();g.arc(hx+4,hy+1.6+bob,0.7,0,7);g.arc(hx+0.8,hy-0.6+bob,0.55,0,7);g.fill();
    g.fillStyle='#8a5a34';g.beginPath();g.ellipse(hx-1.5,hy-2.4+bob,1.2,2.2,-0.5,0,7);g.fill();
    if(!gz||true){g.strokeStyle='#d9c8a0';g.lineWidth=1;g.beginPath();g.moveTo(hx-0.5,hy-3+bob);g.lineTo(hx-3,hy-9+bob);g.moveTo(hx-2,hy-6.5+bob);g.lineTo(hx+1,hy-9+bob);g.moveTo(hx-3,hy-9+bob);g.lineTo(hx-5,hy-10.5+bob);g.stroke();}
  },
  boar:(g,mode,i)=>{
    const ph=i/4*6.283,w=mode==='walk';
    g.fillStyle='rgba(0,0,0,.25)';g.beginPath();g.ellipse(0,7,10,2.6,0,0,7);g.fill();
    const leg=(x,off,far)=>{const a=w?Math.sin(ph+off)*0.6:0;ln(g,x,2,x+Math.sin(a)*3.6,2+Math.cos(a)*4.4,2,far?'#2c2018':'#3c2c20');};
    leg(-5.5,0,true);leg(5.5,3.14,true);
    const gr=g.createLinearGradient(0,-6,0,5);gr.addColorStop(0,'#6a5642');gr.addColorStop(1,'#33261b');g.fillStyle=gr;g.strokeStyle=OUT;g.lineWidth=0.9;
    g.beginPath();g.moveTo(-9,0);g.quadraticCurveTo(-8,-7,-1,-6.6);g.quadraticCurveTo(7,-6.8,10,-2);g.lineTo(10,3);g.quadraticCurveTo(0,6,-9,3);g.closePath();g.fill();g.stroke();
    g.strokeStyle='#241a12';g.lineWidth=0.9;for(let x=-7;x<8;x+=2){g.beginPath();g.moveTo(x,-6.2+Math.abs(x)*0.06);g.lineTo(x+0.8,-8.2);g.stroke();}
    leg(-4,1.6,false);leg(7,4.7,false);
    g.fillStyle='#4a392a';g.strokeStyle=OUT;g.lineWidth=0.9;g.beginPath();g.ellipse(11.5,0,4.4,3.4,0.15,0,7);g.fill();g.stroke();g.fillStyle='#8a6a5a';g.beginPath();g.ellipse(15,0.8,1.8,1.5,0,0,7);g.fill();
    g.fillStyle='#f2ead8';g.beginPath();g.moveTo(13.2,2.2);g.lineTo(15.6,3.8);g.lineTo(12.6,3.4);g.fill();g.fillStyle='#14100a';g.beginPath();g.arc(12.2,-1,0.7,0,7);g.fill();g.fillStyle='#33261b';g.beginPath();g.moveTo(8.4,-3);g.lineTo(9.8,-5.4);g.lineTo(11,-2.8);g.fill();
    g.strokeStyle='#33261b';g.lineWidth=1;g.beginPath();g.moveTo(-9,-1);g.quadraticCurveTo(-12,-3,-11,-5);g.stroke();
  },
  sheep:(g,mode,i)=>{
    const ph=i/4*6.283,w=mode==='walk',gz=mode==='wait';
    g.fillStyle='rgba(0,0,0,.25)';g.beginPath();g.ellipse(0,6,8,2.2,0,0,7);g.fill();
    const leg=(x,off)=>{const a=w?Math.sin(ph+off)*0.5:0;ln(g,x,2,x+Math.sin(a)*2.6,2+Math.cos(a)*3.8,1.5,'#3a3026');};
    leg(-4,0);leg(4,3.14);
    const hx=gz?9.2:9,hy=gz?2.4:-3;
    g.fillStyle='#2e2822';g.strokeStyle=OUT;g.lineWidth=0.8;g.beginPath();g.ellipse(hx,hy,2.8,2.3,0,0,7);g.fill();g.stroke();g.fillStyle='#14100a';g.beginPath();g.arc(hx+1.2,hy-0.4,0.5,0,7);g.fill();
    g.fillStyle='#2e2822';g.beginPath();g.ellipse(hx-2.2,hy-1.6,1.8,0.9,-0.4,0,7);g.fill();
    const bl=[[-5,-2,4.5],[0,-3.2,5],[5,-2,4.2],[-3,1,4.2],[2,1.2,4.4],[-7,0,3.2],[6.5,0.4,3]];
    for(const b of bl)blob(g,b[0],b[1],b[2],'#e6e0d0','#fbf8ee','#b8b09c');
    leg(-3,1.6);leg(5,4.7);
  }
};
const ANC={};
function animalSpr(kind,mode,idx){const nk=(mode==='walk'?4:0)+idx;const t=ANC[kind]||(ANC[kind]=[]);return t[nk]||(t[nk]=sprite('an|'+kind+'|'+mode+'|'+idx,54,48,27,34,g=>ADRAW[kind](g,mode,idx),2));}
function drawAnimal(g,a){
  const walk=a.mode==='walk',idx=walk?Math.floor((a.anim%1)*4):Math.floor((a.anim*0.25%1)*2);
  const s=animalSpr(a.type,walk?'walk':'wait',walk?idx:idx),k=a.young?0.7:(a.type==='sheep'?0.95:1);
  g.save();g.translate(a.x,a.y);if(a.face<0)g.scale(-1,1);g.drawImage(s.c,-s.ox*k,-s.oy*k,s.w*k,s.h*k);g.restore();
}

/* ---------------- per-frame update ---------------- */
let dynSlow=0,slowT=0,fpsAcc=0,fpsN=0,slowCount=0;
const LATER=[];
function later(t,fn){LATER.push({t,fn});}
function fxUpdate(dt){
  // particles
  const N=Math.min(PP.length,FXQ.cur.particles);
  for(let i=0;i<N;i++){
    const p=PP[i];if(!p.on)continue;
    p.life-=dt;if(p.life<=0){p.on=false;continue;}
    if(p.drag){const f=Math.max(0,1-p.drag*dt);p.vx*=f;p.vy*=f;}
    p.x+=p.vx*dt;p.y+=p.vy*dt;
    if(p.grav){p.vz-=p.grav*dt;}
    p.z+=p.vz*dt;
    if(p.z<0&&p.k!==0&&p.k!==4){p.z=0;if(p.bounce&&Math.abs(p.vz)>12){p.vz*=-p.bounce;p.vx*=0.5;p.vy*=0.5;p.vr*=0.4;}else{p.vz=0;p.vx*=0.3;p.vy*=0.3;p.vr=0;p.grav=0;}}
    p.rot+=p.vr*dt;
  }
  for(let i=DEC.length-1;i>=0;i--){const d=DEC[i];d.life-=dt;d.age+=dt;}
  for(let i=LATER.length-1;i>=0;i--){const l=LATER[i];l.t-=dt;if(l.t<=0){LATER.splice(i,1);try{l.fn();}catch(e){}}}
  if(ageFx){ageFx.t+=dt;if(ageFx.t>=ageFx.max)ageFx=null;}
  if(alertFx>0)alertFx-=dt*1.6;
  if(fxShake.t>0){fxShake.t-=dt;const m=fxShake.a*Math.max(0,fxShake.t/0.4);fxShake.x=(rr01()-0.5)*2*m;fxShake.y=(rr01()-0.5)*2*m;}else{fxShake.x=fxShake.y=0;}
  if(typeof G==='undefined'||!G)return;
  updAnimals(dt);
  auTick();
  // adaptive quality
  fpsAcc+=dt;fpsN++;
  if(fpsAcc>=1){const avg=fpsAcc/fpsN;fpsAcc=0;fpsN=0;if(FXQ.auto&&avg>0.021&&FXQ.dyn>0.7&&FXQ.level!=='low'||FXQ.auto&&avg>0.021&&FXQ.dyn>0.7){if(++dynSlow>=2){dynSlow=0;FXQ.dyn=Math.max(0.7,FXQ.dyn*0.88);resize();}}else dynSlow=0;
    if(FXQ.auto&&avg>0.03){if(++slowCount>=3){slowCount=0;if(FXQ.level==='high')FXQ.set('medium');else if(FXQ.level==='medium')FXQ.set('low');}}else slowCount=Math.max(0,slowCount-1);}
  animDriven(dt);
  slowT-=dt;if(slowT<=0){slowT=0.14;ambientBuildings();}
}
function animDriven(dt){
  for(let i=0;i<units.length;i++){
    const u=units[i];if(u.dead)continue;
    // melee/ranged swing start edge
    const sw=u.swing||0;
    if(u._sw===undefined)u._sw=0;
    u._sw=sw;
    if(u.type==='villager'&&u.working&&!u.moving&&u.swing<=0){
      const ph=(u.anim/WORKP)%1,pv=u._fp===undefined?ph:u._fp;
      if(pv<0.58&&ph>=0.58&&inView(u.x,u.y)&&(u.team===0||visPx(u.x,u.y,2)))strike(u);
      u._fp=ph;
    }else u._fp=undefined;
    if(u.moving&&u.type==='knight'&&FXQ.cur.smoke){ // hoof dust
      u._hd=(u._hd||0)-dt;if(u._hd<=0){u._hd=0.12;if(inView(u.x,u.y)&&(u.team===0||visPx(u.x,u.y,2)))fxDust(u.x-u.face*8,u.y+7,1,1,'#a89870',3,10,0.5);}
    }
  }
}
function strike(u){
  const o=u.ord,tg=o.tgt,x=u.x+u.face*9,y=u.y;
  if(o.t==='gather'&&tg){
    if(tg.kind==='b'){fxDust(x,y+6,0,2,'#6b4a2a',3,12,0.5);sfx('hoe',x,y);return;}
    if(o.rt==='wood'){tg._shake=0.6;fxDebris(x,y,6,3,['#c9a06a','#a2713e','#e0c090'],50);fxLeaves(tg.x,tg.y,2,'#4c9a3c');sfx('chop',tg.x,tg.y);}
    else if(o.rt==='gold'){fxSparks(x,y-2,6,5,'#ffe08a',80);fxDebris(x,y,6,2,['#8a8880','#f0c040'],40);if(rr01()<0.6)fxStar(x,y-6,8,'#fff2b0',3);sfx('mine',tg.x,tg.y);}
    else{fxLeaves(x,y+8,2,'#5aa040');for(let i=0;i<2;i++)emitP(6,x,y-4,6,(rr01()-0.5)*30,(rr01()-0.5)*10,40,0.5,1.4,1,'#d94a55',{grav:260});sfx('berry',tg.x,tg.y);}
  }else if(o.t==='build'&&tg){
    const bx=clamp(u.x,tg.tx*TILE,(tg.tx+tg.w)*TILE),by=clamp(u.y,tg.ty*TILE,(tg.ty+tg.h)*TILE);
    fxSparks(bx,by,10,3,'#ffe6a0',60);fxDust(bx,by,2,1,'#b8a47e',3,10,0.5);sfx('hammer',bx,by);
  }
}
let chimT=0;
function ambientBuildings(){
  chimT+=0.14;
  for(const b of blds){
    if(b.dead||!inView(b.x,b.y,80))continue;if(b.team===1&&!visPx(b.x,b.y,2))continue;
    const r=b.hp/b.maxhp,w=b.w*TILE,h=b.h*TILE;
    if(!b.done){if(rr01()<0.35&&FXQ.cur.smoke)fxDust(b.x+(rr01()-0.5)*w*0.8,b.y+h*0.4,2,1,'#b8a47e',4,12,0.7);continue;}
    if(r<0.66&&FXQ.cur.smoke){
      if(rr01()<0.8)fxSmoke(b.x+(rr01()-0.5)*w*0.5,b.y-h*0.25,r<0.33);
      if(r<0.4){for(let i=0;i<2;i++)fxFire(b.x+(rr01()-0.5)*w*0.6,b.y-h*0.1+(rr01()-0.5)*h*0.3);}
    }else if(FXQ.cur.smoke&&(b.type==='house'||b.type==='tc')&&rr01()<0.07){
      fxSmoke(b.tx*TILE+(b.type==='house'?48:20),b.ty*TILE+(b.type==='house'?2:30),false);
    }
  }
}

/* ---------------- game events ---------------- */
function unitSnd(t){return t==='knight'?'sword':t==='spear'?'spear':t==='villager'?'punch':'sword';}
let lastImpact=-9;
function impact(x,y,tgt,src,ranged){
  const tb=tgt&&tgt.kind==='b',dirx=src?Math.sign(x-src.x):0,diry=src?Math.sign(y-src.y)*0.5:0;
  if(tb){
    const stone=tgt.type==='tc'||tgt.type==='tower'||tgt.type==='barracks'&&T[tgt.team].age>1;
    fxDust(x+(rr01()-0.5)*tgt.w*10,y,6,2,stone?'#a8a49a':'#b8a47e',4,14,0.6);
    if(stone)fxSparks(x,y,8,3,'#ffe6a0',70);else fxDebris(x,y,8,3,['#a2713e','#c9a06a'],60);
    sfx(ranged?'ahit':'bhit',x,y);return;
  }
  const hy=tgt&&tgt.r?8:6;
  if(ranged){fxBlood(x,y,hy,3,dirx,diry);fxSparks(x,y,hy,2,'#fff2c0',60,dirx,diry);sfx('ahit',x,y);}
  else{fxSlash(x,y,hy,dirx<0?Math.PI:0);fxSparks(x,y,hy,5,'#fff2c0',90,dirx,diry);fxBlood(x,y,hy,3,dirx,diry);sfx(src?unitSnd(src.type):'sword',x,y);}
}
function dmgNumber(t,x,y){
  // logic emits 'hit' before applying damage -> read hp one tick later
  if(!FXX.dmg||FXQ.cur.pmul<0.5||!t||t.kind!=='u')return;
  later(0.04,()=>{
    const prev=t._fxhp!==undefined?t._fxhp:t.maxhp,dmg=prev-t.hp;t._fxhp=t.hp;
    if(dmg>0.4)fxText(t.dead?x:t.x,(t.dead?y:t.y)-12,String(Math.round(dmg)),dmg>=10?'#ffd35a':'#ffffff');
  });
}
function onGameEvent(type,d){
  try{
    if(!d)d={};
    switch(type){
      case 'hit':{
        const t=d.tgt;if(!t)break;
        if(d.ranged){if(FXT-lastImpact<0.04)break;lastImpact=FXT;if(!shown(t.x,t.y,t.team))break;dmgNumber(t,t.x,t.y);impact(t.x,t.y,t,d.src,true);break;}
        if(!shown(t.x,t.y,t.team))break;
        dmgNumber(t,t.x,t.y);
        if(t.kind==='u'&&d.src&&d.src.kind==='u'){const sx=d.src,x=t.x,y=t.y;later(0.09,()=>{if(!t.dead||true)impact(x,y,t,sx,false);});}
        else impact(t.x,t.y,t,d.src,false);
        break;}
      case 'proj_hit':{if(FXT-lastImpact<0.04)break;lastImpact=FXT;if(!shown(d.x,d.y,d.tgt?d.tgt.team:1))break;impact(d.x,d.y,d.tgt,null,true);break;}
      case 'shoot':{const s=d.src;if(!s||!shown(s.x,s.y,s.team))break;later(0.12,()=>{sfx('shoot',s.x,s.y);if(s.kind==='u'){emitP(0,s.x+s.face*10,s.y-6,6,0,0,0,0.12,3,6,'rgb(255,255,255)',{a:0.4,add:true});}});break;}
      case 'death':{
        const e=d.e;if(!e||!shown(e.x,e.y,e.team))break;
        if(e.kind==='u'){
          if(e._fxdead)break;e._fxdead=true;
          addDecal({t:'corpse',x:e.x,y:e.y,type:e.type,team:e.team,face:e.face||1,life:9,max:9,age:0});
          addDecal({t:'blood',x:e.x,y:e.y+3,s:5+rr01()*4,rot:rr01()*3,life:14,max:14,age:0,team:e.team});
          fxBlood(e.x,e.y,6,e.type==='knight'?8:5,0,0);fxDust(e.x,e.y+4,1,3,'#b8a47e',4,16,0.6);
          sfx('death',e.x,e.y);
        }
        break;}
      case 'bld_destroyed':{
        const b=d.b;if(!b||!shown(b.x,b.y,b.team))break;
        const w=b.w*TILE,h=b.h*TILE,wood=b.type==='house'||b.type==='store'||b.type==='farm';
        for(let i=0;i<cnt(14);i++){const a=rr01()*6.28,r=rr01()*w*0.4;emitP(0,b.x+Math.cos(a)*r,b.y+Math.sin(a)*r*0.6,2+rr01()*14,Math.cos(a)*30,Math.sin(a)*14,14+rr01()*26,1.4+rr01()*1.0,w*0.12,w*0.45,'rgb(176,160,130)',{a:0.7,drag:1.2});}
        fxDebris(b.x,b.y,16,22,wood?['#a2713e','#c9a06a','#6b4a2a','#d9c9a0']:['#8a867c','#6b675e','#a8a49a','#c9a06a'],140);
        for(let i=0;i<4;i++)fxSmoke(b.x+(rr01()-0.5)*w*0.6,b.y-h*0.1,true);
        for(let i=0;i<cnt(5);i++)fxFire(b.x+(rr01()-0.5)*w*0.5,b.y+(rr01()-0.5)*h*0.3);
        fxRing(b.x,b.y+h*0.3,'rgb(220,200,160)',w*0.8,0.6,3);
        addDecal({t:'scorch',x:b.x,y:b.y+4,s:w*0.7,life:30,max:30,age:0});
        fxShake.t=0.4;fxShake.a=Math.min(7,w*0.06);sfx('collapse',b.x,b.y);
        break;}
      case 'bld_done':{
        const b=d.b;if(!b||!shown(b.x,b.y,b.team))break;
        fxRing(b.x,b.y+b.h*14,'rgb(255,226,140)',b.w*TILE*0.8,0.7,2.5);
        for(let i=0;i<cnt(8);i++)fxStar(b.tx*TILE+rr01()*b.w*TILE,b.ty*TILE+rr01()*b.h*TILE*0.7,rr01()*20,'#ffe9a0',3+rr01()*2);
        fxDust(b.x,b.y+b.h*12,2,6,'#c9b98a',6,26,0.8);sfx('done',b.x,b.y);
        break;}
      case 'train_done':{
        const u=d.u;if(!u||!shown(u.x,u.y,u.team))break;
        const c=hexRgb(TEAMC[u.team]);
        fxRing(u.x,u.y+6,c,22,0.6,2);emitP(0,u.x,u.y,6,0,0,10,0.5,6,20,c,{add:true,a:0.8});
        for(let i=0;i<cnt(6);i++)fxStar(u.x+(rr01()-0.5)*14,u.y,rr01()*8,'#fff1b0',2.6);
        sfx('train',u.x,u.y);break;}
      case 'drop':{const u=d.u;if(!u||!shown(u.x,u.y,u.team))break;fxStar(u.x,u.y-6,10,'#ffe08a',3,26);sfx('coin',u.x,u.y);break;}
      case 'gather':break;
      case 'age_up':{
        if(d.team===0){ageFx={t:0,max:2.4};sfx('age');}else sfx('age',undefined,undefined,0.35);
        break;}
      case 'alert':{if(d.x!==undefined){fxRing(d.x,d.y+4,'rgb(255,90,70)',50,0.8,3);}alertFx=1;sfx('alert');break;}
      case 'place':{const b=d.b;if(!b)break;fxDust(b.x,b.y+b.h*12,2,8,'#b8a47e',5,24,0.7);fxRing(b.x,b.y+b.h*12,'rgb(220,200,160)',b.w*TILE*0.6,0.4,2);sfx('place',b.x,b.y);break;}
      case 'ui':{const k=d.kind;sfx(k==='error'||k==='err'?'err':k==='select'?'select':'click');break;}
    }
  }catch(e){if(window.console)console.warn('fx',type,e);}
}

/* ---------------- UI injection: mute / volume / damage numbers ---------------- */
(function(){
  try{
    const st=document.createElement('style');
    st.textContent='#fxAudio{display:inline-flex;align-items:center;gap:6px}#fxAudio input{width:64px;accent-color:#e5b447;height:16px;margin:0}#fxAudio svg{width:16px;height:16px;display:block}#bMute{padding:4px 7px}#fxAudio.fl{position:absolute;right:8px;bottom:8px;z-index:5}#fxAudio.fl input,#fxAudio.fl #bDmg{display:none}#fxAudio.fl #bMute{background:rgba(16,22,13,.8);padding:8px 10px}';
    document.head.appendChild(st);
    const box=document.createElement('span');box.id='fxAudio';
    const on='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
    const off='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
    box.innerHTML='<button id="bMute" type="button" aria-label="静音" title="声音开关"></button><input id="vSlider" type="range" min="0" max="100" aria-label="音量"><button id="bDmg" type="button" title="伤害数字开关">伤害数字</button>';
    const top=$('top'),ref=$('bIdle'),stg=$('stage');
    const place=()=>{const narrow=window.innerWidth<=760;if(narrow&&stg&&box.parentNode!==stg){box.classList.add('fl');stg.appendChild(box);}else if(!narrow&&top&&box.parentNode!==top){box.classList.remove('fl');top.insertBefore(box,ref||null);}};
    place();window.addEventListener('resize',place);
    const bm=$('bMute'),sl=$('vSlider'),bd=$('bDmg');
    const sync=()=>{bm.innerHTML=AU.muted||AU.vol===0?off:on;sl.value=Math.round(AU.vol*100);bd.classList.toggle('on',FXX.dmg);};
    bm.onclick=()=>{AU.muted=!AU.muted;if(!AU.muted&&AU.vol===0)AU.vol=0.7;auResume();auApply();sync();};
    sl.oninput=()=>{AU.vol=sl.value/100;if(AU.vol>0)AU.muted=false;auResume();auApply();sync();};
    bd.onclick=()=>{FXX.dmg=!FXX.dmg;try{localStorage.setItem('hf_dmg',FXX.dmg?'1':'0');}catch(e){}sync();};
    sync();
    document.addEventListener('click',e=>{if(e.target&&e.target.closest&&e.target.closest('button')&&!e.target.closest('#fxAudio'))sfx('click');},true);
  }catch(e){}
})();
