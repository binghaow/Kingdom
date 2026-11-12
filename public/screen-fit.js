/* v40 item 10: full screen and keeping overlays off the battlefield. UI only; no game state.
   - "全屏" buttons in the start menu and the pause settings. Where the Fullscreen API exists (Android, iPad Safari,
     desktop) they toggle it; iPhone Safari has no element fullscreen, so they show a short Add-to-Home-Screen guide.
     Launched from the home screen (display-mode standalone/fullscreen) the buttons and guide are hidden.
   - The debug/performance panel starts collapsed to two lines on phones and short windows; tap it to expand. */
(()=>{'use strict';const $=id=>document.getElementById(id),doc=document,root=doc.documentElement;
const standalone=()=>matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches||navigator.standalone===true;
const canFull=()=>!!((doc.fullscreenEnabled||doc.webkitFullscreenEnabled)&&(root.requestFullscreen||root.webkitRequestFullscreen));
const isFull=()=>!!(doc.fullscreenElement||doc.webkitFullscreenElement);
function guide(){let d=$('fs-guide');if(!d){d=doc.createElement('dialog');d.id='fs-guide';d.innerHTML='<h3>全屏游玩</h3><p>iPhone 的 Safari 不支持网页全屏。点 Safari 的「分享」→「添加到主屏幕」，之后从主屏幕图标打开即为全屏。</p><button type="button" class="primary" id="fs-guide-close">知道了</button>';doc.body.append(d);d.querySelector('#fs-guide-close').onclick=()=>d.close();d.addEventListener('click',e=>{if(e.target===d)d.close()})}if(!d.open)d.showModal()}
function toggle(){window.KingdomArt?.audioStart?.();if(isFull()){(doc.exitFullscreen||doc.webkitExitFullscreen)?.call(doc);return}if(!canFull()){guide();return}try{const r=(root.requestFullscreen||root.webkitRequestFullscreen).call(root,{navigationUI:'hide'});r?.catch?.(()=>guide())}catch{guide()}}
function button(id){const b=doc.createElement('button');b.type='button';b.id=id;b.className='fs-button';b.textContent='⛶ 全屏';b.title='全屏游玩';b.setAttribute('aria-label','全屏游玩');b.onclick=e=>{e.preventDefault();toggle()};return b}
function sync(){const hide=standalone();root.classList.toggle('app-standalone',hide);for(const b of doc.querySelectorAll('.fs-button,#full-view'))b.hidden=hide;for(const b of doc.querySelectorAll('.fs-button'))b.textContent=isFull()?'⛶ 退出全屏':'⛶ 全屏'}
function mount(){if(!$('fs-start')){const launch=$('open-online')?.parentElement;if(launch)launch.append(button('fs-start'));else $('start')?.after(button('fs-start'))}const grid=doc.querySelector('#pause-screen .settings-grid');if(grid&&!$('fs-settings'))grid.append(button('fs-settings'));const rail=$('full-view');if(rail)rail.onclick=toggle;sync()}
/* debug panel: collapsed on small screens, tap to expand / collapse */
const small=()=>innerWidth<900||innerHeight<500;
function fitDebug(node){if(!node||node.dataset.fit)return;node.dataset.fit='1';node.dataset.collapsed=small()?'1':'0';node.style.pointerEvents='auto';node.setAttribute('role','button');node.title='点击展开 / 收起诊断信息';node.addEventListener('click',()=>{node.dataset.collapsed=node.dataset.collapsed==='1'?'0':'1'})}
new MutationObserver(()=>{fitDebug($('performance-audit'));if(!$('fs-settings')||!$('fs-start'))mount()}).observe(doc.body,{childList:true,subtree:true});
for(const ev of ['fullscreenchange','webkitfullscreenchange'])doc.addEventListener(ev,sync);matchMedia('(display-mode: standalone)').addEventListener?.('change',sync);
if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',mount);else mount();fitDebug($('performance-audit'));
window.ScreenFit={toggle,guide,standalone,canFull};
})();
