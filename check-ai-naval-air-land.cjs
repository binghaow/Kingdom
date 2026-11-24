/* Land-map half of check-ai-naval-air.cjs (section 4: lake_s expert vs normal, behaviour module off vs on), split out so each
   check-all step stays well under the per-check time limit. usage: node check-ai-naval-air-land.cjs [--quick] */
'use strict';
const {spawnSync}=require('node:child_process');
const r=spawnSync(process.execPath,[require('node:path').join(__dirname,'check-ai-naval-air.cjs'),'--only=4',...process.argv.slice(2)],{stdio:'inherit'});
process.exit(r.status??1);
