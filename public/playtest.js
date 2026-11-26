/* Offline trial only: no network transmission, no gameplay hooks or simulation changes. */
(()=>{'use strict';
if(!window.FrontierPlaytestBuild)return;
const KEY='frontier-trial-observations-v1',CONSENT=KEY+'-consent';
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
let consent=read(CONSENT,false)===true, events=read(KEY,[]), timer=null, seen=new Set(), previous=null, session=null, observer=null, longTasks={count:0,total:0,max:0};
if(!Array.isArray(events))events=[];
events=events.filter(e=>e&&Number.isFinite(e.at)&&Date.now()-e.at<7*86400000).slice(-300);
const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify(events))}catch{}};
persist();
const english=()=>document.documentElement.lang.startsWith('en');
const tr=(zh,en)=>english()?en:zh;
function record(type,data={}){if(!consent)return;events.push({at:Date.now(),session,type,...data});events=events.filter(e=>Date.now()-e.at<7*86400000).slice(-300);persist()}
function once(type,data){if(seen.has(type))return;seen.add(type);record(type,data)}
function observe(){
 if(document.hidden)return;
 if(longTasks.count){record('main_thread_long_tasks',{count:longTasks.count,totalMs:Math.round(longTasks.total),maxMs:Math.round(longTasks.max)});longTasks={count:0,total:0,max:0}}
 const s=window.frontier?.state;if(!s||document.querySelector('#welcome[open]'))return;
 // Worker snapshots replace the state object; object identity is not a match identifier.
 if(previous===null||s.time<previous){session=crypto.randomUUID();seen.clear();record('session_observed',{entry:s.time>5?'resumed_or_existing':'new',gameSeconds:Math.round(s.time),difficulty:s.difficulty,nations:s.nations});}
 previous=s.time;
 if(window.frontier.paused)return;
 const own=s.units.filter(u=>u.team===0&&u.hp>0),buildings=s.buildings.filter(b=>b.team===0&&b.hp>0);
 const stage={gameSeconds:Math.round(s.time),units:own.length,buildings:buildings.length,age:s.ages?.[0]};
 if(own.some(u=>window.KingdomSim.defs[u.kind]?.damage>0&&u.kind!=='villager'))once('military_observed',stage);
 if(buildings.some(b=>['barracks','dock','stable'].includes(b.kind)))once('military_building_observed',stage);
 if(s.ages?.[0]>1)once('age_advanced_observed',stage);
 if(s.ended)once('match_ended_observed',stage);
 record('progress',stage);
}
function enable(value){
 consent=value;try{localStorage.setItem(CONSENT,JSON.stringify(value))}catch{}
 clearInterval(timer);timer=null;observer?.disconnect();observer=null;longTasks={count:0,total:0,max:0};
 if(value){timer=setInterval(observe,15000);observe();
  if(window.PerformanceObserver?.supportedEntryTypes?.includes('longtask')){
   observer=new PerformanceObserver(list=>{if(document.hidden||window.frontier?.paused||document.querySelector('#welcome[open]'))return;for(const e of list.getEntries()){longTasks.count++;longTasks.total+=e.duration;longTasks.max=Math.max(longTasks.max,e.duration)}});
   observer.observe({type:'longtask',buffered:false});
  }
 }
}
// No error strings, URLs, stacks, save contents, chat or typed game commands are captured.
window.addEventListener('error',e=>record('script_error',{line:e.lineno||0,column:e.colno||0}));
window.addEventListener('unhandledrejection',()=>record('unhandled_rejection'));
document.addEventListener('visibilitychange',()=>record(document.hidden?'backgrounded':'foregrounded'));
window.addEventListener('pagehide',()=>record('page_hidden')); // Not classified as abandonment or a crash.
const dialog=document.createElement('dialog');dialog.id='trial-feedback';dialog.dataset.i18nIgnore='true';document.body.append(dialog);
function render(){
 const draft=dialog.querySelector('textarea')?.value||'';
 dialog.innerHTML=`<h2>${tr('试玩反馈','Playtest feedback')}</h2><p>${tr('默认不记录、不上传。可选择在本机记录最近游戏进度与卡顿摘要；最多 300 条，保留 7 天。只有点“分享反馈”才交给你选择的应用。','Recording is off by default. Optionally keep progress and stutter summaries on this device: up to 300 records for 7 days. Nothing is uploaded automatically. Share only using an app you choose.')}</p>
 <label><input id="trial-consent" type="checkbox" ${consent?'checked':''}> ${tr('允许本机记录试玩诊断（可随时关闭并清除）','Allow local playtest diagnostics (optional; clear at any time)')}</label>
 <label>${tr('本次最主要的问题','Main issue this time')}<select id="trial-reason"><option value="other">${tr('其他 / 建议','Other / suggestion')}</option><option value="confusing">${tr('不知道下一步做什么','Unsure what to do next')}</option><option value="controls">${tr('操作不方便','Controls were difficult')}</option><option value="slow">${tr('卡顿 / 反应慢','Stuttering / slow response')}</option><option value="hard">${tr('太难','Too difficult')}</option><option value="easy">${tr('太容易','Too easy')}</option><option value="boring">${tr('节奏慢 / 无聊','Slow pace / boring')}</option><option value="interrupted">${tr('临时有事，下次继续','Interrupted; will continue later')}</option><option value="bug">${tr('遇到错误','Encountered a bug')}</option></select></label>
 <label>${tr('这次为什么停下来？','Why did you stop this time?')}<select id="trial-stop"><option value="still_playing">${tr('还在玩，只是提交反馈','Still playing; just sending feedback')}</option><option value="finished">${tr('已经打完一局','Finished the match')}</option><option value="confusing">${tr('不知道下一步','Unsure what to do next')}</option><option value="boring">${tr('觉得无聊 / 节奏不合适','Bored / pace did not suit me')}</option><option value="slow">${tr('卡顿影响游玩','Performance got in the way')}</option><option value="bug">${tr('遇到错误，玩不下去','A bug prevented me from continuing')}</option><option value="interrupted">${tr('临时有事，稍后继续','Interrupted; will continue later')}</option><option value="other">${tr('其他 / 不想回答','Other / prefer not to say')}</option></select></label>
 <label>${tr('还想再玩一局吗？（可跳过）','Would you play another match? (optional)')}<select id="trial-return"><option value="unspecified">${tr('跳过','Skip')}</option><option value="yes">${tr('想','Yes')}</option><option value="maybe">${tr('不确定','Maybe')}</option><option value="no">${tr('不想','No')}</option></select></label>
 <label>${tr('你当时想做什么？发生了什么？最想改哪一点？','What were you trying to do? What happened? What should change?')}<textarea maxlength="2000" id="trial-notes"></textarea></label>
 <p>${tr('请勿填写密码、电话或其他隐私。报告包括版本、语言、屏幕尺寸和你选择附带的诊断。不附带完整存档。','Do not include passwords, phone numbers or private details. Reports include build, language, screen size and diagnostics you opted into. Full saves are not included.')}</p>
 <div class="trial-buttons"><button id="trial-share">${tr('分享反馈','Share feedback')}</button><button id="trial-clear">${tr('关闭记录并清除','Disable & clear')}</button><button id="trial-close">${tr('返回游戏','Back to game')}</button></div><p class="trial-status" role="status"></p>`;
 dialog.querySelector('textarea').value=draft;
 dialog.querySelector('#trial-consent').onchange=e=>enable(e.target.checked);
 dialog.querySelector('#trial-close').onclick=()=>dialog.close();
 dialog.querySelector('#trial-clear').onclick=()=>{enable(false);events=[];seen.clear();previous=null;persist();render()};
 dialog.querySelector('#trial-share').onclick=async()=>{
  const ua=navigator.userAgent;
  const report={schema:1,build:window.FrontierPlaytestBuild,language:document.documentElement.lang,environment:{androidVersion:/Android ([\d.]+)/.exec(ua)?.[1]||null,chromiumMajor:/Chrome\/(\d+)/.exec(ua)?.[1]||null,powerSaver:document.querySelector('#power-saver')?.getAttribute('aria-pressed')||null},viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},reason:dialog.querySelector('#trial-reason').value,stopReason:dialog.querySelector('#trial-stop').value,playAgain:dialog.querySelector('#trial-return').value,notes:dialog.querySelector('textarea').value,diagnostics:consent?events.filter(e=>Date.now()-e.at<7*86400000):[]};
  try{if(window.FrontierNative)await window.FrontierNative.exportReport(report);else{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));a.href=url;a.download='frontier-feedback.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}dialog.querySelector('[role=status]').textContent=tr('已交给分享面板；请选择接收人或保存文件。','Handed to sharing; choose a recipient or save the file.')}catch{dialog.querySelector('[role=status]').textContent=tr('分享取消或失败，内容仍保留，可再次尝试。','Sharing cancelled or failed. Your draft is still here; try again.')}
 };
}
function addEntry(parent){if(!parent)return;const b=document.createElement('button');b.className='trial-entry';b.dataset.i18nIgnore='true';const label=()=>b.textContent=tr('试玩反馈与诊断','Playtest feedback & diagnostics');label();b.onclick=()=>{render();dialog.showModal()};parent.append(b);document.addEventListener('kingdom-language-change',label)}
addEntry(document.querySelector('#welcome .modal-content')||document.getElementById('welcome'));
addEntry(document.getElementById('pause-screen'));addEntry(document.getElementById('end-dialog'));
for(const b of document.querySelectorAll('.install-app'))b.hidden=true;
const offline=document.getElementById('offline-status');if(offline){offline.dataset.i18nIgnore='true';const label=()=>offline.textContent=tr('Android 单机试玩 · 素材随安装包提供','Android offline trial · assets included');label();document.addEventListener('kingdom-language-change',label)}
enable(consent);
})();
