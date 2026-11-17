#!/usr/bin/env python3
"""P2 asset pipeline helper (called by scripts/art/size-assets.cjs; needs Pillow with WebP support).

Modes (JSON on stdin, JSON on stdout):
  {"mode":"attack-extent","files":[...]}  -> per action atlas, the largest alpha extent (px) of any row's 4-frame union box,
     the same quantity attack-art.js decode() calls `largest` (rows split at the alpha gutter nearest each quarter).
  {"mode":"resize","jobs":[{"src","dst","scale","quality"}]} -> premultiplied-alpha Lanczos resize, then WebP
     (lossy colour at `quality`, lossless alpha), or lossless WebP when quality is null.
Premultiplying before filtering keeps transparent pixels' (often black) colour out of the edge blend: no dark halos.
"""
import json, sys, os, hashlib
from PIL import Image

def gutters(alpha, h, w):
    rows = [sum(1 for x in range(0, w, 2) if alpha[y * w + x] > 150) for y in range(h)]
    edges = [0]
    for r in range(1, 4):
        nominal = h * r / 4
        best, score = round(nominal), float('inf')
        lo = int(max(edges[-1] + h * .1, nominal - h * .12)); hi = int(min(h - 2, nominal + h * .12))
        for y in range(lo, hi):
            n = sum(rows[max(0, min(h - 1, y + k))] for k in range(-2, 3))
            s = n / (w * 2.5) + abs(y - nominal) / h * .02
            if s < score: score, best = s, y
        edges.append(best)
    return edges + [h]

def attack_extent(path):
    im = Image.open(path).convert('RGBA'); w, h = im.size
    a = im.getchannel('A'); alpha = a.tobytes()
    edges = gutters(alpha, h, w); largest = 1
    for r in range(4):
        box = a.crop((0, edges[r], w, edges[r + 1])).point(lambda v: 255 if v > 150 else 0).getbbox()
        if box: largest = max(largest, box[2] - box[0], box[3] - box[1])
    # a row's union box spans 4 frames side by side in the atlas; decode() measures it per frame column re-centred, so use the
    # per-column extent instead: the widest single cell box and the row height.
    cw = w / 4; per = 1
    for r in range(4):
        for c in range(4):
            box = a.crop((int(c * cw), edges[r], int((c + 1) * cw), edges[r + 1])).point(lambda v: 255 if v > 150 else 0).getbbox()
            if box: per = max(per, box[2] - box[0], box[3] - box[1])
    return {'w': w, 'h': h, 'cell': per}

def resize(job):
    src, dst, scale, q = job['src'], job['dst'], job['scale'], job.get('quality')
    im = Image.open(src)
    has_alpha = im.mode in ('RGBA', 'LA', 'P') and (im.mode != 'P' or 'transparency' in im.info)
    im = im.convert('RGBA' if has_alpha else 'RGB')
    w, h = im.size; W, H = max(1, round(w * scale)), max(1, round(h * scale))
    if (W, H) != (w, h):
        if has_alpha:
            im = im.convert('RGBa').resize((W, H), Image.LANCZOS, reducing_gap=3.0).convert('RGBA')
        else:
            im = im.resize((W, H), Image.LANCZOS, reducing_gap=3.0)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if q is None: im.save(dst, 'WEBP', lossless=True, quality=100, method=4, exact=False)
    else: im.save(dst, 'WEBP', quality=q, alpha_quality=100, method=4, exact=False)
    return {'dst': dst, 'w': W, 'h': H, 'bytes': os.path.getsize(dst), 'srcBytes': os.path.getsize(src), 'srcW': w, 'srcH': h}

def main():
    req = json.load(sys.stdin)
    if req['mode'] == 'attack-extent':
        print(json.dumps({f: attack_extent(f) for f in req['files']}))
    elif req['mode'] == 'resize':
        from multiprocessing import Pool
        with Pool(max(1, (os.cpu_count() or 2))) as pool:
            print(json.dumps(pool.map(resize, req['jobs'])))
    elif req['mode'] == 'hash':
        print(json.dumps({f: hashlib.sha1(open(f, 'rb').read()).hexdigest()[:12] for f in req['files']}))

if __name__ == '__main__':
    main()
