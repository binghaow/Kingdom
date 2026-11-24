#!/usr/bin/env node
'use strict';
/* P2 asset pipeline: public/assets/*.png|jpg (the authored sources, never edited) -> public/assets/sized/*.webp.
   Each atlas is scaled to what can actually reach the screen (see scripts/art/measure-draw-sizes.cjs, draw-sizes.json):
     need = min(1, cap m, k x DESIGN_ZOOM x DESIGN_DPR)
   where m is the smallest scale an offscreen cut already applies (e.g. attack frames capped to 160-224 px, icons to 120 px,
   the terrain bake) and k the screen scale per unit of zoom x DPR. Paths we cannot follow (patterns, unreached atlases) stay 1.
   Action atlases are sized analytically: frame cap (attack-art.js decode limit) / largest single-cell alpha extent.
   Then +5 % margin, rounded up to a 0.05 step; >= 0.95 keeps full size. Resize is premultiplied Lanczos (no dark halos);
   encoding is WebP, lossy colour (q=QUALITY) with lossless alpha. Safari/iOS decode WebP (with alpha) since 14.
   Writes public/assets/sized/<name>.webp, public/assets/sized/manifest.json and the SIZED table in public/visuals.js
   (KingdomArt.src maps 'assets/x.png' -> 'assets/sized/x.webp'). Unchanged sources are skipped (sha1 in the manifest).
   usage: node scripts/art/size-assets.cjs [--force] [--check]   (--check: exit 1 if anything is stale; used by check-asset-budget) */
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..'),SRC=path.join(ROOT,'public/assets'),OUT=path.join(SRC,'sized'),MANIFEST=path.join(OUT,'manifest.json');
const DESIGN_ZOOM=2,DESIGN_DPR=2,QUALITY=92,MARGIN=1.05;
/* Never resized/converted: app icons (manifest/apple-touch), CSS-only use stays on the PNG too (imperial.css world-atlas). */
const CSS_COPIES=['world-atlas.png'];
const SKIP=new Set(['app-180.png','app-192.png','app-512.png']);
/* Not referenced by any code (superseded); kept in the repo as source, not deployed. */
const UNREFERENCED=new Set(['carrier-v34.png']);
/* Paths the tracer cannot see, sized by reading the code (reason kept in the manifest). */
const MANUAL={
  'meadow.jpg':{scale:520/1254,why:'visuals.js art.terrain draws it once into a 520x520 pattern tile'},
  'terrain-materials-v2.png':{scale:192/(1774/4),why:'architecture-art.js resamples each 443 px material cell to a 192 px canvas before using it as a pattern'},
  'livestock.png':{scale:112/(1774/4),why:'world-art.js cut() resamples each 443 px cell to a fixed 112 px frame'},
};
/* Atlases the tracer saw only through icons/offscreen caches (k = 0). A k = 0 result alone is not trusted (a 1:1 path the zoo
   did not exercise would be missed, e.g. landmark-art draws ten-capitals cells at full size); only these audited ones use the cap. */
const VERIFIED_CAP={
  'units-atlas.png':'visuals.js tiles for villager/infantry/archer/cavalry: superseded on screen by direction/attack art; used for 120 px icons and as the loading fallback',
  'expansion-units.png':'visuals.js musketeer/grenadier/cannon/healer tiles: superseded on screen; icons + loading fallback',
  'reinforcements.png':'visuals.js halberd/skirmisher/hussar/mortar tiles: superseded on screen; icons + loading fallback',
  'naval-atlas.png':'visuals.js ship/dock tiles: superseded by ships-v3 / painted architecture; icons + fallback',
  'nation-buildings.png':'visuals.js lumbercamp/quarry/bath/... tiles: superseded by painted architecture; icons + fallback',
  'imperial-units.png':'dynasty-art.js cut() resamples every cell to a fixed 128 px frame',
  'kc-encounter.png':'world-art.js cut() resamples every cell to a fixed 192 px frame',
};
const py=(req)=>{const r=spawnSync(process.env.KINGDOM_PYTHON || 'python3',['-I','-X','utf8',path.join(__dirname,'resize_assets.py')],{input:JSON.stringify(req),encoding:'utf8',maxBuffer:64<<20});if(r.status!==0)throw Error('resize_assets.py failed: '+r.stderr);return JSON.parse(r.stdout)};
const step=s=>{const v=Math.min(1,Math.ceil(s*MARGIN*20-1e-9)/20);return v>=.95?1:Math.max(.1,v)};
function plan(){const draw=JSON.parse(fs.readFileSync(path.join(__dirname,'draw-sizes.json'),'utf8')),need=draw.need,limits=draw.attackLimits||{},ZD=DESIGN_ZOOM*DESIGN_DPR;
  const files=fs.readdirSync(SRC).filter(f=>/\.(png|jpg)$/.test(f)&&!SKIP.has(f)&&!UNREFERENCED.has(f)).sort();
  const attack=files.filter(f=>limits[f]);const ext=attack.length?py({mode:'attack-extent',files:attack.map(f=>path.join(SRC,f))}):{};
  return files.map(f=>{let scale=1,why='unreached by the tracer: full size, format only';const n=need[f];
    if(MANUAL[f]){scale=MANUAL[f].scale;why=MANUAL[f].why}
    else if(limits[f]){const e=ext[path.join(SRC,f)];scale=Math.min(1,limits[f]/e.cell);why=`attack-art decode caps frames at ${limits[f]} px; largest cell ${e.cell} px`}
    else if(n&&n.full){why='used as a canvas pattern: full size'}
    else if(n&&n.k>0){scale=Math.min(1,n.m,n.k*ZD);why=`screen ${n.k.toFixed(3)} px/px at zoom x DPR 1 (x${ZD} = ${(n.k*ZD).toFixed(2)}), offscreen cap ${n.m.toFixed(2)}`}
    else if(n&&VERIFIED_CAP[f]){scale=Math.min(1,n.m);why=VERIFIED_CAP[f]+`; cap ${n.m.toFixed(2)}`}
    else if(n){why=`only icons seen (cap ${n.m.toFixed(2)}) but not audited: full size`}
    return {file:f,scale:step(scale),raw:Math.round(scale*1000)/1000,why}})}
function run({force=false,check=false}={}){const items=plan(),old=fs.existsSync(MANIFEST)?JSON.parse(fs.readFileSync(MANIFEST,'utf8')):{assets:{}};
  const hashes=py({mode:'hash',files:items.map(i=>path.join(SRC,i.file))}),jobs=[],stale=[];
  for(const it of items){it.hash=hashes[path.join(SRC,it.file)];it.out=it.file.replace(/\.(png|jpg)$/,'.webp');const prev=old.assets[it.file];
    if(force||!prev||prev.hash!==it.hash||prev.scale!==it.scale||prev.quality!==QUALITY||!fs.existsSync(path.join(OUT,it.out))){stale.push(it.file);jobs.push({src:path.join(SRC,it.file),dst:path.join(OUT,it.out),scale:it.scale,quality:QUALITY})}}
  /* full-size WebP copies for CSS that shows an atlas cell larger than the game does (imperial.css welcome art: 315 px CSS, cell 443 px) */
  const css=CSS_COPIES.map(f=>({src:path.join(SRC,f),dst:path.join(OUT,f.replace(/\.(png|jpg)$/,'.full.webp')),scale:1,quality:QUALITY})).filter(j=>force||!fs.existsSync(j.dst)||fs.statSync(j.dst).mtimeMs<fs.statSync(j.src).mtimeMs);
  if(check)return {stale:[...stale,...css.map(j=>path.basename(j.dst))]};
  if(css.length)py({mode:'resize',jobs:css});
  const done=jobs.length?py({mode:'resize',jobs}):[],byDst=new Map(done.map(d=>[d.dst,d]));
  const assets={};for(const it of items){const d=byDst.get(path.join(OUT,it.out)),prev=old.assets[it.file];const info=d?{w:d.w,h:d.h,bytes:d.bytes,srcW:d.srcW,srcH:d.srcH,srcBytes:d.srcBytes}:{w:prev.w,h:prev.h,bytes:prev.bytes,srcW:prev.srcW,srcH:prev.srcH,srcBytes:prev.srcBytes};
    assets[it.file]={out:'sized/'+it.out,scale:it.scale,raw:it.raw,why:it.why,hash:it.hash,quality:QUALITY,...info}}
  for(const f of fs.readdirSync(OUT))if(f.endsWith('.webp')&&!f.endsWith('.full.webp')&&!items.some(i=>i.out===f))fs.rmSync(path.join(OUT,f));
  const manifest={generated:'scripts/art/size-assets.cjs',design:{zoom:DESIGN_ZOOM,dpr:DESIGN_DPR,quality:QUALITY,margin:MARGIN},unreferenced:[...UNREFERENCED],assets};
  fs.writeFileSync(MANIFEST,JSON.stringify(manifest,null,1)+'\n');
  /* the runtime table (scale per atlas) lives in visuals.js so every art module can call KingdomArt.src() synchronously */
  const vis=path.join(ROOT,'public/visuals.js'),text=fs.readFileSync(vis,'utf8'),table=JSON.stringify(Object.fromEntries(Object.entries(assets).map(([k,v])=>[k,v.scale])));
  const next=text.replace(/\/\*P2-SIZED\*\/[\s\S]*?\/\*P2-SIZED-END\*\//,`/*P2-SIZED*/${table}/*P2-SIZED-END*/`);if(next===text&&!text.includes(`/*P2-SIZED*/${table}`))throw Error('visuals.js has no /*P2-SIZED*/ table');fs.writeFileSync(vis,next);
  /* service worker: which SHELL atlases have a sized copy, and which load on demand (not precached) */
  const swPath=path.join(ROOT,'public/sw.js'),sw=fs.readFileSync(swPath,'utf8'),sw2=sw.replace(/\/\*P2-SW\*\/[\s\S]*?\/\*P2-SW-END\*\//,`/*P2-SW*/${JSON.stringify({sized:Object.keys(assets),lazy:lazyAtlases()})}/*P2-SW-END*/`);if(!sw.includes('/*P2-SW*/'))throw Error('sw.js has no /*P2-SW*/ table');fs.writeFileSync(swPath,sw2);
  return {resized:done.length,total:items.length,decodedBefore:items.reduce((a,i)=>a+assets[i.file].srcW*assets[i.file].srcH*4,0),decodedAfter:items.reduce((a,i)=>a+assets[i.file].w*assets[i.file].h*4,0),bytesBefore:items.reduce((a,i)=>a+assets[i.file].srcBytes,0),bytesAfter:items.reduce((a,i)=>a+assets[i.file].bytes,0)}}
/* Atlases loaded only when needed: every action atlas (attack-art.js, per present unit kind) and the direction groups outside BOOT_GROUPS. */
function lazyAtlases(){const base=f=>f.replace(/^.*assets\//,'').replace(/[?#].*$/,''),attack=require(path.join(ROOT,'public/attack-manifest.json')).entries.map(e=>base(e.source)),dirs=require(path.join(ROOT,'public/direction-manifest.json')),art=fs.readFileSync(path.join(ROOT,'public/direction-art.js'),'utf8'),m=/BOOT_GROUPS=new Set\((\[[^\]]*\])\)/.exec(art);if(!m)throw Error('direction-art.js BOOT_GROUPS not found');const boot=new Set(JSON.parse(m[1].replace(/'/g,'"')));
  return [...new Set(['little-ant-icon-v1.png','little-ant-v1.png','panda-attack-v1.png','panda-idle-v1.png','panda-walk-v1.png',...attack,...dirs.groups.filter(g=>!boot.has(g.id)).map(g=>base(g.source))])].sort()}
module.exports={run,plan,lazyAtlases};
if(require.main===module){const a=process.argv.slice(2);const r=run({force:a.includes('--force'),check:a.includes('--check')});if(r.stale){if(r.stale.length){console.error('stale sized assets: '+r.stale.join(', '));process.exit(1)}console.log('sized assets up to date');return}
  const M=x=>(x/1048576).toFixed(1);console.log(`resized ${r.resized}/${r.total}; decoded ${M(r.decodedBefore)} -> ${M(r.decodedAfter)} MB; files ${M(r.bytesBefore)} -> ${M(r.bytesAfter)} MB`)}
