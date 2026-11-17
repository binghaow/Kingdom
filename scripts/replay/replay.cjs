#!/usr/bin/env node
'use strict';
/* Headless replayer (P1). Replays a recording exported from the game (?replay=1 button or KingdomCore.replay.export()) or a fixture
   with the Node simulation, prints the checksum sequence, and compares it with the checksums stored in the file.
   usage: node scripts/replay/replay.cjs <replay.json> [--runs 3] [--every 20] [--steps N] [--json out.json] */
const fs=require('node:fs'),{loadK,loadReplay}=require('./lib.cjs');
const argv=process.argv.slice(2),opt=(k,d)=>{const i=argv.indexOf('--'+k);return i>=0?argv[i+1]:d},file=argv.find(a=>!a.startsWith('--')&&!/^\d+$/.test(a)||false);
if(!file){console.error('usage: node scripts/replay/replay.cjs <replay.json> [--runs 3] [--every 20] [--steps N] [--json out.json]');process.exit(2)}
(async()=>{const K=loadK(),R=await loadReplay(),data=JSON.parse(fs.readFileSync(file,'utf8')),runs=+opt('runs',3),every=opt('every')?+opt('every'):undefined,steps=opt('steps')?+opt('steps'):undefined;
  if(data.meta?.unrecordable)console.warn('WARNING recording marked unrecordable: '+(data.meta.notes||[]).join('; '));
  const out=[];for(let i=0;i<runs;i++){const t=process.hrtime.bigint(),r=R.runReplay(K,data,{every,steps});out.push({checksums:r.checksums,final:r.final,mismatch:r.results.mismatch,ms:Number(process.hrtime.bigint()-t)/1e6})}
  const same=out.every(r=>!R.firstDifference(r.checksums,out[0].checksums)&&r.final.hash===out[0].final.hash),vsFile=every===undefined&&steps===undefined?R.firstDifference(out[0].checksums,data.checksums||[]):null;
  console.log(`${file}: ${data.steps} steps, ${data.commands.length} commands, ${runs} runs ${same?'IDENTICAL':'DIFFERENT'}; final ${out.map(r=>r.final.hash).join(' / ')}; recorded final ${data.final?.hash??'—'}; ${vsFile?`DIFFERS from recorded checksums at step ${vsFile.a?.step??vsFile.b?.step}`:'matches recorded checksums'}; command result mismatches ${out[0].mismatch.length}; ${out.map(r=>Math.round(r.ms)).join('/')} ms`);
  console.log('checksums: '+out[0].checksums.map(c=>c.step+':'+c.hash).join(' '));
  if(opt('json'))fs.writeFileSync(opt('json'),JSON.stringify({file,runs,same,matchesRecorded:!vsFile,firstDifference:vsFile,results:out},null,1));
  if(!same||vsFile||out[0].mismatch.length)process.exitCode=1})().catch(e=>{console.error(e);process.exit(1)});
