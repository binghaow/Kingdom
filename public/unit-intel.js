/* Unit information panel data (roster-redesign.md section 5). Read-only: every number comes from the simulation's own
   functions (stat, attackInterval, counterMultiplier, structureMultiplier, structureFollowup); nothing here writes
   simulation, save or network state, and no multiplier is written by hand. The browser part (window.UnitIntelUI)
   renders the bottom selection panel and the training ⓘ dialog sections; the pure part is also loaded by
   check-unit-intel.cjs in Node. */
((root)=>{'use strict';
const K=typeof module!=='undefined'&&module.exports?require('./network-model.js'):root.KingdomSim,D=K.defs,T=K.tech;
/* Upgrade lines (roster-redesign.md 3.2) come from the simulation (roster.js): blacksmith research turns a line's units
   into the next tier. The bottom panel shows the tier tag and the ⓘ dialog shows the team's tiers with research costs. */
const UPGRADES_ENABLED=!!K.rosterLines;
const LINES=K.rosterLines?Object.values(K.rosterLines).map(l=>({id:l.id,name:l.name,tiers:l.tiers})):[{id:'spear',name:'长枪线',tiers:['infantry','halberd','eliteguard']},{id:'ranged',name:'远程线',tiers:['archer','musketeer','rifleguard']}];
const ROLE_NAMES={infantry:'近战步兵',archer:'弓手',musketeer:'火枪兵',skirmisher:'散兵',cavalry:'骑兵',cannon:'攻城炮兵',grenadier:'掷弹兵',worker:'村民',trader:'商队',healer:'医疗兵',support:'医疗兵',scout:'侦察',bomber:'轰炸机',transport:'运输',lightship:'舰船',warship:'舰船',bombship:'舰船',economyship:'舰船',carrier:'舰船',monster:'巨兽',wildlife:'野兽'};
const roleName=role=>ROLE_NAMES[role]||'其他';
function armorClass(kind){const d=D[kind]||{};if(d.building)return '建筑';if(d.domain==='sea')return '舰体';if(d.domain==='air')return '飞行器';if(d.monster)return '巨兽';if(d.wildlife)return '野兽';if(d.companion)return '宠物';if(d.role==='cavalry')return '骑兵甲';if(d.role==='cannon')return '器械';return '步兵甲'}
const rangeClass=r=>!(r>0)?'—':r<=80?'近':r<=230?'中':'远';
const speedClass=v=>!(v>0)?'—':v<50?'慢':v<100?'中':'快';
let trainableCache=null;
/* Every unit a non-retired building can train (all nations), the roster the checks and counter lists walk. */
function trainable(){if(trainableCache)return trainableCache;const set=new Set();for(const d of Object.values(D))if(d.building&&!d.retired&&d.trains)for(const k of d.trains)if(D[k]&&!D[k].retired)set.add(k);return trainableCache=[...set]}
/* Attack path: monsters, wildlife and companions have their own strike(); bombers drop bombs that skip strike(). */
function attackPath(sim,kind){const d=D[kind];if(!(d?.damage>0))return 'none';if(d.monster||d.wildlife||d.companion)return 'special';if(typeof sim?.bomber==='function'&&sim.bomber({kind}))return 'bomb';return 'strike'}
function multiplier(sim,attacker,target){return (attackPath(sim,attacker)==='strike'?K.counterMultiplier(attacker,target):1)*(sim.airShot?.({kind:attacker},{kind:target})?K.rosterAirHalf:1)}
function structureFactor(sim,kind){const path=attackPath(sim,kind);if(path==='none'||path==='special')return 1;return (path==='strike'?K.structureMultiplier(kind):1)*K.structureFollowup(kind)}
function group(list){const map=new Map();for(const x of list){const key=D[x.kind].role||'other';let g=map.get(key);if(!g)map.set(key,g={role:key,name:roleName(key),max:0,min:Infinity,kinds:[]});g.kinds.push(x);g.max=Math.max(g.max,x.mult);g.min=Math.min(g.min,x.mult)}return [...map.values()].sort((a,b)=>b.max-a.max||a.name.localeCompare(b.name))}
const counterCache=new Map();
/* What this unit beats: every trainable target where the simulation multiplier is above 1, grouped by target role. */
function counters(sim,kind){const key='c'+kind+(attackPath(sim,kind));if(counterCache.has(key))return counterCache.get(key);const list=[];for(const t of trainable()){const m=multiplier(sim,kind,t);if(m>1)list.push({kind:t,mult:m})}const r=group(list);counterCache.set(key,r);return r}
/* What beats this unit: every trainable attacker whose multiplier against it is above 1, grouped by attacker role. */
function threats(sim,kind){const key='t'+kind;if(counterCache.has(key))return counterCache.get(key);const list=[];for(const a of trainable()){const m=multiplier(sim,a,kind);if(m>1)list.push({kind:a,mult:m})}const r=group(list);counterCache.set(key,r);return r}
function lineOf(kind){const hit=K.rosterLineOf?.(kind),base=hit?hit.line.tiers[hit.index]:kind;for(const l of LINES){const i=l.tiers.indexOf(base);if(i>=0)return {id:l.id,name:l.name,index:i,total:l.tiers.length,tiers:l.tiers}}return null}
function interval(sim,e){return typeof sim.attackInterval==='function'?sim.attackInterval(e):(D[e.kind].cooldown||1)}
/* Live values for one entity (or a prototype {kind,team}); all bonuses come from sim.stat exactly as combat uses them. */
function profile(sim,e){const d=D[e.kind],get=k=>sim.stat(e,k)||0,damage=get('damage'),armor=get('armor'),range=get('range'),speed=get('speed'),gap=interval(sim,e),hpMax=e.maxhp??get('hp');
 return {kind:e.kind,team:e.team,age:d.age||1,pop:d.pop||1,hp:e.hp??hpMax,maxhp:hpMax,damage,baseDamage:d.damage||0,bonusDamage:damage-(d.damage||0),interval:gap,dps:damage>0?damage/gap:0,armor,baseArmor:armor,armorClass:armorClass(e.kind),range,rangeClass:rangeClass(range),speed,speedClass:speedClass(speed),attackPath:attackPath(sim,e.kind),structure:structureFactor(sim,e.kind),counters:counters(sim,e.kind),threats:threats(sim,e.kind),line:lineOf(e.kind)}}
/* A read-only view of the simulation with one technology level changed: used to discover which researched techs change
   this unit's numbers without encoding tech rules here. The copy shadows `s`; the real state is never written. */
function withTech(sim,team,key,level){const s=Object.create(sim.s),tech=sim.s.tech.slice();tech[team]={...(sim.s.tech[team]||{}),[key]:level};s.tech=tech;const f=Object.create(sim);Object.defineProperty(f,'s',{value:s});return f}
const PROBE=['hp','damage','armor','range','speed'];
function techEffects(sim,e){const team=e.team||0,out=[],current=sim.s.tech[team]||{},nation=sim.nation?.(team)?.id;
 for(const [key,t] of Object.entries(T)){if(key==='age'||(t.nation&&t.nation!==nation))continue;const max=t.max||1,lo=withTech(sim,team,key,0),hi=withTech(sim,team,key,max),changes={};
  for(const k of PROBE){const a=lo.stat(e,k)||0,b=hi.stat(e,k)||0;if(Math.abs(b-a)>1e-9)changes[k]=b-a}const ia=interval(lo,e),ib=interval(hi,e);if(Math.abs(ib-ia)>1e-9)changes.interval=ib-ia;
  if(Object.keys(changes).length)out.push({key,name:t.name,building:t.building,level:current[key]||0,max,changes})}
 return out}
function buildingFor(kind){for(const [k,d] of Object.entries(D))if(d.building&&!d.retired&&d.trains?.includes(kind))return k;return null}
/* Same-building comparison rows for the ⓘ bars (only this nation's special units). */
function peers(sim,kind,team=0){const b=buildingFor(kind),nation=sim.nation?.(team)?.id,list=b?D[b].trains.filter(k=>D[k]&&(!D[k].nation||D[k].nation===nation||k===kind)):[kind];if(!list.includes(kind))list.push(kind);return list.map(k=>profile(sim,{kind:k,team,rank:0}))}
/* Multi-selection summary: count and total health per kind, in selection order. */
function groups(entities){const map=new Map();for(const e of entities){if(!e||!D[e.kind]||D[e.kind].building)continue;let g=map.get(e.kind);if(!g)map.set(e.kind,g={kind:e.kind,count:0,hp:0,maxhp:0,ids:[]});g.count++;g.hp+=Math.max(0,e.hp||0);g.maxhp+=e.maxhp||0;g.ids.push(e.id)}return [...map.values()]}
/* ---- Research ⓘ (v40). Every number is measured: the simulation is read through a non-mutating shadow (withTech) at
   level L and L+1 with stat / attackInterval / sight / capacity / carryingCapacity / gatherRate and the rate methods
   heroCooldownFactor, heroManaRegen, fieldRegen, tradeBonus. Nothing is written by hand and nothing is mutated. ---- */
const UNIT_PROBES=[['hp','生命','pct'],['damage','攻击','pct'],['armor','护甲','abs'],['range','射程','pct'],['speed','速度','pct'],['interval','攻击间隔','pct'],['sight','视野','pct'],['loaded','负重移速','pct']];
const TEAM_PROBES=[
 ['popcap','人口上限','abs',(f,t)=>{const s=f.s;const houses=[{kind:'town',team:t,complete:true,hp:1}];for(let i=0;i<40;i++)houses.push({kind:'house',team:t,complete:true,hp:1});const g=Object.create(f);const sh=Object.create(s);sh.buildings=houses;Object.defineProperty(g,'s',{value:sh});return typeof g.capacity==='function'?g.capacity(t):0}],
 ['carry','村民每次背负量','abs',(f,t)=>f.carryingCapacity?.({kind:'villager',team:t})||0],
 ['gather','村民采集速度（木材）','pct',(f,t)=>f.gatherRate?.({kind:'villager',team:t},{kind:'tree',resource:'wood'})||0],
 ['heroCooldown','英雄技能冷却','pct',(f,t)=>f.heroCooldownFactor?.(t)??1],
 ['heroMana','英雄魔力恢复（每秒）','abs',(f,t)=>f.heroManaRegen?.(t)||0],
 ['regen','脱战陆军回复（生命/秒）','abs',(f,t)=>f.fieldRegen?.(t)||0],
 ['trade','商队额外收益','pp',(f,t)=>f.tradeBonus?.(t)||0]];
function probeUnit(f,e,k){try{if(k==='interval')return interval(f,e);if(k==='sight')return typeof f.sight==='function'?f.sight(e):0;if(k==='loaded')return e.kind==='villager'?f.stat({...e,cargo:{resource:'wood',amount:1}},'speed')||0:0;return f.stat(e,k)||0}catch{return 0}}
function techLevel(sim,team,key){const t=T[key];if(t?.line)return sim.lineLevel?.(team,t.line)??(sim.s.tech[team]?.[key]||0);return sim.s.tech[team]?.[key]||0}
function techCandidates(sim,team){const nation=sim.nation?.(team)?.id,units=trainable().filter(k=>!D[k].nation||D[k].nation===nation),heroes=Object.keys(D).filter(k=>D[k].hero&&!D[k].retired&&(!D[k].nation||D[k].nation===nation)).slice(0,12),buildings=Object.keys(D).filter(k=>D[k].building&&!D[k].retired&&!D[k].merged&&(!D[k].nation||D[k].nation===nation));return{units:[...units,...heroes.filter(k=>!units.includes(k))],buildings}}
/* Percentages are relative to the level-0 value ("每级 +20%" = +20% of base each level); integers above 5% absorb hp rounding. */
function deltaOf(kind,a,b,base=a){if(kind==='abs')return Math.round((b-a)*100)/100;if(kind==='pp')return Math.round((b-a)*1000)/10;if(!base)return 0;const p=(b-a)/base*100;return Math.abs(p)>=5?Math.round(p):Math.round(p*10)/10}
const signed=v=>(v>0?'+':v<0?'−':'')+Math.abs(v);
function deltaText(kind,v){return signed(v)+(kind==='abs'?'':'%')}
/* Effects of one step (level lo → lo+1) for this team. */
function techStep(sim,team,key,lo){const t=T[key],z=withTech(sim,team,key,0),a=withTech(sim,team,key,lo),b=withTech(sim,team,key,lo+1),c=techCandidates(sim,team),raw=[],add=(probe,label,kind,d,unit)=>{if(d)raw.push({probe,label,kind,d,unit})};
 for(const k of c.units){const e={kind:k,team,rank:0,x:0,y:0};for(const [p,label,kind]of UNIT_PROBES)add(p,label,kind,deltaOf(kind,probeUnit(a,e,p),probeUnit(b,e,p),probeUnit(z,e,p)),k)}
 for(const k of c.buildings){const e={kind:k,team,x:0,y:0};add('bhp','建筑生命','pct',deltaOf('pct',a.stat(e,'hp')||0,b.stat(e,'hp')||0,z.stat(e,'hp')||0),k)}
 for(const [p,label,kind,get]of TEAM_PROBES)add(p,label,kind,deltaOf(kind,get(a,team),get(b,team),get(z,team)),null);
 /* group per probe around the most common value; values within 1 point of it are rounding noise of the same effect */
 const groups=new Map();for(const p of new Set(raw.map(r=>r.probe))){const rs=raw.filter(r=>r.probe===p),count={};for(const r of rs)count[r.d]=(count[r.d]||0)+1;const vals=Object.keys(count).map(Number).sort((x,y)=>count[y]-count[x]||Math.abs(y)-Math.abs(x));for(const r of rs){const v=vals.find(v=>v===r.d||(r.kind==='pct'&&Math.abs(v-r.d)<=1&&Math.sign(v)===Math.sign(r.d)))??r.d,id=p+'|'+v;let g=groups.get(id);if(!g)groups.set(id,g={probe:p,label:r.label,kind:r.kind,delta:v,text:deltaText(r.kind,v),kinds:[]});if(r.unit)g.kinds.push(r.unit)}}
 const unlocks=[];for(const [bk,bd]of Object.entries(D)){if(!bd.building||bd.retired||!bd.trains)continue;for(const k of bd.trains){if(!D[k]||D[k].retired)continue;let ea,eb;try{ea=a.unitError({kind:bk,team,queue:[]},k);eb=b.unitError({kind:bk,team,queue:[]},k)}catch{continue}if(ea&&ea!==eb&&/研究|解锁/.test(ea)&&!/研究.*线/.test(ea))unlocks.push(k)}}
 let line=null;if(t?.line&&sim.lineKind&&lo<2)line={from:sim.lineKind(team,t.line,lo),to:sim.lineKind(team,t.line,lo+1)};
 return{effects:[...groups.values()],unlocks:[...new Set(unlocks)],line}}
/* Full ⓘ data for one research key ('age' = the town centre's age advance). `focus` = unit kinds to compare (selection). */
function techInfo(sim,team,key,focus=[]){const nation=sim.nation?.(team)?.id;
 if(key==='age'){const age=sim.s.ages[team]||1,next=Math.min(5,age+1),cost=sim.researchCost?.('age',team)||{},pick=f=>Object.keys(D).filter(k=>f(D[k])&&!D[k].retired&&!D[k].merged&&(D[k].age||1)===next&&(!D[k].nation||D[k].nation===nation));
  return{key,name:'晋升 '+(K.ageNames?.[next]||next),age:next,cost,level:age,max:5,unlockBuildings:pick(d=>d.building&&!d.landmark&&!d.wild),unlockUnits:pick(d=>!d.building&&!d.hero&&!d.monster&&!d.wildlife&&!d.companion).filter(k=>trainable().includes(k)&&!(sim.trainHidden?.({team,kind:'barracks'},k))),unlockTechs:Object.keys(T).filter(k=>T[k].age===next&&T[k].building!=='retired'&&(!T[k].nation||T[k].nation===nation)),effects:[],steps:[]}}
 const t=T[key];if(!t||t.building==='retired')return null;const max=t.line?2:(t.max||1),level=Math.min(techLevel(sim,team,key),max),steps=[];
 for(let lo=0;lo<max;lo++)steps.push(techStep(sim,team,key,lo));
 const next=Math.min(level,max-1),step=steps[next],cost=sim.researchCost?.(key,team)||{},compare=[];
 const affected=step.effects.flatMap(g=>g.kinds).filter(k=>trainable().includes(k)),kinds=[...new Set(focus.length?focus:[...affected.filter(k=>k!=='villager'),...affected])].slice(0,4);
 if(step.line&&!focus.length){compare.push({kind:step.line.from,to:step.line.to})}
 else for(const k of kinds.slice(0,6)){compare.push({kind:k,to:k})}
 const a=withTech(sim,team,key,next),b=withTech(sim,team,key,next+1),rows=compare.map(c=>{const ea={kind:c.kind,team,rank:0},eb={kind:c.to,team,rank:0},m=(f,e)=>({hp:probeUnit(f,e,'hp'),damage:probeUnit(f,e,'damage'),armor:probeUnit(f,e,'armor'),range:probeUnit(f,e,'range'),speed:probeUnit(f,e,'speed'),interval:probeUnit(f,e,'interval')});return{kind:c.kind,to:c.to,before:m(a,ea),after:m(b,eb)}});
 return{key,name:t.name,description:t.description,building:t.building,age:t.age||1,cost,time:t.time,level,max,done:level>=max,step,steps,compare:rows,nation:t.nation||null}}
/* Every signed number in a description ("+20%", "−10%", "+2", "+0.2") paired with what one research step measures. */
function descriptionNumbers(text){return [...String(text||'').matchAll(/([+\-−])\s?(\d+(?:\.\d+)?)\s*(%?)/g)].map(m=>({sign:m[1]==='+'?1:-1,value:+m[2],pct:!!m[3]}))}
const fmt=m=>'×'+(Math.round(m*100)/100);
const api={techInfo,techStep,descriptionNumbers,UNIT_PROBES,TEAM_PROBES,withTech,UPGRADES_ENABLED,LINES,ROLE_NAMES,roleName,armorClass,rangeClass,speedClass,trainable,attackPath,multiplier,structureFactor,counters,threats,lineOf,interval,profile,techEffects,buildingFor,peers,groups,fmt};
if(typeof module!=='undefined'&&module.exports){module.exports=api;return}
root.UnitIntel=api;

/* ---------- Browser rendering ---------- */
const A=()=>root.KingdomArt,$=id=>document.getElementById(id);
const isEn=()=>document.documentElement.lang==='en';
/* New phrases live in locale-campaign.js (KingdomUnitIntelText); names fall back to the shared dictionary. */
function tr(zh){if(!isEn())return zh;const own=root.KingdomUnitIntelText?.[zh];if(own)return own;const core=root.KingdomI18nCore;return core?core.translate(zh,'en'):zh}
const esc=v=>String(v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
/* Unit and building names use the shared game dictionary (the panel table has role words such as 散兵 = Skirmishers). */
const gameName=zh=>isEn()&&root.KingdomI18nCore?root.KingdomI18nCore.translate(zh,'en'):zh,name=k=>gameName(D[k].name);
const r0=v=>Math.round(v),r1=v=>Math.round(v*10)/10;
const icon=k=>{try{return A()?.icon?.(k)||''}catch{return ''}};
function chip(g,cls){const rep=g.kinds[0].kind,mult=g.min===g.max?fmt(g.max):fmt(g.min)+'–'+(Math.round(g.max*100)/100),title=g.kinds.map(x=>name(x.kind)+' '+fmt(x.mult)).join(' · ');
 return '<span class="ui-chip '+cls+'" data-kinds="'+g.kinds.map(x=>x.kind).join(' ')+'" title="'+esc(title)+'"><img alt="" src="'+icon(rep)+'"><span class="ui-chip-name">'+esc(tr(g.name))+'</span><b>'+mult+'</b></span>'}
function counterRow(p,enemy){const good=p.counters.slice(0,2),bad=p.threats.slice(0,2);let h='<div class="ui-counter">';
 h+='<span class="ui-k good" title="'+esc(tr('克制'))+'">⚔ <i class="ui-label">'+tr('克')+'</i></span>'+(good.length?good.map(g=>chip(g,'good')).join(''):'<span class="ui-none">'+tr('无')+'</span>');
 h+='<span class="ui-k bad">⚠ <i class="ui-label">'+tr(enemy?'对付它':'怕')+'</i></span>'+(bad.length?bad.map(g=>chip(g,'bad')).join(''):'<span class="ui-none">'+tr('无')+'</span>');
 if(p.structure!==1)h+='<span class="ui-chip good ui-structure" data-structure="1" title="'+esc(tr('攻击建筑'))+'"><span class="ui-chip-name">'+tr('建筑')+'</span><b>'+fmt(p.structure)+'</b></span>';
 return h+'</div>'}
function statRow(p){const bonus=p.bonusDamage;let h='<div class="ui-stats">';
 h+='<span class="ui-cell"><i>'+tr('攻击')+'</i><b>'+(p.damage>0?r0(p.damage):'—')+'</b>'+(p.damage>0&&Math.round(bonus)?'<em class="ui-bonus'+(bonus<0?' minus':'')+'">('+(bonus>0?'+':'')+r0(bonus)+')</em>':'')+(p.dps>0?'<small>'+r1(p.dps)+tr('/秒')+'</small>':'')+'</span>';
 h+='<span class="ui-cell"><i>'+tr('护甲')+'</i><b>'+r0(p.armor)+'</b><small>'+tr(p.armorClass)+'</small></span>';
 h+='<span class="ui-cell"><i>'+tr('射程')+'</i><small class="ui-tag">'+tr(p.rangeClass)+'</small><b>'+(p.range>0?r0(p.range):'')+'</b></span>';
 h+='<span class="ui-cell"><i>'+tr('速度')+'</i><small class="ui-tag">'+tr(p.speedClass)+'</small><b>'+r0(p.speed)+'</b></span>';
 if(UPGRADES_ENABLED&&p.line)h+='<span class="ui-cell ui-line"><i>'+tr('升级')+'</i><b>'+tr(p.line.name)+' '+(p.line.index+1)+'/'+p.line.total+'</b></span>';
 return h+'<button class="ui-more" type="button" aria-label="'+esc(tr('查看兵种详细数值'))+'">ⓘ</button></div>'}
let panel,focus=null,lastSel='',lastSig='';
function ensure(){if(panel)return panel;panel=document.createElement('div');panel.id='unit-intel';panel.dataset.i18nIgnore='true';panel.hidden=true;document.querySelector('footer .selection')?.append(panel);
 if(typeof ResizeObserver==='function')new ResizeObserver(()=>{if(!panel.hidden)document.documentElement.style.setProperty('--ui-h',Math.ceil(panel.getBoundingClientRect().height)+'px')}).observe(panel);
 panel.addEventListener('click',ev=>{const g=ev.target.closest('[data-focus]');if(g){focus=g.dataset.focus==='*'?null:g.dataset.focus;lastSig='';ev.stopPropagation();return}if(ev.target.closest('.ui-more')&&panel._show){ev.stopPropagation();panel._show()}});
 document.addEventListener('kingdom-language-change',()=>{lastSig=''});return panel}
/* Bottom panel. Returns true when it handled the selection (units), false to let the old stat bar show (buildings, resources). */
function update(sim,ids,show){const p0=ensure();const list=ids.map(id=>sim.byId(id)).filter(e=>e&&D[e.kind]&&!D[e.kind].building&&e.hp!==undefined);
 /* A new selection resets the focused kind; units dying out of the same selection keep it. */
 const selKey=ids.join(',');if(selKey!==lastSel){const old=new Set(lastSel.split(','));if(!ids.every(id=>old.has(String(id))))focus=null;lastSel=selKey}
 if(!list.length){if(!p0.hidden){p0.hidden=true;document.body.classList.remove('unit-intel-on','unit-intel-multi')}return false}
 const kinds=groups(list),multi=kinds.length>1||list.length>1;if(focus&&!kinds.some(g=>g.kind===focus))focus=null;
 const lead=focus?list.find(e=>e.kind===focus):list[0],enemy=lead.team!==0&&(!sim.hostile||sim.hostile(0,lead.team)),showGroups=multi&&!focus;
 const p=profile(sim,lead);const sig=[isEn(),focus,lead.id,multi?kinds.map(g=>g.kind+g.count).join():'',r0(p.damage),r1(p.dps),r0(p.armor),r0(p.range),r0(p.speed),enemy].join('|');
 if(sig!==lastSig){lastSig=sig;let h='';
  if(multi){h+='<div class="ui-groups">'+(focus?'<button type="button" class="ui-group ui-all" data-focus="*">‹ '+tr('全部')+' '+list.length+'</button>':'')+kinds.map(g=>'<button type="button" class="ui-group'+(g.kind===focus?' active':'')+'" data-focus="'+g.kind+'" title="'+esc(name(g.kind))+'"><img alt="" src="'+icon(g.kind)+'"><b>×'+g.count+'</b><small data-hp="'+g.kind+'"></small></button>').join('')+'</div>'}
  if(!showGroups)h+=statRow(p)+counterRow(p,enemy);
  else h+='<div class="ui-hint">'+tr('点选一类兵查看详情')+'</div>';
  p0.innerHTML=h;p0.classList.toggle('enemy',enemy)}
 /* Group health changes every frame in battle: update text in place so buttons are never replaced under the pointer. */
 if(multi)for(const g of kinds){const el=p0.querySelector('[data-hp="'+g.kind+'"]'),t=String(r0(g.hp));if(el&&el.textContent!==t)el.textContent=t}
 p0._show=()=>show(lead.kind,sim,lead);p0.hidden=false;document.body.classList.add('unit-intel-on');document.body.classList.toggle('unit-intel-multi',multi);return true}
/* ⓘ dialog sections for a unit (appended inside #unit-record by campaign-ui.js). */
function bars(sim,p){const rows=peers(sim,p.kind,p.team),keys=[['maxhp','生命'],['dps','每秒伤害'],['armor','护甲'],['range','射程'],['speed','速度'],['pop','人口']],max={};for(const [k] of keys)max[k]=Math.max(1e-9,...rows.map(r=>r[k]||0));
 return '<section class="ui-bars"><h4>'+tr('战斗力概览')+' <small>'+tr('对比同建筑兵种')+'</small></h4>'+keys.map(([k,label])=>'<div class="ui-bar-row"><span>'+tr(label)+'</span><div class="ui-bar-track">'+rows.map(r=>'<i class="'+(r.kind===p.kind?'me':'')+'" style="width:'+Math.max(2,(r[k]||0)/max[k]*100).toFixed(1)+'%" title="'+esc(name(r.kind)+' '+r1(r[k]||0))+'"></i>').join('')+'</div><b>'+r1(p[k]||0)+'</b></div>').join('')+'<p class="ui-legend">'+tr('高亮为本兵种；其余条为')+' '+rows.filter(r=>r.kind!==p.kind).map(r=>esc(name(r.kind))).join('、')+'</p></section>'}
function columns(p,enemy){const list=(groups,cls)=>groups.length?groups.map(g=>'<li><b class="'+cls+'">'+esc(tr(g.name))+'</b>'+g.kinds.map(x=>'<span class="ui-unit" data-kind="'+x.kind+'"><img alt="" src="'+icon(x.kind)+'">'+esc(name(x.kind))+' <b>'+fmt(x.mult)+'</b></span>').join('')+'</li>').join(''):'<li class="ui-none">'+tr('无')+'</li>';
 let h='<section class="ui-columns"><div><h4>⚔ '+tr('克制')+'</h4><ul>'+list(p.counters,'good')+(p.structure!==1?'<li><b class="good">'+tr('建筑')+'</b><span class="ui-unit" data-structure="1">'+tr('攻击建筑')+' <b>'+fmt(p.structure)+'</b></span></li>':'')+'</ul></div><div><h4>⚠ '+tr(enemy?'对付它':'被克制')+'</h4><ul>'+list(p.threats,'bad')+'</ul></div></section>';
 if(p.attackPath==='bomb')h+='<p class="ui-note">'+tr('炸弹伤害不使用克制倍率。')+'</p>';
 return h+'<p class="ui-note">'+tr('倍率乘在攻击上，再扣除目标护甲；与战场伤害公式相同。')+'</p>'}
function lineSection(sim,p){const l=p.line;if(!l)return '<section class="ui-line-sec"><h4>'+tr('升级潜力')+'</h4><p class="ui-note">'+tr('此兵种暂无升级线。')+'</p></section>';
 const tiers=sim.lineTiers?sim.lineTiers(p.team,l.id):l.tiers,level=sim.lineLevel?sim.lineLevel(p.team,l.id):0,rows=tiers.map(k=>profile(sim,{kind:k,team:p.team,rank:0})),key='line_'+l.id,
  names={food:'食物',wood:'木材',gold:'黄金',stone:'石料'},price=i=>{if(i<1||!UPGRADES_ENABLED)return '—';if(i<=level)return tr('已研究');const c=K.rosterLines[l.id].cost[i-1];return Object.keys(names).filter(r=>c[r]).map(r=>c[r]+tr(names[r])).join(' / ')};
 return '<section class="ui-line-sec"><h4>'+tr('升级潜力')+' · '+tr(l.name)+'</h4><p class="ui-note">'+tr(UPGRADES_ENABLED?'在铁匠铺研究升级：本线已有与正在训练的兵一起升为下一阶。':'升级研究尚未实现：以下为同一条线上现有的独立兵种，仅作参考；研究费用待升级机制完成后显示。')+'</p><div class="ui-tiers">'+rows.map((r,i)=>'<div class="ui-tier'+(r.kind===p.kind?' me':'')+'"><img alt="" src="'+icon(r.kind)+'"><b>'+(i+1)+'. '+esc(name(r.kind))+'</b><small>'+tr('时代')+' '+['','I','II','III','IV','V'][r.age]+' · '+esc(gameName(D[buildingFor(r.kind)]?.name||''))+'</small><small>'+tr('生命')+' '+r0(r.maxhp)+' · '+tr('攻击')+' '+r0(r.damage)+' · '+tr('护甲')+' '+r0(r.armor)+' · '+tr('射程')+' '+r0(r.range)+'</small><small>'+tr('研究费用')+' '+esc(price(i))+'</small></div>').join('')+'</div></section>'}
function techSection(sim,e){const list=techEffects(sim,e);if(!list.length)return '';const label={hp:'生命',damage:'攻击',armor:'护甲',range:'射程',speed:'速度',interval:'间隔'};
 return '<section class="ui-techs"><h4>'+tr('对它生效的科技')+'</h4><ul>'+list.map(t=>'<li class="'+(t.level>=t.max?'done':'')+'"><span>'+(t.level>=t.max?'✓':t.level>0?'◐':'○')+'</span><b>'+esc(gameName(t.name))+'</b><small>'+t.level+'/'+t.max+' · '+esc(gameName(D[t.building]?.name||''))+' · '+Object.entries(t.changes).map(([k,v])=>tr(label[k])+' '+(v>0?'+':'')+r1(v)).join(' / ')+'</small></li>').join('')+'</ul></section>'}
function dialog(sim,e){const d=D[e.kind];if(!d||d.building)return '';const p=profile(sim,e),enemy=e.team!==0&&(!sim.hostile||sim.hostile(0,e.team));
 const good=p.counters.map(g=>tr(g.name)).slice(0,3),bad=p.threats.map(g=>tr(g.name)).slice(0,3);
 const role='<p class="ui-role">'+(good.length?'<span class="good">'+tr('克')+' '+good.map(esc).join(tr('、'))+'</span>':'<span>'+tr('无克制加成')+'</span>')+'<span class="bad">'+tr(enemy?'对付它':'怕')+' '+(bad.length?bad.map(esc).join(tr('、')):tr('无'))+'</span>'+(p.structure!==1?'<span class="good">'+tr('攻击建筑')+' '+fmt(p.structure)+'</span>':'')+'</p>';
 return {role,body:bars(sim,p)+columns(p,enemy)+lineSection(sim,p)+techSection(sim,e)}}
/* Research ⓘ (v40): same dialog (#unit-record) and section styles as the unit ⓘ. `focus` = kinds to compare. */
const RES={food:'食物',wood:'木材',gold:'黄金',stone:'石料'};
function costText(c){return Object.entries(c||{}).filter(([k,v])=>RES[k]&&v>0).map(([k,v])=>tr(RES[k])+' '+v).join(' · ')}
function namesText(kinds){const n=kinds.map(k=>name(k));return n.length>8?n.slice(0,8).join(tr('、'))+' '+tr('等')+' '+n.length+' '+tr('种'):n.join(tr('、'))}
function effectList(step){const li=[];if(step.line)li.push('<li><b>'+tr('升阶')+'</b><span>'+esc(name(step.line.from))+' → '+esc(name(step.line.to))+'</span><small>'+tr('本线已有与正在训练的兵一起升阶（保持血量比例）')+'</small></li>');
 for(const k of step.unlocks)li.push('<li><b>'+tr('解锁')+'</b><span>'+esc(name(k))+'</span><small>'+tr('仍需支付训练费用与人口')+'</small></li>');
 for(const g of step.effects)li.push('<li><b>'+esc(tr(g.label))+' '+esc(g.text)+'</b><small>'+(g.kinds.length?tr('影响')+'：'+esc(namesText(g.kinds)):tr('全国生效'))+'</small></li>');
 return li.length?li.join(''):'<li class="ui-none">'+tr('无可测量的数值变化')+'</li>'}
function compareTable(info){if(!info.compare.length)return '';const keys=[['hp','生命'],['damage','攻击'],['armor','护甲'],['range','射程'],['speed','速度'],['interval','攻击间隔']];
 return '<section class="ui-compare"><h4>'+tr('研究后对比')+' <small>'+tr(info.focused?'当前选中的单位':'受影响的代表单位')+'</small></h4><table><thead><tr><th></th>'+keys.map(([,l])=>'<th>'+tr(l)+'</th>').join('')+'</tr></thead><tbody>'+info.compare.map(r=>'<tr><th>'+esc(name(r.kind))+(r.to!==r.kind?' → '+esc(name(r.to)):'')+'</th>'+keys.map(([k])=>{const a=r.before[k],b=r.after[k],ch=Math.abs(a-b)>1e-9;return '<td class="'+(ch?(k==='interval'?(b<a?'good':'bad'):(b>a?'good':'bad')):'')+'">'+r1(a)+(ch?' → <b>'+r1(b)+'</b>':'')+'</td>'}).join('')+'</tr>').join('')+'</tbody></table></section>'}
function techDialog(sim,key,focusIds=[]){const team=0,focus=[...new Set(focusIds.map(id=>sim.byId(id)).filter(e=>e&&e.team===team&&D[e.kind]&&!D[e.kind].building).map(e=>e.kind))];
 if(key==='age'){const i=techInfo(sim,team,'age'),list=(ks,f)=>ks.length?ks.map(f).join(tr('、')):tr('无');return '<div class="unit-record-head"><div><h3>♜ '+esc(gameName(i.name))+'</h3><p>'+tr('城镇中心研究：推进时代，解锁下列建筑、兵种与研究。')+'</p></div></div><section class="ui-techs ui-techfx"><h4>'+tr('解锁')+'</h4><ul><li><b>'+tr('建筑')+'</b><small>'+esc(list(i.unlockBuildings,k=>name(k)))+'</small></li><li><b>'+tr('兵种')+'</b><small>'+esc(list(i.unlockUnits,k=>name(k)))+'</small></li><li><b>'+tr('研究')+'</b><small>'+esc(list(i.unlockTechs,k=>gameName(T[k].name)))+'</small></li></ul></section><p class="ui-note">'+tr('费用')+'：'+esc(costText(i.cost))+'</p>'}
 const own={};for(const u of sim.s.units)if(u.team===team&&u.hp>0)own[u.kind]=(own[u.kind]||0)+1;
 let i=techInfo(sim,team,key,focus);if(!i)return '';if(!focus.length){const step=i.steps[Math.min(i.level,i.max-1)],field=[...new Set(step.effects.flatMap(g=>g.kinds))].filter(k=>own[k]&&k!=='villager').sort((a,b)=>own[b]-own[a]).slice(0,4);if(field.length&&!step.line)i=techInfo(sim,team,key,field)}else i.focused=true;
 const step=i.steps[Math.min(i.level,i.max-1)],per=i.max>1&&!i.steps[0].line?'<section class="ui-techs"><h4>'+tr('各级')+'</h4><ul>'+i.steps.map((st,n)=>'<li class="'+(n<i.level?'done':'')+'"><span>'+(n<i.level?'✓':'○')+'</span><b>'+tr('第')+' '+(n+1)+' '+tr('级')+'</b><small>'+st.effects.map(g=>esc(tr(g.label)+' '+g.text)).join(' / ')+'</small></li>').join('')+'</ul></section>':'';
 return '<div class="unit-record-head"><div><h3><i class="ui-glyph" aria-hidden="true">'+esc(T[key].icon||'')+'</i> '+esc(gameName(i.name))+'</h3><p>'+esc(gameName(i.description||''))+'</p></div></div>'+
  '<p class="ui-note">'+tr('研究建筑')+'：'+esc(gameName(D[i.building]?.name||i.building))+' · '+tr('时代')+' '+esc(gameName(String(K.ageNames?.[i.age]||i.age)))+' · '+tr('费用')+'：'+esc(costText(i.cost))+' · '+(i.time||0)+' '+tr('秒')+' · '+tr('进度')+' '+i.level+'/'+i.max+'</p>'+
  '<section class="ui-techs ui-techfx"><h4>'+tr(i.done?'已完成：最后一级的作用':'作用（下一级）')+'</h4><ul>'+effectList(step)+'</ul></section>'+per+compareTable(i)+'<p class="ui-legend">'+tr('数值由模拟实时计算（含本国与已研究科技）。')+'</p>'}
root.UnitIntelUI={update,dialog,techDialog,tr,_render:{statRow,counterRow}};
})(typeof window!=='undefined'?window:globalThis);
