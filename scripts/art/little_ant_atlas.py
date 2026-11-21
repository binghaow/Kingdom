#!/usr/bin/env python3
"""Little Ant companion atlas: cut, key, grade and check the daughter's design sheet.

This script does not draw or repaint anything. It only cuts the frames that already exist in
docs/art/drafts/little-ant/source-sheet-by-daughter.png, removes the dark sheet background to real
alpha, applies a light global colour grade, and packs every frame into one atlas with a shared
scale and a shared foot anchor.

  build : source sheet -> public/assets/little-ant-v1.png (+ icon, + layout JSON)
  check : atlas -> previews on grass / sea / dark + JSON report (halo, gutters, anchors)

Usage:
  python3 scripts/art/little_ant_atlas.py build
  python3 scripts/art/little_ant_atlas.py check
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "docs/art/drafts/little-ant/source-sheet-by-daughter.png")
OUT = os.path.join(ROOT, "public/assets/little-ant-v1.png")
ICON = os.path.join(ROOT, "public/assets/little-ant-icon-v1.png")
LAYOUT = os.path.join(ROOT, "docs/art/drafts/little-ant/atlas-layout.json")
DRAFT = os.path.join(ROOT, "docs/art/drafts/little-ant")

# Cell: every frame keeps the source scale (1.0, no resampling), feet on the ground line.
CW, CH, GROUND, GUTTER = 144, 132, 120, 4

# Source regions (x0, y0, x1, y1) that contain only the ant drawings of one strip, never the
# panel title, the Chinese labels below the 8-direction figures or the panel border lines.
STRIPS = {
    "idle":    [(800, 50, 1525, 172), (800, 214, 1525, 336)],   # two rows of four, labels excluded
    "walk":    [(10, 468, 828, 552)],
    "run":     [(856, 468, 1524, 552)],
    "jump":    [(10, 614, 770, 736)],
    "sleep":   [(798, 614, 1524, 736)],
    "special": [(10, 806, 1018, 940)],
}
COUNTS = {"idle": 8, "walk": 7, "run": 6, "jump": 6, "sleep": 5, "special": 8}
ROWS = ["idle", "walk", "run", "jump", "sleep", "special"]
# Side-view strips face right in the sheet; specials face as drawn (R = head right, L = head left).
SPECIAL = ["happy", "love", "surprised", "confused", "cheer", "rest", "carry", "dig"]
SPECIAL_FACING = ["L", "R", "L", "L", "R", "R", "R", "L"]
# Idle order in the sheet: back, back-right, right, front-right / front, front-left, left, back-left.
IDLE = ["back", "backRight", "right", "frontRight", "front", "frontLeft", "left", "backLeft"]
# Satellite parts that belong to the drawing (Zzz, heart, !, ?, cheer lines, plum, dirt) are kept for
# sleep and special frames; dust puffs of run/jump are dropped (they would trail wrongly when mirrored).
KEEP_SATELLITES = {"sleep", "special"}
# The sheet draws each strip at a slightly different size (the 8-direction figures are ~25% larger
# than the walk cycle, run/jump ~12% smaller). One shared on-screen size: side-view body width of
# the walk cycle (~92 px) is the reference; walk/sleep/special keep their pixels untouched.
STRIP_SCALE = {"idle": 0.80, "walk": 1.0, "run": 1.12, "jump": 1.10, "sleep": 1.0, "special": 1.0}

GRADE = {"desaturate": 0.10, "warm_rgb": [1.03, 1.0, 0.93], "light_top_left": 0.07,
         "light_bottom_right": -0.07, "gamma": 1.0}


def load():
    im = Image.open(SRC).convert("RGB")
    return np.asarray(im).astype(float)


def background_mask(rgb):
    """Sheet background and its painted cast shadows: dark, low-chroma, cool (blue >= red)."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    lum = .299 * r + .587 * g + .114 * b
    chroma = rgb.max(-1) - rgb.min(-1)
    return (b >= r - 6) & (lum < 95) & (chroma < 34)


def fill_drawn_holes(m, sub, bgc):
    """Fill enclosed holes only when they are part of the drawing (tiny, or not the sheet colour).
    Gaps between antennae, legs or the Zzz letters show the sheet and must stay transparent."""
    holes = ndimage.binary_fill_holes(m) & ~m
    lab, n = ndimage.label(holes)
    out = m.copy()
    for i in range(1, n + 1):
        h = lab == i
        if h.sum() < 10 or np.sqrt(((sub[h].mean(0) - bgc) ** 2).sum()) > 18:
            out |= h
    return out


def frames_in(rgb, box, count, keep_satellites):
    x0, y0, x1, y1 = box
    sub = rgb[y0:y1, x0:x1]
    fg = ~background_mask(sub)
    fg = ndimage.binary_opening(fg, np.ones((2, 2)))
    bgc = np.median(sub[background_mask(sub)], 0)
    lab, n = ndimage.label(fg, structure=np.ones((3, 3)))
    sizes = ndimage.sum(fg, lab, range(1, n + 1))
    objs = ndimage.find_objects(lab)
    bodies = [i for i in range(n) if sizes[i] >= 1500]
    bodies.sort(key=lambda i: objs[i][1].start)
    if len(bodies) != count:
        sys.exit(f"strip {box}: expected {count} bodies, found {len(bodies)}")
    out = []
    centers = [(objs[i][1].start + objs[i][1].stop) / 2 for i in bodies]
    for k, i in enumerate(bodies):
        m = lab == i + 1
        if keep_satellites:
            for j in range(n):
                if j == i or j in bodies or sizes[j] < 25:
                    continue
                s = objs[j]
                cx = (s[1].start + s[1].stop) / 2
                if (s[1].stop - s[1].start) > 160 or (s[0].stop - s[0].start) > 120:
                    continue                                  # panel border fragments
                nearest = min(range(len(bodies)), key=lambda q: abs(centers[q] - cx))
                if nearest == k:
                    m |= lab == j + 1
        m = fill_drawn_holes(m, sub, bgc)                     # pupils/mouth yes, sheet seen between antennae no
        sb = objs[i]
        foot = sb[0].stop                                     # lowest body pixel = foot contact
        ys, xs = np.where(m)
        out.append({"mask": m, "foot": foot + y0, "cx": (sb[1].start + sb[1].stop) / 2 + x0,
                    "box": (xs.min() + x0, ys.min() + y0, xs.max() + 1 + x0, ys.max() + 1 + y0),
                    "origin": (x0, y0), "full": m})
    return out


def matte(rgb, mask):
    """Hard interior + 1 px soft rim. Rim colours come from the nearest interior pixel so the dark
    sheet background never survives as a fringe (no un-premultiplied dark edge)."""
    inner = ndimage.binary_erosion(mask, np.ones((3, 3)))
    a = np.where(inner, 255.0, np.where(mask, 150.0, 0.0))
    # Smooth only the outermost ring (keeps interior detail untouched).
    soft = ndimage.gaussian_filter(mask.astype(float), 0.6) * 255
    a = np.where(inner, 255.0, np.minimum(a, soft))
    a[~mask] = 0
    _, (iy, ix) = ndimage.distance_transform_edt(~inner, return_indices=True)
    out = rgb.copy()
    rim = mask & ~inner
    out[rim] = rgb[iy[rim], ix[rim]]
    out[~mask] = 0
    return out, a


def grade(rgb, a):
    """Global look-match to the warm, slightly desaturated painted world: lose 10% saturation,
    warm the white balance a little, and add a soft top-left light / bottom-right falloff."""
    if not (a > 0).any():
        return rgb
    lum = (rgb @ np.array([.299, .587, .114]))[..., None]
    out = lum + (rgb - lum) * (1 - GRADE["desaturate"])
    out = out * np.array(GRADE["warm_rgb"])
    ys, xs = np.where(a > 0)
    h, w = a.shape
    yy, xx = np.mgrid[0:h, 0:w]
    nx = (xx - xs.min()) / max(1, xs.max() - xs.min())
    ny = (yy - ys.min()) / max(1, ys.max() - ys.min())
    t = np.clip((nx + ny) / 2, 0, 1)
    f = 1 + GRADE["light_top_left"] * (1 - t) + GRADE["light_bottom_right"] * t
    out = out * f[..., None]
    return np.clip(out, 0, 255)


def rescale(c, a, s):
    """Premultiplied Lanczos resize so edges never pick up black from transparent pixels."""
    if abs(s - 1) < 1e-6:
        return c, a
    pm = np.dstack([c * a[..., None] / 255, a]).clip(0, 255).astype(np.uint8)
    im = Image.fromarray(pm, "RGBA")
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    r = np.asarray(im).astype(float)
    a2 = r[..., 3]
    c2 = np.where(a2[..., None] > 0, r[..., :3] * 255 / np.maximum(a2[..., None], 1), 0)
    a2[a2 < 8] = 0
    return np.clip(c2, 0, 255), a2


def place(atlas, rgb, fr, col, row, s=1.0, flip=False):
    x0, y0, x1, y1 = fr["box"]
    ox, oy = fr["origin"]
    m = fr["mask"][y0 - oy:y1 - oy, x0 - ox:x1 - ox]
    crop = rgb[y0:y1, x0:x1].copy()
    c, a = matte(crop, m)
    c = grade(c, a)
    c, a = rescale(c, a, s)
    if flip:
        c, a = c[:, ::-1], a[:, ::-1]
    h, w = a.shape
    # feet on the shared ground line; horizontal centre on the body's centre
    fx = (fr["cx"] - x0) * s
    if flip:
        fx = w - fx
    dx = int(round(col * CW + CW / 2 - fx))
    dy = int(round(row * CH + GROUND - (fr["foot"] - y0) * s))
    if dx < col * CW + GUTTER or dx + w > (col + 1) * CW - GUTTER or dy < row * CH + GUTTER or dy + h > (row + 1) * CH - GUTTER:
        # clip what does not fit inside the gutter-protected cell (only tall icons can reach it)
        cx0, cy0 = max(dx, col * CW + GUTTER), max(dy, row * CH + GUTTER)
        cx1, cy1 = min(dx + w, (col + 1) * CW - GUTTER), min(dy + h, (row + 1) * CH - GUTTER)
        c = c[cy0 - dy:cy1 - dy, cx0 - dx:cx1 - dx]
        a = a[cy0 - dy:cy1 - dy, cx0 - dx:cx1 - dx]
        dx, dy = cx0, cy0
    rgba = np.dstack([c, a]).astype(np.uint8)
    view = atlas[dy:dy + rgba.shape[0], dx:dx + rgba.shape[1]]
    view[rgba[..., 3] > 0] = rgba[rgba[..., 3] > 0]


def build():
    rgb = load()
    cols = max(COUNTS.values())
    atlas = np.zeros((CH * len(ROWS), CW * cols, 4), np.uint8)
    layout = {"source": os.path.relpath(SRC, ROOT), "cell": [CW, CH], "ground": GROUND, "gutter": GUTTER,
              "scale": STRIP_SCALE, "rows": ROWS, "counts": COUNTS, "idle": IDLE, "special": SPECIAL,
              "specialFacing": SPECIAL_FACING, "grade": GRADE, "lift": {}, "bodies": {}}
    for row, name in enumerate(ROWS):
        frames = []
        for box in STRIPS[name]:
            frames += frames_in(rgb, box, COUNTS[name] // len(STRIPS[name]), name in KEEP_SATELLITES)
        ground = max(f["foot"] for f in frames) if name != "idle" else None
        lifts = []
        for col, fr in enumerate(frames):
            place(atlas, rgb, fr, col, row, STRIP_SCALE[name])
            lifts.append(int(round((ground - fr["foot"]) * STRIP_SCALE[name])) if ground else 0)
        layout["lift"][name] = lifts
        layout["bodies"][name] = [[int(v) for v in f["box"]] for f in frames]
    Image.fromarray(atlas, "RGBA").save(OUT, optimize=True)
    build_icon(rgb)
    with open(LAYOUT, "w") as f:
        json.dump(layout, f, ensure_ascii=False, indent=1)
    print(f"wrote {os.path.relpath(OUT, ROOT)} {atlas.shape[1]}x{atlas.shape[0]}; jump lift {layout['lift']['jump']}")


def build_icon(rgb):
    """Portrait from the large hero drawing (keeps the yellow scarf, backpack and bedroll); the
    sheet background, the grass tuft and the banner pole are dropped."""
    x0, y0, x1, y1 = 262, 14, 700, 392
    sub = rgb[y0:y1, x0:x1]
    fg = ~background_mask(sub)
    r, g, b = sub[..., 0], sub[..., 1], sub[..., 2]
    yy = np.mgrid[0:sub.shape[0], 0:sub.shape[1]][0]
    grass = (g > r * .95) & (g > b) & (yy > 300)
    glow = (yy > 330) & (r - b < 40)                        # pale ground glow under the feet
    fg &= ~grass & ~glow
    fg = ndimage.binary_opening(fg, np.ones((3, 3)))
    lab, n = ndimage.label(fg)
    sizes = ndimage.sum(fg, lab, range(1, n + 1))
    m = ndimage.binary_fill_holes(lab == 1 + int(np.argmax(sizes)))
    ys, xs = np.where(m)
    bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    c, a = matte(sub[by0:by1, bx0:bx1].copy(), m[by0:by1, bx0:bx1])
    c = grade(c, a)
    im = Image.fromarray(np.dstack([c, a]).astype(np.uint8), "RGBA")
    # premultiplied resize to 128 px box
    pm = np.asarray(im).astype(float); pm[..., :3] *= pm[..., 3:] / 255
    s = 120 / max(im.width, im.height)
    small = Image.fromarray(pm.astype(np.uint8), "RGBA").resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    r2 = np.asarray(small).astype(float)
    r2[..., :3] = np.where(r2[..., 3:] > 0, r2[..., :3] * 255 / np.maximum(r2[..., 3:], 1), 0)
    small = Image.fromarray(np.clip(r2, 0, 255).astype(np.uint8), "RGBA")
    icon = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    icon.alpha_composite(small, ((128 - small.width) // 2, 128 - 4 - small.height))
    icon.save(ICON, optimize=True)


# ----------------------------------------------------------------- check ----
SHEET = np.array([40.0, 40.0, 49.0])       # median sheet background colour (panel fill)


def sheet_coloured(rgb):
    """Pixels that still carry the sheet colour itself (distance < 14 from the panel fill or its
    darker painted shadow). The ant's own dark-brown outline is warm and stays outside this band."""
    d1 = np.sqrt(((rgb - SHEET) ** 2).sum(-1))
    d2 = np.sqrt(((rgb - SHEET * 0.62) ** 2).sum(-1))
    return (d1 < 14) | (d2 < 10)
def halo(rgb, a):
    """Rim pixels (0<a<255) must not carry the sheet background: report how many rim pixels are
    'sheet-like' (dark, low chroma, cool) and the mean chroma shift against the nearest solid pixel."""
    solid = a >= 250
    rim = (a > 0) & (a < 250)
    if rim.sum() < 20 or solid.sum() < 20:
        return {"rim_px": int(rim.sum()), "sheet_like": 0.0, "dR": 0.0, "dG": 0.0, "dB": 0.0}
    _, (iy, ix) = ndimage.distance_transform_edt(~solid, return_indices=True)
    e, i = rgb[rim], rgb[iy[rim], ix[rim]]
    ec, ic = e / np.maximum(e.sum(1, keepdims=True), 1), i / np.maximum(i.sum(1, keepdims=True), 1)
    shift = (ec - ic).mean(0) * 100
    sheet = sheet_coloured(e[None])[0]
    return {"rim_px": int(rim.sum()), "sheet_like": float(sheet.mean()),
            "dR": float(shift[0]), "dG": float(shift[1]), "dB": float(shift[2])}


def bg(kind, w, h):
    rng = np.random.default_rng(1)
    if kind == "grass":
        t = Image.open(os.path.join(ROOT, "public/assets/terrain-materials-v2.png")).convert("RGB")
        tile = t.crop((0, 0, t.width // 4, t.height // 2))
        out = Image.new("RGB", (w, h))
        for y in range(0, h, tile.height):
            for x in range(0, w, tile.width):
                out.paste(tile, (x, y))
        return out
    if kind == "sea":
        base = np.array([38, 92, 120], float)
        n = ndimage.gaussian_filter(rng.normal(0, 1, (h, w)), 6) * 60
        return Image.fromarray(np.clip(base + n[..., None] * [0.4, 0.8, 1.0], 0, 255).astype(np.uint8))
    return Image.new("RGB", (w, h), (22, 25, 30))


def check():
    im = Image.open(OUT)
    arr = np.asarray(im.convert("RGBA")).astype(float)
    rgb, a = arr[..., :3], arr[..., 3]
    H, W = a.shape
    items = []

    def item(name, ok, detail):
        items.append({"name": name, "pass": bool(ok), "detail": detail})

    item("PNG RGBA", im.format == "PNG" and im.mode == "RGBA", f"{im.format} {im.mode}")
    item("尺寸 = 8×144 × 6×132", (W, H) == (CW * 8, CH * 6), f"{W}×{H}")
    tr = float((a == 0).mean())
    item("真透明（alpha 最小 0，透明 ≥ 50%）", a.min() == 0 and tr >= .5, f"透明像素 {tr:.1%}")
    gut = np.zeros_like(a, bool)
    for c in range(9):
        gut[:, max(0, c * CW - GUTTER):c * CW + GUTTER] = True
    for r in range(7):
        gut[max(0, r * CH - GUTTER):r * CH + GUTTER, :] = True
    item("格间隔全透明（行列各 8 px）", a[gut].max() == 0, f"间隔区最大 alpha {int(a[gut].max())}")
    # no leftover sheet background anywhere: opaque pixels that look like the sheet are allowed only
    # inside the drawing (pupils / outlines are enclosed); count sheet-like pixels touching transparency
    edge = (a > 0) & ndimage.binary_dilation(a == 0, np.ones((3, 3)))
    sheet = sheet_coloured(rgb) & edge
    item("边缘无深色底残留（贴透明处的底色像素 < 1%）", sheet.sum() / max(1, edge.sum()) < .01,
         f"{int(sheet.sum())} / {int(edge.sum())} 边缘像素")
    cells, bad_anchor, bad_halo = [], [], []
    for row, name in enumerate(ROWS):
        for col in range(COUNTS[name]):
            ca = a[row * CH:(row + 1) * CH, col * CW:(col + 1) * CW]
            cr = rgb[row * CH:(row + 1) * CH, col * CW:(col + 1) * CW]
            if not (ca > 0).any():
                cells.append({"row": name, "col": col, "empty": True}); bad_anchor.append(f"{name}{col}"); continue
            ys, xs = np.where(ca > 0)
            h = halo(cr, ca)
            c = {"row": name, "col": col, "bbox": [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1], "halo": h}
            cells.append(c)
            if abs(int(ys.max()) + 1 - GROUND) > 3:
                bad_anchor.append(f"{name}{col}:{int(ys.max()) + 1 - GROUND:+d}")
            if h["rim_px"] >= 20 and (h["sheet_like"] > .02 or max(abs(h["dR"]), abs(h["dG"]), abs(h["dB"])) > 6):
                bad_halo.append(f"{name}{col}")
    item("每格有内容且脚底接地（地线 y=120 ±3 px）", not bad_anchor, ", ".join(bad_anchor) or "全部")
    item("边缘无色偏/底色（rim 底色像素 ≤2%，色相差 ≤6）", not bad_halo, ", ".join(bad_halo) or "无")
    icon = Image.open(ICON)
    ia = np.asarray(icon.convert("RGBA"))[..., 3]
    item("头像 128×128 RGBA 透明角", icon.size == (128, 128) and icon.mode == "RGBA" and ia[0, 0] == 0 and ia[-1, -1] == 0, f"{icon.size} {icon.mode}")
    for kind in ("grass", "sea", "dark"):
        b = bg(kind, W, H).convert("RGBA"); b.alpha_composite(im.convert("RGBA"))
        big = b.convert("RGB").resize((W * 2, H * 2), Image.NEAREST) if kind == "dark" else b.convert("RGB")
        big.save(os.path.join(DRAFT, f"atlas-preview-{kind}.png"))
    res = {"file": os.path.relpath(OUT, ROOT), "size": [W, H], "items": items, "cells": cells,
           "pass": all(i["pass"] for i in items)}
    with open(os.path.join(DRAFT, "atlas-check.json"), "w") as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
    for i in items:
        print(("PASS " if i["pass"] else "FAIL ") + i["name"] + " — " + i["detail"])
    return 0 if res["pass"] else 1


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "build"
    if cmd == "build":
        build()
    elif cmd == "check":
        sys.exit(check())
    else:
        sys.exit(__doc__)
