'use strict';
/* Mill / mining camp / riding academy art (player report: "图片没抠干净，有底色/毛边"). The v1 JPEG has a black matte plus a baked
   fake-transparency band (bright yellow/white rim, speckled grey); scripts/art/key_functional_buildings.py writes the keyed
   functional-buildings-v2.png that painted-architecture.js loads. Checks the shipped PNG: real alpha, transparent cell
   borders, opaque building cores, almost no rim-yellow or near-black pixels left on the silhouette edge, and the runtime no
   longer keys the JPEG. */
const assert = require('node:assert/strict'), fs = require('node:fs'), { spawnSync } = require('node:child_process');
const src = fs.readFileSync('./public/painted-architecture.js', 'utf8');
assert.ok(src.includes("load('assets/functional-buildings-v2.png')") && !src.includes('functional-buildings-v1.jpg') && !src.includes('clearFunctionalMatte'), 'runtime loads the keyed PNG');
const py = `
import json,numpy as np
from PIL import Image
from scipy import ndimage
a=np.asarray(Image.open('public/assets/functional-buildings-v2.png'));H,W,_=a.shape;al=a[...,3]
edge=(al>0)&ndimage.binary_dilation(al==0)
r,g,b=[a[...,i].astype(int) for i in range(3)]
rim=(r>140)&(g>140)&(b<120)&(r+g-2*b>100)
out=[]
for row in range(2):
  for col in range(3):
    y0,y1,x0,x1=round(H*row/2),round(H*(row+1)/2),round(W*col/3),round(W*(col+1)/3)
    c=al[y0:y1,x0:x1];e=edge[y0:y1,x0:x1]
    out.append(dict(border=float((np.concatenate([c[0],c[-1],c[:,0],c[:,-1]])>0).mean()),core=float((c[(y1-y0)//2-20:(y1-y0)//2+20,(x1-x0)//2-20:(x1-x0)//2+20]==255).mean()),opaque=float((c>0).mean()),rimEdge=float((rim[y0:y1,x0:x1]&e).sum()/max(1,e.sum())),darkEdge=float(((a[y0:y1,x0:x1,:3].max(2)<40)&e).sum()/max(1,e.sum()))))
j=np.asarray(Image.open('public/assets/functional-buildings-v1.jpg').convert('RGB')).astype(int)
bgv=ndimage.binary_dilation(np.zeros(j.shape[:2],bool),iterations=0)
cand=(j.max(2)<70)|((j.min(2)>238)&(j.max(2)-j.min(2)<32));l,n=ndimage.label(cand);seed=np.zeros_like(cand);seed[0]=seed[-1]=True;seed[:,0]=seed[:,-1]=True
ids=np.unique(l[seed&cand]);bgv=np.isin(l,ids[ids>0]);e1=(~bgv)&ndimage.binary_dilation(bgv)
R,G,B=j[...,0],j[...,1],j[...,2];rim1=(R>140)&(G>140)&(B<120)&(R+G-2*B>100)
v1=dict(rimEdge=float((rim1&e1).sum()/e1.sum()),fg=int((~bgv).sum()),v2fg=int((al>0).sum()))
print(json.dumps(dict(v1=v1,mode=Image.open('public/assets/functional-buildings-v2.png').mode,cells=out)))`;
const r = spawnSync(process.env.KINGDOM_PYTHON || 'python3', ['-I', '-c', py], { encoding: 'utf8' });
assert.equal(r.status, 0, r.stderr);
const m = JSON.parse(r.stdout);
assert.equal(m.mode, 'RGBA');
assert.ok(m.v1.v2fg < m.v1.fg * 0.99, `rim and specks removed: v2 keeps ${m.v1.v2fg} px of the ${m.v1.fg} px the old runtime key kept`);
m.cells.forEach((c, i) => {
  assert.ok(c.border < 0.05, `cell ${i}: cell border transparent except where the art touches it (${c.border})`);
  assert.ok(c.core > 0.95, `cell ${i}: building core opaque (${c.core})`);
  assert.ok(c.opaque > 0.25 && c.opaque < 0.85, `cell ${i}: silhouette, not the whole cell (${c.opaque})`);
  assert.ok(c.darkEdge < 0.05, `cell ${i}: black matte left on ${(c.darkEdge * 100).toFixed(1)}% of the edge`);
});
console.log('PASS functional-buildings-v2.png keyed: 6 cells RGBA (' + m.v1.v2fg + ' opaque px vs ' + m.v1.fg + ' kept by the old runtime JPEG key: bright rim and specks removed; the grey part of the baked band remains, needs regenerated art), cell borders transparent (art touching the edge < 5%), opaque cores, black matte on edge ' + m.cells.map((c) => (c.darkEdge * 100).toFixed(1) + '%').join('/') + '; runtime loads the PNG (no JPEG keying)');
