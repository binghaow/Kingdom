((root)=>{'use strict';const dictionary=root.KingdomLocaleData||{},keys=Object.keys(dictionary).sort((a,b)=>b.length-a.length),escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),pattern=new RegExp(keys.map(escape).join('|'),'g'),longPattern=new RegExp(keys.filter(k=>k.length>=12).map(escape).join('|'),'g');
function translate(value,lang='en'){if(typeof value!=='string'||lang!=='en'||!/[\u3400-\u9fff]/.test(value))return value;let names;if((names=value.match(/^(.+) 与 (.+) 已结成临时联盟$/)))return names[1]+' and '+names[2]+' have formed a temporary alliance';if((names=value.match(/^(.+) 向 (.+) 宣战，10 秒后恢复交战$/)))return names[1]+' declared war on '+names[2]+'. Combat resumes in 10 seconds';if((names=value.match(/^(.+) 与 (.+) 现已敌对$/)))return names[1]+' and '+names[2]+' are now hostile';if((names=value.match(/^(.+) 已退出战役$/)))return names[1]+' has been defeated';return value
 .replace(longPattern,key=>dictionary[key])
 .replace(/以([\u3400-\u9fff]+)开启新战役/g,(_m,n)=>'Start as '+translate(n,'en'))
 .replace(/第\s*(\d+)\s*队/g,'Team $1').replace(/电脑\s*(\d+)/g,'AI $1').replace(/(\d+)\s*名电脑/g,'$1 AI')
 .replace(/晋升\s*([IVX]+)\s*时代/g,'Advance to Age $1').replace(/需要时代\s*([IVX]+)/g,'Requires Age $1')
 .replace(/需要\s*([IVX]+)\s*时代/g,'Requires Age $1').replace(/已选择\s*(\d+)\s*个单位/g,'Selected $1 units')
 .replace(/远征军\s*·\s*(\d+)\s*人/g,'Expedition · $1 troops')
 .replace(pattern,key=>dictionary[key]).replace(/（/g,' (').replace(/）/g,')').replace(/，|、/g,', ').replace(/。/g,'. ').replace(/：/g,': ').replace(/；/g,'; ').replace(/[“”]/g,'"')
 .replace(/(\d)(Food|Wood|Gold|Stone|Mana|Population|sec)/g,'$1 $2').replace(/(Train|Requires|With)(?=[A-Z])/g,'$1 ').replace(/(Britain|France|China|Japan|Ottoman Empire|Russia|Prussia|Spain|Netherlands|United States)(?=Unique Unit|Commander|building)/g,'$1 ').replace(/\s{2,}/g,' ')}
root.KingdomI18nCore={translate,dictionary};if(typeof module!=='undefined')module.exports=root.KingdomI18nCore;
})(typeof window==='undefined'?globalThis:window);
