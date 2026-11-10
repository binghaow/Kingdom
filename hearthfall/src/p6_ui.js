/* ================= UI helpers ================= */
function uiToast(msg,kind){
  const box=$('toast'),d=document.createElement('div');
  d.textContent=msg;if(kind)d.className=kind;
  box.appendChild(d);
  while(box.children.length>3)box.removeChild(box.firstChild);
  setTimeout(()=>{if(d.parentNode)d.parentNode.removeChild(d);},3200);
  if(kind==='warn')emit('ui',{kind:'error'});
}
function uiEnd(win){
  $('endTitle').textContent=win?'胜利':'失败';
  $('endTitle').style.color=win?'var(--gold)':'var(--bad)';
  const s=T[0].st,e=T[1].st;
  $('endText').textContent=(win?'红方城镇中心已被摧毁。':'你的城镇中心被摧毁了。')+' 用时 '+fmtTime(G.t)+'；击杀 '+s.kills+'，损失 '+s.lost+'，累计采集 '+s.gathered+'，训练单位 '+s.made+'（敌方 '+e.made+'）。';
  $('end').hidden=false;
}
const isCoarse=()=>!!(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches);
let lastPT='mouse',lastTouchT=-1e9,batchOn=false,delArm=0;

/* ================= selection ================= */
function setSel(list){
  sel=list.filter(e=>e&&!e.dead);
  selSet.clear();for(const e of sel)selSet.add(e);
  selDirty=true;mode=null;
  if(sel.length)emit('ui',{kind:'select'});
}
function selUnits(){return sel.filter(e=>e.kind==='u'&&e.team===0);}
function pickAt(wx,wy,pref){
  let best=null,bd=1e9;
  // touch: more generous hit radius
  const pad=lastPT==='mouse'?6:12;
  for(const u of units){
    if(u.dead)continue;
    if(u.team===1&&!visPx(u.x,u.y,2))continue;
    const d=hyp(u.x-wx,u.y-wy);
    if(d<u.r+pad&&d<bd){bd=d;best=u;}
  }
  if(best)return best;
  const tx=Math.floor(wx/TILE),ty=Math.floor(wy/TILE);
  if(tx>=0&&ty>=0&&tx<MW&&ty<MH){
    const id=occ[ty*MW+tx];
    if(id){const e=byId.get(id);if(e&&!e.dead&&(e.kind==='r'?visPx(e.x,e.y,1):(e.team===0||visPx(e.x,e.y,1))))return e;}
  }
  return null;
}
function boxSelect(x0,y0,x1,y1,add){
  const a=s2w(Math.min(x0,x1),Math.min(y0,y1)),b=s2w(Math.max(x0,x1),Math.max(y0,y1));
  const us=units.filter(u=>!u.dead&&u.team===0&&u.x>=a.x&&u.x<=b.x&&u.y>=a.y&&u.y<=b.y);
  if(us.length){
    const mil=us.filter(u=>u.type!=='villager');
    setSel(add?[...new Set([...sel,...us])]:(mil.length?mil.concat(us.filter(u=>u.type==='villager')):us));
  }else{
    const bs=blds.filter(bb=>!bb.dead&&bb.team===0&&bb.x>=a.x&&bb.x<=b.x&&bb.y>=a.y&&bb.y<=b.y);
    if(bs.length)setSel(add?[...new Set([...sel,...bs])]:(bs.length>1&&bs.every(q=>q.type===bs[0].type)?bs:[bs[0]]));
    else if(!add)setSel([]);
  }
}
function selectSameType(u){
  const a=s2w(0,0),b=s2w(VW,VH);
  setSel(units.filter(o=>!o.dead&&o.team===0&&o.type===u.type&&o.x>=a.x&&o.x<=b.x&&o.y>=a.y&&o.y<=b.y));
}
function selectArmy(){
  const l=units.filter(u=>!u.dead&&u.team===0&&u.type!=='villager');
  if(!l.length){uiToast('没有军队');return;}
  setSel(l);
}

/* ================= commands (UI -> command objects; logic lives in p8_sys.js execCmd) ================= */
function clickFx(x,y,c){fx.push({t:'click',x,y,life:0.5,max:0.5,c:c||'#8de07a'});}
const ids=l=>l.map(e=>e.id);
function commandAt(wx,wy){
  const us=selUnits();
  const tgt=pickAt(wx,wy);
  if(!us.length){
    const bs=sel.filter(e=>e.kind==='b'&&e.team===0&&e.done&&BDEF[e.type].train);
    if(bs.length){
      issue({c:'rally',bids:ids(bs),x:wx,y:wy,tgt:(tgt&&tgt.kind!=='u'&&tgt.team!==1)?tgt.id:null});
      clickFx(wx,wy,'#8de07a');emit('ui',{kind:'cmd'});
    }
    return;
  }
  issue({c:'cmd',ids:ids(us),x:wx,y:wy,tgt:tgt?tgt.id:null});
  if(tgt&&tgt.team===1){clickFx(tgt.x,tgt.y,'#ff6a55');emit('ui',{kind:'attack'});}
  else if(tgt&&tgt.kind!=='u'){clickFx(tgt.x,tgt.y);emit('ui',{kind:'cmd'});}
  else{clickFx(wx,wy);emit('ui',{kind:'cmd'});}
}
function attackMoveAt(wx,wy){
  const us=selUnits();
  if(!us.length)return;
  issue({c:'amove',ids:ids(us),x:wx,y:wy});
  clickFx(wx,wy,'#ff6a55');emit('ui',{kind:'attack'});
}
function tryBuildAt(tx,ty,shift){
  const vs=selUnits().filter(u=>u.type==='villager');
  if(!vs.length){mode=null;return;}
  const type=mode.type,d=BDEF[type];
  if(!canPlace(type,tx,ty,0)){toast('无法在此处建造','warn');return;}
  if(!canAfford(T[0],d.cost)){toast('资源不足','warn');return;}
  issue({c:'build',type,tx,ty,ids:ids(vs)});
  clickFx((tx+d.w/2)*TILE,(ty+d.h/2)*TILE);emit('ui',{kind:'build'});
  if(!shift||!canAfford(T[0],{wood:(d.cost.wood||0)*2,food:(d.cost.food||0)*2,gold:(d.cost.gold||0)*2}))mode=null;
  selDirty=true;
}
function selBlds(){return sel.filter(e=>e.kind==='b'&&e.team===0&&e.done);}
function doCmd(id,shift){
  const bs=selBlds();
  const us=selUnits();
  emit('ui',{kind:'click'});
  if(id.startsWith('build:')){
    const type=id.slice(6),d=BDEF[type];
    if(d.age&&T[0].age<d.age){toast('需要晋升封建时代','warn');return;}
    if(!canAfford(T[0],d.cost)){toast('资源不足','warn');return;}
    mode={t:'build',type};
    if(lastPT!=='mouse'){const w=s2w(VW/2,VH/2);hoverTile={tx:Math.round(w.x/TILE-d.w/2),ty:Math.round(w.y/TILE-d.h/2)};}
    return;
  }
  if(id.startsWith('train:')){
    const type=id.slice(6);
    issue({c:'train',bids:ids(bs),type,n:(shift||batchOn)?5:1});
    return;
  }
  if(id==='age'){issue({c:'age',bids:ids(bs)});return;}
  if(id==='stop'){issue({c:'stop',ids:ids(us)});return;}
  if(id==='amove'){mode={t:'amove'};return;}
  if(id==='rally'){mode={t:'rally'};return;}
  if(id==='batch'){batchOn=!batchOn;return;}
  if(id==='autofarm'){issue({c:'autofarm',v:!T[0].autoFarm});return;}
  if(id==='del'){
    const dbs=sel.filter(e=>e.kind==='b'&&e.team===0&&e.type!=='tc'),dus=us;
    if(!dbs.length&&!dus.length)return;
    const now=performance.now();
    if(dbs.length&&now-delArm>2500){delArm=now;uiToast('再按一次确认拆除','warn');return;}
    delArm=0;
    issue({c:'del',bids:ids(dbs),ids:ids(dus)});
    return;
  }
}
function cmdList(){
  const L=[];
  const us=selUnits(),bs=selBlds();
  const t=T[0];
  if(us.length){
    if(us.every(u=>u.type==='villager')){
      BUILD_ORDER.forEach((k,i)=>{const d=BDEF[k];L.push({id:'build:'+k,ic:k,nm:d.name,ct:costStr(d.cost),hk:KEYS[i],ok:canAfford(t,d.cost)&&(!d.age||t.age>=d.age),tip:d.name+'  '+costStr(d.cost)+(d.age?'（封建时代）':'')});});
      L.push({id:'stop',ic:'stop',nm:'停止',ct:'',hk:'S',ok:true,tip:'停止'});
      L.push({id:'autofarm',ic:'farm',nm:'补种',ct:t.autoFarm?'开':'关',hk:'D',ok:true,on:t.autoFarm,tip:'农田耗尽时自动在原地重建'});
    }else{
      L.push({id:'amove',ic:'amove',nm:'攻击移动',ct:'',hk:'A',ok:true,tip:'攻击移动：沿途主动交战'});
      L.push({id:'stop',ic:'stop',nm:'停止',ct:'',hk:'S',ok:true,tip:'停止'});
    }
  }else if(bs.length){
    const trainTypes=[],seen=new Set();
    let hasTc=false,hasTrain=false,hasDel=false;
    for(const b of bs){
      const d=BDEF[b.type];
      if(d.train){hasTrain=true;for(const k of d.train)if(!seen.has(k)){seen.add(k);trainTypes.push(k);}}
      if(b.type==='tc')hasTc=true;else hasDel=true;
    }
    const tb=bs.filter(b=>BDEF[b.type].train);
    trainTypes.forEach((k,i)=>{
      const u=UDEF[k];
      let room=false,qn=0;
      for(const b of tb){if(BDEF[b.type].train.includes(k)){if(b.queue.length<5)room=true;for(const q of b.queue)if(q.type===k)qn++;}}
      L.push({id:'train:'+k,ic:k,nm:u.name,ct:costStr(u.cost),hk:KEYS[i],qn,ok:canAfford(t,u.cost)&&(!u.age||t.age>=u.age)&&room,tip:u.name+'  '+costStr(u.cost)+'  '+u.desc+(u.age?'（封建时代）':'')+'  Shift=排5个'});
    });
    if(hasTc)L.push({id:'age',ic:'age',nm:t.age>=2?'已封建':(t.research?'研究中':'封建时代'),ct:t.age>=2?'':costStr(AGE_COST),hk:KEYS[trainTypes.length],ok:t.age<2&&!t.research&&canAfford(t,AGE_COST),tip:'晋升封建时代  '+costStr(AGE_COST)+'  解锁骑士、哨塔'});
    if(hasTrain){
      L.push({id:'rally',ic:'rally',nm:'集结点',ct:'',hk:'T',ok:true,tip:'设置集结点；对资源设置会让新村民自动采集'});
      L.push({id:'batch',ic:null,gl:'×5',nm:'批量',ct:batchOn?'开':'关',hk:'B',ok:true,on:batchOn,tip:'开启后每次训练排 5 个（Shift+点击同效）'});
    }
    if(hasDel)L.push({id:'del',ic:'del',nm:'拆除',ct:'',hk:'Del',ok:true,tip:'拆除（返还一半木材）'});
  }
  return L.slice(0,8);
}
let cmdSig='',infoSig='',grpSig='';
function refreshPanels(){
  const t=T[0];
  $('rFood').textContent=Math.floor(t.food);$('rWood').textContent=Math.floor(t.wood);$('rGold').textContent=Math.floor(t.gold);
  const cap=Math.min(t.cap,100);
  $('rPop').textContent=t.pop+'/'+cap;
  const pb=$('rPopBox');pb.classList.toggle('popfull',t.pop>=cap);pb.classList.toggle('popnear',t.pop<cap&&t.pop>=cap-2);
  const ageTxt=AGEN[t.age]+(t.research?'  → '+Math.floor(t.research.t/AGE_TIME*100)+'%':'');
  $('rAge').textContent=ageTxt;$('hAge').textContent=ageTxt;
  $('rTime').textContent=fmtTime(G.t);$('hTime').textContent=fmtTime(G.t);
  let idle=0;for(const u of units)if(!u.dead&&u.team===0&&u.type==='villager'&&u.ord.t==='idle')idle++;
  $('nIdle').textContent=idle;
  // control-group chips
  let gs='';
  for(let k=1;k<=4;k++){const g=groups[k];let n=0;if(g)for(const id of g){const e=byId.get(id);if(e&&!e.dead)n++;}gs+=n+',';}
  gs+=(boxMode?'B':'b');
  if(gs!==grpSig){
    grpSig=gs;
    document.querySelectorAll('#grp [data-gk]').forEach(b=>{
      const k=b.dataset.gk;if(k==='army')return;
      const g=groups[k];let n=0;if(g)for(const id of g){const e=byId.get(id);if(e&&!e.dead)n++;}
      b.classList.toggle('full',n>0);
      b.innerHTML=k+(n?'<small>'+n+'</small>':'');
    });
    $('bBox').classList.toggle('on',boxMode);
  }
  updCmds();
  updInfo(touch0());
  $('hint').textContent=sel.length?'':'左键选择 · 右键命令 · 滚轮缩放 · 方向键移动镜头';
}
const touch0=()=>lastPT!=='mouse';

/* ---- stable DOM: nodes are created once and only their text/style/class change, so a press that
   straddles a refresh (60-250 ms hold on touch) still produces a click ---- */
function setTxt(el,t){if(el._t!==t){el._t=t;el.textContent=t;}}
function setHtml(el,h){if(el._h!==h){el._h=h;el.innerHTML=h;}}
function setShow(el,v){const d=v?'':'none';if(el._d!==d){el._d=d;el.style.display=d;}}
function setW(el,pct){const w=Math.max(0,Math.min(100,Math.round(pct)))+'%';if(el._w!==w){el._w=w;el.firstChild.style.width=w;}}
const cmdBtns=[];
(function(){
  const box=$('cmds');
  for(let i=0;i<8;i++){
    const b=document.createElement('button');b.className='cmd empty';b.disabled=true;
    b.innerHTML='<span class="hk"></span><img alt=""><span class="glyph"></span><span class="tx"><span class="nm"></span><span class="ct"></span></span><span class="qb"></span>';
    box.appendChild(b);
    cmdBtns.push({el:b,hk:b.children[0],img:b.children[1],gl:b.children[2],nm:b.querySelector('.nm'),ct:b.querySelector('.ct'),qb:b.children[4],empty:true,ic:null});
  }
})();
function updCmds(){
  const L=cmdList();
  for(let i=0;i<8;i++){
    const c=L[i],s=cmdBtns[i],el=s.el;
    if(!c){if(!s.empty){s.empty=true;el.className='cmd empty';el.disabled=true;el.dataset.id='';}continue;}
    if(s.empty){s.empty=false;el.disabled=false;}
    const cls='cmd'+(c.ok?'':' bad')+((c.on||(mode&&((mode.t==='build'&&c.id==='build:'+mode.type)||(mode.t==='amove'&&c.id==='amove')||(mode.t==='rally'&&c.id==='rally'))))?' on':'');
    if(el.className!==cls)el.className=cls;
    if(el.dataset.id!==c.id)el.dataset.id=c.id;
    if(el.title!==c.tip)el.title=c.tip;
    setTxt(s.hk,c.hk);setTxt(s.nm,c.nm);setTxt(s.ct,c.ct);
    if(c.ic){if(s.ic!==c.ic){s.ic=c.ic;s.img.src=icon(c.ic);}setShow(s.img,true);setShow(s.gl,false);}
    else{s.ic=null;setTxt(s.gl,c.gl||'');setShow(s.img,false);setShow(s.gl,true);}
    setTxt(s.qb,c.qn?String(c.qn):'');setShow(s.qb,!!c.qn);
  }
}
let cmdDown=null;
$('cmds').addEventListener('pointerdown',e=>{const b=e.target.closest('button');cmdDown=b&&b.dataset.id?b.dataset.id:null;});
$('cmds').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||!b.dataset.id)return;
  if(cmdDown!==null&&cmdDown!==b.dataset.id){cmdDown=null;return;} /* list changed under the finger: ignore */
  cmdDown=null;doCmd(b.dataset.id,e.shiftKey);refreshPanels();
});
$('info').innerHTML='<h3><span id="iName"></span><small id="iTeam"></small></h3><div class="bar" id="iHp"><i></i></div><div class="stats" id="iStats"></div><div class="muted" id="iNote"></div>'+
  '<div class="queue" id="iQueue"></div><div class="bar prog" id="iProg"><i></i></div><div class="muted" id="iRes"></div><div class="bar prog" id="iResBar"><i></i></div>'+
  '<div class="groupgrid" id="iGroups"></div><div class="muted" id="iHint"></div><div id="iModeT" style="color:var(--gold)"></div>'+
  '<div class="row" id="iModeB"><button class="mbtn ok" data-ok="1">确认放置</button><button class="mbtn" data-cancel="1">取消</button></div>';
const IE={};for(const id of ['iName','iTeam','iHp','iStats','iNote','iQueue','iProg','iRes','iResBar','iGroups','iHint','iModeT','iModeB'])IE[id]=$(id);
const iOk=IE.iModeB.querySelector('[data-ok]');
function reconcileQueue(q){
  const box=IE.iQueue,want=new Set();
  for(const it of q){if(it.uid===undefined)it.uid=++qUid;want.add(it.uid);}
  for(let n=box.firstChild;n;){const nx=n.nextSibling;if(!want.has(+n.dataset.quid))box.removeChild(n);n=nx;}
  let cur=box.firstChild;
  for(const it of q){
    if(cur&&+cur.dataset.quid===it.uid){cur=cur.nextSibling;continue;}
    const b=document.createElement('button');b.className='qi';b.dataset.quid=it.uid;b.title='取消并返还';
    b.innerHTML='<img alt="" src="'+icon(it.type)+'">';
    box.insertBefore(b,cur);
  }
  for(let n=box.firstChild,i=0;n;n=n.nextSibling,i++){const f=i===0;if(n._f!==f){n._f=f;n.classList.toggle('first',f);}}
}
function reconcileGroups(cnt){
  const box=IE.iGroups,keys=Object.keys(cnt);
  for(let n=box.firstChild;n;){const nx=n.nextSibling;if(!(n.dataset.g in cnt))box.removeChild(n);n=nx;}
  for(const k of keys){
    let b=box.querySelector('[data-g="'+k+'"]');
    const e=sel.find(x=>x.kind+x.type===k);
    if(!b){b=document.createElement('button');b.className='gchip';b.dataset.g=k;b.innerHTML='<img alt="" src="'+icon(e.type)+'"><span></span>';box.appendChild(b);}
    setTxt(b.lastChild,(e.kind==='u'?UDEF[e.type].name:BDEF[e.type].name)+' ×'+cnt[k]);
  }
}
function updInfo(touch){
  const t=T[0],one=sel.length===1?sel[0]:null;
  let hp=false,stats='',note='',q=null,prog=-1,res=-1,groups=null,hint='';
  let name,team='';
  if(!sel.length){
    name='未选中';
    note=touch?'点按选择单位/建筑，长按拖动框选。已选中后点按地面下令。':'点击或拖框选择单位/建筑。右键下达命令。';
    stats='<span>己方 <b>'+t.pop+'</b> 单位</span><span>击杀 <b>'+t.st.kills+'</b></span><span>损失 <b>'+t.st.lost+'</b></span><span>敌方在地图右上</span>';
  }else if(one){
    name=one.kind==='u'?UDEF[one.type].name:one.kind==='b'?BDEF[one.type].name:RDEF[one.type].name;
    team=one.team>=0?' '+TEAMN[one.team]:'';
    if(one.kind==='r'){stats='<span>剩余 <b>'+Math.ceil(one.amt)+'</b> '+RN[RDEF[one.type].res]+'</span>';}
    else{
      hp=true;
      if(one.kind==='u'){
        const d=UDEF[one.type];
        stats='<span>生命 <b>'+Math.ceil(one.hp)+'/'+one.maxhp+'</b></span><span>攻击 <b>'+d.atk+'</b></span><span>护甲 <b>'+d.armor+'</b></span><span>射程 <b>'+(d.range>40?Math.round(d.range/TILE):'近战')+'</b></span>';
        const o=one.ord;let st='待命';
        if(o.t==='move'||o.t==='amove')st='移动中';else if(o.t==='attack')st='战斗中';else if(o.t==='build')st='建造中';
        else if(o.t==='gather')st='采集'+RN[o.rt]+(one.carry?'（携带 '+one.carry+'）':'');
        note=st+' · '+d.desc;
      }else{
        const d=BDEF[one.type];
        stats='<span>生命 <b>'+Math.ceil(one.hp)+'/'+one.maxhp+'</b></span>'+(d.pop?'<span>人口 <b>+'+d.pop+'</b></span>':'')+(d.atk?'<span>攻击 <b>'+d.atk+'</b></span>':'')+(one.type==='farm'?'<span>剩余 <b>'+Math.ceil(one.amt)+'</b> 食物</span>':'');
        if(!one.done){note='建造中 '+Math.floor(one.prog*100)+'%（更多村民可加速）';prog=one.prog*100;}
        else if(one.team===0&&d.train){
          q=one.queue;
          if(q.length)prog=one.qt/UDEF[q[0].type].time*100;else note='空闲。点击下方单位开始训练。';
          if(one.type==='tc'&&t.research)res=t.research.t/AGE_TIME*100;
        }
      }
    }
  }else{
    const cnt={};for(const e of sel){const k=e.kind+e.type;cnt[k]=(cnt[k]||0)+1;}
    name='已选中 '+sel.length+' 个';groups=cnt;
    const bsel=sel.filter(e=>e.kind==='b'&&e.team===0&&BDEF[e.type].train);
    if(bsel.length>1){let qn=0;for(const b of bsel)qn+=b.queue.length;hint=bsel.length+' 座生产建筑，队列共 '+qn+'；训练会分配到最短队列';}
    else hint='点击图标可只选该类';
  }
  setTxt(IE.iName,name);setTxt(IE.iTeam,team);
  setShow(IE.iHp,hp);if(hp)setW(IE.iHp,one.hp/one.maxhp*100);
  setHtml(IE.iStats,stats);setShow(IE.iStats,!!stats);
  setTxt(IE.iNote,note);setShow(IE.iNote,!!note);
  setShow(IE.iQueue,!!(q&&q.length));if(q)reconcileQueue(q);else if(IE.iQueue.firstChild)IE.iQueue.textContent='';
  setShow(IE.iProg,prog>=0);if(prog>=0)setW(IE.iProg,prog);
  setShow(IE.iRes,res>=0);setShow(IE.iResBar,res>=0);if(res>=0){setTxt(IE.iRes,'研究封建时代 '+Math.floor(res)+'%');setW(IE.iResBar,res);}
  setShow(IE.iGroups,!!groups);if(groups)reconcileGroups(groups);else if(IE.iGroups.firstChild)IE.iGroups.textContent='';
  setTxt(IE.iHint,hint);setShow(IE.iHint,!!hint);
  if(mode){
    let m;
    if(mode.t==='build')m='放置'+BDEF[mode.type].name+(touch?'：点地图移动虚影，再点虚影或“确认放置”建造':'：点击空地建造，Shift 连续放置，Esc 取消');
    else m=mode.t==='amove'?'攻击移动：点击目标位置':'设置集结点：点击地面或资源';
    setTxt(IE.iModeT,m);setShow(IE.iModeT,true);setShow(IE.iModeB,true);setShow(iOk,mode.t==='build'&&touch);
  }else{setShow(IE.iModeT,false);setShow(IE.iModeB,false);}
}
let qDown=null;
$('info').addEventListener('pointerdown',e=>{const q=e.target.closest('[data-quid]');qDown=q?+q.dataset.quid:null;});
$('info').addEventListener('click',e=>{
  const q=e.target.closest('[data-quid]');
  if(q&&sel.length===1){
    const uid=qDown!==null?qDown:+q.dataset.quid;qDown=null;
    issue({c:'cancelq',bid:sel[0].id,uid});emit('ui',{kind:'click'});return;
  }
  const g=e.target.closest('[data-g]');
  if(g){setSel(sel.filter(x=>x.kind+x.type===g.dataset.g));refreshPanels();return;}
  if(e.target.closest('[data-cancel]')){mode=null;selDirty=true;emit('ui',{kind:'click'});return;}
  if(e.target.closest('[data-ok]')&&mode&&mode.t==='build'&&hoverTile){tryBuildAt(hoverTile.tx,hoverTile.ty,false);}
});

/* ================= control groups ================= */
const stage=$('stage');
const ptrs=new Map();
let panning=null,pinch=null,boxMode=false,lastClickT=0,lastClickE=null,groups={},lastGroupT=0,lastGroupK='';
function liveGroup(k){const g=groups[k];return g?g.map(id=>byId.get(id)).filter(e=>e&&!e.dead):[];}
function assignGroup(k){
  const l=sel.filter(e=>e.kind==='u'&&e.team===0);
  if(!l.length){uiToast('先选中单位再保存编队');return false;}
  groups[k]=ids(l);uiToast('编队 '+k+'：'+l.length+' 个单位');emit('ui',{kind:'click'});return true;
}
function recallGroup(k){
  const l=liveGroup(k);
  if(!l.length)return false;
  setSel(l);const now=performance.now();
  if(lastGroupK===k&&now-lastGroupT<400){let x=0,y=0;for(const e of l){x+=e.x;y+=e.y;}centerOn(x/l.length,y/l.length);}
  lastGroupT=now;lastGroupK=k;return true;
}
(function(){
  const strip=$('grp');let press=null;
  strip.addEventListener('pointerdown',ev=>{
    const b=ev.target.closest('[data-gk]');if(!b||b.dataset.gk==='army')return;
    lastPT='touch';
    press={k:b.dataset.gk,long:false,timer:setTimeout(()=>{if(press){press.long=true;assignGroup(press.k);try{navigator.vibrate&&navigator.vibrate(12);}catch(e){}}},450)};
  });
  const done=ev=>{
    if(!press)return;clearTimeout(press.timer);const p=press;press=null;
    if(ev.type==='pointercancel'||p.long)return;
    if(!recallGroup(p.k))assignGroup(p.k);
  };
  strip.addEventListener('pointerup',done);strip.addEventListener('pointercancel',done);strip.addEventListener('pointerleave',done);
  strip.addEventListener('click',ev=>{
    const b=ev.target.closest('[data-gk]');if(!b)return;
    if(b.dataset.gk==='army'){selectArmy();emit('ui',{kind:'click'});}
  });
  strip.addEventListener('contextmenu',ev=>ev.preventDefault());
})();

/* ================= input ================= */
function localPos(ev){const r=cv.getBoundingClientRect();return {x:ev.clientX-r.left,y:ev.clientY-r.top};}
function updHover(p){const w=s2w(p.x,p.y);if(mode&&mode.t==='build'){const d=BDEF[mode.type];hoverTile={tx:Math.round(w.x/TILE-d.w/2),ty:Math.round(w.y/TILE-d.h/2)};}else hoverTile=null;}
let lastRightT=-1e9;
cv.addEventListener('contextmenu',e=>{
  e.preventDefault();
  // trackpad / ctrl-click right click on iPad & Mac Safari arrives only as contextmenu
  const now=performance.now();
  if(now-lastRightT<250||now-lastTouchT<1500||G.over)return;
  lastRightT=now;
  const p=localPos(e),w=s2w(p.x,p.y);
  if(mode){mode=null;selDirty=true;return;}
  commandAt(w.x,w.y);
});
function longPress(id){
  const q=ptrs.get(id);
  if(!q||q.moved||ptrs.size!==1||pinch||q.type==='mouse')return;
  if(mode)return;
  q.lp=true;panning=null;
  boxSel={x0:q.sx,y0:q.sy,x1:q.x,y1:q.y,active:false,add:false};
  const w=s2w(q.sx,q.sy);clickFx(w.x,w.y,'#e5b447');
  try{navigator.vibrate&&navigator.vibrate(12);}catch(e){}
}
cv.addEventListener('pointerdown',ev=>{
  if(G.over)return;
  try{cv.setPointerCapture(ev.pointerId);}catch(e){}
  const isMouse=ev.pointerType==='mouse';
  lastPT=isMouse?'mouse':'touch';if(!isMouse)lastTouchT=performance.now();
  const p=localPos(ev);
  const q={x:p.x,y:p.y,sx:p.x,sy:p.y,type:ev.pointerType,btn:ev.button,t:performance.now(),moved:false,lp:false,timer:0,ghost:false};
  ptrs.set(ev.pointerId,q);
  if(isMouse)mouse={x:p.x,y:p.y,in:true};
  if(!isMouse)q.timer=setTimeout(()=>longPress(ev.pointerId),420);
  if(ptrs.size===2){
    const a=[...ptrs.values()];
    for(const o of a){clearTimeout(o.timer);o.lp=false;}
    pinch={d:Math.max(1,Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)),z:cam.z};boxSel=null;panning=null;return;
  }
  if(ptrs.size>2)return;
  const w=s2w(p.x,p.y);
  if(isMouse){
    updHover(p);
    if(ev.button===2){
      lastRightT=performance.now();
      if(mode){mode=null;selDirty=true;return;}
      commandAt(w.x,w.y);return;
    }
    if(ev.button===0){
      if(mode){clickMode(w,ev.shiftKey);return;}
      boxSel={x0:p.x,y0:p.y,x1:p.x,y1:p.y,active:false,add:ev.shiftKey||ev.ctrlKey};
    }else if(ev.button===1){panning={sx:p.x,sy:p.y,cx:cam.x,cy:cam.y};}
  }else{
    if(boxMode&&!mode)boxSel={x0:p.x,y0:p.y,x1:p.x,y1:p.y,active:false,add:false};
    else panning={sx:p.x,sy:p.y,cx:cam.x,cy:cam.y};
  }
});
function clickMode(w,shift){
  if(mode.t==='build'){const d=BDEF[mode.type];tryBuildAt(Math.round(w.x/TILE-d.w/2),Math.round(w.y/TILE-d.h/2),shift);}
  else if(mode.t==='amove'){attackMoveAt(w.x,w.y);mode=null;}
  else if(mode.t==='rally'){commandAt(w.x,w.y);mode=null;}
  selDirty=true;
}
cv.addEventListener('pointermove',ev=>{
  const p=localPos(ev),q=ptrs.get(ev.pointerId);
  if(ev.pointerType==='mouse'){mouse={x:p.x,y:p.y,in:true};updHover(p);}
  if(!q)return;
  q.x=p.x;q.y=p.y;
  if(Math.hypot(p.x-q.sx,p.y-q.sy)>(q.type==='mouse'?8:10)){q.moved=true;clearTimeout(q.timer);}
  if(ptrs.size===2&&pinch){
    const a=[...ptrs.values()],d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),mx=(a[0].x+a[1].x)/2,my=(a[0].y+a[1].y)/2;
    const before=s2w(mx,my);cam.z=pinch.z*d/pinch.d;clampCam();
    cam.x=before.x-mx/cam.z;cam.y=before.y-my/cam.z;clampCam();return;
  }
  if(boxSel&&(ev.buttons&1||q.type!=='mouse')){
    boxSel.x1=p.x;boxSel.y1=p.y;
    if(Math.hypot(p.x-boxSel.x0,p.y-boxSel.y0)>6)boxSel.active=true;
  }else if(panning&&q.moved){
    cam.x=panning.cx-(p.x-panning.sx)/cam.z;cam.y=panning.cy-(p.y-panning.sy)/cam.z;clampCam();
  }
});
function endPtr(ev){
  const q=ptrs.get(ev.pointerId);ptrs.delete(ev.pointerId);
  if(q)clearTimeout(q.timer);
  if(ptrs.size<2)pinch=null;
  if(!q)return;
  const p=localPos(ev);
  if(ev.type==='pointercancel'){boxSel=null;panning=null;return;}
  const wasPinch=ptrs.size>0;
  if(wasPinch){return;}
  if(q.type==='mouse'){
    if(q.btn===0){
      if(boxSel&&boxSel.active){boxSelect(boxSel.x0,boxSel.y0,boxSel.x1,boxSel.y1,boxSel.add);}
      else if(boxSel){
        const w=s2w(p.x,p.y),e=pickAt(w.x,w.y),now=performance.now();
        if(e&&e.team===0&&e.kind==='u'&&lastClickE===e&&now-lastClickT<350)selectSameType(e);
        else if(e)setSel(boxSel.add&&e.team===0?[...new Set([...sel,e])]:[e]);
        else if(!boxSel.add)setSel([]);
        lastClickT=now;lastClickE=e;
      }
    }
    boxSel=null;panning=null;
  }else{
    const w=s2w(p.x,p.y);
    if(boxSel&&boxSel.active){boxSelect(boxSel.x0,boxSel.y0,boxSel.x1,boxSel.y1,false);}
    else if(q.lp){commandAt(w.x,w.y);}
    else if(!q.moved){
      if(mode&&mode.t==='build'){
        // touch placement: first taps position the ghost, tap on the ghost (or the confirm button) builds
        const d=BDEF[mode.type],fx0=w.x/TILE,fy0=w.y/TILE;
        if(hoverTile&&fx0>=hoverTile.tx-0.3&&fx0<=hoverTile.tx+d.w+0.3&&fy0>=hoverTile.ty-0.3&&fy0<=hoverTile.ty+d.h+0.3)tryBuildAt(hoverTile.tx,hoverTile.ty,false);
        else{hoverTile={tx:Math.round(fx0-d.w/2),ty:Math.round(fy0-d.h/2)};emit('ui',{kind:'click'});}
      }
      else if(mode)clickMode(w,false);
      else{
        const e=pickAt(w.x,w.y),now=performance.now();
        if(e&&e.team===0){
          if(e.kind==='u'&&lastClickE===e&&now-lastClickT<400)selectSameType(e);
          else setSel([e]);
        }else if(sel.some(x=>x.team===0&&(x.kind==='u'||(x.kind==='b'&&BDEF[x.type].train)))){commandAt(w.x,w.y);}
        else if(e)setSel([e]);else setSel([]);
        lastClickT=now;lastClickE=e;
      }
    }
    boxSel=null;panning=null;
  }
}
cv.addEventListener('pointerup',endPtr);cv.addEventListener('pointercancel',endPtr);
cv.addEventListener('pointerleave',()=>{mouse.in=false;});
cv.addEventListener('wheel',ev=>{
  ev.preventDefault();
  const p=localPos(ev),before=s2w(p.x,p.y);
  const dy=clamp(ev.deltaMode===1?ev.deltaY*33:ev.deltaY,-120,120);
  cam.z*=Math.exp(-dy*0.0012*(ev.ctrlKey?5:1));clampCam();
  cam.x=before.x-p.x/cam.z;cam.y=before.y-p.y/cam.z;clampCam();
},{passive:false});
let mmDrag=-1; /* fixed handlers + pointer capture: nothing to leak on pointercancel */
function mmJump(e){const r=mmc.getBoundingClientRect();centerOn((e.clientX-r.left)/r.width*WW,(e.clientY-r.top)/r.height*WH);}
mmc.addEventListener('pointerdown',ev=>{
  if(ev.button===2)return;
  if(ev.pointerType!=='mouse'){lastPT='touch';lastTouchT=performance.now();}
  try{mmc.setPointerCapture(ev.pointerId);}catch(e){}
  mmDrag=ev.pointerId;mmJump(ev);
});
mmc.addEventListener('pointermove',ev=>{if(ev.pointerId===mmDrag)mmJump(ev);});
['pointerup','pointercancel','lostpointercapture'].forEach(t=>mmc.addEventListener(t,ev=>{if(ev.pointerId===mmDrag)mmDrag=-1;}));
mmc.addEventListener('contextmenu',ev=>{
  ev.preventDefault();
  if(performance.now()-lastTouchT<1500)return;
  const r=mmc.getBoundingClientRect();
  commandAt((ev.clientX-r.left)/r.width*WW,(ev.clientY-r.top)/r.height*WH);
});

document.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')lastPT='mouse';else{lastPT='touch';lastTouchT=performance.now();}},true);
/* browser gesture suppression (iOS Safari pinch/rubber-band, double-tap zoom, callouts) */
document.addEventListener('touchmove',e=>{if(!e.target.closest||!e.target.closest('.scrollok'))e.preventDefault();},{passive:false});
['gesturestart','gesturechange','gestureend','dblclick'].forEach(t=>document.addEventListener(t,e=>e.preventDefault()));
document.addEventListener('contextmenu',e=>{if(e.target.tagName!=='INPUT')e.preventDefault();});

const keys={};
window.addEventListener('keydown',ev=>{
  if(ev.target&&/INPUT|TEXTAREA/.test(ev.target.tagName))return;
  const k=ev.key;
  lastPT='mouse';
  keys[k]=true;
  if(k.startsWith('Arrow'))ev.preventDefault();
  if(k==='Escape'){
    if(mode){mode=null;selDirty=true;return;}
    if(!$('help').hidden){$('help').hidden=true;return;}
    if(!$('menu').hidden||!$('end').hidden)return;
    if(!$('pmenu').hidden)closeMenu();else openMenu();
    return;
  }
  if(!$('menu').hidden||!$('end').hidden||!$('pmenu').hidden||!$('help').hidden)return;
  if(k===' '){ev.preventDefault();togglePause();return;}
  if(/^[0-9]$/.test(k)){
    if(ev.ctrlKey||ev.metaKey){ev.preventDefault();assignGroup(k);}
    else recallGroup(k);
    return;
  }
  if(k==='.'||k===','){idleVillager();return;}
  if(k==='Home'){if(T[0].tc)centerOn(T[0].tc.x,T[0].tc.y);return;}
  if(k==='Delete'||k==='Backspace'){doCmd('del');return;}
  if(ev.ctrlKey||ev.metaKey||ev.altKey)return;
  const u=k.toUpperCase();
  const L=cmdList();
  const c=L.find(x=>x.hk===u);
  if(c){doCmd(c.id,ev.shiftKey);cmdSig='';refreshPanels();}
});
window.addEventListener('keyup',ev=>{keys[ev.key]=false;});
function clearKeys(){for(const k in keys)keys[k]=false;mouse.in=false;}
window.addEventListener('blur',clearKeys);
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearKeys();});
window.addEventListener('pagehide',clearKeys);
function idleVillager(){
  const l=units.filter(u=>!u.dead&&u.team===0&&u.type==='villager'&&u.ord.t==='idle');
  if(!l.length){uiToast('没有闲置村民');return;}
  const cur=sel.length===1?l.indexOf(sel[0]):-1,n=l[(cur+1)%l.length];
  setSel([n]);centerOn(n.x,n.y);
}
function edgeScroll(dt){
  const sp=700/cam.z*dt;let dx=0,dy=0;
  if(keys.ArrowLeft)dx-=1;if(keys.ArrowRight)dx+=1;if(keys.ArrowUp)dy-=1;if(keys.ArrowDown)dy+=1;
  if(mouse.in&&lastPT==='mouse'&&ptrs.size===0&&!boxSel){
    const m=14;
    if(mouse.x<m)dx-=1;if(mouse.x>VW-m)dx+=1;if(mouse.y<m)dy-=1;if(mouse.y>VH-m)dy+=1;
  }
  if(dx||dy){cam.x+=dx*sp;cam.y+=dy*sp;clampCam();}
}

/* ================= top bar, menus, save/load ================= */
function setPauseUI(){$('bPause').textContent=G.paused?'继续':'暂停';$('bPause').classList.toggle('on',G.paused);}
function togglePause(){G.paused=!G.paused;setPauseUI();emit('ui',{kind:'click'});}
$('bPause').onclick=togglePause;
function cycleSpeed(){G.speed=G.speed===1?2:G.speed===2?3:1;$('bSpeed').textContent=G.speed+'×';$('mSpeedInfo').textContent=G.speed+'×';emit('ui',{kind:'click'});}
$('bSpeed').onclick=cycleSpeed;$('mSpeed').onclick=cycleSpeed;
$('bIdle').onclick=()=>{emit('ui',{kind:'click'});idleVillager();};
$('bBox').onclick=()=>{boxMode=!boxMode;grpSig='';emit('ui',{kind:'click'});};
let helpFrom=null;
function openHelp(from){helpFrom=from||null;$('help').hidden=false;}
$('bHelp').onclick=()=>openHelp();$('bHelp2').onclick=()=>openHelp();$('mHelp').onclick=()=>openHelp();
$('bHelpClose').onclick=()=>{$('help').hidden=true;};
document.querySelectorAll('#diffRow button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#diffRow button').forEach(x=>x.classList.remove('sel'));b.classList.add('sel');G.diff=b.dataset.d;pendingDiff=b.dataset.d;
});
let pendingDiff='normal';
$('bStart').onclick=()=>{$('menu').hidden=true;newGame(pendingDiff);};
$('bAgain').onclick=()=>{$('end').hidden=true;newGame(pendingDiff);};

let menuPaused=false;
function fmtSaveInfo(kind){
  const m=saveInfo(kind);
  if(!m)return '无';
  const d=new Date(m.time);
  return '对局 '+fmtTime(m.t)+' · '+String(d.getMonth()+1)+'/'+d.getDate()+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}
function refreshMenuInfo(){
  $('mSaveInfo').textContent=G.over?'对局已结束':'保存当前对局';
  $('mLoadInfo').textContent=fmtSaveInfo('manual');
  $('mAutoInfo').textContent=fmtSaveInfo('auto');
  $('mLoad').disabled=!saveInfo('manual');$('mLoadAuto').disabled=!saveInfo('auto');
  $('mSpeedInfo').textContent=G.speed+'×';
  $('mNote').textContent=storageMode==='mem'?'浏览器存储不可用：存档仅在本次会话内有效。':'';
}
function openMenu(){
  if(!$('menu').hidden||G.over)return;
  menuPaused=!G.paused;if(menuPaused){G.paused=true;setPauseUI();}
  refreshMenuInfo();$('pmenu').hidden=false;emit('ui',{kind:'click'});
}
function closeMenu(){
  $('pmenu').hidden=true;
  if(menuPaused){G.paused=false;setPauseUI();}
  menuPaused=false;
}
$('bMenu').onclick=()=>{if($('pmenu').hidden)openMenu();else closeMenu();};
$('mResume').onclick=closeMenu;
$('mRestart').onclick=()=>{menuPaused=false;$('pmenu').hidden=true;newGame(pendingDiff);};
$('mSave').onclick=()=>{
  const r=saveGame('manual');
  if(r.ok){uiToast(r.persisted?'已存档':'已存档（仅本次会话）','good');}
  else uiToast(r.why||'存档失败','warn');
  refreshMenuInfo();
};
function doLoad(kind){
  const r=loadGame(kind);
  if(r.ok){menuPaused=false;$('pmenu').hidden=true;$('menu').hidden=true;$('end').hidden=true;setPauseUI();uiToast('已读取存档','good');}
  else uiToast(r.why||'读档失败','warn');
  refreshMenuInfo();
}
$('mLoad').onclick=()=>doLoad('manual');
$('mLoadAuto').onclick=()=>doLoad('auto');
$('bContinue').onclick=()=>doLoad(saveInfo('manual')?'manual':'auto');
function updContinue(){$('bContinue').hidden=!(saveInfo('manual')||saveInfo('auto'));}
function afterLoad(s){
  setSel([]);mode=null;hoverTile=null;cmdSig='';infoSig='';grpSig='';delArm=0;
  if(s.cam){cam.x=s.cam.x;cam.y=s.cam.y;cam.z=s.cam.z;}
  resize();clampCam();updateFog(0,true);
  $('bSpeed').textContent=G.speed+'×';
  lastAuto=G.t;selDirty=true;
}
let lastAuto=0;
function autoSave(){if(G&&!G.over&&$('menu').hidden&&T[0]&&T[0].tc){saveGame('auto');lastAuto=G.t;}}
document.addEventListener('visibilitychange',()=>{if(document.hidden)autoSave();});
window.addEventListener('pagehide',autoSave);

/* ================= layout / resize (keeps view centre across rotations) ================= */
let _vw=0,_vh=0;
function onResize(){
  const had=_vw>0,cx=cam.x+_vw/cam.z/2,cy=cam.y+_vh/cam.z/2;
  resize();
  if(had&&Math.abs(VW-_vw)+Math.abs(VH-_vh)>1)centerOn(cx,cy);
  _vw=VW;_vh=VH;
}
window.addEventListener('resize',onResize);
window.addEventListener('orientationchange',()=>{setTimeout(onResize,60);setTimeout(onResize,350);});
if(window.visualViewport)window.visualViewport.addEventListener('resize',onResize);
if(window.ResizeObserver)new ResizeObserver(onResize).observe(stage);

/* ================= game lifecycle & loop ================= */
function newGame(diff,seed){
  resetState();resetCmds();
  G.diff=diff;
  seed=seed||(Math.floor(Math.random()*9000)+11);
  G.seed=seed;
  simSeed(seed*7919+12345);
  genMap(seed);
  startBases();
  ais=[makeAI(1,diff)];
  buildWorldCanvas();
  updateFog(0,true);
  setSel([]);mode=null;hoverTile=null;fx.length=0;cmdSig='';infoSig='';grpSig='';groups={};batchOn=false;
  onResize();
  cam.z=clamp(VW/520,0.7,1.1);
  centerOn(T[0].tc.x,T[0].tc.y+30);
  menuPaused=false;$('pmenu').hidden=true;setPauseUI();$('bSpeed').textContent='1×';lastAuto=0;
  uiToast(isCoarse()?'收集资源、建造房屋，训练村民。点按选择，长按拖动框选':'收集资源、建造房屋，训练村民。摧毁红方城镇中心获胜','good');
}
let last=performance.now(),acc=0,panelT=0;
function frame(now){
  const dt=Math.min(0.1,(now-last)/1000);last=now;
  if(G&&worldCv){
    if(!G.paused&&!G.over&&$('menu').hidden){
      acc+=dt*G.speed;
      let n=0;while(acc>=STEP&&n<6){step(STEP);acc-=STEP;n++;}
      if(n>=6)acc=0;
      if(G.t-lastAuto>90)autoSave();
    }else flushCmds();
    edgeScroll(dt);
    drawWorld();drawMini();
    panelT-=dt;
    if(panelT<=0||selDirty){panelT=0.2;selDirty=false;refreshPanels();}
  }
  requestAnimationFrame(frame);
}
resetState();resetCmds();simSeed(7);genMap(7);startBases();ais=[];buildWorldCanvas();updateFog(0,true);onResize();
cam.z=clamp(VW/520,0.7,1.1);
centerOn(T[0].tc.x,T[0].tc.y+30);
updContinue();
requestAnimationFrame(frame);
