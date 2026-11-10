// Per-kind timeline of what the renderer shows across one attack cooldown cycle (deterministic, uses production attack-timing.js)
const path='/home/claude/kingdom/public/';const K=require(path+'network-model.js'),T=require(path+'attack-timing.js'),F=require(path+'direction.js');
T.legacy=process.argv[2]==='legacy';const rows=[];
for(const [kind,d] of Object.entries(K.defs)){if(d.building||!(d.damage>0))continue;
 const cd=d.cooldown||1,span=T.duration(d),windup=Math.min(.28,span*.25);
 // simulate: unit stands still engaged; strike at t=0 sets cool=cd; visualActionAt=0. cool counts down.
 const dt=1/60,seq=[];let last='';const trans=[];
 for(let t=-cd*0.0;t<cd*1.0;t+=dt){const u={kind,id:1,viewDirection:'right',path:[],combatTarget:{},cool:Math.max(0,cd-t),visualActionAt:0,actionType:'attack',actionAt:0};
  // next strike at t=cd -> before it visualActionAt is still 0 (age grows)
  const p=T.sample(u,t,d,F,0);let code='B';if(p){const f=T.pair(p.phase);code=String(f.blend<.5?f.a:f.b)}
  if(code!==last){trans.push([+t.toFixed(2),code]);last=code}}
 // frame holds
 const shown={};for(let i=0;i<trans.length;i++){const end=i+1<trans.length?trans[i+1][0]:cd;shown[trans[i][1]]=(shown[trans[i][1]]||0)+(end-trans[i][0])}
 rows.push({kind,cd,span:+span.toFixed(2),windup:+windup.toFixed(2),range:d.range,speed:d.speed,trans:trans.map(x=>x.join('@')).join(' '),baseArtShare:+((shown.B||0)/cd*100).toFixed(0),f0:+(shown['0']||0).toFixed(2),f1:+(shown['1']||0).toFixed(2),f2:+(shown['2']||0).toFixed(2),f3:+(shown['3']||0).toFixed(2)})}
console.log(JSON.stringify(rows,null,0).replace(/\},\{/g,'},\n{'));
