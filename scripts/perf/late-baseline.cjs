#!/usr/bin/env node
'use strict';
/* P0: re-take ONLY the late-game Node simulation baseline (scripts/release/baseline.json full.results.late.sim) after a change that is
   meant to alter it (P0 spreads periodic work: p50 rises, p95/max/spikes fall). Every other baseline section stays untouched.
   Runs scripts/release/late-cost.cjs's Node part (3 x 600 steps, medians) between two speed calibrations and stores the values
   divided by (calibration now / baseline calibration), i.e. in the same machine-speed units as the rest of the baseline.
   usage: node scripts/perf/late-baseline.cjs [--write] */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{ROOT,node,median,r2,calibrate}=require('../release/lib.cjs');
const FILE=path.join(ROOT,'scripts/release/baseline.json'),base=JSON.parse(fs.readFileSync(FILE,'utf8')),full=base.full.results;
const c0=calibrate(),runs=[];for(let i=0;i<3;i++){const out=path.join(os.tmpdir(),`kingdom-late-base-${process.pid}-${i}.json`);node(path.join(ROOT,'scripts/perf/late-game.cjs'),['600',out]);runs.push(JSON.parse(fs.readFileSync(out,'utf8')));fs.rmSync(out,{force:true})}
const cal=(c0+calibrate())/2,speed=Math.min(1.6,Math.max(.6,cal/full.calibrationMs)),m=k=>median(runs.map(r=>r[k]));
const sim={units:runs[0].prints[0]?.units??runs[0].units,steps:600,reps:3,meanMs:r2(m('meanMs')/speed),p50:r2(m('p50')/speed),p95:r2(m('p95')/speed),max:r2(m('max')/speed),over40:m('over40'),over40Steady:m('over40Steady'),maxSteady:r2(m('maxSteady')/speed),over25:m('over25'),fingerprint:runs[0].prints.at(-1)?.hash,raw:{calibrationMs:r2(cal),speed:r2(speed),runs:runs.map(r=>({meanMs:r.meanMs,p50:r.p50,p95:r.p95,max:r.max,over40:r.over40,over40Steady:r.over40Steady,maxSteady:r.maxSteady}))},note:'P0 (docs/p0-spread-spikes.md): late sim baseline re-taken alone; other sections unchanged'};
console.log(JSON.stringify({previous:full.late.sim,next:sim},null,1));
if(process.argv.includes('--write')){full.late.sim=sim;fs.writeFileSync(FILE,JSON.stringify(base,null,1)+'\n');console.log('written',FILE)}
