const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const sig = Buffer.from([137,80,78,71,13,10,26,10]);
const crcTable = new Uint32Array(256);
for (let n=0;n<256;n++) { let c=n; for(let k=0;k<8;k++) c=(c&1)?0xedb88320^(c>>>1):c>>>1; crcTable[n]=c>>>0; }
function crc32(buf) { let c=0xffffffff; for(const b of buf) c=crcTable[(c^b)&255]^(c>>>8); return (c^0xffffffff)>>>0; }
function chunk(type,data) { const t=Buffer.from(type); const out=Buffer.alloc(data.length+12); out.writeUInt32BE(data.length,0); t.copy(out,4); data.copy(out,8); out.writeUInt32BE(crc32(out.subarray(4,8+data.length)),8+data.length); return out; }
function paeth(a,b,c) { const p=a+b-c, pa=Math.abs(p-a), pb=Math.abs(p-b), pc=Math.abs(p-c); return pa<=pb&&pa<=pc?a:pb<=pc?b:c; }
function decodeRow(src,prev,bpp,filter) { const out=Buffer.alloc(src.length); for(let i=0;i<src.length;i++){ const a=i>=bpp?out[i-bpp]:0,b=prev?prev[i]:0,c=prev&&i>=bpp?prev[i-bpp]:0; let f=0; if(filter===1)f=a;else if(filter===2)f=b;else if(filter===3)f=(a+b)>>1;else if(filter===4)f=paeth(a,b,c);out[i]=(src[i]+f)&255; } return out; }
function filterRow(row,prev,bpp,type) { const out=Buffer.alloc(row.length); let score=0; for(let i=0;i<row.length;i++){ const a=i>=bpp?row[i-bpp]:0,b=prev?prev[i]:0,c=prev&&i>=bpp?prev[i-bpp]:0; let f=0;if(type===1)f=a;else if(type===2)f=b;else if(type===3)f=(a+b)>>1;else if(type===4)f=paeth(a,b,c);const v=(row[i]-f)&255;out[i]=v;score+=Math.min(v,256-v); } return {out,score}; }
function optimize(buf) {
 if(!buf.subarray(0,8).equals(sig)) return null;
 const chunks=[];let off=8,w=0,h=0,depth=0,color=0,interlace=0,idats=[];
 while(off+12<=buf.length){const n=buf.readUInt32BE(off),type=buf.toString('ascii',off+4,off+8),data=buf.subarray(off+8,off+8+n);if(type==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);depth=data[8];color=data[9];interlace=data[12];}if(type==='IDAT')idats.push(data);else chunks.push(buf.subarray(off,off+12+n));off+=12+n;if(type==='IEND')break;}
 if(depth!==8||![2,3,4,6].includes(color)||interlace!==0) return null;
 const channels={2:3,3:1,4:2,6:4}[color],bpp=channels,rowBytes=w*channels,raw=zlib.inflateSync(Buffer.concat(idats));if(raw.length!==h*(rowBytes+1))return null;
 const rows=[];let prev=null,pos=0;for(let y=0;y<h;y++){const ft=raw[pos++];const row=decodeRow(raw.subarray(pos,pos+rowBytes),prev,bpp,ft);pos+=rowBytes;rows.push(row);prev=row;}
 const strategies=[zlib.constants.Z_DEFAULT_STRATEGY];let best=null;
 for(const strategy of strategies){let out=Buffer.allocUnsafe(h*(rowBytes+1)),p=0,prevRow=null;for(const row of rows){let choice=null;for(let ft=0;ft<=4;ft++){const q=filterRow(row,prevRow,bpp,ft);if(!choice||q.score<choice.score)choice={...q,ft};}out[p++]=choice.ft;choice.out.copy(out,p);p+=rowBytes;prevRow=row;}const packed=zlib.deflateSync(out,{level:9,strategy});if(!best||packed.length<best.length)best=packed;}
 if(best.length>=Buffer.concat(idats).length)return null;
 const check=zlib.inflateSync(best);let cp=0,cprev=null;for(const row of rows){const ft=check[cp++],decoded=decodeRow(check.subarray(cp,cp+rowBytes),cprev,bpp,ft);if(!decoded.equals(row))throw Error('pixel data changed');cp+=rowBytes;cprev=decoded;}
 let rebuilt=Buffer.from(sig);for(const c of chunks){const type=c.toString('ascii',4,8);if(type==='IEND'){rebuilt=Buffer.concat([rebuilt,chunk('IDAT',best),c]);}else rebuilt=Buffer.concat([rebuilt,c]);}return {buf:rebuilt,raw};
}
function optimizeDirectory(root){const files=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.name.toLowerCase().endsWith('.png'))files.push(p);}}walk(path.resolve(root));files.sort((a,b)=>fs.statSync(b).size-fs.statSync(a).size);let visited=0,optimized=0,bytesSaved=0;const target=6*1024*1024;for(const p of files){if(bytesSaved>=target)break;visited++;const src=fs.readFileSync(p),r=optimize(src);if(r){fs.writeFileSync(p,r.buf);optimized++;bytesSaved+=src.length-r.buf.length;}}return {visited,optimized,bytesSaved};}
module.exports=optimizeDirectory;
if(require.main===module){const result=optimizeDirectory(process.argv[2]);console.log(`PNG lossless packing: ${result.optimized}/${result.visited} optimized, ${(result.bytesSaved/1048576).toFixed(2)} MiB saved`);}
