/* V41 national landmarks: draw each nation's landmark with its painted building from assets/ten-capitals.png
   (5x2 atlas in KingdomSim.nations order; until now only used for icons) instead of the procedural box recipe.
   France keeps its dedicated painted riding academy. Presentation only: footprint (D.r), placement, collision, HP and
   the landmark rules are unchanged. Width = the existing art-profile width (so health bar / damage overlays / picking
   keep their scale), height follows the bitmap aspect (no single-axis stretch). Picking stays pixel-exact via
   precision-picking (loaded later), which renders this same function into its mask. */
(()=>{'use strict';const A=window.KingdomArt,K=window.KingdomSim,D=K.defs,P=window.KingdomArtProfiles,base=A.building,baseMeasure=A.measure,baseIcon=A.icon;
const KEEP=new Set(['ridingacademy']),art=new Map(),icons=new Map(),order=Object.keys(K.nations),SCALE=1.08;
const make=(w,h)=>Object.assign(document.createElement('canvas'),{width:Math.max(1,Math.ceil(w)),height:Math.max(1,Math.ceil(h))});
function landmarkNation(kind){const d=D[kind];if(!d?.landmark||KEEP.has(kind))return null;const n=d.nation||order.find(k=>K.nations[k].building===kind);return n&&art.has(n)?n:null}
function cut(img,i){const cw=img.width/5,ch=img.height/2,c=make(cw,ch),g=c.getContext('2d');g.drawImage(img,(i%5)*cw,Math.floor(i/5)*ch,cw,ch,0,0,cw,ch);const p=g.getImageData(0,0,c.width,c.height),d=p.data;let x0=c.width,y0=c.height,x1=0,y1=0;
 const W=c.width,H=c.height,N=W*H,lab=new Int32Array(N),q=new Int32Array(N),boxes=[];for(let k=0;k<N;k++)if(d[k*4+3]<24)d[k*4+3]=0;
 // Keep the building: the largest opaque component plus pieces overlapping its box (flags, finials); drop slivers of neighbouring cells.
 for(let s0=0;s0<N;s0++){if(lab[s0]||!d[s0*4+3])continue;const id=boxes.length+1;let h=0,t=0,n=0,bx0=W,by0=H,bx1=0,by1=0;lab[s0]=id;q[t++]=s0;while(h<t){const k=q[h++],x=k%W,y=(k/W)|0;n++;if(x<bx0)bx0=x;if(x>bx1)bx1=x;if(y<by0)by0=y;if(y>by1)by1=y;for(const j of [x?k-1:-1,x<W-1?k+1:-1,y?k-W:-1,y<H-1?k+W:-1])if(j>=0&&!lab[j]&&d[j*4+3]){lab[j]=id;q[t++]=j}}boxes.push({n,bx0,by0,bx1,by1})}
 const main=boxes.reduce((a,b)=>b.n>a.n?b:a,boxes[0]),keep=boxes.map(b=>b===main||b.bx1>=main.bx0&&b.bx0<=main.bx1&&b.by1>=main.by0-30&&b.by0<=main.by1&&b.bx0>2&&b.bx1<W-3);
 for(let k=0;k<N;k++){if(!lab[k])continue;if(!keep[lab[k]-1]){d[k*4+3]=0;continue}if(d[k*4+3]>70){const x=k%W,y=(k/W)|0;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}}
 g.putImageData(p,0,0);const out=make(x1-x0+1,y1-y0+1);out.getContext('2d').drawImage(c,x0,y0,x1-x0+1,y1-y0+1,0,0,out.width,out.height);return out}
function size(kind){const w=Math.round((P?.sizes?.[kind]?.[0]||235)*SCALE),img=art.get(landmarkNation(kind));return {width:w,height:Math.round(w*img.height/img.width)}}
A.measure=kind=>landmarkNation(kind)?size(kind):baseMeasure(kind);
A.building=(c,b,t,selected,ghost)=>{const n=landmarkNation(b.kind);if(!n)return base(c,b,t,selected,ghost);const img=art.get(n),m=size(b.kind),x=b.x-m.width/2,y=b.y+16-m.height;
 c.save();const a0=c.globalAlpha;if(ghost)c.globalAlpha=a0*.55;else if(!b.complete)c.globalAlpha=a0*(.4+.5*(b.progress||0));c.drawImage(img,x,y,m.width,m.height);
 if(b.flash>0&&!ghost){c.globalCompositeOperation='lighter';c.globalAlpha*=.35;c.drawImage(img,x,y,m.width,m.height);c.globalCompositeOperation='source-over'}
 c.globalAlpha=a0;if(selected){c.strokeStyle='#f0d18c';c.lineWidth=1.8;c.beginPath();c.ellipse(b.x,b.y+8,D[b.kind].r+14,(D[b.kind].r+14)*.4,0,0,7);c.stroke()}
 if(!b.complete&&!ghost){c.strokeStyle='#b69a65';c.lineWidth=2;for(let i=-1;i<=1;i++){c.beginPath();c.moveTo(b.x+i*m.width*.27,b.y+3);c.lineTo(b.x+i*m.width*.27,b.y-m.height*.7);c.stroke()}c.strokeStyle='#bd9d65';c.lineWidth=1.5;for(let i=1;i<=3;i++){c.beginPath();c.moveTo(b.x-m.width*.36,b.y-i*m.height*.2);c.lineTo(b.x+m.width*.36,b.y-i*m.height*.2);c.stroke()}}
 c.restore();return true};
A.icon=kind=>{const n=landmarkNation(kind);if(!n)return baseIcon(kind);if(icons.has(kind))return icons.get(kind);const img=art.get(n),c=make(112,112),g=c.getContext('2d'),s=Math.min(104/img.width,104/img.height);g.drawImage(img,(112-img.width*s)/2,(112-img.height*s)/2,img.width*s,img.height*s);const url=c.toDataURL();icons.set(kind,url);return url};
A.ready=Promise.all([A.ready,new Promise((ok,fail)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>fail(Error('国家地标图集加载失败'));i.src='assets/ten-capitals.png'})]).then(([v,img])=>{order.forEach((n,i)=>{if(i<10)art.set(n,cut(img,i))});icons.clear();return v});
})();
