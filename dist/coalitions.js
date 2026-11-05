/* Four sovereign players, diplomacy and physical trade routes. */
((root)=>{
'use strict';
const K=typeof module!=='undefined'&&module.exports?require('./empires.js'):root.KingdomSim;
const Base=K.Sim,D=K.defs,dist=K.distance;
const colors=['#83c9ef','#ec9273','#a6d485','#d6a4e7'];
const starts=[{x:600,y:1560},{x:4140,y:1560},{x:650,y:650},{x:4140,y:650}];
const posts=[{id:'west',name:'西境驿站',x:1230,y:1090},{id:'east',name:'东境商站',x:3630,y:480},{id:'north',name:'河畔集市',x:2690,y:650}];
D.trader={name:'贸易商队',icon:'◆',hp:130,r:11,speed:88,food:60,wood:80,time:15,age:1,damage:0,range:0,role:'trader',description:'在本国市场与友好市场或中立商站间往返，完成回程后双方获得黄金'};
D.market.trains=['trader'];
class Coalitions extends Base{
 constructor(difficulty='easy',saved=null,options={}){
  const nations=(options.nations||['britain','france']).slice(0,4);
  super(difficulty,saved,{nations});
  const s=this.s;s.version=5;s.groups=s.groups||options.groups||nations.map((_,i)=>i);s.groups=s.groups.slice(0,s.nations.length);
  s.pacts=s.pacts||{};s.defeated=s.defeated||[];s.tradeGold=s.tradeGold||s.nations.map(()=>0);s.landmarks=s.landmarks||[];
  if(!saved){for(let team=2;team<nations.length;team++)this.seedPlayer(team);this.seedLandmarks()}
  for(const u of s.units)this.freeSpawn(u);
 }
 allied(a,b){return a===b||(a>=0&&b>=0&&this.s.groups?.[a]===this.s.groups?.[b])}
 pair(a,b){return [a,b].sort((x,y)=>x-y).join(':')}
 hostile(a,b){return Number.isInteger(a)&&Number.isInteger(b)&&a>=0&&b>=0&&!this.allied(a,b)&&!this.s.pacts?.[this.pair(a,b)]}
 label(team){return (team===0?'你':'电脑 '+team)+' · '+this.nation(team).name}
 seedPlayer(team){const s=this.s,p=starts[team];s.resources[team]={food:450,wood:600,gold:300,stone:220};s.ages[team]=1;s.tech[team]={weapons:0,armor:0,gather:0,navigation:0,hulls:0};
  this.add('town',team,p.x,p.y);this.add('house',team,p.x-145,p.y+90);this.add('barracks',team,p.x+(team===2?175:-175),p.y+65);
  const dx=team===2?1330:3400;this.add('dock',team,dx,K.coast(dx)-18);
  for(let i=0;i<6;i++)this.add('villager',team,p.x-75+i*25,p.y+100);
  for(let i=0;i<3;i++)this.add('infantry',team,p.x-90+i*27,p.y-90);
  this.add('fishingboat',team,dx,K.coast(dx)+140);this.add('sloop',team,dx+90,K.coast(dx)+195);
  for(const [resource,ox,oy]of [['wood',-230,-240],['food',300,-130],['gold',420,190],['stone',-240,240]])for(let i=0;i<10;i++){
   const x=p.x+(team===3?-ox:ox)+this.rand(-80,80),y=p.y+oy+this.rand(-70,70);
   if(!this.blocked(x,y)&&!s.buildings.some(b=>dist(b,{x,y})<D[b.kind].r+60))s.nodes.push({id:s.id++,kind:resource,resource,x,y,amount:resource==='wood'?450:2400,maxAmount:resource==='wood'?450:2400,variant:this.rand(),subtype:resource==='wood'?'forest':resource==='food'?'berries':'ore'});
  }
  // The upper camps have the same clear building perimeter as the southern camps.
  s.nodes=s.nodes.filter(n=>!s.buildings.some(b=>b.team===team&&dist(n,b)<D[b.kind].r+50));
  this.grid=this.seaGrid=null;
 }
 seedLandmarks(){this.s.landmarks=[...posts.map(p=>({...p,type:'post'})),...[
  [1130,310],[1940,1510],[2810,290],[3610,1580],[2140,2520]
 ].map(([x,y],i)=>({id:'relic-'+i,name:'失落遗迹',type:'relic',x,y,claimedBy:null}))]}
 pact(team){if(this.s.defeated.includes(team))return '这个国家已退出战役';if(this.allied(0,team))return '已经是同队盟友';const key=this.pair(0,team),old=this.s.pacts[key];
  if(old){if(this.s.time-old.since<60)return '贸易协定至少维持 60 秒';delete this.s.pacts[key];this.emit('diplomacy',{text:'已终止与 '+this.label(team)+' 的停战贸易'});return '协定终止，恢复敌对'}
  if(this.s.resources[0].gold<120)return '签订停战贸易需要 120 黄金';this.s.resources[0].gold-=120;this.s.resources[team].gold+=120;this.s.pacts[key]={since:this.s.time};
  for(const u of this.s.units){const target=this.byId(u.order?.id);if(target&&!this.hostile(u.team,target.team)&&u.order?.type==='attack'){u.order=null;u.path=[];u.combatTarget=null}}
  this.emit('diplomacy',{text:'与 '+this.label(team)+' 签订停战贸易'});return '已停战，可互通商队；仍需终止协定后击败其联盟才能获胜';
 }
 tradeTargets(team,home){return [...this.s.buildings.filter(b=>b.kind==='market'&&b.complete&&b.hp>0&&b.team!==team&&!this.hostile(team,b.team)),...this.s.landmarks.filter(p=>p.type==='post').map(p=>({...p,team:-1}))].filter(p=>!home||dist(p,home)>200)}
 route(u,destination,home=null){home=home||this.nearest(u,this.s.buildings.filter(b=>b.team===u.team&&b.kind==='market'&&b.complete));if(!home)return '先建造本国市场';const target=this.tradeTargets(u.team,home).find(p=>p.id===destination);if(!target)return '目标市场已不可贸易';u.trade={home:home.id,target:target.id,leg:'out',loaded:false,stuck:0};u.order={type:'hold'};u.path=[];return ''}
 rallySpawn(u,b){if(u.kind==='trader'){const target=this.tradeTargets(u.team,b).sort((a,c)=>dist(c,b)-dist(a,b))[0];if(target)this.route(u,target.id,b);return}super.rallySpawn(u,b)}
 order(units,cmd){for(const u of units){if(cmd.type==='attack'&&!this.hostile(u.team,this.byId(cmd.id)?.team))continue;if(u.kind==='trader'&&cmd.type!=='hold')u.trade=null;super.order([u],cmd)}}
 damage(target,amount,source){if(source&&!this.hostile(target.team,source.team))return;super.damage(target,amount,source)}
 townDestroyed(b){const s=this.s;if(s.defeated.includes(b.team))return;s.defeated.push(b.team);for(const u of s.units.filter(u=>u.team===b.team))u.hp=0;for(const other of s.buildings.filter(x=>x.team===b.team))other.hp=0;this.emit('diplomacy',{text:this.label(b.team)+' 已退出战役'});
  const active=s.nations.map((_,t)=>t).filter(t=>!s.defeated.includes(t));const own=active.some(t=>this.allied(0,t)),enemy=active.some(t=>!this.allied(0,t));if(!own||!enemy){s.ended=true;s.result=own;this.emit('end',{win:own})}}
 raids(){for(let team=1;team<this.s.nations.length;team++){if(this.s.defeated.includes(team))continue;const town=this.s.buildings.find(b=>b.team===team&&b.kind==='town');if(!town)continue;const enemy=this.nearest(town,this.s.buildings.filter(b=>b.kind==='town'&&this.hostile(team,b.team)));if(!enemy)continue;
  const army=this.s.units.filter(u=>u.team===team&&u.kind!=='villager'&&!this.sea(u)&&D[u.kind].damage>0&&!u.embarkedOn).slice(0,this.s.difficulty==='easy'?8:12);if(army.length>=4){this.order(army,{type:'advance',x:enemy.x,y:enemy.y});this.emit('raid',{team,target:enemy.team})}
  const dock=this.s.buildings.find(b=>b.team===enemy.team&&b.kind==='dock'),navy=this.s.units.filter(u=>u.team===team&&this.sea(u)&&D[u.kind].damage>0);if(dock&&navy.length>=2){this.order(navy.slice(0,4),{type:'advance',x:dock.x,y:K.coast(dock.x)+145});this.emit('navalRaid',{team,target:enemy.team})}
 }}
 ai(){for(let team=1;team<this.s.nations.length;team++){if(this.s.defeated.includes(team))continue;super.ai(team);const market=this.s.buildings.find(b=>b.team===team&&b.kind==='market'&&b.complete);if(market&&this.s.units.filter(u=>u.team===team&&u.kind==='trader').length<2&&!market.queue.length)this.train(market,'trader')}}
 tick(dt){if(this.s.ended)return;super.tick(dt);if(this.s.ended)return;const s=this.s;
  for(const u of s.units.filter(u=>u.kind==='trader'&&u.trade&&!u.embarkedOn)){
   const r=u.trade,home=this.byId(r.home),target=this.byId(r.target)||s.landmarks.find(p=>p.id===r.target),p=r.leg==='out'?target:home;
   if(!home||home.hp<=0||!target||target.hp<=0||(target.team>=0&&this.hostile(u.team,target.team))){u.trade=null;u.order=null;u.path=[];continue}
   u.order={type:'hold'};const reached=this.walk(u,p,p.type==='post'?65:D[p.kind].r+48,dt);
   if(reached){u.path=[];if(r.leg==='out'){r.loaded=true;r.leg='back'}else{const income=Math.round(Math.min(125,30+dist(home,target)*.035));s.resources[u.team].gold+=income;s.tradeGold[u.team]+=income;if(target.team>=0){const share=Math.round(income*.5);s.resources[target.team].gold+=share;s.tradeGold[target.team]+=share}this.fx('gather',{x:u.x,y:u.y-30,text:'贸易 +'+income,resource:'gold'},2);this.emit('trade',{team:u.team,amount:income});r.loaded=false;r.leg='out'}}
  }
  for(const p of s.landmarks.filter(p=>p.type==='relic'&&p.claimedBy===null)){const worker=s.units.find(u=>u.kind==='villager'&&!u.embarkedOn&&dist(u,p)<70);if(worker){p.claimedBy=worker.team;s.resources[worker.team].gold+=140;s.resources[worker.team].stone+=80;this.fx('upgrade',{x:p.x,y:p.y},2);this.emit('discovery',{team:worker.team,text:'探索遗迹：黄金 +140，石料 +80'})}}
 }
}
const api={...K,Sim:Coalitions,colors,starts,posts};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.KingdomSim=api;
})(typeof window!=='undefined'?window:globalThis);
