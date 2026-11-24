/* Little Ant renderer. The atlas loads only after the ant is summoned (like panda-art.js); until then
   nothing is fetched or decoded. One drawImage for the sprite plus one for a cached soft shadow (or
   two ripple strokes when swimming). Presentation only: reads unit fields, never writes sim state. */
(()=>{'use strict';const A=window.KingdomArt,baseUnit=A.unit,baseMeasure=A.measure,baseIcon=A.icon;
const URL='assets/little-ant-v1.png',ICON='assets/little-ant-icon-v1.png',CW=144,CH=132,GROUND=120,S=.6,W=CW*S,H=CH*S;
const ROW={idle:0,walk:1,run:2,jump:3,sleep:4,special:5},COUNT={walk:7,run:6,jump:6},JUMP_LIFT=[0,12,45,47,12,1];
const SPECIAL={happy:0,love:1,surprised:2,confused:3,cheer:4,rest:5,carry:6,dig:7},SPECIAL_RIGHT=[false,true,false,false,true,true,true,false];
let last=null,image=null,loading=null,shadow=null;const ui=new Map();
function load(){if(loading)return loading;loading=new Promise(resolve=>{const img=A.image();img.onload=()=>{image=img;resolve(true)};img.onerror=()=>{loading=null;console.warn('小蚂蚁素材加载失败：'+URL);resolve(false)};img.src=A.src(URL)});return loading}
function soft(){if(shadow)return shadow;const c=document.createElement('canvas');c.width=64;c.height=24;const g=c.getContext('2d'),r=g.createRadialGradient(32,12,2,32,12,30);r.addColorStop(0,'rgba(20,30,18,.42)');r.addColorStop(1,'rgba(20,30,18,0)');g.setTransform(1,0,0,.38,0,7.4);g.fillStyle=r;g.beginPath();g.arc(32,12,30,0,Math.PI*2);g.fill();return shadow=c}
function heading(u){if(u.path?.length){const p=u.path[0],dx=p.x-u.x,dy=p.y-u.y;if(dx*dx+dy*dy>4)return Math.atan2(dy,dx)}if(Number.isFinite(u.lookAngle))return u.lookAngle;const v=u.viewDirection;return({right:0,front:Math.PI/2,left:Math.PI,back:-Math.PI/2})[v]??(u.facing===-1?Math.PI:0)}
const idleCol=a=>((Math.round(a/(Math.PI/4))+2)%8+8)%8;/* atlas idle order: back, backRight, right, frontRight, front, frontLeft, left, backLeft */
function presentation(u,t,selected){let p=ui.get(u.id);if(!p){p={sel:false,until:0,kind:null,jumpAt:-9,high:false,order:null};ui.set(u.id,p)}if(selected&&!p.sel){const r=Math.random();p.kind=['happy','love','cheer'][Math.floor(r*3)];p.until=t+1.4;if(r>.55){p.jumpAt=t;p.high=true}}p.sel=selected;if(u.antHop>0&&t-p.jumpAt>.75){p.jumpAt=t;p.high=false}return p}
function frame(u,t,p){const a=heading(u),moving=!!u.path?.length,right=Math.cos(a)>=0,side=Math.abs(Math.cos(a))>.38;
 const jt=t-p.jumpAt;if(jt>=0&&jt<.72&&!u.swimming){const col=Math.min(5,Math.floor(jt/.12));return{row:ROW.jump,col,flip:!right,lift:JUMP_LIFT[col]*S*(p.high?1.7:1)}}
 if(u.antSleeping){const st=u.antSleepFor||0;const col=st<.6?0:st<1.2?1:2+Math.floor(t*.9+u.id)%2;return{row:ROW.sleep,col,flip:false}}
 if(u.antWake>0)return{row:ROW.sleep,col:4,flip:false};
 const emote=u.antEmote?.kind||(p.until>t?p.kind:null);if(emote&&!moving){const c=SPECIAL[emote];return{row:ROW.special,col:c,flip:SPECIAL_RIGHT[c]!==right&&emote!=='surprised'}}
 if(u.working){const c=SPECIAL.dig;return{row:ROW.special,col:c,flip:SPECIAL_RIGHT[c]!==right,bob:Math.abs(Math.sin(t*7))*1.5}}
 if(moving&&u.cargo?.amount>0&&!u.swimming){const c=SPECIAL.carry;return{row:ROW.special,col:c,flip:SPECIAL_RIGHT[c]!==right,bob:Math.abs(Math.sin(t*9))*1.6}}
 if(moving){const run=u.sprintLeft>0;if(side||u.swimming){const n=run?COUNT.run:COUNT.walk;return{row:run?ROW.run:ROW.walk,col:Math.floor(t*(run?15:10)+u.id)%n,flip:!right}}return{row:ROW.idle,col:idleCol(a),flip:false,bob:Math.abs(Math.sin(t*(run?14:9)))*2.2}}
 return{row:ROW.idle,col:idleCol(a),flip:false,bob:Math.sin(t*2+u.id)*.5}}
function draw(c,u,t,selected){if(!image){load();return baseUnit(c,u,t,selected)}const p=presentation(u,t,selected);const f=last=frame(u,t,p),x=u.x,y=u.y+6,swim=!!u.swimming,bob=(f.bob||0)+(swim?Math.sin(t*3.2+u.id)*1.4:0),lift=f.lift||0;
 c.save();if(!swim){const sh=soft(),k=Math.max(.55,1-lift/60);c.globalAlpha=k;c.drawImage(sh,x-28*k,y-9*k,56*k,21*k);c.globalAlpha=1}
 const sink=swim?10:0,dx=x-W/2,dy=y-GROUND*S-lift-bob+sink;
 c.save();if(swim){c.beginPath();c.rect(dx-4,dy-4,W+8,(y-6)-(dy-4));c.clip()}
 if(f.flip){c.translate(x,0);c.scale(-1,1);c.translate(-x,0)}
 c.drawImage(image,f.col*CW,f.row*CH,CW,CH,dx,dy,W,H);
 c.restore();
 if(swim){const wl=y-6;c.lineWidth=1.4;for(let i=0;i<2;i++){const ph=(t*.8+i*.5+u.id*.13)%1;c.strokeStyle=`rgba(226,241,248,${(.55*(1-ph)).toFixed(3)})`;c.beginPath();c.ellipse(x,wl,16+ph*20,4+ph*5,0,0,Math.PI*2);c.stroke()}c.fillStyle='rgba(120,170,190,.22)';c.beginPath();c.ellipse(x,wl,22,4.5,0,0,Math.PI*2);c.fill()}
 if(selected){c.strokeStyle='#efdaa2';c.lineWidth=1.6;c.beginPath();c.ellipse(x,y,24,8,0,0,Math.PI*2);c.stroke()}
 c.restore();return true}
function icon(){return A.src(ICON)}
A.unit=(c,u,t,selected)=>u?.kind==='ant'?draw(c,u,t,selected):baseUnit(c,u,t,selected);
A.measure=kind=>kind==='ant'?{width:Math.round(W*.75),height:Math.round(H*.8)}:baseMeasure(kind);
A.icon=kind=>kind==='ant'?icon():baseIcon(kind);
window.KingdomAntArt={load,status:()=>({frame:last&&{row:last.row,col:last.col,flip:last.flip},requested:!!loading,loaded:!!image,bytes:image?image.width*image.height*4:0})};
})();
