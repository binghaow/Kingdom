#!/usr/bin/env node
'use strict';
/* Release check (b): single-player simulation step cost at 50/100/200/400 units. Runs the existing
   scripts/perf/sim-scaling.cjs several times and keeps the per-field median (Node timings are noisy on a shared machine).
   Growth exponent k in cost ~ units^k between the smallest and largest army: 1 = linear, 2 = quadratic.
   usage: node scripts/release/sim-cost.cjs [--quick] [--json out.json] */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{ROOT,node,medianOf,r2,args}=require('./lib.cjs');
const PARTS={separateCrowd:'collision',acquireAutoTarget:'targeting',findPath:'pathfinding',updateFog:'fog',ai:'ai',other:'other'};
function run({quick=false}={}){const reps=quick?2:3,steps=quick?160:240,counts='50,100,200,400',runs=[];
  for(let i=0;i<reps;i++){const out=path.join(os.tmpdir(),`kingdom-sim-scaling-${process.pid}-${i}.json`);node(path.join(ROOT,'scripts/perf/sim-scaling.cjs'),[counts,String(steps),out]);runs.push(JSON.parse(fs.readFileSync(out,'utf8')));fs.rmSync(out,{force:true})}
  const rows=medianOf(runs).map((r,i)=>({requested:+counts.split(',')[i],units:r.units,meanMs:r2(r.meanMs),p50:r2(r.p50),p95:r2(r.p95),max:r2(r.max),...Object.fromEntries(Object.entries(PARTS).map(([k,v])=>[v,r2(r[k])])),pathCalls:r.pathCalls}));
  const a=rows[0],b=rows.at(-1),ratio=b.units/a.units,growth={};for(const k of ['meanMs','p95',...Object.values(PARTS)]){const x=Math.max(a[k],.01),y=Math.max(b[k],.01);growth[k]=r2(Math.log(y/x)/Math.log(ratio))}
  const superlinear=Object.entries(growth).filter(([k,v])=>v>1.3&&k!=='ai').map(([k,v])=>`${k} ~ units^${v}`);
  return {reps,steps,dtSec:.05,rows,growth,unitRatio:r2(ratio),superlinear}}
module.exports={run};
if(require.main===module){const a=args(),r=run({quick:!!a.quick});if(a.json)fs.writeFileSync(a.json,JSON.stringify(r,null,1));console.log(JSON.stringify(r,null,1))}
