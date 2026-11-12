/* Deterministic equal-resource battles and per-resource power table (docs/gameplay-v39.md).
   node scripts/balance/roster-battles.cjs [--json out.json]   (KINGDOM_ROOT=<checkout> to measure another tree)
   Real simulation class (network-model.js), sandbox map, no AI, no fog, fixed seed; both sides spend the same budget. */
const path=require('node:path'),ROOT=process.env.KINGDOM_ROOT||path.resolve(__dirname,'../..'),K=require(path.join(ROOT,'public/network-model.js')),D=K.defs;
const BUDGET=1800,DT=.1,LIMIT=120;
const cost=k=>['food','wood','gold','stone'].reduce((n,r)=>n+(D[k][r]||0),0);
function power(k){const d=D[k];return Math.round(Math.sqrt(d.hp*d.damage/(d.cooldown||1))/cost(k)*100)}
function perPop(k){const d=D[k];return Math.round(Math.sqrt(d.hp*d.damage/(d.cooldown||1))/(d.pop||1))}
function arena(){const s=new K.Sim('normal',null,{nations:['britain','france'],groups:[1,2],mapId:'lake_s',fog:false,seed:7});s.ai=()=>{};s.raids=()=>{};s.s.humanTeams=[0,1];s.s.units=[];s.s.buildings=[];s.s.nodes=[];s.grid=s.seaGrid=null;
 const ok=(x,y)=>{for(let dy=-260;dy<=260;dy+=40)for(let dx=-520;dx<=520;dx+=40)if(s.blocked(x+dx,y+dy))return false;return true};
 for(let y=600;y<s.world.height-600;y+=120)for(let x=800;x<s.world.width-800;x+=120)if(ok(x,y))return{s,x,y};throw Error('no arena')}
function battle(a,b){const {s,x,y}=arena(),spawn=(k,team,sx)=>{const n=Math.max(1,Math.floor(BUDGET/cost(k))),cols=Math.ceil(Math.sqrt(n));for(let i=0;i<n;i++){const u=s.add(k,team,sx+(team?1:-1)*(i%cols)*30,y-((cols-1)*15)+Math.floor(i/cols)*30);s.freeSpawn?.(u)}return n};
 const na=spawn(a,0,x-330),nb=spawn(b,1,x+330);for(const t of [0,1])s.order(s.s.units.filter(u=>u.team===t),{type:'advance',x:t?x-330:x+330,y});
 let time=0;for(;time<LIMIT;time+=DT){s.tick(DT);const alive=[0,1].map(t=>s.s.units.some(u=>u.team===t&&u.hp>0));if(!alive[0]||!alive[1])break}
 const left=t=>s.s.units.filter(u=>u.team===t&&u.hp>0).reduce((n,u)=>n+cost(u.kind)*u.hp/u.maxhp,0)/BUDGET;
 const la=left(0),lb=left(1);return{a,b,na,nb,winner:la>lb?a:lb>la?b:'draw',left:+(Math.max(la,lb)).toFixed(2),seconds:Math.round(time)}}
const lines=[['infantry','halberd','eliteguard'],['archer','musketeer','rifleguard'],['mortar','howitzer','fieldmortar'],['hussar','cavalry','dragoon']];
const table=lines.map(l=>l.map(k=>({kind:k,name:D[k].name,age:D[k].age,pop:D[k].pop||1,cost:cost(k),power:power(k),perPop:perPop(k)})));
const fights=[['infantry','halberd'],['halberd','eliteguard'],['infantry','eliteguard'],['archer','musketeer'],['musketeer','rifleguard'],['archer','rifleguard'],['halberd','cavalry'],['cavalry','musketeer'],['musketeer','halberd'],['skirmisher','musketeer'],['infantry','archer'],['cavalry','archer']];
const results=fights.map(([a,b])=>battle(a,b));
if(require.main===module){console.log('Per-resource power √(hp×dps)/cost×100');for(const l of table)console.log('  '+l.map(r=>r.kind+'('+['','I','II','III','IV','V'][r.age]+', pop '+r.pop+', '+r.cost+') '+r.power+' /pop '+r.perPop).join('  →  '));
 console.log('Equal-resource battles ('+BUDGET+' each):');for(const r of results)console.log('  '+r.a+' x'+r.na+' vs '+r.b+' x'+r.nb+': '+r.winner+' wins, '+Math.round(r.left*100)+'% of budget left, '+r.seconds+' s');
 const i=process.argv.indexOf('--json');if(i>0)require('node:fs').writeFileSync(process.argv[i+1],JSON.stringify({table,results},null,1))}
module.exports={table,results,power,perPop,battle};
