/* Reproducible chroma-key extraction for generated panda animation sheets.
 * Pure green #00ff00 is removed with a soft matte and partial-edge unmixing. */
const fs=require('fs'),zlib=require('zlib'),path=require('path');
const [,,input,output]=process.argv;if(!input||!output)throw Error('usage: node key-panda-atlas.cjs input.png output.png');
const src=fs.readFileSync(input),sig=Buffer.from([137,80,78,71,13,10,26,10]);if(!src.subarray(0,8).equals(sig))throw Error('not PNG');
let p=8,w,h,depth,color,interlace;const idat=[];while(p<src.length){const n=src.readUInt32BE(p),t=src.toString('ascii',p+4,p+8),d=src.subarray(p+8,p+8+n);p+=12+n;if(t==='IHDR'){w=d.readUInt32BE(0);h=d.readUInt32BE(4);depth=d[8];color=d[9];interlace=d[12]}else if(t==='IDAT')idat.push(d);else if(t==='IEND')break}
if(depth!==8||![2,6].includes(color)||interlace!==0)throw Error(`unsupported PNG depth=${depth}, color=${color}, interlace=${interlace}`);
const channels=color===6?4:3,stride=w*channels,raw=zlib.inflateSync(Buffer.concat(idat)),pixels=Buffer.alloc(stride*h);let q=0;
for(let y=0;y<h;y++){const f=raw[q++],off=y*stride;for(let x=0;x<stride;x++){const v=raw[q++],a=x>=channels?pixels[off+x-channels]:0,b=y?pixels[off-stride+x]:0,c=y&&x>=channels?pixels[off-stride+x-channels]:0;let out;if(f===0)out=v;else if(f===1)out=(v+a)&255;else if(f===2)out=(v+b)&255;else if(f===3)out=(v+Math.floor((a+b)/2))&255;else if(f===4){const z=a+b-c,pa=Math.abs(z-a),pb=Math.abs(z-b),pc=Math.abs(z-c);out=(v+(pa<=pb&&pa<=pc?a:pb<=pc?b:c))&255}else throw Error('bad PNG filter');pixels[off+x]=out}}
let removed=0,feathered=0;const alpha=Buffer.alloc(w*h);
for(let i=0,j=0;i<pixels.length;i+=channels,j++){const r=pixels[i],g=pixels[i+1],b=pixels[i+2],greenExcess=g-Math.max(r,b);let a=greenExcess<=18?1:greenExcess>=78?0:1-(greenExcess-18)/60;if(color===6)a*=pixels[i+3]/255;if(a<.015){alpha[j]=0;pixels[i]=pixels[i+1]=pixels[i+2]=0;removed++;continue}if(a<.995){feathered++; // unmix the green-screen contribution to avoid a green fringe
 const fg=[r,g,b].map((v,k)=>Math.max(0,Math.min(255,Math.round((v-(k===1?255:0)*(1-a))/a))));pixels[i]=fg[0];pixels[i+1]=fg[1];pixels[i+2]=fg[2]}alpha[j]=Math.round(255*a)}
// Convert RGB input to RGBA output when required, applying the generated alpha matte.
let rgba;if(channels===4){rgba=pixels;for(let j=0;j<alpha.length;j++)rgba[j*4+3]=alpha[j]}else{rgba=Buffer.alloc(w*h*4);for(let a=0,b=0,j=0;a<pixels.length;a+=3,b+=4,j++){rgba[b]=pixels[a];rgba[b+1]=pixels[a+1];rgba[b+2]=pixels[a+2];rgba[b+3]=alpha[j]}}
const scan=Buffer.alloc((w*4+1)*h);q=0;for(let y=0;y<h;y++){scan[q++]=0;rgba.copy(scan,q,y*w*4,(y+1)*w*4);q+=w*4}
function crc32(buf){let c=0xffffffff;for(const b of buf){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0}function chunk(t,d){const n=Buffer.from(t),o=Buffer.alloc(d.length+12);o.writeUInt32BE(d.length,0);n.copy(o,4);d.copy(o,8);o.writeUInt32BE(crc32(Buffer.concat([n,d])),8+d.length);return o}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,Buffer.concat([sig,chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(scan,{level:9})),chunk('IEND',Buffer.alloc(0))]));console.log(`keyed ${w}x${h}: ${removed} background pixels removed; ${feathered} edge pixels decontaminated`);
