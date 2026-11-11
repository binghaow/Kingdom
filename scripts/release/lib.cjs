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
/* Machine speed reference: a fixed JS workload unrelated to game code (typed-array arithmetic, sort, Map/string work).
   Timings are divided by (calibration now / calibration in the baseline) so a shared VM that is uniformly slower or faster
   today does not read as a regression; game-code regressions do not move this number. Median of 9 runs after one warm-up, ms. */
function calibrate(){const runs=[];for(let r=0;r<10;r++){const t=now();let x=12345,acc=0;const a=new Float64Array(150000);for(let i=0;i<a.length;i++){x=Math.imul(x,1664525)+1013904223>>>0;a[i]=x/4294967296}
  const b=Array.from(a.subarray(0,60000)).sort((p,q)=>p-q);acc+=b[30000];const m=new Map();for(let i=0;i<60000;i++){const k='k'+(i*7919%60000);m.set(k,(m.get(k)||0)+a[i])}acc+=m.size;
  for(let i=1;i<a.length;i++)a[i]=a[i]*.5+a[i-1]*.5+Math.sqrt(i);acc+=a[a.length-1];if(acc===42)console.log('');if(r)runs.push(now()-t)}return median(runs)}
module.exports={calibrate,ROOT,now,pct,median,mean,r1,r2,args,node,medianOf};
