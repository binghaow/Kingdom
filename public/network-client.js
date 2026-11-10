/* Render-only replica. All gameplay mutations become authenticated server commands. */
(()=>{'use strict';const K=window.KingdomSim,Base=K.NetworkSim;
class Client extends Base{
 static create(view,send){const c=Object.create(Client.prototype);c.networkClient=true;c.send=send;c.lastEvent=0;c._localEffects=[];c._sections={};c.apply(view,true);return c}
 /* Hashes of the static sections this replica holds; the server omits a section whose hash it would send again (protocol 2). */
 have(){const c=this._sections,out={};for(const key of ['world','tech','nodes','fog'])if(c[key])out[key]=c[key].hash;return out}
 apply(view,first=false){if(view.slim&&!K.networkExpand(view,this._sections??={})){this._sections={};return false}const old=new Map((this.s?.units||[]).map(u=>[u.id,u]));this.s=view.state;this.orderMap=view.order;this.grid=null;this.seaGrid=null;this._gateGrids=null;this._tradeTotals=this.s.tradeGold.slice();K.activateWorld(this.s.world);this.s.tech[-1]=Object.fromEntries(Object.keys(K.tech).map(k=>[k,0]));for(const u of this.s.units){const p=old.get(u.id);u._nx=u.x;u._ny=u.y;if(p&&!first&&Math.hypot(p.x-u.x,p.y-u.y)<500){u.x=p.x;u.y=p.y}}this.serverTime=this.s.time;this.visualTime=0;
  const f=view.fog,memory=Object.fromEntries([...this.s.buildings,...this.s.nodes].filter(e=>e.remembered).map(e=>[e.id,e]));this.fog=f?{cols:f.cols,rows:f.rows,revision:f.revision,visible:this.s.nations.map((_,i)=>i===0?Uint8Array.from(f.visible):new Uint8Array(f.visible.length)),explored:this.s.nations.map((_,i)=>i===0?Uint8Array.from(f.explored):new Uint8Array(f.explored.length)),memory:this.s.nations.map((_,i)=>i===0?memory:{})}:null;
  this._localEffects=this._localEffects.filter(f=>f.life>0);this.s.effects.push(...this._localEffects);this.events=[...(this.events||[]),...view.events.filter(e=>e.nid>this.lastEvent)].slice(-200);this.lastEvent=view.eventSeq;
 }
 issue(type,args){if(type!=='orders')this.flushOrders();const data={...args};if(type==='alliance'||type==='war')data.to=this.orderMap[data.to];if(type==='acceptAlliance'||type==='rejectAlliance')data.from=this.orderMap[data.from];return this.send(type,data)}
 tick(dt){if(this._orderBatch?.length&&!this._orderDepth)this.flushOrders();this.visualTime=Math.min(.65,this.visualTime+dt);this.s.time=this.serverTime+this.visualTime;for(const u of this.s.units){u.x+=(u._nx-u.x)*Math.min(1,dt*12);u.y+=(u._ny-u.y)*Math.min(1,dt*12);u.flash=Math.max(0,(u.flash||0)-dt);u.attackPulse=Math.max(0,(u.attackPulse||0)-dt)}for(const f of this.s.effects)f.life-=dt;this.s.effects=this.s.effects.filter(f=>f.life>0);this._localEffects=this._localEffects.filter(f=>f.life>0)}
 fx(type,data,life=.6){const f={type,...data,life,max:life,local:true};this._localEffects.push(f);this.s.effects.push(f)}
 /* One click on a selection calls order() once per unit (each has its own formation slot). Between beginOrders() and endOrders() those
    calls are collected and sent as a single 'orders' command; servers older than protocol 2 still get the per-unit form. */
 beginOrders(){this._orderDepth=(this._orderDepth||0)+1;this._orderBatch??=[]}
 endOrders(){this._orderDepth=Math.max(0,(this._orderDepth||0)-1);if(!this._orderDepth)this.flushOrders()}
 flushOrders(){const batch=this._orderBatch;if(!batch?.length)return;this._orderBatch=[];if((this.protocol||1)<2||batch.length===1){for(const item of batch)this.issue('order',item);return}
  const items=[];for(const {ids,order} of batch){const last=items.at(-1),point=order.type==='move'||order.type==='advance';if(point&&last?.points&&last.order.type===order.type&&!!last.order.retreat===!!order.retreat&&ids.length===1){last.ids.push(ids[0]);last.points.push({x:order.x,y:order.y});continue}if(!point&&ids.length===1&&last?.each&&JSON.stringify(last.order)===JSON.stringify(order)){last.ids.push(ids[0]);continue}items.push(point&&ids.length===1?{ids:[ids[0]],order:{type:order.type,retreat:order.retreat===true},points:[{x:order.x,y:order.y}]}:ids.length===1?{ids:[ids[0]],order,each:true}:{ids:[...ids],order})}
  for(let i=0;i<items.length;i+=120)this.issue('orders',{items:items.slice(i,i+120).flatMap(item=>item.ids.length<=160?[item]:Array.from({length:Math.ceil(item.ids.length/160)},(_,k)=>({...item,ids:item.ids.slice(k*160,k*160+160),points:item.points?.slice(k*160,k*160+160)})))})}
 order(units,order){if(!units.length)return;const item={ids:units.map(u=>u.id),order};if(this._orderDepth){this._orderBatch.push(item);return}this.issue('order',item)}
 setRally(b,p){return this.issue('rally',{id:b.id,point:p})?'':'正在重新连接，请稍候'}
 train(b,kind){const e=this.unitError(b,kind);if(e)return e;return this.issue('train',{id:b.id,kind})?'':'正在重新连接，请稍候'}
 research(b,key){const e=this.researchError(b,key);if(e)return e;return this.issue('research',{id:b.id,key})?'':'正在重新连接，请稍候'}
 constructLine(kind,a,b,workers){const plan=K.wallPlan(kind,a,b);return this.issue('wallLine',{kind,a,b,ids:workers.map(u=>u.id)})?{count:plan.length,pending:true}:{count:0,error:'正在重新连接，请稍候'}}
 construct(kind,x,y,workers){const e=this.placementError(kind,x,y,0);if(e)return{error:e};return this.issue('construct',{kind,x,y,ids:workers.map(u=>u.id)})?{pending:true}:{error:'正在重新连接，请稍候'}}
 board(u){this.issue('board',{id:u.id});return '运输指令已发送'}
 unload(u){this.issue('unload',{id:u.id});return '运输指令已发送'}
 assignFish(u){this.issue('fish',{id:u.id})}
 skill(u){this.issue('skill',{id:u.id});return '技能指令已发送'}
 castSpell(u,spell){this.issue('spell',{id:u.id,spell});return '技能指令已发送'}
 route(u,destination){return this.issue('route',{id:u.id,destination})?'':'正在重新连接，请稍候'}
 claimReward(team,choice){this.issue('reward',{choice});return '奖励选择已发送'}
 pact(t){this.issue('alliance',{to:t});return '结盟邀请已发送，等待对方接受'}
 sendChat(text,options={}){this.issue('chat',{text,channel:options.recipient==='team'?'team':'all'});return null}
 setDifficulty(){return '联机中不能更改难度'}
}
window.KingdomNetworkClient=Client;
})();
