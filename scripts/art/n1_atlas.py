#!/usr/bin/env python3
"""N1 resource-node atlas (gold mine / stone quarry) — assemble + validate.

This script does NOT draw art. It only does non-destructive post-processing of
images produced by an image generator, and checks the result against the N1 spec
in docs/art/asset-audit-v2.md.

  build : 8 source images -> 2048x1024 RGBA atlas (4x2 cells of 512x512)
          * keys out a flat background when the source has no real alpha
          * removes matte contamination on semi-transparent edge pixels
          * crops, scales ALL cells by one common factor, anchors ground at (256,430)
  check : atlas -> JSON + Markdown report, previews on grass / sea / dark UI

Usage:
  python3 scripts/art/n1_atlas.py build --out atlas.png g1 g2 g3 g4 s1 s2 s3 s4 [--key auto|none|#rrggbb]
  python3 scripts/art/n1_atlas.py check atlas.png --outdir docs/art/drafts/<ver>/
"""
import argparse, json, os, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

W, H, CELL, COLS, ROWS = 2048, 1024, 512, 4, 2
ANCHOR = (256, 430)          # ground-contact centre inside each cell
MARGIN = int(CELL * 0.08)    # 8% transparent margin = 41 px
GUTTER = 4                   # px of alpha 0 on each cell edge -> 8 px between cells
NAMES = ["gold_rich", "gold_mid", "gold_poor", "gold_empty",
         "stone_rich", "stone_mid", "stone_poor", "stone_empty"]
ASSETS = os.path.join(os.path.dirname(__file__), "..", "..", "public", "assets")


# ----------------------------------------------------------------- build ----
def _key_background(rgb, key):
    """Return alpha from a flat background colour (chroma key with soft edge)."""
    if key == "auto":  # median of the 4 border strips
        border = np.concatenate([rgb[:4].reshape(-1, 3), rgb[-4:].reshape(-1, 3),
                                 rgb[:, :4].reshape(-1, 3), rgb[:, -4:].reshape(-1, 3)])
        kc = np.median(border, axis=0)
    else:
        kc = np.array([int(key[i:i + 2], 16) for i in (1, 3, 5)], float)
    d = np.sqrt(((rgb - kc) ** 2).sum(-1))
    # Generated "flat magenta" backgrounds can leave a small pink mix in
    # silhouette edges. Keep those transition pixels fractional so the
    # existing unmix/decontamination step can remove the matte safely.
    lo, hi = 18.0, 150.0                      # distance band -> soft alpha
    a = np.clip((d - lo) / (hi - lo), 0, 1)
    # un-mix the key colour out of edge pixels: C = a*F + (1-a)*K  ->  F
    with np.errstate(divide="ignore", invalid="ignore"):
        f = (rgb - (1 - a[..., None]) * kc) / np.maximum(a[..., None], 1e-3)
    f = np.clip(np.nan_to_num(f), 0, 255)
    return f, a * 255


def _decontaminate(rgb, alpha):
    """Edge pixels (0<a<250) take colour from the nearest solid interior pixel.
    Removes black / white / coloured matte halos without touching the interior."""
    solid = alpha >= 250
    if solid.sum() == 0:
        return rgb
    _, (iy, ix) = ndimage.distance_transform_edt(~solid, return_indices=True)
    edge = (alpha > 0) & ~solid
    out = rgb.copy()
    out[edge] = rgb[iy[edge], ix[edge]]
    out[alpha == 0] = 0
    return out


def _load(path, key):
    im = Image.open(path)
    has_alpha = im.mode in ("RGBA", "LA") or "transparency" in im.info
    im = im.convert("RGBA")
    arr = np.asarray(im).astype(float)
    rgb, a = arr[..., :3], arr[..., 3]
    real_alpha = has_alpha and a.min() == 0 and (a == 0).mean() > 0.05
    if not real_alpha:
        if key == "none":
            sys.exit(f"{path}: no real alpha and --key none")
        rgb, a = _key_background(rgb, key)
    a[a < 6] = 0                              # kill near-invisible dust
    lab, n = ndimage.label(a > 0)             # drop specks far from the subject
    if n > 1:
        sizes = ndimage.sum(a > 0, lab, range(1, n + 1))
        keep = np.isin(lab, 1 + np.where(sizes >= max(40, sizes.max() * 0.002))[0])
        a[~keep] = 0
    rgb = _decontaminate(rgb, a)
    return rgb, a


def build(args):
    srcs = [_load(p, args.key) for p in args.inputs]
    boxes = []
    for rgb, a in srcs:
        ys, xs = np.where(a > 0)
        boxes.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    # one common scale for all 8 so stages stay comparable; fit the largest
    max_w = max(b[2] - b[0] for b in boxes)
    max_up = max(b[3] - b[1] for b in boxes)
    room_w = CELL - 2 * MARGIN
    room_up = ANCHOR[1] - MARGIN                  # space above the ground line
    scale = min(room_w * args.fill / max_w, room_up / max_up)
    atlas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for i, ((rgb, a), b) in enumerate(zip(srcs, boxes)):
        crop = np.dstack([rgb, a])[b[1]:b[3], b[0]:b[2]].astype(np.uint8)
        im = Image.fromarray(crop, "RGBA")
        # premultiply before resampling so edges never pick up the zero RGB
        pm = np.asarray(im).astype(float); pm[..., :3] *= pm[..., 3:] / 255
        im = Image.fromarray(pm.astype(np.uint8), "RGBA")
        nw, nh = max(1, round(im.width * scale)), max(1, round(im.height * scale))
        im = im.resize((nw, nh), Image.LANCZOS)
        r = np.asarray(im).astype(float)
        with np.errstate(divide="ignore", invalid="ignore"):
            r[..., :3] = np.where(r[..., 3:] > 0, r[..., :3] * 255 / np.maximum(r[..., 3:], 1), 0)
        im = Image.fromarray(np.clip(r, 0, 255).astype(np.uint8), "RGBA")
        cx, cy = (i % COLS) * CELL, (i // COLS) * CELL
        atlas.alpha_composite(im, (cx + ANCHOR[0] - nw // 2, cy + ANCHOR[1] - nh))
    atlas.save(args.out, optimize=True)
    print(f"wrote {args.out}  scale={scale:.3f}")


# ----------------------------------------------------------------- check ----
def _halo(rgb, a):
    """Compare each semi-transparent edge pixel with its nearest solid pixel.
    A global rim-vs-inner average confuses natural edge lighting with a matte.
    Compare local chromaticity (RGB proportions) to detect colour casts while
    reporting luminance variation separately for manual visual review."""
    solid = a >= 250
    rim = (a > 20) & (a < 230)
    if rim.sum() < 50 or solid.sum() < 50:
        return {"rim_px": int(rim.sum()), "dL": 0.0, "dR": 0.0, "dG": 0.0, "dB": 0.0}
    _, (iy, ix) = ndimage.distance_transform_edt(~solid, return_indices=True)
    edge_rgb = rgb[rim]
    inner_rgb = rgb[iy[rim], ix[rim]]
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    edge_chroma = edge_rgb / np.maximum(edge_rgb.sum(1, keepdims=True), 1)
    inner_chroma = inner_rgb / np.maximum(inner_rgb.sum(1, keepdims=True), 1)
    hue_shift = (edge_chroma - inner_chroma).mean(0) * 100
    return {"rim_px": int(rim.sum()),
            "dL": float((lum[rim] - lum[iy[rim], ix[rim]]).mean()),
            "dR": float(hue_shift[0]), "dG": float(hue_shift[1]), "dB": float(hue_shift[2])}


def _bg(kind):
    if kind == "grass":
        t = Image.open(os.path.join(ASSETS, "terrain-materials-v2.png")).convert("RGB")
        tile = t.crop((0, 0, t.width // 4, t.height // 2))
        bg = Image.new("RGB", (W, H))
        for y in range(0, H, tile.height):
            for x in range(0, W, tile.width):
                bg.paste(tile, (x, y))
        return bg
    rng = np.random.default_rng(1)
    if kind == "sea":
        base = np.array([38, 92, 120], float)
        n = ndimage.gaussian_filter(rng.normal(0, 1, (H, W)), 6) * 60
        return Image.fromarray(np.clip(base + n[..., None] * [0.4, 0.8, 1.0], 0, 255).astype(np.uint8))
    return Image.new("RGB", (W, H), (22, 25, 30))  # dark UI panel


def check(args):
    os.makedirs(args.outdir, exist_ok=True)
    im = Image.open(args.atlas)
    res = {"file": os.path.basename(args.atlas), "format": im.format, "mode": im.mode,
           "size": list(im.size), "items": []}

    def item(name, ok, detail):
        res["items"].append({"name": name, "pass": bool(ok), "detail": detail})

    item("PNG", im.format == "PNG", im.format)
    item("2048×1024", im.size == (W, H), f"{im.size[0]}×{im.size[1]}")
    item("RGBA", im.mode == "RGBA", im.mode)
    arr = np.asarray(im.convert("RGBA")).astype(float)
    rgb, a = arr[..., :3], arr[..., 3]
    if im.size != (W, H):
        return _write(res, args)
    tr = float((a == 0).mean())
    item("真透明（alpha 最小 0，透明像素 ≥ 40%）", a.min() == 0 and tr >= 0.40, f"透明像素 {tr:.1%}，alpha 范围 {int(a.min())}–{int(a.max())}")
    corners = [a[0, 0], a[0, -1], a[-1, 0], a[-1, -1]]
    item("四角 alpha=0", max(corners) == 0, str([int(c) for c in corners]))
    # fake transparency: checkerboard or flat matte that is fully opaque
    opaque_cells = []
    gut = np.zeros((H, W), bool)
    for c in range(COLS + 1):
        x = c * CELL; gut[:, max(0, x - GUTTER):x + GUTTER] = True
    for r in range(ROWS + 1):
        y = r * CELL; gut[max(0, y - GUTTER):y + GUTTER, :] = True
    item("格间隔 ≥ 8 px 全透明", a[gut].max() == 0, f"间隔区最大 alpha {int(a[gut].max())}")

    cells = []
    for i in range(COLS * ROWS):
        cx, cy = (i % COLS) * CELL, (i // COLS) * CELL
        ca, crgb = a[cy:cy + CELL, cx:cx + CELL], rgb[cy:cy + CELL, cx:cx + CELL]
        c = {"cell": i + 1, "name": NAMES[i]}
        if (ca > 0).sum() == 0:
            c.update(empty=True); cells.append(c); continue
        ys, xs = np.where(ca > 0)
        x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
        lab, n = ndimage.label(ca > 32, structure=np.ones((3, 3)))
        sizes = np.sort(ndimage.sum(ca > 32, lab, range(1, n + 1)))[::-1] if n else np.array([0])
        main_share = float(sizes[0] / max(1, sizes.sum()))
        big = int((sizes >= sizes[0] * 0.15).sum())   # separate large clusters = stacked copies?
        c.update(bbox=[x0, y0, x1, y1], w=x1 - x0, h=y1 - y0,
                 margin_ok=x0 >= MARGIN and y0 >= MARGIN and x1 <= CELL - MARGIN and y1 <= CELL - MARGIN,
                 ground_dx=round((x0 + x1) / 2 - ANCHOR[0], 1), ground_dy=y1 - ANCHOR[1],
                 coverage=round(float((ca > 0).mean()), 3), main_share=round(main_share, 3),
                 big_clusters=big, opaque_full=float((ca == 255).mean()) > 0.95, halo=_halo(crgb, ca),
                 gold_ratio=round(float(_gold_px(crgb, ca)), 4))
        cells.append(c)
    res["cells"] = cells
    filled = [c for c in cells if not c.get("empty")]
    item("8 格都有内容", len(filled) == 8, f"{len(filled)}/8")
    item("非棋盘格/非实底（没有整格不透明）", not any(c["opaque_full"] for c in filled),
         ", ".join(str(c["cell"]) for c in filled if c["opaque_full"]) or "无")
    bad = [c["cell"] for c in filled if not c["margin_ok"]]
    item("每格 8% 留白（41 px）", not bad, f"越界格：{bad or '无'}")
    bad = [c["cell"] for c in filled if abs(c["ground_dx"]) > 12 or abs(c["ground_dy"]) > 12]
    item("接地中心 (256,430) ±12 px", not bad, f"偏差格：{bad or '无'}；" + ", ".join(f"{c['cell']}:{c['ground_dx']:+.0f}/{c['ground_dy']:+d}" for c in filled))
    bad = [c["cell"] for c in filled if c["big_clusters"] > 1 or c["main_share"] < 0.80]
    item("每格一团矿脉（主体占 ≥ 80%，无第二个大团）", not bad, f"可疑格：{bad or '无'}")
    if len(filled) == 8:
        w = [c["w"] for c in filled]
        rich = [w[0], w[4]]
        item("富集格宽约 2.2 村民（≥ 300 px）", min(rich) >= 300, f"金 {rich[0]} px，石 {rich[1]} px")
        cov = [c["coverage"] for c in filled]
        mono = all(cov[k] >= cov[k + 1] * 0.95 for k in (0, 1, 2, 4, 5, 6))
        item("富集→耗尽 体量递减", mono, "覆盖率 " + " / ".join(f"{v:.2f}" for v in cov))
        g = [c["gold_ratio"] for c in filled]
        item("金矿 1–3 格有金色、第 4 格与石矿无金", min(g[:3]) > 0.004 and max(g[3:]) < 0.004,
             "金色像素占比 " + " / ".join(f"{v:.3f}" for v in g))
        bad = [c["cell"] for c in filled if c["halo"]["rim_px"] >= 50 and
               max(abs(c["halo"]["dR"]), abs(c["halo"]["dG"]), abs(c["halo"]["dB"])) > 12]
        item("边缘无红/黄/品红色偏（局部 RGB 色相比例差 ≤12 个百分点）", not bad,
             f"可疑格：{bad or '无'}；色相 ΔR/ΔG/ΔB " + " / ".join(
                 f"{c['halo']['dR']:+.1f}/{c['halo']['dG']:+.1f}/{c['halo']['dB']:+.1f}"
                 for c in filled) + "；亮度差 ΔL（仅供目视核对） " +
             " / ".join(f"{c['halo']['dL']:+.0f}" for c in filled))
    _previews(im.convert("RGBA"), args.outdir)
    return _write(res, args)


def _gold_px(rgb, a):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    m = (a > 200) & (r > 150) & (g > 110) & (b < g * 0.7) & (r - b > 80)
    return m.sum() / max(1, (a > 200).sum())


def _previews(atlas, outdir):
    tiles = []
    for kind in ("grass", "sea", "dark"):
        bg = _bg(kind).convert("RGBA"); bg.alpha_composite(atlas)
        bg = bg.convert("RGB"); bg.save(os.path.join(outdir, f"preview-{kind}.jpg"), quality=86)
        tiles.append(bg.resize((1024, 512), Image.LANCZOS))
    # 3x zoom on cell-1 and cell-5 edges, all three backgrounds
    zoom = []
    for kind in ("grass", "sea", "dark"):
        bg = _bg(kind).convert("RGBA"); bg.alpha_composite(atlas)
        for i in (0, 4):
            cx, cy = (i % COLS) * CELL, (i // COLS) * CELL
            a = np.asarray(atlas)[cy:cy + CELL, cx:cx + CELL, 3]
            ys, xs = np.where(a > 0)
            if len(xs) == 0:
                continue
            x, y = cx + int(xs.min()), cy + int(np.median(ys))
            zoom.append(bg.crop((x - 20, y - 60, x + 100, y + 60)).resize((360, 360), Image.NEAREST).convert("RGB"))
    sheet = Image.new("RGB", (1024, 512 * 3 + (360 if zoom else 0)), (40, 40, 40))
    for k, t in enumerate(tiles):
        sheet.paste(t, (0, k * 512))
    for k, z in enumerate(zoom[:6]):
        sheet.paste(z.resize((170, 170)), (k * 171, 512 * 3 + 10))
    sheet.save(os.path.join(outdir, "preview-sheet.jpg"), quality=86)


def _write(res, args):
    ok = all(i["pass"] for i in res["items"])
    res["verdict"] = "PASS" if ok else "FAIL (keep as draft)"
    with open(os.path.join(args.outdir, "check.json"), "w") as f:
        json.dump(res, f, ensure_ascii=False, indent=1, default=float)
    lines = [f"# N1 atlas check — {res['file']}", "", f"**结论：{res['verdict']}**", "",
             "| 检查项 | 结果 | 数据 |", "|---|---|---|"]
    lines += [f"| {i['name']} | {'通过' if i['pass'] else '**未通过**'} | {i['detail']} |" for i in res["items"]]
    lines += ["", "预览：preview-grass.jpg / preview-sea.jpg / preview-dark.jpg / preview-sheet.jpg（底部为边缘 3× 放大）。",
              "自动检查不能代替目视：仍需在真实对局里按生产绘制顺序截图，并写明审查人（AGENTS.md alpha gate）。"]
    with open(os.path.join(args.outdir, "check.md"), "w") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines))
    return 0 if ok else 1


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    sp = p.add_subparsers(dest="cmd", required=True)
    b = sp.add_parser("build"); b.add_argument("inputs", nargs=8); b.add_argument("--out", required=True)
    b.add_argument("--key", default="auto"); b.add_argument("--fill", type=float, default=0.95)
    c = sp.add_parser("check"); c.add_argument("atlas"); c.add_argument("--outdir", required=True)
    a = p.parse_args()
    sys.exit(build(a) or 0 if a.cmd == "build" else check(a))
