const {chromium}=require('/opt/npm-tools/node_modules/playwright');
const PORT=process.env.PORT||8791;
async function open(opts={}){const w=opts.w||1280,h=opts.h||720,dpr=opts.dpr||1;
 const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
 const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:dpr,hasTouch:!!opts.touch,isMobile:!!opts.touch});
 const p=await ctx.newPage();p.on('pageerror',e=>console.log('PAGEERR',e.message));
 p.on('console',m=>{if(m.type()==='error'&&!/TUNNEL/.test(m.text()))console.log('CERR',m.text())});
 await p.goto('http://127.0.0.1:'+PORT+'/'+(opts.query||'?perf=1'));
 await p.waitForFunction(()=>window.KingdomArt&&KingdomArt.loaded,null,{timeout:60000});
 await p.evaluate(()=>{const P=KingdomSim.Sim.prototype,t=P.tick;P.tick=function(...a){window.__sim=this;return t.apply(this,a)}});
 await p.click('#start');await p.waitForTimeout(1500);return{b,p}}
module.exports={open};
// Scene helpers (run in page). Spawns units around camera centre, disables AI, keeps only requested units.
async function scene(p,spec){return p.evaluate(spec=>{const sim=window.__sim,s=sim.s||sim.state;sim.ai=()=>{};sim.raids=()=>{};s.ages=[5,5];s.units=[];s.effects=[];s.nodes=[];s.wildCamps=[];
 const base=s.buildings.find(b=>b.team===0&&b.kind==='town'),cx=window.__cx??(base.x+80),cy=window.__cy??(base.y-80),out=[];if(!window.__moved&&!spec.keepBuildings){window.__moved=1;for(const b of s.buildings){b.y+=1100;b.x+=1500}}
 for(const u of spec.units){const e=sim.add(u.kind,u.team,cx+u.x,cy+u.y,u.extra||{});if(u.hp){e.hp=e.maxhp=u.hp}out.push(e.id)}
 if(spec.attack)for(const [a,b] of spec.attack){const A=sim.byId(out[a]),B=sim.byId(out[b]);sim.order([A],{type:'attack',id:B.id})}
 window.__cx=cx;window.__cy=cy;window.__ids=out;return out},spec)}
async function zoom(p,z){await p.evaluate(z=>{const c=document.getElementById('world');const n=Math.round(Math.log(z/window.frontier.camera.z)/Math.log(1.1));for(let i=0;i<Math.abs(n);i++)c.dispatchEvent(new WheelEvent('wheel',{deltaY:n>0?-1:1,bubbles:true,cancelable:true}))},z)}
module.exports.scene=scene;module.exports.zoom=zoom;
// In-page frame-exact strip capture of the world canvas centre region.
async function strip(p,{w=300,h=240,dx=0,dy=-30,interval=80,count=12,cols=6,file}){
 const url=await p.evaluate(async({w,h,dx,dy,interval,count,cols})=>{const cv=document.getElementById('world');const out=document.createElement('canvas');const rows=Math.ceil(count/cols);out.width=w*cols;out.height=h*rows;const g=out.getContext('2d');const sx=cv.width/cv.clientWidth;let n=0,last=-1e9;
  await new Promise(res=>{function f(now){if(now-last>=interval){const cx=cv.width/2+dx*sx,cy=cv.height/2+dy*sx;g.drawImage(cv,cx-w*sx/2,cy-h*sx/2,w*sx,h*sx,(n%cols)*w,Math.floor(n/cols)*h,w,h);g.fillStyle='#000a';g.fillRect((n%cols)*w,Math.floor(n/cols)*h,64,16);g.fillStyle='#fff';g.font='11px monospace';g.fillText('#'+n+' '+(window.__sim.s||window.__sim.state).time.toFixed(2),(n%cols)*w+3,Math.floor(n/cols)*h+12);last=now;n++}if(n<count)requestAnimationFrame(f);else res()}requestAnimationFrame(f)});return out.toDataURL('image/png')},{w,h,dx,dy,interval,count,cols});
 require('fs').writeFileSync(file,Buffer.from(url.split(',')[1],'base64'))}
module.exports.strip=strip;
