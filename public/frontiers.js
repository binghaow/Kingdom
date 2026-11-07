/* Late-industrial branches. Real costs, caps and research; no invulnerable units. */
((root)=>{'use strict';const K=typeof module!=='undefined'&&module.exports?require('./worlds.js'):root.KingdomSim,Base=K.Sim,D=K.defs,T=K.tech;
Object.assign(D,{
 steelworks:{name:'精密机械工坊',icon:'⚙',building:true,hp:1650,r:48,wood:380,gold:320,stone:240,time:55,age:5,trains:['steamcrawler','fieldmortar'],description:'V 时代机械化分支：昂贵的蒸汽装甲车与远程迫击炮'},
 signalbureau:{name:'电报与军械局',icon:'ϟ',building:true,hp:1100,r:42,wood:300,gold:260,stone:130,time:40,age:5,trains:['rifleguard','combatmedic'],description:'V 时代：连发步枪卫队与战地军医，研发电报侦察'},
 steamcrawler:{name:'蒸汽装甲车',icon:'⚙',hp:650,r:24,speed:32,food:140,wood:220,gold:340,stone:100,time:55,age:5,damage:62,range:245,cooldown:3.4,pop:6,baseArmor:7,role:'cannon',bonus:{building:1.35},description:'高护甲、低机动，占 6 人口；被长程炮兵克制，每国最多 3 辆'},
 fieldmortar:{name:'长管迫击炮',icon:'◉',hp:180,r:18,speed:27,wood:240,gold:280,time:42,age:5,damage:105,range:460,minRange:155,splash:65,cooldown:6,pop:5,role:'cannon',description:'超远程攻坚，最低射程 155；血量低，必须护卫'},
 rifleguard:{name:'连发步枪卫队',icon:'⚑',hp:170,r:12,speed:62,food:100,gold:105,time:25,age:5,damage:22,range:230,cooldown:1.35,pop:2,role:'musketeer',description:'快速火枪，双人口；怕骑兵和范围炮击'},
 combatmedic:{name:'战地军医',icon:'✚',hp:140,r:12,speed:70,food:90,gold:125,time:30,age:5,damage:0,range:0,cooldown:2,pop:2,role:'healer',description:'为附近脱战陆军提供持续医疗，自身不能攻击'}
});
Object.assign(T,{
 rolledsteel:{name:'轧制钢板',icon:'⚙',building:'steelworks',age:5,max:1,wood:220,gold:360,stone:180,time:60,description:'蒸汽装甲车护甲 +2，火炮护甲 +1'},
 smokeless:{name:'精制发射药',icon:'ϟ',building:'signalbureau',age:5,max:1,wood:180,gold:340,time:55,description:'火枪类伤害 +8%，不提高炮兵伤害'},
 telegraph:{name:'野战电报',icon:'⌖',building:'signalbureau',age:5,max:1,wood:240,gold:280,time:45,description:'本国建筑与陆军视野 +15%；不会揭开全图'}
});
class Frontiers extends Base{
 constructor(...args){super(...args);for(const t of this.s.tech)for(const key of ['rolledsteel','smokeless','telegraph'])t[key]??=0}
 unitError(b,k){if(k==='steamcrawler'){const used=this.s.units.filter(u=>u.team===b.team&&u.kind===k).length+this.s.buildings.filter(x=>x.team===b.team).reduce((n,x)=>n+x.queue.filter(q=>q.kind===k).length,0);if(used>=3)return '每国最多 3 辆蒸汽装甲车，含队列'}return super.unitError(b,k)}
 stat(e,key){let v=super.stat(e,key),t=this.s.tech[e.team]||{};if(key==='armor'&&t.rolledsteel&&D[e.kind].role==='cannon')v+=e.kind==='steamcrawler'?2:1;if(key==='damage'&&t.smokeless&&D[e.kind].role==='musketeer')v*=1.08;return v}
 sight(e){return super.sight(e)*(this.s.tech[e.team]?.telegraph&&!this.sea(e)?1.15:1)}
 tick(dt){super.tick(dt);if(this.s.ended)return;for(const u of this.s.units.filter(u=>u.kind==='combatmedic'&&!u.embarkedOn)){const target=this.nearest(u,this.s.units.filter(e=>this.allied(u.team,e.team)&&e.id!==u.id&&!this.sea(e)&&!this.air?.(e)&&e.hp<e.maxhp&&K.distance(e,u)<170&&this.s.time-(e.lastHurtAt||0)>4));if(target){this.face?.(u,target);target.hp=Math.min(target.maxhp,target.hp+dt*5);u.working=true;u.workResource='heal';if((u.healFx||0)<this.s.time){u.healFx=this.s.time+1.5;this.fx('heal',{x:target.x,y:target.y-24},.7)}}}}
 aiPlayer(team){super.aiPlayer(team);if(this.s.ages[team]<5)return;const town=this.s.buildings.find(b=>b.team===team&&b.kind==='town'),worker=this.s.units.find(u=>u.team===team&&this.builder(u));if(!town||!worker)return;for(const kind of ['steelworks','signalbureau'])if(!this.s.buildings.some(b=>b.team===team&&b.kind===kind)){for(let i=0;i<12;i++){const x=town.x+this.rand(-450,450),y=town.y+this.rand(-380,380);if(!this.placementError(kind,x,y,team)){this.construct(kind,x,y,[worker],team);break}}break}for(const b of this.s.buildings.filter(b=>b.team===team&&b.complete&&!b.queue.length&&['steelworks','signalbureau'].includes(b.kind))){const kinds=b.kind==='steelworks'?['steamcrawler','fieldmortar']:['rifleguard','combatmedic'];for(const k of kinds)if(!this.unitError(b,k)){this.train(b,k);break}}}
}
const api={...K,Sim:Frontiers};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.KingdomSim=api;
})(typeof window!=='undefined'?window:globalThis);
