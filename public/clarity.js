/* Readable teams, paid explicit repair, boarding state and functional neutral sites. */
((root)=>{'use strict';const K=typeof module!=='undefined'&&module.exports?require('./campaign.js'):root.KingdomSim,Base=K.Sim,D=K.defs;
K.colors.splice(0,K.colors.length,'#3c9bff','#f04b55','#36d49b','#bd83ff','#ffba45');
function cargoInfo(s,ship,viewer=0){const capacity=D[ship.kind]?.cargoCapacity||D[ship.kind]?.cargo||0;if(!capacity)return null;const known=ship.team===viewer,roster=known?s.units.filter(u=>u.embarkedOn===ship.id):[];return{known,capacity,count:roster.length,population:roster.reduce((n,u)=>n+(D[u.kind].pop||1),0),roster}}
class Clarity extends Base{
 byId(id){return super.byId(id)||this.s.landmarks?.find(p=>p.id===id)}
 board(ship,units=null){const result=super.board(ship,units);if(ship&&(ship.kind==='transport'||D[ship.kind]?.transport))ship.boardingUntil=this.s.time+4;return result}
 unload(ship){const result=super.unload(ship);if(ship&&result.includes('已卸载'))ship.boardingUntil=this.s.time+4;return result}
 cargoInfo(ship,viewer=0){return cargoInfo(this.s,ship,viewer)}
 repairError(u,b){if(!this.builder(u)||u.embarkedOn||u.hp<=0)return '请选择可施工的村民、工程师或工程车';if(!b||!D[b.kind]?.building||!b.complete||b.hp<=0||!this.allied(u.team,b.team))return '只能维修己方或盟友的已完工建筑';if(b.hp>=b.maxhp)return '建筑已完好';return ''}
 repairTick(u,b,dt){if(u.order?.type!=='repair')return false;const error=this.repairError(u,b);if(error){u.order=null;u.path=[];return true}if(this.walk(u,b,D[b.kind].r+48,dt)){const rate=u.kind==='engineer'?12:u.kind==='siegewagon'?10:8,stone=D[b.kind].stone>0?.02:0,wood=.06,bank=this.s.resources[u.team],amount=Math.max(0,Math.min(b.maxhp-b.hp,rate*dt*(this.s.time-(b.lastHurtAt??-100)<2?.5:1),bank.wood/wood,stone?bank.stone/stone:Infinity));u.working=amount>0;u.workResource='repair';u.aimX=b.x;u.aimY=b.y;u.facing=b.x>=u.x?1:-1;if(amount>0){this.pay({wood:amount*wood,stone:amount*stone},u.team);b.hp=Math.min(b.maxhp,b.hp+amount);u.repairHammer=(u.repairHammer||0)+dt;if(u.repairHammer>.85){u.repairHammer=0;u.actionAt=this.s.time;this.emit('sound',{kind:'hammer',x:u.x,y:u.y});this.fx('workStroke',{x:u.x,y:u.y,tx:b.x,ty:b.y,resource:'build'},.55)}}else if(!u.repairBlocked){u.repairBlocked=true;this.emit('repairBlocked',{team:u.team,text:'维修材料不足，需要木材与石料'})}if(b.hp>=b.maxhp-.001){b.hp=b.maxhp;u.order=null;this.emit('repairComplete',{team:u.team,text:D[b.kind].name+' 已修复'})}}return true}
 order(units,cmd){if(cmd.type==='repair'){const b=this.byId(cmd.id),valid=units.filter(u=>!this.repairError(u,b));for(const u of valid){u.order={type:'repair',id:b.id};u.path=[];u.repairBlocked=false;delete u.buildQueue}return}return super.order(units,cmd)}
 landmarkInfo(p){if(p?.type==='post')return{name:p.name||'中立商站',icon:'market',title:'中立商站 · 商队贸易',description:'与本国市场建立商路，商队每次往返获得黄金；路程越长收益越高。先在市场训练商队，再选商队点击这里，或使用“派遣商队贸易”。'};if(p?.type==='relic')return{name:p.name||'失落遗迹',icon:'kclair',title:'遗迹 · 一次性宝藏',description:p.claimedBy===null?'村民靠近即可探索，获得黄金 140、石料 80；每处遗迹只能领取一次。':'宝藏已被 '+this.label(p.claimedBy)+' 领取。'};return null}
 canTarget(u,e){if(e?.type==='post'||e?.type==='relic')return false;return super.canTarget(u,e)}
}
const api={...K,Sim:Clarity,cargoInfo};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.KingdomSim=api;
})(typeof window==='undefined'?globalThis:window);
