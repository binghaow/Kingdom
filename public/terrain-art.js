/* Static material raster: bounded by the existing 8.5 megapixel map cache. */
(()=>{'use strict';const A=window.KingdomArt,K=window.KingdomSim,oldTerrain=A.worldTerrain,oldNode=A.node;let samples;
function textures(){return samples||(samples=A.materials.map(c=>c.getContext('2d').getImageData(0,0,192,192).data))}
function oval(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,7);c.fill()}
/* V41 ground blending: the 8 terrain-materials-v2 materials (0 grass, 1 meadow, 2 dry grass, 3 dirt, 4 rock, 5 water, 6 gravel,
   7 slate) mixed by low-frequency value-noise fields (precomputed on a coarse grid, bilinear per pixel) with height-style edges
   (texture luminance shifts each threshold, so grass tufts break into dirt instead of a smooth fade). Then stamped decals:
   dirt roads, gravel/slate aprons around gold and stone, darker floor under forest edges, trampled yards under buildings
   (added once per building into this same cached raster by A.groundDecals). Everything is baked once; no per-frame cost. */
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
function hash(i,j,seed){let h=Math.imul(i,374761393)+Math.imul(j,668265263)+Math.imul(seed,1442695041)|0;h=Math.imul(h^h>>>13,1274126177);return ((h^h>>>16)>>>0)/4294967296}
function vnoise(x,y,seed){const i=Math.floor(x),j=Math.floor(y),fx=x-i,fy=y-j,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy),a=hash(i,j,seed),b=hash(i+1,j,seed),c=hash(i,j+1,seed),d=hash(i+1,j+1,seed);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v}
const fbm=(x,y,seed)=>vnoise(x,y,seed)*.58+vnoise(x*2.13,y*2.13,seed+7)*.28+vnoise(x*4.41,y*4.41,seed+13)*.14;
const stamps=[];function stamp(i,size=256){if(stamps[i])return stamps[i];const c=Object.assign(document.createElement('canvas'),{width:size,height:size}),g=c.getContext('2d');g.fillStyle=g.createPattern(A.materials[i],'repeat');g.fillRect(0,0,size,size);
 // irregular soft mask: radial falloff + noise, so overlapping stamps never show a circle
 const p=g.getImageData(0,0,size,size),d=p.data;for(let y=0;y<size;y++)for(let x=0;x<size;x++){const dx=x/size*2-1,dy=y/size*2-1,r=Math.hypot(dx,dy),n=fbm(x/size*4,y/size*4,90+i);d[(y*size+x)*4+3]=255*smooth(1,.45,r+(n-.5)*.55)}g.putImageData(p,0,0);return stamps[i]=c}
function blot(c,i,x,y,rx,ry,alpha,rot=0){c.save();c.globalAlpha=alpha;c.translate(x,y);c.rotate(rot);c.drawImage(stamp(i),-rx,-ry,rx*2,ry*2);c.restore()}
let decalTarget=null,decalSim=null;const decalled=new Set();
A.worldTerrain=(c,sim)=>{if(A.materials.length<8)return oldTerrain(c,sim);const w=sim.world,W=w.width,H=w.height,cw=c.canvas.width,ch=c.canvas.height,cell=16,cols=Math.ceil(W/cell)+1,rows=Math.ceil(H/cell)+1,land=new Float32Array(cols*rows),rock=new Float32Array(cols*rows),tex=textures(),seed=(w.seed|0)||(Math.round(W*7+H*13)|0);
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const X=x*cell,Y=y*cell;land[y*cols+x]=K.worldPlayable(w,X,Y)&&!K.worldWater(w,X,Y)?1:0;rock[y*cols+x]=K.worldRocky?.(w,X,Y)?1:0}
 // coarse noise fields (one value per 16 px cell): dry grass, dirt, gravel, meadow
 const F=[0,1,2,3].map(k=>{const f=new Float32Array(cols*rows),sc=[1/900,1/520,1/610,1/700][k];for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)f[y*cols+x]=fbm(x*cell*sc,y*cell*sc,seed+k*101);return f});
 const lum=tex.map(t=>{const l=new Float32Array(192*192);for(let i=0;i<l.length;i++)l[i]=(t[i*4]+t[i*4+1]+t[i*4+2])/765;return l});
 const raster=c.createImageData(cw,ch),data=raster.data;for(let y=0;y<ch;y++){const Y=y*H/ch,gy=Y/cell,iy=Math.min(rows-2,Math.floor(gy)),fy=gy-iy;for(let x=0;x<cw;x++){const X=x*W/cw,gx=X/cell,ix=Math.min(cols-2,Math.floor(gx)),fx=gx-ix,i=iy*cols+ix,bl=a=>(a[i]*(1-fx)+a[i+1]*fx)*(1-fy)+(a[i+cols]*(1-fx)+a[i+cols+1]*fx)*fy,l=bl(land),rk=bl(rock),
   ty=Math.floor(Y*.7)%384,tx=Math.floor(X*.7)%384,tp=(ty<192?ty:383-ty)*192+(tx<192?tx:383-tx),ti=tp*4,
   dry=smooth(.38,.66,bl(F[0])+(lum[2][tp]-.5)*.22),meadow=smooth(.57,.75,bl(F[3])+(lum[1][tp]-.5)*.22)*(1-dry*.6),
   dirt=smooth(.63,.77,bl(F[1])+(lum[3][tp]-lum[0][tp])*.4)*.82,gravel=Math.max(smooth(.75,.88,bl(F[2])+(lum[6][tp]-.5)*.36)*.62,smooth(.15,.6,rk)*.8),
   mix=Math.min(1,Math.max(0,(l-.3)/.65)),shore=Math.max(0,1-Math.abs(l-.48)*4),dst=(y*cw+x)*4;
  for(let k=0;k<3;k++){let a=tex[0][ti+k]*(1-dry)+tex[2][ti+k]*dry;a=a*(1-meadow)+tex[1][ti+k]*meadow;a=a*(1-dirt)+tex[3][ti+k]*dirt;a=a*(1-gravel)+tex[6][ti+k]*gravel;const water=tex[5][ti+k]*[.57,.72,.79][k],sand=tex[6][ti+k]*.85;data[dst+k]=(water*(1-mix)+a*mix)*(1-shore*.55)+sand*shore*.55}data[dst+3]=255}}
 c.putImageData(raster,0,0);c.save();c.lineCap='round';c.lineJoin='round';
 // dirt roads from each start toward the centre: textured, darker rut edges, lighter worn middle
 const dirtPat=c.createPattern(A.materials[3],'repeat');for(const p of w.starts){const dx=w.center.x-p.x,dy=w.center.y-p.y,d=Math.hypot(dx,dy)||1,path=new Path2D();path.moveTo(p.x,p.y+80);path.quadraticCurveTo(p.x+dx/d*170+25,p.y+dy/d*170,p.x+dx/d*410,p.y+dy/d*410);c.strokeStyle=dirtPat;c.globalAlpha=.42;c.lineWidth=34;c.stroke(path);c.globalAlpha=.55;c.lineWidth=20;c.stroke(path);c.strokeStyle='#d2bd8a';c.globalAlpha=.12;c.lineWidth=7;c.stroke(path)}
 c.globalAlpha=1;
 // resource aprons: gravel round stone, slate + gravel round gold, darker meadow floor at forest edges (deterministic jitter)
 for(const n of sim.state.nodes||[]){const type=n.resource||n.kind,j=hash(Math.round(n.x),Math.round(n.y),seed);if(K.worldWater(w,n.x,n.y))continue;if(type==='stone'||type==='gold'){blot(c,6,n.x+6,n.y+6,70+j*30,38+j*14,.55,j*.6-.3);if(type==='gold')blot(c,7,n.x-8,n.y+4,46+j*20,24+j*8,.35,j)}else if(type==='wood'&&j<.35)blot(c,j<.12?3:1,n.x+10,n.y+18,52+j*60,22+j*20,.28,j*2)}
 for(const cliff of w.cliffs){if(w.starts.some(p=>K.distance(p,cliff)<700)||K.distance(cliff,w.center)<400)continue;if(A.drawCliff){A.drawCliff(c,cliff,w.cliffs.indexOf(cliff));continue}}
 if(['coast','river'].includes(w.style))for(const y of K.map.bridges){const x=K.riverCenter?K.riverCenter(w,y):W/2+Math.sin(y/H*Math.PI*4)*100;if(w.geography>=2&&!K.worldWater(w,x,y))continue;if(K.distance({x,y},w.center)<360||w.starts.some(p=>K.distance(p,{x,y})<610))continue;c.drawImage(A.tile('bridge'),x-(K.riverWidth(w)+80),y-(K.riverWidth(w)+80)*.35,(K.riverWidth(w)+80)*2,(K.riverWidth(w)+80)*.70)}
 c.restore();decalTarget=c;decalSim=sim;decalled.clear()};
/* Trampled yard under each building, baked into the cached terrain raster the first time the player can see it complete
   (fog-safe; also feeds the minimap). One Set lookup per building per frame. */
A.groundDecals=(sim)=>{if(!decalTarget||sim!==decalSim)return;const D=K.defs;for(const b of sim.state.buildings){if(decalled.has(b.id)||!b.complete||b.hp<=0)continue;const d=D[b.kind];if(!d?.building||d.wall||b.kind==='farm'||K.worldWater(sim.world,b.x,b.y)){decalled.add(b.id);continue}if(sim.canSee&&!sim.canSee(0,b))continue;decalled.add(b.id);const r=(d.r||40),j=hash(b.id|0,7,3);blot(decalTarget,3,b.x+4,b.y+8,r*2.1+18,r*.95+10,.5,j*.3-.15);blot(decalTarget,3,b.x-r*.7,b.y+r*.45,r*.9,r*.4,.3,j)}};
A.node=(c,n,t)=>{const type=n.resource||n.kind;if(!['gold','stone'].includes(type))return oldNode(c,n,t);const gold=type==='gold',seed=n.id||1;c.save();oval(c,n.x+4,n.y+9,34,12,'#14251c55');for(let i=0;i<7;i++){const x=n.x+Math.sin(i*9+seed)*24,y=n.y+Math.cos(i*5+seed)*11,r=10+(i*7+seed)%11,h=r*.95;c.beginPath();c.moveTo(x-r,y);c.lineTo(x-r*.7,y-h);c.lineTo(x+r*.2,y-h*1.3);c.lineTo(x+r,y-4);c.lineTo(x+r*.4,y+5);c.closePath();c.fillStyle=gold?'#726b55':'#82958f';c.fill();if(A.materials[gold?7:6]){c.save();c.clip();c.globalAlpha=.42;c.fillStyle=c.createPattern(A.materials[gold?7:6],'repeat');c.fillRect(x-r,y-h*1.4,r*2,h*2);c.restore()}c.beginPath();c.moveTo(x-r*.7,y-h);c.lineTo(x+r*.2,y-h*1.3);c.lineTo(x,y-2);c.lineTo(x-r,y);c.closePath();c.fillStyle=gold?'#a09c7b':'#b5b8a5';c.fill();c.strokeStyle=gold?'#dbb45c':'#d2d0b7';c.lineWidth=gold?2.2:1;c.beginPath();c.moveTo(x-4,y-h*.8);c.lineTo(x+2,y-5);c.lineTo(x+8,y-2);c.stroke();if(gold){c.fillStyle='#f2d27b';c.fillRect(x,y-h*.7,3,2)}}c.restore();return true};
})();
