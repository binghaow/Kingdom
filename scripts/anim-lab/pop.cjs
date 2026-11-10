// Measures sprite bbox of idle (base art) vs the four authored attack frames, per kind/direction, through production A.unit
const {open}=require('./lib.cjs');
(async()=>{const {b,p}=await open({query:'?'});
const kinds=process.argv.slice(2);
const res=await p.evaluate(async kinds=>{const A=KingdomArt,K=KingdomSim,D=K.defs;const man=await fetch('attack-manifest.json').then(r=>r.json());
 A.setPresentation({state:{time:5,nations:['britain','france'],ages:[5,5],tech:[{},{}],units:[]},carryingCapacity:()=>12});
 const cv=document.createElement('canvas');cv.width=500;cv.height=500;const g=cv.getContext('2d',{willReadFrequently:true});
 function bbox(u){g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,500,500);A.unit(g,{...u,x:250,y:350},5,false);const d=g.getImageData(0,0,500,500).data;let l=500,r=0,t=500,bt=0;for(let y=0;y<500;y++)for(let x=0;x<500;x++){if(d[(y*500+x)*4+3]>150){if(x<l)l=x;if(x>r)r=x;if(y<t)t=y;if(y>bt)bt=y}}return{h:bt-t+1,w:r-l+1,cx:(l+r)/2-250,feet:bt-350,top:t-350}}
 const out=[];for(const kind of kinds){await A.attackReady(kind);for(const dir of ['front','right']){const id={team:0,id:7,hp:100,maxhp:100,kind:kind,path:[],viewDirection:dir,facing:dir==='left'?-1:1};const idle=bbox(id);const fr=[0,1,2,3].map(f=>bbox({...id,_attackPreview:{id:kind,direction:dir,phase:f/3}}));out.push({kind,dir,idle,fr})}}
 return out},kinds);
for(const r of res){const f=r.fr;console.log(r.kind.padEnd(11),r.dir.padEnd(6),'idle h/w/cx/feet',[r.idle.h,r.idle.w,r.idle.cx,r.idle.feet].join('/'),'| atk h',f.map(x=>x.h).join(','),'w',f.map(x=>x.w).join(','),'cx',f.map(x=>x.cx).join(','),'feet',f.map(x=>x.feet).join(','))}
await b.close()})();
