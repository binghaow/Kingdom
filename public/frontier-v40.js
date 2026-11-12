/* v40 gameplay layer (docs/gameplay-v39.md, section "v40 改动"). Shared by single-player and the authoritative server
   (network-model.js builds on it). Everything here is deterministic: map layout uses its own seeded generator (never the
   match RNG), computer decisions use the simulation RNG, and all new state lives in saved/synced fields.
   1. Resource layout: limited home gold/stone, rich symmetric sites in the middle / far flanks, rich bundles on islands. */
((root)=>{'use strict';const K=typeof module!=='undefined'&&module.exports?require('./roster.js'):root.KingdomSim,Base=K.Sim,D=K.defs,dist=K.distance;

/* ---- 1. resource layout ---- */
const CELL=48,HOME_RADIUS=1100;
/* Home keeps the nearest nodes only: enough to open (age II, first army) but not a whole match. */
const HOME_KEEP={gold:3,stone:2};
/* Per-player sites, polar around each start relative to the start→middle direction (r as a share of that distance). The
   same polar spot is used for every player (mirrored for the second of each pair), so the sites are equivalent. */
const SITES=[
 {id:'mid-gold',r:[0,.5],a:[-.55,.55],bundle:{gold:[4,3200],stone:[2,2800]}},
 {id:'mid-stone',r:[.1,.6],a:[.55,1.25],bundle:{stone:[4,3000],gold:[2,2600],wood:[10,450]}},
 {id:'far-flank',r:[.3,1],a:[1.3,2.2],bundle:{gold:[3,3200],wood:[16,450]}}];
const CENTER={gold:[4,3600],stone:[3,3200]};
/* Each player's share of island riches; islands nearer one player count for that player, equidistant ones are shared. */
const ISLAND_PER_PLAYER={gold:14000,stone:9000,wood:5400};
const CAMP_REWARD={gold:4800,stone:2400};
/* Fair split: items owned by every player (equidistant) are contested; items nearer one player count only when every
   player has one. Returns, per item, the share of ONE player's total it carries (0 = item gets no riches). */
function fairShares(owner,players){const shared=owner.filter(o=>o.length===players).length,excl=Array.from({length:players},(_,t)=>owner.filter(o=>o.length===1&&o[0]===t).length),allEx=excl.every(n=>n>0),fShared=shared?(allEx?.5:1):0;
 return owner.map(o=>o.length===players?fShared*o.length/shared:o.length===1&&allEx?(1-fShared)/excl[o[0]]:0)}
function hashSeed(...v){let h=2166136261>>>0;for(const x of v.join('|'))h=Math.imul(h^x.charCodeAt(0),16777619)>>>0;return h||1}
function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
/* Connected land (bridges count as land) on a 48 px grid; islands are land regions that hold no start. */
function landRegions(w){const cols=Math.ceil(w.width/CELL),rows=Math.ceil(w.height/CELL),lab=new Int32Array(cols*rows).fill(-1),cells=[];const land=(x,y)=>K.worldPlayable?.(w,x,y)!==false&&(!K.worldWater(w,x,y)||!!K.worldBridge?.(w,x,y));let n=0;
 for(let i=0;i<cols*rows;i++){const c=i%cols,r=(i/cols)|0;if(lab[i]>=0||!land(c*CELL+24,r*CELL+24))continue;const q=[i],list=[];lab[i]=n;while(q.length){const j=q.pop();list.push(j);const jc=j%cols,jr=(j/cols)|0;for(const [dc,dr]of[[1,0],[-1,0],[0,1],[0,-1]]){const a=jc+dc,b=jr+dr;if(a<0||b<0||a>=cols||b>=rows)continue;const k=b*cols+a;if(lab[k]>=0||!land(a*CELL+24,b*CELL+24))continue;lab[k]=n;q.push(k)}}cells.push(list);n++}
 const at=(x,y)=>{const c=Math.min(cols-1,Math.max(0,Math.floor(x/CELL))),r=Math.min(rows-1,Math.max(0,Math.floor(y/CELL)));return lab[r*cols+c]};
 const center=i=>{let x=0,y=0;for(const j of cells[i]){x+=(j%cols)*CELL+24;y+=((j/cols)|0)*CELL+24}return{x:x/cells[i].length,y:y/cells[i].length}};
 return{at,cells,cols,center}}
/* Census used by the docs table and check: per player, resources near home / elsewhere on land / on islands. */
function resourceZones(sim){const w=sim.world,R=landRegions(w),starts=w.starts.slice(0,sim.s.nations.length),home=starts.map(p=>R.at(p.x,p.y)),zones=starts.map(()=>({home:{},outer:{},island:{},camp:{}}));
 for(const n of sim.s.nodes){if(n.domain==='sea'||!(n.amount>0))continue;const res=n.resource||n.kind,reg=R.at(n.x,n.y),d=starts.map(p=>Math.hypot(n.x-p.x,n.y-p.y)),min=Math.min(...d),near=Array.isArray(n.owners)?n.owners:d.map((v,i)=>v<=min*1.15?i:-1).filter(i=>i>=0);let z;if(/^wild-/.test(n.cluster||''))z='camp';else if(reg>=0&&!home.includes(reg))z='island';else if(min<HOME_RADIUS&&reg===home[near[0]])z='home';else z='outer';
  for(const t of near){const add=zones[t][z];add[res]=(add[res]||0)+n.amount/near.length}}
 return zones}

class FrontierV40 extends Base{
 constructor(difficulty,saved,options={}){super(difficulty,saved,options);if(!saved&&!options.keepLayout){this.layoutResources();this.s.resourceLayout=40}}
 layoutResources(){const s=this.s,w=this.world;if(!w?.starts?.length)return;const starts=w.starts.slice(0,s.nations.length);if(starts.length<2)return;
  const rand=rng(hashSeed(w.id,w.seed??'',starts.length,s.minerals||'')),R=landRegions(w),homeReg=starts.map(p=>R.at(p.x,p.y)),rich=s.minerals==='rich'?2:1;
  const mid={x:starts.reduce((n,p)=>n+p.x,0)/starts.length,y:starts.reduce((n,p)=>n+p.y,0)/starts.length};
  const taken=[],ok=(p,region,gap=46)=>p.x>90&&p.y>90&&p.x<w.width-90&&p.y<w.height-90&&(region===undefined||R.at(p.x,p.y)===region)&&!this.blocked(p.x,p.y)&&s.buildings.every(b=>dist(b,p)>D[b.kind].r+60)&&taken.every(q=>dist(q,p)>gap)&&!K.worldRocky?.(w,p.x,p.y);
  // 1a. home: keep the nearest few gold/stone nodes of each start; the rest of the home deposits are removed.
  const drop=new Set();for(let t=0;t<starts.length;t++)for(const [res,keep]of Object.entries(HOME_KEEP)){const list=s.nodes.filter(n=>!n.domain&&n.resource===res&&(n.home===t||dist(n,starts[t])<HOME_RADIUS&&R.at(n.x,n.y)===homeReg[t])).sort((a,b)=>dist(a,starts[t])-dist(b,starts[t]));list.slice(keep).forEach(n=>drop.add(n))}
  // 1b. unowned land gold/stone (old frontier clusters, uneven between players) is replaced by the equivalent sites below.
  for(const n of s.nodes)if(!n.domain&&['gold','stone'].includes(n.resource)&&n.home===undefined&&!String(n.cluster||'').startsWith('wild-'))drop.add(n);
  s.nodes=s.nodes.filter(n=>!drop.has(n));for(const n of s.nodes)if(!n.domain)taken.push(n);
  const place=(c,bundle,tag,region)=>{const out=[];let i=0;for(const [res,[count,amount]]of Object.entries(bundle)){for(let k=0;k<count;k++,i++){let p=null;for(let tries=0;tries<24&&!p;tries++){const ring=res==='wood'?110+Math.floor(k/6)*52:44+Math.floor(k/4)*44,a=(k/(res==='wood'?6:4))*Math.PI*2+(res==='gold'?0:res==='stone'?Math.PI:Math.PI/2)+tries*.7,q={x:c.x+Math.cos(a)*(ring+tries*6),y:c.y+Math.sin(a)*(ring+tries*6)};if(ok(q,region,res==='wood'?40:46))p=q}if(!p)continue;taken.push(p);out.push({id:s.id++,kind:res,resource:res,x:p.x,y:p.y,amount:amount*(res==='wood'?1:rich),maxAmount:amount*(res==='wood'?1:rich),subtype:res==='wood'?'forest':'ore',variant:rand(),...(res==='wood'?{forest:true}:{}),cluster:tag,site:tag})}}return out};
  // 1c. per-player equivalent sites (same polar spot from every start; odd players mirrored).
  const dir=starts.map(p=>Math.atan2(mid.y-p.y,mid.x-p.x)),span=starts.map(p=>Math.max(900,dist(p,mid))),sites=[];
  for(const site of SITES){for(let tries=0;tries<220;tries++){const widen=Math.floor(tries/70)*.15,r=site.r[0]-widen/2+rand()*(site.r[1]-site.r[0]+widen),a=(site.a[0]-widen+rand()*(site.a[1]-site.a[0]+2*widen))*(rand()<.5?-1:1),spots=starts.map((p,t)=>{const ang=dir[t]+a*(t%2?-1:1),lo=HOME_RADIUS+150,hi=Math.max(lo+500,span[t]*1.05),d=lo+Math.max(0,Math.min(1.1,r))*(hi-lo);return{x:p.x+Math.cos(ang)*d,y:p.y+Math.sin(ang)*d}});
    if(spots.every((q,t)=>ok(q,homeReg[t],320)&&starts.every((o,u)=>dist(q,o)>HOME_RADIUS+120))){const nodes=spots.map((q,t)=>place(q,site.bundle,site.id+'-'+t,homeReg[t]));nodes.forEach((list,t)=>list.forEach(n=>n.owners=[t]));const counts=nodes.map(list=>list.length);if(Math.min(...counts)===Math.max(...counts)){s.nodes.push(...nodes.flat());sites.push({id:site.id,spots});break}for(const list of nodes)for(const n of list)taken.splice(taken.findIndex(q=>q.x===n.x&&q.y===n.y),1)}}}
  // 1d. one shared site in the middle (equidistant), if there is land there.
  const axis=starts.length===2?Math.atan2(starts[1].y-starts[0].y,starts[1].x-starts[0].x)+Math.PI/2:0;for(let k=0;k<12;k++){const off=(k%2?1:-1)*Math.ceil(k/2)*160,c={x:mid.x+Math.cos(axis)*off,y:mid.y+Math.sin(axis)*off};if(ok(c,undefined,320)&&homeReg.includes(R.at(c.x,c.y))&&starts.every(o=>dist(c,o)>HOME_RADIUS+120)){const list=place(c,CENTER,'mid-shared',R.at(c.x,c.y));for(const n of list)n.owners=starts.map((_,t)=>t);s.nodes.push(...list);sites.push({id:'mid-shared',spots:[c]});break}}
  // 1e. islands: every island of at least 20 cells gets a rich bundle; amounts make each player's island share equal.
  const islands=R.cells.map((c,i)=>({i,size:c.length})).filter(x=>x.size>=20&&!homeReg.includes(x.i)).map(x=>({...x,c:R.center(x.i)}));
  if(islands.length){const owner=islands.map(x=>{const d=starts.map(p=>dist(p,x.c)),min=Math.min(...d);return d.map((v,t)=>v<=min*1.15?t:-1).filter(t=>t>=0)}),share=fairShares(owner,starts.length);
   islands.forEach((x,k)=>{const bundle={};for(const [res,total]of Object.entries(ISLAND_PER_PLAYER)){const amount=share[k]>0?total*share[k]:res==='wood'?1800:0;if(!(amount>0))continue;const per=res==='wood'?450:3000,count=Math.max(1,Math.round(amount/per));bundle[res]=[count,Math.round(amount/count)]}const o=owner[k];
    let c=x.c;if(R.at(c.x,c.y)!==x.i){const cols=R.cols,j=R.cells[x.i][Math.floor(R.cells[x.i].length/2)];c={x:(j%cols)*CELL+24,y:((j/cols)|0)*CELL+24}}const list=place(c,bundle,'island-'+k,x.i);for(const n of list){n.island=true;n.owners=o.slice()}s.nodes.push(...list);sites.push({id:'island',spots:[c],owner:o})})}
  // 1f. guarded wild camps keep a fixed reward per camp (their positions come from the wildlands generator).
  const camps=new Map();for(const n of s.nodes){const m=/^wild-(\d+)-(gold|stone)$/.exec(n.cluster||'');if(!m||n.domain)continue;const k=m[1]+m[2];if(!camps.has(k))camps.set(k,{res:m[2],nodes:[]});camps.get(k).nodes.push(n)}
  const campList=[...camps.values()],campOwner=campList.map(c=>{const x=c.nodes.reduce((n,q)=>n+q.x,0)/c.nodes.length,y=c.nodes.reduce((n,q)=>n+q.y,0)/c.nodes.length,d=starts.map(p=>Math.hypot(p.x-x,p.y-y)),min=Math.min(...d);return d.map((v,t)=>v<=min*1.15?t:-1).filter(t=>t>=0)}),campShare=fairShares(campOwner,starts.length);
  campList.forEach((c,k)=>{for(const n of c.nodes)n.owners=campOwner[k].slice();const total=CAMP_REWARD[c.res]*rich*campShare[k],each=Math.round(total/c.nodes.length);if(!(each>0)){for(const n of c.nodes)drop.add(n);return}for(const n of c.nodes){n.amount=n.maxAmount=each}});s.nodes=s.nodes.filter(n=>!drop.has(n));
  s.resourceSites=sites.map(x=>({id:x.id,spots:x.spots.map(p=>({x:Math.round(p.x),y:Math.round(p.y)})),owner:x.owner}));
  this.grid=this.seaGrid=null;this._gateGrids=null}
}
const api={...K,Sim:FrontierV40,landRegions,resourceZones,v40Layout:{CAMP_REWARD,HOME_KEEP,SITES,CENTER,ISLAND_PER_PLAYER,HOME_RADIUS}};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.KingdomSim=api;
})(typeof window==='undefined'?globalThis:window);
