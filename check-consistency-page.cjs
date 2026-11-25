#!/usr/bin/env node
'use strict';
/* Device consistency check page (public/consistency.html, docs/device-consistency-check.md), part of check-all:
   1. the page loads exactly the simulation chain index.html loads (engine.js ... network-model.js), art-profiles.js (siege.js reads
      building footprints from it, so it is simulation state), then kingdom-core.js;
   2. Node: every standard recording in public/consistency/ replays to the answer key consistency/expected.json (every 20-step checksum
      AND its parts), and the recording's own checksums equal the key - so the key is what the page must reproduce;
   3. Chromium (Playwright): the page, served like the site, replays all recordings with the browser's own simulation code and shows
      "all consistent" with no page errors. --no-browser skips 3 (e.g. on a machine without Playwright).
   Regenerate the recordings/key only when gameplay changes on purpose: node scripts/replay/make-device-fixtures.cjs. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{loadK,loadReplay,loadHash}=require('./scripts/replay/lib.cjs');
const ROOT=__dirname,PUB=path.join(ROOT,'public'),DIR=path.join(PUB,'consistency');
const scripts=html=>[...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m=>m[1]);
(async()=>{
  const index=scripts(fs.readFileSync(path.join(PUB,'index.html'),'utf8')),page=scripts(fs.readFileSync(path.join(PUB,'consistency.html'),'utf8'));
  const simChain=index.slice(index.indexOf('kingdom-spatial.js'),index.indexOf('network-model.js')+1);// P4 4a / P5: kingdom-spatial.js (spatial service) and kingdom-commands.js (the command interface) precede engine.js
  assert(simChain.length>5,'could not find the simulation chain in index.html');
  assert.deepEqual(page.slice(0,simChain.length),simChain,'consistency.html must load the same simulation scripts as index.html, in the same order');
  assert.deepEqual(page.slice(simChain.length),['art-profiles.js','kingdom-core.js','consistency.js'],'consistency.html must load art-profiles.js (read by siege.js), kingdom-core.js, consistency.js after the simulation');assert(index.includes('art-profiles.js'),'index.html loads art-profiles.js');
  assert(!/consistency/.test(fs.readFileSync(path.join(PUB,'index.html'),'utf8')),'the game UI must not link the consistency page');
  console.log(`PASS consistency.html loads the ${simChain.length}-script simulation chain of index.html + art-profiles.js + kingdom-core.js`);

  const K=loadK(),R=await loadReplay(),{checksum}=await loadHash(),key=JSON.parse(fs.readFileSync(path.join(DIR,'expected.json'),'utf8'));
  assert.equal(key.format,'kingdom-consistency-answers');assert(key.recordings.length>=2&&key.recordings.length<=3,'2-3 standard recordings');
  const methods=new Set();
  for(const rec of key.recordings){const data=JSON.parse(fs.readFileSync(path.join(DIR,rec.file),'utf8')),secs=data.steps*data.step;
    assert(secs>=30&&secs<=60,`${rec.name}: ${secs} s, want 30-60 s`);data.commands.forEach(c=>c.m&&methods.add(c.m));
    const parts=[],r=R.runReplay(K,data,{onStep:(sim,step)=>{if(step%data.every===0)parts.push(checksum(sim).parts)}});
    assert.equal(r.results.mismatch.length,0,`${rec.name}: command results differ in Node replay`);
    assert.equal(r.checksums.length,rec.checksums.length,`${rec.name}: checkpoint count`);
    r.checksums.forEach((c,i)=>{const want=rec.checksums[i];assert.equal(c.step,want.step);assert.equal(c.hash,want.hash,`${rec.name}: Node replay differs from expected.json at step ${c.step} - if gameplay changed on purpose, regenerate with node scripts/replay/make-device-fixtures.cjs`);assert.deepEqual(parts[i],want.parts,`${rec.name}: parts at step ${c.step}`)});
    assert(!R.firstDifference(data.checksums,rec.checksums.map(c=>({step:c.step,hash:c.hash}))),`${rec.name}: recording checksums differ from the answer key`);
    assert.equal(r.final.hash,rec.final.hash,`${rec.name}: final`);assert.equal(data.final.hash,rec.final.hash,`${rec.name}: recorded final`);
    console.log(`PASS ${rec.name}: ${data.steps} steps (${secs} s), ${data.commands.length} commands, ${rec.checksums.length} checkpoints, Node replay = answer key = recording (final ${rec.final.hash})`)}
  for(const m of ['add','order','construct','constructLine','train','research'])assert(methods.has(m),`recordings should cover ${m}`);

  if(process.argv.includes('--no-browser')){console.log('SKIP browser run (--no-browser)');return}
  let chromium;try{({chromium}=require('playwright'))}catch(e){throw Error('playwright is required for the browser half of this check (or pass --no-browser): '+e.message)}
  const {serve}=require('./scripts/release/render-cost.cjs'),server=await serve(),port=server.address().port;
  const browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
  try{for(const profile of [{name:'phone portrait',ctx:{viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true}},{name:'desktop',ctx:{viewport:{width:1280,height:800}}}]){
    const ctx=await browser.newContext(profile.ctx),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
    const t=Date.now();await p.goto(`http://127.0.0.1:${port}/consistency.html`);await p.waitForFunction(()=>window.__consistency&&window.__consistency.done,null,{timeout:240000,polling:250});
    const st=await p.evaluate(()=>window.__consistency),text=await p.textContent('#overall'),fits=await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1);
    assert.deepEqual(errors,[],`${profile.name}: page errors`);
    assert(st.ok,`${profile.name}: page reports a mismatch: ${JSON.stringify(st.recordings.map(r=>({name:r.name,ok:r.ok,firstDiff:r.firstDiff,error:r.error})))} ${st.error||''}`);
    assert(/全部一致/.test(text)&&/All consistent/.test(text),`${profile.name}: big result text: ${text}`);
    assert.equal(st.recordings.length,key.recordings.length);assert(fits,`${profile.name}: horizontal scroll`);
    if(profile.ctx.isMobile){await ctx.grantPermissions(['clipboard-read','clipboard-write']).catch(()=>{});await p.click('#copy');await p.waitForFunction(()=>document.getElementById('copied').textContent.length>0,null,{timeout:5000});assert(/复制|copy/i.test(await p.textContent('#copied')),'copy button feedback')}
    console.log(`PASS Chromium ${profile.name}: consistency.html shows all ${st.recordings.length} recordings consistent (${st.recordings.map(r=>r.name+' '+r.ms+' ms').join(', ')}; page ${Date.now()-t} ms)`);
    await ctx.close()}}
  finally{await browser.close();server.close()}
})().catch(e=>{console.error('FAIL '+(e&&e.message||e));process.exitCode=1});
