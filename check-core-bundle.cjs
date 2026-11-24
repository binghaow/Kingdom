#!/usr/bin/env node
'use strict';
/* P1 bundle checks. Default: public/kingdom-core.js is up to date with src/ (esbuild rebuild in memory), index.html loads it with
   exactly one <script> after the simulation scripts and before the UI, and the bundle - evaluated in a VM whose window.KingdomSim is
   the real simulation (public/network-model.js) - installs window.KingdomCore, records a new game and replays it identically.
   --dist: the same on the build output dist/client (used by check-artifact.cjs). */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const dist=process.argv.includes('--dist'),ROOT=__dirname,dir=path.join(ROOT,dist?'dist/client':'public');
const {build}=require('./scripts/build-core.cjs');
const file=path.join(dir,'kingdom-core.js');assert(fs.existsSync(file),'missing '+path.relative(ROOT,file));
const code=fs.readFileSync(file,'utf8');assert.equal(code,build().code,path.relative(ROOT,file)+' is stale: run npm run build');
// P4 4c-1: the simulation worker bundle (?simWorker=1) must be rebuilt whenever src/sim or a public/ simulation script changes.
{const {buildWorker}=require('./scripts/build-core.cjs'),wf=path.join(dir,'sim-worker.js');assert(fs.existsSync(wf),'missing '+path.relative(ROOT,wf));assert.equal(fs.readFileSync(wf,'utf8'),buildWorker().code,path.relative(ROOT,wf)+' is stale: run npm run build')}
const html=fs.readFileSync(path.join(dir,'index.html'),'utf8'),scripts=[...html.matchAll(/<script src="([^"]+)"/g)].map(m=>m[1]);
assert.equal(scripts.filter(s=>s==='kingdom-core.js').length,1,'index.html must load kingdom-core.js exactly once');
const at=scripts.indexOf('kingdom-core.js');assert(at>scripts.indexOf('network-model.js')&&at>scripts.indexOf('network-client.js'),'kingdom-core.js must follow the simulation scripts');assert(at<scripts.indexOf('expansion.js'),'kingdom-core.js must precede expansion.js (it creates the first game)');
assert(!/\bimport\s*\(|^\s*import\s|^\s*export\s/m.test(code),'bundle must be a classic script (no ES module syntax left)');
// Evaluate the bundle against the real simulation through the window.KingdomSim bridge.
const K={...require(path.join(ROOT,'public/network-model.js'))},Base=K.Sim,win={KingdomSim:K,location:{search:'?replay=1'}};win.window=win;
vm.runInNewContext(code,{window:win,globalThis:win,URLSearchParams,Blob:undefined,console,setTimeout,Math,JSON,Object,Array,Map,Set,Number,String,Error,Date});
const C=win.KingdomCore;assert(C&&C.installed&&C.version===1,'bundle did not install window.KingdomCore');assert.notEqual(K.Sim,Base);assert.equal(K.Sim.Base,Base);
const sim=new K.Sim('normal',null,{nations:['britain','france'],mapId:'coast_s',seed:4242});C.replay.prewarm(sim);assert(C.replay.current&&C.replay.current.sim===sim,'new game is not recorded');
const town=sim.s.buildings.find(b=>b.team===0&&b.kind==='town'),vill=sim.s.units.filter(u=>u.team===0&&u.kind==='villager');
for(let i=0;i<200;i++){if(i===5)sim.train(town,'villager');if(i===10)sim.order(vill.slice(0,2),{type:'move',x:town.x+160,y:town.y+60});if(i===40)sim.research(town,'age');sim.tick(.05)}
const rec=C.replay.export();assert.equal(rec.steps,200);assert.equal(rec.commands.length,3,'expected 3 player commands, got '+JSON.stringify(rec.commands.map(c=>c.m)));assert.equal(rec.commands.map(c=>c.s).join(),"5,10,40");
const again=C.replay.run(JSON.parse(JSON.stringify(rec)));assert.equal(again.final.hash,rec.final.hash,'replay final checksum differs');assert.equal(JSON.stringify(again.checksums),JSON.stringify(rec.checksums));assert.equal(again.results.mismatch.length,0);
const saved=new K.Sim('normal',sim.s);assert.equal(C.replay.current.sim,sim,'saved games must not start a recording');void saved;
console.log(`PASS core bundle (${dist?'dist':'public'}): up to date with src/, one <script> between sim and UI, KingdomCore bridge records and replays (${rec.checksums.length} checksums, final ${rec.final.hash})`);
