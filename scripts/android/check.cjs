'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),web=path.join(root,'.local/android-web'),config=require('../../capacitor.config.json');
assert.equal(config.appId,'com.frontierkingdom.playtest');assert.equal(config.server.url,undefined,'must load bundled assets, not a hosted game');
const html=fs.readFileSync(path.join(web,'index.html'),'utf8');
assert(!html.includes('src="network-ui.js"'));assert(!html.includes('src="pwa.js"'));
for(const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)){
 if(m[1].startsWith('http'))throw Error('External entry dependency: '+m[1]);
 const file=m[1].split('?')[0];assert(fs.existsSync(path.resolve(web,file)),'Missing bundled dependency '+file);
}
assert(html.includes('playtest.js'));assert(html.includes('native-bridge.js'));
for(const file of ['kingdom-core.js','sim-worker.js','expansion.js','panda-art.js','naval-controls.js'])assert.equal(fs.readFileSync(path.join(web,file),'utf8'),fs.readFileSync(path.join(root,'public',file),'utf8'),'trial must preserve '+file);
const manifest=fs.readFileSync(path.join(root,'android/app/src/main/AndroidManifest.xml'),'utf8');
assert(manifest.includes('android:allowBackup="false"'));assert(/android.permission.INTERNET" tools:node="remove"/.test(manifest));
console.log('PASS offline entry: local dependencies, no remote game URL, no network/PWA entry, unchanged simulation/control/panda scripts, backup disabled and internet permission removed. Native manifest merge and device behavior still require Android build/device checks.');
