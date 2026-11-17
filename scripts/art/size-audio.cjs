#!/usr/bin/env node
'use strict';
/* P2: long SFX of which the game only ever plays a short window get a trimmed derivative in public/audio/sized/ (same codec and rate),
   so the client no longer downloads and decodes the whole recording into PCM. The source files stay in public/audio as the originals.
     wind, hooves: natural-audio.js load() kept only channel 0, 3 s from 5 s (the derivative is exactly that window, mono)
     boss-flame:   played at offsets 5 s and 7 s for at most 1.8 s -> first 10 s
     cow:          played from 0 s for at most 2.6 s -> first 3.5 s
   usage: node scripts/art/size-audio.cjs   (needs ffmpeg with libmp3lame) */
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..'),SRC=path.join(ROOT,'public/audio'),OUT=path.join(SRC,'sized');
const JOBS={wind:['-ss','5','-t','3','-af','pan=mono|c0=c0'],hooves:['-ss','5','-t','3','-af','pan=mono|c0=c0'],'boss-flame':['-t','10'],cow:['-t','3.5']};
function run(){fs.mkdirSync(OUT,{recursive:true});const out={};for(const [k,a] of Object.entries(JOBS)){const src=path.join(SRC,k+'.mp3'),dst=path.join(OUT,k+'.mp3');
  const r=spawnSync('ffmpeg',['-y','-v','error','-i',src,...a,'-c:a','libmp3lame','-b:a','192k','-ar','48000',dst],{encoding:'utf8'});if(r.status!==0)throw Error('ffmpeg '+k+': '+r.stderr);out[k]={srcBytes:fs.statSync(src).size,bytes:fs.statSync(dst).size}}
  fs.writeFileSync(path.join(OUT,'manifest.json'),JSON.stringify({generated:'scripts/art/size-audio.cjs',files:out},null,1)+'\n');return out}
module.exports={run,JOBS};if(require.main===module)console.log(run());
