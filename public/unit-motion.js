/* Render-only interpolation and distance-driven gait. Never changes simulation coordinates. */
((root)=>{'use strict';const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),TAU=Math.PI*2;
function interpolate(before,u,alpha){if(!before||before.kind!==u.kind||Math.hypot(u.x-before.x,u.y-before.y)>160)return u;const a=clamp(alpha,0,1);return{...u,x:before.x+(u.x-before.x)*a,y:before.y+(u.y-before.y)*a}}
function limb(phase,side,along,weight=1,mounted=false){const p=phase+(side<0?0:Math.PI),bend=Math.sin(Math.PI*along),lift=Math.max(0,Math.cos(p));return{x:(Math.sin(p)*(mounted?3:3.6)*along+lift*bend*1.4)*weight,y:-lift*(mounted?2:2.6)*along*along*weight}}
class Gait{
 constructor(){this.states=new Map()}
 sample(u,now,mounted=false){if(!u.id)return{phase:0,weight:0};const key=u.team+':'+u.id+':'+u.kind;let v=this.states.get(key);if(!v||now<v.at||now-v.at>1){v={x:u.x,y:u.y,at:now,phase:0,weight:0};this.states.set(key,v)}const dt=clamp(now-v.at,0,.1),distance=Math.hypot(u.x-v.x,u.y-v.y),travel=distance<120?distance:0,moving=travel>.001;if(travel)v.phase=(v.phase+travel/(mounted?50:u.kind==='villager'?64:32)*TAU)%TAU;v.weight+=(Number(moving)-v.weight)*(1-Math.exp(-dt*18));v.x=u.x;v.y=u.y;v.at=now;if(this.states.size>600)this.states.delete(this.states.keys().next().value);return{phase:v.phase,weight:v.weight}}
}
const api={interpolate,limb,Gait};if(typeof module!=='undefined'&&module.exports){module.exports=api;return}const A=root.KingdomArt,K=root.KingdomSim,gait=new Gait();let active=null,previous=new Map();
A.captureMotion=sim=>{if(active!==sim){active=sim;gait.states.clear()}previous=new Map(sim.state.units.map(u=>[u.id,{x:u.x,y:u.y,kind:u.kind}]))};
A.renderUnit=(u,alpha)=>interpolate(previous.get(u.id),u,alpha);
A.walkPose=(u,t)=>gait.sample(u,A.renderTime??t,K.defs[u.kind]?.role==='cavalry');
A.drawWalkingSprite=(c,img,w,h,pose,mounted=false)=>{const weight=pose.weight;if(weight<.001){c.drawImage(img,-w/2,-h,w,h);return}const cut=mounted?.69:.56,top=img.height*cut; // torso stays planted; opposing legs swing from the hip
 c.drawImage(img,0,0,img.width,top,-w/2,-h,w,h*cut);
 const bands=9;for(const side of [-1,1]){const sx=side<0?0:img.width/2,dx=side<0?-w/2:0;for(let i=0;i<bands;i++){const a=i/bands,b=(i+1)/bands,pa=limb(pose.phase,side,a,weight,mounted),pb=limb(pose.phase,side,b,weight,mounted),sy=top+(img.height-top)*a,sh=(img.height-top)/bands,y=-h+h*cut+h*(1-cut)*a+pa.y,dh=h*(1-cut)/bands+pb.y-pa.y;c.drawImage(img,sx,sy,img.width/2,sh,dx+(pa.x+pb.x)/2,y,w/2,dh+.25)}}
};
})(typeof window==='undefined'?globalThis:window);
