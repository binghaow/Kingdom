/* Dependency-free Worker bundle and static assets. Never remove authored source. */
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
const optimizePngAssets=require('./optimize-png-assets.cjs');
const output=path.resolve(root,'dist'),source=path.resolve(root,'public');
if(output!==path.join(root,'dist')||!fs.existsSync(path.join(source,'index.html')))throw Error('Invalid build paths');
fs.mkdirSync(path.join(output,'server'),{recursive:true});
// A dedicated generated directory, checked above; public/ remains the source of truth.
const client=path.join(output,'client');if(fs.existsSync(client))fs.rmSync(client,{recursive:true});
// Keep source recordings for review; omit the retired morning call and review-only mix from deployment.
const sourceOnly=new Set(['audio/horn.mp3','audio/charge-preview.wav']);
fs.cpSync(source,client,{recursive:true,filter:p=>!sourceOnly.has(path.relative(source,p).replaceAll('\\','/'))});
const pngResult=optimizePngAssets(path.join(client,'assets'));
const modules=new Map();
function collect(filename){filename=path.resolve(filename);const id=path.relative(root,filename).replaceAll('\\','/');if(modules.has(id))return id;const text=fs.readFileSync(filename,'utf8');modules.set(id,text);for(const m of text.matchAll(/require\(['"](\.[^'"]+)['"]\)/g))collect(path.resolve(path.dirname(filename),m[1]));return id}
const entry=collect(path.join(root,'worker/index.js'));
const bodies=[...modules].map(([id,body])=>JSON.stringify(id)+':function(module,exports,require){\n'+body+'\n}').join(',\n');
const bundle='const modules={'+bodies+'};const cache={};function load(id){if(cache[id])return cache[id].exports;const m=cache[id]={exports:{}};const req=p=>{const parts=id.split("/");parts.pop();for(const v of p.split("/")){if(v==="..")parts.pop();else if(v!==".")parts.push(v)}return load(parts.join("/"))};modules[id](m,m.exports,req);return m.exports;}export default load('+JSON.stringify(entry)+');\n';
fs.writeFileSync(path.join(output,'server/index.js'),bundle);
fs.writeFileSync(path.join(output,'server/wrangler.json'),JSON.stringify({name:'frontier-kingdom',main:'index.js',compatibility_date:'2026-11-05',assets:{directory:'../client',binding:'ASSETS',run_worker_first:['/api/*']},d1_databases:[{binding:'DB',database_name:'frontier-kingdom',database_id:process.env.D1_DATABASE_ID||'00000000-0000-4000-8000-000000000000'}]},null,2));
fs.mkdirSync(path.join(output,'.openai'),{recursive:true});fs.copyFileSync(path.join(root,'.openai/hosting.json'),path.join(output,'.openai/hosting.json'));
console.log('Built Worker ('+modules.size+' modules) and public game assets; losslessly repacked '+pngResult.optimized+'/'+pngResult.visited+' PNGs ('+(pngResult.bytesSaved/1048576).toFixed(2)+' MiB saved).');
