#!/usr/bin/env node
'use strict';
/* P2 asset pipeline measurement: memory of a late-game scene and first-load time on a throttled network, in headless Chromium.
   Memory: the late-render scene (4 nations, ~110 units each, 4 armies fighting on screen) on desktop 1920x1080 and on a phone
   profile (393x852, DPR 3, touch => coarse pointer, so the game uses its touch budgets). After the warm-up the page is garbage
   collected (CDP HeapProfiler.collectGarbage) and we report
     - pss:   proportional set size summed over every process of this Chromium instance (/proc/<pid>/smaps_rollup), i.e. what the
              tab costs the machine (the "tab memory" a task manager shows is close to the renderer + gpu share of this);
     - renderer: PSS of the renderer process alone (with --disable-gpu, decoded images and canvas backing stores live here);
     - jsHeap: CDP Runtime.getHeapUsage used size;
     - pixels: decoded bytes of the art still alive after GC — every <img> loaded from assets/ (natural w*h*4) plus every canvas
              created by the page (w*h*4), tracked through WeakRefs.
   Load: a fresh profile (empty HTTP cache, service worker allowed, as on a first visit), CDP network throttling
   (default 20 Mbit/s down, 5 Mbit/s up, 40 ms RTT), time from navigation start until KingdomArt.ready resolves (every art
   module's atlases are prepared and the start button is enabled; KingdomArt.loaded, the core visuals.js atlases, is reported as coreArtMs). Bytes transferred until then are counted from the network log.
   headless --disable-gpu on a shared 2-core box: numbers compare commits on this machine; they are not a device measurement.
   --gpu: SwiftShader GPU process instead of --disable-gpu (canvas/image memory then sits in the GPU process as on a real
   Chrome; rendererPrivateMB is then the closest number to the task manager's tab "memory footprint").
   usage: node scripts/perf/asset-memory.cjs [--gpu] [--only memory|load] [--mbps 20] [--rtt 40] [--secs 6] [--json out.json] [--shot dir] */
const fs=require('node:fs'),path=require('node:path');
const ROOT=process.env.KINGDOM_ROOT||path.resolve(__dirname,'../..');process.env.KINGDOM_ROOT=ROOT;
const {serve}=require(path.join(__dirname,'../release/render-cost.cjs'));
const {args}=require(path.join(__dirname,'../release/lib.cjs'));
const MB=x=>Math.round(x/1048576);
function procTree(rootPid){const kids=new Map();for(const d of fs.readdirSync('/proc')){if(!/^\d+$/.test(d))continue;try{const st=fs.readFileSync(`/proc/${d}/stat`,'utf8'),ppid=+st.slice(st.lastIndexOf(')')+2).split(' ')[1];if(!kids.has(ppid))kids.set(ppid,[]);kids.get(ppid).push(+d)}catch{}}
  const out=[],walk=p=>{out.push(p);for(const k of kids.get(p)||[])walk(k)};walk(rootPid);return out}
function pss(pid){try{const m=fs.readFileSync(`/proc/${pid}/smaps_rollup`,'utf8').match(/^Pss:\s+(\d+) kB/m);return m?+m[1]*1024:0}catch{return 0}}
function privateBytes(pid){try{const t=fs.readFileSync(`/proc/${pid}/smaps_rollup`,'utf8'),g=k=>+(t.match(new RegExp('^'+k+':\\s+(\\d+) kB','m'))||[0,0])[1]*1024;return g('Private_Clean')+g('Private_Dirty')+g('SwapPss')}catch{return 0}}
function cmd(pid){try{return fs.readFileSync(`/proc/${pid}/cmdline`,'utf8')}catch{return ''}}
function browserPid(browser){const pids=fs.readdirSync('/proc').filter(d=>/^\d+$/.test(d)).map(Number).filter(p=>{const c=cmd(p);return /chrom/i.test(c)&&!c.includes('--type=')&&c.includes('--remote-debugging-pipe')});return pids.at(-1)}
const TRACK=`(()=>{window.__assetStacks=${process.env.ASSET_STACKS?'true':'false'};const live=[],ce=Document.prototype.createElement;Document.prototype.createElement=function(t,...a){const e=ce.call(this,t,...a);if(String(t).toLowerCase()==='canvas'){live.push(new WeakRef(e));if(window.__assetStacks)e.__at=(new Error().stack||'').split('\\n').slice(2,3).join('').replace(/^\\s*at /,'').replace(/https?:\\/\\/[^/]+\\//,'').replace(/:\\d+\\)?$/,'')}return e};
  const imgs=[],d=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');Object.defineProperty(HTMLImageElement.prototype,'src',{...d,set(v){if(/assets\\//.test(String(v)))imgs.push(new WeakRef(this));return d.set.call(this,v)}});
  window.__releaseCanvases=()=>{for(const r of live){const c=r.deref();if(c&&!c.isConnected){c.width=0;c.height=0}}};window.__releaseImages=()=>{for(const r of imgs){const i=r.deref();if(i)i.removeAttribute('src')}};window.__assetPixels=()=>{let canvas=0,cn=0,image=0,inn=0;const byImg={},byAt={};/* sources decoded through KingdomArt.image() are canvases: counted in canvasBytes AND listed/added to imageBytes as live decoded sources */for(const r of live){const c=r.deref();if(c&&c.width*c.height>1){canvas+=c.width*c.height*4;cn++;if(c.__decodedImage){const k=String(c.src).replace(/^.*assets\\//,'').replace(/\\?.*$/,'');byImg[k]=(byImg[k]||0)+1;image+=c.width*c.height*4;inn++}if(c.__at)byAt[c.__at]=(byAt[c.__at]||0)+c.width*c.height*4}}for(const r of imgs){const i=r.deref();if(i&&i.complete&&i.naturalWidth){image+=i.naturalWidth*i.naturalHeight*4;inn++;const k=i.src.replace(/^.*assets\\//,'').replace(/\\?.*$/,'');byImg[k]=(byImg[k]||0)+1}}return {canvasBytes:canvas,canvases:cn,imageBytes:image,images:inn,imageList:Object.keys(byImg).sort(),canvasBy:Object.entries(byAt).sort((a,b)=>b[1]-a[1]).slice(0,25).map(([k,v])=>Math.round(v/1048576)+' MB '+k)}}})();`;
async function lateScene(p){await p.evaluate(()=>{const P=KingdomSim.Sim.prototype,t=P.tick;P.tick=function(...a){window.__lateSim=this;return t.apply(this,a)}});
  await p.evaluate(()=>{const set=(id,v)=>{const e=document.getElementById(id);if(!e)return;if(e.tagName==='SELECT'&&![...e.options].some(o=>o.value===String(v))){const o=document.createElement('option');o.value=String(v);o.textContent=String(v);e.append(o)}e.value=String(v);e.dispatchEvent(new Event('change',{bubbles:true}))};
    set('ai-count',3);for(const t of [1,2,3])set('ai-group-'+t,t+1);set('world-map','coast_l')});
  await p.click('#start');await p.waitForFunction(()=>!!window.__lateSim,null,{timeout:60000});await p.waitForTimeout(500);
  return p.evaluate(()=>{const sim=window.__lateSim,s=sim.s,D=KingdomSim.defs,soldiers=['infantry','archer','musketeer','cavalry','halberd','pikeman','longbow'];
    const towns=s.nations.map((_,t)=>s.buildings.find(b=>b.team===t&&b.kind==='town'));const home=towns[0],cx=s.world?s.world.width/2:home.x,cy=s.world?s.world.height/2:home.y,d=Math.hypot(cx-home.x,cy-home.y)||1;
    const bx=home.x+(cx-home.x)/d*350,by=home.y+(cy-home.y)/d*350;for(const t of towns)if(t){t.hp=t.maxhp=t.maxhp*500}
    towns.forEach((town,t)=>{if(!town)return;let have=s.units.filter(u=>u.team===t).length;const ang=t*Math.PI/2+Math.PI/4;
      for(let i=0;have<110;i++,have++){let x,y,kind;if(i<38){kind='villager';x=town.x+Math.cos(i*.7)*(150+(i*37)%200);y=town.y+Math.sin(i*.7)*(150+(i*37)%200)}else{const j=i-38,row=Math.floor(j/10),col=j%10;kind=soldiers[j%soldiers.length];
        x=bx+Math.cos(ang)*(230+row*30)+Math.cos(ang+Math.PI/2)*(col-4.5)*30;y=by+Math.sin(ang)*(230+row*30)+Math.sin(ang+Math.PI/2)*(col-4.5)*30}
        try{const u=sim.add(kind,t,x,y);sim.freeSpawn?.(u);if(kind!=='villager')u.hp=u.maxhp=u.maxhp*6}catch(e){}}
      const army=s.units.filter(u=>u.team===t&&u.kind!=='villager'&&D[u.kind].damage>0&&!sim.sea?.(u)&&!sim.air?.(u)&&Math.hypot(u.x-bx,u.y-by)<700);sim.order(army,{type:'advance',x:bx,y:by})});
    sim.grid=null;sim._gateGrids=null;return {units:s.units.length,nations:s.nations.map(n=>n.key||n.nation||n.id||'?'),kinds:[...new Set(s.units.map(u=>u.kind))].length}})}
async function memory(chromium,port,name,{secs,shot,gpu}){const phone=name==='phone';const browser=await chromium.launch({args:gpu?['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-gpu-rasterization']:['--disable-gpu'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
  try{const ctx=await browser.newContext(phone?{viewport:{width:852,height:393},deviceScaleFactor:3,isMobile:true,hasTouch:true}:{viewport:{width:1920,height:1080}}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
    await p.addInitScript(TRACK);await p.goto(`http://127.0.0.1:${port}/`);await p.waitForFunction(()=>window.KingdomArt&&KingdomArt.loaded,null,{timeout:300000});
    const setup=await lateScene(p);await p.waitForTimeout(1500);await p.waitForFunction(()=>!(KingdomArt.attackStatus?.().pending>0)&&!(KingdomArt.assetStatus?.().pending>0),null,{timeout:120000,polling:250}).catch(()=>{});await p.waitForTimeout(secs*1000);
    const cdp=await ctx.newCDPSession(p);await cdp.send('HeapProfiler.enable');for(let i=0;i<3;i++){await cdp.send('HeapProfiler.collectGarbage');await p.waitForTimeout(400)}
    const heap=await cdp.send('Runtime.getHeapUsage'),pix=await p.evaluate(()=>window.__assetPixels()),status=await p.evaluate(()=>({attack:KingdomArt.attackStatus?.()&&{sets:KingdomArt.attackStatus().loaded.length,mb:Math.round(KingdomArt.attackStatus().bytes/1048576)},assets:KingdomArt.assetStatus?.()||null,dpr:window.FrontierRenderBudget?.dpr,canvasBudget:KingdomArt.canvasBudget?.stats()}));
    const bp=browserPid(browser),tree=bp?procTree(bp):[];let total=0,renderer=0,gpuMem=0,priv=0;for(const pid of tree){const v=pss(pid);total+=v;if(cmd(pid).includes('--type=gpu-process'))gpuMem+=v;if(cmd(pid).includes('--type=renderer')&&!cmd(pid).includes('--extension')&&v>renderer){renderer=v;priv=privateBytes(pid)}}
    if(shot){fs.mkdirSync(shot,{recursive:true});await p.screenshot({path:path.join(shot,`late-${name}.png`)})}
    /* --breakdown: freeze the frame loop, then release (a) every off-screen canvas the page created, (b) every assets/ image, and
       re-measure the renderer after GC: what is left is the renderer's own floor (DOM, V8, compositor, allocator retention). */
    let breakdown=null;if(process.env.ASSET_BREAKDOWN){const rp=tree.find(pid=>cmd(pid).includes('--type=renderer')&&!cmd(pid).includes('--extension')&&pss(pid)>=renderer*.9),gc=async()=>{for(let i=0;i<3;i++){await cdp.send('HeapProfiler.collectGarbage');await p.waitForTimeout(400)}await p.waitForTimeout(1500);return MB(pss(rp))};
      await p.evaluate(()=>{window.requestAnimationFrame=()=>0});await p.waitForTimeout(500);const frozen=await gc();
      await p.evaluate(()=>window.__releaseCanvases());const noCanvas=await gc();await p.evaluate(()=>window.__releaseImages());const noImages=await gc();
      breakdown={frozenMB:frozen,withoutCanvasesMB:noCanvas,withoutImagesMB:noImages}}
    return {...(breakdown?{breakdown}:{}),profile:name,gpu:!!gpu,setup,dpr:status.dpr,pssMB:MB(total),rendererMB:MB(renderer),rendererPrivateMB:MB(priv),gpuProcessMB:MB(gpuMem),jsHeapMB:MB(heap.usedSize),imageMB:MB(pix.imageBytes),images:pix.images,canvasMB:MB(pix.canvasBytes),canvases:pix.canvases,attack:status.attack,canvasBudget:status.canvasBudget,assets:status.assets,imageList:pix.imageList,...(pix.canvasBy.length?{canvasBy:pix.canvasBy}:{}),errors:errors.slice(0,5)}}
  finally{await browser.close()}}
async function load(chromium,port,{mbps,rtt}){const browser=await chromium.launch({args:['--disable-gpu'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
  try{const ctx=await browser.newContext({viewport:{width:1440,height:900}}),p=await ctx.newPage(),cdp=await ctx.newCDPSession(p);let bytes=0,requests=0,stop=false;
    await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:rtt,downloadThroughput:mbps*1e6/8,uploadThroughput:5e6/8});
    const urls=new Map(),per=[];cdp.on('Network.requestWillBeSent',e=>urls.set(e.requestId,e.request.url));cdp.on('Network.loadingFinished',e=>{if(!stop){bytes+=e.encodedDataLength;requests++;per.push([e.encodedDataLength,(urls.get(e.requestId)||'').replace(/^https?:\/\/[^/]+\//,'')])}});
    /* record the moment KingdomArt.ready settles (scripts are classic, so every module has chained onto it by DOMContentLoaded;
       some re-chain later, hence the settle loop). Waiting for the load event instead would also wait for images started after ready. */
    await p.addInitScript(()=>{addEventListener('DOMContentLoaded',()=>{const A=window.KingdomArt;if(!A)return;const wait=()=>{const r=A.ready;r.then(()=>A.ready===r?(window.__readyAt=performance.now()):wait(),()=>{window.__readyAt=-1})};wait()})});
    await p.goto(`http://127.0.0.1:${port}/`,{waitUntil:'domcontentloaded',timeout:600000});await p.waitForFunction(()=>window.__readyAt!==undefined,null,{timeout:600000,polling:100});
    /* playable = KingdomArt.ready resolved (every art module chained onto it; the start button is enabled from it). KingdomArt.loaded alone is only the core visuals.js atlases. */
    const t=await p.evaluate(()=>new Promise(ok=>{const coreAt=null,iv=0;Promise.resolve().then(()=>{clearInterval(iv);const at=window.__readyAt,res=performance.getEntriesByType('resource').filter(e=>e.responseEnd<=at);ok({ready:at,bytes:res.reduce((a,e)=>a+(e.encodedBodySize||0),0),count:res.length,top:res.sort((a,b)=>b.encodedBodySize-a.encodedBodySize).slice(0,12).map(e=>Math.round(e.encodedBodySize/1024)+' KB '+e.name.replace(/^https?:\/\/[^/]+\//,''))})},()=>{clearInterval(iv);ok({ready:-1,core:coreAt})})}));const ms=Math.round(t.ready);stop=true;
    return {mbps,rttMs:rtt,toPlayableMs:ms,bodyMBBeforeReady:Math.round(t.bytes/1048576*10)/10,requestsBeforeReady:t.count,largestBeforeReady:t.top,transferredMB:Math.round(bytes/1048576*10)/10,requests,largest:per.sort((a,b)=>b[0]-a[0]).slice(0,25).map(([b,u])=>Math.round(b/1024)+' KB '+u)}}
  finally{await browser.close()}}
async function run({only,mbps=20,rtt=40,secs=6,shot,gpu=false}={}){let chromium;try{({chromium}=require('playwright'))}catch(e){return {skipped:'playwright not available: '+e.message}}
  const server=await serve(),port=server.address().port,out={};try{
    if(only!=='load'){out.desktop=await memory(chromium,port,'desktop',{secs,shot,gpu});out.phone=await memory(chromium,port,'phone',{secs,shot,gpu})}
    if(only!=='memory')out.load=await load(chromium,port,{mbps,rtt});return out}finally{server.close()}}
module.exports={run};
if(require.main===module){const a=args();run({gpu:!!a.gpu,only:a.only,mbps:+(a.mbps||20),rtt:+(a.rtt||40),secs:+(a.secs||6),shot:a.shot}).then(r=>{if(a.json)fs.writeFileSync(a.json,JSON.stringify(r,null,1));console.log(JSON.stringify(r,null,1))}).catch(e=>{console.error(e);process.exit(1)})}
