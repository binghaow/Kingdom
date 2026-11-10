#!/usr/bin/env node
'use strict';
/* Prints one combined state hash per N ticks of a scripted 4-seat match (KINGDOM_ROOT selects the tree under test).
   Used to prove a performance change leaves the simulation bit-for-bit unchanged: run it on two trees and diff the output.
   usage: node trace-hash.cjs [ticks=600] [every=50] [hydrate=0|1]  (hydrate=1 round-trips JSON + networkHydrate every 10 ticks, like the server) */
const H=require('./harness.cjs'),{K}=H;
const ticks=+(process.argv[2]||600),every=+(process.argv[3]||50),hyd=process.argv[4]==='1';
let sim=H.createSim({seed:777,seats:4,fog:true});const bots=H.mkBots(4,5);
for(let t=0;t<=ticks;t++){H.applyCommands(sim,H.botCommands(sim,bots,t));if(t%10===0)H.boost(sim,80);sim.tick(H.DT);if(hyd&&t%10===9)sim=H.hydrateRoundTrip(sim);if(t%every===0)console.log(t,H.combine(H.fieldHashes(sim)).toString(16))}
