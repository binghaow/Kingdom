#!/usr/bin/env python3
"""Reproducible alpha extraction for public/assets/functional-buildings-v1.jpg (3x2: mill, mining camp, riding academy;
row 2 = refined era-3 versions). The JPEG has a black matte with white JPEG debris; until now painted-architecture.js keyed
it at runtime (clearFunctionalMatte: black/white flood fill, hard edges), which left grey/white fringes and stray specks.
This writes public/assets/functional-buildings-v2.png (RGBA, same 3x2 layout and size; the source JPEG is not edited):
  1. background = near-black (max channel < 70) or near-white (min > 225, low saturation) pixels connected to the image border
     or to a cell border, grown once more into light/dark low-saturation fringe pixels that touch it;
  2. per cell keep the largest foreground component plus pieces overlapping its box (roof finials, flags); drop specks;
  3. soft 1 px edge: alpha from a small blur of the mask, colour un-premultiplied from the black matte (no dark halo).
usage: python3 -I scripts/art/key_functional_buildings.py [src.jpg] [out.png]"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

src = sys.argv[1] if len(sys.argv) > 1 else 'public/assets/functional-buildings-v1.jpg'
out = sys.argv[2] if len(sys.argv) > 2 else 'public/assets/functional-buildings-v2.png'
im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
H, W, _ = im.shape
COLS, ROWS = 3, 2
hi, lo = im.max(2), im.min(2)
cand = (hi < 70) | ((lo > 225) & (hi - lo < 40))
# seeds: image border and the cell cut lines (cells are cut at W/3, H/2 in painted-architecture.js)
seed = np.zeros((H, W), bool)
seed[0, :] = seed[-1, :] = seed[:, 0] = seed[:, -1] = True
for c in range(1, COLS):
    x = int(round(W * c / COLS)); seed[:, max(0, x - 1):x + 1] = True
for r in range(1, ROWS):
    y = int(round(H * r / ROWS)); seed[max(0, y - 1):y + 1, :] = True
lab, n = ndimage.label(cand)
bg_ids = np.unique(lab[seed & cand])
bg = np.isin(lab, bg_ids[bg_ids > 0])
# The generator baked a fake-transparency band around each building: a bright yellow/white rim, then mottled grey with
# yellow, pink and green speckles. Grow the background through it (at most BAND px from the black matte): rim colours,
# speckle colours, and grey pixels whose 5x5 neighbourhood is speckled. Painted surfaces inside the outline stop the growth.
R, G, B = im[..., 0], im[..., 1], im[..., 2]
sat = hi - lo
rim = ((R > 140) & (G > 140) & (B < 120) & (sat > 50)) | ((lo > 175) & (sat < 60)) | (hi < 95)
speck = ((R > G + 25) & (B > G + 5)) | ((G > R + 12) & (G > B + 12) & (G > 110)) | ((R > 150) & (G > 150) & (B < 110))
speckly = ndimage.uniform_filter(speck.astype(np.float32), 5) > 0.12
greyish = (sat < 40) & (lo > 85)
band = rim | speck | (greyish & speckly)
BAND = 26
dist = ndimage.distance_transform_edt(~bg)
for _ in range(BAND):
    grow = ndimage.binary_dilation(bg) & band & ~bg & (dist <= BAND)
    if not grow.any():
        break
    bg |= grow
# one-pixel cleanup of what remains of the rim
bg |= ndimage.binary_dilation(bg) & rim
fg = ~bg
# per cell: largest component + pieces overlapping its bounding box; drop isolated specks
keep = np.zeros_like(fg)
for r in range(ROWS):
    for c in range(COLS):
        y0, y1 = int(round(H * r / ROWS)), int(round(H * (r + 1) / ROWS))
        x0, x1 = int(round(W * c / COLS)), int(round(W * (c + 1) / COLS))
        cell = fg[y0:y1, x0:x1]
        l, k = ndimage.label(cell)
        if not k:
            continue
        sizes = ndimage.sum(np.ones_like(l), l, index=range(1, k + 1))
        main = int(np.argmax(sizes)) + 1
        sl = ndimage.find_objects(l)
        my0, my1, mx0, mx1 = sl[main - 1][0].start, sl[main - 1][0].stop, sl[main - 1][1].start, sl[main - 1][1].stop
        ok = np.zeros(k + 1, bool); ok[main] = True
        for i, s in enumerate(sl, start=1):
            if i == main or sizes[i - 1] < 12:
                continue
            if s[0].stop >= my0 - 20 and s[0].start <= my1 and s[1].stop >= mx0 and s[1].start <= mx1:
                ok[i] = True
        keep[y0:y1, x0:x1] = ok[l]
keep = ndimage.binary_fill_holes(keep) | (keep & fg)
# What the growth above cannot tell from painted stone is the inner, grey part of the baked band (5-8 px wide on the source).
# Trim the outer silhouette by ERODE px (about 2-3 screen px at the in-game size); interior holes are not touched.
ERODE = 6
keep = ndimage.binary_erosion(keep, iterations=ERODE, border_value=0) | (keep & ~ndimage.binary_dilation(~keep & bg, iterations=ERODE))
# soft edge: blur the hard mask a little, but never make interior pixels transparent
soft = ndimage.gaussian_filter(keep.astype(np.float32), 0.6)
alpha = np.where(ndimage.binary_erosion(keep, iterations=1), 1.0, np.clip(soft * keep + soft * 0.5 * ~keep, 0, 1))
alpha[alpha < 0.08] = 0
# un-premultiply edge colour against the black matte (c = a * fg)
a3 = np.maximum(alpha, 1e-3)[..., None]
edge = (alpha > 0) & (alpha < 1)
rgb = im.copy()
rgb[edge] = np.clip(im[edge] / a3[edge], 0, 255)
rgb[alpha == 0] = 0
rgba = np.dstack([rgb, alpha * 255]).round().astype(np.uint8)
# 4. Re-layout. The generated sheet is not on a clean grid: buildings cross the W/3 cut lines (a runtime cut then showed slivers of
# the neighbour and its trimmed box grew). Split each row at the emptiest column near each cut line (and the rows at the
# emptiest line near H/2), then paste every building centred in a uniform 3x2 grid with a transparent gutter, so the runtime
# cut (3 columns x 2 rows, trimmed to the alpha box) gets exactly one whole building per cell.
op = alpha > 0
def split(profile, at, reach):
    lo_, hi_ = max(1, at - reach), min(len(profile) - 1, at + reach)
    return lo_ + int(np.argmin(profile[lo_:hi_]))
ys = [0, split(op.sum(1), H // 2, 40), H]
pieces = []
for r in range(ROWS):
    band = op[ys[r]:ys[r + 1]]
    xs = [0] + [split(band.sum(0), int(round(W * c / COLS)), 70) for c in range(1, COLS)] + [W]
    for c in range(COLS):
        box = rgba[ys[r]:ys[r + 1], xs[c]:xs[c + 1]].copy()
        m = box[..., 3] > 0
        l, k = ndimage.label(m)
        if k:  # this building only: its largest piece + pieces overlapping its box (drops what is left of a neighbour)
            sizes = ndimage.sum(m, l, range(1, k + 1)); main = int(np.argmax(sizes)) + 1; sl = ndimage.find_objects(l)
            y0, y1, x0, x1 = sl[main - 1][0].start, sl[main - 1][0].stop, sl[main - 1][1].start, sl[main - 1][1].stop
            ok = np.zeros(k + 1, bool); ok[main] = True
            near = ndimage.binary_dilation(l == main, iterations=3)
            for i, q in enumerate(sl, start=1):  # finials/flags just off the roof; isolated specks (JPEG debris) go
                if i != main and sizes[i - 1] >= 40 and near[l == i].any():
                    ok[i] = True
            box[~ok[l]] = 0
        yy, xx = np.nonzero(box[..., 3])
        pieces.append(box[yy.min():yy.max() + 1, xx.min():xx.max() + 1])
GUT = 6
cw = max(p.shape[1] for p in pieces) + 2 * GUT; ch = max(p.shape[0] for p in pieces) + 2 * GUT
sheet = np.zeros((ch * ROWS, cw * COLS, 4), np.uint8)
for i, p in enumerate(pieces):
    r, c = divmod(i, COLS); h, w = p.shape[:2]
    y0 = r * ch + ch - GUT - h; x0 = c * cw + (cw - w) // 2  # bottom-aligned (ground line) and centred
    sheet[y0:y0 + h, x0:x0 + w] = p
Image.fromarray(sheet, 'RGBA').save(out, optimize=True)
print(f'keyed {W}x{H}: background {int((alpha == 0).sum())} px, soft edge {int(edge.sum())} px; buildings ' + ', '.join(f'{p.shape[1]}x{p.shape[0]}' for p in pieces) + f' -> {out} ({cw * COLS}x{ch * ROWS})')
