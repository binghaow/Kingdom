/* v40 resource census: per player, gold / stone / wood / food near home (same land within 1100 px of the start),
   elsewhere on reachable land (outer: middle / far sites, shared middle split), on islands, and in guarded wild camps.
   usage: node scripts/maps/resource-zones.cjs [--seed N] [--json] */
const K=require('../../public/network-model.js');
const seed=Number(process.argv[process.argv.indexOf('--seed')+1])||7;
function sample(mapId,s=seed){const sim=new K.Sim('normal',null,{nations:['britain','france'],groups:[1,2],mapId,fog:false,seed:s});return K.resourceZones(sim)}
if(require.main===module){const out={};for(const id of Object.keys(K.maps))out[id]=sample(id);if(process.argv.includes('--json')){console.log(JSON.stringify(out));return}
 const f=v=>String(Math.round((v||0)/100)/10).padStart(5);console.log('seed '+seed+' — thousands; map team zone: gold stone wood food');for(const [id,z]of Object.entries(out))z.forEach((t,i)=>{for(const k of ['home','outer','island','camp'])console.log(id.padEnd(9),i,k.padEnd(7),f(t[k].gold),f(t[k].stone),f(t[k].wood),f(t[k].food))})}
module.exports={sample};
