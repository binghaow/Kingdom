/* V41 ground shadows: one light for the whole battlefield (upper-left sun, shadows fall to the lower right).
   Presentation only — no simulation state is read beyond positions/kinds already used by the renderer.
   - Buildings, trees and resource nodes: a cast shadow made ONCE per sprite mask (precision-picking alpha), sheared to the
     lower right, squashed, and softened by building it at quarter resolution (bilinear upscale = blur; no ctx.filter).
   - Mobile units: soft contact shadows batched into two Path2D fills per frame for ALL units (not one draw per unit),
     so a 200-unit battle adds two fills, not 200 drawImage calls. Air units cast a detached shadow offset by flight height.
   Drawn in a pass before the y-sorted entity loop, so shadows never cover sprites. */
(()=>{'use strict';const A=window.KingdomArt,K=window.KingdomSim,D=K.defs;
const SHEAR=.8,SQUASH=.26,S=.25,PAD=3,ALPHA_BUILDING=.38,ALPHA_NODE=.32,COLOR='rgb(12,20,10)';
const cache=new Map(),make=(w,h)=>Object.assign(document.createElement('canvas'),{width:Math.max(1,Math.ceil(w)),height:Math.max(1,Math.ceil(h))});
function blur(g,w,h){const p=g.getImageData(0,0,w,h),d=p.data,a=new Float32Array(w*h),b=new Float32Array(w*h);for(let i=0;i<w*h;i++)a[i]=d[i*4+3];
 for(let pass=0;pass<2;pass++){for(let y=0;y<h;y++)for(let x=0;x<w;x++){let s=0,n=0;for(let k=-1;k<=1;k++){const X=x+k;if(X>=0&&X<w){s+=a[y*w+X];n++}}b[y*w+x]=s/n}for(let y=0;y<h;y++)for(let x=0;x<w;x++){let s=0,n=0;for(let k=-1;k<=1;k++){const Y=y+k;if(Y>=0&&Y<h){s+=b[Y*w+x];n++}}a[y*w+x]=s/n}}
 for(let i=0;i<w*h;i++){d[i*4]=12;d[i*4+1]=20;d[i*4+2]=10;d[i*4+3]=a[i]}g.putImageData(p,0,0)}
function cast(m,building){/* m: {w,h,x,y,alpha,bounds} from precision-picking; (x,y) is the entity anchor inside the mask.
   Pivot = where the object stands: the middle of a building's 3/4-view footprint, or the base of a tree/rock. Rows above the
   pivot are projected onto the ground (height h -> right SHEAR*h, down SQUASH*h); rows below it are footprint and cast nothing. */
 const b=m.bounds,bottom=m.y+b.y+b.height,H=b.height,W=b.width,depth=building?Math.min(H*.32,W*.32):H*.05,top=Math.max(1,Math.round(bottom-depth*.9));
 const sil=make(m.w,top),sg=sil.getContext('2d'),img=sg.createImageData(m.w,top),d=img.data;
 for(let j=0,n=m.w*top;j<n;j++)if(m.alpha[j]){const k=j*4;d[k]=12;d[k+1]=20;d[k+2]=10;d[k+3]=255}
 sg.putImageData(img,0,0);const sh=building?SHEAR:SHEAR*1.15,sq=SQUASH,out=make((m.w+sh*top)*S+PAD*2,sq*top*S+PAD*2+2),g=out.getContext('2d');
 g.imageSmoothingEnabled=true;g.setTransform(S,0,-sh*S,-sq*S,sh*S*top+PAD,sq*S*top+PAD);g.drawImage(sil,0,0);g.setTransform(1,0,0,1,0,0);blur(g,out.width,out.height);
 return {img:out,dx:-m.x-PAD/S,dy:top-m.y-PAD/S,w:out.width/S,h:out.height/S}}
/* Own stable key (the picking-mask cache also churns through animated unit frames; a building's shadow must not be rebuilt then). */
function keyOf(e){const v=A.visualState(e),d=D[e.kind];return e.kind+'|'+(e.subtype||'')+'|'+(e.variant||0)+'|'+(e.forest?1:0)+'|'+(d?.wall?A.wallMaskKey?.(e)||'':'')+'|'+Math.round((e.gateOpen||0)*4)+'|'+v.nation+'|'+v.era+'|'+(e.maxAmount?Math.ceil(4*e.amount/e.maxAmount):'')}
function shadowFor(e){const key=keyOf(e);let s=cache.get(key);if(s===undefined){const m=A.entityMask?.(e);s=m&&m.h>0&&m.bounds.height>0?cast(m,!!D[e.kind]?.building):null;if(cache.size>=320)cache.delete(cache.keys().next().value);cache.set(key,s)}return s}
const castsShadow=e=>D[e.kind]?.building||['wood','gold','stone'].includes(e.kind)&&!e.carcass;
let unitPath=null,unitCore=null,airPath=null;const CR=Math.cos(.14),SR=Math.sin(.14);
/* moveTo the arc start first: otherwise Path2D joins consecutive ellipses with straight edges and fills slivers between units. */
function oval(p,x,y,rx,ry){p.moveTo(x+rx*CR,y+rx*SR);p.ellipse(x,y,rx,ry,.14,0,Math.PI*2)}
A.drawShadows=(c,list,t,alpha=1)=>{
 unitPath=new Path2D();unitCore=new Path2D();airPath=new Path2D();let units=0,air=0;
 c.save();c.imageSmoothingEnabled=true;
 for(const {e,type}of list){
  if(type==='unit'){const d=D[e.kind];if(!d||d.domain==='sea'||e.embarkedOn)continue;const u=A.renderUnit?.(e,alpha)||e,m=A.measure(u.kind)||{width:60,height:70},w=Math.min(150,m.width||60)*(A.unitScale?.(u.kind)||1);
   if(d.domain==='air'){const lift=Math.min(70,(m.height||90)*.45);oval(airPath,u.x+lift*.55,u.y+lift*.5,w*.3,w*.1);air++;continue}
   const cx=u.x+w*.13,cy=u.y+7;oval(unitPath,cx,cy,w*.38,w*.13);oval(unitCore,cx-w*.05,cy-1,w*.23,w*.075);units++;continue}
  if(!castsShadow(e))continue;const s=shadowFor(e);if(!s)continue;c.globalAlpha=(type==='building'?ALPHA_BUILDING:ALPHA_NODE)*(e.remembered?.65:1)*(D[e.kind]?.building&&!e.complete?.6:1);c.drawImage(s.img,e.x+s.dx,e.y+s.dy,s.w,s.h)}
 c.fillStyle=COLOR;if(units){c.globalAlpha=.11;c.fill(unitPath);c.globalAlpha=.17;c.fill(unitCore)}if(air){c.globalAlpha=.2;c.fill(airPath)}
 c.restore()};
A.shadowDiagnostics=()=>({castShadows:cache.size});
A.ready=A.ready.then(v=>{cache.clear();return v});
})();
