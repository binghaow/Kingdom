/* v42 human-like computer play (docs/ai-humanlike-v42.md). Shared by single-player and the authoritative server
   (network-model.js builds on it). Computer seats only: team>0, not in s.humanTeams, doctrine active.
   Deterministic: every decision reads simulation state and draws from this.rand; all memory lives in s.aiHuman (saved and
   synced). Nothing here is created in a constructor, because the server hydrates simulations with Object.create (no
   constructor runs) on every poll; every field is created lazily. No unit/building numbers are changed.
   1. Honest scouting memory + counter training (counterMultiplier), missing counter hall is built.
   2. Army: muster until gathered, power estimate before/while engaging, whole-wave retreat to the nearest tower/fort/town,
      focus fire on weak and valuable targets (siege, heroes), ranged units step back from melee, siege stays with escorts.
   3. Mid/late game fast-unit harassment of exposed villagers and outer drop sites, launched alongside the main army,
      withdrawn on contact with defenses.
   4. Defense: villagers under attack flee to the town centre and return later; nearby troops answer outlying alarms;
      destroyed economy buildings are rebuilt.
   5. Difficulty: reaction delay, actions per second (token bucket), mistakes. */
((root)=>{'use strict';const K=typeof module!=='undefined'&&module.exports?require('./frontier-v40.js'):root.KingdomSim,Base=K.Sim,D=K.defs,dist=K.distance;

/* Per difficulty: react = seconds before answering a new alarm, micro = seconds between battle micro passes, apm = orders
   per second this layer may issue (token bucket, burst = 4 s), miss = chance to skip/blunder a decision, counter = weight of
   the scouted counter score, retreat = withdraw when own power < enemy × retreat, attack = launch the main army only when its
   power ≥ remembered enemy power × attack (0 = no check), harass = seconds between harass raids (0 = none). */
const SKILL={
 sandbox:{react:12,micro:6,apm:.15,miss:.6,counter:0,retreat:0,attack:0,harass:0,harassSize:0,focus:0,kite:0,flee:0,rebuild:0},
 beginner:{react:10,micro:5,apm:.25,miss:.45,counter:3,retreat:.35,attack:0,harass:0,harassSize:0,focus:0,kite:0,flee:.4,rebuild:.4},
 easy:{react:7,micro:3.5,apm:.45,miss:.3,counter:7,retreat:.45,attack:.6,harass:0,harassSize:0,focus:.5,kite:0,flee:.6,rebuild:.7},
 normal:{react:4,micro:2,apm:1,miss:.14,counter:14,retreat:.7,attack:.9,harass:170,harassSize:4,focus:1,kite:.5,flee:.85,rebuild:1},
 hard:{react:2.5,micro:1.5,apm:1.6,miss:.07,counter:20,retreat:.78,attack:1,harass:130,harassSize:5,focus:1,kite:.8,flee:1,rebuild:1},
 expert:{react:1.5,micro:1,apm:2.5,miss:.02,counter:26,retreat:.85,attack:1.1,harass:100,harassSize:6,focus:1,kite:1,flee:1,rebuild:1}};
const HALLS=['barracks','range','stable','workshop'],ECO=['mill','lumbercamp','miningcamp','quarry','market'],CAMP_RES={lumbercamp:['wood'],miningcamp:['gold','stone'],quarry:['stone']};
const r2=v=>Math.round(v*100)/100;

class HumanlikeAI extends Base{
 aiHumanOn(team){const s=this.s;return team>0&&!s.aiHumanOff&&!s.humanTeams?.includes(team)&&!s.defeated?.includes(team)&&!!this.doctrineActive?.(team)}
 aiSkill(team){return SKILL[this.s.aiDifficulties?.[team]||this.s.difficulty]||SKILL.normal}
 aiH(team){const s=this.s;s.aiHuman??={};let h=s.aiHuman[team];if(!h){h=s.aiHuman[team]={seen:{},ep:0,tokens:4,tokAt:s.time,microAt:0,alert:-1,flee:{},eco:{},rebuild:[],harassAt:-1,wait:-1,
   stats:{orders:0,skipped:0,counterHalls:0,counterTrains:0,musterWaits:0,postponed:0,retreats:0,focus:0,kites:0,escorts:0,harass:0,harassBack:0,flees:0,returns:0,answers:0,rebuilt:0,mistakes:0}}}return h}
 /* token bucket: one token per order call (a group order is one action, like one click) */
 aiAct(team,cost=1){const h=this.aiH(team),k=this.aiSkill(team),t=this.s.time;h.tokens=Math.min(k.apm*4+1,h.tokens+(t-h.tokAt)*k.apm);h.tokAt=t;if(h.tokens<cost){h.stats.skipped++;return false}h.tokens-=cost;h.stats.orders++;return true}
 aiMiss(team){const k=this.aiSkill(team);if(k.miss>0&&this.rand(0,1)<k.miss){this.aiH(team).stats.mistakes++;return true}return false}
 aiHostileArmed(team,e){return e.hp>0&&e.team>=0&&this.hostile(team,e.team)&&D[e.kind]?.damage>0&&e.kind!=='villager'&&(!this.canSee||!this.s.fogEnabled||this.canSee(team,e))}
 aiCur(u){const id=u.combatTarget||(u.order?.type==='attack'?u.order.id:null);return id?this.byId(id):null}
 aiFree(team){const w=this.s.aiWar?.[team],busy=new Set(w?w.waves.flatMap(v=>v.ids):[]);if(w?.scout)busy.add(w.scout.id);return this.armyFor(team).filter(u=>!busy.has(u.id)&&!D[u.kind].hero)}

 /* ---- 1. scouting memory and counters ---- */
 aiIntel(team){const w=this.s.aiWar?.[team],before=w?.intelAt;super.aiIntel(team);if(!this.aiHumanOn(team)||!w||w.intelAt===before)return;const h=this.aiH(team),now={};let power=0;
  for(const u of this.view(team).units)if(this.aiHostileArmed(team,u)&&!D[u.kind].building){now[u.kind]=(now[u.kind]||0)+1;power+=this.aiPower(u)}
  for(const k of Object.keys(h.seen)){const v=Math.max(now[k]||0,h.seen[k]*.97);if(v<.5)delete h.seen[k];else h.seen[k]=r2(v)}for(const [k,n]of Object.entries(now))h.seen[k]=Math.max(h.seen[k]||0,n);
  h.ep=Math.round(Math.max(power,h.ep*.97))}
 aiCounterEdge(team,kind){const seen=this.aiH(team).seen;let total=0,edge=0;for(const [k,n]of Object.entries(seen)){if(!D[k])continue;total+=n;edge+=n*(K.counterMultiplier(kind,k)-K.counterMultiplier(k,kind))}return total?{edge:edge/total,total}:{edge:0,total:0}}
 aiUnitScore(team,kind,plan,own){const v=super.aiUnitScore(team,kind,plan,own);if(!this.aiHumanOn(team))return v;const k=this.aiSkill(team),{edge,total}=this.aiCounterEdge(team,kind);return v+edge*k.counter*Math.min(1,total/3)}
 aiTrainable(team,hall){const age=this.s.ages[team],nation=this.nation?.(team)?.id;return (D[hall]?.trains||[]).filter(k=>{const d=D[k];return d&&d.damage>0&&!d.hero&&!d.retired&&d.domain!=='sea'&&d.domain!=='air'&&(d.age||1)<=age&&(!d.nation||d.nation===nation)&&!this.trainHidden?.({team},k)})}
 aiCounterPlan(team){const {total}=this.aiCounterEdge(team,'infantry');if(total<3)return null;const age=this.s.ages[team];let best=null;for(const hall of HALLS){if(!D[hall]||(D[hall].age||1)>age)continue;for(const k of this.aiTrainable(team,hall)){const e=this.aiCounterEdge(team,k).edge;if(e>.25&&(!best||e>best.edge))best={kind:k,hall,edge:e}}}return best}
 /* production follows the scouting report: a hall whose best unit is countered by what was seen yields its turn to the
    counter hall (a player would stop massing archers into cavalry). Military halls only; villagers, ships, heroes untouched. */
 train(b,kind){const team=b?.team;if(!(team>0)||!HALLS.includes(b.kind)||!D[kind]||!(D[kind].damage>0)||!this.aiHumanOn(team))return super.train(b,kind);const k=this.aiSkill(team);if(!k.counter)return super.train(b,kind);
  const plan=this.aiCounterPlan(team);if(!plan||plan.hall===b.kind)return super.train(b,kind);const own=Math.max(...this.aiTrainable(team,b.kind).map(x=>this.aiCounterEdge(team,x).edge),-9);if(own>-.3)return super.train(b,kind);
  if(this.rand(0,1)>Math.min(.85,k.counter/30))return super.train(b,kind);const hall=this.s.buildings.find(x=>x.team===team&&x.kind===plan.hall&&x.complete&&x.hp>0&&(x.queue||[]).length<3&&!(x.queue||[]).some(q=>q.type==='research'));
  if(hall&&!this.unitError(hall,plan.kind)){const r=super.train(hall,plan.kind);if(!r)this.aiH(team).stats.counterTrains++;return r}return super.train(b,kind)}
 aiCounterHall(team,town){const s=this.s,h=this.aiH(team),c=this.aiCounterPlan(team);if(!c)return;const halls=s.buildings.filter(b=>b.team===team&&b.kind===c.hall&&b.hp>0),bank=s.resources[team];
  if(!halls.length){if(s.buildings.some(b=>b.team===team&&!b.complete&&b.hp>0&&HALLS.includes(b.kind)))return;const cost=this.costFor(c.hall,team);if(['food','wood','gold','stone'].some(r=>(bank[r]||0)<(cost[r]||0)+60))return;const v=this.aiWorkers(team).filter(u=>!['build','repair'].includes(u.order?.type))[0];if(!v||this.aiMiss(team)||!this.aiAct(team))return;const sp=this.aiBaseSpread?.(team)??1;
   for(let i=0;i<16;i++){const a=this.rand(0,Math.PI*2),r=(260+this.rand(0,200))*sp,x=town.x+Math.cos(a)*r,y=town.y+Math.sin(a)*r;if(!this.placementError(c.hall,x,y,team)&&!this.construct(c.hall,x,y,[v],team)?.error){h.stats.counterHalls++;this.emit('aiCounterHall',{team,hall:c.hall,kind:c.kind});return}}return}
  /* keep the counter hall busy (one extra queued counter unit when the bank allows) */
  for(const b of halls){if(!b.complete||(b.queue||[]).length>=2||(b.queue||[]).some(q=>q.type==='research'))continue;if(this.unitError(b,c.kind))continue;const cost=this.costFor(c.kind,team);if(['food','wood','gold','stone'].some(r=>(bank[r]||0)<(cost[r]||0)+120))continue;if(this.population(team)>=this.capacity(team)-2)return;if(!this.train(b,c.kind)){h.stats.counterTrains++}return}}

 /* ---- 2. army: launch only when strong enough, muster, retreat to safety, battle micro ---- */
 aiLaunch(team,town,kind){if(kind!=='main'||!this.aiHumanOn(team))return super.aiLaunch(team,town,kind);const s=this.s,h=this.aiH(team),k=this.aiSkill(team);
  if(k.attack>0&&h.ep>0){const own=this.aiFree(team).reduce((n,u)=>n+this.aiPower(u),0);if(own<h.ep*k.attack){if(h.wait<0)h.wait=s.time;if(s.time-h.wait<150){h.stats.postponed++;return 'small'}}}
  h.wait=-1;/* the raiding party leaves with the main army (picked first so the main wave does not absorb the riders) */if(k.harass)this.aiHarass(team,town,true);const v=super.aiLaunch(team,town,kind);if(v&&typeof v==='object'){v.human=1;v.musterEnd=v.launch+30}return v}
 aiSafePoint(team,from,town){let best=town,bd=Infinity;for(const b of this.s.buildings){if(b.team!==team||b.hp<=0||!b.complete||!(D[b.kind]?.damage>0||b.kind==='town'))continue;if(b.kind!=='town'&&dist(b,town)>1000)continue;const d=dist(b,from);if(d<bd){bd=d;best=b}}return best}
 aiRetreat(team,v,town,why){if(!this.aiHumanOn(team)||!town)return super.aiRetreat(team,v,town,why);const safe=this.aiSafePoint(team,v,town),dx=town.x-safe.x,dy=town.y-safe.y,l=Math.hypot(dx,dy)||1,off=safe===town?0:90;this.aiH(team).stats.retreats++;return super.aiRetreat(team,v,{x:safe.x+dx/l*off,y:safe.y+dy/l*off},why)}
 aiLocalPower(team,c,radius,view){let enemy=0;for(const e of view.units)if(dist(e,c)<radius&&this.aiHostileArmed(team,e))enemy+=this.aiPower(e);for(const b of view.buildings)if(b.hp>0&&b.team>=0&&this.hostile(team,b.team)&&D[b.kind]?.damage>0&&dist(b,c)<radius)enemy+=this.aiPower(b)*1.2;return enemy}
 aiWaves(team,town){if(!this.aiHumanOn(team))return super.aiWaves(team,town);this.aiWavesHuman(team,town);
  /* this layer's raiding parties are steered above; the doctrine wave loop would re-aim them at the enemy town */
  const w=this.s.aiWar[team],mine=w.waves.filter(v=>v.kind==='harass'&&v.human);if(mine.length)w.waves=w.waves.filter(v=>!mine.includes(v));super.aiWaves(team,town);
  for(const v of mine){const units=v.ids.map(id=>this.byId(id)).filter(u=>u?.hp>0&&u.team===team);v.ids=units.map(u=>u.id);if(!units.length||this.s.time-v.start>170)continue;if(v.stage==='retreat'&&(dist(this.aiCentroid(units),town)<420||this.s.time-v.at>70))continue;w.waves.push(v)}}
 aiWavesHuman(team,town){const s=this.s,w=s.aiWar[team],h=this.aiH(team),k=this.aiSkill(team);let view=null;
  for(const v of w.waves){const units=v.ids.map(id=>this.byId(id)).filter(u=>u?.hp>0&&u.team===team);if(!units.length)continue;const c=this.aiCentroid(units);
   /* muster: wait until the army has gathered (or 30 s more), stragglers are called in */
   if(v.stage==='muster'&&v.human&&s.time>=v.launch&&s.time<(v.musterEnd||0)){const close=units.filter(u=>dist(u,c)<240).length;if(close<units.length*.75){v.launch=s.time+3;h.stats.musterWaits++;const far=units.filter(u=>dist(u,c)>=240&&u.order?.type!=='move');if(far.length&&this.aiAct(team))this.order(far,{type:'move',x:c.x,y:c.y})}continue}
   if(v.stage!=='march'&&v.stage!=='attack')continue;
   view??=this.view(team);if(this.aiWaveCheck(team,v,units,c,town,view)==='gone')continue;
   if(v.kind==='harass'&&v.human&&!v.gone){if(v.target.probe&&dist(c,v.target)>220)continue;const t=v.target.id?this.byId(v.target.id):null;if(!t||t.hp<=0){const next=this.aiHarassTarget(team,town,view);if(next&&!(next.probe&&v.target.probe)){v.target=next;if(this.aiAct(team)){this.order(units,{type:'advance',x:next.x,y:next.y});this.aiTagHarass(units,town)}}else this.aiRetreat(team,v,town,'done')}}}}
 /* engagement check (every k.react s, from the wave loop and the micro pass): compare power around the centroid and the
    lead unit; harassers leave on towers or real resistance; an outmatched army withdraws as a whole */
 aiWaveCheck(team,v,units,c,town,view){const s=this.s,h=this.aiH(team),k=this.aiSkill(team);if(v.stage!=='march'&&v.stage!=='attack')return 'gone';if(s.time-(v.hc||0)<k.react)return '';v.hc=s.time;
  const lead=v.target?units.reduce((a,u)=>dist(u,v.target)<dist(a,v.target)?u:a,units[0]):c,r=v.kind==='harass'?420:600,enemy=Math.max(this.aiLocalPower(team,c,r,view),this.aiLocalPower(team,lead,r,view)),own=units.reduce((n,u)=>n+this.aiPower(u),0);if(enemy>h.ep)h.ep=Math.round(enemy);
  if(v.kind==='harass'&&v.human){const towers=view.buildings.some(b=>b.hp>0&&this.hostile(team,b.team)&&D[b.kind]?.damage>0&&(dist(b,c)<380||dist(b,lead)<380));if(towers||enemy>own*.8||s.time-v.start>100){h.stats.harassBack++;this.aiRetreat(team,v,town,'defended');return 'gone'}return ''}
  if(enemy>0&&own<enemy*k.retreat&&k.retreat>0){if(this.aiMiss(team))return '';this.aiRetreat(team,v,town,'outmatched');return 'gone'}return ''}
 /* battle micro, every k.micro seconds of simulation time, for units in waves that are near enemies */
 aiMicro(team){const s=this.s,w=s.aiWar?.[team],k=this.aiSkill(team);if(!w?.waves?.length)return;const h=this.aiH(team),town=s.buildings.find(b=>b.team===team&&b.kind==='town');let view=null;
  for(const v of w.waves){if(v.stage!=='march'&&v.stage!=='attack')continue;const units=v.ids.map(id=>this.byId(id)).filter(u=>u?.hp>0&&u.team===team&&!u.embarkedOn);if(!units.length)continue;const c=this.aiCentroid(units);view??=this.view(team);if(town&&this.aiWaveCheck(team,v,units,c,town,view)==='gone')continue;if(!k.focus)continue;
   const foes=view.units.filter(e=>e.hp>0&&e.team>=0&&this.hostile(team,e.team)&&!D[e.kind]?.building&&dist(e,c)<480&&(!this.canSee||!s.fogEnabled||this.canSee(team,e))&&!this.air?.(e));if(!foes.length)continue;if(this.aiMiss(team))continue;
   const value=e=>{const d=D[e.kind]||{};return (d.hero?3:d.role==='cannon'?2.4:d.range>100?1.4:e.kind==='villager'?.5:1)*(1+1.6*(1-e.hp/Math.max(1,e.maxhp)))};
   /* focus fire: ranged units share the best target they can reach; melee units pick the best target close to them */
   const ranged=units.filter(u=>this.stat(u,'range')>100&&D[u.kind].role!=='cannon'),melee=units.filter(u=>this.stat(u,'range')<=100&&!D[u.kind].hero);
   if(ranged.length){const rc=this.aiCentroid(ranged),reach=this.stat(ranged[0],'range')+120;let best=null,bs=0;for(const e of foes){const d=dist(e,rc);if(d>reach)continue;const sc=value(e)/(1+d/400);if(sc>bs){bs=sc;best=e}}
    if(best){const switchers=ranged.filter(u=>u.order?.type!=='attack'||u.order.id!==best.id).filter(u=>{const cur=this.aiCur(u);return !cur||cur.hp<=0||value(cur)<value(best)*.8});if(switchers.length&&this.aiAct(team)){this.order(switchers,{type:'attack',id:best.id});h.stats.focus++}}}
   if(melee.length&&k.focus>=1){const groups=new Map();for(const u of melee){const cur=this.aiCur(u);let best=null,bs=0;for(const e of foes){const d=dist(e,u);if(d>220)continue;const sc=value(e)*(1+K.counterMultiplier(u.kind,e.kind)*.3)/(1+d/150);if(sc>bs){bs=sc;best=e}}if(!best||cur&&cur.hp>0&&(cur.id===best.id||value(cur)>=value(best)*.8))continue;if(!groups.has(best.id))groups.set(best.id,[]);groups.get(best.id).push(u)}
    for(const [id,g]of groups){if(!this.aiAct(team))break;this.order(g,{type:'attack',id});h.stats.focus++}}
   /* ranged step back from melee attackers */
   if(k.kite>0&&this.rand(0,1)<k.kite){for(const u of ranged){const m=foes.find(e=>(D[e.kind].range||0)<60&&D[e.kind].damage>0&&dist(e,u)<75);if(!m)continue;const dx=u.x-m.x,dy=u.y-m.y,l=Math.hypot(dx,dy)||1,x=u.x+dx/l*95,y=u.y+dy/l*95;if(this.blocked(x,y,u)||!this.aiAct(team))continue;this.order([u],{type:'move',x,y});h.stats.kites++}}
   /* siege keeps an escort: guns pull back toward the infantry when nobody is in front of them */
   const guns=units.filter(u=>D[u.kind].role==='cannon'),guards=units.filter(u=>D[u.kind].role!=='cannon');if(guns.length&&guards.length){const gc=this.aiCentroid(guards);for(const g of guns){const near=foes.some(e=>(D[e.kind].range||0)<60&&dist(e,g)<160);if((near||dist(g,gc)>260)&&this.aiAct(team)){this.order([g],{type:'move',x:gc.x+(g.x-gc.x)*.15,y:gc.y+(g.y-gc.y)*.15});h.stats.escorts++}}}}}

 /* ---- 3. harassment alongside the main army ---- */
 aiHarassTarget(team,town,view){const s=this.s,defenses=view.buildings.filter(b=>b.hp>0&&this.hostile(team,b.team)&&D[b.kind]?.damage>0),towns=view.buildings.filter(b=>b.hp>0&&b.kind==='town'&&this.hostile(team,b.team)),exposed=e=>!defenses.some(b=>dist(b,e)<430)&&!towns.some(b=>dist(b,e)<480);
  let best=null,bs=-Infinity;for(const u of view.units){if(u.kind!=='villager'||u.hp<=0||!this.hostile(team,u.team)||u.team<0||this.protection?.(team,u.team))continue;if(this.canSee&&s.fogEnabled&&!this.canSee(team,u))continue;if(!exposed(u))continue;const sc=-dist(u,town)/1000+(u.order?.type==='gather'?1:0);if(sc>bs){bs=sc;best=u}}
  if(best)return{x:best.x,y:best.y,id:best.id,team:best.team};
  for(const b of view.buildings){if(b.hp<=0||!this.hostile(team,b.team)||b.team<0||!['lumbercamp','miningcamp','quarry','mill'].includes(b.kind)||this.protection?.(team,b.team))continue;if(!exposed(b))continue;const sc=-dist(b,town)/1000;if(sc>bs){bs=sc;best=b}}
  if(best)return{x:best.x,y:best.y,id:best.id,team:best.team};
  /* nothing exposed in sight: probe an explored resource site 450-1100 from a known enemy town, away from its towers */
  for(const n of s.nodes){if(n.amount<=0||!['gold','stone','wood'].includes(n.resource)||!this.explored(team,n))continue;const et=towns.find(t=>{const d=dist(t,n);return d>450&&d<1100});if(!et||defenses.some(b=>dist(b,n)<430)||this.protection?.(team,et.team))continue;const sc=-dist(n,town)/1000-(n.resource==='wood'?.3:0);if(sc>bs){bs=sc;best={x:n.x,y:n.y,team:et.team,probe:1}}}
  return best}
 aiHarass(team,town,withMain=false){const s=this.s,w=s.aiWar?.[team],h=this.aiH(team),k=this.aiSkill(team);if(!w||!k.harass||s.ages[team]<2||s.time<300)return;if(h.harassAt<0)h.harassAt=s.time+k.harass*.5;if(s.time<h.harassAt-(withMain?60:0)||w.waves.some(v=>v.kind==='harass'))return;
  /* prefer to go while the main army is out (two fronts); alone only after 1.5× the interval */
  const mainOut=withMain||w.waves.some(v=>v.kind==='main'&&(v.stage==='march'||v.stage==='attack'));if(!mainOut&&s.time<h.harassAt+k.harass*.5)return;
  const fast=this.aiFree(team).filter(u=>D[u.kind].role==='cavalry'||this.stat(u,'speed')>=120).sort((a,b)=>this.stat(b,'speed')-this.stat(a,'speed')).slice(0,k.harassSize);h.harassAt=s.time+k.harass*(.8+this.rand(0,.4));
  /* not enough riders: queue some at a stable and try again soon (a player would build the raiding party) */
  if(fast.length<3){h.harassAt=s.time+45;const st=s.buildings.find(b=>b.team===team&&b.kind==='stable'&&b.complete&&b.hp>0&&(b.queue||[]).length<2&&!(b.queue||[]).some(q=>q.type==='research'));if(st&&this.population(team)<this.capacity(team)-2){const kind=this.aiTrainable(team,'stable').filter(k=>!this.unitError(st,k)).sort((a,b)=>D[b].speed-D[a].speed)[0],bank=s.resources[team],cost=kind&&this.costFor(kind,team);if(kind&&!['food','wood','gold','stone'].some(r=>(bank[r]||0)<(cost[r]||0)+100))this.train(st,kind)}return}
  const view=this.view(team),target=this.aiHarassTarget(team,town,view);if(!target||this.aiMiss(team)||!this.aiAct(team))return;const c=this.aiCentroid(fast);
  const v={id:(w.serial=(w.serial||0)+1),kind:'harass',human:1,ids:fast.map(u=>u.id),target,via:null,lane:0,stage:'march',start:s.time,launch:s.time,at:s.time,x:c.x,y:c.y};w.waves.push(v);this.order(fast,{type:'advance',x:target.x,y:target.y});this.aiTagHarass(fast,town);h.stats.harass++;this.emit('aiHarass',{team,target:target.team,size:fast.length,withMain:mainOut});this.emit('raid',{team,target:target.team,wave:'harass'})}
 aiCampaign(team){super.aiCampaign(team);if(!this.aiHumanOn(team)||this.s.cooperation?.[team]?.until>this.s.time)return;const town=this.s.buildings.find(b=>b.team===team&&b.kind==='town');if(town)this.aiHarass(team,town)}

 /* ---- 4. defense: flee, answer outlying alarms, rebuild ---- */
 aiDefend(team,town){const s=this.s,h=this.aiH(team),k=this.aiSkill(team),view=this.view(team),foes=view.units.filter(e=>this.aiHostileArmed(team,e)&&!this.air?.(e));
  const workers=s.units.filter(u=>u.team===team&&u.kind==='villager'&&u.hp>0&&!u.embarkedOn),eco=s.buildings.filter(b=>b.team===team&&b.hp>0&&ECO.includes(b.kind));
  const threatened=foes.length?workers.filter(u=>foes.some(e=>dist(e,u)<300)):[],hitEco=foes.length?eco.filter(b=>foes.some(e=>dist(e,b)<320)):[];
  if(threatened.length||hitEco.length){if(h.alert<0)h.alert=s.time}else h.alert=-1;
  if(h.alert>=0&&s.time-h.alert>=k.react&&!this.aiMiss(team)){
   const spot=this.aiCentroid(threatened.length?threatened:hitEco),local=foes.filter(e=>dist(e,spot)<450),enemy=local.reduce((n,e)=>n+this.aiPower(e),0);
   const guards=this.armyFor(team).filter(u=>dist(u,spot)<450).reduce((n,u)=>n+this.aiPower(u),0);
   /* villagers run to the town centre when the local defenders cannot hold */
   if(k.flee>0&&guards<enemy*1.2&&dist(spot,town)>200){const run=threatened.filter(u=>!h.flee[u.id]&&u.order?.type!=='build'&&this.rand(0,1)<k.flee);if(run.length&&this.aiAct(team)){for(const u of run)h.flee[u.id]={n:u.order?.type==='gather'?u.order.id:0,r:u.order?.resource||'',x:Math.round(u.x),y:Math.round(u.y),at:s.time};const safe=this.aiSafePoint(team,spot,town);this.order(run,{type:'move',x:safe.x+this.rand(-50,50),y:safe.y+this.rand(-50,50),retreat:true});h.stats.flees+=run.length}}
   /* nearby free troops answer an outlying alarm (the town itself is covered by aiHomeDefense) */
   if(dist(spot,town)>350&&enemy>0){const free=this.aiFree(team).filter(u=>!(u.order?.type==='advance'&&Math.hypot((u.order.x||0)-spot.x,(u.order.y||0)-spot.y)<120)).sort((a,b)=>dist(a,spot)-dist(b,spot));const send=[];let p=0;for(const u of free){if(p>=enemy*1.4||dist(u,spot)>1500)break;send.push(u);p+=this.aiPower(u)}if(send.length&&p>=enemy*.8&&this.aiAct(team)){this.order(send,{type:'advance',x:spot.x,y:spot.y});h.stats.answers++}}}
  /* fled villagers go back to work once their spot is quiet */
  for(const [id,f]of Object.entries(h.flee)){const u=this.byId(+id);if(!u||u.hp<=0||u.team!==team){delete h.flee[id];continue}if(s.time-f.at<15)continue;if((foes.some(e=>dist(e,f)<600)||foes.some(e=>dist(e,u)<300))&&s.time-f.at<120)continue;if(u.order&&u.order.type!=='move'){delete h.flee[id];h.stats.returns++;continue}const node=f.n&&this.byId(f.n);if(!this.aiAct(team))break;if(node&&node.amount>0)this.order([u],{type:'gather',id:node.id,resource:f.r||node.resource});else u.order=null;delete h.flee[id];h.stats.returns++}
  /* rebuild destroyed economy buildings */
  if(!k.rebuild)return;const live=new Set();for(const b of eco){live.add(String(b.id));if(b.complete&&!h.eco[b.id])h.eco[b.id]={k:b.kind,x:Math.round(b.x),y:Math.round(b.y)}}
  for(const id of Object.keys(h.eco))if(!live.has(id)){const e=h.eco[id];delete h.eco[id];if(this.rand(0,1)<k.rebuild&&h.rebuild.length<4)h.rebuild.push({...e,at:s.time,tries:0})}
  if(!h.rebuild.length)return;const job=h.rebuild[0];if(s.time-job.at>300||job.tries>6){h.rebuild.shift();return}if(foes.some(e=>dist(e,job)<480))return;
  if(CAMP_RES[job.k]&&!s.nodes.some(n=>n.amount>0&&CAMP_RES[job.k].includes(n.resource)&&dist(n,job)<320)){h.rebuild.shift();return}
  if(s.buildings.some(b=>b.team===team&&b.kind===job.k&&b.hp>0&&dist(b,job)<200)){h.rebuild.shift();return}
  if(!this.canPay(this.costFor(job.k,team),team))return;const v=this.nearest(job,this.aiWorkers(team).filter(u=>!['build','repair'].includes(u.order?.type)&&!h.flee[u.id]));if(!v||!this.aiAct(team))return;job.tries++;
  for(let i=0;i<8;i++){const a=i*Math.PI/4,r=i?40:0,x=job.x+Math.cos(a)*r,y=job.y+Math.sin(a)*r;if(!this.placementError(job.k,x,y,team)&&!this.construct(job.k,x,y,[v],team)?.error){h.rebuild.shift();h.stats.rebuilt++;this.emit('aiRebuild',{team,kind:job.k});return}}}

 aiPlayer(team){super.aiPlayer(team);if(!this.aiHumanOn(team)||this.s.ended)return;const town=this.s.buildings.find(b=>b.team===team&&b.kind==='town'&&b.hp>0);if(!town)return;this.aiH(team);if(this.s.cooperation?.[team]?.until>this.s.time)return;this.aiCounterHall(team,town)}
 tick(dt){super.tick(dt);const s=this.s;if(s.ended||!s.aiHuman)return;for(const key of Object.keys(s.aiHuman)){const team=+key;if(!this.aiHumanOn(team))continue;const h=s.aiHuman[key];const k=this.aiSkill(team);
  /* alarms are checked on the reaction cadence of the difficulty (not the 7 s think), the battle micro on its own cadence */
  if(s.time>=(h.defendAt||0)){h.defendAt=s.time+Math.max(1.5,k.react);const town=s.buildings.find(b=>b.team===team&&b.kind==='town'&&b.hp>0);if(town)this.aiDefend(team,town)}
  if(s.time<(h.microAt||0))continue;h.microAt=s.time+k.micro;this.aiMicro(team)}}
}
const api={...K,Sim:HumanlikeAI,aiHumanSkill:SKILL};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.KingdomSim=api;
})(typeof window==='undefined'?globalThis:window);
