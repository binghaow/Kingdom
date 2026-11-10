/* Shared, deterministic carrier deck layout used by rendering and regression checks. */
(()=>{'use strict';const api={
 slot(direction,index){const i=Math.max(0,Math.min(3,index|0)),side=i%2?1:-1,row=i<2?-1:1;if(direction==='front'||direction==='back')return{x:side*25,y:row*48};return{x:side*48,y:row*25}},
 bounds(x,y,width,height){return{x:x-width/2,y:y-height/2,width,height}},
 landing(fromX,fromY,toX,toY,progress){const p=Math.max(0,Math.min(1,progress)),arc=Math.sin(p*Math.PI)*20;return{x:fromX+(toX-fromX)*p,y:fromY+(toY-fromY)*p-arc}}
};if(typeof window!=='undefined')window.KingdomCarrierLayout=api;if(typeof module!=='undefined'&&module.exports)module.exports=api})();
