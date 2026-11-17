#!/usr/bin/env node
'use strict';
/* Release check (e, v44): late-game load, about 400-440 units. (1) Node: scripts/perf/late-game.cjs (four nations x ~110 units on
   coast_l, AI on, fixed command script) step mean/p50/p95 over 600 steps, median of several runs. (2) Browser: scripts/perf/late-render.cjs
   (real game, 1920x1080, four armies fighting on screen) frame interval, sim.tick per step, ?perf=1 HUD render/update and per-frame Canvas
   counts (drawImage, save, getImageData). Headless Chromium has no GPU: browser numbers compare commits on this machine only.
   usage: node scripts/release/late-cost.cjs [--quick] [--json out.json] */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{ROOT,node,median,r1,r2,args}=require('./lib.cjs');
async function run({quick=false}={}){const reps=quick?2:3,steps=quick?400:600,runs=[];
  for(let i=0;i<reps;i++){const out=path.join(os.tmpdir(),`kingdom-late-${process.pid}-${i}.json`);node(path.join(ROOT,'scripts/perf/late-game.cjs'),[String(steps),out]);runs.push(JSON.parse(fs.readFileSync(out,'utf8')));fs.rmSync(out,{force:true})}
  const m=k=>r2(median(runs.map(r=>r[k]))),sim={units:runs[0].prints[0]?.units??runs[0].units,steps,reps,meanMs:m('meanMs'),p50:m('p50'),p95:m('p95'),max:m('max'),over40:m('over40'),over25:m('over25'),fingerprint:runs[0].prints.at(-1)?.hash};
  let browser;try{const {run:render}=require(path.join(ROOT,'scripts/perf/late-render.cjs')),rows=[];for(let i=0;i<(quick?1:2);i++)rows.push(await render({secs:quick?8:10}));
    if(rows[0].skipped)browser={skipped:rows[0].skipped};else{const b=k=>r1(median(rows.map(r=>r[k]))),h=(k,j)=>r1(median(rows.map(r=>r[k][j]).filter(Number.isFinite)));
      browser={viewport:rows[0].viewport,units:rows[0].setup.units,unitsAlive:b('unitsAlive'),frames:rows.map(r=>r.frames),fps:b('fps'),frameP50:b('frameP50'),frameP95:b('frameP95'),simP50:b('simP50'),simP95:b('simP95'),renderP50:h('hudRender',0),renderP95:h('hudRender',1),updateP50:h('hudUpdate',0),updateP95:h('hudUpdate',1),drawImagePerFrame:b('drawImagePerFrame'),savePerFrame:b('savePerFrame'),getImageDataPerFrame:b('getImageDataPerFrame'),errors:rows.flatMap(r=>r.errors)}}}
  catch(e){browser={skipped:String(e.message||e).slice(0,300)}}
  return {sim,browser}}
module.exports={run};
if(require.main===module){const a=args();run({quick:!!a.quick}).then(r=>{if(a.json)fs.writeFileSync(a.json,JSON.stringify(r,null,1));console.log(JSON.stringify(r,null,1))}).catch(e=>{console.error(e);process.exit(1)})}
