/* Unit information panel (roster-redesign.md section 5): every multiplier the panel and the ⓘ dialog display must equal
   the simulation's own rule functions, and those must equal the damage a real strike deals. Also checks that the panel
   never writes simulation state and that both languages render. Runs the real public/unit-intel.js renderer in a VM. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),K=require('./public/network-model.js'),D=K.defs,done=[];
function test(n,f){f();done.push(n)}
const pure=require('./public/unit-intel.js');
/* Browser half of unit-intel.js with a minimal window/document: only string builders are exercised. */
const doc={documentElement:{lang:'zh'},addEventListener(){},querySelector(){return null},createElement(){return {dataset:{},append(){},addEventListener(){}}}};
const win={KingdomSim:K,KingdomArt:{icon:k=>'icon/'+k}};
const g={window:win,document:doc,globalThis:null};g.globalThis=win;
vm.runInNewContext(fs.readFileSync('./public/locale-data.js','utf8'),{window:win,globalThis:win});
for(const f of ['locale-extra.js','chat-locale.js','network-locale.js','locale-guardians.js','locale-terrain.js','locale-economy.js','locale-campaign.js','locale-clarity.js'])if(fs.existsSync('./public/'+f))vm.runInNewContext(fs.readFileSync('./public/'+f,'utf8'),{window:win,globalThis:win,document:doc});
vm.runInNewContext(fs.readFileSync('./public/locale-core.js','utf8'),{window:win,globalThis:win});
vm.runInNewContext(fs.readFileSync('./public/unit-intel.js','utf8'),{window:win,document:doc,ResizeObserver:undefined});
const UI=win.UnitIntelUI,I=win.UnitIntel;
function make(nation='britain',team1='france'){const s=new K.Sim('normal',null,{nations:[nation,team1],groups:[1,2],fog:false,mapId:'lake_s',seed:31});s.ai=()=>{};s.raids=()=>{};s.scout=()=>{};return s}
const kinds=pure.trainable(),num=t=>Number(t.replace('×',''));
const shown=html=>[...html.matchAll(/<span class="ui-unit" data-kind="([a-z_0-9]+)">[\s\S]*?<b>(×[\d.]+)<\/b><\/span>/g)].map(m=>({kind:m[1],mult:num(m[2])}));
function split(html){const i=html.indexOf('<div><h4>⚠');assert(i>0,'dialog has the second column');return {good:html.slice(0,i),bad:html.slice(i)}}

test('Roster covers every trainable unit and the rule functions are exported once from the simulation',()=>{assert(kinds.length>=50,'trainable units: '+kinds.length);for(const k of kinds)assert(D[k]&&!D[k].building,k);
 for(const f of ['counterMultiplier','structureMultiplier','structureFollowup'])assert.equal(typeof K[f],'function',f);
 const ui=fs.readFileSync('public/unit-intel.js','utf8');assert(!/1\.65|2\.3|\*\s*3\b/.test(ui.replace(/\/\*[\s\S]*?\*\//g,'')),'the UI must not contain hand-written multipliers')});

test('ⓘ dialog: both counter columns list exactly the units the simulation multiplier favours, with the same values',()=>{const sim=make();let pairs=0;
 for(const a of kinds){const e={kind:a,team:0,rank:0},out=UI.dialog(sim,e),{good,bad}=split(out.body);
  const strike=pure.attackPath(sim,a)==='strike',expectGood=new Map(),expectBad=new Map();
  for(const t of kinds){const m=strike?K.counterMultiplier(a,t):1;if(m>1)expectGood.set(t,m);const path=pure.attackPath(sim,t);const r=path==='strike'?K.counterMultiplier(t,a):1;if(r>1)expectBad.set(t,r)}
  const g=shown(good),b=shown(bad);assert.equal(g.length,expectGood.size,a+' counters listed');assert.equal(b.length,expectBad.size,a+' threats listed');
  for(const x of g){assert.equal(x.mult,Math.round(expectGood.get(x.kind)*100)/100,a+'>'+x.kind);pairs++}
  for(const x of b){assert.equal(x.mult,Math.round(expectBad.get(x.kind)*100)/100,x.kind+'>'+a);pairs++}
  const st=(pure.attackPath(sim,a)==='strike'?K.structureMultiplier(a):1)*K.structureFollowup(a),m=good.match(/data-structure="1">[^<]*<b>(×[\d.]+)<\/b>/);
  if(['strike','bomb'].includes(pure.attackPath(sim,a))&&st!==1)assert.equal(m&&num(m[1]),Math.round(st*100)/100,a+' vs buildings');else assert(!m,a+' shows no building bonus')}
 assert(pairs>200,'checked pairs: '+pairs)});

test('Bottom panel chips show the same multipliers (ranges per role) as the simulation',()=>{const sim=make();
 for(const a of kinds){const p=pure.profile(sim,{kind:a,team:0,rank:0});for(const enemy of [false,true]){const html=UI._render.counterRow(p,enemy);
  for(const m of html.matchAll(/data-kinds="([^"]+)"[^>]*>[\s\S]*?<b>(×[\d.]+)(?:–([\d.]+))?<\/b>/g)){const list=m[1].split(' '),lo=num(m[2]),hi=m[3]?Number(m[3]):lo,good=m.index<html.indexOf('ui-k bad'),vals=list.map(k=>good?K.counterMultiplier(a,k):K.counterMultiplier(k,a)).map(v=>Math.round(v*100)/100);
   assert.equal(Math.min(...vals),lo,a+' chip min');assert.equal(Math.max(...vals),hi,a+' chip max')}}}});

test('Displayed multipliers equal the damage of a real strike, against units and buildings (all nations, techs on)',()=>{let n=0;
 for(const nation of Object.keys(K.nations)){const sim=make(nation),p=sim.world.starts[0],t0=sim.state.tech[0];for(const k of Object.keys(K.tech))if(k.startsWith('doctrine_'))t0[k]=1;t0.weapons=2;t0.shells=1;t0.smokeless=1;
  const units=kinds.filter(k=>pure.attackPath(sim,k)==='strike');
  for(const a of units)for(const t of [...kinds,'house','barracks']){const u=sim.add(a,0,p.x+900,p.y+300),e=sim.add(t,1,p.x+905,p.y+300);e.hp=e.maxhp=1e7;
   if(!sim.canTarget||sim.canTarget(u,e)){const before=e.hp;sim.strike(u,e);const lost=before-e.hp,base=sim.stat(u,'damage'),m=D[t].building?pure.structureFactor(sim,a):pure.multiplier(sim,a,t),expect=Math.max(1,base*m-sim.stat(e,'armor'));
    assert(Math.abs(lost-expect)<1e-6*Math.max(1,expect),nation+' '+a+'>'+t+' lost '+lost+' expected '+expect);assert(Math.abs(u.cool-pure.interval(sim,u))<1e-9,nation+' '+a+' attack interval');n++}
   sim.state.units=sim.state.units.filter(x=>x!==u&&x!==e);sim.state.buildings=sim.state.buildings.filter(x=>x!==e)}}
 assert(n>20000,'strikes: '+n)});

test('Panel data is read-only: profiles, technology probes and dialog rendering leave the simulation byte-identical',()=>{const sim=make('ottoman','russia'),p=sim.world.starts[0];sim.state.tech[0].weapons=1;const u=sim.add('janissary',0,p.x+300,p.y),e=sim.add('cavalry',1,p.x+340,p.y);
 const before=sim.serialize();for(const k of kinds){pure.profile(sim,{kind:k,team:0,rank:0});pure.techEffects(sim,{kind:k,team:0,rank:0})}UI.dialog(sim,u);UI.dialog(sim,e);assert.equal(sim.serialize(),before);
 const fx=pure.techEffects(sim,u);assert(fx.some(t=>t.key==='weapons'&&t.level===1&&t.changes.damage>0),'weapons research is reported for musketeers');assert(fx.some(t=>t.key==='doctrine_ottoman'&&t.changes.interval<0),'Ottoman doctrine shortens the janissary interval')});

test('Both languages render; English output contains no Chinese text',()=>{const sim=make('japan');for(const lang of ['zh','en']){doc.documentElement.lang=lang;for(const k of kinds){const e={kind:k,team:k==='cavalry'?1:0,rank:0},out=UI.dialog(sim,e),row=UI._render.statRow(pure.profile(sim,e))+UI._render.counterRow(pure.profile(sim,e),e.team===1),text=(out.role+out.body+row).replace(/<[^>]*>/g,' ');
  if(lang==='en')assert(!/[㐀-鿿]/.test(text),k+': '+text.match(/.{0,30}[㐀-鿿].{0,30}/)?.[0]);else assert(/[㐀-鿿]/.test(text))}}doc.documentElement.lang='zh'});

test('Upgrade lines are data-driven and stay hidden in the bottom panel until research upgrades exist',()=>{assert.equal(pure.UPGRADES_ENABLED,false);for(const l of pure.LINES)for(const k of l.tiers)assert(D[k],l.id+' '+k);const sim=make();assert(!UI._render.statRow(pure.profile(sim,{kind:'halberd',team:0})).includes('ui-line'));assert(UI.dialog(sim,{kind:'halberd',team:0}).body.includes('ui-tier me'))});

console.log('PASS '+done.length+' unit information panel checks:\n'+done.map(n=>'  '+n).join('\n'));
