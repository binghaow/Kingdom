#!/usr/bin/env node
'use strict';
/* P2 visual comparison: the real game at device scale 2 in a 760x540 window (the render pixel budget allows DPR 2; the adaptive
   render scale of headless software raster settles at ~1.7, printed per run), zoomed in to ~1.75 with the zoom button, two scenes per run:
     town  - the starting town centre, houses, villagers, trees and terrain;
     units - a line of soldiers of several kinds (two teams, fighting, so action frames play) next to the town.
   Run once against the old tree and once against the new (KINGDOM_ROOT), then compare the PNGs side by side.
   usage: KINGDOM_ROOT=<tree> node scripts/art/compare-shots.cjs --out dir --tag before|after [--zoom-clicks 5] */
const fs=require('node:fs'),path=require('node:path');
const ROOT=process.env.KINGDOM_ROOT||path.resolve(__dirname,'../..');process.env.KINGDOM_ROOT=ROOT;
const {serve}=require(path.join(ROOT,'scripts/release/render-cost.cjs'));const {args}=require(path.join(ROOT,'scripts/release/lib.cjs'));
async function run({out,tag,clicks=5}){const {chromium}=require('playwright');fs.mkdirSync(out,{recursive:true});const server=await serve();
  const browser=await chromium.launch({args:['--disable-gpu']});try{const ctx=await browser.newContext({viewport:{width:760,height:540},deviceScaleFactor:2}),p=await ctx.newPage();
    await p.addInitScript(()=>{Math.random=(()=>{let s=12345;return()=>{s=s*16807%2147483647;return(s-1)/2147483646}})()});
    await p.goto(`http://127.0.0.1:${server.address().port}/`);await p.waitForFunction(()=>window.KingdomArt&&KingdomArt.loaded,null,{timeout:300000});
    await p.evaluate(()=>{const P=KingdomSim.Sim.prototype,t=P.tick;P.tick=function(...a){window.__shotSim=this;return t.apply(this,a)}});await p.click('#start');await p.waitForFunction(()=>!!window.__shotSim);
    for(let i=0;i<clicks;i++){await p.click('#zoomin');await p.waitForTimeout(60)}await p.waitForTimeout(4000);
    const dpr=await p.evaluate(()=>({dpr:window.FrontierRenderBudget?.dpr,zoom:window.frontier.camera.z}));
    await p.screenshot({path:path.join(out,`town-${tag}.png`),clip:{x:80,y:60,width:600,height:400}});
    await p.evaluate(()=>{const sim=window.__shotSim,c=window.frontier.camera,kinds=['infantry','musketeer','cavalry','archer','halberd','grenadier'];kinds.forEach((k,i)=>{for(const t of [0,1]){const u=sim.add(k,t,c.x-150+i*60,c.y+60+(t?40:-10));u.hp=u.maxhp=u.maxhp*50}});sim.grid=null});
    await p.waitForTimeout(500);await p.waitForFunction(()=>!(KingdomArt.attackStatus?.().pending>0)&&!(KingdomArt.directionStatus?.().pending>0),null,{timeout:60000}).catch(()=>{});await p.waitForTimeout(2500);
    await p.screenshot({path:path.join(out,`units-${tag}.png`),clip:{x:80,y:120,width:600,height:360}});return dpr}finally{await browser.close();server.close()}}
if(require.main===module){const a=args();run({out:a.out,tag:a.tag||'shot',clicks:+(a['zoom-clicks']||5)}).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exit(1)})}
