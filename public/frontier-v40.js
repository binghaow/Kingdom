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
const ISLAND_PER_PLAYER={gold:14000,stone:9000,wood:7200,food:3600};
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

/* ---- 2. computer expansion and tactics (difficulty = strength / speed / how much of each ability is on) ----
   sites: how many outside resource points to hold; start/every: when and how often to claim; defend: 0 none, 1 tower,
   2 tower + wall segments; raid: share of remote-raid chances on the player's outlying gatherers and drop sites; flank:
   chance a main attack sends a small flanking group by another lane (or by sea); island: transport landings on islands;
   spread: how far the base grows per age; agePace: multiplies the doctrine's age-up deadlines (lower = faster). */
const AI_LEVEL={
 sandbox:{sites:0,start:1e9,every:1e9,defend:0,raid:0,flank:0,island:0,spread:0,agePace:1},
 beginner:{sites:0,start:1e9,every:1e9,defend:0,raid:0,flank:0,island:0,spread:0,agePace:1.6},
 easy:{sites:1,start:600,every:330,defend:0,raid:0,flank:0,island:0,spread:.08,agePace:1.35},
 normal:{sites:2,start:420,every:220,defend:1,raid:.5,flank:.4,island:780,spread:.16,agePace:1},
 hard:{sites:3,start:330,every:160,defend:1,raid:1,flank:.65,island:600,spread:.22,agePace:.8},
 expert:{sites:4,start:270,every:120,defend:2,raid:1,flank:.85,island:480,spread:.28,agePace:.68}};
/* Doctrine flavour on top (identity unchanged): expansion claims earlier and one more point; turtle walls its points;
   rush holds one point less. */
const DOCTRINE_FRONTIER={rush:{sites:-1,start:60},boom:{},expand:{sites:1,start:-150,every:-40},turtle:{defend:1}};
/* ---- 4. computer army size (difficulty-scaled; replaces the old flat 45-unit goal and 14–60 military-pop caps) ----
   cap: military population cap (expert: only the population cap limits it); villagers: extra villagers on top of the
   doctrine's goal from age II (half in age I); halls: extra barracks/ranges/stables when resources pile up; queue:
   units queued per military building when the bank allows. Composition stays with the doctrine + counter scoring. */
const ARMY_LEVEL={sandbox:{cap:0,villagers:0,halls:0,queue:1},beginner:{cap:14,villagers:0,halls:0,queue:1},easy:{cap:30,villagers:2,halls:0,queue:1},normal:{cap:60,villagers:6,halls:1,queue:1},hard:{cap:100,villagers:12,halls:2,queue:2},expert:{cap:400,villagers:16,halls:3,queue:2}};
/* ---- 5. commander (hero) presence ----
   aura: own non-hero land soldiers within `radius` of a living hero get +damage%, +armor and +speed%.
   nation: while the hero lives, villagers gather +gather% (generic national bonus, same for every nation for now).
   fallen: when the hero dies the whole nation's attack drops by mourn% for mournFor seconds; respawn wait unchanged.
   survival: hero health ×hp and +armor; below retreatAt of health a hero that is not on an explicit move/attack
   order falls back to the nearest own town or fort (player orders always win). */
const HERO={radius:320,damage:.08,armor:1,speed:.05,gather:.1,mourn:.05,mournFor:60,hp:1.4,armorBonus:2,retreatAt:.35,respawn:180};
for(const d of Object.values(D))if(d.hero&&!d.companion&&!d.__v40hero){d.hp=Math.round(d.hp*HERO.hp);d.baseArmor=(d.baseArmor||0)+HERO.armorBonus;d.__v40hero=true}
/* ---- 3. scout balloon: artillery spotting and map survey (bombers unchanged) ----
   Spotting: own cannon-line / mortar-line artillery and mortar ships standing inside an own balloon's sight get +15%
   range and may pick targets anywhere the team can see within that range. Survey: every half second a balloon records
   resource deposits and relics within 1.35 × its sight into the team's permanent memory, even beyond its vision. */
const BALLOON={spotRange:.15,surveyMult:1.35,acquireCap:700};
const SPOT_ROLES=['cannon','bombship'];
if(D.scoutballoon)D.scoutballoon.description='III 时代，无需研究：无攻击能力，飞越地形提供超大视野。炮兵观测：视野内己方火炮、臼炮与迫击炮舰射程 +'+Math.round(BALLOON.spotRange*100)+'%，并可攻击气球看到的目标。地图测绘：飞过时把 '+BALLOON.surveyMult+' 倍视野内的资源点与遗迹永久标在地图上';
if(D.aerodrome)D.aerodrome.description='III 时代起训练侦察热气球（视野、炮兵观测、地图测绘）；研究航空工程后训练双翼轰炸机，军机在此补弹';
class FrontierV40 extends Base{
 constructor(difficulty,saved,options={}){super(difficulty,saved,options);if(!saved&&!options.keepLayout){this.layoutResources();this.s.resourceLayout=40}}
 layoutResources(){const s=this.s,w=this.world;if(!w?.starts?.length)return;const starts=w.starts.slice(0,s.nations.length);if(starts.length<2)return;const wallCache=[this._wallParts,this._wallSignature,this._wallCheckedAt];
  const rand=rng(hashSeed(w.id,w.seed??'',starts.length,s.minerals||'')),R=landRegions(w),homeReg=starts.map(p=>R.at(p.x,p.y)),rich=s.minerals==='rich'?2:1;
  const mid={x:starts.reduce((n,p)=>n+p.x,0)/starts.length,y:starts.reduce((n,p)=>n+p.y,0)/starts.length};
  const taken=[],ok=(p,region,gap=46)=>p.x>90&&p.y>90&&p.x<w.width-90&&p.y<w.height-90&&(region===undefined||R.at(p.x,p.y)===region)&&!this.blocked(p.x,p.y)&&s.buildings.every(b=>dist(b,p)>D[b.kind].r+60)&&taken.every(q=>dist(q,p)>gap)&&!K.worldRocky?.(w,p.x,p.y);
  // 1a. home: keep the nearest few gold/stone nodes of each start; the rest of the home deposits are removed.
  const drop=new Set();for(let t=0;t<starts.length;t++)for(const [res,keep]of Object.entries(HOME_KEEP)){const list=s.nodes.filter(n=>!n.domain&&n.resource===res&&(n.home===t||dist(n,starts[t])<HOME_RADIUS&&R.at(n.x,n.y)===homeReg[t])).sort((a,b)=>dist(a,starts[t])-dist(b,starts[t]));list.slice(keep).forEach(n=>drop.add(n))}
  // 1b. unowned land gold/stone (old frontier clusters, uneven between players) is replaced by the equivalent sites below.
  for(const n of s.nodes)if(!n.domain&&['gold','stone'].includes(n.resource)&&n.home===undefined&&!String(n.cluster||'').startsWith('wild-'))drop.add(n);
  s.nodes=s.nodes.filter(n=>!drop.has(n));for(const n of s.nodes)if(!n.domain)taken.push(n);
  const place=(c,bundle,tag,region)=>{const out=[];let i=0;for(const [res,[count,amount]]of Object.entries(bundle)){for(let k=0;k<count;k++,i++){let p=null;for(let tries=0;tries<24&&!p;tries++){const ring=res==='wood'?110+Math.floor(k/6)*52:44+Math.floor(k/4)*44,a=(k/(res==='wood'?6:4))*Math.PI*2+(res==='gold'?0:res==='stone'?Math.PI:Math.PI/2)+tries*.7,q={x:c.x+Math.cos(a)*(ring+tries*6),y:c.y+Math.sin(a)*(ring+tries*6)};if(ok(q,region,res==='wood'?40:46))p=q}if(!p)continue;taken.push(p);out.push({id:s.id++,kind:res,resource:res,x:p.x,y:p.y,amount:amount*(res==='wood'?1:rich),maxAmount:amount*(res==='wood'?1:rich),subtype:res==='wood'?'forest':res==='food'?'berries':'ore',variant:rand(),...(res==='wood'?{forest:true}:{}),cluster:tag,site:tag})}}return out};
  // 1c. per-player equivalent sites (same polar spot from every start; odd players mirrored).
  const dir=starts.map(p=>Math.atan2(mid.y-p.y,mid.x-p.x)),span=starts.map(p=>Math.max(900,dist(p,mid))),sites=[];
  for(const site of SITES){for(let tries=0;tries<220;tries++){const widen=Math.floor(tries/70)*.15,r=site.r[0]-widen/2+rand()*(site.r[1]-site.r[0]+widen),a=(site.a[0]-widen+rand()*(site.a[1]-site.a[0]+2*widen))*(rand()<.5?-1:1),spots=starts.map((p,t)=>{const ang=dir[t]+a*(t%2?-1:1),lo=HOME_RADIUS+150,hi=Math.max(lo+500,span[t]*1.05),d=lo+Math.max(0,Math.min(1.1,r))*(hi-lo);return{x:p.x+Math.cos(ang)*d,y:p.y+Math.sin(ang)*d}});
    if(spots.every((q,t)=>ok(q,homeReg[t],320)&&starts.every((o,u)=>dist(q,o)>HOME_RADIUS+120))){const nodes=spots.map((q,t)=>place(q,site.bundle,site.id+'-'+t,homeReg[t]));nodes.forEach((list,t)=>list.forEach(n=>n.owners=[t]));const counts=nodes.map(list=>list.length);if(Math.min(...counts)===Math.max(...counts)){s.nodes.push(...nodes.flat());sites.push({id:site.id,spots});break}for(const list of nodes)for(const n of list)taken.splice(taken.findIndex(q=>q.x===n.x&&q.y===n.y),1)}}}
  // 1d. one shared site in the middle (equidistant), if there is land there.
  const axis=starts.length===2?Math.atan2(starts[1].y-starts[0].y,starts[1].x-starts[0].x)+Math.PI/2:0;for(let k=0;k<12;k++){const off=(k%2?1:-1)*Math.ceil(k/2)*160,c={x:mid.x+Math.cos(axis)*off,y:mid.y+Math.sin(axis)*off};if(ok(c,undefined,320)&&homeReg.includes(R.at(c.x,c.y))&&starts.every(o=>dist(c,o)>HOME_RADIUS+120)){const list=place(c,CENTER,'mid-shared',R.at(c.x,c.y));for(const n of list)n.owners=starts.map((_,t)=>t);s.nodes.push(...list);sites.push({id:'mid-shared',spots:[c]});break}}
  // 1e. islands: every island of at least 20 cells gets a rich bundle; amounts make each player's island share equal.
  const islands=R.cells.map((c,i)=>({i,size:c.length})).filter(x=>x.size>=20&&!homeReg.includes(x.i)).map(x=>({...x,c:R.center(x.i)}));
  // v43: natural forests on islands are replaced by the fair bundle (the random forests differed between mirrored islands); when
  // not every player has an island of their own (3-5 players), every island is contested by all players instead of left poor.
  if(islands.length){const isl=new Set(islands.map(x=>x.i));s.nodes=s.nodes.filter(n=>n.domain||n.resource!=='wood'||n.site||/^wild-/.test(n.cluster||'')||!isl.has(R.at(n.x,n.y)));for(let k=taken.length-1;k>=0;k--){const q=taken[k];if(isl.has(R.at(q.x,q.y))&&!s.nodes.some(n=>n.x===q.x&&n.y===q.y))taken.splice(k,1)}}
  if(islands.length){let owner=islands.map(x=>{const d=starts.map(p=>dist(p,x.c)),min=Math.min(...d);return d.map((v,t)=>v<=min*1.15?t:-1).filter(t=>t>=0)});const excl=starts.map((_,t)=>owner.some(o=>o.length===1&&o[0]===t));if(!excl.every(Boolean))owner=owner.map(()=>starts.map((_,t)=>t));const share=fairShares(owner,starts.length);
   islands.forEach((x,k)=>{const bundle={};for(const [res,total]of Object.entries(ISLAND_PER_PLAYER)){const amount=share[k]>0?total*share[k]:res==='wood'?1800:0;if(!(amount>0))continue;const per=(res==='wood'?600:res==='food'?1800:3000)*Math.max(1,starts.length/2),count=Math.max(1,Math.round(amount/per));bundle[res]=[count,Math.round(amount/count)]}const o=owner[k];
    let c=x.c;if(R.at(c.x,c.y)!==x.i){const cols=R.cols,j=R.cells[x.i][Math.floor(R.cells[x.i].length/2)];c={x:(j%cols)*CELL+24,y:((j/cols)|0)*CELL+24}}const list=place(c,bundle,'island-'+k,x.i);for(const n of list){n.island=true;n.owners=o.slice()}s.nodes.push(...list);sites.push({id:'island',spots:[c],owner:o})})}
  // 1f. guarded wild camps keep a fixed reward per camp (their positions come from the wildlands generator).
  const camps=new Map();for(const n of s.nodes){const m=/^wild-(\d+)-(gold|stone)$/.exec(n.cluster||'');if(!m||n.domain)continue;const k=m[1]+m[2];if(!camps.has(k))camps.set(k,{res:m[2],nodes:[]});camps.get(k).nodes.push(n)}
  const campList=[...camps.values()],campOwner=campList.map(c=>{const x=c.nodes.reduce((n,q)=>n+q.x,0)/c.nodes.length,y=c.nodes.reduce((n,q)=>n+q.y,0)/c.nodes.length,d=starts.map(p=>Math.hypot(p.x-x,p.y-y)),min=Math.min(...d);return d.map((v,t)=>v<=min*1.15?t:-1).filter(t=>t>=0)}),campShare=fairShares(campOwner,starts.length);
  campList.forEach((c,k)=>{for(const n of c.nodes)n.owners=campOwner[k].slice();const total=CAMP_REWARD[c.res]*rich*campShare[k],each=Math.round(total/c.nodes.length);if(!(each>0)){for(const n of c.nodes)drop.add(n);return}for(const n of c.nodes){n.amount=n.maxAmount=each}});s.nodes=s.nodes.filter(n=>!drop.has(n));
  s.resourceSites=sites.map(x=>({id:x.id,spots:x.spots.map(p=>({x:Math.round(p.x),y:Math.round(p.y)})),owner:x.owner}));
  // leave the navigation/wall caches exactly as an untouched new match has them (placement probing built them early)
  this.grid=this.seaGrid=null;this._gateGrids=null;this._wallParts=wallCache[0];this._wallSignature=wallCache[1];this._wallCheckedAt=wallCache[2]}

 /* ---- 3. balloon ---- */
 balloons(team){const s=this.s;if(this._balloonAt!==s.time){this._balloonAt=s.time;const m=new Map();for(const u of s.units)if(u.kind==='scoutballoon'&&u.hp>0&&!u.embarkedOn){let list=m.get(u.team);if(!list)m.set(u.team,list=[]);list.push(u)}this._balloonMap=m}return this._balloonMap.get(team)||[]}
 spotted(e){const d=D[e.kind];if(!d||!SPOT_ROLES.includes(d.role)||e.team<0||e.embarkedOn)return false;if(e.__spotted)return true;for(const b of this.balloons(e.team))if(dist(b,e)<=this.sight(b))return true;return false}
 stat(e,key){let v=super.stat(e,key);if(key==='range'&&this.spotted(e))v*=1+BALLOON.spotRange;if(key==='damage'||key==='armor'||key==='speed'){if(this.inAura(e)){if(key==='damage')v*=1+HERO.damage;else if(key==='armor')v+=HERO.armor;else v*=1+HERO.speed}if(key==='damage'&&this.mourning(e.team))v*=1-HERO.mourn}return v}
 /* ---- 5. hero ---- */
 heroes(team){const s=this.s;if(this._heroAt!==s.time){this._heroAt=s.time;const m=new Map();for(const u of s.units)if(D[u.kind]?.hero&&!D[u.kind].companion&&u.hp>0&&!u.embarkedOn)m.set(u.team,u);this._heroMap=m}return this._heroMap.get(team)||null}
 inAura(e){if(e.__aura)return true;const d=D[e.kind];if(!d||d.hero||d.building||!(d.damage>0)||e.kind==='villager'||e.team<0||e.embarkedOn||this.sea?.(e)||this.air?.(e))return false;const h=this.heroes(e.team);return !!h&&dist(h,e)<=HERO.radius}
 mourning(team){return (this.s.heroMourning?.[team]||0)>this.s.time}
 heroRespawnDelay(){return HERO.respawn}
 gatherRate(u,target){const v=super.gatherRate(u,target);return u.kind==='villager'&&this.heroes(u.team)?v*(1+HERO.gather):v}
 autoAcquireRadius(u){const r=super.autoAcquireRadius(u);return this.spotted(u)?Math.max(r,Math.min(BALLOON.acquireCap,this.stat(u,'range')+60)):r}
 surveyed(team,e){return !!this.s.surveyed?.[team]?.includes(e.id)}
 survey(){const s=this.s,f=this.fog;if(!f||!s.fogEnabled)return;s.surveyed??=s.nations.map(()=>[]);for(const [team,list]of this._balloonMap||[]){if(team<0)continue;for(const b of list){const r=this.sight(b)*BALLOON.surveyMult;for(let t=0;t<s.nations.length;t++){if(!this.allied(t,team))continue;const mem=f.memory[t];for(const n of s.nodes)if(n.amount>0&&!mem[n.id]&&dist(n,b)<=r){mem[n.id]={...n,remembered:true,surveyed:true};const i=Math.floor(n.y/96)*f.cols+Math.floor(n.x/96);f.explored[t][i]=1}
     for(const p of s.landmarks||[])if(dist(p,b)<=r&&!s.surveyed[t].includes(p.id)){s.surveyed[t].push(p.id);f.explored[t][Math.floor(p.y/96)*f.cols+Math.floor(p.x/96)]=1;this.emit('surveyed',{team:t,id:p.id,type:p.type})}}}}}
 tick(dt){const before=new Map();for(const u of this.s.units)if(D[u.kind]?.hero&&!D[u.kind].companion)before.set(u.id,u.team);super.tick(dt);const s=this.s;
  for(const [id,team]of before){if(!this.byId(id)){s.heroMourning??=s.nations.map(()=>0);s.heroMourning[team]=s.time+HERO.mournFor;this.emit('heroFallen',{team,until:s.heroMourning[team]})}}
  if(s.ended)return;this.heroGuard();const half=Math.floor(s.time*2);if(half!==this._surveyHalf){this._surveyHalf=half;this.balloons(0);this.survey()}}

 /* Low-health fallback (player orders win: only heroes idle, holding, or on attack-move fall back) and computer
    hero discipline: stay with the main army or at home, never charge alone. */
 heroGuard(){const s=this.s;if(Math.floor(s.time*2)===this._heroGuardHalf)return;this._heroGuardHalf=Math.floor(s.time*2);this.heroes(0);for(const [team,h]of this._heroMap||[]){if(team<0)continue;const safe=s.buildings.filter(b=>b.team===team&&b.hp>0&&b.complete&&['town','fort'].includes(b.kind)).sort((a,b)=>dist(a,h)-dist(b,h))[0];const o=h.order;
   if(h.hp<h.maxhp*HERO.retreatAt&&safe&&dist(h,safe)>220&&(!o||o.type==='hold'||o.type==='advance')){this.order([h],{type:'move',x:safe.x+60,y:safe.y+60,retreat:true,auto:true});this.emit('heroFallback',{team,id:h.id});continue}
   if(team>0&&!s.humanTeams?.includes(team)&&this.doctrineActive?.(team)&&!(o?.type==='move'&&o.auto)){const w=s.aiWar?.[team],wave=w?.waves?.find(v=>(v.kind==='main'||v.kind==='flank')&&v.stage!=='retreat'&&v.ids.length>=4);
    if(wave&&Number.isFinite(wave.x)){const back=Math.atan2(h.y-wave.y,h.x-wave.x),p={x:wave.x+Math.cos(back)*90,y:wave.y+Math.sin(back)*90};if(dist(h,p)>200)this.order([h],{type:'advance',x:p.x,y:p.y})}
    else if(safe){const near=s.units.filter(u=>u.team===team&&u.id!==h.id&&u.hp>0&&D[u.kind].damage>0&&u.kind!=='villager'&&dist(u,h)<400).length;if(dist(h,safe)>650&&near<4)this.order([h],{type:'move',x:safe.x+70,y:safe.y-50,auto:true})}}}}

 /* ---- 2. computer frontier: claims, island landings, remote raids, flank groups, pacing ---- */
 aiLevel(team){const base=AI_LEVEL[this.s.aiDifficulties?.[team]||this.s.difficulty]||AI_LEVEL.normal,m=DOCTRINE_FRONTIER[this.s.aiWar?.[team]?.key]||{};return{...base,sites:Math.max(0,base.sites+(base.sites?m.sites||0:0)),start:base.start+(m.start||0),every:Math.max(90,base.every+(m.every||0)),defend:base.defend+(base.sites?m.defend||0:0)}}
 aiFrontierState(team){const s=this.s;s.aiFrontier??={};return s.aiFrontier[team]??={claims:[],next:0,raidAt:0,stats:{claims:0,towers:0,walls:0,islandAt:null,islandTries:0,flanks:0,naval:0,remote:0,enemySites:0}}}
 aiAgeDeadline(team){const v=super.aiAgeDeadline(team);if(v===undefined||!this.doctrineActive?.(team))return v;return v*this.aiLevel(team).agePace}
 aiBaseSpread(team){return 1+(this.s.ages[team]-1)*(this.aiLevel(team).spread||0)}
 aiPlayer(team){super.aiPlayer(team);if(this.doctrineActive?.(team)&&!this.s.ended){this.aiFrontier(team);this.aiArmy(team)}}
 armyLevel(team){return ARMY_LEVEL[this.s.aiDifficulties?.[team]||this.s.difficulty]||ARMY_LEVEL.normal}
 profile(team=1){const p=super.profile(team);if(!(team>0)||this.s.humanTeams?.includes(team)||!(p.cap>0))return p;return{...p,cap:this.armyLevel(team).cap}}
 aiArmyGoal(team){const v=super.aiArmyGoal(team);if(!this.doctrineActive?.(team))return v;const w=this.s.aiWar?.[team],d=K.aiDoctrines[w?.key];if(d?.army&&this.s.ages[team]<d.army[0])return v;/* counted the way the base trainer counts (every armed unit, villagers included) */const army=this.s.units.filter(u=>u.team===team&&!u.embarkedOn&&D[u.kind].damage>0).length,free=this.capacity(team)-this.population(team);/* keep 4 population free for transports, villagers and a hero */return Math.min(Math.max(v,this.armyLevel(team).cap),army+Math.max(0,free-4))}
 aiVillagerGoal(team){const v=super.aiVillagerGoal(team);if(!v||!this.doctrineActive?.(team))return v;/* from age II only, and half for the rush doctrine, so the early identities (rush: few villagers, early army) hold */const extra=this.s.ages[team]>=2?Math.round(this.armyLevel(team).villagers*(this.s.aiWar?.[team]?.key==='rush'?.5:1)):0;return v+extra+Math.min(6,(this.s.aiFrontier?.[team]?.claims||[]).filter(c=>c.stage==='run').length*2)}
 aiArmy(team){const s=this.s,A=this.armyLevel(team),town=this.townOf(team);if(!town||!A.cap)return;const bank=s.resources[team],age=s.ages[team],army=s.units.filter(u=>u.team===team&&u.hp>0&&D[u.kind].damage>0&&u.kind!=='villager'),goal=this.aiArmyGoal(team),gate=K.aiDoctrines?.[s.aiWar?.[team]?.key]?.army,want=army.length<goal&&!(gate&&age<gate[0]);
  // housing ahead of the army (the old trigger waited for capacity-4 and one site at a time)
  const capMax=140+(s.tech[team]?.logistics||0)*20,cap=this.capacity(team),pending=s.buildings.filter(b=>b.team===team&&!b.complete&&b.kind==='house').length;if(cap<capMax&&this.population(team)>=cap-8&&pending<(A.queue>1?2:1)&&(bank.wood||0)>=(this.costFor('house',team).wood||0)+60){const v=this.aiWorkers(team).filter(u=>!['build','repair'].includes(u.order?.type))[pending];if(v){const sp=this.aiBaseSpread(team);for(let i=0;i<16;i++){const a=this.rand(0,Math.PI*2),r=(200+this.rand(0,260))*sp,x=town.x+Math.cos(a)*r,y=town.y+Math.sin(a)*r;if(!this.placementError('house',x,y,team)&&!this.construct('house',x,y,[v],team)?.error)break}}}
  const floating=(bank.food||0)+(bank.wood||0)+(bank.gold||0),depth=A.queue+(floating>3000&&A.halls?1:0);
  // more production when resources pile up
  const halls=['barracks','range','stable'].filter(k=>D[k]&&(D[k].age||1)<=age),count=k=>s.buildings.filter(b=>b.team===team&&b.kind===k&&b.hp>0).length;if(want&&A.halls&&floating>1100&&!s.buildings.some(b=>b.team===team&&!b.complete&&halls.includes(b.kind))){/* only once production is saturated (every hall of that kind busy) and the bank covers the hall with room to spare, from age II */const k=age<2?null:halls.filter(k=>count(k)>0&&count(k)<1+A.halls&&s.buildings.filter(b=>b.team===team&&b.kind===k&&b.complete).every(b=>(b.queue||[]).length>0)&&['food','wood','gold','stone'].every(r=>(bank[r]||0)>=(this.costFor(k,team)[r]||0)+250)).sort((a,b)=>count(a)-count(b))[0],v=this.aiWorkers(team).filter(u=>!['build','repair'].includes(u.order?.type))[0];if(k&&v){const sp=this.aiBaseSpread(team);for(let i=0;i<16;i++){const a=this.rand(0,Math.PI*2),r=(280+this.rand(0,220))*sp,x=town.x+Math.cos(a)*r,y=town.y+Math.sin(a)*r;if(!this.placementError(k,x,y,team)&&!this.construct(k,x,y,[v],team)?.error)break}}}
  // deeper queues when the bank allows (the doctrine/counter scoring in train() picks the unit)
  if(want&&depth>1)for(const b of s.buildings){if(b.team!==team||!b.complete||b.hp<=0||!halls.includes(b.kind)&&b.kind!=='workshop'||(b.queue||[]).length>=depth||(b.queue||[]).some(q=>q.type==='research'))continue;const kind=(D[b.kind].trains||[]).find(k=>!this.unitError(b,k)&&D[k].damage>0);if(!kind)continue;const c=this.costFor(kind,team);if(['food','wood','gold','stone'].some(r=>(bank[r]||0)<(c[r]||0)+150))continue;this.train(b,kind)}}
 aiSiteNodes(spot,r=300){return this.s.nodes.filter(n=>n.amount>0&&!n.domain&&dist(n,spot)<r&&['gold','stone','wood'].includes(n.resource))}
 aiFrontier(team){const s=this.s,town=this.townOf(team);if(!town)return;const L=this.aiLevel(team),F=this.aiFrontierState(team);
  // keep claims alive: a claim ends when its camp is gone or its deposits are exhausted
  F.claims=F.claims.filter(c=>{if(c.dead)return false;if(c.stage==='go')return true;const camp=c.campId&&this.byId(c.campId);if(c.campId&&(!camp||camp.hp<=0))return false;if(c.stage==='build'&&s.time-c.at>150&&!camp)return false;return this.aiSiteNodes(c).some(n=>n.resource!=='wood'||c.wood)});
  for(const c of F.claims)this.aiClaimTick(team,town,c,L,F);
  if(L.sites&&s.time>=L.start&&s.time>=F.next&&F.claims.filter(c=>!c.island).length<L.sites&&s.ages[team]>=1)this.aiClaim(team,town,L,F);
  if(L.island&&s.time>=L.island)this.aiIsland(team,town,L,F);
  if(L.raid&&s.time>=Math.max(F.raidAt,L.start))this.aiRemoteRaid(team,town,L,F)}
 /* villagers free for frontier/army chores: never the doctrine scout or a villager already walking out to a claim */
 aiWorkers(team){const s=this.s,scout=s.aiWar?.[team]?.scout?.id,busy=new Set((s.aiFrontier?.[team]?.claims||[]).filter(c=>c.stage==='go').map(c=>c.workerId));return s.units.filter(u=>u.team===team&&u.kind==='villager'&&u.hp>0&&!u.embarkedOn&&u.id!==scout&&!busy.has(u.id))}
 aiClaim(team,town,L,F){const s=this.s,workers=this.aiWorkers(team);if(workers.length<8){F.next=s.time+30;return}const w=s.aiWar?.[team],enemyKnown=!!w?.enemyBase,taken=new Set(F.claims.map(c=>c.key));F.failed??={};for(const [k,t]of Object.entries(F.failed))if(s.time<t)taken.add(k);
  const spots=[];for(const site of s.resourceSites||[]){if(site.id==='island')continue;site.spots.forEach((p,t)=>{const own=site.spots.length===1||t===team,key=site.id+':'+t;if(taken.has(key))return;if(!own&&!(enemyKnown&&L.raid>=1&&this.explored?.(team,p)))return;const amount=this.aiSiteNodes(p).reduce((n,q)=>n+(q.resource==='wood'?q.amount*.25:q.amount),0);if(amount<1500)return;
   const foes=s.buildings.some(b=>b.hp>0&&b.team>=0&&this.hostile(team,b.team)&&dist(b,p)<500);if(foes)return;spots.push({key,x:p.x,y:p.y,own,score:amount/(dist(town,p)+600)*(own?1:.8)})})}
  for(const c of s.wildCamps||[])if(c.cleared&&this.explored?.(team,c)&&!taken.has('camp:'+c.id)){const amount=this.aiSiteNodes(c).reduce((n,q)=>n+q.amount,0);if(amount>1500)spots.push({key:'camp:'+c.id,x:c.x,y:c.y,own:true,score:amount/(dist(town,c)+600)})}
  spots.sort((a,b)=>b.score-a.score);const spot=spots[0];if(!spot){F.next=s.time+45;return}
  const worker=workers.filter(u=>!['build','repair'].includes(u.order?.type)).sort((a,b)=>dist(a,spot)-dist(b,spot))[0];if(!worker){F.next=s.time+20;return}
  const nodes=this.aiSiteNodes(spot),wood=nodes.filter(n=>n.resource==='wood').length>nodes.length/2,kind=wood?'lumbercamp':'miningcamp';
  // a villager walks out first (the point may still be unexplored); the camp is placed on arrival
  const c={key:spot.key,x:spot.x,y:spot.y,campId:null,kind,own:spot.own,wood,stage:'go',workerId:worker.id,at:s.time,defended:0};F.claims.push(c);this.order([worker],{type:'move',x:spot.x,y:spot.y});F.next=s.time+L.every}
 aiPlaceCamp(team,town,c,worker){const ang=Math.atan2(town.y-c.y,town.x-c.x);for(let i=0;i<30;i++){const a=ang+(i%2?1:-1)*Math.floor((i%10)/2)*.5,r=170+Math.floor(i/10)*70,x=c.x+Math.cos(a)*r,y=c.y+Math.sin(a)*r;if(this.placementError(c.kind,x,y,team))continue;if(this.construct(c.kind,x,y,[worker],team)?.error)continue;const camp=this.s.buildings.filter(b=>b.team===team&&b.kind===c.kind&&Math.hypot(b.x-x,b.y-y)<2).pop();if(camp){c.campId=camp.id;return true}}return false}
 aiClaimTick(team,town,c,L,F){const s=this.s;if(c.stage==='go'){const v=this.byId(c.workerId);if(!v||v.hp<=0){c.dead=true;return}if(dist(v,c)<300||s.time-c.at>25&&this.explored?.(team,c)&&dist(v,c)<700){if(this.aiPlaceCamp(team,town,c,v)){c.stage='build';c.at=s.time;F.stats.claims++;if(!c.own)F.stats.enemySites++;this.emit('aiExpand',{team,x:c.x,y:c.y,own:c.own})}else{c.dead=true;(F.failed??={})[c.key]=s.time+300;F.next=Math.min(F.next,s.time+20)}}else if(v.order?.type!=='move')this.order([v],{type:'move',x:c.x,y:c.y});if(s.time-c.at>150){c.dead=true;(F.failed??={})[c.key]=s.time+300}return}
  const camp=c.campId&&this.byId(c.campId);if(!camp)return;if(!camp.complete){if(!s.units.some(u=>u.team===team&&u.order?.type==='build'&&u.order.id===camp.id)){const v=this.aiWorkers(team).sort((a,b)=>dist(a,camp)-dist(b,camp))[0];if(v)this.order([v],{type:'build',id:camp.id})}return}
  c.stage='run';const want=Math.min(6,2+(L.sites>2?2:1)+(L.defend>1?1:0)),nodes=this.aiSiteNodes(c).filter(n=>n.resource!=='wood'||c.wood),here=this.aiWorkers(team).filter(u=>u.order?.type==='gather'&&dist(u,c)<520);
  if(here.length<want&&nodes.length){const pool=this.aiWorkers(team).filter(u=>!u.island&&u.order?.type==='gather'&&dist(u,c)>=520&&dist(u,town)<900&&!['build','repair'].includes(u.order?.type)).sort((a,b)=>dist(a,c)-dist(b,c)).slice(0,want-here.length);for(const u of pool){const n=nodes.sort((a,b)=>dist(a,u)-dist(b,u))[0];this.order([u],{type:'gather',id:n.id,resource:n.resource})}}
  // defend the point once it runs: a tower toward the enemy, then (defend 2) short wall segments in front of it
  if(L.defend>0&&c.defended<L.defend&&s.ages[team]>=1&&s.time-c.at>25){const foe=s.aiWar?.[team]?.enemyBase||this.nearest?.(c,(this.world?.starts||[]).filter(p=>dist(p,town)>400))||town,ang=Math.atan2(foe.y-c.y,foe.x-c.x),builder=here.sort((a,b)=>dist(a,c)-dist(b,c))[0];if(!builder)return;
   if(c.defended===0){for(let i=0;i<10;i++){const a=ang+(i%2?1:-1)*Math.floor(i/2)*.4,r=170+Math.floor(i/4)*40;if(!this.placementError('tower',c.x+Math.cos(a)*r,c.y+Math.sin(a)*r,team)&&!this.construct('tower',c.x+Math.cos(a)*r,c.y+Math.sin(a)*r,[builder],team)?.error){c.defended=1;F.stats.towers++;return}}c.defended=1;return}
   if(c.defended===1&&s.ages[team]>=2){const kind=Math.abs(Math.cos(ang))>Math.abs(Math.sin(ang))?'wallvertical':'wall',mx=c.x+Math.cos(ang)*290,my=c.y+Math.sin(ang)*290,a={x:mx-(kind==='wall'?96:0),y:my-(kind==='wall'?0:96)},b={x:mx+(kind==='wall'?96:0),y:my+(kind==='wall'?0:96)};const r=this.constructLine?.(kind,a,b,[builder],team);if(r&&!r.error&&r.count)F.stats.walls+=r.count;c.defended=2}}}
 /* Island landing: build/keep a dock and transport, ferry villagers and a guard, unload on the island, build a camp. */
 aiIsland(team,town,L,F){const s=this.s,I=F.isl??={stage:'idle',at:0};if(I.stage==='done'||s.time<I.at)return;const isl=(s.resourceSites||[]).filter(x=>x.id==='island'&&(x.owner?.includes(team))).map(x=>x.spots[0]).filter(p=>this.aiSiteNodes(p,260).some(n=>n.resource!=='wood')).sort((a,b)=>dist(town,a)-dist(town,b))[0];if(!isl){I.stage='done';return}
  const dock=s.buildings.find(b=>b.team===team&&b.kind==='dock'&&b.hp>0),ship=I.shipId&&this.byId(I.shipId);
  const retry=(t=40)=>{I.at=s.time+t;F.stats.islandTries++};
  if(!dock){const workers=this.aiWorkers(team);if(workers.length<9||s.buildings.some(b=>b.team===team&&b.kind==='dock')){retry(30);return}const ang=Math.atan2(isl.y-town.y,isl.x-town.x);for(let i=0;i<36;i++){const a=ang+(i%2?1:-1)*Math.floor(i/2)*.12,r=300+(i%6)*170,x=town.x+Math.cos(a)*r,y=town.y+Math.sin(a)*r,coastY=K.coast?K.coast(x)-20:y;for(const p of [{x,y},{x,y:coastY}]){if(!this.placementError('dock',p.x,p.y,team)&&!this.construct('dock',p.x,p.y,[workers.sort((a,b)=>dist(a,p)-dist(b,p))[0]],team)?.error){retry(60);return}}}retry(90);return}
  if(!dock.complete){retry(15);return}
  if(!ship||ship.hp<=0){const own=s.units.find(u=>u.team===team&&u.kind==='transport'&&u.hp>0);if(own){I.shipId=own.id;return}if(!dock.queue?.some(q=>q.kind==='transport'))this.train(dock,'transport');retry(20);return}
  const cargo=s.units.filter(u=>u.embarkedOn===ship.id);
  if(['idle','gather','board'].includes(I.stage)){if(I.stage==='board'&&cargo.length>=3||(I.stage==='board'&&s.time-I.since>70&&cargo.length)){const shore=this.aiShore(isl);if(!shore){I.stage='done';return}I.stage='sail';I.since=s.time;I.shore=shore;this.order([ship],{type:'move',x:shore.x,y:shore.y});return}
   if(I.stage==='board'&&s.time-I.since>90&&!cargo.length){I.stage='idle';retry(30);return}
   if(I.stage==='board'&&s.time-(I.nudged??I.since)>18){I.nudged=s.time;const waiting=(ship.loadRequests||[]).map(id=>this.byId(id)).filter(u=>u&&u.hp>0&&!u.embarkedOn);if(waiting.length){const c=this.aiCentroid(waiting),q=this.aiShore(c);if(q)this.order([ship],{type:'move',x:q.x,y:q.y})}}
   // gather the party on the dock's quay and bring the transport alongside, then embark
   if(I.stage==='idle'){const v=this.aiWorkers(team).filter(u=>!['build','repair'].includes(u.order?.type)&&!u.island).sort((a,b)=>dist(a,dock)-dist(b,dock)).slice(0,3),guard=(this.armyFor?.(team)||[]).filter(u=>!this.sea(u)&&!u.embarkedOn&&!D[u.kind].hero).sort((a,b)=>dist(a,dock)-dist(b,dock)).slice(0,L.defend>1?2:1);if(v.length<3){retry(30);return}const port=this.aiShore(dock);if(!port){I.stage='done';return}I.party=[...v,...guard].map(u=>u.id);I.port=port;this.order([...v,...guard],{type:'move',x:dock.x,y:dock.y});this.order([ship],{type:'move',x:port.x,y:port.y});I.stage='gather';I.since=s.time;return}
   if(I.stage==='gather'){const party=(I.party||[]).map(id=>this.byId(id)).filter(u=>u?.hp>0&&!u.embarkedOn);if(!party.length){I.stage='idle';retry(30);return}if(party.every(u=>dist(u,dock)<230)&&dist(ship,I.port)<160||s.time-I.since>45){this.order(party,{type:'embark',id:ship.id});I.stage='board';I.since=s.time}return}
   return}
  if(I.stage==='sail'){if(dist(ship,I.shore)<140||s.time-I.since>90){const r=this.unload(ship);const landed=s.units.filter(u=>u.team===team&&!u.embarkedOn&&u.hp>0&&dist(u,isl)<700&&this.aiOnIsland(u,isl));if(landed.length){for(const u of landed)u.island=true;I.stage='build';I.since=s.time;if(F.stats.islandAt===null)F.stats.islandAt=Math.round(s.time);this.emit('aiIsland',{team,x:isl.x,y:isl.y});const v=landed.find(u=>u.kind==='villager');if(v){for(let i=0;i<12;i++){const a=i*.52,x=isl.x+Math.cos(a)*(110+i*6),y=isl.y+Math.sin(a)*(110+i*6);if(!this.placementError('miningcamp',x,y,team)&&!this.construct('miningcamp',x,y,[v],team)?.error){const camp=s.buildings.filter(b=>b.team===team&&b.kind==='miningcamp').pop();F.claims.push({key:'island',x:isl.x,y:isl.y,campId:camp?.id,kind:'miningcamp',own:true,island:true,stage:'build',at:s.time,defended:0});F.stats.claims++;break}}}}
     else{I.stage='idle';retry(50);this.order([ship],{type:'move',x:dock.x,y:K.coast?K.coast(dock.x)+120:dock.y})}}return}
  if(I.stage==='build'){const c=F.claims.find(c=>c.island);const camp=c?.campId&&this.byId(c.campId);if(camp?.complete){for(const u of s.units.filter(u=>u.team===team&&u.island&&u.kind==='villager'&&u.order?.type!=='gather')){const n=this.aiSiteNodes(isl,320).filter(n=>n.resource!=='wood').sort((a,b)=>dist(a,u)-dist(b,u))[0];if(n)this.order([u],{type:'gather',id:n.id,resource:n.resource})}I.stage='done';this.order([ship],{type:'move',x:dock.x,y:K.coast?K.coast(dock.x)+120:dock.y})}else if(s.time-I.since>200)I.stage='done'}}
 aiOnIsland(u,isl){this._regions??=landRegions(this.world);return this._regions.at(u.x,u.y)===this._regions.at(isl.x,isl.y)}
 aiShore(p){const w=this.world;let best=null;for(let r=60;r<=420&&!best;r+=40)for(let a=0;a<Math.PI*2;a+=Math.PI/12){const q={x:p.x+Math.cos(a)*r,y:p.y+Math.sin(a)*r};if(K.worldWater(w,q.x,q.y)&&!K.worldBridge?.(w,q.x,q.y)){best=q;break}}return best}
 /* Remote raids: once the player is scouted, a few fast units hit gatherers or drop sites far from the player's town. */
 aiRemoteRaid(team,town,L,F){const s=this.s,w=s.aiWar?.[team];F.raidAt=s.time+Math.round((L.raid>=1?120:200)+this.rand(0,80));if(!w?.enemyBase||w.waves.some(v=>v.kind==='remote'))return;if(this.rand(0,1)>L.raid)return;
  const enemyTown=s.buildings.find(b=>b.kind==='town'&&b.team===w.enemyBase.team&&b.hp>0);if(!enemyTown)return;const view=this.view(team),far=e=>dist(e,enemyTown)>900&&(!this.canSee||this.canSee(team,e)||D[e.kind]?.building&&this.explored?.(team,e));
  const targets=[...view.units.filter(u=>u.kind==='villager'&&u.hp>0&&this.hostile(team,u.team)&&far(u)),...view.buildings.filter(b=>b.hp>0&&['miningcamp','lumbercamp','mill'].includes(b.kind)&&this.hostile(team,b.team)&&far(b))];if(!targets.length)return;
  const t=targets.sort((a,b)=>dist(town,a)-dist(town,b))[0],busy=new Set(w.waves.flatMap(v=>v.ids));if(w.scout)busy.add(w.scout.id);const fast=(this.armyFor(team)||[]).filter(u=>!busy.has(u.id)&&!D[u.kind].hero&&!u.combatTarget&&!this.sea(u)).sort((a,b)=>this.stat(b,'speed')-this.stat(a,'speed')).slice(0,L.raid>=1?5:3);if(fast.length<2)return;
  const v={id:(w.serial=(w.serial||0)+1),kind:'remote',ids:fast.map(u=>u.id),target:{x:t.x,y:t.y,id:t.id,team:t.team},via:null,lane:0,stage:'march',start:s.time,launch:s.time,at:s.time,x:town.x,y:town.y};w.waves.push(v);this.order(fast,{type:'advance',x:t.x,y:t.y});F.stats.remote++;this.emit('aiRemoteRaid',{team,target:t.team,x:t.x,y:t.y,size:fast.length})}
 /* Main attacks: the main body keeps its lane (it may be the feint); a small group takes the least defended other lane,
    or a transport lands it behind the player's line when the computer has one. */
 aiLaunch(team,town,kind){const v=super.aiLaunch(team,town,kind);if(!v||typeof v!=='object'||kind!=='main')return v;const s=this.s,w=s.aiWar[team],L=this.aiLevel(team),F=this.aiFrontierState(team);if(!(L.flank>0)||v.ids.length<6||this.rand(0,1)>L.flank)return v;
  const units=v.ids.map(id=>this.byId(id)).filter(Boolean),c=this.aiCentroid(units),t=v.target,ang=Math.atan2(t.y-c.y,t.x-c.x),len=dist(c,t),view=this.view(team),def=view.buildings.filter(b=>b.hp>0&&this.hostile(team,b.team)&&(D[b.kind]?.wall||['tower','fort'].includes(b.kind))),army=view.units.filter(u=>u.hp>0&&this.hostile(team,u.team)&&D[u.kind]?.damage>0&&dist(u,t)<900);
  const lanes=[-1,1,-2,2].filter(l=>l!==v.lane).map(l=>{const off=Math.min(1100,len*.55)*l/Math.abs(l)*(Math.abs(l)>1?1.4:1),via={x:(c.x+t.x)/2+Math.cos(ang+Math.PI/2)*off,y:(c.y+t.y)/2+Math.sin(ang+Math.PI/2)*off},app={x:t.x+(via.x-t.x)*.35,y:t.y+(via.y-t.y)*.35};const ok=K.worldPlayable?.(this.world,via.x,via.y)!==false&&!this.blocked(via.x,via.y);const danger=def.reduce((n,b)=>n+(dist(b,app)<520?(b.kind==='fort'?3:D[b.kind]?.wall?1:2):0),0)+army.reduce((n,u)=>n+(dist(u,app)<420?.3:0),0);return{l,via,ok,danger}}).filter(x=>x.ok).sort((a,b)=>a.danger-b.danger);
  const size=Math.max(2,Math.round(units.length*.3)),flank=units.slice().sort((a,b)=>this.stat(b,'speed')-this.stat(a,'speed')).slice(0,size),ids=new Set(flank.map(u=>u.id));v.ids=v.ids.filter(id=>!ids.has(id));
  const ship=s.units.find(u=>u.team===team&&u.kind==='transport'&&u.hp>0&&!s.units.some(x=>x.embarkedOn===u.id)&&F.isl?.stage!=='board'&&F.isl?.stage!=='sail');
  if(ship&&L.defend>1&&this.aiShore(t)){F.stats.naval++;F.stats.flanks++;F.naval={shipId:ship.id,ids:[...ids],target:t,stage:'board',since:s.time};this.order(flank,{type:'embark',id:ship.id});this.emit('aiFlank',{team,mode:'sea',size:flank.length});return v}
  const lane=lanes[0];if(!lane){v.ids.push(...ids);return v}
  const f={id:(w.serial=(w.serial||0)+1),kind:'flank',ids:[...ids],target:t,via:lane.via,lane:lane.l,stage:v.stage,start:s.time,launch:v.launch,at:s.time,x:c.x,y:c.y};w.waves.push(f);F.stats.flanks++;(w.log??=[]).push({t:Math.round(s.time),kind:'flank',size:f.ids.length,lane:f.lane,target:'flank'});this.emit('aiFlank',{team,mode:'land',lane:lane.l,size:f.ids.length});return v}
 aiCampaign(team){super.aiCampaign(team);const F=this.s.aiFrontier?.[team],N=F?.naval;if(!N)return;const s=this.s,ship=this.byId(N.shipId);if(!ship||ship.hp<=0||s.time-N.since>180){F.naval=null;return}const cargo=s.units.filter(u=>u.embarkedOn===ship.id);
  if(N.stage==='board'&&(cargo.length>=Math.min(N.ids.length,4)||s.time-N.since>45&&cargo.length)){N.stage='sail';N.shore=this.aiShore(N.target);if(!N.shore){F.naval=null;return}this.order([ship],{type:'move',x:N.shore.x,y:N.shore.y})}
  else if(N.stage==='sail'&&(dist(ship,N.shore)<150||s.time-N.since>150)){this.unload(ship);const landed=N.ids.map(id=>this.byId(id)).filter(u=>u?.hp>0&&!u.embarkedOn);if(landed.length)this.order(landed,{type:'advance',x:N.target.x,y:N.target.y});F.naval=null}}
}
const api={...K,Sim:FrontierV40,landRegions,resourceZones,v40Balloon:BALLOON,v40Hero:HERO,v40Layout:{CAMP_REWARD,HOME_KEEP,SITES,CENTER,ISLAND_PER_PLAYER,HOME_RADIUS}};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.KingdomSim=api;
})(typeof window==='undefined'?globalThis:window);
