'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const contexts=[];
class CanvasContext{constructor(canvas){this.canvas=canvas;this.images=0}drawImage(){this.images++}setTransform(){}getTransform(){return{a:1,b:0}}}
class Canvas{constructor(){this.width=1;this.height=1;this.context=new CanvasContext(this);contexts.push(this.context)}getContext(){return this.context}}
const window={KingdomArt:{},KingdomSim:{defs:{villager:{role:'worker'}}}};
vm.runInNewContext(fs.readFileSync('./public/unit-motion.js','utf8'),{window,globalThis:window,document:{createElement:()=>new Canvas()},Math,Map,WeakMap});
const main=new CanvasContext({}),sprite={width:157,height:157},pose={phase:Math.PI/3,weight:1};
window.KingdomArt.drawWalkingSprite(main,sprite,94,90,pose,false);
const generated=contexts.reduce((n,c)=>n+c.images,0);
assert(generated>=19,'one cached gait frame must preserve the torso and nine articulated bands');
assert.equal(main.images,1,'a cached gait frame should composite with one battlefield draw');
window.KingdomArt.drawWalkingSprite(main,sprite,94,90,pose,false);
assert.equal(main.images,2,'reusing a pose should issue one battlefield draw, not redraw its limb bands');
assert.equal(contexts.reduce((n,c)=>n+c.images,0),generated,'a repeated pose must not composite a second time');
const status=window.KingdomArt.walkCacheStatus();assert.equal(status.frames,1);assert.equal(status.pixels,94*90);assert.equal(status.limit,192);assert.equal(status.pixelLimit,4500000);
console.log('Moving gait keeps all nine articulated bands, reuses the composited frame and stays inside its memory budget.');
