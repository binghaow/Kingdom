/* Roster redesign v39 (docs/design/roster-redesign.md sections 3, 4, 6; docs/gameplay-v39.md).
   Retired units and buildings stay defined (old saves load, existing entities keep working) but leave the training and
   build menus; merged buildings hand their technologies and duties to the surviving building.
   Everything here is simulation state or pure data and deterministic; nothing reads the clock or Math.random. */
((root)=>{'use strict';
const K=typeof module!=='undefined'&&module.exports?require('./commander.js'):root.KingdomSim,Base=K.Sim,D=K.defs,T=K.tech,N=K.nations,dist=K.distance;

/* ---- 1. retire and merge ---- */
const RETIRED_UNITS=['trebuchet','siegewagon','steamcrawler','combatmedic','engineer','airtransport','gunship','carrier','airwing'];
const RETIRED_BUILDINGS={university:'blacksmith',foundry:'workshop',siegeyard:'workshop',steelworks:'workshop',signalbureau:'blacksmith',cannonturret:'fort',coastbattery:'fort',quarry:'miningcamp',bath:'church'};
const MERGED={wallvertical:'wall',gatevertical:'gate'};
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
if(D.congress){D.congress.retired=false;N.usa.building='congress'}
for(const n of Object.values(N)){const b=D[n.building];if(!b)continue;b.trains=[];b.landmark=true;b.description='国家地标：每局只能建造一座；每 90 秒免费征召 1 名'+D[n.unique].name+'（受人口上限限制）'+(T['doctrine_'+n.id]?.building===n.building?'；可研究国家学说':'')}

class Roster extends Base{
 nationId(team){return this.nation?.(team)?.id||this.s.nations?.[team]}
 /* Why a unit is not offered to this team ('' = offered). Affordability, age and population are unitError's job. */
 trainHidden(b,kind){const d=D[kind],nat=this.nationId(b?.team||0);if(!d)return '未知兵种';if(d.retired)return '该兵种已并入其他兵种';if(d.nation&&d.nation!==nat)return '只能训练本国特色兵种';const sub=NATIONAL[nat]?.[kind];if(sub)return '本国以'+D[sub].name+'替代';return ''}
 baseKind(kind){return BASE_OF[kind]||kind}
 trainOptions(b){return (D[b?.kind]?.trains||[]).filter(k=>!this.trainHidden(b,k))}
 unitError(b,kind){if(D[b?.kind]?.retired)return D[b.kind].building?'此建筑已合并，不能再训练':'该单位已退役，不能再生产';if(D[kind]?.hero||D[kind]?.companion)return super.unitError(b,kind);return this.trainHidden(b,kind)||super.unitError(b,kind)}
 placementError(kind,x,y,team=0){if(RETIRED_BUILDINGS[kind]&&D[kind]?.retired)return '此建筑已合并到'+D[RETIRED_BUILDINGS[kind]].name;if(D[kind]?.landmark){if(D[kind].nation&&D[kind].nation!==this.nationId(team))return '只能建造本国地标';if(this.s.buildings.some(b=>b.team===team&&b.hp>0&&D[b.kind]?.landmark))return '每局只能建造一座国家地标'}return super.placementError(kind,x,y,team)}
 researchError(b,key){if(T[key]?.building==='retired')return '该研究已移除';return super.researchError(b,key)}
 canTarget(u,e){if(e&&this.bomber?.(u)&&!D[e.kind]?.building)return false;return super.canTarget(u,e)}
 airShot(source,e){const d=D[source?.kind];return !!(d&&e&&this.air(e)&&!d.monster&&!d.hero&&!d.antiAir&&(['archer','musketeer','skirmisher'].includes(d.role)||source.kind==='tower'))}
 damage(e,amount,source){if(this.airShot(source,e))amount*=AIR_HALF;return super.damage(e,amount,source)}
 aiChooseUnit(team,choices,counts,reserve){return super.aiChooseUnit(team,choices.filter(k=>!this.trainHidden({team},k)),counts,reserve)}
 tick(dt){super.tick(dt);const s=this.s;if(s.ended)return;
  // The church absorbs the seaside bath's healing (no passive gold).
  for(const b of s.buildings){if(!b.complete||b.hp<=0)continue;
   if(b.kind==='church')for(const u of s.units)if(u.team===b.team&&!u.embarkedOn&&u.hp>0&&u.hp<u.maxhp&&!u.combatTarget&&u.order?.type!=='attack'&&dist(b,u)<170)u.hp=Math.min(u.maxhp,u.hp+dt*2);
   // Landmark levy: timer lives on the building (saved and synced with it); a full population cap skips that levy.
   if(D[b.kind]?.landmark&&b.team>=0){b.levyAt??=s.time+LANDMARK_EVERY;if(s.time>=b.levyAt){b.levyAt=s.time+LANDMARK_EVERY;const kind=N[this.nationId(b.team)]?.unique;
    if(kind&&D[kind]&&this.population(b.team)+(D[kind].pop||1)<=this.capacity(b.team)){const a=this.rand(0,Math.PI*2),u=this.add(kind,b.team,b.x+Math.cos(a)*(D[b.kind].r+60),b.y+Math.sin(a)*(D[b.kind].r+60));this.freeSpawn?.(u);this.rallySpawn?.(u,b);this.emit('trained',{team:b.team,kind,levy:true})}}}}}
}
const api={...K,Sim:Roster,rosterRetired:{units:RETIRED_UNITS,buildings:RETIRED_BUILDINGS,merged:MERGED},rosterNational:NATIONAL,rosterLandmarkEvery:LANDMARK_EVERY,rosterAirHalf:AIR_HALF};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.KingdomSim=api;
})(typeof window==='undefined'?globalThis:window);
