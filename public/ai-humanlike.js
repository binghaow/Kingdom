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

 aiPlayer(team){super.aiPlayer(team);if(!this.aiHumanOn(team)||this.s.ended)return;const town=this.s.buildings.find(b=>b.team===team&&b.kind==='town'&&b.hp>0);if(!town)return;this.aiH(team);if(this.s.cooperation?.[team]?.until>this.s.time)return;this.aiCounterHall(team,town)}
}
const api={...K,Sim:HumanlikeAI,aiHumanSkill:SKILL};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.KingdomSim=api;
})(typeof window==='undefined'?globalThis:window);
