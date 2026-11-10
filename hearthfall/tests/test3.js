// Determinism test: same seed => identical state hash after 3000 ticks (AI vs AI), plus command-log replay and save/load round trip.
const {chromium}=require('playwright');
(async()=>{
  const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:800}});
  const errs=[];p.on('pageerror',e=>errs.push('PAGEERR '+e.message));
  await p.goto('file://'+(process.env.GAME||__dirname+'/game.html'));
  await p.click('#bStart');await p.waitForTimeout(300);
  const r=await p.evaluate(()=>{
    const out={};
    const origRand=Math.random;let randCalls=0;
    function aiVsAi(seed,ticks){
      newGame('normal',seed);G.aiBoth=true;ais.push(makeAI(0,'normal'));
      Math.random=()=>{randCalls++;return origRand();};const _oge=window.onGameEvent;window.onGameEvent=function(){};
      for(let i=0;i<ticks;i++){step(STEP);if(G.over)break;}
      Math.random=origRand;window.onGameEvent=_oge;
      return stateHash()+'@'+G.tick;
    }
    out.a=aiVsAi(1234,3000);
    out.b=aiVsAi(1234,3000);
    out.c=aiVsAi(999,3000);
    out.randCallsInSim=randCalls;
    out.deterministic=out.a===out.b;
    out.seedMatters=out.a!==out.c;
    // scripted player vs AI, then replay from command log
    function scripted(seed,ticks,log){
      newGame('normal',seed);
      if(log)startReplay(log);
      for(let i=0;i<ticks;i++){
        if(!log){
          const tc=T[0].tc;
          if(G.tick===5)issue({c:'train',bids:[tc.id],type:'villager',n:3});
          if(G.tick===60){const vs=units.filter(u=>u.team===0&&u.type==='villager').map(u=>u.id);issue({c:'build',type:'house',tx:tc.tx+5,ty:tc.ty+1,ids:vs.slice(0,2)});}
          if(G.tick===300){const vs=units.filter(u=>u.team===0&&u.type==='villager').map(u=>u.id);const r=ress.filter(x=>x.type==='tree').sort((a,c)=>Math.hypot(a.x-tc.x,a.y-tc.y)-Math.hypot(c.x-tc.x,c.y-tc.y))[0];issue({c:'cmd',ids:vs,x:r.x,y:r.y,tgt:r.id});}
          if(G.tick===900)issue({c:'autofarm',v:true});
          if(G.tick===1200){const vs=units.filter(u=>u.team===0&&u.type==='villager').map(u=>u.id);issue({c:'build',type:'farm',tx:tc.tx-3,ty:tc.ty+4,ids:vs.slice(0,1)});}
          if(G.tick===1500)issue({c:'train',bids:[tc.id],type:'villager',n:5});
        }
        step(STEP);
      }
      return {h:stateHash()+'@'+G.tick,log:cmdLog.slice(),pop:T[0].pop,blds:blds.filter(x=>x.team===0).length};
    }
    const s1=scripted(77,3000);
    const s2=scripted(77,3000,s1.log);
    out.scripted=s1.h;out.replay=s2.h;out.replayMatches=s1.h===s2.h;out.cmds=s1.log.length;out.pop=s1.pop;out.blds=s1.blds;
    // save/load round trip: run 1500 ticks, save, run 600 more -> hash H1; load, run 600 -> must equal H1
    newGame('normal',55);G.aiBoth=true;ais.push(makeAI(0,'normal'));
    for(let i=0;i<1500;i++)step(STEP);
    const sv=saveGame('manual');
    for(let i=0;i<600;i++)step(STEP);
    const h1=stateHash();
    const ld=loadGame('manual');
    for(let i=0;i<600;i++)step(STEP);
    const h2=stateHash();
    out.save=sv;out.load=ld;out.saveLoadMatches=h1===h2;out.h1=h1;out.h2=h2;
    return out;
  });
  console.log(JSON.stringify(r,null,1));
  const ok=r.deterministic&&r.seedMatters&&r.randCallsInSim===0&&r.replayMatches&&r.saveLoadMatches;
  console.log(errs.join('\n')||'no page errors');
  console.log(ok?'DETERMINISM TEST PASS':'DETERMINISM TEST FAIL');
  await b.close();process.exit(ok?0:1);
})();
