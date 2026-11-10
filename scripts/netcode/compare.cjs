#!/usr/bin/env node
'use strict';
/* Markdown before/after table from two server-cost.cjs --json outputs.  usage: node compare.cjs before.json after.json */
const fs=require('node:fs'),[a,b]=process.argv.slice(2).map(f=>JSON.parse(fs.readFileSync(f,'utf8')).results);
const pct=(x,y)=>x?((y-x)/x*100).toFixed(0)+'%':'n/a';
console.log('| checkpoint | units | CPU/poll mean ms (before -> after) | p95 ms | hydrate-first-tick ms | response KB | gz KB |\n|---|---|---|---|---|---|---|');
a.forEach((r,i)=>{const o=b[i];console.log(`| ${r.label} | ${r.units}/${o.units} | ${r.cpuMeanMs} -> ${o.cpuMeanMs} (${pct(r.cpuMeanMs,o.cpuMeanMs)}) | ${r.cpuP95} -> ${o.cpuP95} | ${r.stages.firstTickAfterHydrate} -> ${o.stages.firstTickAfterHydrate} | ${r.respKB} -> ${o.respKB} | ${r.respGzKB} -> ${o.respGzKB} |`)});
