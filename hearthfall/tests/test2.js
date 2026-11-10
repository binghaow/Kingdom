const {chromium}=require('playwright');
(async()=>{
  const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push('PAGEERR '+e.message));
  await p.goto('file://'+(process.env.GAME||__dirname+'/game.html'));
  await p.click('#bStart');await p.waitForTimeout(300);
  // box select villagers
  const pos=await p.evaluate(()=>{const us=units.filter(u=>u.team===0);const a=w2s(us[0].x-60,us[0].y-60),c=w2s(us[0].x+60,us[0].y+40);const r=cv.getBoundingClientRect();return {x0:r.left+a.x,y0:r.top+a.y,x1:r.left+c.x,y1:r.top+c.y};});
  await p.mouse.move(pos.x0,pos.y0);await p.mouse.down();await p.mouse.move(pos.x1,pos.y1,{steps:5});await p.mouse.up();
  // right-click nearest tree
  const tp=await p.evaluate(()=>{const u=units.find(x=>x.team===0);let best=null,bd=1e9;for(const r of ress)if(r.type==='tree'){const d=Math.hypot(r.x-u.x,r.y-u.y);if(d<bd){bd=d;best=r;}}const s=w2s(best.x,best.y),rc=cv.getBoundingClientRect();return {x:rc.left+s.x,y:rc.top+s.y,sel:sel.length};});
  console.log('selected',tp.sel);
  await p.mouse.click(tp.x,tp.y,{button:'right'});
  await p.keyboard.press('q'); // house
  const hp=await p.evaluate(()=>{const tc=T[0].tc;const s=w2s(tc.x+110,tc.y+20),rc=cv.getBoundingClientRect();return {x:rc.left+s.x,y:rc.top+s.y,mode:JSON.stringify(mode)};});
  console.log(hp.mode);
  await p.mouse.move(hp.x,hp.y);await p.mouse.click(hp.x,hp.y);
  await p.waitForTimeout(100);
  // select TC and train
  await p.evaluate(()=>setSel([T[0].tc]));await p.waitForTimeout(300);
  await p.keyboard.press('q');await p.keyboard.press('q');
  await p.evaluate(()=>{for(let i=0;i<30*40;i++)step(STEP);});
  await p.waitForTimeout(400);
  console.log(await p.evaluate(()=>JSON.stringify({blds:blds.filter(b=>b.team===0).map(b=>b.type+(b.done?'':'*')),pop:T[0].pop,res:[T[0].food,T[0].wood]})));
  await p.screenshot({path:(process.env.SHOT||'shot2.png')});
  console.log(errs.join('\n')||'no page errors');
  await b.close();
})();
