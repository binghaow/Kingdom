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
D.barracks.trains=['infantry','halberd','eliteguard','grenadier'];
D.range.trains=['archer','musketeer','rifleguard','skirmisher'];
D.stable.trains=['hussar','cavalry','dragoon'];
D.workshop.trains=['cannon','mortar','howitzer','fieldmortar'];
D.dock.trains=['fishingboat','transport','sloop','frigate','bombketch'];
D.aerodrome.trains=['scoutballoon','bomber'];
D.town.trains=['villager'];
D.town.description='训练村民（军械工程师已并入村民）；推进时代，扩展人口与经济';
D.church.description='训练医师，并缓慢治疗附近脱战友军（合并海滨浴场的疗养功能）';
D.miningcamp.description='矿工把黄金与石料运回此处（合并采石场）；靠近矿脉修建可缩短往返路线';
D.fort.description='重型区域防御，压制成群敌军（合并棱堡炮塔与岸防炮台）；建在海岸时可炮击舰船';
for(const k of ['ballistics','logistics','fieldmedicine','masonry','smokeless','telegraph'])if(T[k])T[k].building='blacksmith';
for(const k of ['shells','rolledsteel'])if(T[k])T[k].building='workshop';
if(T.carrierflight)T.carrierflight.building='retired';

class Roster extends Base{
 nationId(team){return this.nation?.(team)?.id||this.s.nations?.[team]}
 /* Why a unit is not offered to this team ('' = offered). Affordability, age and population are unitError's job. */
 trainHidden(b,kind){const d=D[kind],nat=this.nationId(b?.team||0);if(!d)return '未知兵种';if(d.retired)return '该兵种已并入其他兵种';if(d.nation&&d.nation!==nat)return '只能训练本国特色兵种';return ''}
 trainOptions(b){return (D[b?.kind]?.trains||[]).filter(k=>!this.trainHidden(b,k))}
 unitError(b,kind){if(D[b?.kind]?.retired)return D[b.kind].building?'此建筑已合并，不能再训练':'该单位已退役，不能再生产';if(D[kind]?.hero||D[kind]?.companion)return super.unitError(b,kind);return this.trainHidden(b,kind)||super.unitError(b,kind)}
 placementError(kind,x,y,team=0){if(RETIRED_BUILDINGS[kind]&&D[kind]?.retired)return '此建筑已合并到'+D[RETIRED_BUILDINGS[kind]].name;return super.placementError(kind,x,y,team)}
 researchError(b,key){if(T[key]?.building==='retired')return '该研究已移除';return super.researchError(b,key)}
 aiChooseUnit(team,choices,counts,reserve){return super.aiChooseUnit(team,choices.filter(k=>!this.trainHidden({team},k)),counts,reserve)}
 tick(dt){super.tick(dt);const s=this.s;if(s.ended)return;
  // The church absorbs the seaside bath's healing (no passive gold).
  for(const b of s.buildings){if(!b.complete||b.hp<=0||b.kind!=='church')continue;
   for(const u of s.units)if(u.team===b.team&&!u.embarkedOn&&u.hp>0&&u.hp<u.maxhp&&!u.combatTarget&&u.order?.type!=='attack'&&dist(b,u)<170)u.hp=Math.min(u.maxhp,u.hp+dt*2)}}
}
const api={...K,Sim:Roster,rosterRetired:{units:RETIRED_UNITS,buildings:RETIRED_BUILDINGS,merged:MERGED}};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.KingdomSim=api;
})(typeof window==='undefined'?globalThis:window);
