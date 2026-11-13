/* V41 unit scale: land units were drawn about as tall as a cottage (villager 91 px vs house 131 px), so people looked a
   size too big next to farms and buildings. Presentation only: the simulation, collision and ranges are unchanged.
   The scale is applied around the unit's ground anchor, so feet stay where they were and every overlay drawn inside
   A.unit (team ring, pennant, cargo) shrinks with the sprite.
   Loaded BEFORE precision-picking.js so picking masks, occlusion outlines and head-bar positions (entityBounds) all use
   the scaled sprite. Applies only to the battlefield canvas and to precision-picking masks; icon and preview canvases
   keep their own fitting. */
(()=>{'use strict';const A=window.KingdomArt,D=window.KingdomSim.defs,base=A.unit;
const LAND=.76,KIND={villager:.64};
const scaleOf=k=>{const d=D[k];if(!d||d.building||d.domain==='sea'||d.domain==='air'||d.monster)return 1;return KIND[k]??LAND};
A.unitScale=scaleOf;
A.unit=(c,u,t,selected)=>{const s=scaleOf(u.kind);if(s===1||!(c.canvas?.id==='world'||'_actionSeed' in u))return base(c,u,t,selected);
 c.save();c.translate(u.x,u.y);c.scale(s,s);c.translate(-u.x,-u.y);try{return base(c,u,t,selected)}finally{c.restore()}};
})();
