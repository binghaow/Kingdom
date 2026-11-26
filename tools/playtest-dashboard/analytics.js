(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.PlaytestAnalytics=api})(typeof window==='undefined'?globalThis:window,()=>{
'use strict';
const columns=['row_type','record_id','session_id','install_id','build','channel','occurred_at','active_seconds','event','phase','duration_ms','reason','stop_reason','play_again','likes','complaints','suggestions','notes','payload_json'];
function parseCSV(text){
 text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],value='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){value+='"';i++}else if(c==='"')quoted=false;else value+=c}else if(c==='"'){if(value)throw Error('CSV 引号位置无效');quoted=true}else if(c===','){row.push(value);value=''}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some(Boolean))rows.push(row);row=[];value=''}else value+=c}
 if(quoted)throw Error('CSV 引号未闭合');row.push(value);if(row.some(Boolean))rows.push(row);if(!rows.length)return [];
 const header=rows.shift();if(new Set(header).size!==header.length)throw Error('CSV 重复列名');if(!header.includes('row_type'))throw Error('CSV 缺少 row_type 列；请使用模板');if(header.some(h=>!columns.includes(h)))throw Error('CSV 含未知列；请使用模板，避免丢失字段');
 return rows.map((r,i)=>{if(r.length!==header.length)throw Error('CSV 第 '+(i+2)+' 行列数不符');return Object.fromEntries(header.map((h,j)=>[h,r[j]]))});
}
function csvCell(value){let v=String(value??'');if(/^[\s]*[=+@-]/.test(v))v="'"+v;return '"'+v.replaceAll('"','""')+'"'}
const toCSV=rows=>'\uFEFF'+[columns.map(csvCell).join(','),...normalize(rows).map(r=>columns.map(k=>csvCell(r[k])).join(','))].join('\r\n');
function fromReport(report){
 if(!report||!Array.isArray(report.diagnostics))throw Error('不是当前试玩报告 JSON');
 const base={build:report.build?.source||'',channel:report.build?.channel||'manual-file'};
 const {diagnostics,...context}=report;
 const out=[{...base,row_type:'feedback',reason:report.reason||'',stop_reason:report.stopReason||'',play_again:report.playAgain||'',notes:report.notes||'',likes:report.likes||'',complaints:report.complaints||'',suggestions:report.suggestions||'',payload_json:JSON.stringify(context)}];
 const sessions=new Set();
 for(const e of report.diagnostics){if(!e||!Number.isFinite(e.at))continue;const sid=e.session||'';if(sid&&!sessions.has(sid)){sessions.add(sid);out.push({...base,row_type:'session',session_id:sid})}
 out.push({...base,row_type:'event',session_id:sid,occurred_at:new Date(e.at).toISOString(),event:e.type||'',phase:'',duration_ms:'',payload_json:JSON.stringify(e)});}
 // Old reports have no install ID or reliable active-time counter; never infer either from timestamps.
 return out;
}
function stableID(text){let hash=14695981039346656037n;for(let i=0;i<text.length;i++)hash=BigInt.asUintN(64,(hash^BigInt(text.charCodeAt(i)))*1099511628211n);return 'local-'+hash.toString(16)}
function normalize(rows){return rows.map(r=>{if(!['feedback','session','event'].includes(r.row_type))throw Error('未知 row_type: '+r.row_type);const row=Object.fromEntries(columns.map(k=>[k,String(r[k]??'')]));if(!row.record_id)row.record_id=stableID(JSON.stringify(row));return row})}
function dedupe(rows){const seen=new Set();return normalize(rows).filter(r=>{const key=r.record_id?r.row_type+':'+r.record_id:JSON.stringify(r);if(seen.has(key))return false;seen.add(key);return true})}
const number=v=>String(v).trim()!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
function grouped(rows,key){const counts=new Map();for(const r of rows){const name=r[key]||'未回答';counts.set(name,(counts.get(name)||0)+1)}return [...counts].sort((a,b)=>b[1]-a[1])}
function summary(input){
 const rows=dedupe(input),feedback=rows.filter(r=>r.row_type==='feedback'),sessionRows=rows.filter(r=>r.row_type==='session');
 // One session may have several updates. Use its largest cumulative active_seconds, never sum heartbeats.
 const sessions=new Map();for(const r of sessionRows){if(!r.session_id)continue;const prior=sessions.get(r.session_id);if(!prior||((number(r.active_seconds)??-1)>(number(prior.active_seconds)??-1)))sessions.set(r.session_id,r)}
 const known=[...sessions.values()].filter(r=>number(r.active_seconds)!==null),ids=new Set([...sessions.values()].map(r=>r.install_id).filter(Boolean));
 const phases=new Map();for(const r of rows){const ms=number(r.duration_ms);if(r.row_type!=='event'||r.event!=='phase_interval'||!r.phase||ms===null)continue;phases.set(r.phase,(phases.get(r.phase)||0)+ms/1000)}
 const themes=[['操作与引导',/操作|不会|不知道|教程|control|confus|tutorial/i],['性能与响应',/卡顿|延迟|掉帧|发热|lag|stutter|slow|frame/i],['节奏与难度',/太难|太易|无聊|节奏|boring|difficult|too easy|pace/i],['错误与存档',/错误|闪退|存档|崩溃|bug|crash|save/i]];
 const hints=themes.map(([name,re])=>[name,feedback.filter(r=>re.test([r.notes,r.complaints,r.suggestions].join(' '))).length]).filter(x=>x[1]);
 return {rows,feedback,sessions:sessions.size,knownTimeSessions:known.length,totalActiveSeconds:known.reduce((n,r)=>n+number(r.active_seconds),0),uniqueInstallations:ids.size,identifiedSessions:[...sessions.values()].filter(r=>r.install_id).length,exitReasons:grouped(feedback,'stop_reason'),issues:grouped(feedback,'reason'),playAgain:grouped(feedback,'play_again'),phases:[...phases].sort((a,b)=>b[1]-a[1]),hints};
}
return {columns,parseCSV,toCSV,fromReport,normalize,dedupe,summary};
});
