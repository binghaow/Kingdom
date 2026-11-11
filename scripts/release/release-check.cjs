#!/usr/bin/env node
'use strict';
/* Pre-release routine check (AGENTS.md "发布前常规检查"): pathfinding + stuck units, simulation cost, render frame time,
   server/multiplayer latency. Compares every gated metric with scripts/release/baseline.json and prints PASS/WARN/FAIL.
   Writes docs/release-reports/<date>-<commit>.md and .json. Exit code 1 when any check FAILs.
   usage: npm run release-check [-- --quick] [-- --update-baseline] [-- --only path,sim,render,net] [-- --no-report]
   Diagnostics only: all instrumentation lives in scripts/release and is attached to test instances or to pages opened with
   ?perf=1; no game file is changed and normal play is unaffected. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execSync}=require('node:child_process'),{ROOT,now,r1,r2,args,calibrate,baselineCompatibility}=require('./lib.cjs');
process.removeAllListeners('warning');/* node:sqlite prints an ExperimentalWarning in-process */
const BASELINE=path.join(__dirname,'baseline.json'),REPORTS=path.join(ROOT,'docs/release-reports');
const a=args(),quick=!!a.quick,mode=quick?'quick':'full',only=a.only?new Set(String(a.only).split(',')):null;
const git=c=>{try{return execSync('git '+c,{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()}catch{return ''}};
const meta={commit:git('rev-parse --short HEAD')||'unknown',branch:git('rev-parse --abbrev-ref HEAD'),dirty:!!git('status --porcelain --untracked-files=no'),date:new Date().toISOString(),mode,node:process.version,cpus:os.cpus().length,platform:process.platform,arch:process.arch,cpuModel:os.cpus()[0]?.model||null};

/* ---------- gates ----------
   rel(limitWarn, limitFail, floor): value is worse when higher; relative change vs baseline, ignored when the absolute
   difference is below `floor` (tiny numbers are noise). Deterministic counts use the same rule with a small floor. */
const RULES={
  timing:{warn:.15,fail:.20,floor:.3},      // medians of several runs (ms)
  timingNoisy:{warn:.20,fail:.30,floor:2},  // headless render, p95 of Node steps
  count:{warn:.10,fail:.20,floor:5},        // deterministic counts (A* calls, expanded nodes, dropped routes)
  size:{warn:.10,fail:.15,floor:1},
  hud:{warn:.50,fail:1.5,floor:6},          // ?perf=1 HUD medians from a handful of 2-3 s frames: WARN signal; frame interval and per-frame counts gate render
  tail:{warn:.30,fail:1.0,floor:10},        // p95 of a few dozen samples (server CPU per poll, sim step p95): mostly WARN, FAIL only when doubled; the mean gates carry FAIL
  server:{warn:.20,fail:.30,floor:3},       // server CPU per poll, median of 3 runs x 30-40 polls; the sandbox VM shows about +-20% between runs
  derived:{warn:.25,fail:1.0,floor:50},     // latency model outputs: amplify CPU noise, the CPU gates carry FAIL
  countNoisy:{warn:.20,fail:.35,floor:5},   // per-frame Canvas counts: depend on how far the melee has progressed           // ?perf=1 HUD medians from few frames (headless render JS time)         // response KB (deterministic for a pinned seed)
};
const SCALED=new Set(['timing','timingNoisy','server','tail','hud','derived']);
function gate(results,base){const checks=[],speed=base?.calibrationMs&&results.calibrationMs?Math.min(1.6,Math.max(.6,results.calibrationMs/base.calibrationMs)):1;
  const add=(area,name,value,ref,rule,unit='')=>{if(value===undefined||value===null||Number.isNaN(value))return;const R0=RULES[rule],k=quick?1.5:1,R={warn:R0.warn*k,fail:R0.fail*k,floor:R0.floor};/* --quick has fewer repetitions: thresholds 1.5x looser */let status='PASS',why='';
    if(ref===undefined||ref===null){status='WARN';why='基线中没有此项'}else{const adj=SCALED.has(rule)?value/speed:value,diff=adj-ref,rel=ref?diff/ref:(diff>0?Infinity:0);if(diff>R.floor&&rel>R.fail){status='FAIL';why=`比基线高 ${Math.round(rel*100)}%（门槛 ${Math.round(R.fail*100)}%${SCALED.has(rule)&&speed!==1?`，已按机器速度系数 ${r2(speed)} 校正`:''}）`}else if(diff>R.floor&&rel>R.warn){status='WARN';why=`比基线高 ${Math.round(rel*100)}%（警告线 ${Math.round(R.warn*100)}%${SCALED.has(rule)&&speed!==1?`，已按机器速度系数 ${r2(speed)} 校正`:''}）`}}
    checks.push({area,name,value,baseline:ref??null,unit,rule,status,why})};
  const custom=(area,name,value,ref,status,why,unit='')=>checks.push({area,name,value,baseline:ref??null,unit,rule:'custom',status,why});
  if(results.path){const B=Object.fromEntries((base?.path?.scenarios||[]).map(s=>[s.scenario,s]));for(const s of results.path.scenarios){const b=B[s.scenario],A=s.astar,BA=b?.astar||{},n=s.scenario;
      add('路径',`${n} A* 次数`,A.calls,BA.calls,'count');add('路径',`${n} A* 展开节点 p95`,A.expandedP95,BA.expandedP95,'count');add('路径',`${n} 寻路被首段阻挡丢弃`,A.droppedRoutes,BA.droppedRoutes,'count');
      add('路径',`${n} A* 总耗时`,A.msTotal,BA.msTotal,'timingNoisy','ms');add('路径',`${n} 步均耗时`,s.step.meanMs,b?.step?.meanMs,'timingNoisy','ms');
      if(b){const fr=A.failRate-BA.failRate;custom('路径',`${n} 寻路失败率`,A.failRate,BA.failRate,fr>.1?'FAIL':fr>.05?'WARN':'PASS',fr>.05?`失败率上升 ${r2(fr)}`:'')}
      const st=s.stuck.stuckUnits,bs=b?.stuck?.stuckUnits,allow=bs===undefined?0:bs+Math.max(1,Math.round(bs*.2));
      custom('卡住单位',`${n} 卡住单位数`,st,bs,bs===undefined?(st>0?'WARN':'PASS'):st>allow?'FAIL':st>bs?'WARN':'PASS',bs===undefined?'基线中没有此项':st>allow?`超过阈值 ${allow}（基线 ${bs} + 20%，至少 +1）`:st>bs?`比基线多 ${st-bs} 个（阈值 ${allow}）`:st?`基线已知 ${bs} 个，见“卡住单位”`:'')}}
  if(results.sim){const B=Object.fromEntries((base?.sim?.rows||[]).map(r=>[r.requested,r]));for(const r of results.sim.rows){const b=B[r.requested]||{};add('模拟',`${r.requested} 单位 每步均值`,r.meanMs,b.meanMs,'timing','ms');add('模拟',`${r.requested} 单位 每步 p95`,r.p95,b.p95,'tail','ms');
      if(r.requested>=200)for(const k of ['collision','targeting','pathfinding','fog'])add('模拟',`${r.requested} 单位 ${k}`,r[k],b[k],'timing','ms')}
    const g=results.sim.growth,bg=base?.sim?.growth||{};for(const k of ['meanMs','collision','targeting','pathfinding','fog']){const d=g[k]-(bg[k]??g[k]);custom('模拟',`增长指数 ${k}（成本∝单位数^k）`,g[k],bg[k],d>.25?'FAIL':(d>.15||(g[k]>1.3&&bg[k]!==undefined&&bg[k]<=1.15))?'WARN':'PASS',d>.25?`指数上升 ${r2(d)}，增长变快`:d>.15?`指数上升 ${r2(d)}`:g[k]>1.3?(bg[k]<=1.15?'新出现超线性增长':'基线已超线性（已知）'):'')}}
  if(results.render&&!results.render.skipped){for(const v of ['desktop','phone']){const r=results.render[v],b=base?.render?.[v]||{};if(!r)continue;add('渲染',`${v} 帧间隔 p50`,r.frameP50,b.frameP50,'timingNoisy','ms');add('渲染',`${v} 帧间隔 p95`,r.frameP95,b.frameP95,'timingNoisy','ms');add('渲染',`${v} render p50`,r.renderP50,b.renderP50,'hud','ms');/* HUD render p95 is reported, not gated: with 2-3 s software-raster frames it rests on a handful of samples */add('渲染',`${v} 每帧 drawImage`,r.drawImagePerFrame,b.drawImagePerFrame,'countNoisy');add('渲染',`${v} 每帧带 filter 的绘制`,r.filteredDrawsPerFrame,b.filteredDrawsPerFrame,'countNoisy');
      if(r.errors?.length)custom('渲染',`${v} 页面错误`,r.errors.length,0,'FAIL',r.errors.join(' | ').slice(0,200))}}
  else if(results.render?.skipped)custom('渲染','Playwright',0,null,'WARN',results.render.skipped);
  if(results.net){const N=results.net,B=base?.net||{};const pairs=[['2 人',N.opening,B.opening],['4 人',N.fourSeats,B.fourSeats]];for(const [who,rows,brows] of pairs)rows.forEach((r,i)=>{const b=brows?.[i]||{};add('联机',`${who} ${r.label} CPU/轮询 均值`,r.cpuMeanMs,b.cpuMeanMs,'server','ms');add('联机',`${who} ${r.label} CPU/轮询 p95`,r.cpuP95,b.cpuP95,'tail','ms');add('联机',`${who} ${r.label} 响应`,r.respKB,b.respKB,'size','KB');add('联机',`${who} ${r.label} 响应 gzip`,r.respGzKB,b.respGzKB,'size','KB')});
    const c=N.conflicts,bc=B.conflicts;if(c){const d=c.conflictsPerReq-(bc?.conflictsPerReq??c.conflictsPerReq);custom('联机','同时到达冲突重算 次/请求',c.conflictsPerReq,bc?.conflictsPerReq,c.failedRequests>0?'FAIL':d>.5?'FAIL':d>.25?'WARN':'PASS',c.failedRequests?`${c.failedRequests} 个请求因冲突失败`:d>.25?`上升 ${r2(d)}`:'');add('联机','同时到达 额外 CPU',c.cpuPerRoundSimultaneousMs,bc?.cpuPerRoundSimultaneousMs,'timingNoisy','ms')}
    const BL=Object.fromEntries((B.latency||[]).map(l=>[l.scenario+'@'+l.rttMs,l]));for(const l of N.latency){const b=BL[l.scenario+'@'+l.rttMs]||{};add('联机',`${l.scenario} RTT ${l.rttMs} 首次权威位移（模型）`,l.firstMoveMeanMs,b.firstMoveMeanMs,'derived','ms')}}
  checks.speed=speed;return checks}

function verdict(checks){return checks.some(c=>c.status==='FAIL')?'FAIL':checks.some(c=>c.status==='WARN')?'WARN':'PASS'}

/* ---------- report ---------- */
const fmt=v=>v===null||v===undefined?'—':typeof v==='number'?String(r2(v)):String(v);
function markdown(results,checks,base,elapsed){const V=verdict(checks),fails=checks.filter(c=>c.status==='FAIL'),warns=checks.filter(c=>c.status==='WARN'),L=[];
  L.push(`# 发布前常规检查 ${meta.date.slice(0,10)} · ${meta.commit}${meta.dirty?'（工作区有未提交改动）':''}`,'',a['update-baseline']?'## 结论：**BASELINE**（本次运行写入了新基线，未做门槛比较）':`## 结论：**${V}**`,'');
  L.push(`- 模式 ${mode}，分支 \`${meta.branch}\`，基线 ${base?`${base.meta?.commit}（${base.meta?.date?.slice(0,10)}，${base.meta?.mode}）`:'无'}，耗时 ${Math.round(elapsed)} 秒，Node ${meta.node}，${meta.cpus} 核；机器速度校准 ${results.calibrationMs} ms（基线 ${base?.results?.calibrationMs??'—'} ms，耗时项按系数 ${r2(checks.speed??1)} 校正后再比较）。`);
  L.push(`- ${checks.length} 项门槛：PASS ${checks.filter(c=>c.status==='PASS').length} · WARN ${warns.length} · FAIL ${fails.length}。任何 FAIL 都不得发布（AGENTS.md）。`);
  for(const c of [...fails,...warns])L.push(`- **${c.status}** ${c.area} · ${c.name}：${fmt(c.value)}${c.unit} vs 基线 ${fmt(c.baseline)}${c.unit} — ${c.why}`);
  const P=results.path;if(P){const all=P.scenarios.flatMap(s=>s.stuck.samples);L.push('','## 卡住单位',`规则：有移动意图（路径或远处的移动/攻击/采集目标）、未在战斗或工作、${P.stuckRule.windowSec} 秒内位移 < ${P.stuckRule.thresholdPx} 像素；挤在共同终点附近的单位与“目标被围死”的预期情况单列，不计入卡住数。`,'');
    L.push('| 场景 | 卡住 | 终点拥挤 | 预期不可达 | 分类 |','|---|---|---|---|---|');for(const s of P.scenarios)L.push(`| ${s.scenario} | ${s.stuck.stuckUnits} | ${s.stuck.crowdedAtGoal} | ${s.stuck.expectedUnreachable} | ${Object.entries(s.stuck.byReason).map(([k,v])=>k+' '+v).join('，')||'—'} |`);
    if(all.length){L.push('','样例（最多每场景 8 个，按卡住时长排序）：','','| 场景 | 单位 | 位置 | 指令 → 目标（距离） | 卡住 | 原因 |','|---|---|---|---|---|---|');for(const e of all)L.push(`| ${e.scenario} | #${e.id} ${e.kind} 队${e.team} | (${e.x}, ${e.y}) | ${e.order} → (${e.goal.x}, ${e.goal.y})（${e.toGoal}px） | ${e.since}s 起 ${e.duration}s | ${e.reason} |`)}
    const exp=P.scenarios.filter(s=>s.stuck.expectedUnreachable);for(const s of exp)L.push('',`- ${s.scenario}：${s.stuck.expectedUnreachable} 个攻击者因目标被城墙围死而原地不动（engagementBlocked，不会转而攻击城墙）。`)}
  if(P){L.push('','## 路径分析','','| 场景 | 单位 | 时长 s | A* 次数（/s） | 展开节点 p50/p95/max | 单次 ms p50/p95/max | 失败率 | 重试率 | 不可达缓存命中 | 首段受阻丢弃 | 攻击位置 记忆命中/搜索/A* | 步 ms 均/p95/p99/max | >50ms 步数 |','|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for(const s of P.scenarios){const A=s.astar,E=A.engagement;L.push(`| ${s.scenario} | ${s.units} | ${s.simSeconds} | ${A.calls}（${A.callsPerSimSec}） | ${A.expandedP50}/${A.expandedP95}/${A.expandedMax} | ${A.msP50}/${A.msP95}/${A.msMax} | ${A.failRate} | ${A.retryRate} | ${A.unreachableCacheHits}（${A.cacheHitRate}） | ${A.droppedRoutes} | ${E.memoHits}/${E.searches}/${E.astarCalls} | ${s.step.meanMs}/${s.step.p95Ms}/${s.step.p99Ms}/${s.step.maxMs} | ${s.step.stepsOver50ms} |`)}
    L.push('',...P.scenarios.map(s=>`- ${s.scenario}：${s.title}`))}
  const S=results.sim;if(S){L.push('','## 模拟开销（单机，0.05 s 步，'+S.reps+' 次取中位数）','','| 单位 | 每步均值 | p50 | p95 | max | 碰撞 | 索敌 | 寻路 | 迷雾 | 其他 |','|---|---|---|---|---|---|---|---|---|---|');for(const r of S.rows)L.push(`| ${r.units} | ${r.meanMs} | ${r.p50} | ${r.p95} | ${r.max} | ${r.collision} | ${r.targeting} | ${r.pathfinding} | ${r.fog} | ${r.other} |`);
    L.push('',`增长指数（${S.unitRatio} 倍单位，成本∝单位数^k，1=线性，2=平方）：`+Object.entries(S.growth).map(([k,v])=>`${k} ${v}`).join('，')+'。'+(S.superlinear.length?' 超线性：'+S.superlinear.join('，')+'。':''))}
  const R=results.render;if(R){L.push('','## 渲染帧耗时（无 GPU 的 headless Chromium 上限，不等于真机）','');if(R.skipped)L.push('未运行：'+R.skipped);else{L.push(`${R.note}。`,'','| 视口 | 单位/可见 | DPR 设备/实际 | 帧间隔 p50/p95 ms | FPS | render p50/p95 | scene p50/p95 | update p50/p95 | 每帧 drawImage / 带 filter 绘制 |','|---|---|---|---|---|---|---|---|---|');for(const v of ['desktop','phone']){const r=R[v];if(r)L.push(`| ${v} ${r.viewport} | ${r.units}/${r.visible} | ${r.dpr} | ${r.frameP50}/${r.frameP95} | ${r.fps} | ${r.renderP50}/${r.renderP95} | ${r.sceneP50}/${r.sceneP95} | ${r.updateP50}/${r.updateP95} | ${r.drawImagePerFrame} / ${r.filteredDrawsPerFrame} |`)}}}
  const N=results.net;if(N){L.push('','## 服务器与联机','','| 场景 | 检查点 | 单位 | CPU/轮询 均值/p50/p95/max ms | 响应 KB | gzip KB | 存档 gzip KB | 恢复后首步 冷/缓存 ms |','|---|---|---|---|---|---|---|---|');for(const [who,rows] of [['2 人·迷雾关',N.opening],['4 人·迷雾开',N.fourSeats]])for(const r of rows)L.push(`| ${who} | ${r.label} | ${r.units} | ${r.cpuMeanMs}/${r.cpuP50}/${r.cpuP95}/${r.cpuMax} | ${r.respKB} | ${r.respGzKB} | ${r.storedGzKB} | ${r.firstTickAfterHydrateMs}/${r.firstTickCachedMs} |`);
    const c=N.conflicts;L.push('',`冲突重算（实测，进程内，4 席位同时到达 ${c.rounds} 轮 ${c.requests} 个请求）：乐观锁失败 ${c.lostRaces} 次 = ${c.conflictsPerReq} 次/请求，失败请求 ${c.failedRequests}；每轮 CPU 顺序到达 ${c.cpuPerRoundSequentialMs} ms → 同时到达 ${c.cpuPerRoundSimultaneousMs} ms（+${c.extraCpuPct}%）。`);
    L.push('','下令到首次位移（模型，'+N.assumptions+'）：','','| 场景 | RTT ms | CPU ms | 冲突 次/请求（模型） | 指令确认 均值 (p95) ms | 权威位移可见 均值 (p95) ms | 己方单位起步 |','|---|---|---|---|---|---|---|');for(const l of N.latency)L.push(`| ${l.scenario} | ${l.rttMs} | ${l.cpuMs} | ${l.conflictsPerReqModel} | ${l.ackMeanMs} (${l.ackP95Ms}) | ${l.firstMoveMeanMs} (${l.firstMoveP95Ms}) | 下一帧（本地预测） |`)}
  L.push('','## 全部门槛','','| 状态 | 类别 | 项目 | 当前 | 基线 | 说明 |','|---|---|---|---|---|---|');for(const c of checks)L.push(`| ${c.status} | ${c.area} | ${c.name} | ${fmt(c.value)}${c.unit} | ${fmt(c.baseline)}${c.unit} | ${c.why} |`);
  L.push('','## 仍需真机验证（本检查不能代替）','','- iPhone 17 / iPad 实机 `?perf=1` 帧率、render/scene、发热与降频（headless 无 GPU，数字只用于提交之间比较）。','- Safari/WebKit 上的渲染与内存（这里只测 Chromium）。','- Cloudflare Worker / D1 实际 CPU、isolate 复用率、D1 往返和真实冲突率；跨设备、弱网、丢包、后台恢复。','- 触控操作、HUD 布局与双语文本（Frontier UI audit 另行执行）。');
  return L.join('\n')+'\n'}

(async()=>{if(only&&a['update-baseline'])throw Error('--update-baseline must run every section (the speed calibration is shared by all of them); drop --only');const t0=now(),cal0=calibrate();const base=fs.existsSync(BASELINE)?JSON.parse(fs.readFileSync(BASELINE,'utf8')):null,baseMode=base?.[mode]||null,compat=baselineCompatibility(meta,baseMode?.meta);const results={};
  const step=async(key,label,fn)=>{if(only&&!only.has(key))return;const t=now();process.stdout.write(`[release-check] ${label} …`);results[key]=await fn();console.log(` ${r1((now()-t)/1000)} s`)};
  await step('path','路径分析与卡住单位',()=>require('./path-analysis.cjs').run({quick}));
  await step('sim','模拟开销 50/100/200/400 单位',()=>require('./sim-cost.cjs').run({quick}));
  await step('render','渲染帧耗时（Playwright）',()=>require('./render-cost.cjs').run({quick}));
  await step('net','服务器与联机延迟',()=>require('./net-cost.cjs').run({quick}));
  results.calibrationMs=r2((cal0+calibrate())/2);const elapsed=(now()-t0)/1000;
  if(a['update-baseline']){const next=base||{},previous=base?.[mode]?.results;next[mode]={meta,results};next.meta={updated:meta.date,commit:meta.commit,branch:meta.branch,note:'release-check baselines; full and quick runs are compared only with the same mode. Regenerate with npm run release-check -- --update-baseline [--quick] on the same machine.'};if(only&&previous)next[mode].results={...previous,...results};fs.writeFileSync(BASELINE,JSON.stringify(next,null,1)+'\n');console.log(`[release-check] baseline (${mode}) written to ${path.relative(ROOT,BASELINE)}`)}
  const ref=a['update-baseline']?null:baseMode?.results;let checks=[];
  if(!a['update-baseline']){
    if(baseMode&&!compat.compatible)checks.push({area:'机器',name:'性能基线兼容性',value:`${meta.platform}/${meta.node}/${meta.arch}`,baseline:`${baseMode.meta.platform}/${baseMode.meta.node}/${baseMode.meta.arch||'未知架构'}`,unit:'',rule:'custom',status:'WARN',why:`环境不匹配，本次不作性能退化判定：${compat.reasons.join('；')}。请在目标机器上重建基线后比较。`});
    else checks=gate(results,ref?{...ref,meta:baseMode.meta}:null);
    if(baseMode&&!compat.compatible&&results.render?.skipped)checks.push({area:'渲染',name:'Playwright',value:0,baseline:null,unit:'',rule:'custom',status:'WARN',why:results.render.skipped});
  }
  if(ref&&compat.compatible&&!ref.calibrationMs)checks.push({area:'机器',name:'速度校准',value:results.calibrationMs,baseline:null,unit:'ms',rule:'custom',status:'WARN',why:'基线没有速度校准，耗时项未校正；请重建基线'});const V=a['update-baseline']?'BASELINE':verdict(checks);
  const md=markdown(results,checks,a['update-baseline']?null:baseMode,elapsed);
  if(!a['no-report']){fs.mkdirSync(REPORTS,{recursive:true});const name=`${meta.date.slice(0,10)}-${meta.commit}${quick?'-quick':''}`;fs.writeFileSync(path.join(REPORTS,name+'.md'),md);fs.writeFileSync(path.join(REPORTS,name+'.json'),JSON.stringify({verdict:V,meta,baseline:baseMode?.meta||null,checks,results},null,1)+'\n');console.log(`[release-check] report: docs/release-reports/${name}.md`)}
  for(const c of checks.filter(c=>c.status!=='PASS'))console.log(`  ${c.status} ${c.area} · ${c.name}: ${fmt(c.value)}${c.unit} vs ${fmt(c.baseline)}${c.unit} — ${c.why}`);
  console.log(`[release-check] ${V}: ${checks.filter(c=>c.status==='PASS').length} PASS, ${checks.filter(c=>c.status==='WARN').length} WARN, ${checks.filter(c=>c.status==='FAIL').length} FAIL in ${Math.round(elapsed)} s (${mode})`);
  if(V==='FAIL')process.exitCode=1})().catch(e=>{console.error(e);process.exitCode=2});
