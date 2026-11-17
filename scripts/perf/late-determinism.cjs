#!/usr/bin/env node
'use strict';
/* Before/after determinism check for simulation performance work (v44). Exports public/ of a git ref (default main) into a temp
   folder, then runs scripts/perf/late-game.cjs (same seed, same fixed command script, AI on) against that copy and against the
   working tree, and compares the state fingerprints (every unit's id/kind/team/position/hp, building hp, node amounts and
   resources, rounded to 0.01) every 100 steps. Any mismatch is printed with the first differing step; exit code 1.
   --self N (P0): instead of comparing with a ref, run the working tree N times per case (separate processes) and require identical
   fingerprints; used when a change is expected to alter results versus the old code but must stay deterministic.
   usage: node scripts/perf/late-determinism.cjs [--ref main] [--self 3] [--steps 1200] [--json out.json] */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execSync,spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..'),argv=process.argv.slice(2),opt=(k,d)=>{const i=argv.indexOf('--'+k);return i>=0?argv[i+1]:d};
const self=+opt('self',0),ref=opt('ref','main'),steps=opt('steps','1200'),out=opt('json');
const CASES=[{map:'coast_l',seed:9090,per:110},{map:'coast_l',seed:31337,per:110},{map:'cliff_s',seed:4242,per:80},{map:'lake_s',seed:777,per:80},{map:'straits',seed:2024,per:90}];
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kingdom-determinism-'));
try{if(!self)execSync(`git archive ${ref} public | tar -x -C ${JSON.stringify(dir)}`,{cwd:ROOT,stdio:['ignore','ignore','inherit'],shell:'/bin/bash'});
  const run=(root,c)=>{const file=path.join(dir,`out-${Math.random().toString(36).slice(2)}.json`),r=spawnSync(process.execPath,[path.join(__dirname,'late-game.cjs'),steps,file,'--map',c.map,'--seed',String(c.seed),'--per',String(c.per),'--every','100'],{env:{...process.env,KINGDOM_ROOT:root},encoding:'utf8',maxBuffer:64<<20});if(r.status!==0)throw Error(r.stderr.slice(-1500));return JSON.parse(fs.readFileSync(file,'utf8'))};
  const rows=[];let bad=0;
  if(self){for(const c of CASES){const runs=[];for(let i=0;i<self;i++)runs.push(run(ROOT,c));const a=runs[0],same=runs.every(r=>r.prints.length===a.prints.length&&r.prints.every((p,i)=>p.hash===a.prints[i].hash));if(!same)bad++;
    rows.push({case:`${c.map} seed ${c.seed} (${a.towns} nations, ${a.prints[0]?.units} units)`,steps:+steps,runs:self,same,finalAlive:a.alive,finalHash:runs.map(r=>r.prints.at(-1)?.hash),step:runs.map(r=>({meanMs:r.meanMs,p95:r.p95,max:r.max,over40:r.over40}))});
    console.log(`${same?'SAME':'DIFF'} ${rows.at(-1).case}: ${self} runs x ${steps} steps, alive ${a.alive}, final ${a.prints.at(-1)?.hash}, step mean ${runs.map(r=>r.meanMs).join('/')} ms, p95 ${runs.map(r=>r.p95).join('/')} ms`)}
    if(out)fs.writeFileSync(out,JSON.stringify({self,rows},null,1));if(bad)process.exitCode=1;return}
  for(const c of CASES){const a=run(dir,c),b=run(ROOT,c),first=a.prints.findIndex((p,i)=>p.hash!==b.prints[i]?.hash);const same=first<0&&a.prints.length===b.prints.length;if(!same)bad++;
    rows.push({case:`${c.map} seed ${c.seed} (${a.towns} nations, ${a.prints[0]?.units} units)`,steps:+steps,same,firstDiffStep:same?null:a.prints[first]?.step,finalAlive:[a.alive,b.alive],refStep:{meanMs:a.meanMs,p95:a.p95},nowStep:{meanMs:b.meanMs,p95:b.p95},finalHash:[a.prints.at(-1)?.hash,b.prints.at(-1)?.hash]});
    const r=rows.at(-1);console.log(`${r.same?'SAME':'DIFF'} ${r.case}: ${steps} steps, alive ${r.finalAlive.join(' / ')}, step mean ${a.meanMs} -> ${b.meanMs} ms, p95 ${a.p95} -> ${b.p95} ms${r.same?'':', first difference at step '+r.firstDiffStep}`)}
  if(out)fs.writeFileSync(out,JSON.stringify({ref,rows},null,1));if(bad)process.exitCode=1}
finally{fs.rmSync(dir,{recursive:true,force:true})}
