'use strict';
/* Node side of P1 replays: loads the simulation (public/network-model.js, the same top of the Sim chain the browser exposes as
   window.KingdomSim) and the ES-module replay/hash code from src/. KINGDOM_ROOT=<checkout> runs another version. */
const path=require('node:path'),{pathToFileURL}=require('node:url');
const ROOT=process.env.KINGDOM_ROOT||path.resolve(__dirname,'../..');
const loadK=(root=ROOT)=>require(path.join(root,'public/network-model.js'));
const loadReplay=()=>import(pathToFileURL(path.join(path.resolve(__dirname,'../..'),'src/replay/replay.js')).href);
const loadHash=()=>import(pathToFileURL(path.join(path.resolve(__dirname,'../..'),'src/core/hash.js')).href);
module.exports={ROOT,loadK,loadReplay,loadHash,FIXTURES:path.join(__dirname,'fixtures')};
