/* ================= rendering (procedural art) =================
   Terrain: pre-rendered once (noise grass, details, shore/water). Entities: sprite caches (offscreen canvases, lazily built).
   p7_fx.js provides: FXQ, fxUpdate(dt), fxDrawGround(g), fxDraw(g), fxDrawScreen(g,w,h), fxAnimals, fxReset(), drawAnimal(g,a). */
const cv=$('c'),ctx=cv.getContext('2d'),mmc=$('mm'),mctx=mmc.getContext('2d');
let DPR=1,VW=800,VH=500,worldCv=null,fogCv=null,fogCtx=null,fogImg=null;
let WF=null,waterTiles=[],waterPat=null,FXT=0,_lastDraw=0,miniBase=null,RSC=1;
function hash2(x,y){let h=(x*374761393+y*668265263)|0;h=(h^(h>>>13))*1274126177|0;return((h^(h>>>16))>>>0)/4294967296;}
const mkc=(w,h)=>{const c=document.createElement('canvas');c.width=Math.max(1,Math.ceil(w));c.height=Math.max(1,Math.ceil(h));return c;};
/* ---- colour helpers (only used while generating sprites) ---- */
const _cc={};
function rgbOf(c){let r=_cc[c];if(r)return r;
  if(c[0]==='#'){let h=c.slice(1);if(h.length===3)h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];r=[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
  else{const m=c.match(/\d+/g);r=[+m[0],+m[1],+m[2]];}
  return _cc[c]=r;}
function mixc(a,b,t){const A=rgbOf(a),B=rgbOf(b);return 'rgb('+Math.round(A[0]+(B[0]-A[0])*t)+','+Math.round(A[1]+(B[1]-A[1])*t)+','+Math.round(A[2]+(B[2]-A[2])*t)+')';}
const lit=(c,t)=>mixc(c,'#ffffff',t),drk=(c,t)=>mixc(c,'#000000',t);
/* ---- value noise ---- */
const NZ=(()=>{const p=new Float32Array(65536),r=mulberry32(1234);for(let i=0;i<65536;i++)p[i]=r();return p;})();
function vnoise(x,y){
  const xi=Math.floor(x),yi=Math.floor(y);let xf=x-xi,yf=y-yi;
  xf=xf*xf*(3-2*xf);yf=yf*yf*(3-2*yf);
  const a=NZ[((yi&255)<<8)|(xi&255)],b=NZ[((yi&255)<<8)|((xi+1)&255)],c=NZ[(((yi+1)&255)<<8)|(xi&255)],d=NZ[(((yi+1)&255)<<8)|((xi+1)&255)];
  return a+(b-a)*xf+(c-a)*yf+(a-b-c+d)*xf*yf;
}
function fbm(x,y){return (vnoise(x,y)*0.5+vnoise(x*2.1+5.2,y*2.1+1.3)*0.25+vnoise(x*4.3+9.1,y*4.3+3.7)*0.15+vnoise(x*8.7+2.2,y*8.7+6.1)*0.1);}
const sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const lerp=(a,b,t)=>a+(b-a)*t;

/* ---- water field: tile-grid blur, bilinear sampled so coastlines are organic ---- */
function wfAt(px,py){
  const u=px/TILE-0.5,v=py/TILE-0.5;let x0=Math.floor(u),y0=Math.floor(v);const fx=u-x0,fy=v-y0;
  let x1=x0+1,y1=y0+1;x0=clamp(x0,0,MW-1);x1=clamp(x1,0,MW-1);y0=clamp(y0,0,MH-1);y1=clamp(y1,0,MH-1);
  const a=WF[y0*MW+x0],b=WF[y0*MW+x1],c=WF[y1*MW+x0],d=WF[y1*MW+x1];
  return a+(b-a)*fx+(c-a)*fy+(a-b-c+d)*fx*fy;
}
function buildWater(g,y0,y1){
  const tid=g.createImageData(TILE,TILE),dd=tid.data,tmp=mkc(TILE,TILE),tg=tmp.getContext('2d');
  const r0=Math.max(0,Math.floor(y0/TILE)),r1=Math.min(MH,Math.ceil(y1/TILE));
  for(let ty=r0;ty<r1;ty++)for(let tx=0;tx<MW;tx++){
    let near=false;
    for(let j=-1;j<=1&&!near;j++)for(let i=-1;i<=1;i++){const x=tx+i,y=ty+j;if(x>=0&&y>=0&&x<MW&&y<MH&&terr[y*MW+x]){near=true;break;}}
    if(!near)continue;
    const px0=tx*TILE,py0=ty*TILE;
    if(terr[ty*MW+tx]){
      const L=tx>0&&!terr[ty*MW+tx-1],R=tx<MW-1&&!terr[ty*MW+tx+1],Tt=ty>0&&!terr[(ty-1)*MW+tx],B=ty<MH-1&&!terr[(ty+1)*MW+tx];
      waterTiles.push({x:px0,y:py0,l:L?6:0,t:Tt?6:0,r:R?6:0,b:B?6:0});
    }
    let any=false;
    for(let j=0;j<TILE;j++)for(let i=0;i<TILE;i++){
      const wx=px0+i+0.5,wy=py0+j+0.5,o=(j*TILE+i)*4;
      let f=wfAt(wx,wy);
      f+=(fbm(wx*0.035,wy*0.035)-0.5)*0.26+(vnoise(wx*0.12,wy*0.12)-0.5)*0.05;
      if(f<0.25){dd[o+3]=0;continue;}
      any=true;
      const aW=sstep(0.488,0.512,f);
      const d=clamp((f-0.5)/0.4,0,1),n=fbm(wx*0.02+40,wy*0.02);
      let wr,wg,wb;
      if(d<0.4){const k=d/0.4;wr=lerp(104,46,k);wg=lerp(186,126,k);wb=lerp(192,168,k);}
      else{const k=(d-0.4)/0.6;wr=lerp(46,18,k);wg=lerp(126,66,k);wb=lerp(168,124,k);}
      const sh=0.9+n*0.2;wr*=sh;wg*=sh;wb*=sh*1.02;
      const fo=sstep(0.545,0.505,f)*0.6*(0.6+0.4*vnoise(wx*0.1,wy*0.1));
      wr=lerp(wr,236,fo);wg=lerp(wg,246,fo);wb=lerp(wb,244,fo);
      const aS=sstep(0.27,0.38,f);
      const gn=hash2(wx|0,wy|0)*0.5+fbm(wx*0.05,wy*0.05);
      let sr=lerp(196,222,gn*0.8),sg=lerp(176,204,gn*0.8),sb=lerp(120,150,gn*0.8);
      const wet=sstep(0.38,0.5,f);sr*=1-wet*0.22;sg*=1-wet*0.2;sb*=1-wet*0.12;
      const r=lerp(sr,wr,aW),gg=lerp(sg,wg,aW),b=lerp(sb,wb,aW),a=aW+(1-aW)*aS;
      dd[o]=r;dd[o+1]=gg;dd[o+2]=b;dd[o+3]=a*255;
    }
    if(any){tg.putImageData(tid,0,0);g.drawImage(tmp,px0,py0);}
  }
}
function buildWaterPat(){
  const mk=(f1,f2,ph)=>{
    const c=mkc(256,256),g=c.getContext('2d'),im=g.createImageData(256,256),d=im.data,T2=Math.PI*2/256;
    for(let y=0;y<256;y++)for(let x=0;x<256;x++){
      const h=Math.sin(T2*(x*f1+y*f2)+2*Math.sin(T2*(x*f2-y*f1)+ph)),br=Math.max(0,(h-0.86)/0.14),dk=Math.max(0,(-h-0.9)/0.1);
      const o=(y*256+x)*4;
      if(br>dk){d[o]=235;d[o+1]=250;d[o+2]=255;d[o+3]=br*br*215;}else{d[o]=10;d[o+1]=50;d[o+2]=90;d[o+3]=dk*dk*60;}
    }
    g.putImageData(im,0,0);
    const big=mkc(512,512),bg=big.getContext('2d');
    bg.drawImage(c,0,0);bg.drawImage(c,256,0);bg.drawImage(c,0,256);bg.drawImage(c,256,256);
    return big;
  };
  waterPat=[mk(6,3,0.5),mk(3,7,2.1)];
}
function drawWaterAnim(g,vx0,vy0,vx1,vy1){
  if(!waterTiles.length)return;
  if(!waterPat)buildWaterPat();
  const q=typeof FXQ!=='undefined'?FXQ.cur:null;
  const anim=!q||q.water;
  g.globalAlpha=anim?0.6+0.2*Math.sin(FXT*0.9):0.5;
  const o1x=FXT*10,o1y=FXT*5,o2x=-FXT*7,o2y=FXT*8;
  for(let k=0;k<(anim?2:1);k++){
    const P=waterPat[k],ox=anim?(k?o2x:o1x):0,oy=anim?(k?o2y:o1y):0;
    if(k===1)g.globalAlpha=0.5+0.2*Math.sin(FXT*0.7+2);
    for(let i=0;i<waterTiles.length;i++){
      const w=waterTiles[i];
      if(w.x<vx0-32||w.x>vx1||w.y<vy0-32||w.y>vy1)continue;
      const x=w.x+w.l,y=w.y+w.t,ww=TILE-w.l-w.r,hh=TILE-w.t-w.b;
      let sx=(x+ox)%256;if(sx<0)sx+=256;let sy=(y+oy)%256;if(sy<0)sy+=256;
      g.drawImage(P,sx,sy,ww,hh,x,y,ww,hh);
    }
  }
  g.globalAlpha=1;
}

/* ---- terrain: painted in horizontal bands (bounded temp canvas), stored as CHS-sized chunks; only visible chunks are blitted ---- */
const CHS=512,BAND=1024;
let WCH=null,CHW=0,CHH=0;
function paintBand(g,y0,y1){
  const inB=(y,m)=>y>=y0-m&&y<y1+m;
  // base ground colour at quarter resolution (with a 2-row margin so band seams match)
  const LS=4,LW=WW/LS,LH=WH/LS,ly0=Math.max(0,Math.floor(y0/LS)-2),ly1=Math.min(LH,Math.ceil(y1/LS)+2);
  const low=mkc(LW,ly1-ly0),lg=low.getContext('2d'),im=lg.createImageData(LW,ly1-ly0),d=im.data;
  for(let ly=ly0;ly<ly1;ly++)for(let lx=0;lx<LW;lx++){
    const wx=lx*LS+2,wy=ly*LS+2,o=((ly-ly0)*LW+lx)*4;
    const n1=fbm(wx*0.0022+3.1,wy*0.0022+7.7),n2=fbm(wx*0.011,wy*0.011),n3=vnoise(wx*0.045,wy*0.045);
    const t=clamp((n1-0.3)*2.8,0,1);
    let r,gg,b;
    if(t<0.5){const k=t*2;r=lerp(62,92,k);gg=lerp(114,140,k);b=lerp(42,50,k);}
    else{const k=(t-0.5)*2;r=lerp(92,158,k);gg=lerp(140,148,k);b=lerp(50,76,k);}
    let k=0.84+n2*0.36+(n3-0.5)*0.1;
    const n4=fbm(wx*0.0075+50,wy*0.0075+20),dirt=sstep(0.64,0.76,n4)*(0.7+n3*0.3),gr2=sstep(0.76,0.84,fbm(wx*0.009+90,wy*0.009+5));
    r=lerp(r,128,dirt);gg=lerp(gg,100,dirt);b=lerp(b,64,dirt);
    r=lerp(r,140,gr2*0.8);gg=lerp(gg,136,gr2*0.8);b=lerp(b,124,gr2*0.8);
    // fine moss/lichen speckle in the mid frequencies for a mixed, painterly ground
    const sp=vnoise(wx*0.16,wy*0.16)-0.5;r+=sp*14;gg+=sp*18;b+=sp*8;
    const wf=wfAt(wx,wy);
    if(wf>0.08)k*=1-clamp(wf*0.5,0,0.3);
    d[o]=r*k;d[o+1]=gg*k;d[o+2]=b*k;d[o+3]=255;
  }
  lg.putImageData(im,0,0);
  g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
  g.drawImage(low,0,ly0*LS,WW,(ly1-ly0)*LS);
  // fine grain
  {const gc=mkc(128,128),gg=gc.getContext('2d'),gi=gg.createImageData(128,128),r=mulberry32(5);
   for(let i=0;i<128*128;i++){const v=r(),o=i*4;const l=v>0.5;gi.data[o]=l?255:0;gi.data[o+1]=l?255:0;gi.data[o+2]=l?230:0;gi.data[o+3]=Math.abs(v-0.5)*2*(l?26:34);}
   gg.putImageData(gi,0,0);g.fillStyle=g.createPattern(gc,'repeat');g.fillRect(0,y0,WW,y1-y0);}
  const soft=(x,y,rad,col,a)=>{const gr=g.createRadialGradient(x,y,0,x,y,rad);gr.addColorStop(0,'rgba('+col+','+a+')');gr.addColorStop(0.6,'rgba('+col+','+(a*0.5)+')');gr.addColorStop(1,'rgba('+col+',0)');g.fillStyle=gr;g.fillRect(x-rad,y-rad,rad*2,rad*2);};
  const H=(i,s)=>hash2(i*7+s,s*131+i);
  for(const b of BASE){const cx=(b.x+0.5)*TILE,cy=(b.y+0.5)*TILE;if(inB(cy,180)){soft(cx,cy,120,'120,92,58',0.55);for(let i=0;i<7;i++)soft(cx+(H(i,1)-0.5)*150,cy+(H(i,2)-0.5)*120,34+H(i,3)*30,'112,86,54',0.3);}}
  for(let i=0;i<46;i++){const x=H(i,11)*WW,y=H(i,12)*WH;if(!inB(y,60)||wfAt(x,y)>0.18)continue;soft(x,y,18+H(i,13)*40,H(i,14)<0.5?'128,104,66':'70,100,48',0.22);}
  for(const e of ress){
    if(!inB(e.y,60))continue;
    if(e.type==='tree')soft(e.x+2,e.y+8,24,'12,30,10',0.2);
    else if(e.type==='berry')soft(e.x,e.y+4,18,'70,52,30',0.35);
    else soft(e.x,e.y+6,44,'60,58,52',0.4);
  }
  for(let i=0;i<700;i++){const x=H(i,21)*WW,y=H(i,22)*WH;if(!inB(y,70)||wfAt(x,y)>0.2)continue;const l=H(i,23)<0.5;soft(x,y,16+H(i,24)*46,l?'150,176,80':'20,50,18',l?0.07:0.09);}
  // grass tufts
  const tufts=[['#2f5d27','#3d7030','#5a8a38'],['#4f7a2c','#6f9a3a','#9ab852'],['#8f8a45','#b9a95a','#d6c375']];
  g.lineWidth=1;
  for(let i=0;i<9000;i++){
    const x=H(i,31)*WW,y=H(i,32)*WH;if(!inB(y,12)||wfAt(x,y)>0.2)continue;
    const R=mulberry32(i+7),n=fbm(x*0.012,y*0.012),dry=fbm(x*0.0022+3.1,y*0.0022+7.7)>0.58,pal=tufts[dry?2:(n>0.5?1:0)],nb=2+(R()*3|0),h=3+R()*5;
    for(let k=0;k<nb;k++){
      g.strokeStyle=pal[k%3];g.globalAlpha=0.55+R()*0.3;
      const dx=(k-nb/2)*1.5+(R()-0.5);g.beginPath();g.moveTo(x+dx*0.4,y);g.quadraticCurveTo(x+dx,y-h*0.6,x+dx*1.6,y-h*(0.7+R()*0.4));g.stroke();
    }
  }
  g.globalAlpha=1;
  const fcol=['#f4f0e0','#f2d24b','#e98fb2','#a083d8','#f08a55'];
  for(let i=0;i<150;i++){
    const cx=H(i,41)*WW,cy=H(i,42)*WH;if(!inB(cy,30)||wfAt(cx,cy)>0.2||fbm(cx*0.008+20,cy*0.008)<0.5)continue;
    const R=mulberry32(i*31+3),col=fcol[(R()*fcol.length)|0],n=5+(R()*9|0);
    for(let k=0;k<n;k++){
      const x=cx+(R()-0.5)*40,y=cy+(R()-0.5)*30;if(wfAt(x,y)>0.2)continue;
      g.fillStyle='rgba(30,60,20,.5)';g.fillRect(x-0.4,y,0.8,2.5);
      g.fillStyle=col;g.beginPath();g.arc(x,y,1.3,0,7);g.fill();
      g.fillStyle='rgba(255,255,255,.55)';g.fillRect(x-0.5,y-0.8,1,1);
    }
  }
  for(let i=0;i<110;i++){
    const x=H(i,51)*WW,y=H(i,52)*WH;if(!inB(y,10)||wfAt(x,y)>0.2)continue;
    const s=1.5+H(i,53)*2.5;g.fillStyle='rgba(0,0,0,.2)';g.beginPath();g.ellipse(x+1,y+1.2,s*1.1,s*0.6,0,0,7);g.fill();
    g.fillStyle='#8d8b84';g.beginPath();g.ellipse(x,y,s,s*0.65,0,0,7);g.fill();
    g.fillStyle='rgba(255,255,255,.35)';g.beginPath();g.ellipse(x-s*0.25,y-s*0.2,s*0.5,s*0.25,0,0,7);g.fill();
  }
  // rock outcrops (static decor, only on open ground)
  for(let i=0;i<30;i++){
    const cx=H(i,61)*WW,cy=H(i,62)*WH;if(!inB(cy,40)||wfAt(cx,cy)>0.1||nearBase(cx/TILE,cy/TILE,12))continue;
    let blocked=false;for(const e of ress)if(Math.abs(e.x-cx)<50&&Math.abs(e.y-cy)<50){blocked=true;break;}if(blocked)continue;
    const R=mulberry32(i*53+9),n=3+(R()*3|0);
    for(let k=0;k<n;k++){
      const x=cx+(R()-0.5)*34,y=cy+(R()-0.5)*18,s=5+R()*9;
      g.fillStyle='rgba(0,0,0,.25)';g.beginPath();g.ellipse(x+2,y+s*0.5,s*1.1,s*0.4,0,0,7);g.fill();
      const gr=g.createLinearGradient(x-s,y-s,x+s,y+s*0.6);gr.addColorStop(0,'#aaa79c');gr.addColorStop(1,'#5f5d57');g.fillStyle=gr;g.strokeStyle='rgba(20,18,14,.55)';g.lineWidth=0.8;
      g.beginPath();g.moveTo(x-s,y+s*0.4);g.lineTo(x-s*0.7,y-s*0.5);g.lineTo(x-s*0.1,y-s*0.9);g.lineTo(x+s*0.7,y-s*0.5);g.lineTo(x+s,y+s*0.3);g.lineTo(x+s*0.3,y+s*0.55);g.closePath();g.fill();g.stroke();
      g.fillStyle='rgba(255,255,255,.28)';g.beginPath();g.moveTo(x-s*0.7,y-s*0.5);g.lineTo(x-s*0.1,y-s*0.9);g.lineTo(x+s*0.1,y-s*0.3);g.lineTo(x-s*0.5,y-s*0.1);g.closePath();g.fill();
      g.fillStyle='rgba(110,150,70,.5)';g.beginPath();g.ellipse(x+s*0.2,y+s*0.45,s*0.45,s*0.14,0,0,7);g.fill();
    }
    g.lineWidth=1;
  }
  buildWater(g,y0,y1);
  const gr=g.createRadialGradient(WW/2,WH/2,WW*0.42,WW/2,WH/2,WW*0.78);
  gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,'rgba(4,10,2,.3)');
  g.fillStyle=gr;g.fillRect(0,y0,WW,y1-y0);
}
function buildWorldCanvas(){
  const w0=new Float32Array(MW*MH);for(let i=0;i<MW*MH;i++)w0[i]=terr[i]?1:0;
  WF=new Float32Array(MW*MH);
  const W0=(x,y)=>w0[clamp(y,0,MH-1)*MW+clamp(x,0,MW-1)];
  for(let y=0;y<MH;y++)for(let x=0;x<MW;x++)
    WF[y*MW+x]=(W0(x-1,y-1)+2*W0(x,y-1)+W0(x+1,y-1)+2*W0(x-1,y)+4*W0(x,y)+2*W0(x+1,y)+W0(x-1,y+1)+2*W0(x,y+1)+W0(x+1,y+1))/16;
  waterTiles=[];
  CHW=Math.ceil(WW/CHS);CHH=Math.ceil(WH/CHS);WCH=new Array(CHW*CHH);
  const ow=512,oh=Math.round(512*WH/WW);
  worldCv=mkc(ow,oh);const og=worldCv.getContext('2d');og.imageSmoothingEnabled=true;og.imageSmoothingQuality='high';
  for(let y0=0;y0<WH;y0+=BAND){
    const y1=Math.min(WH,y0+BAND),bc=mkc(WW,y1-y0),bg=bc.getContext('2d');
    bg.translate(0,-y0);paintBand(bg,y0,y1);
    for(let cy=Math.floor(y0/CHS);cy*CHS<y1;cy++)for(let cx=0;cx<CHW;cx++){
      const w=Math.min(CHS,WW-cx*CHS),h=Math.min(CHS,WH-cy*CHS),c=mkc(w,h);
      c.getContext('2d').drawImage(bc,cx*CHS,cy*CHS-y0,w,h,0,0,w,h);WCH[cy*CHW+cx]=c;
    }
    og.drawImage(bc,0,y0*oh/WH,ow,(y1-y0)*oh/WH);
    bc.width=bc.height=1;
  }
  miniBase=null;
  fogCv=mkc(MW,MH);fogCtx=fogCv.getContext('2d');fogImg=fogCtx.createImageData(MW,MH);
  if(typeof fxReset==='function')fxReset();
}
const FA=new Float32Array(MW*MH);
function updFogImg(){
  const d=fogImg.data;
  for(let i=0;i<MW*MH;i++){const v=vis[i];FA[i]=v===2?0:(v===1?112:240);}
  for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){
    const xm=x>0?x-1:x,xp=x<MW-1?x+1:x,ym=y>0?y-1:y,yp=y<MH-1?y+1:y;
    const a=(FA[ym*MW+xm]+2*FA[ym*MW+x]+FA[ym*MW+xp]+2*FA[y*MW+xm]+4*FA[y*MW+x]+2*FA[y*MW+xp]+FA[yp*MW+xm]+2*FA[yp*MW+x]+FA[yp*MW+xp])/16;
    const i=(y*MW+x)*4;d[i]=4;d[i+1]=8;d[i+2]=12;d[i+3]=a;
  }
  fogCtx.putImageData(fogImg,0,0);fogDirty=false;
}

function resize(){
  const st=$('stage'),r=st.getBoundingClientRect();
  DPR=Math.max(0.5,Math.min(window.devicePixelRatio||1,2)*renderScale());
  VW=Math.max(100,r.width);VH=Math.max(100,r.height);
  cv.width=Math.round(VW*DPR);cv.height=Math.round(VH*DPR);
  clampCam();
}
function clampCam(){
  const mz=Math.max(0.5,Math.min(VW/WW,VH/WH));
  cam.z=clamp(cam.z,mz,2.2);
  const vw=VW/cam.z,vh=VH/cam.z;
  cam.x=vw>=WW?(WW-vw)/2:clamp(cam.x,0,WW-vw);
  cam.y=vh>=WH?(WH-vh)/2:clamp(cam.y,0,WH-vh);
}
const s2w=(sx,sy)=>({x:cam.x+sx/cam.z,y:cam.y+sy/cam.z});
const w2s=(x,y)=>({x:(x-cam.x)*cam.z,y:(y-cam.y)*cam.z});
function centerOn(x,y){cam.x=x-VW/cam.z/2;cam.y=y-VH/cam.z/2;clampCam();}

function hpBar(g,x,y,w,hp,max,team){
  const f=clamp(hp/max,0,1);
  g.fillStyle='rgba(8,10,6,.82)';g.fillRect(x-w/2-1,y-1,w+2,5);
  g.fillStyle=f>0.5?'#86c46f':f>0.25?'#e5b447':'#e0594f';g.fillRect(x-w/2,y,w*f,3);
  g.fillStyle='rgba(255,255,255,.28)';g.fillRect(x-w/2,y,w*f,1);
}

/* ================= sprite cache ================= */
const SPR=new Map(),SS=2;
function sprite(key,w,h,ox,oy,draw,ss){
  let s=SPR.get(key);if(s)return s;
  ss=ss||SS;const c=mkc(w*ss,h*ss),g=c.getContext('2d');
  g.scale(ss,ss);g.translate(ox,oy);g.lineJoin='round';g.lineCap='round';
  draw(g);
  s={c,ox,oy,w,h,ss,fl:null};SPR.set(key,s);return s;
}
function flashOf(s){
  if(s.fl)return s.fl;
  const c=mkc(s.c.width,s.c.height),g=c.getContext('2d');
  g.drawImage(s.c,0,0);g.globalCompositeOperation='source-in';g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);
  return s.fl=c;
}
function blit(g,s,x,y,sc){sc=sc||1;g.drawImage(s.c,x-s.ox*sc,y-s.oy*sc,s.w*sc,s.h*sc);}

/* ================= resources ================= */
function blob(g,x,y,r,cm,ch,cs){
  g.fillStyle=cm;g.beginPath();g.arc(x,y,r,0,7);g.fill();
  g.fillStyle=cs;g.beginPath();g.arc(x+r*0.18,y+r*0.22,r*0.78,0,7);g.arc(x-r*0.05,y-r*0.12,r*0.78,0,7,true);g.fill('evenodd');
  g.fillStyle=ch;g.beginPath();g.arc(x-r*0.28,y-r*0.32,r*0.58,0,7);g.fill();
}
const TREEPAL=[['#2e6a2a','#4c9a3c','#1d4a1e'],['#3a7a2e','#6bb04a','#235a22'],['#2c5f3a','#3f8a52','#1a3f28'],['#2a5a38','#4a9560','#173a26'],['#7a8f2e','#c9d56a','#4e6020'],['#c46a1e','#f0a640','#8a3e12']];
const TV=[0,1,0,1,2,3,4,5],TSC=[],BSC=[],GSC=[];
function treeSprite(e,lvl){
  const v=TV[Math.floor(e.seed*977)%8],ci=v*3+lvl;let c=TSC[ci];if(c)return c;const key='t'+v+'_'+lvl;
  return TSC[ci]=sprite(key,52,56,26,48,g=>{
    const R=mulberry32(v*131+7);
    g.fillStyle='rgba(0,0,0,.24)';g.beginPath();g.ellipse(5,2,15,5.5,0,0,7);g.fill();
    const P=TREEPAL[v];
    if(v===2||v===3){ // pine
      g.fillStyle='#4a3220';g.fillRect(-2,-12,4,13);g.fillStyle='#6a4a2c';g.fillRect(-2,-12,1.6,13);
      const tiers=v===2?4:3;
      for(let i=0;i<tiers;i++){
        const by=-6-i*(36/tiers)*0.82,wd=(24-i*(20/tiers))*(v===3?0.9:1),top=by-17;
        g.fillStyle=P[2];g.beginPath();g.moveTo(-wd/2,by);g.lineTo(0,top);g.lineTo(wd/2,by);
        for(let k=4;k>=0;k--)g.lineTo(-wd/2+wd*k/4,by+(k%2?2:0));g.closePath();g.fill();
        g.fillStyle=P[0];g.beginPath();g.moveTo(-wd/2,by);g.lineTo(0,top);g.lineTo(wd*0.05,by);g.closePath();g.fill();
        g.fillStyle=P[1];g.globalAlpha=0.7;g.beginPath();g.moveTo(-wd/2+1,by-1);g.lineTo(-1,top+3);g.lineTo(-wd*0.2,by-2);g.closePath();g.fill();g.globalAlpha=1;
      }
    }else{
      const white=v===4;
      g.fillStyle=white?'#d9d6c8':'#5a3d24';
      g.beginPath();g.moveTo(-5,1);g.quadraticCurveTo(-2,-3,-2.2,-14);g.lineTo(2.2,-14);g.quadraticCurveTo(2,-3,5.5,1);g.closePath();g.fill();
      g.fillStyle=white?'#f2f0e6':'#7a5632';g.fillRect(-2.2,-14,1.8,12);
      if(white){g.fillStyle='#2a2620';for(let i=0;i<4;i++)g.fillRect(-2+R()*2,-12+i*3,2+R()*1.5,0.9);}
      const sz=v===4?0.82:1,bl=v===1?[[0,-24,11],[-9,-18,8.5],[9,-18,8.5],[-5,-30,8],[6,-29,8.5],[0,-17,9]]:[[0,-23,11.5],[-9.5,-17,9],[9.5,-17.5,8.5],[-4,-31,8.5],[6,-29,8],[-1,-16,9.5]];
      for(const b of bl)blob(g,b[0]*sz,b[1]*sz+(1-sz)*-6,b[2]*sz,P[0],P[1],P[2]);
      // leaf specks
      for(let i=0;i<44;i++){
        const a=R()*6.28,rr=Math.sqrt(R())*18*sz,x=Math.cos(a)*rr,y=-23*sz+Math.sin(a)*rr*0.85;
        g.fillStyle=R()<0.5?'rgba(255,255,200,.22)':'rgba(0,25,0,.22)';g.beginPath();g.arc(x,y,0.9+R()*1.1,0,7);g.fill();
      }
    }
  });
}
function berrySprite(e,lvl){
  const v=Math.floor(e.seed*997)%3,ci=v*4+lvl;let c=BSC[ci];if(c)return c;const key='bb'+v+'_'+lvl;
  return BSC[ci]=sprite(key,40,34,20,26,g=>{
    const R=mulberry32(v*17+3);
    g.fillStyle='rgba(0,0,0,.22)';g.beginPath();g.ellipse(2,2,13,4,0,0,7);g.fill();
    const bl=[[-7,-5,7.5],[7,-5,7],[0,-9,8],[0,-2,8.5],[-10,-1,5.5],[10,-1,5.5]];
    for(const b of bl)blob(g,b[0],b[1],b[2],'#3f7c34','#66aa4a','#285a24');
    for(let i=0;i<10;i++){const a=R()*6.28,rr=R()*12;g.fillStyle='rgba(120,200,90,.55)';g.save();g.translate(Math.cos(a)*rr,-6+Math.sin(a)*rr*0.6);g.rotate(R()*3);g.beginPath();g.ellipse(0,0,2.4,1.1,0,0,7);g.fill();g.restore();}
    const n=lvl===3?13:lvl===2?8:4;
    for(let i=0;i<n;i++){
      const a=R()*6.28,rr=2+R()*10,x=Math.cos(a)*rr,y=-5+Math.sin(a)*rr*0.7;
      g.fillStyle='#8a1424';g.beginPath();g.arc(x+0.3,y+0.4,2.2,0,7);g.fill();
      g.fillStyle='#e0364a';g.beginPath();g.arc(x,y,2,0,7);g.fill();
      g.fillStyle='rgba(255,255,255,.7)';g.fillRect(x-0.9,y-1.1,0.9,0.9);
    }
  });
}
function goldSprite(e,lvl){
  let c=GSC[lvl];if(c)return c;
  return GSC[lvl]=sprite('gm'+lvl,84,66,42,46,g=>{
    const R=mulberry32(77);
    g.fillStyle='rgba(0,0,0,.28)';g.beginPath();g.ellipse(4,3,34,9,0,0,7);g.fill();
    const gr=g.createLinearGradient(-26,-30,26,6);gr.addColorStop(0,'#9b9a94');gr.addColorStop(1,'#55534e');
    g.fillStyle=gr;g.strokeStyle='rgba(20,18,14,.7)';g.lineWidth=1;
    g.beginPath();g.moveTo(-30,2);g.lineTo(-26,-14);g.lineTo(-14,-26);g.lineTo(2,-32);g.lineTo(17,-25);g.lineTo(27,-11);g.lineTo(32,2);g.closePath();g.fill();g.stroke();
    g.fillStyle='rgba(255,255,255,.22)';g.beginPath();g.moveTo(-26,-14);g.lineTo(-14,-26);g.lineTo(2,-32);g.lineTo(-2,-14);g.lineTo(-18,-8);g.closePath();g.fill();
    g.fillStyle='rgba(0,0,0,.28)';g.beginPath();g.moveTo(17,-25);g.lineTo(27,-11);g.lineTo(32,2);g.lineTo(12,2);g.lineTo(8,-12);g.closePath();g.fill();
    g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=0.8;g.beginPath();g.moveTo(-14,-26);g.lineTo(-18,-8);g.lineTo(-30,2);g.moveTo(2,-32);g.lineTo(-2,-14);g.lineTo(8,-12);g.lineTo(12,2);g.stroke();
    // cave mouth with timber frame
    g.fillStyle='#17130e';g.beginPath();g.moveTo(-9,3);g.lineTo(-9,-8);g.quadraticCurveTo(0,-17,9,-8);g.lineTo(9,3);g.closePath();g.fill();
    g.strokeStyle='#6b4a26';g.lineWidth=2.4;g.beginPath();g.moveTo(-10,3);g.lineTo(-10,-8);g.quadraticCurveTo(0,-18,10,-8);g.lineTo(10,3);g.stroke();
    g.strokeStyle='#9a6e3a';g.lineWidth=0.9;g.beginPath();g.moveTo(-11,3);g.lineTo(-11,-8);g.stroke();
    // nuggets
    const n=lvl===3?10:lvl===2?7:4,pos=[[-21,-8],[-12,-17],[8,-22],[19,-8],[-22,-1],[22,-1],[-1,-27],[14,-17],[-16,-23],[26,-4]];
    for(let i=0;i<n;i++){
      const p=pos[i],s=3.2+R()*2.2;
      g.fillStyle='#a8741a';g.beginPath();g.moveTo(p[0],p[1]-s);g.lineTo(p[0]+s,p[1]);g.lineTo(p[0],p[1]+s*0.8);g.lineTo(p[0]-s,p[1]);g.closePath();g.fill();
      g.fillStyle='#f3c640';g.beginPath();g.moveTo(p[0],p[1]-s);g.lineTo(p[0]-s,p[1]);g.lineTo(p[0],p[1]+s*0.1);g.lineTo(p[0]+s*0.1,p[1]-s*0.2);g.closePath();g.fill();
      g.fillStyle='#fff3a8';g.fillRect(p[0]-s*0.45,p[1]-s*0.55,s*0.5,s*0.35);
    }
    // ore pile in front
    for(let i=0;i<6;i++){const x=-8+i*3.2+R()*2,y=6+R()*3;g.fillStyle=i%2?'#f0c040':'#7a7870';g.beginPath();g.arc(x,y,2.4+R(),0,7);g.fill();g.fillStyle='rgba(255,255,255,.4)';g.fillRect(x-1,y-1.4,1.2,1);}
  });
}
const GLINT=[[-21,-8],[-12,-17],[8,-22],[19,-8]];
function drawTree(g,e){
  const k=0.7+0.3*(e.amt/e.max),lvl=k>0.9?2:k>0.8?1:0;
  const s=treeSprite(e,lvl),by=e.y+10,x=e.x;
  const q=typeof FXQ!=='undefined'?FXQ.cur:null;
  if(cam.z>=0.75&&(!q||q.sway)){
    const sw=Math.sin(FXT*1.25+e.x*0.017+e.y*0.011)*0.032+Math.sin(FXT*2.9+e.seed*20)*0.008+(e._shake>0?Math.sin(FXT*40)*e._shake*0.35:0);
    g.save();g.translate(x,by);g.transform(1,0,sw,1,0,0);g.drawImage(s.c,-s.ox*k,-s.oy*k,s.w*k,s.h*k);g.restore();
  }else blit(g,s,x,by,k);
}
function drawBerry(g,e){
  const f=e.amt/e.max,lvl=f>0.66?3:f>0.33?2:1,s=berrySprite(e,lvl),k=0.75+0.25*f;
  blit(g,s,e.x,e.y+6,k);
}
function drawGold(g,e){
  const f=e.amt/e.max,lvl=f>0.66?3:f>0.33?2:1,k=0.8+0.2*f,s=goldSprite(e,lvl);
  blit(g,s,e.x,e.y+16,k);
  // animated glints
  const n=lvl===3?4:lvl===2?3:2;
  for(let i=0;i<n;i++){
    const ph=(FXT*0.7+i*0.37+e.seed*5)%2;if(ph>0.45)continue;
    const a=Math.sin(ph/0.45*Math.PI),p=GLINT[i],x=e.x+p[0]*k,y=e.y+16+p[1]*k;
    g.globalAlpha=a;g.fillStyle='#fffbe0';
    g.beginPath();g.moveTo(x-4*a,y);g.lineTo(x,y-0.8);g.lineTo(x+4*a,y);g.lineTo(x,y+0.8);g.closePath();g.fill();
    g.beginPath();g.moveTo(x,y-4*a);g.lineTo(x+0.8,y);g.lineTo(x,y+4*a);g.lineTo(x-0.8,y);g.closePath();g.fill();
    g.globalAlpha=1;
  }
}

/* ================= buildings (cached sprites; origin = footprint top-left) ================= */
function rr(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();}
function castShadow(g,x,y,w,h){g.fillStyle='rgba(0,0,0,.075)';for(let i=4;i>=0;i--){const e=i*1.8;rr(g,x+4-e,y+h*0.3+1-e,w+9+e*2-2,h*0.7+5+e*2,6+e);g.fill();}}
function wallStone(g,x,y,w,h,base,seed,bw,bh){
  bw=bw||9;bh=bh||5;const R=mulberry32(seed);g.save();g.beginPath();g.rect(x,y,w,h);g.clip();
  const gr=g.createLinearGradient(x,y,x,y+h);gr.addColorStop(0,lit(base,.14));gr.addColorStop(1,drk(base,.2));g.fillStyle=gr;g.fillRect(x,y,w,h);
  for(let r=0;r*bh<h+bh;r++){
    const off=(r%2)*bw/2,by=y+r*bh;
    for(let cx=-bw;cx<w+bw;cx+=bw){
      const v=R(),bx=x+cx+off;
      g.fillStyle=v<0.5?'rgba(255,255,255,'+(0.03+0.12*v)+')':'rgba(0,0,0,'+(0.03+0.14*(v-0.5))+')';g.fillRect(bx+0.4,by+0.4,bw-0.8,bh-0.8);
      g.fillStyle='rgba(255,255,255,.12)';g.fillRect(bx+0.4,by+0.4,bw-0.8,0.6);
    }
    g.strokeStyle='rgba(0,0,0,.26)';g.lineWidth=0.6;g.beginPath();g.moveTo(x,by);g.lineTo(x+w,by);g.stroke();
    g.beginPath();for(let cx=-bw;cx<w+bw;cx+=bw){g.moveTo(x+cx+off,by);g.lineTo(x+cx+off,by+bh);}g.stroke();
  }
  g.restore();
}
function wallWood(g,x,y,w,h,base,seed){
  const R=mulberry32(seed);g.save();g.beginPath();g.rect(x,y,w,h);g.clip();
  const pw=4.6;
  for(let px=x,i=0;px<x+w;px+=pw,i++){
    const v=R();g.fillStyle=(i%2?lit(base,0.05):drk(base,0.05));g.fillRect(px,y,pw,h);
    g.fillStyle='rgba(255,230,180,'+(0.05+v*0.1)+')';g.fillRect(px+0.5,y,1.2,h);
    g.fillStyle='rgba(0,0,0,.35)';g.fillRect(px,y,0.7,h);
    if(v>0.55){g.fillStyle='rgba(40,25,10,.4)';g.beginPath();g.ellipse(px+pw/2,y+h*(0.2+R()*0.6),0.9,1.6,0,0,7);g.fill();}
  }
  const gr=g.createLinearGradient(x,y,x,y+h);gr.addColorStop(0,'rgba(0,0,0,.28)');gr.addColorStop(0.3,'rgba(0,0,0,0)');gr.addColorStop(1,'rgba(0,0,0,.2)');g.fillStyle=gr;g.fillRect(x,y,w,h);
  g.restore();
}
function wallPlaster(g,x,y,w,h,base,seed){
  const R=mulberry32(seed);g.save();g.beginPath();g.rect(x,y,w,h);g.clip();
  const gr=g.createLinearGradient(x,y,x,y+h);gr.addColorStop(0,lit(base,.1));gr.addColorStop(1,drk(base,.12));g.fillStyle=gr;g.fillRect(x,y,w,h);
  for(let i=0;i<40;i++){g.fillStyle='rgba(120,100,70,'+(R()*0.1)+')';g.fillRect(x+R()*w,y+R()*h,2+R()*4,1+R()*2);}
  g.fillStyle='#4e3520';g.fillRect(x,y,w,2);g.fillRect(x,y+h-2,w,2);g.fillRect(x,y,2,h);g.fillRect(x+w-2,y,2,h);g.fillRect(x+w/2-1,y,2,h);
  g.strokeStyle='#4e3520';g.lineWidth=1.6;g.beginPath();g.moveTo(x+2,y+h-2);g.lineTo(x+w/2-1,y+2);g.moveTo(x+w-2,y+h-2);g.lineTo(x+w/2+1,y+2);g.stroke();
  g.restore();
}
function roofTrap(g,x0,x1,yE,yR,inset,kind,col,seed){
  const R=mulberry32(seed);g.save();g.beginPath();g.moveTo(x0,yE);g.lineTo(x1,yE);g.lineTo(x1-inset,yR);g.lineTo(x0+inset,yR);g.closePath();
  const gr=g.createLinearGradient(0,yR,0,yE);gr.addColorStop(0,lit(col,.2));gr.addColorStop(1,drk(col,.1));g.fillStyle=gr;g.fill();g.save();g.clip();
  const H=yE-yR;
  if(kind==='tile'||kind==='slate'){
    const rh=kind==='tile'?4.4:4,sw=kind==='tile'?5.4:6;
    for(let r=0;r<H/rh+1;r++){
      const y=yR+r*rh;
      for(let x=x0-6+(r%2)*sw/2;x<x1+6;x+=sw){
        const v=R();g.fillStyle=v<0.5?'rgba(255,255,255,'+(0.04+v*0.2)+')':'rgba(0,0,0,'+(0.03+(v-0.5)*0.28)+')';
        if(kind==='tile'){g.beginPath();g.arc(x+sw/2,y+rh*0.3,sw*0.5,0,Math.PI);g.fill();g.strokeStyle='rgba(0,0,0,.3)';g.lineWidth=0.6;g.stroke();}
        else{g.fillRect(x,y,sw,rh);g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=0.5;g.strokeRect(x,y,sw,rh);}
      }
    }
  }else if(kind==='shingle'){
    for(let r=0;r<H/4+1;r++){const y=yR+r*4;for(let x=x0-6+(r%2)*3.5;x<x1+6;x+=7){const v=R();g.fillStyle=v<0.5?'rgba(255,220,160,'+(0.04+v*0.14)+')':'rgba(0,0,0,'+(0.04+(v-0.5)*0.24)+')';g.fillRect(x,y,7,4);}g.fillStyle='rgba(0,0,0,.32)';g.fillRect(x0,y+3.3,x1-x0,0.8);}
  }else{ // thatch
    for(let i=0;i<(x1-x0)*H/5;i++){
      const x=x0+R()*(x1-x0),y=yR+R()*H,v=R();
      g.strokeStyle=v<0.5?'rgba(255,240,170,'+(0.25+v*0.4)+')':'rgba(70,45,10,'+(0.2+(v-0.5)*0.5)+')';g.lineWidth=0.8;
      g.beginPath();g.moveTo(x,y);g.lineTo(x+(R()-0.5)*1.5,y+3+R()*3);g.stroke();
    }
    g.strokeStyle='rgba(60,40,10,.3)';g.lineWidth=0.8;for(let y=yR+6;y<yE;y+=6.5){g.beginPath();g.moveTo(x0,y);g.lineTo(x1,y);g.stroke();}
  }
  g.restore();
  // eave shadow band + outline
  g.fillStyle='rgba(0,0,0,.3)';g.fillRect(x0,yE-1.8,x1-x0,1.8);
  g.fillStyle='rgba(255,255,255,.16)';g.beginPath();g.moveTo(x0+inset,yR);g.lineTo(x1-inset,yR);g.lineTo(x1-inset,yR+1.4);g.lineTo(x0+inset,yR+1.4);g.fill();
  g.restore();
  g.strokeStyle='rgba(20,14,8,.7)';g.lineWidth=1;g.beginPath();g.moveTo(x0,yE);g.lineTo(x0+inset,yR);g.lineTo(x1-inset,yR);g.lineTo(x1,yE);g.closePath();g.stroke();
}
function doorS(g,x,y,w,h,col,arch){
  g.fillStyle='#120c06';g.beginPath();if(arch){g.moveTo(x-1,y+h);g.lineTo(x-1,y+w*0.5);g.arc(x+w/2,y+w*0.5,w/2+1,Math.PI,0);g.lineTo(x+w+1,y+h);}else g.rect(x-1,y-1,w+2,h+1);g.closePath();g.fill();
  g.fillStyle=col;g.beginPath();if(arch){g.moveTo(x,y+h);g.lineTo(x,y+w*0.5);g.arc(x+w/2,y+w*0.5,w/2,Math.PI,0);g.lineTo(x+w,y+h);}else g.rect(x,y,w,h);g.closePath();g.fill();
  g.fillStyle='rgba(0,0,0,.28)';for(let px=x+w/4;px<x+w-1;px+=w/4)g.fillRect(px,y,0.8,h);
  g.fillStyle='rgba(0,0,0,.25)';g.fillRect(x,y+h*0.25,w,1.2);g.fillRect(x,y+h*0.7,w,1.2);
  g.fillStyle='#d6b24a';g.beginPath();g.arc(x+w*0.78,y+h*0.58,0.9,0,7);g.fill();
}
function windowS(g,x,y,w,h,shut){
  g.fillStyle='#2c1c0e';g.fillRect(x-1.2,y-1.2,w+2.4,h+2.4);
  const gr=g.createLinearGradient(x,y,x+w,y+h);gr.addColorStop(0,'#a9cbdc');gr.addColorStop(1,'#35566e');g.fillStyle=gr;g.fillRect(x,y,w,h);
  g.fillStyle='rgba(255,255,255,.35)';g.fillRect(x+0.5,y+0.5,w*0.35,h*0.4);
  g.fillStyle='#2c1c0e';g.fillRect(x+w/2-0.5,y,1,h);g.fillRect(x,y+h/2-0.5,w,1);
  if(shut){g.fillStyle=shut;g.fillRect(x-w*0.5-1.5,y-1,w*0.5,h+2);g.fillRect(x+w+1.5,y-1,w*0.5,h+2);g.fillStyle='rgba(0,0,0,.25)';g.fillRect(x-w*0.5-1.5,y-1,0.8,h+2);g.fillRect(x+w+1.5,y-1,0.8,h+2);}
}
function crenel(g,x,y,w,n,col){const cw=w/(n*2-1);for(let i=0;i<n;i++){const cx=x+i*cw*2;g.fillStyle=col;g.fillRect(cx,y-4.5,cw,5);g.fillStyle='rgba(255,255,255,.2)';g.fillRect(cx,y-4.5,cw,1);g.fillStyle='rgba(0,0,0,.3)';g.fillRect(cx+cw-0.8,y-4.5,0.8,5);}}
function barrel(g,x,y,r){g.fillStyle='rgba(0,0,0,.25)';g.beginPath();g.ellipse(x+1,y+r*0.9,r*1.1,r*0.4,0,0,7);g.fill();const gr=g.createLinearGradient(x-r,0,x+r,0);gr.addColorStop(0,'#a07240');gr.addColorStop(0.5,'#c79a60');gr.addColorStop(1,'#6a4622');g.fillStyle=gr;rr(g,x-r,y-r*1.1,r*2,r*2,r*0.5);g.fill();g.strokeStyle='#3b3b3b';g.lineWidth=0.9;g.beginPath();g.moveTo(x-r,y-r*0.5);g.lineTo(x+r,y-r*0.5);g.moveTo(x-r,y+r*0.4);g.lineTo(x+r,y+r*0.4);g.stroke();g.fillStyle='#5b3c1c';g.beginPath();g.ellipse(x,y-r*1.1,r*0.85,r*0.32,0,0,7);g.fill();}
function crate(g,x,y,s){g.fillStyle='rgba(0,0,0,.25)';g.fillRect(x+1,y+s-1,s+2,2.5);g.fillStyle='#b58650';g.fillRect(x,y,s,s);g.strokeStyle='#5c3d1c';g.lineWidth=0.9;g.strokeRect(x+0.4,y+0.4,s-0.8,s-0.8);g.beginPath();g.moveTo(x,y);g.lineTo(x+s,y+s);g.moveTo(x+s,y);g.lineTo(x,y+s);g.stroke();g.fillStyle='rgba(255,255,255,.2)';g.fillRect(x+1,y+1,s-2,1);}
function sack(g,x,y,s,col){g.fillStyle='rgba(0,0,0,.22)';g.beginPath();g.ellipse(x+1,y+s*0.55,s*0.7,s*0.25,0,0,7);g.fill();g.fillStyle=col;g.beginPath();g.moveTo(x-s*0.55,y+s*0.45);g.quadraticCurveTo(x-s*0.75,y-s*0.2,x-s*0.2,y-s*0.55);g.lineTo(x+s*0.2,y-s*0.55);g.quadraticCurveTo(x+s*0.75,y-s*0.2,x+s*0.55,y+s*0.45);g.closePath();g.fill();g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=0.7;g.stroke();g.fillStyle='rgba(255,255,255,.3)';g.beginPath();g.ellipse(x-s*0.2,y-s*0.1,s*0.18,s*0.3,0.3,0,7);g.fill();g.fillStyle='#6a4a22';g.fillRect(x-s*0.22,y-s*0.6,s*0.44,1.4);}
function banner(g,x,y,w,h,col){g.fillStyle='#4a3420';g.fillRect(x-1,y-2,w+2,2);g.fillStyle=col;g.beginPath();g.moveTo(x,y);g.lineTo(x+w,y);g.lineTo(x+w,y+h);g.lineTo(x+w/2,y+h-w*0.35);g.lineTo(x,y+h);g.closePath();g.fill();g.strokeStyle='#d9ae45';g.lineWidth=1.1;g.stroke();g.fillStyle='rgba(255,255,255,.22)';g.fillRect(x+1.4,y+1,w*0.25,h-5);g.fillStyle='rgba(255,230,160,.9)';g.beginPath();g.arc(x+w/2,y+h*0.38,w*0.18,0,7);g.fill();}
function torch(g,x,y){g.fillStyle='#4a3420';g.fillRect(x-0.8,y,1.6,7);g.fillStyle='#f4a43a';g.beginPath();g.moveTo(x,y-5);g.quadraticCurveTo(x+3,y-1,x,y+1);g.quadraticCurveTo(x-3,y-1,x,y-5);g.fill();g.fillStyle='#ffe58a';g.beginPath();g.arc(x,y-0.5,1,0,7);g.fill();}

const HEAD={house:32,store:28,farm:6,tc:54,barracks:44,tower:46};
const FLAGP={tc:[[48,-8],[48,-22]],barracks:[[48,-16],[48,-16]],tower:[[32,-24],[32,-24]]};
const BLD_DRAW={};
BLD_DRAW.house=(g,w,h,team,age)=>{
  const tc=TEAMC[team],td=TEAMD[team];castShadow(g,2,24,60,38);
  if(age<2){wallWood(g,8,28,48,26,'#a98a5c',11);wallStone(g,6,52,52,8,'#7d7a72',3,7,4);}
  else{wallPlaster(g,8,28,48,24,'#e6dabb',11);wallStone(g,6,48,52,12,'#8d8a82',3,8,4);}
  doorS(g,26,age<2?41:43,11,17,'#6b4824',true);windowS(g,13,35,8,8,age<2?'#7a5a34':tc);windowS(g,43,35,8,8,age<2?'#7a5a34':tc);
  g.fillStyle='#8d8a82';g.fillRect(43,4,8,22);g.fillStyle='rgba(0,0,0,.3)';g.fillRect(48,4,3,22);g.fillStyle='#5f5c56';g.fillRect(42,2,10,3);
  if(age<2){roofTrap(g,0,64,31,10,13,'thatch','#c9a85c',5);g.fillStyle=tc;g.beginPath();g.moveTo(14,11);g.lineTo(50,11);g.lineTo(52,16);g.lineTo(12,16);g.closePath();g.fill();g.fillStyle='rgba(255,255,255,.25)';g.fillRect(14,11,36,1.5);g.fillStyle=td;g.fillRect(12,15.5,40,1.2);}
  else{roofTrap(g,-1,65,31,9,15,'tile',tc,5);g.fillStyle=drk(tc,.35);g.fillRect(15,8,34,2.4);g.fillStyle='#e8dcc0';g.beginPath();g.arc(32,22,3,0,7);g.fill();g.fillStyle=td;g.beginPath();g.arc(32,22,1.8,0,7);g.fill();}
};
BLD_DRAW.store=(g,w,h,team,age)=>{
  const tc=TEAMC[team],td=TEAMD[team];castShadow(g,2,22,60,40);
  if(age<2){wallWood(g,6,26,52,30,'#8a6a40',21);wallStone(g,5,53,54,7,'#7d7a72',9,7,4);}
  else{wallStone(g,5,26,54,34,'#9a958a',21,9,5);}
  g.fillStyle='#100a05';g.fillRect(16,34,32,24);
  const gr=g.createLinearGradient(0,34,0,58);gr.addColorStop(0,'rgba(0,0,0,.6)');gr.addColorStop(1,'rgba(60,40,20,.2)');g.fillStyle=gr;g.fillRect(16,34,32,24);
  g.fillStyle='#6a4622';g.fillRect(14,32,4,28);g.fillRect(46,32,4,28);g.fillRect(14,31,36,4);
  g.fillStyle='rgba(255,220,160,.25)';g.fillRect(14,32,1.4,28);g.fillRect(46,32,1.4,28);
  crate(g,20,44,10);crate(g,31,48,9);sack(g,42,52,8,'#d8c9a0');
  if(age<2)roofTrap(g,-1,65,28,8,10,'shingle','#8b6a3e',8);else roofTrap(g,-1,65,28,8,12,'tile','#b0623a',8);
  g.fillStyle=tc;g.fillRect(4,24,56,3);g.fillStyle=td;g.fillRect(4,26.2,56,1);
  barrel(g,10,54,5);barrel(g,55,55,5);sack(g,52,57,7,'#c9b98a');if(age>=2){crate(g,0,50,9);sack(g,59,50,6,'#d8c9a0');}
  banner(g,28,30,8,12,tc);
};
BLD_DRAW.farm=(g,w,h,team,age,stage)=>{
  const R=mulberry32(31);
  g.fillStyle='rgba(0,0,0,.18)';rr(g,3,6,62,62,5);g.fill();
  const gr=g.createLinearGradient(0,0,0,64);gr.addColorStop(0,'#7a5632');gr.addColorStop(1,'#5a3c20');g.fillStyle=gr;rr(g,2,2,60,60,4);g.fill();
  for(let i=0;i<5;i++){
    const y=7+i*11.5;g.fillStyle='#3e2814';g.fillRect(5,y+4,54,3);g.fillStyle='rgba(255,220,160,.14)';g.fillRect(5,y,54,3);
    for(let x=7;x<58;x+=3.6){
      const px=x+R()*1.2,hh=stage===0?0:stage===1?3:stage===2?6.5:9;
      if(stage===0){g.fillStyle='rgba(30,18,8,.5)';g.fillRect(px,y+3+R()*2,1,1);continue;}
      g.strokeStyle=stage===3?'#c9b040':'#5f9a38';g.lineWidth=1;g.beginPath();g.moveTo(px,y+5);g.lineTo(px+(R()-0.5)*1.5,y+5-hh);g.stroke();
      if(stage===3){g.fillStyle='#ecd25a';g.beginPath();g.ellipse(px,y+5-hh-1,0.9,2.2,0,0,7);g.fill();}
      else if(stage===2){g.fillStyle='#8bc04c';g.fillRect(px-0.6,y+5-hh-1.5,1.2,2);}
    }
  }
  g.strokeStyle='rgba(0,0,0,.25)';g.lineWidth=1;rr(g,2,2,60,60,4);g.stroke();
  // fence
  for(let i=0;i<=5;i++){const x=1+i*12.4;if(i===2||i===3)continue;g.fillStyle='#4a3420';g.fillRect(x-1,56,2.4,8);g.fillStyle='#8a6a3e';g.fillRect(x-1,56,1,8);}
  g.strokeStyle='#6a4a28';g.lineWidth=1.5;g.beginPath();g.moveTo(1,59);g.lineTo(26,59);g.moveTo(38,59);g.lineTo(63,59);g.stroke();
  for(const c of [[1,1],[63,1],[1,63],[63,63]]){g.fillStyle='#3e2a16';g.fillRect(c[0]-1.5,c[1]-1.5,3.4,3.4);}
  g.strokeStyle='#6a4a28';g.beginPath();g.moveTo(1,1);g.lineTo(63,1);g.moveTo(1,1);g.lineTo(1,60);g.moveTo(63,1);g.lineTo(63,60);g.stroke();
  if(age>=2){ // hay bale
    g.fillStyle='rgba(0,0,0,.25)';g.fillRect(50,2,12,3);g.fillStyle='#d6b95a';rr(g,49,-5,13,9,2.5);g.fill();g.strokeStyle='#8a6e28';g.lineWidth=.8;g.stroke();g.beginPath();g.moveTo(53,-5);g.lineTo(53,4);g.moveTo(58,-5);g.lineTo(58,4);g.stroke();
  }
  // scarecrow
  g.strokeStyle='#5a3d22';g.lineWidth=1.3;g.beginPath();g.moveTo(10,2);g.lineTo(10,-8);g.moveTo(5,-5);g.lineTo(15,-5);g.stroke();g.fillStyle='#c9a45a';g.beginPath();g.arc(10,-10,2.4,0,7);g.fill();g.fillStyle='#8a5a2c';g.fillRect(4,-12.8,12,1.2);g.fillRect(7,-15.5,6,3);
};
BLD_DRAW.barracks=(g,w,h,team,age)=>{
  const tc=TEAMC[team],td=TEAMD[team];castShadow(g,4,34,92,62);
  if(age<2){wallWood(g,6,42,84,44,'#7a5a3a',41);wallStone(g,4,82,88,12,'#6f6c64',5,8,4);}
  else{wallStone(g,6,40,84,54,'#8b8a86',41,10,5);}
  // gate
  if(age<2){doorS(g,36,62,24,32,'#4a3220',false);g.fillStyle='#d8d4c8';g.fillRect(36,60,24,3);}else{doorS(g,36,56,24,38,'#4e3822',true);g.strokeStyle='#2a2a2a';g.lineWidth=1.2;for(let y=64;y<92;y+=7){g.beginPath();g.moveTo(36,y);g.lineTo(60,y);g.stroke();}}
  // banners
  banner(g,13,50,12,24,tc);banner(g,71,50,12,24,tc);
  if(age>=2){torch(g,30,58);torch(g,66,58);}
  if(age<2)roofTrap(g,-2,98,46,14,24,'shingle','#5c4129',9);else roofTrap(g,-2,98,46,12,26,'slate','#5b6a78',9);
  // roof trim in team colour
  g.fillStyle=tc;g.fillRect(-2,42,100,3.4);g.fillStyle='#d9ae45';g.fillRect(-2,44.6,100,1.2);
  // emblem
  g.fillStyle='#e6e0d0';g.beginPath();g.arc(48,28,7,0,7);g.fill();g.strokeStyle=td;g.lineWidth=1.2;g.stroke();g.fillStyle=tc;g.beginPath();g.arc(48,28,5,0,7);g.fill();
  g.strokeStyle='#f4f0e4';g.lineWidth=1.6;g.beginPath();g.moveTo(44,32);g.lineTo(52,24);g.moveTo(52,32);g.lineTo(44,24);g.stroke();
  // pole
  g.fillStyle='#4a3420';g.fillRect(47.2,-16,1.8,30);
  // weapon rack + dummy
  g.fillStyle='#5a3d22';g.fillRect(78,78,1.8,12);g.fillRect(88,78,1.8,12);g.fillRect(77,78,14,1.8);
  g.strokeStyle='#c8c4b8';g.lineWidth=1.1;for(let i=0;i<3;i++){g.beginPath();g.moveTo(80+i*3.5,92);g.lineTo(81+i*3.5,70);g.stroke();g.fillStyle='#e0e3e8';g.beginPath();g.moveTo(80+i*3.5-1,71);g.lineTo(81+i*3.5,67);g.lineTo(82+i*3.5,71);g.fill();}
  g.fillStyle='rgba(0,0,0,.25)';g.beginPath();g.ellipse(13,92,6,2,0,0,7);g.fill();g.fillStyle='#5a3d22';g.fillRect(12,74,2,18);g.fillRect(6,78,14,2);g.fillStyle='#c9ab6a';g.beginPath();g.ellipse(13,72,4,5,0,0,7);g.fill();g.strokeStyle='#6a4a22';g.lineWidth=.7;g.stroke();g.fillStyle=tc;g.fillRect(9.5,76,7,2);
};
BLD_DRAW.tower=(g,w,h,team,age)=>{
  const tc=TEAMC[team],td=TEAMD[team];castShadow(g,10,30,44,34);
  g.save();g.beginPath();g.moveTo(12,60);g.lineTo(17,20);g.lineTo(47,20);g.lineTo(52,60);g.closePath();g.clip();
  wallStone(g,10,18,44,44,'#8a8880',51,8,5);
  const sh=g.createLinearGradient(12,0,52,0);sh.addColorStop(0,'rgba(255,255,255,.14)');sh.addColorStop(0.5,'rgba(0,0,0,0)');sh.addColorStop(1,'rgba(0,0,0,.34)');g.fillStyle=sh;g.fillRect(10,18,44,44);
  g.restore();g.strokeStyle='rgba(20,16,10,.65)';g.lineWidth=1;g.beginPath();g.moveTo(12,60);g.lineTo(17,20);g.moveTo(47,20);g.lineTo(52,60);g.stroke();
  g.fillStyle='#1a140c';rr(g,29,46,6,12,3);g.fill();g.fillStyle='#4a3220';g.fillRect(29,47,6,11);
  g.fillStyle='#14100a';g.fillRect(31,28,2.4,9);g.fillRect(24,34,2.2,7);g.fillRect(38,34,2.2,7);
  // machicolation top
  wallStone(g,6,8,52,14,'#7f7d75',53,8,4);g.fillStyle='rgba(0,0,0,.35)';g.fillRect(6,20,52,2.5);
  g.fillStyle='#14100a';for(let x=12;x<54;x+=10)g.fillRect(x,13,3,5);
  crenel(g,6,8,52,5,'#8f8d85');
  g.fillStyle=tc;g.fillRect(6,21.5,52,2);
  // wooden roof platform & pole
  g.fillStyle='#4a3420';g.fillRect(31.2,-24,1.8,30);
  if(age>=2){g.fillStyle=td;g.fillRect(8,6,48,1.6);}
};
BLD_DRAW.tc=(g,w,h,team,age)=>{
  const tc=TEAMC[team],td=TEAMD[team];castShadow(g,2,32,96,66);
  if(age<2){
    wallWood(g,14,48,68,42,'#8b6a42',61);wallStone(g,12,84,72,10,'#6f6c64',7,8,4);
    // corner watch posts
    for(const px of [4,84]){g.fillStyle='rgba(0,0,0,.2)';g.fillRect(px+1,86,10,3);g.fillStyle='#5a3d22';g.fillRect(px,36,8,56);g.fillStyle='rgba(255,230,180,.16)';g.fillRect(px,36,2,56);g.fillStyle='#6f4f2c';g.fillRect(px-3,32,14,5);for(let i=0;i<4;i++){g.fillStyle='#8a6a3e';g.fillRect(px-3+i*3.6,26,2.4,6);}g.fillStyle='#4a3420';g.fillRect(px-3,31,14,1.5);}
    doorS(g,38,60,20,32,'#4a3220',true);
    roofTrap(g,8,88,52,18,22,'thatch','#b8964e',17);
    g.fillStyle=tc;g.beginPath();g.moveTo(30,19);g.lineTo(66,19);g.lineTo(69,26);g.lineTo(27,26);g.closePath();g.fill();g.fillStyle='rgba(255,255,255,.22)';g.fillRect(30,19,36,1.6);g.fillStyle=td;g.fillRect(27,25,42,1.2);
    // lookout
    g.fillStyle='#6f4f2c';g.fillRect(40,6,16,14);g.fillStyle='#14100a';g.fillRect(43,10,10,5);g.fillStyle='#4a3420';g.fillRect(39,4,18,3);
    g.fillStyle='#4a3420';g.fillRect(47.2,-8,1.8,16);
    // palisade
    for(let x=14;x<84;x+=5){if(x>34&&x<62)continue;g.fillStyle='rgba(0,0,0,.25)';g.fillRect(x+1,92,4,2);g.fillStyle=x%10?'#7a5a34':'#6a4a28';g.beginPath();g.moveTo(x,95);g.lineTo(x,86);g.lineTo(x+2,82);g.lineTo(x+4,86);g.lineTo(x+4,95);g.closePath();g.fill();}
    torch(g,34,70);torch(g,62,70);
  }else{
    wallStone(g,20,50,56,44,'#8d8b83',61,10,5);crenel(g,20,50,56,6,'#9a988f');
    // central keep
    wallStone(g,32,22,32,40,'#938f86',63,9,5);crenel(g,32,22,32,4,'#a09d93');
    windowS(g,38,32,6,10);windowS(g,52,32,6,10);
    g.fillStyle='#14100a';g.beginPath();g.moveTo(42,22);g.lineTo(42,18);g.arc(48,18,6,Math.PI,0);g.lineTo(54,22);g.fill();
    // side towers
    for(const tx of [0,72]){
      wallStone(g,tx,34,24,60,'#8a8880',65+tx,8,5);
      const sh=g.createLinearGradient(tx,0,tx+24,0);sh.addColorStop(0,'rgba(255,255,255,.14)');sh.addColorStop(0.55,'rgba(0,0,0,0)');sh.addColorStop(1,'rgba(0,0,0,.32)');g.fillStyle=sh;g.fillRect(tx,34,24,60);
      g.fillStyle='#14100a';g.fillRect(tx+10.5,46,3,10);g.fillRect(tx+10.5,68,3,10);
      g.fillStyle='rgba(0,0,0,.28)';g.fillRect(tx,34,24,2);
      g.fillStyle='#5f5d57';g.fillRect(tx-2,30,28,6);g.fillStyle='rgba(255,255,255,.2)';g.fillRect(tx-2,30,28,1.4);
      g.fillStyle=td;g.beginPath();g.moveTo(tx-3,31);g.lineTo(tx+12,2);g.lineTo(tx+27,31);g.closePath();g.fill();
      g.fillStyle=tc;g.beginPath();g.moveTo(tx+12,2);g.lineTo(tx+27,31);g.lineTo(tx+12,31);g.closePath();g.fill();
      g.fillStyle='rgba(255,255,255,.2)';g.beginPath();g.moveTo(tx+12,2);g.lineTo(tx+2,28);g.lineTo(tx+6,28);g.closePath();g.fill();
      g.strokeStyle='rgba(20,14,8,.6)';g.lineWidth=1;g.beginPath();g.moveTo(tx-3,31);g.lineTo(tx+12,2);g.lineTo(tx+27,31);g.stroke();
    }
    // gate
    g.fillStyle='#14100a';g.beginPath();g.moveTo(36,94);g.lineTo(36,70);g.arc(48,70,12,Math.PI,0);g.lineTo(60,94);g.fill();
    g.strokeStyle='#3a3a3a';g.lineWidth=1.4;for(let x=39;x<60;x+=5){g.beginPath();g.moveTo(x,60);g.lineTo(x,94);g.stroke();}for(let y=70;y<94;y+=7){g.beginPath();g.moveTo(37,y);g.lineTo(59,y);g.stroke();}
    g.strokeStyle='#8f8c84';g.lineWidth=2;g.beginPath();g.moveTo(35,94);g.lineTo(35,70);g.arc(48,70,13,Math.PI,0);g.lineTo(61,94);g.stroke();
    banner(g,26,56,9,20,tc);banner(g,61,56,9,20,tc);
    g.fillStyle='#4a3420';g.fillRect(47.2,-22,1.8,42);
    torch(g,31,76);torch(g,65,76);
  }
};
const BI={house:0,store:1,farm:2,barracks:3,tower:4,tc:5},BC=[],SCC={},FDC={},DMC={};
function bldSprite(t,team,age,stage){
  const nk=((BI[t]*2+team)*4+(age&3))*4+(stage|0);let c=BC[nk];if(c)return c;
  const d=BDEF[t],w=d.w*TILE,h=d.h*TILE,hd=HEAD[t];
  return BC[nk]=sprite('b|'+t+'|'+team+'|'+age+'|'+(stage|0),w+28,h+hd+14,14,hd,g=>BLD_DRAW[t](g,w,h,team,age,stage|0));
}
/* scaffolding + foundation (shared per size) */
function scaffSprite(t){
  if(SCC[t])return SCC[t];
  const d=BDEF[t],w=d.w*TILE,h=d.h*TILE,hd=HEAD[t];
  return SCC[t]=sprite('sc|'+t,w+28,h+hd+14,14,hd,g=>{
    const ph=Math.max(26,(h+hd)*0.78),R=mulberry32(d.w*7+d.h);
    const pole=(x,y0,hh)=>{g.fillStyle='rgba(0,0,0,.22)';g.fillRect(x+1,y0-1,3,2.5);g.fillStyle='#8a6a40';g.fillRect(x-1.2,y0-hh,2.4,hh);g.fillStyle='rgba(255,230,170,.35)';g.fillRect(x-1.2,y0-hh,0.9,hh);};
    const n=d.w+1;
    for(let i=0;i<n;i++)pole(2+i*(w-4)/(n-1),h-2,ph);
    for(let lv=1;lv<=3;lv++){
      const y=h-2-ph*lv/3.4;g.fillStyle='#6b4a28';g.fillRect(0,y-1,w,2.6);g.fillStyle='rgba(255,230,170,.3)';g.fillRect(0,y-1,w,0.9);
      if(lv<3){g.fillStyle='#9a7648';g.fillRect(-2,y+1.2,w+4,3.2);g.fillStyle='rgba(0,0,0,.3)';g.fillRect(-2,y+4,w+4,1);}
    }
    g.strokeStyle='#7a5a34';g.lineWidth=1.3;
    for(let i=0;i<n-1;i++){const x0=2+i*(w-4)/(n-1),x1=2+(i+1)*(w-4)/(n-1);g.beginPath();g.moveTo(x0,h-2);g.lineTo(x1,h-2-ph*0.6);g.moveTo(x1,h-2);g.lineTo(x0,h-2-ph*0.6);g.stroke();}
    // ladder
    g.strokeStyle='#8a6a40';g.lineWidth=1.4;g.beginPath();g.moveTo(w+3,h);g.lineTo(w-1,h-ph*0.7);g.moveTo(w+8,h);g.lineTo(w+4,h-ph*0.7);g.stroke();g.lineWidth=1;for(let i=1;i<6;i++){const k=i/6;g.beginPath();g.moveTo(w+3+5*0*k+(-4)*k,h-ph*0.7*k);g.lineTo(w+8+(-4)*k,h-ph*0.7*k);g.stroke();}
    // material piles
    for(let i=0;i<3;i++){g.fillStyle='#b58650';g.fillRect(-6+i*2,h-3-i*3,18,3);g.strokeStyle='rgba(0,0,0,.4)';g.lineWidth=0.7;g.strokeRect(-6+i*2,h-3-i*3,18,3);}
  });
}
function foundSprite(t){
  if(FDC[t])return FDC[t];
  const d=BDEF[t],w=d.w*TILE,h=d.h*TILE,hd=HEAD[t];
  return FDC[t]=sprite('fd|'+t,w+28,h+hd+14,14,hd,g=>{
    const R=mulberry32(d.w*3+d.h);
    const gr=g.createLinearGradient(0,0,0,h);gr.addColorStop(0,'#8a6c46');gr.addColorStop(1,'#6a4f30');g.fillStyle=gr;rr(g,1,1,w-2,h-2,5);g.fill();
    for(let i=0;i<w*h/60;i++){g.fillStyle=R()<0.5?'rgba(255,230,170,.12)':'rgba(0,0,0,.14)';g.fillRect(2+R()*(w-5),2+R()*(h-5),2+R()*3,1+R()*2);}
    g.strokeStyle='#5a3d22';g.lineWidth=2;g.setLineDash([5,3]);rr(g,3,3,w-6,h-6,4);g.stroke();g.setLineDash([]);
    for(const p of [[3,3],[w-3,3],[3,h-3],[w-3,h-3]]){g.fillStyle='#6b4a28';g.fillRect(p[0]-1.6,p[1]-5,3.2,8);g.fillStyle='#d8c9a0';g.fillRect(p[0]-1.6,p[1]-5,3.2,1.6);}
    for(let i=0;i<7;i++){const x=6+R()*(w-12),y=6+R()*(h-12);g.fillStyle='#8d8b83';g.beginPath();g.ellipse(x,y,2+R()*2,1.4+R(),0,0,7);g.fill();g.fillStyle='rgba(255,255,255,.3)';g.fillRect(x-1,y-1,1.5,0.8);}
  });
}
function dmgSprite(t){
  if(DMC[t])return DMC[t];
  const d=BDEF[t],w=d.w*TILE,h=d.h*TILE,hd=HEAD[t];
  return DMC[t]=sprite('dm|'+t,w+28,h+hd+14,14,hd,g=>{
    const R=mulberry32(d.w*13+d.h*5+t.length);
    for(let i=0;i<w*h/160;i++){const x=R()*w,y=R()*h*0.9+hd*0.15;g.fillStyle='rgba(20,12,6,'+(0.15+R()*0.25)+')';g.beginPath();g.ellipse(x,y,2+R()*6,1.5+R()*4,0,0,7);g.fill();}
    g.strokeStyle='rgba(15,10,6,.7)';g.lineWidth=1.1;
    for(let i=0;i<w/14;i++){let x=R()*w,y=R()*(h*0.7);g.beginPath();g.moveTo(x,y);for(let k=0;k<4;k++){x+=(R()-0.5)*8;y+=3+R()*5;g.lineTo(x,y);}g.stroke();}
  });
}
function drawBld(g,b){
  const x0=b.tx*TILE,y0=b.ty*TILE,w=b.w*TILE,h=b.h*TILE,t=b.type;
  const age=T[b.team]?T[b.team].age:1,team=b.team<0?0:b.team;
  let stage=0;if(t==='farm')stage=b.done?Math.min(3,Math.ceil(clamp(b.amt/BDEF.farm.food,0,1)*3)):0;
  const s=bldSprite(t,team,age,stage);
  if(!b.done){
    const p=clamp(b.prog,0,1),f=foundSprite(t),sc=scaffSprite(t);
    blit(g,f,x0,y0);
    if(p>0.04){
      const srcH=s.h*p,sy=s.h-srcH;
      g.drawImage(s.c,0,sy*s.ss,s.c.width,srcH*s.ss,x0-s.ox,y0-s.oy+sy,s.w,srcH);
      // raw edge of the freshly raised courses
      g.fillStyle='rgba(255,235,190,.35)';g.fillRect(x0-2,y0-s.oy+sy,w+4,1.2);
    }
    g.globalAlpha=1-sstep(0.86,1,p);blit(g,sc,x0,y0);g.globalAlpha=1;
  }else{
    blit(g,s,x0,y0);
    const r=b.hp/b.maxhp;
    if(r<0.7){g.globalAlpha=clamp((0.7-r)/0.5,0,0.85);blit(g,dmgSprite(t),x0,y0);g.globalAlpha=1;}
    const fp=FLAGP[t];
    if(fp){const P=fp[age>1?1:0];flagCloth(g,x0+P[0]+1,y0+P[1]+1,t==='tower'?13:16,TEAMC[team],TEAMD[team],x0*0.05);}
  }
  if(b.flash>0){g.globalAlpha=clamp(b.flash/0.14,0,1)*0.5;const fl=flashOf(s);g.drawImage(fl,x0-s.ox,y0-s.oy,s.w,s.h);g.globalAlpha=1;}
  if(!b.done||b.hp<b.maxhp)hpBar(g,b.x,y0-6-(t==='tc'?10:t==='farm'?0:4),Math.min(w,56),b.hp,b.maxhp);
  if(!b.done){g.fillStyle='rgba(8,10,6,.8)';g.fillRect(b.x-22,y0+h/2-3,44,6);g.fillStyle='#e5b447';g.fillRect(b.x-21,y0+h/2-2,42*b.prog,4);g.fillStyle='rgba(255,255,255,.35)';g.fillRect(b.x-21,y0+h/2-2,42*b.prog,1.4);}
}
function flagCloth(g,x,y,len,col,dark,ph){
  const t=FXT*5+ph;
  g.fillStyle=col;g.beginPath();g.moveTo(x,y);
  const n=5;for(let i=1;i<=n;i++)g.lineTo(x+len*i/n,y+Math.sin(t-i*0.9)*i*0.55+i*0.3);
  for(let i=n;i>=1;i--)g.lineTo(x+len*i/n*0.96,y+8-i*0.2+Math.sin(t-i*0.9)*i*0.55);
  g.lineTo(x,y+9);g.closePath();g.fill();
  g.fillStyle=dark;g.globalAlpha=0.5;g.fillRect(x,y+8,len*0.6,1.4);g.globalAlpha=1;
  g.strokeStyle='rgba(0,0,0,.4)';g.lineWidth=0.6;g.stroke();
}

/* ================= units (cached pose sprites; facing +x, flipped at draw time) ================= */
const SKIN='#e8c39a',SKIND='#c99a70',OUT='rgba(18,12,6,.78)';
function ln(g,x1,y1,x2,y2,w,col){g.strokeStyle=OUT;g.lineWidth=w+1.1;g.beginPath();g.moveTo(x1,y1);g.lineTo(x2,y2);g.stroke();g.strokeStyle=col;g.lineWidth=w;g.beginPath();g.moveTo(x1,y1);g.lineTo(x2,y2);g.stroke();}
function limb(g,sx,sy,ang,len,w,col){const ex=sx+Math.sin(ang)*len,ey=sy+Math.cos(ang)*len;ln(g,sx,sy,ex,ey,w,col);return [ex,ey];}
function dot(g,x,y,r,col,stroke){g.fillStyle=col;g.beginPath();g.arc(x,y,r,0,7);g.fill();if(stroke){g.strokeStyle=OUT;g.lineWidth=0.8;g.stroke();}}
function shadowE(g,x,y,rx,ry){g.fillStyle='rgba(0,0,0,.3)';g.beginPath();g.ellipse(x,y,rx,ry,0,0,7);g.fill();g.fillStyle='rgba(0,0,0,.12)';g.beginPath();g.ellipse(x,y,rx*1.3,ry*1.35,0,0,7);g.fill();}
function foot(g,x,y,col){g.fillStyle=col;g.beginPath();g.ellipse(x+0.9,y+0.2,2,1.2,0,0,7);g.fill();}
function swingAng(p){ // chop/dig: wind up behind, slam forward, recover
  if(p<0.5){const k=p/0.5;return lerp(0.35,-2.5,k*k*(3-2*k));}
  if(p<0.62)return lerp(-2.5,1.0,(p-0.5)/0.12);
  return lerp(1.0,0.35,(p-0.62)/0.38);
}
function toolDraw(g,x,y,ang,tool){
  g.save();g.translate(x,y);g.rotate(-ang);
  if(tool==='axe'){ln(g,0,-2,0,9.5,1.5,'#8a6238');g.fillStyle='#cfd4da';g.strokeStyle=OUT;g.lineWidth=0.8;g.beginPath();g.moveTo(-0.6,6.4);g.lineTo(4.6,5.2);g.lineTo(5.2,10.4);g.lineTo(-0.6,9.4);g.closePath();g.fill();g.stroke();g.fillStyle='#fff';g.fillRect(4.1,5.9,0.8,3.8);}
  else if(tool==='pick'){ln(g,0,-2,0,10,1.5,'#8a6238');g.strokeStyle=OUT;g.lineWidth=2.8;g.beginPath();g.moveTo(-5.4,9.6);g.quadraticCurveTo(0,6.4,5.4,9.6);g.stroke();g.strokeStyle='#b6bcc4';g.lineWidth=1.7;g.beginPath();g.moveTo(-5.4,9.6);g.quadraticCurveTo(0,6.4,5.4,9.6);g.stroke();}
  else if(tool==='hoe'){ln(g,0,-2,0,10.5,1.5,'#8a6238');g.fillStyle='#9ea3aa';g.strokeStyle=OUT;g.lineWidth=0.8;g.beginPath();g.moveTo(-0.7,9);g.lineTo(5,10.6);g.lineTo(4.6,12.2);g.lineTo(-0.7,11);g.closePath();g.fill();g.stroke();}
  else{ln(g,0,-2,0,8.5,1.5,'#8a6238');g.fillStyle='#6f737a';g.strokeStyle=OUT;g.lineWidth=0.8;g.fillRect(-2.9,7.2,5.8,3.6);g.strokeRect(-2.9,7.2,5.8,3.6);g.fillStyle='rgba(255,255,255,.4)';g.fillRect(-2.5,7.5,5,1);}
  g.restore();
}
function carryBag(g,x,y,carry){
  if(!carry)return;
  if(carry==='wood'){for(let i=0;i<3;i++)ln(g,x-3.5+i*0.4,y-3+i*2.4,x+2.2+i*0.4,y-6.5+i*2.6,1.9,i%2?'#8a5e32':'#a2713e');g.fillStyle='#d8b27a';g.beginPath();g.arc(x+2.2,y-6.4,0.8,0,7);g.fill();}
  else if(carry==='gold'){g.fillStyle='#6a4a22';rr(g,x-3.2,y-4.5,6.4,6.5,2);g.fill();g.strokeStyle=OUT;g.lineWidth=0.7;g.stroke();dot(g,x-0.5,y-1.5,1.6,'#f2c53f');dot(g,x+1.2,y-3,1.2,'#ffe27a');}
  else{g.fillStyle='#d8c08a';g.beginPath();g.moveTo(x-3,y+2);g.quadraticCurveTo(x-4.4,y-3,x-1.5,y-5);g.lineTo(x+1.5,y-5);g.quadraticCurveTo(x+4.4,y-3,x+3,y+2);g.closePath();g.fill();g.strokeStyle=OUT;g.lineWidth=0.7;g.stroke();dot(g,x,y-2,1.3,'#d94a55');dot(g,x-1.4,y-0.5,1,'#d94a55');}
}
const FIG={};
FIG.villager=(g,team,mode,p,tool,carry)=>{
  const tc=TEAMC[team],td=TEAMD[team],ph=p*6.2832;
  let la=0,bob=0,ra=0.2,lA=-0.15,lean=0;
  if(mode==='walk'){la=Math.sin(ph)*0.62;bob=-Math.abs(Math.cos(ph))*0.9;ra=-Math.sin(ph)*0.5;lA=Math.sin(ph)*0.5;}
  else if(mode==='work'){
    bob=tool==='berry'?Math.sin(ph)*0.5:0;
    if(tool==='berry'){ra=0.9+Math.sin(ph)*0.5;lA=0.5;lean=0.6;}
    else{ra=swingAng(p);lA=0.9;lean=p>0.5&&p<0.7?1.2:0;}
  }else if(mode==='atk'){ra=lerp(-1.6,1.0,Math.min(1,p*2));lA=0.3;tool='axe';lean=p>0.3?1:0;}
  const hy=-1+bob;
  shadowE(g,0,6.6,6.8,2.4);
  carryBag(g,-5.4,-5.5+bob,carry);
  limb(g,-0.4,hy,-la,6.8,2.3,'#4e3c28');foot(g,Math.sin(-la)*6.8,hy+Math.cos(la)*6.8,'#2e2012');
  limb(g,0.8,hy,la,6.8,2.4,'#6a5238');foot(g,0.8+Math.sin(la)*6.8,hy+Math.cos(la)*6.8,'#3a2a18');
  // back arm
  const sx=0.2+lean*0.3,sy=-8.4+bob;
  if(tool==='berry'&&mode==='work'){const h=limb(g,sx,sy,lA,5.6,2,td);dot(g,h[0],h[1],1.4,SKIND);
    g.fillStyle='#b8863f';g.beginPath();g.moveTo(h[0]-3,h[1]-1);g.lineTo(h[0]+3,h[1]-1);g.lineTo(h[0]+2,h[1]+3);g.lineTo(h[0]-2,h[1]+3);g.closePath();g.fill();g.strokeStyle=OUT;g.lineWidth=0.7;g.stroke();dot(g,h[0]-0.8,h[1]-1.4,1,'#d94a55');dot(g,h[0]+1,h[1]-1.5,1,'#d94a55');}
  else{const h=limb(g,sx,sy,lA,5.8,2,td);dot(g,h[0],h[1],1.4,SKIND);}
  // torso
  const gr=g.createLinearGradient(-4,0,4,0);gr.addColorStop(0,lit(tc,.12));gr.addColorStop(1,drk(tc,.25));
  g.fillStyle=gr;g.strokeStyle=OUT;g.lineWidth=0.9;
  g.beginPath();g.moveTo(-3.8+lean*0.2,-9.6+bob);g.lineTo(3.8+lean*0.5,-9.6+bob);g.lineTo(4.2,0.6+bob);g.lineTo(-4.2,0.6+bob);g.closePath();g.fill();g.stroke();
  g.fillStyle='#4a3420';g.fillRect(-4.2,-2.4+bob,8.4,1.6);g.fillStyle='#d6b24a';g.fillRect(-0.5,-2.5+bob,1.6,1.8);g.fillRect(2.4,-9.4+bob,0.8,9);
  g.fillStyle='rgba(255,255,255,.25)';g.fillRect(-3.4,-9+bob,2,6);
  // head
  const hx=0.8+lean*0.7,hyy=-13.4+bob;
  dot(g,hx,hyy,3.5,SKIN,true);
  g.fillStyle='#6a4a2a';g.beginPath();g.arc(hx-0.6,hyy-0.6,3.6,Math.PI*0.55,Math.PI*1.55);g.fill();
  g.fillStyle='#cfae62';g.strokeStyle=OUT;g.lineWidth=0.8;g.beginPath();g.ellipse(hx,hyy-2.2,5.6,1.7,0,0,7);g.fill();g.stroke();
  g.beginPath();g.arc(hx,hyy-2.6,3.1,Math.PI,0);g.fill();g.stroke();g.fillStyle=tc;g.fillRect(hx-3,hyy-3,6,1.1);
  g.fillStyle='#2a1a10';g.fillRect(hx+1.5,hyy-0.2,0.9,1.1);
  // front arm + tool
  const h=limb(g,sx+0.4,sy,ra,5.8,2.2,lit(tc,.1));dot(g,h[0],h[1],1.5,SKIN);
  if(mode==='work'&&tool!=='berry'||mode==='atk')toolDraw(g,h[0],h[1],ra,tool);
  else if(mode==='work'&&tool==='berry'){/* picking */}
};
FIG.spear=(g,team,mode,p,tool,carry)=>{
  const tc=TEAMC[team],td=TEAMD[team],ph=p*6.2832;
  let la=0,bob=0,th=0,lean=0,ra=0.3;
  if(mode==='walk'){la=Math.sin(ph)*0.6;bob=-Math.abs(Math.cos(ph))*0.9;ra=0.3+Math.sin(ph)*0.2;}
  else if(mode==='atk'){const k=Math.sin(Math.min(1,p)*Math.PI);th=lerp(-3,10,k);lean=k*1.8;ra=0.5+k*0.9;}
  const hy=-1+bob;
  shadowE(g,0,6.8,7.6,2.6);
  limb(g,-0.4,hy,-la,6.8,2.6,'#5c6572');foot(g,Math.sin(-la)*6.8,hy+Math.cos(la)*6.8,'#2a2a30');
  limb(g,0.8,hy,la,6.8,2.7,'#7b8592');foot(g,0.8+Math.sin(la)*6.8,hy+Math.cos(la)*6.8,'#33333a');
  // spear (behind torso, held low-forward)
  const bx=-2+th,by=-1.5+bob+lean*0.2;
  ln(g,bx-4,by+3.5,bx+16,by-6.5,1.5,'#9a7444');
  g.fillStyle='#e0e4ea';g.strokeStyle=OUT;g.lineWidth=0.8;g.beginPath();g.moveTo(bx+15,by-9);g.lineTo(bx+21,by-7);g.lineTo(bx+15.5,by-4.4);g.closePath();g.fill();g.stroke();
  g.fillStyle=tc;g.beginPath();g.moveTo(bx+13,by-7.2);g.lineTo(bx+9,by-9);g.lineTo(bx+10,by-5.4);g.closePath();g.fill();
  const sx=0.4+lean*0.3,sy=-8.6+bob;
  const h0=limb(g,sx,sy,1.2+lean*0.1,5.4,2.2,'#6a7480');dot(g,h0[0],h0[1],1.4,SKIND);
  // torso: mail + surcoat
  const gr=g.createLinearGradient(-4.5,0,4.5,0);gr.addColorStop(0,drk(tc,.2));gr.addColorStop(1,drk(tc,.5));
  g.fillStyle='#8a929c';g.strokeStyle=OUT;g.lineWidth=0.9;g.beginPath();g.moveTo(-4.4+lean*0.2,-10+bob);g.lineTo(4.4+lean*0.5,-10+bob);g.lineTo(4.8,1+bob);g.lineTo(-4.8,1+bob);g.closePath();g.fill();g.stroke();
  g.fillStyle=gr;g.beginPath();g.moveTo(-3.2,-10+bob);g.lineTo(3.2+lean*0.4,-10+bob);g.lineTo(3.9,1+bob);g.lineTo(-3.9,1+bob);g.closePath();g.fill();
  g.fillStyle='#3a2a1a';g.fillRect(-4.4,-2.6+bob,8.8,1.5);g.fillStyle='#e6e0d0';g.fillRect(-3.2,-9.6+bob,1.3,8.6);g.fillStyle='#d9ae45';g.fillRect(1.6,-9.6+bob,0.9,10.4);g.fillRect(-3.9,0+bob,7.8,0.9);g.fillRect(-0.5,-2.7+bob,1.6,1.7);
  g.fillStyle='#aab1ba';g.beginPath();g.ellipse(-0.5+lean*0.3,-9.6+bob,4.2,1.6,0,0,7);g.fill();
  // head + helmet
  const hx=0.8+lean*0.8,hyy=-14+bob;
  dot(g,hx,hyy+0.8,3.3,SKIN,true);
  g.fillStyle='#c4cad2';g.strokeStyle=OUT;g.lineWidth=0.9;g.beginPath();g.arc(hx,hyy,4.2,Math.PI,0);g.lineTo(hx+4.2,hyy+1);g.lineTo(hx-4.2,hyy+1);g.closePath();g.fill();g.stroke();
  g.fillStyle='rgba(255,255,255,.5)';g.fillRect(hx-3,hyy-3.2,2.4,1.1);g.fillStyle='#6a717a';g.fillRect(hx+1.8,hyy-0.2,0.9,3.2);
  g.fillStyle=tc;g.beginPath();g.moveTo(hx-1,hyy-4);g.quadraticCurveTo(hx-4,hyy-8,hx-5.5,hyy-5.5+Math.sin(ph)*0.5);g.quadraticCurveTo(hx-3,hyy-5.4,hx+1,hyy-3.5);g.fill();
  g.fillStyle='#2a1a10';g.fillRect(hx+1.5,hyy+0.6,0.9,1);
  // shield
  const shx=-1.5+lean*0.5,shy=-3.4+bob;
  g.fillStyle=drk(tc,.15);g.strokeStyle=OUT;g.lineWidth=0.9;g.beginPath();g.arc(shx,shy,4.9,0,7);g.fill();g.stroke();
  g.fillStyle=tc;g.beginPath();g.arc(shx,shy,3.9,0,7);g.fill();g.fillStyle='rgba(255,255,255,.3)';g.beginPath();g.arc(shx-1,shy-1.2,2,Math.PI,Math.PI*1.9);g.fill();
  g.strokeStyle='#e4e6ea';g.lineWidth=0.9;g.beginPath();g.arc(shx,shy,4.4,0,7);g.stroke();dot(g,shx,shy,1.3,'#d8dce2',true);
};
FIG.archer=(g,team,mode,p,tool,carry)=>{
  const tc=TEAMC[team],td=TEAMD[team],ph=p*6.2832;
  let la=0,bob=0,pull=0,rel=0,lean=0;
  if(mode==='walk'){la=Math.sin(ph)*0.62;bob=-Math.abs(Math.cos(ph))*0.9;}
  else if(mode==='atk'){pull=p<0.55?p/0.55:0;rel=p>=0.55?1-(p-0.55)/0.45:0;lean=p<0.55?-0.5:0.4;}
  const hy=-1+bob;
  shadowE(g,0,6.6,6.8,2.4);
  // quiver
  g.save();g.translate(-3.6,-6.4+bob);g.rotate(-0.35);g.fillStyle='#6a4a28';g.strokeStyle=OUT;g.lineWidth=0.8;g.fillRect(-1.6,-4,3.4,8);g.strokeRect(-1.6,-4,3.4,8);g.fillStyle=tc;for(let i=0;i<3;i++)g.fillRect(-1.4+i*1.2,-6,0.9,2.4);g.restore();
  limb(g,-0.4,hy,-la,6.8,2.2,'#3b2d1c');foot(g,Math.sin(-la)*6.8,hy+Math.cos(la)*6.8,'#2a1c10');
  limb(g,0.8,hy,la,6.8,2.3,'#54402a');foot(g,0.8+Math.sin(la)*6.8,hy+Math.cos(la)*6.8,'#2e2012');
  const sx=0.2+lean*0.2,sy=-8.4+bob;
  // bow arm (front) extended
  const bx=8.4;
  const hand=limb(g,sx+0.4,sy,1.42,7.4,2,'#3f6b3a');dot(g,hand[0],hand[1],1.4,SKIN);
  // torso
  const gr=g.createLinearGradient(-4,0,4,0);gr.addColorStop(0,'#4f8648');gr.addColorStop(1,'#2a4a27');
  g.fillStyle=gr;g.strokeStyle=OUT;g.lineWidth=0.9;g.beginPath();g.moveTo(-3.6,-9.6+bob);g.lineTo(3.6,-9.6+bob);g.lineTo(4,0.6+bob);g.lineTo(-4,0.6+bob);g.closePath();g.fill();g.stroke();
  g.fillStyle=tc;g.beginPath();g.moveTo(-3.6,-9.6+bob);g.lineTo(3.6,-9.6+bob);g.lineTo(3.2,-6.4+bob);g.lineTo(-3.4,-6.4+bob);g.closePath();g.fill();
  g.fillStyle='#4a3420';g.fillRect(-4,-2.4+bob,8,1.4);
  // head + hood
  const hx=0.9+lean*0.3,hyy=-13.4+bob;
  dot(g,hx+0.4,hyy+0.4,3.2,SKIN,true);
  g.fillStyle='#35602f';g.strokeStyle=OUT;g.lineWidth=0.9;g.beginPath();g.moveTo(hx-4.6,hyy+3);g.quadraticCurveTo(hx-5,hyy-4,hx+0.5,hyy-5);g.quadraticCurveTo(hx+4.4,hyy-4.4,hx+3.6,hyy-1.4);g.quadraticCurveTo(hx,hyy-2.2,hx-0.6,hyy+1);g.quadraticCurveTo(hx-1,hyy+3.4,hx-4.6,hyy+3);g.closePath();g.fill();g.stroke();
  g.fillStyle='rgba(255,255,255,.2)';g.fillRect(hx-2.4,hyy-3.8,2.4,1);g.fillStyle='#2a1a10';g.fillRect(hx+1.9,hyy+0.1,0.9,1.1);
  // bow
  g.strokeStyle=OUT;g.lineWidth=2.6;g.beginPath();g.arc(bx+1.6,sy+1.4,7.8,-1.35,1.35);g.stroke();
  g.strokeStyle='#9a6a36';g.lineWidth=1.5;g.beginPath();g.arc(bx+1.6,sy+1.4,7.8,-1.35,1.35);g.stroke();
  const ty=sy+1.4-Math.sin(1.35)*7.8,by=sy+1.4+Math.sin(1.35)*7.8,tx=bx+1.6+Math.cos(1.35)*7.8;
  const px=tx-pull*6.5+rel*1.2;
  g.strokeStyle='#eee';g.lineWidth=0.6;g.beginPath();g.moveTo(tx,ty);g.lineTo(px,sy+1.4);g.lineTo(tx,by);g.stroke();
  if(mode==='atk'&&p<0.55||mode!=='atk'&&false){ // nocked arrow + draw hand
    ln(g,px,sy+1.4,bx+9,sy+1.2,0.9,'#ddd2b0');g.fillStyle='#e8ecf0';g.beginPath();g.moveTo(bx+9,sy-0.2);g.lineTo(bx+12,sy+1.2);g.lineTo(bx+9,sy+2.6);g.fill();
    const hh=limb(g,sx,sy,Math.atan2(px-sx,sy+1.4-sy+0.001)*1,Math.hypot(px-sx,1.4)+0.1,2,lit(tc,.1));dot(g,px,sy+1.4,1.4,SKIN);
  }else if(mode==='atk'){const hh=limb(g,sx,sy,1.1,5.2,2,lit(tc,.1));dot(g,hh[0],hh[1],1.4,SKIN);}
  else{const hh=limb(g,sx,sy,0.4-Math.sin(ph)*0.4,5.2,2,lit(tc,.1));dot(g,hh[0],hh[1],1.4,SKIN);}
};
FIG.knight=(g,team,mode,p,tool,carry)=>{
  const tc=TEAMC[team],td=TEAMD[team],ph=p*6.2832;
  let gal=mode==='walk',bob=gal?-Math.abs(Math.sin(ph))*1.4:0,tilt=0,th=0;
  if(mode==='atk'){const k=Math.sin(Math.min(1,p)*Math.PI);tilt=-0.1*k;th=k*7;}
  shadowE(g,0,8.4,14.5,3.6);
  g.save();g.translate(0,bob);g.rotate(tilt);
  const HC='#7b4d2b',HD='#4e3019',HL='#a06a3c';
  const leg=(hx,hy,off,far)=>{
    let a=0,k=0;if(gal){a=Math.sin(ph+off)*0.75;k=Math.max(0,-Math.sin(ph+off))*0.9;}
    const kx=hx+Math.sin(a)*4.6,ky=hy+Math.cos(a)*4.6,fx=kx+Math.sin(a-k)*4.6,fy=ky+Math.cos(a-k)*4.6;
    const col=far?HD:HC;ln(g,hx,hy,kx,ky,2.6,col);ln(g,kx,ky,fx,fy,2,col);
    g.fillStyle=far?'#1c1208':'#2a1c10';g.fillRect(fx-1.2,fy-0.4,2.6,1.6);
  };
  leg(-7.5,2.5,2.4,true);leg(7,2.5,0.6,true);
  // tail
  g.strokeStyle=OUT;g.lineWidth=3.4;g.beginPath();g.moveTo(-10.5,-2);g.quadraticCurveTo(-15,1+Math.sin(ph*(gal?1:0.4))*1.2,-14,6);g.stroke();
  g.strokeStyle='#2a1a10';g.lineWidth=2.4;g.beginPath();g.moveTo(-10.5,-2);g.quadraticCurveTo(-15,1+Math.sin(ph*(gal?1:0.4))*1.2,-14,6);g.stroke();
  // body
  const gr=g.createLinearGradient(0,-5,0,6);gr.addColorStop(0,HL);gr.addColorStop(0.5,HC);gr.addColorStop(1,HD);
  g.fillStyle=gr;g.strokeStyle=OUT;g.lineWidth=1;g.beginPath();g.ellipse(0,0,11.5,5.6,0,0,7);g.fill();g.stroke();
  // neck + head
  g.fillStyle=HC;g.beginPath();g.moveTo(6.5,-3.6);g.quadraticCurveTo(10,-12,14,-13.4);g.lineTo(16.5,-10);g.quadraticCurveTo(13.6,-6,12,0);g.closePath();g.fill();g.stroke();
  g.fillStyle='#2a1a10';g.beginPath();g.moveTo(6.5,-3.6);g.quadraticCurveTo(9.4,-11.6,13.6,-13.4);g.lineTo(14.4,-12);g.quadraticCurveTo(10.6,-9,8.8,-2.4);g.closePath();g.fill();
  g.save();g.translate(15.6,-11.4);g.rotate(0.75);g.fillStyle=HC;g.beginPath();g.ellipse(0,0,5.4,2.7,0,0,7);g.fill();g.stroke();g.fillStyle=HL;g.beginPath();g.ellipse(-0.6,-0.8,3.6,1,0,0,7);g.fill();g.fillStyle='#2a1a10';g.beginPath();g.arc(4.2,0.4,0.9,0,7);g.fill();g.restore();
  g.fillStyle='#14100a';g.beginPath();g.arc(15.2,-12.8,0.8,0,7);g.fill();
  g.fillStyle=HD;g.beginPath();g.moveTo(12.8,-14);g.lineTo(12.4,-17.2);g.lineTo(14.4,-14.4);g.fill();
  // bridle
  g.strokeStyle=tc;g.lineWidth=1;g.beginPath();g.moveTo(13.6,-14);g.lineTo(18,-8.6);g.stroke();
  // caparison
  g.fillStyle=tc;g.strokeStyle=OUT;g.lineWidth=0.9;g.beginPath();g.moveTo(-9.5,-4.2);g.lineTo(5.5,-4.6);g.lineTo(6.2,3.4);g.lineTo(4.2,5.6);g.lineTo(2,3.6);g.lineTo(-0.5,5.8);g.lineTo(-3,3.6);g.lineTo(-5.5,5.6);g.lineTo(-7.5,3.4);g.lineTo(-10.5,4.4);g.closePath();g.fill();g.stroke();
  g.fillStyle='rgba(255,255,255,.22)';g.fillRect(-9,-4,13,1.6);g.fillStyle='#e0b84a';g.fillRect(-10,3.4,16,1.1);g.fillRect(-9.5,-4.4,15,0.8);g.beginPath();g.arc(-2,-0.6,1.6,0,7);g.fill();
  g.fillStyle=td;g.globalAlpha=0.55;g.fillRect(-8,0,12,1.2);g.globalAlpha=1;
  leg(-6.5,2.8,0,false);leg(8,2.8,3.14,false);
  // saddle strap
  g.fillStyle='#3a2616';g.fillRect(-1,-5.4,3,3);
  // rider legs
  ln(g,0.5,-3,2.6,2.6,2.3,'#6a737f');foot(g,2.2,2.8,'#2a2a30');
  // rider
  const lx=2+th*0.15,ly=-5.2;
  const rgr=g.createLinearGradient(-3,0,4,0);rgr.addColorStop(0,'#c9ced6');rgr.addColorStop(1,'#7a828e');
  g.fillStyle=rgr;g.strokeStyle=OUT;g.lineWidth=0.9;g.beginPath();g.moveTo(-3.2,-5);g.lineTo(-3.4,-13.2);g.lineTo(3.6+th*0.12,-13.2);g.lineTo(4,-5);g.closePath();g.fill();g.stroke();
  g.fillStyle=tc;g.beginPath();g.moveTo(-3,-6.6);g.lineTo(3.8,-6.6);g.lineTo(4,-4.4);g.lineTo(-3.2,-4.4);g.closePath();g.fill();g.fillStyle='rgba(255,255,255,.3)';g.fillRect(-2.6,-12.6,1.6,5);
  // helmet
  const hx=0.8+th*0.15,hyy=-17;
  g.fillStyle='#cfd4dc';g.strokeStyle=OUT;g.lineWidth=0.9;g.beginPath();g.arc(hx,hyy,4,Math.PI,0);g.lineTo(hx+4,hyy+3.6);g.lineTo(hx-4,hyy+3.6);g.closePath();g.fill();g.stroke();
  g.fillStyle='#14100a';g.fillRect(hx+0.6,hyy-0.2,3.6,1.1);g.fillStyle='rgba(255,255,255,.55)';g.fillRect(hx-3,hyy-3,2.2,1);
  g.fillStyle=tc;g.beginPath();g.moveTo(hx-0.5,hyy-4);g.quadraticCurveTo(hx-3,hyy-9.5,hx-7,hyy-7.4+Math.sin(ph*(gal?1:0.5))*1.2);g.quadraticCurveTo(hx-3.4,hyy-6.4,hx+1.4,hyy-3.8);g.fill();
  // shield
  g.fillStyle=td;g.strokeStyle=OUT;g.lineWidth=0.9;g.beginPath();g.moveTo(-5.4,-10.4);g.lineTo(0.4,-10.4);g.lineTo(0.4,-5);g.lineTo(-2.5,-2.4);g.lineTo(-5.4,-5);g.closePath();g.fill();g.stroke();
  g.fillStyle=tc;g.beginPath();g.moveTo(-4.6,-9.6);g.lineTo(-0.4,-9.6);g.lineTo(-0.4,-5.2);g.lineTo(-2.5,-3.4);g.lineTo(-4.6,-5.2);g.closePath();g.fill();g.fillStyle='rgba(255,255,255,.4)';g.fillRect(-4.2,-9.2,1.4,4);
  // lance
  const ax=lx+th,ay=ly-3.2;
  ln(g,ax-8,ay+4.4+th*0.1,ax+27,ay-2.6,1.7,'#9c7444');
  g.fillStyle='#e6e9ee';g.strokeStyle=OUT;g.lineWidth=0.8;g.beginPath();g.moveTo(ax+26,ay-4.9);g.lineTo(ax+34,ay-2.6);g.lineTo(ax+26.2,ay-0.4);g.closePath();g.fill();g.stroke();
  g.fillStyle=tc;g.strokeStyle=OUT;g.lineWidth=0.7;g.beginPath();g.moveTo(ax+19,ay-1.6);g.quadraticCurveTo(ax+14,ay-5.4+Math.sin(ph*(gal?1:0.5))*1.2,ax+8,ay-1.4+Math.sin(ph)*1);g.lineTo(ax+9,ay+1.8);g.quadraticCurveTo(ax+14,ay-2,ax+19,ay-0.2);g.closePath();g.fill();g.stroke();
  const hh=limb(g,lx+1,ly-5.2,1.35,5.4,2.2,'#aab1ba');dot(g,hh[0],hh[1],1.5,'#8a919b',true);
  g.restore();
};
const WORKP=0.9;
function unitTool(u){
  const o=u.ord;
  if(o.t==='gather'){const tg=o.tgt;if(tg&&tg.kind==='b')return 'hoe';return o.rt==='wood'?'axe':o.rt==='gold'?'pick':'berry';}
  if(o.t==='build')return 'hammer';
  return 'hammer';
}
const UANIM={walk:8,atk:6,work:8,idle:1};
const UMI={idle:0,walk:1,atk:2,work:3},UTI={'':0,axe:1,pick:2,hoe:3,hammer:4,berry:5},UCI={'':0,wood:1,gold:2,food:3},UC={};
function unitSpr(type,team,mode,idx,tool,carry){
  const nk=(((team*4+UMI[mode])*8+idx)*6+(UTI[tool]|0))*4+(UCI[carry]|0);
  const tb=UC[type]||(UC[type]=[]);let s=tb[nk];if(s)return s;
  const key='u|'+type+'|'+team+'|'+mode+idx+'|'+tool+'|'+carry,big=type==='knight',n=UANIM[mode];
  return tb[nk]=sprite(key,big?78:54,big?64:56,big?38:27,big?46:40,g=>FIG[type](g,team,mode,idx/n,tool,carry),2);
}
function drawUnit(g,u){
  const type=u.type,big=type==='knight';
  let mode='idle',idx=0,tool='';
  if(u.swing>0){mode='atk';idx=Math.min(5,Math.floor((1-u.swing/0.25)*6));if(type==='villager')tool='axe';}
  else if(u.moving){mode='walk';idx=Math.floor((u.anim*(big?2.1:2.3))%1*8);}
  else if(u.working){mode='work';tool=type==='villager'?unitTool(u):'';idx=Math.floor((u.anim/WORKP)%1*8);}
  const s=unitSpr(type,u.team,mode,idx,tool,type==='villager'&&u.carry>0?(u.ctype||'food'):'');
  g.save();g.translate(u._rx!==undefined?u._rx:u.x,u._ry!==undefined?u._ry:u.y);if(u.face<0)g.scale(-1,1);
  g.drawImage(s.c,-s.ox,-s.oy,s.w,s.h);
  if(u.flash>0){g.globalAlpha=clamp(u.flash/0.14,0,1)*0.65;g.drawImage(flashOf(s),-s.ox,-s.oy,s.w,s.h);g.globalAlpha=1;}
  g.restore();
}

/* ================= selection / world draw ================= */
const selSet=new Set();
const SELC=['141,224,122','255,106,85','229,180,71'];
function drawSelRing(g,e){
  const c=SELC[e.team<0?2:e.team],pu=0.5+0.5*Math.sin(FXT*4.5);
  if(e.kind==='u'){
    const rx=e.r+4.5,ry=e.r*0.62+3.2,cy=(e._ry!==undefined?e._ry:e.y)+e.r-1,ex=e._rx!==undefined?e._rx:e.x;
    g.fillStyle='rgba('+c+','+(0.1+0.06*pu)+')';g.beginPath();g.ellipse(ex,cy,rx,ry,0,0,7);g.fill();
    g.strokeStyle='rgba(0,0,0,.45)';g.lineWidth=3.4;g.beginPath();g.ellipse(ex,cy,rx,ry,0,0,7);g.stroke();
    g.strokeStyle='rgba('+c+',.95)';g.lineWidth=1.8;g.beginPath();g.ellipse(ex,cy,rx,ry,0,0,7);g.stroke();
    g.strokeStyle='rgba(255,255,255,'+(0.35+0.3*pu)+')';g.lineWidth=0.8;g.beginPath();g.ellipse(ex,cy,rx-2,ry-1.2,0,-0.9+FXT*2,0.5+FXT*2);g.stroke();
  }else{
    const x=e.tx*TILE-3,y=e.ty*TILE-3,w=e.w*TILE+6,h=e.h*TILE+6,L=Math.min(14,w/3);
    g.fillStyle='rgba('+c+','+(0.07+0.05*pu)+')';g.fillRect(x,y,w,h);
    for(const pass of [0,1]){
      g.strokeStyle=pass?'rgba('+c+',.95)':'rgba(0,0,0,.45)';g.lineWidth=pass?2:4;g.beginPath();
      g.moveTo(x,y+L);g.lineTo(x,y);g.lineTo(x+L,y);g.moveTo(x+w-L,y);g.lineTo(x+w,y);g.lineTo(x+w,y+L);
      g.moveTo(x+w,y+h-L);g.lineTo(x+w,y+h);g.lineTo(x+w-L,y+h);g.moveTo(x+L,y+h);g.lineTo(x,y+h);g.lineTo(x,y+h-L);g.stroke();
    }
  }
}
let mouse={x:-1,y:-1,in:false},mode=null,boxSel=null,hoverTile=null;
const DRB=[];
const DRCMP=(a,b)=>a._sy-b._sy;
const NOCAP=(typeof navigator!=='undefined'&&navigator.webdriver)===true;
function interpUnit(u,now){
  const x=u.x,y=u.y;
  if(u._it===undefined){u._ax=u._bx=u._rx=x;u._ay=u._by=u._ry=y;u._it=now;u._dur=33;return;}
  if(x!==u._bx||y!==u._by){
    const dx=x-u._bx,dy=y-u._by;
    if(dx*dx+dy*dy>2500){u._ax=x;u._ay=y;}else{u._ax=u._rx;u._ay=u._ry;}
    u._bx=x;u._by=y;const dt=now-u._it;u._it=now;u._dur=dt>100?33:(dt<16?16:dt);
  }
  let a=(now-u._it)/u._dur;a=a<0?0:a>1?1:a;
  u._rx=u._ax+(u._bx-u._ax)*a;u._ry=u._ay+(u._by-u._ay)*a;
}
function drawRubble(g,f){
  const k=Math.min(1,f.life/3);g.globalAlpha=k*0.95;
  const x0=f.x-f.w/2,y0=f.y-f.h/2,R=mulberry32((f.x*7+f.y*13)|0);
  g.fillStyle='rgba(20,14,8,.45)';rr(g,x0+2,y0+6,f.w-4,f.h-8,10);g.fill();
  for(let i=0;i<f.w*f.h/90;i++){
    const x=x0+6+R()*(f.w-12),y=y0+10+R()*(f.h-18),s=2+R()*4;
    g.fillStyle=R()<0.35?'#6b4a2a':R()<0.5?'#5e5a52':'#8a867c';g.save();g.translate(x,y);g.rotate(R()*3);g.fillRect(-s,-s*0.5,s*2,s);g.fillStyle='rgba(255,255,255,.2)';g.fillRect(-s,-s*0.5,s*2,1);g.restore();
  }
  g.globalAlpha=1;
}
function renderScale(){return typeof FXQ!=='undefined'?(FXQ.cur.rs||1)*(FXQ.dyn||1):1;}
function drawWorld(){
  const g=ctx,now=performance.now();
  if(!NOCAP&&_lastDraw&&now-_lastDraw<14.5)return;   // cap at ~60 fps on 120 Hz displays
  const rdt=Math.min(0.05,(now-(_lastDraw||now))/1000);_lastDraw=now;FXT+=rdt;
  if(typeof fxUpdate==='function')fxUpdate(rdt);
  for(let i=0;i<units.length;i++)interpUnit(units[i],now);
  g.setTransform(1,0,0,1,0,0);g.fillStyle='#07090a';g.fillRect(0,0,cv.width,cv.height);
  const shx=typeof fxShake!=='undefined'?fxShake.x:0,shy=typeof fxShake!=='undefined'?fxShake.y:0;
  g.setTransform(DPR*cam.z,0,0,DPR*cam.z,(-cam.x*cam.z+shx)*DPR,(-cam.y*cam.z+shy)*DPR);
  const vw=VW/cam.z,vh=VH/cam.z,vx0=cam.x-40,vy0=cam.y-40,vx1=cam.x+vw+40,vy1=cam.y+vh+60;
  g.imageSmoothingEnabled=true;g.imageSmoothingQuality='low';
  // visible terrain chunks only
  {const cx0=Math.max(0,Math.floor(cam.x/CHS)),cx1=Math.min(CHW-1,Math.floor((cam.x+vw)/CHS)),cy0=Math.max(0,Math.floor(cam.y/CHS)),cy1=Math.min(CHH-1,Math.floor((cam.y+vh)/CHS));
   for(let cy=cy0;cy<=cy1;cy++)for(let cx=cx0;cx<=cx1;cx++){const c=WCH[cy*CHW+cx];if(c)g.drawImage(c,cx*CHS,cy*CHS,c.width+(cx<CHW-1?1:0),c.height+(cy<CHH-1?1:0));}}
  drawWaterAnim(g,cam.x,cam.y,cam.x+vw,cam.y+vh);
  if(typeof fxDrawGround==='function')fxDrawGround(g);
  for(let i=0;i<fx.length;i++){
    const f=fx[i];
    if(f.t==='rubble'){if(f.x>vx0&&f.x<vx1&&f.y>vy0&&f.y<vy1)drawRubble(g,f);}
    else if(f.t==='corpse'){if(!visPx(f.x,f.y,1))continue;g.globalAlpha=Math.min(1,f.life/4)*0.35;g.fillStyle='#5a1414';g.beginPath();g.ellipse(f.x,f.y+4,f.r*1.3,f.r*0.55,0,0,7);g.fill();g.globalAlpha=1;}
  }
  for(let i=0;i<sel.length;i++){const e=sel[i];if(!e.dead)drawSelRing(g,e);}
  // y-sorted drawables (reused buffer)
  let n=0;
  for(let i=0;i<ress.length;i++){const r=ress[i];if(r.x<=vx0||r.x>=vx1||r.y<=vy0||r.y>=vy1||!visPx(r.x,r.y,1))continue;r._sy=r.y+(r.type==='gold'?14:8);DRB[n++]=r;}
  for(let i=0;i<blds.length;i++){const b=blds[i];if(!((b.x>vx0&&b.x<vx1&&b.y>vy0&&b.y<vy1)||(b.x+b.w*16>vx0&&b.x+b.w*16<vx1&&b.y+b.h*16>vy0&&b.y+b.h*16<vy1)))continue;if(b.team===1&&!visPx(b.x,b.y,1)&&!visPx(b.x,b.y+b.h*16,1))continue;b._sy=b.ty*TILE+b.h*TILE-4;DRB[n++]=b;}
  for(let i=0;i<units.length;i++){const u=units[i];if(u._rx<=vx0||u._rx>=vx1||u._ry<=vy0||u._ry>=vy1)continue;if(u.team===1&&!visPx(u._rx,u._ry,2))continue;u._sy=u._ry+u.r;DRB[n++]=u;}
  if(typeof fxAnimals!=='undefined')for(let i=0;i<fxAnimals.length;i++){const a=fxAnimals[i];if(a.x<=vx0||a.x>=vx1||a.y<=vy0||a.y>=vy1||!visPx(a.x,a.y,2))continue;a._sy=a.y+4;a.kind='a';DRB[n++]=a;}
  DRB.length=n;DRB.sort(DRCMP);
  for(let i=0;i<n;i++){
    const e=DRB[i];
    if(e.kind==='r'){if(e.type==='tree')drawTree(g,e);else if(e.type==='berry')drawBerry(g,e);else drawGold(g,e);}
    else if(e.kind==='b')drawBld(g,e);
    else if(e.kind==='a')drawAnimal(g,e);
    else{
      drawUnit(g,e);
      if(e.hp<e.maxhp||selSet.has(e))hpBar(g,e._rx,e._ry-e.r-(e.type==='knight'?15:11),16,e.hp,e.maxhp);
    }
  }
  DRB.length=0;
  if(typeof fxDraw==='function')fxDraw(g);
  for(let i=0;i<fx.length;i++){
    const f=fx[i];
    if(f.t==='ping'){const k=1-f.life/f.max;g.strokeStyle='rgba(255,90,70,'+(1-k)+')';g.lineWidth=3;g.beginPath();g.arc(f.x,f.y,10+k*50,0,7);g.stroke();g.beginPath();g.arc(f.x,f.y,6+k*30,0,7);g.stroke();}
    else if(f.t==='click'){const k=1-f.life/f.max;g.strokeStyle=f.c;g.globalAlpha=1-k;g.lineWidth=2;g.beginPath();g.ellipse(f.x,f.y,6+k*10,3+k*5,0,0,7);g.stroke();g.beginPath();g.ellipse(f.x,f.y,2+k*5,1+k*2.5,0,0,7);g.stroke();g.globalAlpha=1;}
  }
  for(let i=0;i<sel.length;i++){const e=sel[i];if(e.kind==='b'&&e.team===0&&e.done&&BDEF[e.type].atk){g.strokeStyle='rgba(255,255,255,.25)';g.setLineDash([6,5]);g.lineWidth=1.5;g.beginPath();g.arc(e.x,e.y,BDEF[e.type].range,0,7);g.stroke();g.setLineDash([]);}}
  for(let i=0;i<sel.length;i++){
    const e=sel[i];
    if(e.kind==='b'&&e.team===0&&e.rally){
      g.strokeStyle='rgba(140,224,122,.7)';g.lineWidth=1.2;g.setLineDash([4,4]);g.beginPath();g.moveTo(e.x,e.y);g.lineTo(e.rally.x,e.rally.y);g.stroke();g.setLineDash([]);
      g.fillStyle='#ddd';g.fillRect(e.rally.x-1,e.rally.y-16,2,16);flagCloth(g,e.rally.x+1,e.rally.y-16,10,TEAMC[0],TEAMD[0],0);
    }
  }
  if(mode&&mode.t==='build'&&hoverTile){
    const d=BDEF[mode.type],tx=hoverTile.tx,ty=hoverTile.ty,ok=canPlace(mode.type,tx,ty,0);
    g.globalAlpha=0.6;
    const gb={tx,ty,w:d.w,h:d.h,x:(tx+d.w/2)*TILE,y:(ty+d.h/2)*TILE,type:mode.type,team:0,done:true,prog:1,hp:d.hp,maxhp:d.hp,amt:d.food||0,flash:0};
    drawBld(g,gb);g.globalAlpha=1;
    g.fillStyle=ok?'rgba(120,230,110,.26)':'rgba(240,70,60,.36)';g.fillRect(tx*TILE,ty*TILE,d.w*TILE,d.h*TILE);
    g.strokeStyle=ok?'#8de07a':'#ff6a55';g.lineWidth=2;g.setLineDash([6,4]);g.strokeRect(tx*TILE,ty*TILE,d.w*TILE,d.h*TILE);g.setLineDash([]);
  }
  // fog: only the visible tile rect of the small tile-res canvas, bilinear, skipped when every visible tile is fully lit
  if(fogDirty)updFogImg();
  {const tx0=clamp(Math.floor(cam.x/TILE)-1,0,MW-1),tx1=clamp(Math.floor((cam.x+vw)/TILE)+1,0,MW-1),ty0=clamp(Math.floor(cam.y/TILE)-1,0,MH-1),ty1=clamp(Math.floor((cam.y+vh)/TILE)+1,0,MH-1);
   let need=false;for(let y=ty0;y<=ty1&&!need;y++){const o=y*MW;for(let x=tx0;x<=tx1;x++)if(vis[o+x]!==2){need=true;break;}}
   if(need){g.imageSmoothingQuality='low';const w=tx1-tx0+1,h=ty1-ty0+1;g.drawImage(fogCv,tx0,ty0,w,h,tx0*TILE,ty0*TILE,w*TILE,h*TILE);}}
  g.setTransform(DPR,0,0,DPR,0,0);
  if(typeof fxDrawScreen==='function')fxDrawScreen(g,VW,VH);
  if(boxSel&&boxSel.active){
    const x=Math.min(boxSel.x0,boxSel.x1),y=Math.min(boxSel.y0,boxSel.y1),w=Math.abs(boxSel.x1-boxSel.x0),h=Math.abs(boxSel.y1-boxSel.y0);
    g.fillStyle='rgba(140,224,122,.12)';g.fillRect(x,y,w,h);g.strokeStyle='#8de07a';g.lineWidth=1;g.strokeRect(x+.5,y+.5,w,h);
  }
}
let miniDyn=null,miniT=0,miniFog=-1;
function drawMini(){
  const g=mctx,S=mmc.width,k=S/WW,now=performance.now();
  if(!miniDyn||miniDyn.width!==S){miniDyn=mkc(S,S);miniT=0;}
  if(now-miniT>150){
    miniT=now;const d=miniDyn.getContext('2d');
    d.setTransform(1,0,0,1,0,0);d.imageSmoothingEnabled=true;d.drawImage(worldCv,0,0,S,S);
    for(let i=0;i<ress.length;i++){const r=ress[i];if(!visPx(r.x,r.y,1))continue;d.fillStyle=r.type==='gold'?'#f0c24a':r.type==='tree'?'#1f4a1c':'#d94a55';d.fillRect(r.x*k-(r.type==='gold'?2:1),r.y*k-(r.type==='gold'?2:1),r.type==='gold'?4:2.2,r.type==='gold'?4:2.2);}
    for(let i=0;i<blds.length;i++){const b=blds[i];if(b.team===1&&!visPx(b.x,b.y,1))continue;const bw=Math.max(4,b.w*TILE*k);d.fillStyle=TEAMC[b.team];d.fillRect(b.tx*TILE*k,b.ty*TILE*k,bw,bw);d.strokeStyle='rgba(0,0,0,.6)';d.lineWidth=1;d.strokeRect(b.tx*TILE*k+.5,b.ty*TILE*k+.5,bw-1,bw-1);}
    for(let i=0;i<units.length;i++){const u=units[i];if(u.team===1&&!visPx(u.x,u.y,2))continue;d.fillStyle=TEAMC[u.team];d.fillRect(u.x*k-1.5,u.y*k-1.5,3.5,3.5);}
    d.imageSmoothingEnabled=true;d.drawImage(fogCv,0,0,S,S);
  }
  g.setTransform(1,0,0,1,0,0);g.drawImage(miniDyn,0,0);
  g.strokeStyle='#fff';g.lineWidth=1.5;
  g.strokeRect(cam.x*k,cam.y*k,VW/cam.z*k,VH/cam.z*k);
  for(let i=0;i<fx.length;i++){const f=fx[i];if(f.t==='ping'){g.strokeStyle='#ff6a55';g.beginPath();g.arc(f.x*k,f.y*k,6,0,7);g.stroke();}}
}

/* ================= icons (rendered from the same sprite code) ================= */
const ICONS={};
function icon(name){
  if(ICONS[name])return ICONS[name];
  const c=mkc(64,64),g=c.getContext('2d');
  g.lineCap='round';g.lineJoin='round';
  const tc=TEAMC[0];
  if(FIG[name]){
    const big=name==='knight',sc=big?1.45:2.5;
    g.translate(32,big?42:44);g.scale(sc,sc);
    FIG[name](g,0,'idle',0,'','');
  }else if(BLD_DRAW[name]){
    const s=bldSprite(name,0,1,3),k=Math.min(60/(s.w-8),60/(s.h-10));
    g.drawImage(s.c,0,0,s.c.width,s.c.height,32-s.w*k/2,34-(s.h-8)*k/2,s.w*k,s.h*k);
  }
  else if(name==='age'){g.fillStyle='#e5b447';g.beginPath();g.moveTo(32,6);g.lineTo(38,24);g.lineTo(58,24);g.lineTo(42,36);g.lineTo(48,56);g.lineTo(32,44);g.lineTo(16,56);g.lineTo(22,36);g.lineTo(6,24);g.lineTo(26,24);g.closePath();g.fill();g.strokeStyle='#7a5a18';g.lineWidth=2;g.stroke();}
  else if(name==='stop'){g.fillStyle='#e0594f';g.fillRect(14,14,36,36);g.strokeStyle='#fff';g.lineWidth=3;g.strokeRect(14,14,36,36);}
  else if(name==='amove'){g.strokeStyle='#e8e4d8';g.lineWidth=5;g.beginPath();g.moveTo(12,52);g.lineTo(46,18);g.moveTo(52,52);g.lineTo(18,18);g.stroke();g.strokeStyle='#e0594f';g.lineWidth=4;g.beginPath();g.arc(32,32,24,0,7);g.stroke();}
  else if(name==='rally'){g.fillStyle='#ddd';g.fillRect(18,8,4,48);g.fillStyle=tc;g.beginPath();g.moveTo(22,10);g.lineTo(54,18);g.lineTo(22,28);g.fill();}
  else if(name==='del'){g.strokeStyle='#e0594f';g.lineWidth=6;g.beginPath();g.moveTo(16,16);g.lineTo(48,48);g.moveTo(48,16);g.lineTo(16,48);g.stroke();}
  return ICONS[name]=c.toDataURL();
}
