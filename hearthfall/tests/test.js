const {chromium}=require('playwright');
(async()=>{
  const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push('PAGEERR '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())});
  await p.goto('file://'+(process.env.GAME||__dirname+'/game.html'));
  await p.click('#bStart');
  await p.waitForTimeout(500);
  // headless sim: player auto-plays minimal via an AI for team 0 too
  const r=await p.evaluate(()=>{
    // let team 0 be AI-driven to test economy/combat
    G.aiBoth=true;ais.push(makeAI(0,'normal'));
    for(let i=0;i<30*60*14;i++){step(STEP);if(G.over)break;}
    return {t:G.t,over:G.over,win:G.winner,p0:{pop:T[0].pop,age:T[0].age,st:T[0].st,res:[T[0].food,T[0].wood,T[0].gold]},p1:{pop:T[1].pop,age:T[1].age,st:T[1].st,res:[T[1].food,T[1].wood,T[1].gold]},blds:blds.filter(x=>x.team===0).length+'/'+blds.filter(x=>x.team===1).length};
  });
  console.log(JSON.stringify(r));
  await p.waitForTimeout(500);
  await p.screenshot({path:(process.env.SHOT||'shot.png')});
  console.log(errs.join('\n')||'no errors');
  await b.close();
})();
