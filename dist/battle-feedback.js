(()=>{
'use strict';
const D=window.KingdomSim.defs,A=window.KingdomArt;
const palette={attack:'#ff8167',gather:'#e6cc73',build:'#efbe79',move:'#a0e6d9',select:'#b6d8ef',blocked:'#d4877b',inspect:'#d4c9a0'};
const glyph={attack:'⚔',gather:'⚒',build:'⚒',move:'➤',select:'⌖',blocked:'×',inspect:'◆'};
const cursors={};for(const [kind,color]of Object.entries(palette)){const svg='<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><path d="M3 2L3 27L10 20L15 32L20 30L15 18L27 18Z" fill="'+color+'" stroke="#14291f" stroke-width="2"/><text x="23" y="13" text-anchor="middle" font-size="15" fill="'+color+'" stroke="#17251e" stroke-width=".4">'+glyph[kind]+'</text></svg>';cursors[kind]='url("data:image/svg+xml,'+encodeURIComponent(svg)+'") 3 2, '+(kind==='blocked'?'not-allowed':kind==='attack'?'crosshair':'pointer')}
const cue=document.createElement('div');cue.id='hover-cue';cue.hidden=true;cue.setAttribute('aria-hidden','true');document.querySelector('.battlefield').append(cue);
function describe(sim,units,target,mode){
 if(mode==='move')return {kind:'move',text:'移动 · 脱离战斗'};
 if(target&&sim.hostile(0,target.team)){if(units.length&&(D[target.kind]?.monster||target.kind==='kclair')&&sim.state.ages[0]<5)return {kind:'blocked',text:'KC 挑战需要 V 时代与成规模军队'};if(units.length&&target.kind==='kclair'&&sim.state.lair?.guards.some(id=>sim.byId(id)))return {kind:'blocked',text:'先击败两名 KC 守卫'};if(units.length&&sim.protection?.(0,target.team))return {kind:'blocked',text:'保护期内双方暂不交战'};const capable=units.filter(u=>sim.canTarget(u,target));return units.length?capable.length?{kind:'attack',text:(D[target.kind]?.building?'攻打建筑':'攻击敌军')+' · '+D[target.kind].name}:{kind:'blocked',text:'所选单位无法攻击此目标'}:{kind:'inspect',text:'敌方 · '+D[target.kind].name}}
 if(target?.amount>0){const capable=units.filter(u=>sim.canGather(u,target)&&(target.team===undefined||target.team===0));const resource={wood:'木材',food:'食物',gold:'黄金',stone:'石料'}[target.resource||target.kind];return capable.length?{kind:'gather',text:'采集'+resource+' · '+capable.length+' 人'}:{kind:'inspect',text:resource+' · '+Math.ceil(target.amount)+'，选择'+(target.domain==='sea'?'渔船':'村民')+'采集'}}
 if(target?.team===0&&!target.complete&&D[target.kind]?.building&&units.some(u=>sim.builder?sim.builder(u):u.kind==='villager'))return {kind:'build',text:'继续施工 · '+D[target.kind].name};
 if(target?.team===0)return {kind:'select',text:'选择 · '+D[target.kind].name};
 if(target&&target.team!==undefined)return {kind:'inspect',text:(sim.allied(0,target.team)?'同队盟友':'停战贸易')+' · '+D[target.kind].name};
 return units.length?{kind:'move',text:mode==='advance'?'攻击前进':'移动 · 脱离战斗'}:null;
}
window.BattleFeedback={describe,hide(){cue.hidden=true},draw(c,sim,units,target,p,screen,mode,zoom){const info=describe(sim,units,target,mode),canvas=document.getElementById('world');if(!info){cue.hidden=true;canvas.style.cursor='default';return}canvas.style.cursor=cursors[info.kind];cue.hidden=false;if(cue.textContent!==glyph[info.kind]+' '+info.text)cue.textContent=glyph[info.kind]+' '+info.text;cue.dataset.kind=info.kind;cue.style.borderColor=palette[info.kind];cue.style.left=Math.max(8,Math.min(screen.x+19,canvas.clientWidth-235))+'px';cue.style.top=Math.max(8,Math.min(screen.y+23,canvas.clientHeight-45))+'px';
 const t=target||p,r=Math.max(target?(D[target.kind]?.r||27)+14:15,10/zoom),ry=r*.43;c.save();c.lineWidth=2/Math.max(.4,zoom);c.strokeStyle=palette[info.kind];c.fillStyle=palette[info.kind]+'1c';c.shadowColor=palette[info.kind];c.shadowBlur=8;c.beginPath();c.ellipse(t.x,t.y+6,r,ry,0,0,Math.PI*2);c.fill();c.stroke();
 if(target){const m=D[target.kind]?A.measure(target.kind):null,w=m?m.width*.48:target.kind==='wood'?36:26,h=m?m.height:target.kind==='wood'?105:36;const x=t.x-w,y=t.y-h+8,l=12;c.shadowBlur=0;for(const [dx,dy]of [[0,0],[w*2,0],[0,h],[w*2,h]]){const sx=dx? -1:1,sy=dy?-1:1;c.beginPath();c.moveTo(x+dx,y+dy+sy*l);c.lineTo(x+dx,y+dy);c.lineTo(x+dx+sx*l,y+dy);c.stroke()}}
 c.restore();}};
})();
