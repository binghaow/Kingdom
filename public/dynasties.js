/* Difficulty profiles, ten asymmetric nations and five paid eras. */
((root)=>{
'use strict';
const K=typeof module!=='undefined'&&module.exports?require('./coalitions.js'):root.KingdomSim;
const Base=K.Sim,D=K.defs,T=K.tech,N=K.nations,dist=K.distance;const VOLLEY_DRILL=.9;
const levels={
 sandbox:{name:'沙盒',grace:0,economy:.45,damage:0,cap:0,wave:0,raid:Infinity,train:2,age:2.2,think:21,defense:0,description:'电脑不主动组织军队，适合自由建设与试验'},
 beginner:{name:'入门',grace:0,economy:.45,damage:.55,cap:14,wave:4,raid:360,train:1.8,age:1.9,think:21,defense:.25,description:'电脑慢发展、低伤害、小规模进攻'},
 easy:{name:'休闲',grace:0,economy:.65,damage:.72,cap:22,wave:6,raid:270,train:1.45,age:1.5,think:14,defense:.5,description:'较弱经济与温和攻势'},
 normal:{name:'标准',grace:0,economy:.9,damage:1,cap:36,wave:8,raid:200,train:1.15,age:1.1,think:7,defense:.75,description:'正常伤害与渐进进攻'},
 hard:{name:'困难',grace:0,economy:1.08,damage:1,cap:48,wave:12,raid:145,train:1,age:.95,think:7,defense:1,description:'更快发展与更大编队'},
 expert:{name:'专家',grace:0,economy:1,damage:1,cap:60,wave:16,raid:110,train:1,age:1,think:7,defense:1.5,expansion:1,advancedShare:.28,description:'标准经济与战斗属性；更快决策、更大编队、主动资源扩张与更有针对性的防御'}
};
const extra=[
 ['japan','日本','桜','武士与近战','samurai','dojo','近战步兵攻击 +8%','建筑石料成本 +10%','武士道','武士与近战步兵移动 +8%'],
 ['ottoman','奥斯曼','☾','火枪与军团','janissary','divan','火枪类训练时间 −10%','舰船生命 −6%','军团轮射','火枪类射击间隔 −10%'],
 ['russia','俄罗斯','✥','人力与持久','streltsy','kremlin','军事单位食物成本 −10%','军事训练时间 +12%','冬季补给','近战与火枪步兵生命 +12%'],
 ['prussia','普鲁士','鹰','纪律与火力','prussianguard','drillhall','火枪类护甲 +1','村民训练时间 +12%','线列纪律','火枪类伤害 +10%'],
 ['spain','西班牙','✠','枪阵与矿业','tercio','casahall','村民采金效率 +8%','炮兵训练时间 +12%','方阵战术','近战步兵生命 +12%'],
 ['netherlands','荷兰','橙','贸易与射手','nassau','guildhall','商队收益 +15%','军事单位黄金成本 +8%','海陆商约','商队收益额外 +20%'],
 ['usa','美国','★','后期共和国','continental','congress','村民采食效率 +8%','建筑生命 −8%','民兵操典','火枪类伤害 +10%']
];
const uniqueStats={
 samurai:{hp:235,food:95,gold:60,damage:31,range:32,speed:75,cooldown:1.15,role:'infantry',bonus:{infantry:1.25},description:'武士：高近战攻击，怕远程集火与骑兵包夹'},
 janissary:{hp:175,food:80,gold:85,damage:34,range:190,speed:59,cooldown:1.9,role:'musketeer',description:'禁卫火枪兵：血厚、近中程火力，移动慢'},
 streltsy:{hp:160,food:85,wood:45,gold:35,damage:27,range:180,speed:55,cooldown:1.8,role:'musketeer',description:'射击军：成本偏食物、较耐打，射程与机动较低'},
 prussianguard:{hp:145,food:85,gold:80,damage:33,range:215,speed:63,cooldown:1.8,role:'musketeer',description:'普鲁士掷弹卫队：纪律火枪兵，伤害高但成本高'},
 tercio:{hp:235,food:80,wood:45,gold:30,damage:23,range:35,speed:57,cooldown:1.1,role:'infantry',bonus:{cavalry:2.2},description:'大方阵枪兵：擅长反骑兵，怕远程与炮火'},
 nassau:{hp:110,wood:80,gold:65,damage:31,range:250,speed:66,cooldown:2,role:'skirmisher',description:'拿骚神射手：高射程单发步枪，血少、怕骑兵'},
 continental:{hp:135,food:85,wood:20,gold:60,damage:28,range:235,speed:69,cooldown:1.9,role:'musketeer',description:'大陆军步枪兵：射程与机动较好，近战脆弱'}
};
const names={samurai:'武士',janissary:'禁卫火枪兵',streltsy:'射击军',prussianguard:'普鲁士掷弹卫队',tercio:'大方阵枪兵',nassau:'拿骚神射手',continental:'大陆军步枪兵'};
const buildingNames={dojo:'武家道场',divan:'帝国议政院',kremlin:'沙皇军械库',drillhall:'王家操练院',casahall:'王家方阵学院',guildhall:'联合商会',congress:'大陆议事厅'};
for(const [id,name,flag,short,unit,building,bonus,tradeoff,doctrine,doctrineText]of extra){N[id]={id,name,flag,short,unique:unit,building,bonus,tradeoff,description:uniqueStats[unit].description+(id==='usa'?'。架空历史：后期美国加入同场战役。':''),doctrine,doctrineText};D[unit]={name:names[unit],icon:'⚔',nation:id,r:11,time:18,age:2,...uniqueStats[unit]};D[building]={name:buildingNames[building],icon:flag,building:true,nation:id,hp:1100,r:43,wood:200,stone:70,gold:70,time:26,age:2,trains:[unit],description:name+'特色建筑，训练'+names[unit]+'并研究国家学说'}}
N.britain.doctrine='远射军械';N.britain.doctrineText='长弓卫士射程 +12%';N.france.doctrine='重骑甲胄';N.france.doctrineText='骑兵护甲 +2';N.china.doctrine='连弩机括';N.china.doctrineText='诸葛连弩伤害 +12%';
Object.assign(D,{
 university:{name:'皇家大学',icon:'✦',building:true,hp:1200,r:45,wood:280,gold:180,stone:100,time:35,age:4,description:'研究弹道、后勤、野战医疗与筑城'},
 arsenal:{name:'近卫兵工厂',icon:'⚔',building:true,hp:1350,r:45,wood:300,gold:160,stone:120,time:35,age:4,trains:['eliteguard','dragoon','engineer'],description:'训练近卫戟兵、龙骑兵与军械工程师'},
 foundry:{name:'皇家铸炮厂',icon:'✹',building:true,hp:1450,r:48,wood:340,gold:240,stone:180,time:42,age:5,trains:['howitzer'],description:'训练重型榴弹炮，研究爆破弹药'},
 palace:{name:'国家统帅府',icon:'♛',building:true,hp:1700,r:52,wood:400,gold:320,stone:220,time:50,age:5,trains:[],description:'第五时代招募本国英雄；全军最多一名，阵亡后等待三分钟'},
 eliteguard:{name:'近卫戟兵',icon:'⚔',hp:300,r:12,speed:62,food:120,gold:90,time:23,age:4,damage:34,range:36,cooldown:1.2,pop:2,role:'infantry',baseArmor:2,bonus:{cavalry:1.8},description:'重装反骑兵近卫，占 2 人口，怕炮火与远程'},
 dragoon:{name:'龙骑兵',icon:'♞',hp:235,r:15,speed:118,food:100,gold:100,time:25,age:4,damage:28,range:215,cooldown:1.7,pop:2,role:'cavalry',description:'骑马火枪兵，可机动射击，怕枪阵与反骑兵'},
 engineer:{name:'军械工程师',icon:'⚒',hp:140,r:11,speed:65,food:80,wood:110,gold:60,time:22,age:4,damage:0,range:0,pop:2,role:'worker',description:'可建造，施工效率 +50%，自动修复附近脱战建筑；不采集'},
 howitzer:{name:'重型榴弹炮',icon:'✹',hp:300,r:19,speed:29,wood:280,gold:300,time:40,age:5,damage:135,range:390,minRange:100,splash:75,cooldown:5.4,pop:5,role:'cannon',description:'第五时代范围火炮，占 5 人口、最低射程 100，必须配护卫'}
});
Object.assign(T,{
 ballistics:{name:'精密弹道',icon:'➶',building:'university',age:4,max:2,wood:180,gold:220,time:40,description:'远程陆军射程每级 +7%，最多两级'},
 logistics:{name:'军团后勤',icon:'⚑',building:'university',age:4,max:2,food:220,gold:180,time:38,description:'人口上限每级 +20，仍需建造房屋'},
 fieldmedicine:{name:'野战医疗',icon:'✚',building:'university',age:4,max:1,food:260,gold:220,time:45,description:'脱战陆军每秒恢复 1 生命'},
 masonry:{name:'棱堡筑城',icon:'♜',building:'university',age:4,max:1,wood:240,stone:200,gold:150,time:40,description:'所有建筑生命 +15%，修复现有建筑比例不变'},
 shells:{name:'爆破弹药',icon:'✹',building:'foundry',age:5,max:1,wood:200,gold:300,time:50,description:'陆军炮兵伤害 +15%'},
 leadership:{name:'统帅学',icon:'♛',building:'palace',age:5,max:1,food:200,gold:300,time:50,description:'英雄技能冷却缩短 15%'}
});
const skillDefs={
 britain:{name:'齐射号令',cooldown:65,cost:30,type:'ranged',text:'附近最多 6 名远程陆军，伤害 +20%，持续 8 秒'},
 france:{name:'骑兵冲锋',cooldown:65,cost:30,type:'charge',text:'附近最多 5 名骑兵速度 +25%、伤害 +15%，持续 8 秒'},
 china:{name:'连弩箭雨',cooldown:65,cost:35,type:'volley',text:'260 内最多 5 名敌方陆军各受 35 伤害'},
 japan:{name:'拔刀横扫',cooldown:50,cost:30,type:'sweep',text:'100 内最多 4 名敌方陆军各受 48 伤害'},
 ottoman:{name:'禁卫火力',cooldown:70,cost:40,type:'volley',text:'240 内最多 4 名敌方陆军各受 45 伤害'},
 russia:{name:'坚韧集结',cooldown:75,cost:35,type:'heal',text:'附近最多 5 名受伤陆军各恢复 55 生命'},
 prussia:{name:'铁壁纪律',cooldown:65,cost:30,type:'armor',text:'附近最多 6 名陆军护甲 +4，持续 10 秒'},
 spain:{name:'方阵壁垒',cooldown:65,cost:30,type:'bulwark',text:'附近最多 5 名近战步兵所受伤害 −25%，持续 8 秒'},
 netherlands:{name:'野战补给',cooldown:70,cost:30,type:'heal',text:'附近最多 4 名受伤陆军各恢复 65 生命'},
 usa:{name:'精准狙击',cooldown:65,cost:40,type:'shot',text:'280 内单个敌方陆军受到 95 伤害，不攻击建筑或舰船'}
};
for(const n of Object.values(N)){T['doctrine_'+n.id]={name:n.doctrine,icon:n.flag,building:n.building,nation:n.id,age:3,max:1,food:150,gold:220,time:42,description:n.doctrineText};const base=D[n.unique],key='hero_'+n.id;D[key]={...base,name:n.name+'统帅',nation:n.id,hero:true,age:5,hp:base.role==='cavalry'?820:650,damage:base.range>90?37:44,food:400,wood:0,gold:350,time:85,pop:6,baseArmor:3,description:'唯一英雄 · '+skillDefs[n.id].name+'：'+skillDefs[n.id].text};D.palace.trains.push(key);n.hero=key;n.skill=skillDefs[n.id]}
K.ageNames.push('IV · 帝国时代','V · 传奇时代');
class Dynasties extends Base{
 constructor(difficulty='beginner',saved=null,options={}){super(difficulty,saved,options);const s=this.s;s.version=6;s.aiDifficulties=s.aiDifficulties||options.difficulties||s.nations.map(()=>difficulty);s.heroRespawn=s.heroRespawn||s.nations.map(()=>0);s.nextRaid=s.nextRaid||s.nations.map(()=>0);s.nextThink=s.nextThink||s.nations.map(()=>0);s.graceUntil=s.graceUntil||s.nations.map((_,t)=>this.profile(t).grace===Infinity?null:this.profile(t).grace);this._tradeTotals=s.tradeGold.slice();this.aiExpansionGoals=new Map();this.aiExpansionReady=s.nations.map(()=>0);for(let t=0;t<s.nations.length;t++)for(const key of Object.keys(T))s.tech[t][key]??=0;for(const e of [...s.units,...s.buildings]){const ratio=e.hp/e.maxhp;e.maxhp=this.stat(e,'hp');e.hp=e.maxhp*ratio;e.nation=s.nations[e.team]}}
 setDifficulty(team,key){if(!levels[key])return '未知难度';const old=this.s.aiDifficulties[team]||this.s.difficulty;if(old===key)return '难度保持不变';this.s.aiDifficulties[team]=key;if(Object.keys(levels).indexOf(key)<Object.keys(levels).indexOf(old)){this.s.graceUntil[team]=levels[key].grace===Infinity?null:this.s.time+levels[key].grace;for(const u of this.s.units.filter(u=>u.team===team)){u.order=null;u.path=[]}}return '电脑 '+team+' 已改为'+levels[key].name}
 maxAge(){return 5}profile(team=1){return levels[this.s.aiDifficulties?.[team]||this.s.difficulty]||levels.beginner}
 isOpponent(team){return team>0&&!this.allied(0,team)}
 protection(a,b){if(this.allied(a,b))return false;const other=this.allied(0,a)?b:this.allied(0,b)?a:null;return other!==null&&this.s.time<(this.profile(other).grace===Infinity?Infinity:(this.s.graceUntil?.[other]??this.profile(other).grace))}
 protectionLeft(){const enemies=this.s.nations.map((_,t)=>t).filter(t=>this.isOpponent(t)&&!this.s.defeated.includes(t));return enemies.length?Math.max(0,Math.min(...enemies.map(t=>(this.profile(t).grace===Infinity?Infinity:(this.s.graceUntil?.[t]??this.profile(t).grace))-this.s.time))):0}
 nation(team){return N[this.s.nations?.[team]]||N.britain}
 add(kind,team,x,y,extra={}){const e=super.add(kind,team,x,y,extra);e.nation=this.s.nations?.[team];return e}
 builder(u){return ['villager','engineer'].includes(u.kind)}
 resolveCost(cost,team){const d=super.resolveCost(cost,team);if(cost._resolved)return d;const n=this.nation(team).id;if(n==='japan'&&cost.building===true)d.stone=Math.ceil((d.stone||0)*1.1);if(n==='russia'&&!cost.building&&cost.damage>0)d.food=Math.ceil((d.food||0)*.9);if(n==='netherlands'&&!cost.building&&cost.damage>0)d.gold=Math.ceil((d.gold||0)*1.08);return d}
 stat(e,key){let v=super.stat(e,key);const d=D[e.kind],n=this.nation(e.team).id,t=this.s.tech[e.team]||{},doctrine=t['doctrine_'+n]||0;
  if(key==='hp'){if(d.building&&n==='usa')v*=.92;if(d.building&&t.masonry)v*=1.15;if(!d.building&&doctrine&&['russia','spain'].includes(n)&&['infantry','musketeer'].includes(d.role))v*=1.12}
  if(key==='damage'){if(n==='japan'&&d.role==='infantry')v*=1.08;if(doctrine&&(n==='china'&&e.kind==='repeater'||['prussia','usa'].includes(n)&&d.role==='musketeer'))v*=n==='china'?1.12:1.1;if(t.shells&&d.role==='cannon')v*=1.15;if(e.buff?.until>this.s.time)v*=e.buff.damage||1;if(e.team>0)v*=this.profile(e.team).damage}
  if(key==='armor'){if(n==='prussia'&&d.role==='musketeer')v++;if(n==='france'&&doctrine&&d.role==='cavalry')v+=2;if(e.buff?.until>this.s.time)v+=e.buff.armor||0}
  if(key==='speed'){if(n==='japan'&&doctrine&&d.role==='infantry')v*=1.08;if(e.buff?.until>this.s.time)v*=e.buff.speed||1}
  if(key==='range'&&!this.sea(e)&&!this.air?.(e)&&d.range>90){v*=1+(t.ballistics||0)*.07;if(n==='britain'&&doctrine&&e.kind==='longbow')v*=1.12}
  if(key==='hp'&&this.sea(e)&&n==='ottoman')v*=.94;return key==='hp'?Math.round(v):v;
 }
 gatherRate(u,n){let v=super.gatherRate(u,n),id=this.nation(u.team).id;if(id==='spain'&&(n.resource||n.kind)==='gold')v*=1.08;if(id==='usa'&&(n.resource||n.kind)==='food')v*=1.08;if(u.team>0)v*=this.profile(u.team).economy;return v}
 capacity(team){const houses=this.s.buildings.filter(b=>b.team===team&&b.complete).reduce((n,b)=>n+(b.kind==='town'?20:b.kind==='house'?10:0),0);return Math.min(140+(this.s.tech[team].logistics||0)*20,houses)}
 unitError(b,kind){const d=D[kind],team=b?.team||0;if(team>0&&!this.s.humanTeams?.includes(team)&&kind==='engineer'&&this.s.units.filter(u=>u.team===team&&u.kind==='engineer').length+this.s.buildings.filter(x=>x.team===team).reduce((n,x)=>n+x.queue.filter(q=>q.kind==='engineer').length,0)>=2)return '电脑工程师上限';if(d.hero){if(team>0&&this.profile(team).cap<36)return '本难度电脑不招募英雄';if(this.s.units.some(u=>u.team===team&&D[u.kind].hero)||this.s.buildings.some(x=>x.team===team&&x.queue.some(q=>D[q.kind]?.hero)))return '每国最多一名英雄，含训练队列';if(this.s.time<(this.s.heroRespawn?.[team]||0))return '英雄重招等待 '+Math.ceil(this.s.heroRespawn[team]-this.s.time)+' 秒'}if(team>0&&d.damage>0){const used=this.s.units.filter(u=>u.team===team&&u.kind!=='villager'&&D[u.kind].damage>0).reduce((n,u)=>n+(D[u.kind].pop||1),0)+this.s.buildings.filter(x=>x.team===team).reduce((n,x)=>n+x.queue.filter(q=>q.type==='unit'&&D[q.kind].damage>0&&q.kind!=='villager').reduce((p,q)=>p+(D[q.kind].pop||1),0),0);if(used+(d.pop||1)>this.profile(team).cap)return '本难度电脑军队上限'}return super.unitError(b,kind)}
 train(b,kind){const r=super.train(b,kind);if(!r){const q=b.queue.at(-1),n=this.nation(b.team).id;let factor=1;if(n==='ottoman'&&D[kind].role==='musketeer')factor*=.9;if(n==='russia'&&D[kind].damage>0)factor*=1.12;if(n==='prussia'&&kind==='villager')factor*=1.12;if(n==='spain'&&D[kind].role==='cannon')factor*=1.12;if(b.team>0)factor*=this.profile(b.team).train;q.left=q.total*=factor}return r}
 aiChooseUnit(team,choices,counts,reserve){const p=this.profile(team);if(p.advancedShare&&this.s.ages[team]>=4){const advanced=choices.filter(k=>D[k]?.age>=4&&(!D[k].nation||D[k].nation===this.nation(team).id)),army=this.s.units.filter(u=>u.team===team&&D[u.kind]?.damage>0),queued=this.s.buildings.filter(b=>b.team===team).flatMap(b=>b.queue||[]).filter(q=>q.type==='unit'&&D[q.kind]?.damage>0),high=army.filter(u=>D[u.kind].age>=4).length+queued.filter(q=>D[q.kind].age>=4).length;if(advanced.length&&high/Math.max(1,army.length+queued.length)<p.advancedShare){const pick=super.aiChooseUnit(team,advanced,counts,reserve);if(pick)return pick}}return super.aiChooseUnit(team,choices,counts,reserve)}
 researchCost(key,team){if(key==='age'){const a=this.s.ages[team];return [{food:450,gold:220,time:40},{food:850,gold:550,time:55},{food:1250,gold:850,stone:150,time:75},{food:1800,gold:1200,stone:300,time:100}][Math.min(3,a-1)]}return super.researchCost(key,team)}
 researchError(b,key){if(key!=='age'&&T[key]){if(T[key].age>this.s.ages[b?.team||0])return '需要 '+K.ageNames[T[key].age];if(T[key].nation&&T[key].nation!==this.nation(b?.team||0).id)return '需要本国国家学说'}if(key==='age'&&b?.team>0){const earliest=[240,510,840,1200][this.s.ages[b.team]-1]*this.profile(b.team).age;if(this.s.time<earliest)return '电脑按难度逐步推进时代'}return super.researchError(b,key)}
 /* Rates read by the research ⓘ (unit-intel.js techInfo) and by the code below, so the dialog shows the live numbers. */
 fieldRegen(team){return this.s.tech[team]?.fieldmedicine?1:0}
 tradeBonus(team){return this.nation(team).id==='netherlands'?.15+(this.s.tech[team]?.doctrine_netherlands?.2:0):0}
 applyResearch(team,key){super.applyResearch(team,key);if(key==='masonry')for(const b of this.s.buildings.filter(b=>b.team===team)){const ratio=b.hp/b.maxhp;b.maxhp=this.stat(b,'hp');b.hp=b.maxhp*ratio}}
 canTarget(u,e){return !this.protection(u.team,e.team)&&super.canTarget(u,e)}
 damage(e,amount,source){if(source&&this.protection(source.team,e.team))return;if(source?.kind==='howitzer'&&D[e.kind].building)amount*=K.structureFollowup('howitzer');if(e.buff?.until>this.s.time)amount*=e.buff.reduction||1;const before=e.hp;super.damage(e,amount,source);if(e.hp<before)e.lastHurtAt=this.s.time}
 strike(u,e){if(!this.canTarget(u,e))return;super.strike(u,e);if(this.volleyDrill(u))u.cool*=VOLLEY_DRILL}
 volleyDrill(u){return this.nation(u.team).id==='ottoman'&&D[u.kind].role==='musketeer'&&this.s.tech[u.team].doctrine_ottoman}
 /* Read-only: nominal seconds between attacks as strike() sets them (UI and checks only). */
 attackInterval(e){const v=super.attackInterval(e);return this.volleyDrill(e)?v*VOLLEY_DRILL:v}
 skillError(u){if(!D[u?.kind]?.hero)return '请选择英雄';if(u.hp<=0||u.embarkedOn)return '英雄目前无法行动';if((u.skillReadyAt||0)>this.s.time)return '冷却 '+Math.ceil(u.skillReadyAt-this.s.time)+' 秒';if(this.s.resources[u.team].gold<this.nation(u.team).skill.cost)return '技能黄金不足';return ''}
 skill(u){const error=this.skillError(u);if(error)return error;const d=this.nation(u.team).skill,s=this.s;let targets=[],limit=6;const allies=s.units.filter(v=>this.allied(u.team,v.team)&&!this.sea(v)&&!this.air?.(v)&&!v.embarkedOn&&dist(u,v)<=220),enemies=s.units.filter(v=>this.hostile(u.team,v.team)&&(!this.canSee||this.canSee(u.team,v))&&!this.protection(u.team,v.team)&&!this.sea(v)&&!this.air?.(v)&&!v.embarkedOn&&dist(u,v)<(d.type==='sweep'?100:d.type==='shot'?280:260));
  if(['volley','sweep','shot'].includes(d.type)){limit=d.type==='shot'?1:d.type==='sweep'||this.nation(u.team).id==='ottoman'?4:5;targets=enemies.sort((a,b)=>dist(u,a)-dist(u,b)).slice(0,limit);if(!targets.length)return '技能范围内没有可攻击的陆军';const amount=d.type==='shot'?95:d.type==='sweep'?48:this.nation(u.team).id==='ottoman'?45:35;for(const t of targets)this.damage(t,amount,u);this.fx('explosion',{x:targets[0].x,y:targets[0].y,size:d.type==='shot'?18:65},.7)}
  else if(d.type==='heal'){limit=this.nation(u.team).id==='netherlands'?4:5;targets=allies.filter(t=>t.hp<t.maxhp).sort((a,b)=>a.hp/a.maxhp-b.hp/b.maxhp).slice(0,limit);if(!targets.length)return '附近没有受伤的陆军';for(const t of targets){t.hp=Math.min(t.maxhp,t.hp+(limit===4?65:55));this.fx('heal',{x:t.x,y:t.y-40,text:'补给'},1)}}
  else{targets=allies.filter(t=>d.type==='charge'?D[t.kind].role==='cavalry':d.type==='ranged'?D[t.kind].range>90:d.type==='bulwark'?D[t.kind].role==='infantry':D[t.kind].damage>0).slice(0,d.type==='charge'||d.type==='bulwark'?5:6);if(!targets.length)return '附近没有适合这个技能的部队';for(const t of targets)t.buff={until:s.time+(d.type==='armor'?10:8),damage:d.type==='ranged'?1.2:d.type==='charge'?1.15:1,speed:d.type==='charge'?1.25:1,armor:d.type==='armor'?4:0,reduction:d.type==='bulwark'?.75:1}}
  s.resources[u.team].gold-=d.cost;u.skillReadyAt=s.time+d.cooldown*(s.tech[u.team].leadership?.85:1);this.fx('upgrade',{x:u.x,y:u.y},2);this.emit('sound',{kind:'upgrade',x:u.x,y:u.y});return d.name+' 已发动 · '+targets.length+' 个目标';
 }
 raids(){for(let team=1;team<this.s.nations.length;team++){const s=this.s,p=this.profile(team);if(!p.wave||s.defeated.includes(team)||s.time<p.grace||s.time<(s.nextRaid[team]||0))continue;const town=s.buildings.find(b=>b.team===team&&b.kind==='town'),target=town&&this.nearest(town,s.buildings.filter(b=>b.kind==='town'&&this.hostile(team,b.team)&&!this.protection(team,b.team)));if(!target)continue;const army=s.units.filter(u=>u.team===team&&u.kind!=='villager'&&!this.sea(u)&&D[u.kind].damage>0&&!u.embarkedOn).slice(0,p.wave);if(army.length>=3){this.order(army,{type:'advance',x:target.x,y:target.y});this.emit('raid',{team,target:target.team})}const dock=s.buildings.find(b=>b.team===target.team&&b.kind==='dock'),navy=s.units.filter(u=>u.team===team&&this.sea(u)&&D[u.kind].damage>0).slice(0,Math.max(1,Math.floor(p.wave/3)));if(dock&&navy.length>=2){this.order(navy,{type:'advance',x:dock.x,y:K.coast(dock.x)+150});this.emit('navalRaid',{team,target:target.team})}s.nextRaid[team]=s.time+p.raid}}
 aiExpertExpansion(team,town){
  const s=this.s,workers=s.units.filter(u=>u.team===team&&u.kind==='villager'&&!u.embarkedOn),completed=s.buildings.filter(b=>b.team===team&&b.complete&&b.hp>0),goal=this.aiExpansionGoals.get(team);
  const xp=this.profile(team);if(xp.expansion!==1||s.ages[team]<(xp.expansionAge??2)||s.time<(xp.expansionAt??360)||workers.length<9||s.time<(this.aiExpansionReady[team]||0)||s.buildings.some(b=>b.team===team&&!b.complete))return;
  const abandon=()=>this.aiExpansionGoals.delete(team);
  if(goal){let worker=workers.find(u=>u.id===goal.workerId);if(!worker){worker=workers.filter(u=>!['build','repair','attack'].includes(u.order?.type)).sort((a,b)=>dist(a,goal)-dist(b,goal))[0];if(!worker){abandon();return}goal.workerId=worker.id}
   if(!this.explored(team,goal)||this.placementError(goal.kind,goal.x,goal.y,team)){abandon();return}
   if(dist(worker,goal)<145){const result=this.construct(goal.kind,goal.x,goal.y,[worker],team);if(!result.error){this.aiExpansionReady[team]=s.time+300;abandon()}return}
   if(worker.order?.type!=='move'||Math.hypot((worker.order.x||0)-goal.x,(worker.order.y||0)-goal.y)>24)this.order([worker],{type:'move',x:goal.x,y:goal.y});return
  }
  const bank=s.resources[team],stoneKind=D.quarry.retired?'miningcamp':'quarry',quarries=completed.filter(b=>b.kind===stoneKind).length,camps=completed.filter(b=>b.kind==='lumbercamp').length;
  let kind=null,resource=null;if(camps<3&&(bank.wood<2200||camps===0&&s.time>=540)){kind='lumbercamp';resource='wood'}else if(quarries<2&&(bank.stone<1350||quarries===0&&s.time>=900)){kind=stoneKind;resource='stone'}else return;
  if(!this.canPay(D[kind],team))return;
  const known=this.view(team).nodes.filter(n=>n.amount>0&&n.resource===resource&&this.explored(team,n)&&!n.domain).sort((a,b)=>b.amount-a.amount).slice(0,18),offsets=[[95,0],[-95,0],[0,95],[0,-95],[68,68],[-68,68],[68,-68],[-68,-68]],visible=this.view(team),enemies=[...visible.units,...visible.buildings].filter(e=>e.team!==team&&this.hostile(team,e.team));
  let best=null,bestScore=-Infinity;for(const node of known){for(const [dx,dy]of offsets){const site={x:node.x+dx,y:node.y+dy,kind};if(dist(site,town)<260||dist(site,town)>980||!completed.some(b=>dist(site,b)<620)||completed.some(b=>b.kind===kind&&dist(site,b)<(kind===stoneKind?560:340))||enemies.some(e=>dist(site,e)<250)||this.placementError(kind,site.x,site.y,team))continue;
    const amount=node.amount/Math.max(1,node.maxAmount||node.amount),score=dist(site,town)*.15+amount*80-enemies.reduce((v,e)=>v+Math.max(0,260-dist(site,e))*.2,0);if(score>bestScore){best=site;bestScore=score}}
  }
  if(!best)return;const worker=workers.filter(u=>!['build','repair','attack'].includes(u.order?.type)).sort((a,b)=>dist(a,best)-dist(b,best))[0];if(!worker)return;best.workerId=worker.id;this.aiExpansionGoals.set(team,best);this.order([worker],{type:'move',x:best.x,y:best.y})
 }
 ai(){for(let team=1;team<this.s.nations.length;team++){const s=this.s,p=this.profile(team);if(s.defeated.includes(team)||s.time<(s.nextThink[team]||0))continue;s.nextThink[team]=s.time+p.think;this.aiPlayer(team);const town=s.buildings.find(b=>b.team===team&&b.kind==='town');if(!town)continue;const market=s.buildings.find(b=>b.team===team&&b.kind==='market'&&b.complete);if(market&&s.units.filter(u=>u.team===team&&u.kind==='trader').length<2&&!market.queue.length)this.train(market,'trader');if(s.ages[team]>=3&&s.ages[team]<5&&!town.queue.length&&!this.researchError(town,'age'))this.research(town,'age');const plans=[...(s.ages[team]>=4?['university','arsenal']:[]),...(s.ages[team]>=5?['foundry','palace']:[])].filter(k=>!D[k].retired),kind=plans.find(k=>!s.buildings.some(b=>b.team===team&&b.kind===k)),worker=s.units.find(u=>u.team===team&&u.kind==='villager');if(kind&&worker&&!s.buildings.some(b=>b.team===team&&!b.complete)){for(let i=0;i<16;i++){const x=town.x+this.rand(-380,380),y=town.y+this.rand(-320,300);if(!this.placementError(kind,x,y,team)){this.construct(kind,x,y,[worker],team);break}}}this.aiExpertExpansion(team,town);for(const b of s.buildings.filter(b=>b.team===team&&b.complete&&!b.queue.length))for(const [key,t]of Object.entries(T))if(t.building===b.kind&&!this.researchError(b,key)){this.research(b,key);break}}}
 tick(dt){if(this.s.ended)return;const heroes=this.s.units.filter(u=>D[u.kind].hero).map(u=>({id:u.id,team:u.team}));this.s.raidTimer=0;super.tick(dt);const s=this.s;for(const h of heroes)if(!this.byId(h.id))s.heroRespawn[h.team]=s.time+(this.heroRespawnDelay?.()??180);if(s.ended)return;if((s.raidPulse=(s.raidPulse||0)+dt)>5){s.raidPulse=0;this.raids()}
  for(const u of s.units){if(u.embarkedOn)continue;if(u.kind==='engineer'){if(u.order?.type==='build'&&u.working){const b=this.byId(u.order.id);if(b&&!b.complete)b.progress+=dt/D[b.kind].time*.5}if(!u.combatTarget){const b=this.nearest(u,s.buildings.filter(b=>this.allied(u.team,b.team)&&b.complete&&b.hp<b.maxhp&&s.time-(b.lastHurtAt??-10)>5&&dist(u,b)<150));if(b)b.hp=Math.min(b.maxhp,b.hp+dt*9)}}if(s.tech[u.team].fieldmedicine&&!this.sea(u)&&s.time-(u.lastHurtAt??-10)>5&&!u.combatTarget&&(u.disengageUntil||0)<s.time&&u.order?.type!=='attack')u.hp=Math.min(u.maxhp,u.hp+dt*this.fieldRegen(u.team));if(D[u.kind].hero&&u.team>0&&!s.humanTeams?.includes(u.team)&&pAllowsHero(this.profile(u.team))&&!this.skillError(u))this.skill(u)}
  // Convert only extra trade income, without multiplying passive market production.
  for(let t=0;t<s.nations.length;t++){const prior=this._tradeTotals?.[t]||0,earned=Math.max(0,(s.tradeGold[t]||0)-prior);if(earned&&this.tradeBonus(t)>0){const bonus=earned*this.tradeBonus(t);s.resources[t].gold+=bonus;s.tradeGold[t]+=bonus}}this._tradeTotals=s.tradeGold.slice();
 }
}
function pAllowsHero(p){return p.cap>=36}
const api={...K,Sim:Dynasties,difficulties:levels,skills:skillDefs};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.KingdomSim=api;
})(typeof window!=='undefined'?window:globalThis);
