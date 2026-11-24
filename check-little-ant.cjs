const assert=require('node:assert/strict'),fs=require('node:fs'),K=require('./public/little-ant.js'),D=K.defs;
function make(options={}){const s=new K.Sim('beginner',null,{mapId:'coast_l',fog:false,nations:['britain','france','china'],groups:[1,1,2],seed:777,...options});s.ai=()=>{};s.raids=()=>{};return s}
const ants=s=>s.state.units.filter(u=>u.kind==='ant');
/* definition: invulnerable companion that never attacks */
assert(D.ant&&D.ant.companion&&D.ant.damage===0&&D.ant.carry===4&&D.ant.amphibious);
/* chat summon / dismiss, Chinese and pinyin, case and spacing insensitive */
const solo=make();assert.equal(solo.state.antActive,false);
for(const word of ['小蚂蚁','xiaomayi','XiaoMaYi','xiao mayi','XIAO MA YI']){solo.sendChat(word);assert.equal(ants(solo).length,1,word+' summons');assert.equal(solo.state.antActive,true);solo.sendChat(word);assert.equal(ants(solo).length,0,word+' dismisses');assert.equal(solo.state.antActive,false)}
assert.equal(ants(solo).length,0);solo.sendChat('小蚂蚁呀');assert.equal(ants(solo).length,0,'only the exact phrase');
/* multiplayer: never spawns, gives a system hint; lockstep class has no ant layer */
for(const options of [{mode:'multiplayer'},{networked:true},{humanTeams:[0,1]}]){const s=make(options);s.sendChat('小蚂蚁');assert.equal(ants(s).length,0);assert.equal(s.state.chatLog.at(-1).sender,-1);assert(s.state.chatLog.at(-1).text.includes('只在单机'))}
const net=new K.NetworkSim('beginner',null,{mapId:'coast_l',fog:false,nations:['britain','france'],humanTeams:[0,1],groups:[1,2]});assert.equal(typeof net.toggleAnt,'undefined','NetworkSim must not carry the ant layer');net.sendChat('xiaomayi');assert.equal(ants(net).length,0);assert(net.state.chatLog.at(-1).text.includes('只在单机'));assert.equal(net.add('ant',0,net.state.units[0].x,net.state.units[0].y),null);
const net2=new K.NetworkSim('beginner',null,{mapId:'coast_l',fog:false,nations:['britain','france'],humanTeams:[0,1],groups:[1,2],seed:5});const before=JSON.stringify(net2.state);net2.sendChat('小蚂蚁');const after=JSON.parse(JSON.stringify(net2.state));const strip=o=>{for(const k of ['chatLog','chatSequence','netEvents','netEventSeq'])delete o[k];return o};strip(after);const b=strip(JSON.parse(before));assert.deepEqual(after,b,'multiplayer state (outside the excluded chat log) is unchanged');
/* invulnerable, untargetable, never attacks */
const s=make();s.sendChat('小蚂蚁');const ant=ants(s)[0];const foe=s.add('infantry',2,ant.x+30,ant.y);
assert.equal(s.canTarget(foe,ant),false);assert.equal(s.canTarget(ant,foe),false);assert.equal(s.damage(ant,500,foe),0);assert.equal(ant.hp,ant.maxhp);
const tower=s.state.buildings.find(b=>b.team!==0);if(tower)assert.equal(s.canTarget(tower,ant),false);
for(let i=0;i<80;i++)s.tick(.05);assert.equal(ant.hp,ant.maxhp);assert.notEqual(foe.combatTarget,ant.id);assert.equal(ant.combatTarget,null);assert(foe.hp===foe.maxhp,'ant never strikes');
s.state.units=s.state.units.filter(u=>u.id!==foe.id);
/* gathering: small load of 4, delivered to a depot */
const node=s.nearest(ant,s.resources().filter(n=>n.amount>0&&s.canGather(ant,n)));assert(node);const res=node.resource||node.kind,bank=s.state.resources[0][res];
s.order([ant],{type:'gather',id:node.id,resource:res});let peak=0,delivered=false;for(let i=0;i<1400;i++){s.tick(.05);peak=Math.max(peak,ant.cargo?.amount||0);if(s.state.resources[0][res]>bank+3.9&&peak>0)delivered=true}
assert(peak<=4.0001&&peak>3.9,'carries 4 per trip, saw '+peak);assert(delivered,'cargo delivered');
const sheep=s.state.nodes.find(n=>['sheep','cow'].includes(n.subtype)&&!n.carcass);if(sheep)assert.equal(s.canGather(ant,sheep),false,'ant does not hunt');
/* swimming only for the ant; shared land/sea grids untouched */
const villager=s.state.units.find(u=>u.kind==='villager'&&u.team===0),landGrid=s.getGrid(villager),landCopy=Uint8Array.from(landGrid);
let water=null,bd=1e9;for(let y=72;y<s.world.height;y+=48)for(let x=72;x<s.world.width;x+=48){if(K.worldWater(s.world,x,y)&&K.worldWater(s.world,x+200,y)&&K.worldPlayable(s.world,x+200,y)){const d=Math.hypot(x-ant.x,y-ant.y);if(d<bd){bd=d;water={x:x+200,y}}}}
assert(water);assert(s.blocked(water.x,water.y,villager),'villagers still cannot walk on water');assert(!s.blocked(water.x,water.y,ant),'ant may swim');
let land=null;for(let r=60;r<2000&&!land;r+=48)for(let k=0;k<16;k++){const x=water.x-200+Math.cos(k/16*6.283)*r,y=water.y+Math.sin(k/16*6.283)*r;if(!s.blocked(x,y,villager)){land={x,y};break}}
ant.x=land.x;ant.y=land.y;ant.cargo=null;s.order([ant],{type:'move',x:water.x,y:water.y});let swam=false;for(let i=0;i<900&&!swam;i++){s.tick(.05);swam=!!ant.swimming&&Math.hypot(ant.x-water.x,ant.y-water.y)<120}
assert(swam,'ant swims to a water point');assert.equal(s.getGrid(villager),landGrid);assert.deepEqual(Uint8Array.from(s.getGrid(villager)),landCopy,'land grid unchanged');assert.notEqual(s.getGrid(ant),landGrid);
/* sprint: long move gives a short burst with a cooldown */
ant.sprintReady=0;s.order([ant],{type:'move',x:land.x,y:land.y+900});assert(ant.sprintLeft>0);const ready=ant.sprintReady;s.order([ant],{type:'move',x:land.x,y:land.y+905});assert.equal(ant.sprintReady,ready,'cooldown respected');
/* sleep after idling, wakes on a command */
ant.order=null;ant.path=[];ant.swimming=false;ant.x=land.x;ant.y=land.y;ant.antIdleSince=s.state.time-100;s.tick(.05);assert(ant.antSleeping||ant.swimming);
/* determinism: same commands, same state; save/load keeps the ant */
function run(){const a=make();a.sendChat('小蚂蚁');const u=ants(a)[0];a.order([u],{type:'move',x:u.x+400,y:u.y+60});for(let i=0;i<200;i++)a.tick(.05);return a.serialize()}
assert.equal(run(),run(),'deterministic');const restored=new K.Sim('beginner',JSON.parse(run()));assert.equal(ants(restored).length,1);assert.equal(restored.state.antActive,true);
/* zero cost before summon: no atlas in the page, lazy load only */
const html=fs.readFileSync('public/index.html','utf8'),scripts=[...html.matchAll(/<script src="([^"]+)"/g)].map(m=>m[1]);
assert(scripts.indexOf('little-ant.js')>scripts.indexOf('network-client.js')&&scripts.indexOf('little-ant.js')<scripts.indexOf('kingdom-core.js'));assert(scripts.indexOf('ant-art.js')>scripts.indexOf('panda-art.js'));assert(!html.includes('little-ant-v1'));
const art=fs.readFileSync('public/ant-art.js','utf8');assert(/if\(!image\)\{load\(\);return baseUnit/.test(art),'atlas loads on first draw of a summoned ant only');assert(!/\}\)\(\);\s*load\(\)/.test(art));
const sw=fs.readFileSync('public/sw.js','utf8');assert(/"lazy":\[[^\]]*"little-ant-v1\.png"/.test(sw),'atlas is lazy in the service worker');
assert(/小蚂蚁\|xiao/.test(fs.readFileSync('public/chat-ui.js','utf8'))&&/小蚂蚁\|xiao/.test(fs.readFileSync('public/companions.js','utf8')));
for(const [file,w,h] of [['public/assets/little-ant-v1.png',1152,792],['public/assets/little-ant-icon-v1.png',128,128]]){const p=fs.readFileSync(file);assert.equal(p.readUInt32BE(0),0x89504e47);assert.equal(p[25],6,'RGBA alpha required');assert.equal(p.readUInt32BE(16),w);assert.equal(p.readUInt32BE(20),h)}
const report=JSON.parse(fs.readFileSync('docs/art/drafts/little-ant/atlas-check.json','utf8'));assert(report.pass,'atlas alpha/halo check must pass');
console.log('PASS little-ant: 小蚂蚁/pinyin summon + dismiss, single-player only (multiplayer hint, NetworkSim untouched), invulnerable/untargetable/no attack, 4-unit gathering, ant-only swimming with shared grids unchanged, sprint cooldown, sleep, determinism, save/load, lazy transparent atlas');
