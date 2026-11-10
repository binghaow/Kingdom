/* Render-only replica. All gameplay mutations become authenticated server commands. */
(()=>{'use strict';const K=window.KingdomSim,Base=K.NetworkSim;
/* Presentation-only motion. The server stays authoritative: these helpers only decide where a unit is drawn between two snapshots.
   A unit follows a short polyline (its server path, its fresh move target, or its last observed velocity) at its own speed, and is
   steered toward the newest authoritative position by running slightly faster or slower, never by jumping backwards. */
/* ARRIVE: the server ends a move 38 units short of its target (engine.js walk stop), so the drawn unit must not run past that. */
const LEAD=.9,PLAN_LIFE=1.5,ARRIVE=38;
function measure(points){let total=0;const lengths=[];for(let i=1;i<points.length;i++){const l=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);lengths.push(l);total+=l}return {lengths,total}}
function pointAt(m,distance){const p=m.points,l=m.lengths;let d=Math.max(0,Math.min(m.total,distance));for(let i=0;i<l.length;i++){if(d<=l[i]||i===l.length-1){const t=l[i]?Math.min(1,d/l[i]):0;return {x:p[i].x+(p[i+1].x-p[i].x)*t,y:p[i].y+(p[i+1].y-p[i].y)*t}}d-=l[i]}return p[0]}
function project(m,x,y){const p=m.points,l=m.lengths;let best=0,bestD=Infinity,walked=0;for(let i=0;i<l.length&&i<4;i++){const dx=p[i+1].x-p[i].x,dy=p[i+1].y-p[i].y,t=l[i]?Math.max(0,Math.min(1,((x-p[i].x)*dx+(y-p[i].y)*dy)/(l[i]*l[i]))):0,d=Math.hypot(p[i].x+dx*t-x,p[i].y+dy*t-y);if(d<bestD-.001){bestD=d;best=walked+l[i]*t}walked+=l[i]}return best}
function motion(points,speed,x,y,age=0,arrive=ARRIVE){const {lengths,total}=measure(points);if(!(total>1)||!(speed>1))return null;const m={points,lengths,total,speed,age,s:0,reach:Math.max(0,total-arrive)};m.s=project(m,x,y);return m}
class Client extends Base{
 static create(view,send){const c=Object.create(Client.prototype);c.networkClient=true;c.send=send;c.lastEvent=0;c._localEffects=[];c._sections={};c.apply(view,true);return c}
 /* Hashes of the static sections this replica holds; the server omits a section whose hash it would send again (protocol 2). */
 have(){const c=this._sections,out={};for(const key of ['world','tech','nodes','fog'])if(c[key])out[key]=c[key].hash;return out}
 apply(view,first=false){if(view.slim&&!K.networkExpand(view,this._sections??={})){this._sections={};return false}const old=new Map((this.s?.units||[]).map(u=>[u.id,u]));this.s=view.state;this.orderMap=view.order;this.grid=null;this.seaGrid=null;this._gateGrids=null;this._tradeTotals=this.s.tradeGold.slice();K.activateWorld(this.s.world);this.s.tech[-1]=Object.fromEntries(Object.keys(K.tech).map(k=>[k,0]));const elapsed=this.s.time-(this.serverTime??this.s.time);for(const u of this.s.units){const p=old.get(u.id);u._nx=u.x;u._ny=u.y;if(p&&!first&&Math.hypot(p.x-u.x,p.y-u.y)<500){u.x=p.x;u.y=p.y;this.follow(u,p,elapsed)}}if(this.s.units.some(u=>u._motion||u.order||u.combatTarget)||this.s.buildings.some(b=>b.team===0&&b.queue?.length)||this.s.effects.length)this._stillSince=this._clock||0;this.serverTime=this.s.time;this.visualTime=0;
  const f=view.fog,memory=Object.fromEntries([...this.s.buildings,...this.s.nodes].filter(e=>e.remembered).map(e=>[e.id,e]));this.fog=f?{cols:f.cols,rows:f.rows,revision:f.revision,visible:this.s.nations.map((_,i)=>i===0?Uint8Array.from(f.visible):new Uint8Array(f.visible.length)),explored:this.s.nations.map((_,i)=>i===0?Uint8Array.from(f.explored):new Uint8Array(f.explored.length)),memory:this.s.nations.map((_,i)=>i===0?memory:{})}:null;
  this._localEffects=this._localEffects.filter(f=>f.life>0);this.s.effects.push(...this._localEffects);this.events=[...(this.events||[]),...view.events.filter(e=>e.nid>this.lastEvent)].slice(-200);this.lastEvent=view.eventSeq;
 }
 issue(type,args){if(type!=='orders')this.flushOrders();const data={...args};if(type==='alliance'||type==='war')data.to=this.orderMap[data.to];if(type==='acceptAlliance'||type==='rejectAlliance')data.from=this.orderMap[data.from];return this.send(type,data)}
 tick(dt){if(this._orderBatch?.length&&!this._orderDepth)this.flushOrders();this.visualTime=Math.min(.65,this.visualTime+dt);this.s.time=this.serverTime+this.visualTime;this._clock=(this._clock||0)+dt;for(const u of this.s.units){const m=u._motion;let tx=u._nx,ty=u._ny;if(m){m.age+=dt;const goal=Math.min(m.reach,m.speed*Math.min(m.age,LEAD)),pace=Math.max(.5,Math.min(1.75,1+(goal-m.s)/(m.speed*.3)));m.s=Math.max(m.s,Math.min(m.reach,goal+m.speed*.5,m.s+m.speed*pace*dt));const q=pointAt(m,m.s);tx=q.x;ty=q.y}u.x+=(tx-u.x)*Math.min(1,dt*12);u.y+=(ty-u.y)*Math.min(1,dt*12);u.flash=Math.max(0,(u.flash||0)-dt);u.attackPulse=Math.max(0,(u.attackPulse||0)-dt)}for(const f of this.s.effects)f.life-=dt;this.s.effects=this.s.effects.filter(f=>f.life>0);this._localEffects=this._localEffects.filter(f=>f.life>0)}
 fx(type,data,life=.6){const f={type,...data,life,max:life,local:true};this._localEffects.push(f);this.s.effects.push(f)}
 /* One click on a selection calls order() once per unit (each has its own formation slot). Between beginOrders() and endOrders() those
    calls are collected and sent as a single 'orders' command; servers older than protocol 2 still get the per-unit form. */
 beginOrders(){this._orderDepth=(this._orderDepth||0)+1;this._orderBatch??=[]}
 endOrders(){this._orderDepth=Math.max(0,(this._orderDepth||0)-1);if(!this._orderDepth)this.flushOrders()}
 flushOrders(){const batch=this._orderBatch;if(!batch?.length)return;this._orderBatch=[];if((this.protocol||1)<2||batch.length===1){for(const item of batch)this.issue('order',item);return}
  const items=[];for(const {ids,order} of batch){const last=items.at(-1),point=order.type==='move'||order.type==='advance';if(point&&last?.points&&last.order.type===order.type&&!!last.order.retreat===!!order.retreat&&ids.length===1){last.ids.push(ids[0]);last.points.push({x:order.x,y:order.y});continue}if(!point&&ids.length===1&&last?.each&&JSON.stringify(last.order)===JSON.stringify(order)){last.ids.push(ids[0]);continue}items.push(point&&ids.length===1?{ids:[ids[0]],order:{type:order.type,retreat:order.retreat===true},points:[{x:order.x,y:order.y}]}:ids.length===1?{ids:[ids[0]],order,each:true}:{ids:[...ids],order})}
  for(let i=0;i<items.length;i+=120)this.issue('orders',{items:items.slice(i,i+120).flatMap(item=>item.ids.length<=160?[item]:Array.from({length:Math.ceil(item.ids.length/160)},(_,k)=>({...item,ids:item.ids.slice(k*160,k*160+160),points:item.points?.slice(k*160,k*160+160)})))})}
 /* True when the last views showed nothing walking, fighting or queued, so the poll loop may slow down. */
 quiet(){return (this._stillSince??this._clock??0)+2<(this._clock||0)}
 /* Straight segment from a to b, cut at the first cell a walker cannot enter, so a predicted step never crosses water, cliffs or walls. */
 clearTo(u,a,b){const length=Math.hypot(b.x-a.x,b.y-a.y);if(this.air?.(u)||length<1)return b;let free=0;try{for(let d=16;d<=length;d+=16){if(this.blocked(a.x+(b.x-a.x)*d/length,a.y+(b.y-a.y)*d/length,u))break;free=d}}catch{return a}const t=free>=length-16?1:free/length;return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}}
 /* Chooses what a unit is drawn doing until the next snapshot. p is the same unit from the previous view (with its drawn position). */
 follow(u,p,elapsed){const own=u.team===0,auth={x:u._nx,y:u._ny};if(u.hp<=0||u.embarkedOn)return;
  if(elapsed>0){u._velocity={x:(u._nx-p._nx)/elapsed,y:(u._ny-p._ny)/elapsed};u._tracked=!!p._pathed}else{u._velocity=p._velocity;u._tracked=p._tracked}
  const v=u._velocity,seen=v?Math.hypot(v.x,v.y):0,top=own?this.stat(u,'speed'):0,o=own?u.order:null,moving=o&&(o.type==='move'||o.type==='advance')&&Number.isFinite(o.x);
  let plan=p._plan;if(plan&&(this._clock-plan.at>=PLAN_LIFE||moving&&Math.hypot(o.x-plan.x,o.y-plan.y)<80))plan=null;
  if(plan){u._plan=plan;u._motion=motion([auth,this.clearTo(u,auth,plan)],top,u.x,u.y,this._clock-plan.at);return}
  if(own&&u.path?.length){u._pathed=true;u._motion=motion([auth,...u.path.map(q=>({x:q.x,y:q.y}))],u._tracked&&v?Math.min(seen,top*1.3):top,u.x,u.y);return}
  if(moving&&Math.hypot(o.x-auth.x,o.y-auth.y)>8){u._motion=motion([auth,this.clearTo(u,auth,o)],top,u.x,u.y);return}
  if(!own&&seen>5&&seen<400)u._motion=motion([auth,{x:auth.x+v.x*.6,y:auth.y+v.y*.6}],seen,u.x,u.y,0,0)}
 /* Immediate local answer to a move order: the unit turns and starts walking now; the server path replaces this guess when it arrives. */
 predict(u,order){if(u.team!==0||u.hp<=0||u.embarkedOn)return;const goal=order.type==='move'||order.type==='advance'?order:this.byId?.(order.id);if(!goal||!Number.isFinite(goal.x))return;if(Math.abs(goal.x-u.x)>1)u.facing=goal.x>=u.x?1:-1;if(goal!==order)return;u._plan={x:order.x,y:order.y,at:this._clock||0};u._motion=motion([{x:u.x,y:u.y},this.clearTo(u,u,order)],this.stat(u,'speed'),u.x,u.y)}
 order(units,order){if(!units.length)return;for(const u of units)this.predict(u,order);const item={ids:units.map(u=>u.id),order};if(this._orderDepth){this._orderBatch.push(item);return}this.issue('order',item)}
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
