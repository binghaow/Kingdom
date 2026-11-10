// Multi-device layout check: screenshots + overflow / touch-target audit. Env: GAME, OUT (dir prefix)
const {chromium,devices}=require('playwright');
const OUT=process.env.OUT||__dirname+'/impl_';
const cfgs=[
  ['iphone17_portrait','iPhone 17'],['iphone17_landscape','iPhone 17 landscape'],
  ['ipad_portrait','iPad Pro 11'],['ipad_landscape','iPad Pro 11 landscape'],
];
(async()=>{
  const b=await chromium.launch();let bad=0;
  for(const [name,dev] of cfgs){
    const ctx=await b.newContext({...devices[dev]});const p=await ctx.newPage();
    const errs=[];p.on('pageerror',e=>errs.push('PAGEERR '+e.message));
    await p.goto('file://'+(process.env.GAME||__dirname+'/game_impl.html'));
    await p.waitForTimeout(300);
    await p.screenshot({path:OUT+name+'_menu.png'});
    await p.tap('#bStart');await p.waitForTimeout(600);
    // select tc via tap, then villager
    await p.evaluate(()=>{setSel(selUnits().length?sel:units.filter(u=>u.team===0).slice(0,3));});
    await p.waitForTimeout(400);
    await p.screenshot({path:OUT+name+'_villagers.png'});
    await p.evaluate(()=>{setSel([T[0].tc]);});await p.waitForTimeout(400);
    await p.screenshot({path:OUT+name+'_tc.png'});
    const audit=await p.evaluate(()=>{
      const o={vw:innerWidth,vh:innerHeight,scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight,small:[],offscreen:[]};
      const sel='#top button,#cmds button:not(.empty),#grp button,#mm,#bottom button';
      document.querySelectorAll(sel).forEach(el=>{
        const r=el.getBoundingClientRect();if(!r.width)return;
        if(r.width<43.5||r.height<43.5)o.small.push((el.id||el.className||el.tagName)+' '+Math.round(r.width)+'x'+Math.round(r.height));
        if(r.right>innerWidth+1||r.bottom>innerHeight+1||r.left<-1||r.top<-1)o.offscreen.push((el.id||el.className)+' '+Math.round(r.left)+','+Math.round(r.top)+','+Math.round(r.right)+','+Math.round(r.bottom));
      });
      const st=document.getElementById('stage').getBoundingClientRect();o.stage=[Math.round(st.width),Math.round(st.height)];
      const bt=document.getElementById('top').getBoundingClientRect();o.top=[Math.round(bt.right),Math.round(bt.height)];
      return o;
    });
    console.log(name,JSON.stringify(audit),errs.join('|')||'ok');
    if(audit.offscreen.length||audit.scrollW>audit.vw+1||audit.scrollH>audit.vh+1)bad++;
    await ctx.close();
  }
  await b.close();process.exit(bad?1:0);
})();
