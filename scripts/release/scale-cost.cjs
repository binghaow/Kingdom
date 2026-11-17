#!/usr/bin/env node
'use strict';
/* Release check (f, P1): 1000 units / 8 sides simulation benchmark (scripts/perf/scale-1000.cjs: 5 nations - the seat maximum - x 200
   units on coast_l, armies in 8 battle groups, AI on), median of several runs, plus the replay consistency check (standard
   recordings replayed 3 times; checksums must match each other and the recorded game).
   The 1000-unit numbers are expected to be over the scale-target.md budget until P5: they are reported as INFO/WARN, never FAIL.
   usage: node scripts/release/scale-cost.cjs [--quick] [--json out.json] */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{ROOT,node,median,r2,args}=require('./lib.cjs');
async function replays(quick){const {loadK,loadReplay,FIXTURES}=require(path.join(ROOT,'scripts/replay/lib.cjs')),K=loadK(),R=await loadReplay();
  const files=fs.readdirSync(FIXTURES).filter(f=>f.endsWith('.json')).sort().slice(0,quick?2:undefined),rows=[];
  for(const f of files){const data=JSON.parse(fs.readFileSync(path.join(FIXTURES,f),'utf8')),runs=[0,1,2].map(()=>R.runReplay(K,data));
    const same=runs.every(r=>!R.firstDifference(r.checksums,runs[0].checksums)),matches=!R.firstDifference(runs[0].checksums,data.checksums);
    rows.push({replay:f.replace(/\.json$/,''),steps:data.steps,commands:data.commands.length,checksums:data.checksums.length,same,matchesRecorded:matches,final:runs[0].final.hash,recorded:data.final.hash,resultMismatch:runs[0].results.mismatch.length})}
  return rows}
async function run({quick=false}={}){const reps=quick?1:3,steps=quick?400:600,runs=[];
  for(let i=0;i<reps;i++){const out=path.join(os.tmpdir(),`kingdom-scale-${process.pid}-${i}.json`);node(path.join(ROOT,'scripts/perf/scale-1000.cjs'),[String(steps),out]);runs.push(JSON.parse(fs.readFileSync(out,'utf8')));fs.rmSync(out,{force:true})}
  const m=k=>r2(median(runs.map(r=>r[k])));
  const sim={units:runs[0].unitsStart,nations:runs[0].nations,sides:runs[0].sides,note:runs[0].groupsNote,steps,reps,meanMs:m('meanMs'),p50:m('p50'),p95:m('p95'),max:m('max'),over40:m('over40'),over40Steady:m('over40Steady'),maxSteady:m('maxSteady'),over16:m('over16'),checksums:runs.map(r=>r.checksum),deterministic:runs.every(r=>r.checksum===runs[0].checksum)};
  return {sim,replays:await replays(quick)}}
module.exports={run};
if(require.main===module){const a=args();run({quick:!!a.quick}).then(r=>{if(a.json)fs.writeFileSync(a.json,JSON.stringify(r,null,1));console.log(JSON.stringify(r,null,1))}).catch(e=>{console.error(e);process.exit(1)})}
