#!/usr/bin/env node
'use strict';
/* Before/after determinism check for simulation performance work (v44). Exports public/ of a git ref (default main) into a temp
   folder, then runs scripts/perf/late-game.cjs (same seed, same fixed command script, AI on) against that copy and against the
   working tree, and compares the state fingerprints (every unit's id/kind/team/position/hp, building hp, node amounts and
   resources, rounded to 0.01) every 100 steps. Any mismatch is printed with the first differing step; exit code 1.
   usage: node scripts/perf/late-determinism.cjs [--ref main] [--steps 1200] [--json out.json] */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execSync,spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..'),argv=process.argv.slice(2),opt=(k,d)=>{const i=argv.indexOf('--'+k);return i>=0?argv[i+1]:d};
const ref=opt('ref','main'),steps=opt('steps','1200'),out=opt('json');
const CASES=[{map:'coast_l',seed:9090,per:110},{map:'coast_l',seed:31337,per:110},{map:'cliff_s',seed:4242,per:80},{map:'lake_s',seed:777,per:80},{map:'straits',seed:2024,per:90}];
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kingdom-determinism-'));
try{execSync(`git archive ${ref} public | tar -x -C ${JSON.stringify(dir)}`,{cwd:ROOT,stdio:['ignore','ignore','inherit'],shell:'/bin/bash'});
  const run=(root,c)=>{const file=path.join(dir,`out-${Math.random().toString(36).slice(2)}.json`),r=spawnSync(process.execPath,[path.join(__dirname,'late-game.cjs'),steps,file,'--map',c.map,'--seed',String(c.seed),'--per',String(c.per),'--every','100'],{env:{...process.env,KINGDOM_ROOT:root},encoding:'utf8',maxBuffer:64<<20});if(r.status!==0)throw Error(r.stderr.slice(-1500));return JSON.parse(fs.readFileSync(file,'utf8'))};
  const rows=[];let bad=0;
  for(const c of CASES){const a=run(dir,c),b=run(ROOT,c),first=a.prints.findIndex((p,i)=>p.hash!==b.prints[i]?.hash);const same=first<0&&a.prints.length===b.prints.length;if(!same)bad++;
    rows.push({case:`${c.map} seed ${c.seed} (${a.towns} nations, ${a.prints[0]?.units} units)`,steps:+steps,same,firstDiffStep:same?null:a.prints[first]?.step,finalAlive:[a.alive,b.alive],refStep:{meanMs:a.meanMs,p95:a.p95},nowStep:{meanMs:b.meanMs,p95:b.p95},finalHash:[a.prints.at(-1)?.hash,b.prints.at(-1)?.hash]});
    const r=rows.at(-1);console.log(`${r.same?'SAME':'DIFF'} ${r.case}: ${steps} steps, alive ${r.finalAlive.join(' / ')}, step mean ${a.meanMs} -> ${b.meanMs} ms, p95 ${a.p95} -> ${b.p95} ms${r.same?'':', first difference at step '+r.firstDiffStep}`)}
  if(out)fs.writeFileSync(out,JSON.stringify({ref,rows},null,1));if(bad)process.exitCode=1}
finally{fs.rmSync(dir,{recursive:true,force:true})}
