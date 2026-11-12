/* Pick visible opaque pixels rather than the surrounding sprite rectangle. */
(()=>{'use strict';const A=window.KingdomArt,D=window.KingdomSim.defs,cache=new Map(),building=A.building,node=A.node,unit=A.unit;let scene=null;const present=A.setPresentation;A.setPresentation=v=>{scene=v;present?.(v)};
const extent=e=>{const m=D[e.kind]||e.kind==='wood'?A.measure(e.kind):{width:80,height:85},a=A.attackExtent?.(e);return a?{width:Math.max(m.width,a.width),height:Math.max(m.height,a.height)}:m};
function mask(e){const clock=scene?.state?.time??0,v=A.visualState(e),d=D[e.kind],m=extent(e),key=[D[e.kind]?.wall?A.wallMaskKey?.(e):'',e.kind,e.subtype,A.attackMaskKey?.(e)||'',D[e.kind]?.domain==='air'?Math.round(Math.sin(clock*1.8+(e.id||0))*3):0,A.directionFor?.(e)||'',e._allDirectionArt?1:0,e.variant||0,e.forest?1:0,e.carcass?1:0,A.carryingPose?.(e)||'',e.cargo?.amount>.1?e.cargo.resource:'',e.working?1:0,e.working?Math.floor(clock*16):0,e.working?e.id:0,e.workResource||'',e.facing||1,Math.round((e.gateOpen||0)*4),e.kind==='transport'?(A.transportOpen?.(e)?1:0):0,v.nation,v.era].join(':'),old=cache.get(key);if(old)return old;const w=Math.ceil(m.width+40),h=Math.ceil(m.height+100),x=Math.ceil(w/2),y=h-80,c=Object.assign(document.createElement('canvas'),{width:w,height:h}),g=c.getContext('2d'),copy={...e,x,y,id:0,_actionSeed:e.id,_rampTarget:e.kind==='transport'?A.transportOpen?.(e):undefined,complete:true,progress:1,hp:100,maxhp:100,flash:0,attackPulse:e.attackPulse||0,cool:e.cool||0,working:!!e.working,_carryPose:A.carryingPose?.(e),actionAt:e.actionAt??-100,lastHurtAt:-100,order:null,path:[],facing:e.facing||1};d?.building?building(g,copy,0,false,false):d?unit(g,copy,clock,false):node(g,copy,0);const data=g.getImageData(0,0,w,h).data,alpha=new Uint8Array(w*h),edge=g.createImageData(w,h);let minx=w,miny=h,maxx=0,maxy=0;for(let j=0;j<alpha.length;j++)if(data[j*4+3]>105){alpha[j]=1;const xx=j%w,yy=Math.floor(j/w);minx=Math.min(minx,xx);maxx=Math.max(maxx,xx);miny=Math.min(miny,yy);maxy=Math.max(maxy,yy)}for(let yy=1;yy<h-1;yy++)for(let xx=1;xx<w-1;xx++){const i=yy*w+xx;if(alpha[i]&&(!alpha[i-1]||!alpha[i+1]||!alpha[i-w]||!alpha[i+w]))edge.data.set([244,218,145,255],i*4)}g.putImageData(edge,0,0);const result={w,h,x,y,alpha,edge:c,bounds:{x:minx-x,y:miny-y,width:maxx-minx+1,height:maxy-miny+1}};if(cache.size>=240)cache.delete(cache.keys().next().value);cache.set(key,result);return result}
A.entityBounds=e=>mask(e).bounds;A.entityMask=mask;
A.hitEntity=(e,p,padding=0)=>{if(e.kind==='wood')padding=Math.max(padding,1);const d=D[e.kind],m=extent(e),halfHeight=e.kind==='carrier'?m.height/2+20:m.height+20,below=e.kind==='carrier'?m.height/2+20:d?.wall&&d.vertical?65:22;if(Math.abs(p.x-e.x)>m.width/2+20||p.y<e.y-halfHeight||p.y>e.y+below)return false;const a=mask(e),x=Math.round(p.x-e.x+a.x),y=Math.round(p.y-e.y+a.y);for(let dy=-padding;dy<=padding;dy++)for(let dx=-padding;dx<=padding;dx++){const X=x+dx,Y=y+dy;if(X>=0&&Y>=0&&X<a.w&&Y<a.h&&a.alpha[Y*a.w+X])return true}return false};
A.traceEntity=(c,e)=>{const a=mask(e);c.save();c.globalAlpha*=.9;c.drawImage(a.edge,e.x-a.x,e.y-a.y);c.restore()};
A.building=(c,b,t,selected,ghost)=>{const r=building(c,b,t,false,ghost);if(selected&&!ghost)A.traceEntity(c,b);return r};
A.ready=A.ready.then(v=>{cache.clear();return v});

// Occluded-unit ghost: built once per (mask, team colour) from the picking alpha; 1.5 px outline (full + half-strength ring) over a light fill.
function ghost(a,colour){let m=a.ghosts;if(!m)m=a.ghosts=new Map();let c=m.get(colour);if(c)return c;const w=a.w,h=a.h,al=a.alpha,rgb=/^#[0-9a-f]{6}/i.test(colour)?[1,3,5].map(i=>parseInt(colour.slice(i,i+2),16)):[232,224,192];
 c=Object.assign(document.createElement('canvas'),{width:w,height:h});const g=c.getContext('2d'),p=g.createImageData(w,h),d=p.data,edge=new Uint8Array(w*h);
 // close 1-2 px holes in the picking alpha first, so the outline follows the silhouette, not internal speckles
 const dil=new Uint8Array(w*h),cl=new Uint8Array(w*h);for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;dil[i]=al[i]|al[i-1]|al[i+1]|al[i-w]|al[i+w]}for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;cl[i]=dil[i]&dil[i-1]&dil[i+1]&dil[i-w]&dil[i+w]}
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;if(cl[i]&&(!cl[i-1]||!cl[i+1]||!cl[i-w]||!cl[i+w]))edge[i]=2}
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;if(cl[i]&&!edge[i]&&(edge[i-1]===2||edge[i+1]===2||edge[i-w]===2||edge[i+w]===2))edge[i]=1}
 for(let i=0;i<w*h;i++){if(!cl[i])continue;const k=i*4;d[k]=rgb[0];d[k+1]=rgb[1];d[k+2]=rgb[2];d[k+3]=edge[i]===2?165:edge[i]===1?60:26}
 g.putImageData(p,0,0);if(m.size>=6)m.delete(m.keys().next().value);m.set(colour,c);return c}
// Fog filtering happens before this pass. Reject impossible overlaps before reading sprite pixels.
A.drawOccluded=(c,list,t,alpha=1)=>{
 const blockers=list.filter(({e,type})=>type==='building'||type==='node'&&['wood','gold','stone'].includes(e.kind))
  .map(({e})=>{
   const m=extent(e),halfWidth=m.width/2+20;
   return {e,left:e.x-halfWidth,right:e.x+halfWidth,top:e.y-m.height-20,bottom:e.y+(D[e.kind]?.wall&&D[e.kind].vertical?65:22)};
  });
 if(!blockers.length)return;
 for(const {e:source,type}of list){
  if(type!=='unit'||source.embarkedOn)continue;
  const u=A.renderUnit?.(source,alpha)||source,m=extent(u);
  // All opaque pixels and sample points lie inside the mask canvas.
  const halfWidth=Math.ceil(Math.ceil(m.width+40)/2);
  const top=u.y-Math.ceil(m.height+100)+80;
  const possible=blockers.filter(b=>b.e.y>u.y&&b.right>=u.x-halfWidth&&b.left<=u.x+halfWidth&&b.bottom>=top&&b.top<=u.y+80);
  if(!possible.length)continue;
  const b=A.entityBounds(u);
  const points=[.25,.5,.75].map(q=>({x:u.x+b.x+b.width*q,y:u.y+b.y+b.height*.45}));
  if(!possible.some(({e})=>points.some(p=>A.hitEntity(e,p))))continue;
  // V41: faint team-colour outline + 22% fill from the cached mask (one drawImage, no ctx.filter, no second sprite render).
  const a=A.entityMask(u),img=ghost(a,A.teamColor?.(u)||'#e8e0c0');c.drawImage(img,u.x-a.x,u.y-a.y);
 }
};
})();
