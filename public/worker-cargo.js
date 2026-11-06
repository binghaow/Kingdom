/* Pixel sockets authored against the existing 8-frame woven-basket walk cycle. */
((root)=>{'use strict';const sockets=[{x:64,y:48},{x:65,y:48},{x:67,y:47},{x:68,y:47},{x:69,y:49},{x:70,y:48},{x:72,y:47},{x:73,y:48}];
const source='assets/villager-carry-v9.png',regions={wood:{col:0,x:.215,y:.035,w:.35,h:.48},stone:{col:1,x:.23,y:0,w:.39,h:.21},gold:{col:2,x:.23,y:0,w:.39,h:.21},food:{col:3,x:.22,y:0,w:.39,h:.24}};
function socket(index,w=157,h=157){const p=sockets[((index%8)+8)%8];return{x:p.x*w/157,y:p.y*h/157,rx:15*w/157,top:27*h/157,lip:3*h/157}}
function placement(index,resource,tw,th,w=157,h=157){if(!regions[resource]||!(tw>0&&th>0))return null;const p=socket(index,w,h),scale=Math.min(p.rx*1.72/tw,p.top/th),width=tw*scale,height=th*scale;return{...p,scale,width,height,left:p.x-width/2,topY:p.y+2*h/157-height,bottom:p.y+2*h/157}}
const api={source,regions,socket,placement};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.KingdomCargo=api;
})(typeof window==='undefined'?globalThis:window);
