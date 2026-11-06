(() => {
  // Read-only DOM probe. No game globals, storage, network, events or mutations.
  const W=innerWidth,H=innerHeight,findings=[];
  const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};
  const label=e=>e.id?'#'+e.id:e.tagName.toLowerCase()+(e.className&&typeof e.className==='string'?'.'+e.className.trim().split(/\s+/).join('.'):'');
  const modal=[...document.querySelectorAll('dialog[open]')].at(-1);
  const pause=document.querySelector('#pause-screen:not([hidden])');
  const scope=modal||pause||document;
  const visible=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&!e.closest('[hidden]')};
  const add=(type,e,detail,severity='review')=>findings.push({type,severity,element:label(e),text:(e.getAttribute('aria-label')||e.textContent||'').trim().slice(0,100),rect:rect(e),detail});
  const clippedInScroller=e=>{const r=rect(e);for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p),a=rect(p);if(/auto|scroll/.test(s.overflowX)&&(r.x<a.x-2||r.right>a.right+2)||/auto|scroll/.test(s.overflowY)&&(r.y<a.y-2||r.bottom>a.bottom+2))return true}return false};
  for(const e of scope.querySelectorAll('button,select,input,footer,.map-wrap,#world-rail,#touch-toolbar,#tutorial-panel,#target-card')){
    if(!visible(e)||clippedInScroller(e))continue;const r=rect(e);
    // An item beyond a deliberate horizontal/vertical scroller is not a panel overflow.
    let scroll=false;for(let p=e.parentElement;p&&p!==scope;p=p.parentElement){const s=getComputedStyle(p);if(/auto|scroll/.test(s.overflowX+s.overflowY)){scroll=true;break}}
    if(!scroll&&(r.x< -2||r.y< -2||r.right>W+2||r.bottom>H+2))add('outside-viewport',e,'Control/panel outside current viewport','error');
    if(e.matches('button')&&r.x>=0&&r.y>=0&&r.right<=W&&r.bottom<=H){const top=document.elementFromPoint(r.x+r.w/2,r.y+r.h/2);if(top&&!e.contains(top)&&!top.contains(e))add('covered-control',e,'Center hit belongs to '+label(top));}
  }
  if(!modal&&!pause){
    const footer=document.querySelector('footer');if(footer&&visible(footer)){const f=rect(footer);for(const e of footer.querySelectorAll('.selection,.commands,.army,.army button')){if(!visible(e))continue;const r=rect(e);if(r.x<f.x-2||r.y<f.y-2||r.right>f.right+2||r.bottom>f.bottom+2)add('footer-overflow',e,'Outside footer rectangle','error')}}
    for(const e of document.querySelectorAll('#selected-name,#selected-info,#selected-health,.army button span,.action strong,.action small,.queue-count,#action-title,#mode-label')){if(!visible(e)||clippedInScroller(e))continue;const r=rect(e);if(r.right<0||r.x>W)continue;if(e.scrollHeight>e.clientHeight+2||e.scrollWidth>e.clientWidth+2)add('text-clipped',e,'Check screenshot and Details access; deliberate ellipsis may be acceptable');for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p),a=rect(p);if(/hidden|clip/.test(s.overflowY)&& (r.y<a.y-2||r.bottom>a.bottom+2)||/hidden|clip/.test(s.overflowX)&& (r.x<a.x-2||r.right>a.right+2)){add('ancestor-clips-text',e,'Text rectangle escapes clipping ancestor '+label(p));break}}}
    const title=document.querySelector('.section-label'),tabs=document.querySelector('#build-tabs');if(title&&tabs&&visible(title)&&visible(tabs)){const a=rect(title),b=rect(tabs);if(Math.min(a.right,b.right)-Math.max(a.x,b.x)>4&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>4)add('command-title-overlap',tabs,'Build tabs overlap command title','error')}
    const panels=['.map-wrap','#world-rail','#touch-toolbar','#tutorial-panel','#target-card'].map(s=>document.querySelector(s)).filter(e=>e&&visible(e));
    for(let i=0;i<panels.length;i++)for(let j=i+1;j<panels.length;j++){const a=rect(panels[i]),b=rect(panels[j]);if(Math.min(a.right,b.right)-Math.max(a.x,b.x)>4&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>4)add('panel-overlap',panels[i],'Overlaps '+label(panels[j]));}
  }
  return {viewport:{width:W,height:H},language:document.documentElement.lang,scope:modal?label(modal):pause?'pause':'game',collapsed:document.body.classList.contains('commands-collapsed'),findings};
})()
