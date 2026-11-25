/* P5 spatial service (docs/p5/progress.md). One place for the neighbourhood queries of the simulation:

   1. landClear(world)   - a 32 px "certainly clear terrain" mask for land and air walkers. A cell is marked 1 only when no
      terrain feature that can block a land walker (map edge, lakes, straits channel, river band, coast, cliffs) can reach
      any point of the cell, so blockedTerrain(x, y, landWalker) is false for every point in it and the exact (costly:
      atan2/cos/sin, ellipse and circle tests) evaluation can be skipped. Cells that a feature may touch stay 0 and keep the
      exact test, so answers are identical, not approximated. Bounds use Lipschitz constants of the same formulas as
      public/worlds.js plus a 4 px pad; check-spatial.cjs samples millions of points against the exact test.
   2. BoxIndex           - a uniform grid of static boxes (buildings, wall rectangles) for "does anything here block x,y"
      queries; built from a list snapshot, queried with a point. Order of the returned items is the list order.
   3. PointGrid          - a per-step grid of moving points (units) in compressed rows (counting sort: cell start offsets +
      item indices), so the items of a cell are in ascending list order and a query over several cells can be merged
      with one numeric sort. Typed arrays, reused every step: no Map, no per-cell arrays.

   Pure helpers: no DOM, no clock, no randomness. The simulation scripts read it as window.KingdomSpatial (browser) or
   require('./kingdom-spatial.js') (Node / worker bundle). */

export const TERRAIN_CELL = 32;
const PAD = 4;
const clearCache = new WeakMap();

/* Same fields that can change a world's terrain after generation (siege/wildlands push lakes and cliffs while building it). */
function sameTerrain(c, w) {
  return c.width === w.width && c.height === w.height && c.lakes === w.lakes && c.nl === (w.lakes ? w.lakes.length : 0) &&
    c.cliffs === w.cliffs && c.nc === (w.cliffs ? w.cliffs.length : 0) && c.style === w.style && c.layout === w.layout && c.geography === w.geography;
}

export function landClear(w) {
  let c = clearCache.get(w);
  if (c && sameTerrain(c, w)) return c;
  c = buildLandClear(w);
  clearCache.set(w, c);
  return c;
}

function buildLandClear(w) {
  const C = TERRAIN_CELL, W = w.width, H = w.height, cols = Math.ceil(W / C), rows = Math.ceil(H / C), mask = new Uint8Array(cols * rows);
  const c = { width: W, height: H, lakes: w.lakes, nl: w.lakes ? w.lakes.length : 0, cliffs: w.cliffs, nc: w.cliffs ? w.cliffs.length : 0,
    style: w.style, layout: w.layout, geography: w.geography, cols, rows, inv: 1 / C, mask, clear: 0 };
  /* Older saved worlds (geography < 2) use other river/delta formulas: no fast path, every query stays exact. */
  if (!(w.geography >= 2) || !(W > 0) || !(H > 0)) return c;
  /* Map edge: playable when (dx^2 + dy^2) < edge^2 with edge = 1 + .035 cos 5a + .025 cos 9a >= .94 (worlds.js edgePlayable).
     The normalised radius is convex in x, y, so the largest value over a cell is at a corner; cells whose corners are all
     inside .93 are inside the edge everywhere. */
  const mx = W / 2, my = H / 2, sx = W * .48, sy = H * .48, CORE = .93 * .93;
  for (let r = 0; r < rows; r++) {
    const a0 = (r * C - my) / sy, a1 = ((r + 1) * C - my) / sy, ay = Math.max(a0 * a0, a1 * a1);
    for (let q = 0; q < cols; q++) {
      const b0 = (q * C - mx) / sx, b1 = ((q + 1) * C - mx) / sx;
      if (Math.max(b0 * b0, b1 * b1) + ay < CORE) mask[r * cols + q] = 1;
    }
  }
  const dirty = (x0, y0, x1, y1) => {
    const q0 = Math.max(0, Math.floor((x0 - PAD) / C)), q1 = Math.min(cols - 1, Math.floor((x1 + PAD) / C));
    const r0 = Math.max(0, Math.floor((y0 - PAD) / C)), r1 = Math.min(rows - 1, Math.floor((y1 + PAD) / C));
    for (let r = r0; r <= r1; r++) for (let q = q0; q <= q1; q++) mask[r * cols + q] = 0;
  };
  const ellipse = (e) => dirty(e.x - Math.abs(e.rx), e.y - Math.abs(e.ry), e.x + Math.abs(e.rx), e.y + Math.abs(e.ry));
  for (const l of w.lakes || []) ellipse(l);
  for (const k of w.cliffs || []) ellipse(k);
  /* straits channel: ellipse centred at (W/2, H(.69 + .015 cos(..))) with rx = .36 W, ry = .135 H */
  if (w.layout === 'straits') dirty(W * .5 - W * .36, H * (.69 - .015) - H * .135, W * .5 + W * .36, H * (.69 + .015) + H * .135);
  /* river band |x - riverCenter(y)| < riverWidth, riverCenter = W/2 + sin(4 pi y / H) * .045 W: slope <= .045 W * 4 pi / H */
  if (w.style === 'coast' || w.style === 'river') {
    const A = W * .045, rw = Math.max(150, W * .021), L = A * Math.PI * 4 / H;
    for (let r = 0; r < rows; r++) {
      const y0 = r * C, rc = W / 2 + Math.sin(y0 / H * Math.PI * 4) * A, reach = rw + L * C + 1;
      dirty(rc - reach, y0, rc + reach, y0 + C - 1e-6);
    }
  }
  /* coast: water below coast(x) = H(.78 + .035 cos((x/W - .5) 2 pi) + .02 cos((x/W - .5) 6 pi)); slope <= H(.035 * 2 pi + .02 * 6 pi) / W */
  if (w.style === 'coast') {
    const L = H * (.035 * Math.PI * 2 + .02 * Math.PI * 6) / W;
    for (let q = 0; q < cols; q++) {
      const x0 = q * C, cy = H * (.78 + .035 * Math.cos((x0 / W - .5) * Math.PI * 2) + .02 * Math.cos((x0 / W - .5) * Math.PI * 6));
      dirty(x0, cy - L * C - 1, x0 + C - 1e-6, H + C);
    }
  }
  let n = 0; for (let i = 0; i < mask.length; i++) n += mask[i];
  c.clear = n / mask.length;
  return c;
}

/* 1 when the cell of (x, y) is certainly clear terrain for a land/air walker, else 0 (unknown: run the exact test). */
export function clearAt(c, x, y) {
  if (!(x >= 0 && y >= 0)) return 0;
  const q = (x * c.inv) | 0, r = (y * c.inv) | 0;
  if (q >= c.cols || r >= c.rows) return 0;
  return c.mask[r * c.cols + q];
}

/* Uniform grid of boxes. build(n, box) calls box(i, out) for i = 0..n-1, which fills out = [x0, y0, x1, y1] or returns false to
   skip the item. Points and boxes outside the grid are clamped to its border cells (sound: a box that reaches outside also
   occupies the border cell a clamped point reads). */
export class BoxIndex {
  constructor(width, height, cell) {
    this.cell = cell; this.inv = 1 / cell; this.cols = Math.max(1, Math.ceil(width / cell)); this.rows = Math.max(1, Math.ceil(height / cell));
    this.start = new Int32Array(this.cols * this.rows + 1); this.items = new Int32Array(64); this.n = 0;
    this._box = new Float64Array(4); this._lo = new Int32Array(0); this._hi = new Int32Array(0);
  }
  col(x) { const q = Math.floor(x * this.inv); return q < 0 ? 0 : q >= this.cols ? this.cols - 1 : q; }
  row(y) { const r = Math.floor(y * this.inv); return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r; }
  build(n, box) {
    const cells = this.cols * this.rows, start = this.start, b = this._box;
    if (this._lo.length < n * 4) { this._lo = new Int32Array(n * 4 + 64); }
    const lo = this._lo; start.fill(0); let total = 0;
    for (let i = 0; i < n; i++) {
      if (box(i, b) === false || !(b[0] <= b[2]) || !(b[1] <= b[3])) { lo[i * 4] = -1; continue; }
      const q0 = this.col(b[0]), q1 = this.col(b[2]), r0 = this.row(b[1]), r1 = this.row(b[3]);
      lo[i * 4] = q0; lo[i * 4 + 1] = q1; lo[i * 4 + 2] = r0; lo[i * 4 + 3] = r1;
      for (let r = r0; r <= r1; r++) for (let q = q0; q <= q1; q++) { start[r * this.cols + q + 1]++; total++; }
    }
    for (let k = 0; k < cells; k++) start[k + 1] += start[k];
    if (this.items.length < total) this.items = new Int32Array(total + 64);
    const fill = this._hi.length >= cells ? this._hi : (this._hi = new Int32Array(cells));
    fill.set(start.subarray(0, cells));
    for (let i = 0; i < n; i++) {
      if (lo[i * 4] < 0) continue;
      const q0 = lo[i * 4], q1 = lo[i * 4 + 1], r0 = lo[i * 4 + 2], r1 = lo[i * 4 + 3];
      for (let r = r0; r <= r1; r++) for (let q = q0; q <= q1; q++) this.items[fill[r * this.cols + q]++] = i;
    }
    this.n = n;
    return this;
  }
  /* items of the cell containing (x, y): indices this.items[a .. b) */
  cellOf(x, y) { return this.row(y) * this.cols + this.col(x); }
}

/* Per-step grid of points (indices into a list), compressed rows. Items of one cell are in ascending index order. */
export class PointGrid {
  constructor(width, height, cell) {
    this.cell = cell; this.inv = 1 / cell; this.cols = Math.max(1, Math.ceil(width / cell)); this.rows = Math.max(1, Math.ceil(height / cell));
    this.start = new Int32Array(this.cols * this.rows + 1); this.fill = new Int32Array(this.cols * this.rows);
    this.items = new Int32Array(256); this.cellOfItem = new Int32Array(256); this.n = 0; this.out = new Int32Array(256);
  }
  col(x) { const q = Math.floor(x * this.inv); return q < 0 ? 0 : q >= this.cols ? this.cols - 1 : q; }
  row(y) { const r = Math.floor(y * this.inv); return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r; }
  /* xs/ys: positions, keep(i) false skips item i. */
  build(n, xs, ys, keep) {
    const cells = this.cols * this.rows, start = this.start;
    if (this.cellOfItem.length < n) { this.cellOfItem = new Int32Array(n + 256); }
    const of = this.cellOfItem; start.fill(0); let total = 0;
    for (let i = 0; i < n; i++) {
      if (keep && !keep(i)) { of[i] = -1; continue; }
      const k = this.row(ys[i]) * this.cols + this.col(xs[i]); of[i] = k; start[k + 1]++; total++;
    }
    for (let k = 0; k < cells; k++) start[k + 1] += start[k];
    if (this.items.length < total) this.items = new Int32Array(total + 256);
    this.fill.set(start.subarray(0, cells));
    for (let i = 0; i < n; i++) { const k = of[i]; if (k >= 0) this.items[this.fill[k]++] = i; }
    this.n = n; this.total = total;
    return this;
  }
  /* Same as query, by cell coordinates (clamped to the grid). */
  queryCells(q0, r0, q1, r1, after = -1) {
    if (!(q0 <= q1) || !(r0 <= r1)) return 0;
    q0 = q0 < 0 ? 0 : q0 >= this.cols ? this.cols - 1 : q0; q1 = q1 < 0 ? 0 : q1 >= this.cols ? this.cols - 1 : q1;
    r0 = r0 < 0 ? 0 : r0 >= this.rows ? this.rows - 1 : r0; r1 = r1 < 0 ? 0 : r1 >= this.rows ? this.rows - 1 : r1;
    const start = this.start, items = this.items; let m = 0;
    for (let r = r0; r <= r1; r++) {
      const base = r * this.cols, a = start[base + q0], b = start[base + q1 + 1];
      if (b - a + m > this.out.length) { const o = new Int32Array((b - a + m) * 2 + 256); o.set(this.out.subarray(0, m)); this.out = o; }
      for (let k = a; k < b; k++) { const j = items[k]; if (j > after) this.out[m++] = j; }
    }
    if (r1 > r0 || q1 > q0) this.out.subarray(0, m).sort();
    return m;
  }
  /* Indices of the items in cells overlapping [x0, x1] x [y0, y1] with index > after, ascending. Returns the count; the
     indices are in this.out[0 .. count). */
  query(x0, y0, x1, y1, after = -1) {
    const q0 = this.col(x0), q1 = this.col(x1), r0 = this.row(y0), r1 = this.row(y1), start = this.start, items = this.items;
    let m = 0;
    for (let r = r0; r <= r1; r++) {
      const base = r * this.cols;
      const a = start[base + q0], b = start[base + q1 + 1];
      if (b - a + m > this.out.length) { const o = new Int32Array((b - a + m) * 2 + 256); o.set(this.out.subarray(0, m)); this.out = o; }
      for (let k = a; k < b; k++) { const j = items[k]; if (j > after) this.out[m++] = j; }
    }
    if (r1 > r0 || q1 > q0) this.out.subarray(0, m).sort();
    return m;
  }
}
