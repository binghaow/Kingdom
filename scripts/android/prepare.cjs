'use strict';
const fs=require('node:fs'), path=require('node:path'), cp=require('node:child_process');
const root=path.resolve(__dirname,'../..'), out=path.join(root,'.local','android-web');
cp.execFileSync(process.execPath,[path.join(root,'scripts/build-core.cjs')],{stdio:'inherit'});
cp.execFileSync(process.execPath,[path.join(root,'scripts/build.cjs')],{stdio:'inherit'});
// Dedicated generated output only; no authored assets are removed.
if(out!==path.resolve(root,'.local','android-web'))throw Error('Invalid generated Android path');
if(fs.existsSync(out))fs.rmSync(out,{recursive:true});
fs.mkdirSync(out,{recursive:true});
fs.cpSync(path.join(root,'dist/client'),out,{recursive:true});
let html=fs.readFileSync(path.join(out,'index.html'),'utf8');
// Keep the web build unchanged. Only this offline trial omits the network entry point and PWA cache.
html=html.replace('<script src="network-ui.js"></script>','').replace('<script src="pwa.js"></script>','');
html=html.replace('</head>','<link rel="stylesheet" href="playtest.css"></head>');
html=html.replace('</body>','<script src="native-bridge.js"></script><script src="playtest-build.js"></script><script src="playtest.js"></script></body>');
fs.writeFileSync(path.join(out,'index.html'),html);
const notices=['Runtime dependency notices (additional Android/Gradle dependency audit remains required).'];
for(const name of ['core','android','filesystem','share']){
 const dir=path.join(root,'node_modules/@capacitor',name),pkg=JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8'));
 notices.push('@capacitor/'+name+' '+pkg.version+'\n'+fs.readFileSync(path.join(dir,'LICENSE'),'utf8'));
}
fs.writeFileSync(path.join(out,'third-party-notices.txt'),notices.join('\n\n----------------\n\n'));
const sha=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const dirty=cp.spawnSync('git',['diff','--quiet','HEAD','--'],{cwd:root}).status!==0||!!cp.execFileSync('git',['ls-files','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).trim();
fs.writeFileSync(path.join(out,'playtest-build.js'),'window.FrontierPlaytestBuild='+JSON.stringify({channel:'android-offline-trial',source:sha,dirty,schema:1})+';');
require('esbuild').buildSync({entryPoints:[path.join(root,'mobile/native-entry.js')],outfile:path.join(out,'native-bridge.js'),bundle:true,format:'iife',platform:'browser',target:'es2020'});
// Fail closed if the main game would require a remote script, font or stylesheet.
if(/<(?:script|link)\b[^>]*(?:src|href)=["']https?:\/\//i.test(html))throw Error('Remote executable/style dependency in offline entry');
console.log('Prepared bundled offline Android web assets at '+out+' from '+sha);
