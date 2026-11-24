/* Little Ant: a single-player easter-egg companion designed by the project owner's daughter.
   Invulnerable, never attacks, cannot be targeted, gathers small loads (4) and can swim.
   This layer extends only K.Sim (the single-player simulation); K.NetworkSim is left untouched,
   so the ant can never exist in, or change, a multiplayer/lockstep match. All behaviour below
   reads simulation state only (s.time, unit fields, terrain) and uses no randomness. */
((root)=>{'use strict';const K=typeof module!=='undefined'&&module.exports?require('./network-model.js'):root.KingdomSim,Base=K.Sim,D=K.defs,dist=K.distance;
const ANT={load:4,gatherRate:.5,sprintMult:1.6,sprintTime:2.4,sprintCooldown:8,sprintDistance:640,chainWindow:.7,swimMult:.8,sleepAfter:24,alarmRadius:260,alarmEvery:.5,hopNear:46};
D.ant={name:'小蚂蚁',icon:'♥',companion:true,easterEgg:true,domain:'land',amphibious:true,hp:1000,r:12,speed:84,damage:0,range:0,cooldown:1,pop:1,baseArmor:0,carry:ANT.load,description:'单机隐藏伙伴：不会受伤、不会攻击，会采集搬运（每次 4）、短距离加速、高跳跃，还会游泳；输入“小蚂蚁”召唤，再输一次收起'};
const ANT_RE=/^(小蚂蚁|xiao\s*ma\s*yi)$/i;
const SEA={kind:'fishingboat',team:0};
const LIVE_ANIMALS=new Set(['cow','sheep','deer','bear','jackal','fish','seaFish']);
class LittleAnt extends Base{
 constructor(difficulty,saved,options={}){super(difficulty,saved,options);this.s.antActive=this.s.units.some(u=>u.kind==='ant'&&u.hp>0)}
 sendChat(raw,options={}){const text=String(raw??'').trim();if(ANT_RE.test(text))return this.toggleAnt();return super.sendChat(raw,options)}
 toggleAnt(){if(!this.singlePlayer())return this.logChat(-1,'小蚂蚁彩蛋只在单机战役生效，联机对局不会召唤','system');if(this.s.ended)return this.logChat(-1,'战役已结束，无法召唤小蚂蚁','system');
  const old=this.s.units.filter(u=>u.kind==='ant'&&u.team===0);if(old.length){const ids=new Set(old.map(u=>u.id));for(const u of old)this.fx('petVanish',{x:u.x,y:u.y-20},.7);this.s.units=this.s.units.filter(u=>!ids.has(u.id));this.s.antActive=false;this.updateFog();return this.logChat(-1,'小蚂蚁回家睡觉啦，再输入“小蚂蚁”可以再叫它出来','system')}
  const town=this.townOf(0);if(!town)return this.logChat(-1,'需要己方城镇中心才能召唤小蚂蚁','system');
  const u=this.add('ant',0,town.x+110,town.y+165,{summoned:true,viewDirection:'front',lookAngle:Math.PI/2});if(!u)return this.logChat(-1,'现在无法召唤小蚂蚁','system');
  this.freeSpawn(u);u.antIdleSince=this.s.time;u.antEmote={kind:'happy',left:1.6};this.s.antActive=true;this.fx('upgrade',{x:u.x,y:u.y},1.2);this.updateFog();this.emit('sound',{kind:'magic',x:u.x,y:u.y});
  return this.logChat(-1,'小蚂蚁加入了你的队伍！它不会受伤也不会打架，会采集搬运和游泳。再输入一次可以收起。','system')}
 /* never a target, never attacks */
 canTarget(u,e){if(e?.kind==='ant'||u?.kind==='ant')return false;return super.canTarget(u,e)}
 damage(e,amount,source){if(e?.kind==='ant'){e.hp=e.maxhp;return 0}return super.damage(e,amount,source)}
 /* gathering: like a villager without hunting, small load */
 canGather(u,n){if(u?.kind!=='ant')return super.canGather(u,n);if(!n||n.domain==='sea'||LIVE_ANIMALS.has(n.subtype)&&!n.carcass)return false;return super.canGather({kind:'villager',team:u.team,x:u.x,y:u.y},n)}
 gatherRate(u,n){const v=super.gatherRate(u,n);return u?.kind==='ant'?v*ANT.gatherRate:v}
 gatherTick(u,target,dt){if(u.kind!=='ant')return super.gatherTick?super.gatherTick(u,target,dt):false;const o=u.order;if(o?.type==='returnCargo')return this.returnLoad(u,dt);if(o?.type!=='gather')return false;
  const resource=target?.resource||target?.kind||o.resource;
  if(u.cargo?.amount&&(u.cargoPhase==='return'||u.cargo.amount>=ANT.load-.001||!target||target.amount<=0||u.cargo.resource!==resource))return this.returnLoad(u,dt);
  if(!target||target.amount<=0||!this.canGather(u,target)){target=this.nearest(u,this.resources().filter(n=>n.amount>0&&(n.resource||n.kind)===o.resource&&this.canGather(u,n)&&(!D[n.kind]?.building||n.team===u.team)));if(!target){u.order=null;return true}u.order={type:'gather',id:target.id,resource:target.resource||target.kind};u.path=[];return true}
  u.haulSource=target.id;
  if(this.walk(u,target,D[target.kind]?.building?D[target.kind].r+48:38,dt)){this.face(u,target);u.working=true;u.workResource=resource;u.cargoPhase='harvest';u.cargo??={resource,amount:0};const amount=Math.min(target.amount,ANT.load-u.cargo.amount,dt*this.gatherRate(u,target));target.amount-=amount;u.cargo.amount+=amount;if(u.cargo.amount>=ANT.load-.001)u.cargoPhase='return'}
  return true}
 /* swimming: land OR water cells are open to the ant only; shared land/sea grids are untouched */
 blocked(x,y,u=null){if(u?.kind!=='ant')return super.blocked(x,y,u);if(!super.blocked(x,y,u))return false;SEA.team=u.team;return super.blocked(x,y,SEA)}
 getGrid(u=null){if(u?.kind!=='ant')return super.getGrid(u);const land=super.getGrid(u);SEA.team=u.team;const sea=super.getGrid(SEA),c=this._antGrid;if(c&&c.land===land&&c.sea===sea)return c.g;if(!ArrayBuffer.isView(land)||!ArrayBuffer.isView(sea)||land.length!==sea.length)return land;const g=new Uint8Array(land.length);for(let i=0;i<g.length;i++)g[i]=land[i]&&sea[i]?1:0;this._antGrid={land,sea,g};return g}
 findPath(u,x,y){if(u?.kind!=='ant')return super.findPath(u,x,y);const shared=this._pathMemo;this._pathMemo=this._antPathMemo;try{return super.findPath(u,x,y)}finally{this._antPathMemo=this._pathMemo;this._pathMemo=shared}}
 stat(e,key){const v=super.stat(e,key);if(key!=='speed'||e?.kind!=='ant')return v;return v*((e.sprintLeft||0)>0?ANT.sprintMult:1)*(e.swimming?ANT.swimMult:1)}
 /* sprint: a long move, or a quick second order, gives a short burst (cooldown) */
 order(units,cmd){const ants=this.s.antActive?units.filter(u=>u.kind==='ant'):[];const r=super.order(units,cmd);for(const u of ants){u.antIdleSince=this.s.time;if(u.antSleeping){u.antSleeping=false;u.antWake=.8}if(!['move','advance','gather','returnCargo'].includes(cmd?.type))continue;u.antEmote={kind:'cheer',left:1};const goal=cmd.id!==undefined?this.byId(cmd.id):cmd;const far=goal&&Number.isFinite(goal.x)&&dist(u,goal)>ANT.sprintDistance,chained=this.s.time-(u.antLastOrderAt??-99)<ANT.chainWindow;u.antLastOrderAt=this.s.time;if((far||chained)&&(u.sprintReady??0)<=this.s.time){u.sprintLeft=ANT.sprintTime;u.sprintReady=this.s.time+ANT.sprintCooldown}}return r}
 tick(dt){super.tick(dt);if(!this.s.antActive)return;const s=this.s;let any=false;for(const u of s.units){if(u.kind!=='ant')continue;any=true;this.antTick(u,dt)}if(!any)s.antActive=false}
 antTick(u,dt){const s=this.s;u.hp=u.maxhp;u.combatTarget=null;if(u.sprintLeft>0)u.sprintLeft=Math.max(0,u.sprintLeft-dt);if(u.antEmote){u.antEmote.left-=dt;if(u.antEmote.left<=0)u.antEmote=null}if(u.antHop>0)u.antHop=Math.max(0,u.antHop-dt);if(u.antWake>0)u.antWake=Math.max(0,u.antWake-dt);if(u.antSleeping)u.antSleepFor=(u.antSleepFor||0)+dt;else if(u.antSleepFor)u.antSleepFor=0;
  const w=this.world,wet=!!w&&K.worldWater(w,u.x,u.y)&&!K.worldBridge?.(w,u.x,u.y);if(wet!==!!u.swimming){u.swimming=wet;u.antHop=.7}
  const busy=!!(u.order||u.path?.length||u.working);if(busy){u.antIdleSince=s.time;if(u.antSleeping){u.antSleeping=false;u.antWake=.8}}else if(!u.antSleeping&&!u.swimming&&s.time-(u.antIdleSince??s.time)>ANT.sleepAfter){u.antSleeping=true;u.antSleepAt=s.time}
  u.antScan=(u.antScan||0)-dt;if(u.antScan<=0){u.antScan=ANT.alarmEvery;const fight=s.units.some(v=>v.combatTarget&&v.hp>0&&Math.abs(v.x-u.x)<ANT.alarmRadius&&Math.abs(v.y-u.y)<ANT.alarmRadius);if(fight&&!u.antAlarm){u.antEmote={kind:'surprised',left:1.3};if(u.antSleeping){u.antSleeping=false;u.antWake=.8}}u.antAlarm=fight;
   if(u.path?.length&&!(u.antHop>0)&&(u.antHopReady??0)<=s.time&&s.buildings.some(b=>b.hp>0&&(D[b.kind]?.wall||D[b.kind]?.gate)&&dist(b,u)<(D[b.kind].r||20)+ANT.hopNear)){u.antHop=.7;u.antHopReady=s.time+3}}}
}
const api={...K,Sim:LittleAnt,littleAnt:{config:ANT,pattern:ANT_RE}};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.KingdomSim=api;
})(typeof window!=='undefined'?window:globalThis);
