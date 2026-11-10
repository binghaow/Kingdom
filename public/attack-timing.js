/* Deterministic presentation timing; combat damage, cooldowns and resources stay authoritative. */
((root)=>{'use strict';const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function duration(d){return clamp((d.cooldown||1)*.72,.32,1.35)}
function pair(phase){const v=clamp(phase,0,1)*3,a=Math.min(3,Math.floor(v));return{a,b:Math.min(3,a+1),blend:v-a}}
function sample(u,time,d,F,lead){if(u._attackPreview){const p=u._attackPreview;return{id:p.id||u.kind,direction:p.direction||F.resolve(u),phase:clamp(p.phase,0,1),preview:true}}const dir=F.resolve(u),seed=(u.id||0)*.137;
if(d.monster&&((u.castUntil||0)>time||(u.guardianFireUntil||0)+.32>time&&u.guardianFireUntil>0)){let phase;if((u.castUntil||0)>time)phase=clamp((time-(u.guardianActionAt??time))/1.4,0,1)/3;else if(u.guardianFireUntil>time)phase=1/3+clamp((time-(u.guardianActionAt??(u.guardianFireUntil-1))),0,1)/3;else phase=2/3+clamp((time-u.guardianFireUntil)/.32,0,1)/3;return{id:u.kind+'_breath',direction:u.visualDirection||dir,phase}}
if(u.kind==='villager'&&u.working&&u.workResource!=='hunt'){const work=['build','repair'].includes(u.workResource)?'build':u.workResource==='wood'?'wood':u.workResource==='food'?'food':'mine';return{id:'villager_'+work,direction:dir,phase:((time/(work==='wood'?1.1:1.3)+seed)%1+1)%1}}
if((u.kind==='engineer'||u.kind==='combatmedic'||u.kind==='fishingboat')&&u.working)return{id:u.kind,direction:dir,phase:((time/1.2+seed)%1+1)%1};
if(['transport','airtransport'].includes(u.kind)&&(u.boardingUntil||0)>time&&!u.path?.length)return{id:u.kind,direction:dir,phase:clamp((time-(u.boardingUntil-4))/1.4,0,1)};
if(u.kind==='scoutballoon'&&u.path?.length)return{id:u.kind,direction:dir,phase:((time/2.4+seed)%1+1)%1};
if(u.kind==='trader'&&u.trade&&!u.path?.length)return{id:u.kind,direction:dir,phase:((time/1.6+seed)%1+1)%1};
if(d.hero&&u.castUntil>time)return{id:u.kind,direction:dir,phase:clamp((time-(u.castStarted??time))/1.1,0,1)};
const at=d.monster&&u.guardianAction==='melee'?u.guardianActionAt:u.kind==='healer'?u.healActionAt:u.kind==='carrier'?u.launchActionAt:u.actionType==='hunt'?u.actionAt:u.visualActionAt??(['attack','bomb'].includes(u.actionType)?u.actionAt:undefined),age=time-(at??-100),span=duration(d);
if(!api.legacy)return v37(u,d,dir,time,age,span,lead||0);
if(age>=0&&age<span&&(d.damage>0||u.kind==='healer'||u.kind==='carrier'))return{id:u.kind,direction:u.visualDirection||dir,phase:1/3+clamp(age/span,0,1)*2/3};
const windup=Math.min(.28,span*.25);if(d.damage>0&&u.combatTarget&&!u.path?.length&&u.cool>0&&u.cool<windup)return{id:u.kind,direction:dir,phase:(1-u.cool/windup)/3};return null}
/* V37 schedule: one authored frame at a time, but with explicit anticipation / release (hit) / follow-through / recovery holds.
   Frame 0 (prepare) fills the whole wind-up, frame 1 (release) is held for the strike instant, and frame 3 (recover) is kept until the next wind-up when
   the next swing is close, so fast attackers no longer flick back to the standing sprite between swings. Pure presentation: reads, never writes, u. */
function v37(u,d,dir,time,age,span,lead){const armed=d.damage>0||u.kind==='healer'||u.kind==='carrier',cool=Math.max(0,(u.cool||0)-lead),windup=Math.min(.38,span*.4),engaged=d.damage>0&&u.combatTarget&&!u.path?.length;
 if(age>=0&&age<span&&armed){const q=age/span,frame=q<.2?1:q<.62?2:3;return{id:u.kind,direction:u.visualDirection||dir,phase:frame/3,frame,age,span}}
 if(engaged&&cool>0&&cool<windup)return{id:u.kind,direction:dir,phase:0,frame:0,prep:1-cool/windup,windup};
 if(engaged&&age>=span&&age<span+.4&&cool>0&&cool<windup+.3)return{id:u.kind,direction:u.visualDirection||dir,phase:1,frame:3,age,span,hold:true};
 return null}
const api={duration,pair,sample,legacy:false};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.KingdomAttackTiming=api})(typeof window==='undefined'?globalThis:window);
