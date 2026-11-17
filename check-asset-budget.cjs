/* P2 asset budget: every atlas the code names exists and has a current sized copy, decoded pixels stay under budget,
   and the service worker precache holds only sized, referenced, first-screen images. Pure Node (no Python, no browser). */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const PUB=path.join(__dirname,'public'),ASSETS=path.join(PUB,'assets'),manifest=JSON.parse(fs.readFileSync(path.join(ASSETS,'sized/manifest.json'),'utf8'));
const MB=1048576,BUDGET={bootDecodedMB:260,allDecodedMB:470,precacheImageMB:40,largestPrecacheImageMB:1.5};
const {lazyAtlases}=require('./scripts/art/size-assets.cjs');
/* 1. atlases named by code (literals, manifests, the detail-art list) exist, and each has a sized copy */
const js=fs.readdirSync(PUB).filter(f=>/\.(js|css|html)$/.test(f)&&f!=='sw.js');const named=new Set();
for(const f of js){const t=fs.readFileSync(path.join(PUB,f),'utf8');for(const m of t.matchAll(/assets\/([A-Za-z0-9_.-]+\.(?:png|jpg))/g))named.add(m[1]);for(const m of t.matchAll(/'([a-z0-9-]+-v\d+\.(?:png|jpg))'/g))named.add(m[1])}
for(const m of ['attack-manifest.json','direction-manifest.json']){const t=fs.readFileSync(path.join(PUB,m),'utf8');for(const x of t.matchAll(/assets\/([A-Za-z0-9_.-]+\.(?:png|jpg))/g))named.add(x[1])}
for(const f of named)assert(fs.existsSync(path.join(ASSETS,f)),'Referenced atlas missing: '+f);
const icons=new Set(['app-180.png','app-192.png','app-512.png']);
for(const f of named)if(!icons.has(f))assert(manifest.assets[f],'Referenced atlas has no sized copy (run node scripts/art/size-assets.cjs): '+f);
for(const f of manifest.unreferenced)assert(!named.has(f),'Atlas listed as unreferenced is referenced again: '+f);
/* 2. sized copies are current: source hash, file present, runtime tables in sync */
for(const [f,a] of Object.entries(manifest.assets)){const hash=crypto.createHash('sha1').update(fs.readFileSync(path.join(ASSETS,f))).digest('hex').slice(0,12);assert.equal(a.hash,hash,'Stale sized copy (source changed): '+f);assert(fs.existsSync(path.join(ASSETS,a.out)),'Missing '+a.out);assert(a.scale>0&&a.scale<=1);assert(a.w<=a.srcW&&a.h<=a.srcH)}
const table=JSON.parse(/\/\*P2-SIZED\*\/(\{[^]*?\})\/\*P2-SIZED-END\*\//.exec(fs.readFileSync(path.join(PUB,'visuals.js'),'utf8'))[1]);
assert.deepEqual(table,Object.fromEntries(Object.entries(manifest.assets).map(([k,v])=>[k,v.scale])),'visuals.js SIZED table out of date');
const sw=fs.readFileSync(path.join(PUB,'sw.js'),'utf8'),swTable=JSON.parse(/\/\*P2-SW\*\/(\{[^]*?\})\/\*P2-SW-END\*\//.exec(sw)[1]),lazy=lazyAtlases();
assert.deepEqual(swTable.sized,Object.keys(manifest.assets),'sw.js sized list out of date');assert.deepEqual(swTable.lazy,lazy,'sw.js lazy list out of date');
/* 3. decoded pixel budget (w*h*4 of the sized atlases) */
const lazySet=new Set(lazy),dec=a=>a.w*a.h*4;let boot=0,all=0;for(const [f,a] of Object.entries(manifest.assets)){all+=dec(a);if(!lazySet.has(f))boot+=dec(a)}
assert(boot/MB<=BUDGET.bootDecodedMB,`Non-lazy atlases decode to ${(boot/MB).toFixed(0)} MB > ${BUDGET.bootDecodedMB} MB`);assert(all/MB<=BUDGET.allDecodedMB,`All atlases decode to ${(all/MB).toFixed(0)} MB > ${BUDGET.allDecodedMB} MB`);
/* 4. precache: only referenced, sized (or icon) images; no on-demand atlas; nothing large */
const sandbox={self:{addEventListener(){}},caches:{},fetch(){},Response:{}};const fn=new Function(...Object.keys(sandbox),sw+';return precacheList()');const list=fn(...Object.values(sandbox));let bytes=0;
for(const u of list){const rel=u.replace(/^\.\//,'').replace(/[?#].*$/,'');if(!rel)continue;assert(fs.existsSync(path.join(PUB,rel)),'Precache entry missing: '+u);if(!/\.(png|jpg|jpeg|webp)$/.test(rel))continue;
  const name=path.basename(rel),size=fs.statSync(path.join(PUB,rel)).size;bytes+=size;assert(rel.startsWith('assets/sized/')||icons.has(name),'Precache holds an unsized image: '+u);
  const src=Object.keys(manifest.assets).find(k=>manifest.assets[k].out==='sized/'+name);if(src){assert(named.has(src),'Precache holds an unreferenced atlas: '+u);assert(!lazySet.has(src),'Precache holds an on-demand atlas: '+u)}
  assert(size/MB<=BUDGET.largestPrecacheImageMB,`Precached image over ${BUDGET.largestPrecacheImageMB} MB: ${u}`)}
assert(bytes/MB<=BUDGET.precacheImageMB,`Precached images ${(bytes/MB).toFixed(1)} MB > ${BUDGET.precacheImageMB} MB`);
/* 5. trimmed SFX exist */
for(const k of Object.keys(JSON.parse(fs.readFileSync(path.join(PUB,'audio/sized/manifest.json'),'utf8')).files))assert(fs.existsSync(path.join(PUB,'audio/sized',k+'.mp3')),'Missing trimmed audio '+k);
console.log(`PASS asset budget: ${named.size} referenced atlases sized; decoded ${(boot/MB).toFixed(0)} MB non-lazy / ${(all/MB).toFixed(0)} MB all; precache ${list.length} entries, images ${(bytes/MB).toFixed(1)} MB`);
