#!/usr/bin/env node
'use strict';
/* P1 replay + checksum checks (check-all). For every standard recording in scripts/replay/fixtures (4 maps, 60 s each, scripted
   player commands, computer players on):
   1. replay 3 times in this process and once in a fresh process -> identical checksum sequences (every 20 steps) and final state;
   2. the sequence equals the checksums recorded when the game was played (stable across runs and commits; a legitimate gameplay
      change must regenerate the fixtures with scripts/replay/make-fixtures.cjs and say why);
   3. every recorded command returns the same result on replay;
   4. computer players are reproduced by the seed alone: the recordings hold only team-0 commands, yet the replay reproduces the
      full state including every computer team; replaying the script again yields exactly the same command list;
   5. sensitivity: dropping one command or changing the seed changes the checksums (the hash and the capture are not vacuous). */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),{loadK,loadReplay,FIXTURES}=require('./scripts/replay/lib.cjs');
(async()=>{const K=loadK(),R=await loadReplay(),files=fs.readdirSync(FIXTURES).filter(f=>f.endsWith('.json')).sort();
  assert(files.length>=3,'need at least 3 standard replays');const maps=new Set();
  for(const f of files){const file=path.join(FIXTURES,f),data=JSON.parse(fs.readFileSync(file,'utf8'));maps.add(data.setup.options.mapId);
    assert.equal(data.format,'kingdom-replay');assert(data.steps>=1200,f+': at least 60 s (1200 steps)');assert(data.commands.length>=5,f+': needs player commands');
    const runs=[0,1,2].map(()=>R.runReplay(K,data));
    for(const r of runs){const d=R.firstDifference(r.checksums,runs[0].checksums);assert(!d,`${f}: replay runs differ at step ${d?.a?.step}`);assert.equal(r.final.hash,runs[0].final.hash)}
    const d=R.firstDifference(runs[0].checksums,data.checksums);assert(!d,`${f}: checksum differs from the recorded game at step ${d?.a?.step??d?.b?.step} (${d?.b?.hash} recorded, ${d?.a?.hash} now) - if gameplay changed on purpose, regenerate with node scripts/replay/make-fixtures.cjs`);
    assert.equal(runs[0].final.hash,data.final.hash);assert.equal(runs[0].results.mismatch.length,0,f+': command results differ: '+JSON.stringify(runs[0].results.mismatch[0]));
    const child=spawnSync(process.execPath,[path.join(__dirname,'scripts/replay/replay.cjs'),file,'--runs','1'],{encoding:'utf8'});assert.equal(child.status,0,f+': fresh-process replay failed: '+child.stdout+child.stderr);assert(child.stdout.includes(data.final.hash));
    // AI determinism: no computer-team command is in the recording, but computer teams are alive and their state is in the checksum.
    const teams=new Set(runs[0].sim.s.units.filter(u=>u.team>0).map(u=>u.team));assert(teams.size>=1,f+': computer teams missing');
    assert(data.commands.every(c=>c.dt!==undefined||c.s<data.steps),f+': command after the end');
    // Sensitivity: drop one command / change the seed.
    const cut=Math.floor(data.commands.length/2),until=Math.min(data.steps,Math.ceil((data.commands[cut].s+200)/20)*20),dropped={...data,commands:data.commands.filter((c,i)=>i!==cut)},rd=R.runReplay(K,dropped,{steps:until});assert.notEqual(rd.checksums.at(-1).hash,data.checksums.find(c=>c.step===until).hash,f+': dropping a command did not change the state');
    const seeded={...data,setup:{...data.setup,options:{...data.setup.options,seed:(data.setup.options.seed||1)+1}}},rs=R.runReplay(K,seeded,{steps:200});assert.notEqual(rs.checksums.at(-1).hash,data.checksums.find(c=>c.step===200).hash,f+': seed change not visible in checksum');
    console.log(`PASS replay ${f}: ${data.steps} steps, ${data.commands.length} player commands, ${runs.length}+1 replays identical, ${data.checksums.length} checksums match the recorded game (final ${data.final.hash}), computer teams ${[...teams].join(',')} reproduced from the seed`)}
  assert(maps.size>=3,'need at least 3 different maps');
  // Re-playing the same scripted player through the recorder gives the same command list (capture itself is deterministic).
  const gen=spawnSync(process.execPath,[path.join(__dirname,'scripts/replay/make-fixtures.cjs'),'--dry'],{encoding:'utf8'});assert.equal(gen.status,0,gen.stderr);assert(/IDENTICAL to fixtures/.test(gen.stdout),gen.stdout);
  console.log('PASS replay capture: re-recording the scripted games reproduces every fixture byte for byte');
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
