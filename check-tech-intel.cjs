/* v40 research ⓘ: every research the player can start (all buildings, all ten nations, plus the Town Center's age
   advance) has a description dialog; the dialog's numbers are measured from the simulation, every signed number in the
   hand-written description matches a measured effect, and the measured "after" equals what the real research does.
   Runs the real public/unit-intel.js (pure part and browser renderer in a VM). */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),K=require('./public/network-model.js'),D=K.defs,T=K.tech,I=require('./public/unit-intel.js'),done=[];
function test(n,f){try{f();done.push(n);console.log('PASS',n)}catch(e){console.error('FAILED',n);throw e}}
function make(nation){const s=new K.Sim('normal',null,{nations:[nation,nation==='france'?'britain':'france'],groups:[1,2],fog:false,mapId:'lake_s',seed:31});s.ai=()=>{};s.raids=()=>{};s.s.ages[0]=5;return s}
const NATIONS=Object.keys(K.nations),live=k=>T[k].building!=='retired';
const keysFor=n=>Object.keys(T).filter(k=>live(k)&&(!T[k].nation||T[k].nation===n));
const sims=Object.fromEntries(NATIONS.map(n=>[n,make(n)]));

test('every live research belongs to a live building and has a measured effect at every level, for every nation',()=>{let count=0;for(const n of NATIONS){const s=sims[n];for(const k of keysFor(n)){const b=D[T[k].building];assert(b&&b.building&&!b.retired,k+' researched at missing/retired building '+T[k].building);const i=I.techInfo(s,0,k);assert(i,k);assert(i.steps.length===i.max,k+' steps');i.steps.forEach((st,lv)=>assert(st.effects.length||st.unlocks.length||st.line,n+' '+k+' level '+(lv+1)+' has no measurable effect'));assert(T[k].description,k+' description');count++}}assert(count>=30,'researches walked '+count)});

test('signed numbers in each description match a measured effect of one research step',()=>{const bad=[];for(const n of NATIONS){const s=sims[n];for(const k of keysFor(n)){const i=I.techInfo(s,0,k),fx=i.steps[0].effects;for(const num of I.descriptionNumbers(T[k].description)){const want=num.sign*num.value,hit=fx.some(g=>g.kind==='abs'?!num.pct&&Math.abs(g.delta-want)<.011:(num.pct||g.kind==='pp')&&Math.abs(g.delta-want)<=1.05);if(!hit)bad.push(n+' '+k+' "'+T[k].description+'" '+(num.sign>0?'+':'-')+num.value+(num.pct?'%':'')+' vs '+fx.map(g=>g.label+g.text).join(','))}}}assert.deepEqual(bad,[],bad.join('\n'))});

test('the measured "after" equals what applying the research really does',()=>{for(const n of ['britain','france','russia','netherlands']){for(const k of keysFor(n)){if(T[k].line)continue;const s=make(n),i=I.techInfo(s,0,k),st=i.steps[0];for(const g of st.effects.filter(g=>g.kinds.length&&!['bhp','loaded'].includes(g.probe)).slice(0,3)){const kind=g.kinds[0],e={kind,team:0,rank:0},before=g.probe==='interval'?s.attackInterval(e):g.probe==='sight'?s.sight(e):s.stat(e,g.probe),pred=I.withTech(s,0,k,1),want=g.probe==='interval'?pred.attackInterval(e):g.probe==='sight'?pred.sight(e):pred.stat(e,g.probe);s.applyResearch(0,k);const got=g.probe==='interval'?s.attackInterval(e):g.probe==='sight'?s.sight(e):s.stat(e,g.probe);assert(Math.abs(got-want)<1e-9,n+' '+k+' '+kind+' '+g.probe+' predicted '+want+' real '+got+' (before '+before+')');s.s.tech[0][k]=0}
  for(const g of st.effects.filter(g=>!g.kinds.length)){const real=make(n),pred=I.withTech(real,0,k,1),probe=I.TEAM_PROBES.find(p=>p[0]===g.probe);real.applyResearch(0,k);assert(Math.abs(probe[3](real,0)-probe[3](pred,0))<1e-9,n+' '+k+' '+g.probe)}}}
 const s=make('britain'),u=s.add('infantry',0,s.world.starts[0].x,s.world.starts[0].y),i=I.techInfo(s,0,'line_spear');s.applyResearch(0,'line_spear');assert.equal(u.kind,i.steps[0].line.to,'line step names the real next tier')});

test('the ⓘ never mutates simulation state',()=>{const s=sims.britain,before=JSON.stringify(s.s);for(const k of keysFor('britain'))I.techInfo(s,0,k,['infantry','archer']);I.techInfo(s,0,'age');assert.equal(JSON.stringify(s.s),before)});

test('Town Center age advance lists unlocks for ages II–V',()=>{const s=make('britain');for(let a=1;a<5;a++){s.s.ages[0]=a;const i=I.techInfo(s,0,'age');assert(i.unlockBuildings.length+i.unlockUnits.length+i.unlockTechs.length>0,'age '+(a+1))}});

test('dialogs render for every research in both languages; English has no Chinese',()=>{const doc={documentElement:{lang:'zh'},addEventListener(){},querySelector(){return null},createElement(){return {dataset:{},append(){},addEventListener(){}}}},win={KingdomSim:K,KingdomArt:{icon:k=>'icon/'+k}};
 vm.runInNewContext(fs.readFileSync('./public/locale-data.js','utf8'),{window:win,globalThis:win});
 for(const f of ['locale-extra.js','chat-locale.js','network-locale.js','locale-guardians.js','locale-terrain.js','locale-economy.js','locale-campaign.js','locale-clarity.js'])if(fs.existsSync('./public/'+f))vm.runInNewContext(fs.readFileSync('./public/'+f,'utf8'),{window:win,globalThis:win,document:doc});
 vm.runInNewContext(fs.readFileSync('./public/locale-core.js','utf8'),{window:win,globalThis:win});
 vm.runInNewContext(fs.readFileSync('./public/unit-intel.js','utf8'),{window:win,document:doc,ResizeObserver:undefined});
 const UI=win.UnitIntelUI;for(const n of NATIONS){const s=sims[n];const inf=s.add('infantry',0,s.world.starts[0].x,s.world.starts[0].y);for(const k of [...keysFor(n),'age']){doc.documentElement.lang='zh';const zh=UI.techDialog(s,k,[inf.id]);assert(zh.includes('<h3>'),n+' '+k);if(k!=='age'){const st=I.techInfo(s,0,k).steps[0];for(const g of st.effects)assert(zh.includes(g.text),n+' '+k+' shows '+g.text)}doc.documentElement.lang='en';const en=UI.techDialog(s,k,[inf.id]),txt=en.replace(/<i class="ui-glyph"[^<]*<\/i>/g,'').replace(/<[^>]+>/g,'');assert(!/[一-鿿]/.test(txt),n+' '+k+' english: '+txt.match(/.{0,30}[一-鿿]+.{0,10}/)?.[0])}}
 doc.documentElement.lang='zh'});

console.log('PASS',done.length,'research ⓘ checks');
