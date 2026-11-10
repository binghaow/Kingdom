'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync('./public/painted-architecture.js','utf8');
const start=source.indexOf('function clearFunctionalMatte(c){');assert(start>=0,'production matte cleanup must exist');
let depth=0,end=-1;for(let i=start;i<source.length;i++){if(source[i]==='{')depth++;else if(source[i]==='}'&&--depth===0){end=i+1;break}}assert(end>start,'production matte cleanup must parse');
const clean=new Function(`${source.slice(start,end)};return clearFunctionalMatte`)();
const width=12,height=10,data=new Uint8ClampedArray(width*height*4);for(let i=0;i<width*height;i++){data[i*4]=0;data[i*4+1]=0;data[i*4+2]=0;data[i*4+3]=255}
for(let y=3;y<7;y++)for(let x=4;x<8;x++){const i=(y*width+x)*4;data[i]=176;data[i+1]=119;data[i+2]=67;data[i+3]=255}
let i=(2*width+2)*4;data[i]=255;data[i+1]=255;data[i+2]=255;data[i+3]=255;
const canvas={width,height,getContext(){return{getImageData(){return{data}},putImageData(){}}}};clean(canvas);
assert.equal(data[(0*width+0)*4+3],0,'border-connected black JPEG matte must become transparent');
assert.equal(data[(3*width+4)*4+3],255,'building pixels must remain opaque');
assert.equal(data[(2*width+2)*4+3],0,'pure-white JPEG debris must become transparent');
console.log('Production functional-building matte cleanup removes black/white JPEG matte and preserves artwork pixels.');
