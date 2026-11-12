/* Roster redesign v39 (docs/design/roster-redesign.md sections 3, 4, 6; docs/gameplay-v39.md).
   Retired units and buildings stay defined (old saves load, existing entities keep working) but leave the training and
   build menus; merged buildings hand their technologies and duties to the surviving building.
   Everything here is simulation state or pure data and deterministic; nothing reads the clock or Math.random. */
((root)=>{'use strict';
const K=typeof module!=='undefined'&&module.exports?require('./commander.js'):root.KingdomSim,Base=K.Sim,D=K.defs,T=K.tech,N=K.nations,dist=K.distance;

/* ---- 1. retire and merge ---- */
const RETIRED_UNITS=['trebuchet','siegewagon','steamcrawler','combatmedic','engineer','airtransport','gunship','carrier','airwing'];
const RETIRED_BUILDINGS={university:'blacksmith',foundry:'workshop',siegeyard:'workshop',steelworks:'workshop',signalbureau:'blacksmith',cannonturret:'fort',coastbattery:'fort',quarry:'miningcamp',bath:'church'};
/* v40: only the two gate orientations are merged (the gate turns to match adjacent walls); horizontal and vertical
   wall segments are both kept as build buttons. */
const MERGED={gatevertical:'gate'};
if(D.wallvertical)delete D.wallvertical.merged;
for(const k of RETIRED_UNITS)if(D[k])D[k].retired=true;
for(const k of Object.keys(RETIRED_BUILDINGS))if(D[k])D[k].retired=true;
for(const [k,to]of Object.entries(MERGED))if(D[k])D[k].merged=to;
D.barracks.trains=['infantry','halberd','eliteguard','grenadier','samurai','tercio','prussianguard'];
D.range.trains=['archer','musketeer','rifleguard','skirmisher','longbow','repeater','janissary','streltsy','continental','nassau'];
D.stable.trains=['hussar','cavalry','dragoon','cuirassier'];
D.workshop.trains=['cannon','mortar','howitzer','fieldmortar'];
D.dock.trains=['fishingboat','transport','sloop','frigate','bombketch'];
D.aerodrome.trains=['scoutballoon','bomber'];
D.town.trains=['villager'];
D.town.description='训练村民（军械工程师已并入村民）；推进时代，扩展人口与经济';
D.church.description='训练医师，并缓慢治疗附近脱战友军（合并海滨浴场的疗养功能）';
D.miningcamp.description='矿工把黄金与石料运回此处（合并采石场）；靠近矿脉修建可缩短往返路线';
for(const k of ['ballistics','logistics','fieldmedicine','masonry','smokeless','telegraph'])if(T[k])T[k].building='blacksmith';
for(const k of ['shells','rolledsteel'])if(T[k])T[k].building='workshop';
if(T.carrierflight)T.carrierflight.building='retired';
/* v40 (科技归位): unit-specific research moves to the building that trains those units; civic research moves to the Town
   Center / church. Same keys, costs, ages and effects (save and network compatible: tech levels are keyed by research). */
const TECH_HOME={ballistics:'range',smokeless:'range',fieldmedicine:'church',logistics:'town',masonry:'town',telegraph:'town'};
for(const [k,b]of Object.entries(TECH_HOME))if(T[k])T[k].building=b;
/* v40: steam crawlers are retired, so rolled steel only names what it still changes (measured by check-tech-intel.cjs). */
if(T.rolledsteel)T.rolledsteel.description='火炮护甲 +1（攻城炮兵与臼炮线）';

/* ---- 2. national units and landmarks (3.3, 6) ----
   Each national unit replaces one generic unit in the ordinary barracks / range / stable (table in 3.3). The ten national
   buildings become one-per-match landmarks (USA regains its retired hall). First strategic ability: a free national
   soldier every 90 s, within the population cap — the simplest ability that reuses existing units, art and spawn code,
   needs no new UI or targeting, and is deterministic for lockstep/authoritative play. */
const NATIONAL={britain:{archer:'longbow'},china:{archer:'repeater'},japan:{infantry:'samurai'},ottoman:{musketeer:'janissary'},russia:{musketeer:'streltsy'},usa:{musketeer:'continental'},spain:{halberd:'tercio'},prussia:{grenadier:'prussianguard'},france:{cavalry:'cuirassier'},netherlands:{skirmisher:'nassau'}};
const BASE_OF={};for(const m of Object.values(NATIONAL))for(const [base,unit]of Object.entries(m))BASE_OF[unit]=base;
const LANDMARK_EVERY=90;

/* ---- 3. air plan A (4), market (6) ----
   Balloon from age III, cheaper, no research, the largest sight (siege.js); bombers only attack buildings. The ranged line
   (archer / musketeer / skirmisher roles) and towers shoot air at half damage; forts at full damage. Markets stop making
   passive gold (engine.js reads D.market.noPassiveGold); trade caravans are the gold route. */
const AIR_HALF=.5;
Object.assign(D.aerodrome,{age:3,wood:260,gold:160,stone:60,description:'III 时代起训练侦察热气球；研究航空工程后训练双翼轰炸机，军机在此补弹'});
Object.assign(D.scoutballoon,{age:3,wood:80,gold:60,pop:1,noAeronautics:true,description:'III 时代，无需研究：无攻击能力，飞越地形提供超大视野；用来侦察敌人的打法和野外据点'});
D.bomber.description='V 时代：只攻击建筑，飞越城墙；每次出击携弹 2 枚，弹尽后自动返航补弹；怕远程防空';
Object.assign(D.fort,{antiAir:true,description:'重型区域防御，压制成群敌军，对空全伤害（合并棱堡炮塔与岸防炮台）；建在海岸时可炮击舰船'});
D.tower.description='自动射击附近敌军，可对空（伤害减半）';
Object.assign(D.market,{noPassiveGold:true,description:'训练贸易商队并研究采集效率；不再被动产生黄金，商队路线越长收益越高'});
if(T.aeronautics)T.aeronautics.description='解锁双翼轰炸机（侦察热气球无需研究）';

/* ---- 4. upgrade lines (3.2) ----
   Three blacksmith research lines. Each tier reuses an existing unit definition (stats and art), so the mortar line's later
   tiers are the howitzer / long mortar looks. Researching turns the team's existing and queued units of the current tier
   (including a national unit sitting on that tier) into the next tier; engine applyResearch keeps their health ratio. */
const LINES={
 spear:{id:'spear',name:'长枪线',tiers:['infantry','halberd','eliteguard'],cost:[{food:180,gold:120,time:30},{food:420,gold:300,time:45}]},
 ranged:{id:'ranged',name:'远程线',tiers:['archer','musketeer','rifleguard'],cost:[{wood:150,gold:150,time:30},{wood:300,gold:420,time:45}]},
 mortar:{id:'mortar',name:'臼炮线',tiers:['mortar','howitzer','fieldmortar'],cost:[{wood:300,gold:350,time:40},{wood:400,gold:500,stone:150,time:55}]}
};
/* v40 (科技归位): each line is researched at the building that trains it; the blacksmith keeps only generic attack/armor. */
const LINE_HOME={spear:'barracks',ranged:'range',mortar:'workshop'};
for(const l of Object.values(LINES))T['line_'+l.id]={name:l.name+'升级',icon:'⇪',max:2,building:LINE_HOME[l.id],age:2,line:l.id,...l.cost[0],description:'本线已有与正在训练的兵一起升为下一阶：'+l.tiers.map(k=>D[k].name).join(' → ')+'（各国特色兵按所替换的阶升级）'};
/* ---- 5. numbers (2.1 reversed, 3.1) ----
   Calibrated with scripts/balance/roster-battles.cjs (docs/gameplay-v39.md): inside each line a later tier is stronger per
   resource and per population, so researching pays off; one population per tier in the spear and ranged lines so an upgrade
   never overflows the cap. National units sit near the tier they replace. Role counters are x2 (empires.js). */
const STATS={
 infantry:{hp:160,damage:19},
 halberd:{hp:260,damage:28,food:65,wood:15,gold:20,bonus:{cavalry:2.4}},
 eliteguard:{hp:400,damage:40,food:85,gold:40,pop:1,bonus:{cavalry:2.5}},
 archer:{hp:100,damage:15},
 musketeer:{hp:160,damage:42,food:60,gold:45},
 rifleguard:{hp:230,damage:32,cooldown:.75,food:80,gold:70,pop:1},
 skirmisher:{hp:120,damage:32,food:50,gold:50,bonus:{archer:2,musketeer:2}},
 cavalry:{hp:300,damage:32},
 dragoon:{hp:330,damage:44,cooldown:1,pop:1},
 howitzer:{hp:300,damage:170,cooldown:5,wood:240,gold:240,pop:3,age:4},
 fieldmortar:{hp:330,damage:230,cooldown:4.8,wood:240,gold:260,pop:3},
 longbow:{hp:110,damage:18,wood:50,gold:35},
 repeater:{hp:100,damage:8,food:0,wood:45,gold:35},
 samurai:{hp:230,damage:31,cooldown:1.1,food:70,gold:30,bonus:{infantry:2}},
 tercio:{hp:300,damage:30,food:70,wood:20,gold:20,bonus:{cavalry:2.4}},
 janissary:{hp:180,damage:51,food:65,gold:55},
 streltsy:{hp:150,damage:36,food:55,wood:20,gold:20},
 continental:{hp:165,damage:50,food:65,wood:15,gold:40},
 cuirassier:{hp:340,damage:35,food:110,gold:70,pop:1},
 nassau:{food:60,wood:40,gold:20,bonus:{archer:2,musketeer:2}}
};
for(const [k,v]of Object.entries(STATS))if(D[k])Object.assign(D[k],v);
function lineOf(kind){const base=BASE_OF[kind]||kind;for(const l of Object.values(LINES)){const i=l.tiers.indexOf(base);if(i>=0)return{line:l,index:i}}return null}
if(D.congress){D.congress.retired=false;N.usa.building='congress'}
for(const n of Object.values(N)){const b=D[n.building];if(!b)continue;b.trains=[];b.landmark=true;b.description='国家地标：每局只能建造一座；每 90 秒免费征召 1 名'+D[n.unique].name+'（受人口上限限制）'+(T['doctrine_'+n.id]?.building===n.building?'；可研究国家学说':'')}

const AI_RESEARCH_ORDER=['weapons','line_spear','line_ranged','armor','carrying','gather','ballistics','hauling','line_mortar','smokeless','navigation','shells','logistics','hulls','telegraph','fieldmedicine','masonry','rolledsteel','leadership'];
const AI_RESEARCH_FIRST={rush:['weapons','line_spear','line_ranged'],boom:['carrying','gather','hauling'],expand:['carrying','hauling','gather','navigation'],turtle:['armor','masonry','line_mortar','ballistics']};
const AI_RESEARCH_LEVEL={beginner:{first:540,every:200,reserve:350,depth:1,only:['weapons','armor','line_spear','line_ranged','carrying']},easy:{first:420,every:120,reserve:280,depth:1},normal:{first:300,every:70,reserve:180,depth:2},hard:{first:220,every:45,reserve:120,depth:3},expert:{first:180,every:35,reserve:100,depth:3}};
class Roster extends Base{
 nationId(team){return this.nation?.(team)?.id||this.s.nations?.[team]}
 /* Why a unit is not offered to this team ('' = offered). Affordability, age and population are unitError's job. */
 trainHidden(b,kind){const d=D[kind],nat=this.nationId(b?.team||0);if(!d)return '未知兵种';if(d.retired)return '该兵种已并入其他兵种';if(d.nation&&d.nation!==nat)return '只能训练本国特色兵种';const sub=NATIONAL[nat]?.[kind];if(sub)return '本国以'+D[sub].name+'替代';
  const l=lineOf(kind);if(l){const team=b?.team||0,level=this.lineLevel(team,l.line.id);if(l.index!==level)return l.index<level?'已升级为'+D[this.lineKind(team,l.line.id,level)].name:'需要先在'+D[T['line_'+l.line.id].building].name+'研究'+T['line_'+l.line.id].name}return ''}
 baseKind(kind){return BASE_OF[kind]||kind}
 lineLevel(team,id){return this.s.tech[team]?.['line_'+id]||0}
 lineKind(team,id,i){const base=LINES[id].tiers[i];return NATIONAL[this.nationId(team)]?.[base]||base}
 lineTiers(team,id){return LINES[id].tiers.map((_,i)=>this.lineKind(team,id,i))}
 trainOptions(b){return (D[b?.kind]?.trains||[]).filter(k=>!this.trainHidden(b,k))}
 unitError(b,kind){if(D[b?.kind]?.retired)return D[b.kind].building?'此建筑已合并，不能再训练':'该单位已退役，不能再生产';if(D[kind]?.hero||D[kind]?.companion)return super.unitError(b,kind);return this.trainHidden(b,kind)||super.unitError(b,kind)}
 placementError(kind,x,y,team=0){if(RETIRED_BUILDINGS[kind]&&D[kind]?.retired)return '此建筑已合并到'+D[RETIRED_BUILDINGS[kind]].name;if(D[kind]?.landmark){if(D[kind].nation&&D[kind].nation!==this.nationId(team))return '只能建造本国地标';if(this.s.buildings.some(b=>b.team===team&&b.hp>0&&D[b.kind]?.landmark))return '每局只能建造一座国家地标'}return super.placementError(kind,x,y,team)}
 researchCost(key,team){const l=LINES[T[key]?.line];if(l){const c=l.cost[Math.min(1,this.lineLevel(team,l.id))];return{...c}}return super.researchCost(key,team)}
 researchError(b,key){if(T[key]?.building==='retired')return '该研究已移除';const l=LINES[T[key]?.line];if(l){const team=b?.team||0,level=this.lineLevel(team,l.id);if(level>=2)return '已达最高阶';const next=D[this.lineKind(team,l.id,level+1)];if(next.age>this.s.ages[team])return '需要 '+K.ageNames[next.age]}return super.researchError(b,key)}
 applyResearch(team,key){const l=LINES[T[key]?.line];if(l){const level=this.lineLevel(team,l.id);if(level<2){const from=[this.lineKind(team,l.id,level),l.tiers[level]],to=this.lineKind(team,l.id,level+1);
   for(const u of this.s.units)if(u.team===team&&from.includes(u.kind)){u.kind=to;u.upgradedAt=this.s.time}
   for(const b of this.s.buildings)if(b.team===team)for(const q of b.queue||[])if(q.type==='unit'&&from.includes(q.kind))q.kind=to;
   this.emit('lineUpgrade',{team,line:l.id,from:from[0],to})}}
  if(l||T[key])this.s.tech[team][key]??=0;super.applyResearch(team,key)}
 /* Computer plans and doctrines name base tiers ('halberd', 'archer'); score a line or national unit by its best relative. */
 aiUnitScore(team,kind,plan,own){const l=lineOf(kind),alts=new Set([kind,BASE_OF[kind]||kind,...(l?l.line.tiers:[])]);let best=-Infinity;for(const k of alts)best=Math.max(best,super.aiUnitScore(team,k,plan,own)-(k===kind?0:(own[kind]||0)*.7-(own[k]||0)*.7));return best}
 canTarget(u,e){if(e&&this.bomber?.(u)&&!D[e.kind]?.building)return false;return super.canTarget(u,e)}
 airShot(source,e){const d=D[source?.kind];return !!(d&&e&&this.air(e)&&!d.monster&&!d.hero&&!d.antiAir&&(['archer','musketeer','skirmisher'].includes(d.role)||source.kind==='tower'))}
 damage(e,amount,source){if(this.airShot(source,e))amount*=AIR_HALF;return super.damage(e,amount,source)}
 /* v40: computer research follows the relocated homes (科技归位). One research start per interval, only from spare
   resources above a reserve, ordered by the hidden doctrine; difficulty sets the interval, reserve and how deep it goes. */
 aiPlayer(team){super.aiPlayer(team);this.aiResearch(team)}
 aiResearch(team){const s=this.s;if(!(team>0)||s.humanTeams?.includes(team)||s.defeated?.includes(team)||!this.doctrineActive?.(team))return;const lv=AI_RESEARCH_LEVEL[s.difficulty]||AI_RESEARCH_LEVEL.normal;s.aiResearchAt??={};if(s.time<(s.aiResearchAt[team]??lv.first))return;
  const key=s.aiWar?.[team]?.key,order=[...(AI_RESEARCH_FIRST[key]||[]),...AI_RESEARCH_ORDER].filter((k,i,a)=>a.indexOf(k)===i&&T[k]&&(!lv.only||lv.only.includes(k))),bank=s.resources[team];
  if(s.ages[team]<5&&s.buildings.some(b=>b.team===team&&b.kind==='town'&&b.queue?.some(q=>q.kind==='age')))return;
  for(const k of order){const t=T[k];if((this.s.tech[team]?.[k]||0)>=Math.min(t.line?2:(t.max||1),lv.depth))continue;const b=s.buildings.find(b=>b.team===team&&b.kind===t.building&&b.complete&&b.hp>0&&!(b.queue||[]).length);if(!b||this.researchError(b,k))continue;const c=this.researchCost(k,team);if(['food','wood','gold','stone'].some(r=>(c[r]||0)>0&&(bank[r]||0)<(c[r]||0)+lv.reserve))continue;
   if(!this.research(b,k)){s.aiResearchAt[team]=s.time+lv.every;this.emit('aiResearch',{team,key:k});return}}
  s.aiResearchAt[team]=s.time+8}
 aiChooseUnit(team,choices,counts,reserve){return super.aiChooseUnit(team,choices.filter(k=>!this.trainHidden({team},k)),counts,reserve)}
 tick(dt){super.tick(dt);const s=this.s;if(s.ended)return;
  // The church absorbs the seaside bath's healing (no passive gold).
  for(const b of s.buildings){if(!b.complete||b.hp<=0)continue;
   if(b.kind==='church')for(const u of s.units)if(u.team===b.team&&!u.embarkedOn&&u.hp>0&&u.hp<u.maxhp&&!u.combatTarget&&u.order?.type!=='attack'&&dist(b,u)<170)u.hp=Math.min(u.maxhp,u.hp+dt*2);
   // Landmark levy: timer lives on the building (saved and synced with it); a full population cap skips that levy.
   if(D[b.kind]?.landmark&&b.team>=0){b.levyAt??=s.time+LANDMARK_EVERY;if(s.time>=b.levyAt){b.levyAt=s.time+LANDMARK_EVERY;const kind=N[this.nationId(b.team)]?.unique;
    if(kind&&D[kind]&&this.population(b.team)+(D[kind].pop||1)<=this.capacity(b.team)){const a=this.rand(0,Math.PI*2),u=this.add(kind,b.team,b.x+Math.cos(a)*(D[b.kind].r+60),b.y+Math.sin(a)*(D[b.kind].r+60));this.freeSpawn?.(u);this.rallySpawn?.(u,b);this.emit('trained',{team:b.team,kind,levy:true})}}}}}
}
const api={rosterTechHome:TECH_HOME,rosterLineHome:LINE_HOME,...K,Sim:Roster,rosterRetired:{units:RETIRED_UNITS,buildings:RETIRED_BUILDINGS,merged:MERGED},rosterNational:NATIONAL,rosterLandmarkEvery:LANDMARK_EVERY,rosterAirHalf:AIR_HALF,rosterLines:LINES,rosterLineOf:lineOf};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.KingdomSim=api;
})(typeof window==='undefined'?globalThis:window);
