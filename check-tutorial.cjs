const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),K=require('./public/roster.js'),elements=new Map(),storage=new Map();
class Element{constructor(){this.children=[];this._html='';this.open=false;this.hidden=false;this.classList={add(){},remove(){},toggle(){}}}set id(v){this._id=v;elements.set(v,this)}get id(){return this._id}set innerHTML(v){this._html=v;for(const m of v.matchAll(/id="([^"]+)"/g))if(!elements.has(m[1])){const e=new Element();e.id=m[1]}}get innerHTML(){return this._html}append(...v){this.children.push(...v)}before(){}after(){}replaceChildren(){this.children=[]}querySelector(){return this.grid??=new Element()}cloneNode(){const e=new Element();e.textContent=this.textContent;return e}showModal(){this.open=true}close(){this.open=false}}
const document={createElement:()=>new Element(),body:new Element(),querySelector:()=>new Element(),getElementById:id=>{if(!elements.has(id)){const e=new Element();e.id=id}return elements.get(id)}};
const original=new K.Sim('sandbox',null,{fog:false}),initial=original.serialize();let current=original;const N={bind(){}},window={KingdomSim:K,NavalUI:N};vm.runInNewContext(fs.readFileSync('public/tutorial-ui.js','utf8'),{window,document,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},Map,Set,Math,JSON});N.bind({getSim:()=>current,pause(){},focusPoint(){},selectIds(ids){window.TutorialUI.update(current,ids)},toast(){},replaceSimulation(next){const old={sim:current,paused:true,started:true,selection:[]};current=next.sim||next;return old}});const UI=window.TutorialUI;UI.open();const dialog=document.getElementById('tutorial-dialog'),catalog=dialog.grid;
function step(seconds){for(let i=0;i<seconds/.05;i++){current.tick(.05);UI.update(current,[])}}
for(let index=0;index<UI.lessons.length;index++){
catalog.children[index].onclick();const s=current.state,type=UI.lessons[index][2],worker=s.units.find(u=>u.kind==='villager'),home=s.buildings.find(b=>b.team===0&&b.kind==='town');assert(s.tutorial,type);
if(type==='all-army')UI.update(current,s.units.filter(u=>u.team===0&&K.defs[u.kind].damage>0&&u.kind!=='villager').map(u=>u.id));
if(type==='idle')UI.update(current,s.units.filter(u=>u.team===0&&u.kind==='villager'&&!u.order).map(u=>u.id));
if(type==='upgrade'){assert.equal(current.research(home,'age'),'');step(3)}
if(type==='repair'){const b=s.buildings.find(b=>b.kind==='house');current.order([worker],{type:'repair',id:b.id});step(25)}
if(type==='trade'){const u=s.units.find(u=>u.kind==='trader'),post=s.landmarks.find(p=>p.type==='post');assert.equal(current.route(u,post.id),'');step(50)}
if(type==='intro')document.getElementById('lesson-understood').onclick();
if(type==='select')UI.update(current,[worker.id]);
if(type==='move'){current.order([worker],{type:'move',x:worker.x+220,y:worker.y});step(5)}
if(type==='gather'){const tree=s.nodes.at(-1);current.order([worker],{type:'gather',id:tree.id,resource:'wood'});step(18)}
if(type==='build'){let result;for(let j=0;j<12;j++){const x=worker.x+100+(j%3)*80,y=worker.y+90+Math.floor(j/3)*65;result=current.construct('house',x,y,[worker]);if(!result.error)break}assert(!result.error,result.error);step(25)}
if(type==='train-worker'){assert.equal(current.train(home,'villager'),'');step(3)}
if(['barracks','range','stable'].includes(type)){const b=s.buildings.find(b=>b.kind===type);assert.equal(current.train(b,{barracks:'infantry',range:'longbow',stable:'hussar'}[type]),'');step(3)}
if(type==='counter'||type==='siege'||type==='air'||type==='victory'){const army=s.units.filter(u=>u.team===0&&K.defs[u.kind].damage>0),target=[...s.units,...s.buildings].find(e=>e.team===1&&K.distance(army[0],e)<600);assert(target,type);current.order(army,{type:'attack',id:target.id});step(type==='air'?8:12)}
if(type==='research'){const b=s.buildings.find(b=>b.kind==='blacksmith');assert.equal(current.research(b,'weapons'),'');step(3)}
if(type==='transport'){const ship=s.units.find(u=>u.kind==='transport');assert(ship);current.board(ship,[worker]);step(.3);assert(worker.embarkedOn);UI.update(current,[]);assert(current.unload(ship).includes('卸载'));UI.update(current,[])}
if(type==='hero'){const h=s.units.find(u=>K.defs[u.kind].hero);assert(current.skill(h).includes('命中'));UI.update(current,[])}
if(type==='book'){const h=s.units.find(u=>K.defs[u.kind].hero);assert(current.castSpell(h,'inferno').includes('施放'));UI.update(current,[])}
assert(document.getElementById('tutorial-panel').innerHTML.includes('✓ 已完成这个练习'),type+' did not complete');assert(current.state.time<60,type+' took more than a minute');document.getElementById('lesson-exit').onclick();assert.equal(current,original);assert.equal(original.serialize(),initial)
}
assert.equal(Object.keys(JSON.parse(storage.get('kingdom-lessons-v1'))).length,22);const source=fs.readFileSync('public/expansion.js','utf8');assert(source.includes('sim.networkClient||s.tutorial'));assert(source.includes('if(!s.tutorial)localStorage.removeItem(SAVE)'));console.log('PASS all 22 tutorials through real simulation actions, sub-minute completion, persistent green checks and campaign restoration');
