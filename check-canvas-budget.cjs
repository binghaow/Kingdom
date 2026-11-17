'use strict';
/* Memory budget (docs/memory-budget.md), part of check-all:
   1. the shared runtime canvas cache (KingdomArt.canvasBudget in visuals.js) - byte accounting, one LRU order across caches, eviction
      down to 90% of the limit, entries used in the current/previous frame are never evicted (overshoot reported instead), onEvict
      callbacks, Map-compatible API, desktop/touch/low-memory/?canvasBudget limits;
   2. every art module decodes atlases through KingdomArt.image() (createImageBitmap -> canvas, no lingering decoded <img>), and the
      derived-canvas caches listed in the doc are registered with the budget instead of private unbounded/large Maps. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'public/visuals.js'),'utf8'),a=src.indexOf('const canvasBudget=(()=>{'),b=src.indexOf('art.canvasBudget=canvasBudget;');
assert(a>0&&b>a,'visuals.js defines the canvas budget');
const code=src.slice(a,b)+';canvasBudget';
class Canvas{constructor(w=1,h=1){this.width=w;this.height=h}getContext(){return {}}}
function load({coarse=false,memory=8,query=''}={}){const frames=[];const ctx={URLSearchParams,location:{search:query},matchMedia:q=>({matches:coarse&&/coarse/.test(q)}),navigator:{deviceMemory:memory},requestAnimationFrame:f=>frames.push(f),ArrayBuffer,Math,Map,Object,Symbol};
  const budget=vm.runInNewContext(code,ctx);return {budget,nextFrame:()=>{const f=frames.shift();assert(f,'frame loop');f()}}}
const MB=1048576,mb=n=>new Canvas(1024,256*n);/* n MB canvas */
// limits
assert.equal(load().budget.limit,160*MB,'desktop 160 MB');assert.equal(load({coarse:true}).budget.limit,96*MB,'touch 96 MB');
assert.equal(load({memory:4}).budget.limit,64*MB,'deviceMemory<=4: 64 MB');assert.equal(load({query:'?canvasBudget=200'}).budget.limit,200*MB,'?canvasBudget override');
// accounting + LRU across caches + frame protection
{const {budget,nextFrame}=load({query:'?canvasBudget=10'}),evicted=[];const t=budget.cache('tints',{onEvict:(k,v,by)=>evicted.push(['t',k,by])}),m=budget.cache('masks',{onEvict:k=>evicted.push(['m',k])});
  assert.equal(budget.cache('tints'),t,'same name returns the same cache');
  t.set('a',mb(2));m.set('x',{canvas:mb(2),alpha:new Uint8Array(MB)});t.set('b',mb(2));
  assert.equal(budget.bytes,7*MB,'canvas + nested canvas + typed array bytes');assert.equal(m.bytes,3*MB);
  nextFrame();nextFrame();t.get('a');/* 'a' is now the most recently used */
  t.set('c',mb(4));/* 11 MB > 10: evict the least recently used entries not used in this/previous frame down to 9 MB: x (3 MB, older than b) */
  assert.deepEqual(evicted,[['m','x']],'global LRU order across caches');assert.equal(budget.bytes,8*MB);assert(t.has('a')&&t.has('b')&&t.has('c')&&!m.has('x'));
  nextFrame();nextFrame();t.get('a');t.get('c');t.set('h',mb(3));/* 11 MB: b is now the oldest unused */assert.deepEqual(evicted,[['m','x'],['t','b',true]],'tint b evicted next, with the by-budget flag');assert(!t.has('b'));
  // everything in use this frame: overshoot instead of thrashing
  evicted.length=0;t.set('d',mb(4));t.get('a');t.get('c');t.get('h');t.set('e',mb(4));assert.deepEqual(evicted,[],'entries used this frame are never evicted');assert(budget.stats().overshootMB>0,'overshoot reported');
  nextFrame();nextFrame();t.set('f',mb(1));assert(budget.bytes<=10*MB,'old entries evicted once they leave the frame window');
  // Map-compatible API used by the modules
  t.set('g',mb(1));assert.equal(typeof t.keys().next().value,'string');assert.equal([...t].length,t.size);assert.equal([...t.values()].length,t.size);
  const before=budget.bytes;assert(t.delete('g'));assert.equal(budget.bytes,before-MB,'delete releases bytes (no onEvict)');
  const n=evicted.length;t.clear();assert.equal(t.size,0);assert.equal(t.bytes,0);assert.equal(evicted.length,n,'clear is not an eviction');
  t.set('s',{bytes:5},2*MB);assert.equal(t.bytes,2*MB,'explicit size');const st=budget.stats();assert(st.caches.tints&&st.caches.masks&&st.evicted>=2);}
console.log('PASS canvas budget: byte accounting, one LRU across caches, frame-protected eviction to 90%, overshoot reporting, Map API, 160/96/64 MB limits');
// modules
const pub=path.join(__dirname,'public'),files=fs.readdirSync(pub).filter(f=>f.endsWith('.js')&&!/preview|kingdom-core|consistency|^sw\.js$|^visuals\.js$/.test(f)/* visuals.js holds the decoder and its <img> fallback */);
const direct=files.filter(f=>/new Image\(\)/.test(fs.readFileSync(path.join(pub,f),'utf8').replace(/\(globalThis\.KingdomArt\?\.image\?\.\(\)\|\|new Image\(\)\)/g,'')));
assert.deepEqual(direct,[],'art modules must decode atlases through KingdomArt.image() (createImageBitmap into a canvas), not new Image(): '+direct.join(', '));
const want={'attack-art.js':['attack-art:sets','attack-art:tints'],'detail-art.js':['detail-art:tints'],'direction-art.js':['direction-art:tints'],'interaction-art.js':['interaction-art:tints'],'precision-picking.js':['precision-picking:cache','precision-picking:poseCache','precision-picking:ghosts'],'painted-architecture.js':['painted-architecture:cache'],'troop-art.js':['troop-art:cache'],'wall-art.js':['wall-art:tinted'],'building-damage-art.js':['building-damage-art:masks'],'painted-troops.js':['painted-troops:variants'],'dynasty-art.js':['dynasty-art:variants'],'architecture-art.js':['architecture-art:cache'],'unit-motion.js':['unit-motion:gait'],'visuals.js':['visuals:red']};
for(const [f,names] of Object.entries(want)){const t=fs.readFileSync(path.join(pub,f),'utf8');for(const n of names)assert(t.includes(`'${n}'`),`${f} registers ${n} with the canvas budget`)}
assert(!/MAX_BYTES=\(coarse\?80:160\)\*1024\*1024,TINT_BYTES/.test(fs.readFileSync(path.join(pub,'attack-art.js'),'utf8').replace(/A\.canvasBudget\?A\.canvasBudget\.limit:\(coarse\?80:160\)/,'')),'attack-art caps come from the shared budget');
console.log(`PASS ${files.length} browser modules: atlases decoded via KingdomArt.image(), ${Object.values(want).flat().length} derived-canvas caches registered with the shared budget`);
