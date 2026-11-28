#!/usr/bin/env node
'use strict';
/* Desktop mouse rules + building groups (feature/controls-groups), in the real page (headless Chromium, playwright).
   Mouse (pointerType mouse):
     - left click on empty ground with a villager selected: NO order, selection cleared;
     - right click on empty ground: a move order (the existing smart command);
     - A + left click: attack-move ('advance'); right click on an enemy: attack; H: hold;
     - right click in build mode cancels it, left click previews the placement.
   Buildings:
     - box over buildings only selects buildings; a box with units and buildings selects only the units;
     - double click on a barracks selects the barracks on screen; Ctrl+1 stores them, 1 brings them back;
     - five Train presses with five barracks selected: one queue entry in each (shortest queue, rotating ties);
     - right click on the ground with five barracks selected: one rally command per barracks, all to that point.
   Touch (hasTouch, pointerType touch): tap on ground with a villager selected still moves (unchanged); long press on a barracks
   selects the same-type buildings on screen; the group bar's Assign + number stores/recalls them.
   Every simulation change is observed at the command entry points (sim.order / sim.train / sim.setRally) of the instance.
   Also checks the pure helpers in src/ui/controls.js.
   usage: node check-mouse-controls.cjs [--headed] */
const path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const ROOT=__dirname;process.env.KINGDOM_ROOT=ROOT;
const {serve}=require(path.join(ROOT,'scripts/release/render-cost.cjs'));
const HOOK=()=>{let v;Object.defineProperty(window,'NavalUI',{configurable:true,get(){return v},set(x){const b=x.bind;x.bind=a=>{window.__api=a;return b.call(x,a)};v=x}})};
const done=[];const ok=(name)=>{done.push(name);console.log('  ok '+name)};

/* page helpers (installed once per page) */
const PAGE_SETUP=()=>{
  const sim=__api.getSim(),s=sim.state,K=KingdomSim,A=KingdomArt;
  // This is an input/queue-routing fixture, not a timed simulation test. Keep positions and queues stable between gestures:
  // moving villagers can re-enter the "buildings only" box, and production/AI can issue unrelated orders during clicks.
  // The live page, renderer, event handlers, command methods and all input assertions remain in use.
  sim.tick=()=>{};sim.ai=()=>{};sim.raids=()=>{};
  window.__log=[];for(const m of ['order','train','setRally']){const f=sim[m].bind(sim);sim[m]=(...a)=>{__log.push(m==='order'?[m,a[1]?.type,a[0].map(u=>u.id)]:m==='train'?[m,a[0].id,a[1]]:[m,a[0].id,a[1]&&{x:Math.round(a[1].x),y:Math.round(a[1].y)}]);return f(...a)}}
  Object.assign(s.resources[0],{food:99999,wood:99999,gold:99999,stone:99999});
  const town=s.buildings.find(b=>b.team===0&&b.kind==='town');
  const spot=(kind,taken)=>{for(let r=260;r<900;r+=30)for(let k=0;k<24;k++){const a=k*Math.PI/12+r/97,x=town.x+Math.cos(a)*r,y=town.y+Math.sin(a)*r;if(taken.some(t=>Math.hypot(t.x-x,t.y-y)<190))continue;if(!sim.placementError(kind,x,y,0))return {x,y}}return null};
  /* test fixture: five finished barracks next to each other (Sim.add, as the tutorial does) */
  s.buildings=s.buildings.filter(b=>!(b.team===0&&b.kind==='barracks'));
  const taken=[],ids=[];for(let i=0;i<5;i++){const p=spot('barracks',taken);taken.push(p);const b=sim.add('barracks',0,p.x,p.y);b.complete=true;b.progress=1;b.hp=b.maxhp;ids.push(b.id)}
  const bs=ids.map(id=>sim.byId(id)),c={x:bs.reduce((n,b)=>n+b.x,0)/5,y:bs.reduce((n,b)=>n+b.y,0)/5};
  __api.zoom(.6);__api.focusPoint(c);
  window.__barracks=ids;
  window.__toScreen=w=>{const cam=frontier.camera,cv=document.getElementById('world'),r=cv.getBoundingClientRect();return {x:r.left+(w.x-cam.x)*cam.z+r.width/2,y:r.top+(w.y-cam.y)*cam.z+r.height/2}};
  window.__inView=w=>{const cv=document.getElementById('world').getBoundingClientRect(),p=__toScreen(w);return p.x>cv.left+40&&p.x<cv.right-40&&p.y>cv.top+60&&p.y<cv.bottom-60&&document.elementFromPoint(p.x,p.y)?.id==='world'};
  window.__free=(near,minD=110)=>{const all=[...s.units,...s.buildings,...s.nodes,...(s.landmarks||[])];for(let r=0;r<900;r+=25)for(let k=0;k<16;k++){const a=k*Math.PI/8,x=near.x+Math.cos(a)*r,y=near.y+Math.sin(a)*r,w={x,y};if(!__inView(w)||K.isWater?.(x,y)||K.isOcean?.(x,y))continue;if(all.every(e=>Math.hypot(e.x-x,e.y-y)>minD+(K.defs[e.kind]?.r||20)&&!A.hitEntity?.(e,w,4)))return w}return null};
  window.__hitPoint=e=>{const others=[...s.units,...s.buildings,...s.nodes].filter(o=>o!==e&&Math.hypot(o.x-e.x,o.y-e.y)<260);for(let dy=-50;dy<=20;dy+=5)for(const dx of [0,-8,8,-16,16]){const p={x:e.x+dx,y:e.y+dy};if(A.hitEntity?.(e,p,0)&&__inView(p)&&!others.some(o=>A.hitEntity?.(o,p,2)))return p}return null};
  return {barracks:ids.length,center:c};
};

async function mousePage(browser,port){
  const ctx=await browser.newContext({viewport:{width:1280,height:720}}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await ctx.addInitScript(HOOK);const until=(fn,arg,ms=30000)=>p.waitForFunction(fn,arg,{timeout:ms,polling:100});
  await p.goto(`http://127.0.0.1:${port}/`);await until(()=>window.KingdomArt&&KingdomArt.loaded&&!document.getElementById('start').disabled,null,120000);
  await p.evaluate(()=>{try{localStorage.clear()}catch{}});await p.click('#start');await until(()=>window.__api&&frontier.state.time>0.3);
  const mouseOK=await p.evaluate(()=>matchMedia('(hover:hover) and (pointer:fine)').matches);assert(mouseOK,'desktop context should report a fine hovering pointer');
  const setup=await p.evaluate(PAGE_SETUP);assert.equal(setup.barracks,5);await p.waitForTimeout(300);
  const log=()=>p.evaluate(()=>__log.splice(0));const clickAt=async(w,opt={})=>{const q=await p.evaluate(w=>__toScreen(w),w);await p.mouse.click(q.x,q.y,opt);await p.waitForTimeout(120)};

  /* a villager in view next to free ground */
  const v=await p.evaluate(()=>{const s=frontier.state,b=s.buildings.find(b=>b.id===__barracks[0]);const u=s.units.filter(u=>u.team===0&&u.kind==='villager').sort((a,c)=>Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(c.x-b.x,c.y-b.y))[0];
    /* test fixture: bring one idle villager into view */u.x=b.x+150;u.y=b.y+170;u.order=null;__api.selectIds([u.id]);return {id:u.id,x:u.x,y:u.y}});
  let ground=await p.evaluate(v=>__free({x:v.x+60,y:v.y},90),v);assert(ground,'no free ground in view');
  await log();await clickAt(ground);
  let l=await log(),sel=await p.evaluate(()=>frontier.selected);
  assert.equal(l.filter(x=>x[0]==='order').length,0,'left click on ground must not order: '+JSON.stringify(l));assert.deepEqual(sel,[],'left click on empty ground clears the selection');
  ok('mouse left click on empty ground: no order, selection cleared');

  await p.evaluate(v=>__api.selectIds([v.id]),v);await clickAt(ground,{button:'right'});l=await log();
  assert(l.some(x=>x[0]==='order'&&x[1]==='move'&&x[2].includes(v.id)),'right click on ground moves: '+JSON.stringify(l));
  ok('mouse right click on ground: move order (smart command)');

  await p.evaluate(v=>__api.selectIds([v.id]),v);await p.keyboard.down('a');const camBefore=await p.evaluate(()=>frontier.camera.x);await p.waitForTimeout(200);
  const camAfter=await p.evaluate(()=>frontier.camera.x);await clickAt(ground);await p.keyboard.up('a');l=await log();
  assert(l.some(x=>x[0]==='order'&&x[1]==='advance'),'A + left click attack-moves: '+JSON.stringify(l));assert.equal(Math.round(camAfter),Math.round(camBefore),'holding A to aim does not pan the camera');
  ok('A + left click: attack-move, camera stays still while A is held');

  /* enemy unit: right click attacks, left click only selects it */
  const foe=await p.evaluate(g=>{/* test fixture: an enemy house (does not walk away between clicks) */const sim=__api.getSim(),c=frontier.camera,w=__free({x:c.x,y:c.y-60},120)||g,e=sim.add('house',1,w.x,w.y);e.complete=true;e.progress=1;e.hp=e.maxhp;return {id:e.id}},ground);
  await p.evaluate(v=>__api.selectIds([v.id]),v);await p.waitForTimeout(150);
  const foePt=await p.evaluate(id=>__hitPoint(frontier.state.buildings.find(u=>u.id===id)),foe.id);assert(foePt,'enemy not clickable in view');
  await clickAt(foePt);l=await log();sel=await p.evaluate(()=>frontier.selected);assert.equal(l.filter(x=>x[0]==='order').length,0,'left click on an enemy does not order');assert.deepEqual(sel,[foe.id]);
  await p.evaluate(v=>__api.selectIds([v.id]),v);await clickAt(foePt,{button:'right'});l=await log();
  assert(l.some(x=>x[0]==='order'&&x[1]==='attack'),'right click on an enemy attacks: '+JSON.stringify(l));
  await p.keyboard.press('h');l=await log();assert(l.some(x=>x[0]==='order'&&x[1]==='hold'),'H holds');
  await p.evaluate(id=>{const s=frontier.state;s.buildings=s.buildings.filter(b=>b.id!==id)},foe.id);
  ok('enemy building: left click selects only, right click attacks, H holds');

  /* build mode: left click previews, right click cancels */
  await p.evaluate(v=>__api.selectIds([v.id]),v);await p.click('[data-action="build-house"]');await clickAt(ground);
  assert(await p.evaluate(()=>!document.getElementById('placement-confirm').hidden),'left click previews placement');
  await clickAt(ground,{button:'right'});assert(await p.evaluate(()=>document.getElementById('placement-confirm').hidden&&!document.querySelector('[data-action="build-house"].active')),'right click cancels build mode');
  l=await log();assert.equal(l.filter(x=>x[0]==='order').length,0);
  ok('build mode: left click previews, right click cancels');

  /* box selection rule */
  const box=await p.evaluate(()=>{const bs=__barracks.map(id=>frontier.state.buildings.find(b=>b.id===id));const xs=bs.map(b=>b.x),ys=bs.map(b=>b.y);return {a:__toScreen({x:Math.min(...xs)-30,y:Math.min(...ys)-30}),b:__toScreen({x:Math.max(...xs)+30,y:Math.max(...ys)+30}),units:frontier.state.units.filter(u=>u.team===0&&!u.embarkedOn&&u.x>=Math.min(...xs)-30&&u.x<=Math.max(...xs)+30&&u.y>=Math.min(...ys)-30&&u.y<=Math.max(...ys)+30).length}});
  if(box.units){await p.evaluate(()=>{/* test fixture: clear villagers out of the barracks box */const bs=__barracks.map(id=>frontier.state.buildings.find(b=>b.id===id)),xs=bs.map(b=>b.x),ys=bs.map(b=>b.y);for(const u of frontier.state.units)if(u.team===0&&u.x>=Math.min(...xs)-60&&u.x<=Math.max(...xs)+60&&u.y>=Math.min(...ys)-60&&u.y<=Math.max(...ys)+60){u.x=Math.max(...xs)+400;u.order=null}})}
  const drag=async(a,b,opt={})=>{await p.mouse.move(a.x,a.y);await p.mouse.down(opt);await p.mouse.move((a.x+b.x)/2,(a.y+b.y)/2,{steps:4});await p.mouse.move(b.x,b.y,{steps:4});await p.mouse.up(opt);await p.waitForTimeout(150)};
  await drag(box.a,box.b);sel=await p.evaluate(()=>frontier.selected);assert(await p.evaluate(sel=>__barracks.every(id=>sel.includes(id))&&sel.every(id=>frontier.state.buildings.some(b=>b.id===id&&b.team===0)),sel),'box with only buildings selects the buildings '+JSON.stringify(sel));
  const mix=await p.evaluate(()=>{const sim=__api.getSim(),b=frontier.state.buildings.find(b=>b.id===__barracks[0]),u=sim.add('infantry',0,b.x+70,b.y+60);u.order={type:'hold'};return {id:u.id,a:__toScreen({x:b.x-60,y:b.y-60}),b:__toScreen({x:b.x+110,y:b.y+100})}});
  await drag(mix.a,mix.b);sel=await p.evaluate(()=>frontier.selected);assert.deepEqual(sel,[mix.id],'a box with a unit and a building selects only the unit');
  await p.evaluate(id=>{frontier.state.units.find(u=>u.id===id).x+=600},mix.id);
  ok('box: units win, buildings only when no units');

  /* double click on a barracks: every barracks on screen; Ctrl+1 / 1 */
  const bPt=await p.evaluate(()=>__hitPoint(frontier.state.buildings.find(b=>b.id===__barracks[2])));assert(bPt,'barracks not clickable');
  await p.evaluate(()=>__api.selectIds([]));const q=await p.evaluate(w=>__toScreen(w),bPt);await p.mouse.dblclick(q.x,q.y);await p.waitForTimeout(150);
  sel=await p.evaluate(()=>frontier.selected);assert.deepEqual([...sel].sort(),(await p.evaluate(()=>__barracks)).slice().sort(),'double click selects every barracks on screen');
  assert.match(await p.evaluate(()=>document.getElementById('selected-name').textContent),/× 5/);
  await p.keyboard.press('Control+1');await p.evaluate(()=>__api.selectIds([]));await p.keyboard.press('1');await p.waitForTimeout(100);
  sel=await p.evaluate(()=>frontier.selected);assert.equal(sel.length,5,'group 1 recalls the five barracks');
  ok('double click selects same-type buildings; Ctrl+1 / 1 stores and recalls the building group');

  /* five Train presses: one each */
  await log();const before=await p.evaluate(()=>__barracks.map(id=>frontier.state.buildings.find(b=>b.id===id).queue.length));
  const train=await p.evaluate(()=>{const b=[...document.querySelectorAll('#actions [data-action^="train-"]')].find(x=>!x.classList.contains('unavailable'));return b?.dataset.action});assert(train,'no train button');
  for(let i=0;i<5;i++){await p.click('#actions [data-action="'+train+'"]');await p.waitForTimeout(60)}
  l=await log();const after=await p.evaluate(()=>__barracks.map(id=>frontier.state.buildings.find(b=>b.id===id).queue.length));
  assert.equal(l.filter(x=>x[0]==='train').length,5,'five train commands');assert.deepEqual(after.map((n,i)=>n-before[i]),[1,1,1,1,1],'round robin: one per barracks '+JSON.stringify({before,after}));
  for(let i=0;i<3;i++){await p.click('#actions [data-action="'+train+'"]');await p.waitForTimeout(60)}
  const after2=await p.evaluate(()=>__barracks.map(id=>frontier.state.buildings.find(b=>b.id===id).queue.length));assert(Math.max(...after2)-Math.min(...after2)<=1,'queues stay balanced '+JSON.stringify(after2));
  ok('Train with five barracks selected: shortest queue first, rotating ties ('+JSON.stringify(after2)+')');

  /* right click: one rally for all */
  await log();const rp=await p.evaluate(()=>{const b=frontier.state.buildings.find(b=>b.id===__barracks[0]);return __free({x:b.x,y:b.y+260},70)});assert(rp,'no rally ground');
  await clickAt(rp,{button:'right'});l=await log();const rallies=l.filter(x=>x[0]==='setRally');
  assert.equal(rallies.length,5,'one rally command per barracks '+JSON.stringify(l));assert.equal(new Set(rallies.map(x=>x[1])).size,5);
  const set=await p.evaluate(()=>__barracks.map(id=>frontier.state.buildings.find(b=>b.id===id).rally));assert(set.every(r=>r&&Math.abs(r.x-set[0].x)<1&&Math.abs(r.y-set[0].y)<1),'same rally point '+JSON.stringify(set));
  assert.equal(l.filter(x=>x[0]==='order').length,0);
  ok('right click with five barracks: one shared rally point');

  /* help/tutorial text for mouse */
  const text=await p.evaluate(()=>{const tr=KingdomI18nCore.translate,m=TutorialUI.mouseLessons,hint=document.getElementById('hint').textContent;return {hint,move:m.move,untranslated:[hint,...Object.values(m)].filter(t=>/[\u3400-\u9fff]/.test(tr(t,'en')))}});
  assert.match(text.hint,/右键/);assert.match(text.move,/右键/);assert.deepEqual(text.untranslated,[],'mouse hint / lesson text has English');
  ok('hint and tutorial lessons say right click on desktop (zh + en)');
  assert.deepEqual(errors,[],'page errors: '+errors.join(' | '));
  await ctx.close();
}

async function touchPage(browser,port){
  const ctx=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,hasTouch:true,isMobile:true}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await ctx.addInitScript(HOOK);const until=(fn,arg,ms=30000)=>p.waitForFunction(fn,arg,{timeout:ms,polling:100});
  await p.goto(`http://127.0.0.1:${port}/`);await until(()=>window.KingdomArt&&KingdomArt.loaded&&!document.getElementById('start').disabled,null,120000);
  await p.evaluate(()=>{try{localStorage.clear()}catch{}});await p.tap('#start');await until(()=>window.__api&&frontier.state.time>0.3);
  await p.evaluate(PAGE_SETUP);await p.waitForTimeout(300);
  /* collapse the command sheet a little so more of the battlefield is visible */
  const log=()=>p.evaluate(()=>__log.splice(0));
  const tapAt=async(w)=>{const q=await p.evaluate(w=>__toScreen(w),w);await p.touchscreen.tap(q.x,q.y);await p.waitForTimeout(150)};
  const v=await p.evaluate(()=>{const s=frontier.state,b=s.buildings.find(b=>b.id===__barracks[0]);__api.focusPoint({x:b.x,y:b.y});const u=s.units.find(u=>u.team===0&&u.kind==='villager');u.x=b.x+120;u.y=b.y+110;u.order=null;__api.selectIds([u.id]);return {id:u.id,x:u.x,y:u.y}});
  const ground=await p.evaluate(v=>__free({x:v.x+40,y:v.y},70),v);assert(ground,'no free ground in the touch view');
  await log();await tapAt(ground);const l=await log();
  assert(l.some(x=>x[0]==='order'&&x[1]==='move'&&x[2].includes(v.id)),'touch tap on ground still moves the selected villager: '+JSON.stringify(l));
  ok('touch: tap on ground with a villager selected still moves it (unchanged)');

  /* long press on a barracks: same-type buildings on screen */
  await p.evaluate(()=>{const s=frontier.state,bs=__barracks.map(id=>s.buildings.find(b=>b.id===id));__api.zoom(.3);__api.focusPoint({x:bs.reduce((n,b)=>n+b.x,0)/5,y:bs.reduce((n,b)=>n+b.y,0)/5});__api.selectIds([])});await p.waitForTimeout(200);
  const vis=await p.evaluate(()=>__barracks.filter(id=>__inView(frontier.state.buildings.find(b=>b.id===id))).length);
  const bPt=await p.evaluate(()=>{const bs=__barracks.map(id=>frontier.state.buildings.find(b=>b.id===id));for(const b of bs){const h=__hitPoint(b);if(h)return h}return null});assert(bPt,'no barracks under a finger');
  const q=await p.evaluate(w=>__toScreen(w),bPt);
  const cdp=await ctx.newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:q.x,y:q.y}]});
  try {
    await p.waitForTimeout(650);
    // Under a busy headless renderer, the page's 450 ms timer may run later than the driver's wall-clock sleep.
    // Hold the real touch until the observable long-press result, rather than lifting before the handler runs.
    await until(()=>frontier.selected.length>=2&&frontier.selected.every(id=>__barracks.includes(id)),null,5000);
  } finally { await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); }
  await p.waitForTimeout(150);
  let sel=await p.evaluate(()=>frontier.selected),allB=await p.evaluate(()=>frontier.selected.every(id=>__barracks.includes(id)));
  assert(sel.length>=2&&allB,'long press selects the same-type buildings on screen ('+sel.length+' of '+vis+' visible)');assert(sel.length>=vis,'every visible barracks is selected');
  ok('touch: long press on a barracks selects all '+sel.length+' barracks on screen');

  /* group bar: Assign + 3, then recall */
  /* taps spaced like a person (Chromium drops the click of a second tap inside its double-tap window) */const gap=()=>p.waitForTimeout(450);
  await p.tap('#group-toggle');await gap();await p.tap('#group-assign');await gap();await p.tap('#control-groups [data-group="3"]');await gap();
  await p.evaluate(()=>__api.selectIds([]));if(!(await p.evaluate(()=>document.getElementById('control-groups').classList.contains('open')))){await p.tap('#group-toggle');await gap()}
  await p.tap('#control-groups [data-group="3"]');await p.waitForTimeout(100);
  const sel2=await p.evaluate(()=>frontier.selected);assert.deepEqual([...sel2].sort(),[...sel].sort(),'touch group 3 recalls the buildings');
  ok('touch: group bar Assign + 3 stores and recalls the building group');
  /* touch train button: round robin too (same code path as the mouse) */
  await log();const train=await p.evaluate(()=>[...document.querySelectorAll('#actions [data-action^="train-"]')].find(x=>!x.classList.contains('unavailable'))?.dataset.action);
  for(let i=0;i<sel2.length;i++){await p.evaluate(a=>document.querySelector('#actions [data-action="'+a+'"]').click(),train);await p.waitForTimeout(40)}
  const t=(await log()).filter(x=>x[0]==='train');assert.equal(new Set(t.map(x=>x[1])).size,sel2.length,'touch Train presses spread over the selected buildings');
  ok('touch: Train presses spread across the selected buildings');
  assert.deepEqual(errors,[],'page errors: '+errors.join(' | '));
  await ctx.close();
}

async function main(){
  const C=await import(pathToFileURL(path.join(ROOT,'src/ui/controls.js')).href);
  assert.equal(C.mouseIntent({button:0}),'select');assert.equal(C.mouseIntent({button:0,hasUnits:true}),'select');assert.equal(C.mouseIntent({button:2,hasUnits:true}),'command');
  assert.equal(C.mouseIntent({button:0,hasUnits:true,attackKey:true}),'attack-move');assert.equal(C.mouseIntent({button:0,armed:'move',hasUnits:true}),'command');
  assert.equal(C.mouseIntent({button:2,buildMode:true}),'cancel-build');assert.equal(C.mouseIntent({button:0,buildMode:true}),'place');assert.equal(C.mouseIntent({button:1}),'none');
  assert.deepEqual(C.boxPick([1],[2]),[1]);assert.deepEqual(C.boxPick([],[2]),[2]);
  let cur=0;const bs=[{queue:[]},{queue:[]},{queue:[1]}],got=[];for(let i=0;i<4;i++){const r=C.pickProducer(bs,cur);cur=r.cursor;got.push(bs.indexOf(r.pick));r.pick.queue.push(0)}assert.deepEqual(got,[0,1,2,0]);assert.deepEqual(bs.map(b=>b.queue.length),[2,1,2]);
  assert.equal(C.pickProducer(bs,0,()=>false).pick,null);
  ok('src/ui/controls.js decision helpers');
  const {chromium}=require('playwright');const server=await serve(),port=server.address().port;
  const browser=await chromium.launch({headless:!process.argv.includes('--headed'),args:['--disable-gpu'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
  try{if(!process.argv.includes('--touch-only'))await mousePage(browser,port);await touchPage(browser,port)}finally{await browser.close();server.close()}
  console.log('PASS '+done.length+' mouse / touch control and building group checks');
}
main().catch(e=>{console.error('FAIL',e&&e.stack||e);process.exit(1)});
