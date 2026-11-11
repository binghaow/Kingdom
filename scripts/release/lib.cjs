'use strict';
/* Shared helpers for the release checks (scripts/release/*). Diagnostics only: nothing here is loaded by the game. */
const path=require('node:path'),{spawnSync}=require('node:child_process');
const ROOT=process.env.KINGDOM_ROOT||path.resolve(__dirname,'../..');
const now=()=>Number(process.hrtime.bigint())/1e6;
const sorted=a=>[...a].filter(x=>Number.isFinite(x)).sort((x,y)=>x-y);
function pct(a,p){const s=sorted(a);if(!s.length)return 0;return s[Math.min(s.length-1,Math.floor(p*s.length))]}
const median=a=>{const s=sorted(a);if(!s.length)return 0;const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2};
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
const r2=x=>Math.round(x*100)/100,r1=x=>Math.round(x*10)/10;
function args(argv=process.argv.slice(2)){const o={};for(let i=0;i<argv.length;i++){const a=argv[i];if(!a.startsWith('--'))continue;const k=a.slice(2),v=argv[i+1];if(v!==undefined&&!v.startsWith('--')){o[k]=v;i++}else o[k]=true}return o}
/* Runs a Node script and parses the JSON it writes to `out` (or stdout). */
function node(script,argv,{timeout=600000,env}={}){const r=spawnSync(process.execPath,['--no-warnings',script,...argv],{cwd:ROOT,encoding:'utf8',timeout,env:{...process.env,...env},maxBuffer:64<<20});if(r.status!==0)throw Error(path.basename(script)+' failed ('+r.status+'): '+(r.stderr||r.stdout).slice(-1500));return r.stdout}
/* Element-wise median of several runs of the same shape (numbers only; strings and others come from the first run). */
function medianOf(runs){const first=runs[0];if(typeof first==='number')return median(runs);if(Array.isArray(first))return first.map((_,i)=>medianOf(runs.map(r=>r[i])));if(first&&typeof first==='object'){const o={};for(const k of Object.keys(first))o[k]=medianOf(runs.map(r=>r?.[k]));return o}return first}
module.exports={ROOT,now,pct,median,mean,r1,r2,args,node,medianOf};
