/* V37 render-side motion director. Wraps A.unit with small, non-additive anchor-pivoted transforms (translate / rotate / scale about the feet)
   so ONE authored frame is still drawn at a time (no ghosting) but the pose now lunges, recoils, flinches, turns and bobs.
   It reads simulation fields and never writes them. Off switch: ?anim37=0. */
(()=>{'use strict';
const A=window.KingdomArt,D=window.KingdomSim.defs,on=!/[?&]anim37=0/.test(location.search);
if(!on){window.KingdomAnim37={hit(){},active:false};return}
const inner=A.unit,innerRender=A.renderUnit,st=new Map(),VEC={front:[0,.6],back:[0,-.6],right:[1,0],left:[-1,0]},clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const MACHINE=new Set(['cannon','howitzer','mortar','fieldmortar','trebuchet','siegewagon','steamcrawler','emberthrower']);
const state=id=>{let s=st.get(id);if(!s){if(st.size>900)st.delete(st.keys().next().value);s={dir:null,turnAt:-9,hitAt:undefined,hx:0,hy:0,hm:0,hr:1,sel:false,selAt:-9};st.set(id,s)}return s};
window.KingdomAnim37={active:true,
 /* A hit lands at `at` (projectile arrival), not when the simulation resolved the strike. */
 hit(id,at,vx,vy,mag){const s=state(id);s.hitAt=at;s.hx=vx;s.hy=vy;s.hm=mag;s.hr=vx>=0?1:-1}};
const bump=k=>k<=0?0:k>=1?1:k*k*(3-2*k);
A.unit=(c,u,t,selected)=>{
 if(!u||!u.id||u.id<0||u.embarkedOn)return inner(c,u,t,selected);
 const d=D[u.kind];if(!d||d.building)return inner(c,u,t,selected);
 const clock=A.animClock??t,s=state(u.id);let ox=0,oy=0,rot=0,sx=1,sy=1,flash=u.flash,copy=null;
 const dir=A.directionFor?.(u)||'right';
 if(s.dir&&s.dir!==dir)s.turnAt=clock;s.dir=dir;
 const turn=clock-s.turnAt;if(turn>=0&&turn<.16){const k=1-turn/.16;sx*=1-.2*k*k;sy*=1+.025*k}
 if(s.hitAt!==undefined){const h=clock-s.hitAt;if(h<0){flash=0;copy=true}else if(h<.3){const k=h<.05?bump(h/.05):1-bump((h-.05)/.25);ox+=s.hx*s.hm*k;oy+=s.hy*s.hm*k*.6;rot+=s.hr*.04*k*(s.hm>5?1.6:1);sy*=1-.03*k;flash=h<.11?.2:0;copy=true}else s.hitAt=undefined}
 const at=u.visualActionAt??(u.actionType==='attack'?u.actionAt:undefined),age=at===undefined?9:clock-at,vd=VEC[u.visualDirection&&age<.9?u.visualDirection:dir]||VEC.right;
 if(d.damage>0&&!MACHINE.has(u.kind)){const ranged=d.range>80;
  if(age>=0&&age<.36){if(ranged){const R=d.role==='cannon'?6:u.kind==='musketeer'||d.role==='musketeer'?3:1.6,k=age<.04?bump(age/.04):1-bump((age-.04)/.32);ox-=vd[0]*R*k;oy-=vd[1]*R*k}else{const L=d.role==='cavalry'?7:5,k=age<.07?bump(age/.07):1-bump((age-.07)/.29);ox+=vd[0]*L*k;oy+=vd[1]*L*k;sy*=1-.03*k;sx*=1+.02*k}}
  else if(u.combatTarget&&!u.path?.length&&u.cool>0){const w=Math.min(.38,Math.min(1.35,Math.max(.32,(d.cooldown||1)*.72))*.4),cool=Math.max(0,u.cool-(clock-(A.simTick??clock)));if(cool<w){const k=1-cool/w,e=k*k;ox-=vd[0]*(ranged?1:2.6)*e;oy-=vd[1]*(ranged?1:2.6)*e;rot-=.022*e*(vd[0]>=0?1:-1)}}}
 if(!MACHINE.has(u.kind)&&!d.domain&&!d.monster&&!d.companion&&!d.wildlife&&age>.8&&A.walkPose){const p=A.walkPose(u,clock);if(p.weight>.08){const amp=(d.role==='cavalry'?2.3:u.kind==='villager'?1:1.6)*p.weight;oy-=Math.abs(Math.cos(p.phase))*amp;rot+=Math.sin(p.phase)*.014*p.weight+(dir==='right'?.012:dir==='left'?-.012:0)*p.weight}}
 if(selected!==s.sel){if(selected)s.selAt=clock;s.sel=selected}
 const sel=selected?clock-s.selAt:9,drawIn=copy?{...u,flash}:u;
 if(ox||oy||rot||sx!==1||sy!==1){const py=u.y+8;c.save();c.translate(u.x+ox,py+oy);if(rot)c.rotate(rot);c.scale(sx,sy);c.translate(-u.x,-py);const r=inner(c,drawIn,t,selected);c.restore();if(sel<.35)window.KingdomFX?.selectRing(c,u.x,u.y+7,Math.min(30,(A.measure?.(u.kind)?.width||40)*.32),sel/.35);return r}
 const r=inner(c,drawIn,t,selected);if(sel<.35)window.KingdomFX?.selectRing(c,u.x,u.y+7,Math.min(30,(A.measure?.(u.kind)?.width||40)*.32),sel/.35);return r};
})();
