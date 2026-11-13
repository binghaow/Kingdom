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
 aiAct(team){this.aiH(team).stats.orders++;return true}
 aiMiss(){return false}
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
  h.wait=-1;const v=super.aiLaunch(team,town,kind);if(v&&typeof v==='object'){v.human=1;v.musterEnd=v.launch+30}return v}
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

 aiPlayer(team){super.aiPlayer(team);if(!this.aiHumanOn(team)||this.s.ended)return;const town=this.s.buildings.find(b=>b.team===team&&b.kind==='town'&&b.hp>0);if(!town)return;this.aiH(team);if(this.s.cooperation?.[team]?.until>this.s.time)return;this.aiCounterHall(team,town)}
 tick(dt){super.tick(dt);const s=this.s;if(s.ended||!s.aiHuman)return;for(const key of Object.keys(s.aiHuman)){const team=+key;if(!this.aiHumanOn(team))continue;const h=s.aiHuman[key];const k=this.aiSkill(team);
  if(s.time<(h.microAt||0))continue;h.microAt=s.time+k.micro;this.aiMicro(team)}}
}
const api={...K,Sim:HumanlikeAI,aiHumanSkill:SKILL};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.KingdomSim=api;
})(typeof window==='undefined'?globalThis:window);
