const {chromium,devices}=require('playwright');
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({...devices['iPhone 17']});const p=await ctx.newPage();
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+process.env.GAME);await p.tap('#bStart');await p.waitForTimeout(500);
  // select villagers, build house via touch flow
  await p.evaluate(()=>setSel(units.filter(u=>u.team===0).slice(0,2)));await p.waitForTimeout(300);
  await p.tap('#cmds button[data-id="build:house"]');await p.waitForTimeout(100);
  const r1=await p.evaluate(()=>({mode:mode&&mode.type,ghost:hoverTile}));
  await p.tap('[data-ok]');await p.waitForTimeout(200);
  await p.evaluate(()=>{for(let i=0;i<5;i++)step(STEP)});
  const r2=await p.evaluate(()=>({blds:blds.filter(b=>b.team===0).length,cmds:cmdLog.length}));
  // group chip: assign then recall
  await p.evaluate(()=>setSel(units.filter(u=>u.team===0).slice(0,2)));
  await p.tap('[data-gk="1"]');await p.evaluate(()=>setSel([]));await p.tap('[data-gk="1"]');
  const r3=await p.evaluate(()=>sel.length);
  // menu save/load
  await p.tap('#bMenu');await p.tap('#mSave');await p.tap('#mLoad');await p.waitForTimeout(200);
  const r4=await p.evaluate(()=>({paused:G.paused,menuHidden:$('pmenu').hidden,units:units.length}));
  // autofarm reseed
  const r5=await p.evaluate(()=>{T[0].autoFarm=true;T[0].wood=500;const tc=T[0].tc;const f=placeBuilding(0,'farm',tc.tx-4,tc.ty+4,[units.find(u=>u.team===0)]);for(let i=0;i<30*40;i++)step(STEP);f.amt=1;const n0=blds.filter(b=>b.type==='farm'&&b.team===0).length;for(let i=0;i<30*40;i++)step(STEP);return {farmDone:f.done,n0,n1:blds.filter(b=>b.type==='farm'&&b.team===0&&!b.dead).length,wood:T[0].wood|0}});
  console.log(JSON.stringify({r1,r2,r3,r4,r5}),errs.join('|')||'no errors');
  await b.close();
})();
