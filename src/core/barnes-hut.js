/**
 * Barnes–Hut quadtree for O(N log N) gravitational accelerations.
 *
 * Bodies are any objects with x, y and m (> 0). The tree is rebuilt on every
 * call; a cell of size s at distance d is treated as a single point mass at its
 * centre of mass when s / d < theta. theta = 0 reduces to the exact direct sum.
 * Stored as flat typed arrays so a rebuild allocates nothing after warm-up.
 */
export class BarnesHut {
  constructor() {
    this.cap = 0;
    this.grow(1024);
  }

  grow(cap) {
    const old = this.cap ? { cx: this.cx, cy: this.cy, half: this.half, m: this.m, mx: this.mx, my: this.my, child: this.child, body: this.body } : null;
    this.cap = cap;
    this.cx = new Float64Array(cap); this.cy = new Float64Array(cap); this.half = new Float64Array(cap);
    this.m = new Float64Array(cap); this.mx = new Float64Array(cap); this.my = new Float64Array(cap);
    this.child = new Int32Array(cap * 4); // first of 4 consecutive children, or -1 for a leaf
    this.body = new Int32Array(cap); // body index for an occupied leaf, -1 if empty
    if (old) {
      for (const k of ['cx', 'cy', 'half', 'm', 'mx', 'my', 'body']) this[k].set(old[k]);
      this.child.set(old.child);
    }
  }

  node(cx, cy, half) {
    if (this.count + 4 > this.cap) this.grow(this.cap * 2);
    const i = this.count++;
    this.cx[i] = cx; this.cy[i] = cy; this.half[i] = half;
    this.m[i] = 0; this.mx[i] = 0; this.my[i] = 0;
    this.child[i] = -1; this.body[i] = -1;
    return i;
  }

  /** Build the tree over `bodies` (all with m > 0). */
  build(bodies) {
    this.bodies = bodies;
    this.count = 0;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of bodies) {
      if (b.x < x0) x0 = b.x; if (b.x > x1) x1 = b.x;
      if (b.y < y0) y0 = b.y; if (b.y > y1) y1 = b.y;
    }
    const half = Math.max(x1 - x0, y1 - y0, 1e-12) / 2 * 1.0001;
    const root = this.node((x0 + x1) / 2, (y0 + y1) / 2, half);
    for (let i = 0; i < bodies.length; i++) this.insert(root, i, 0);
    // Turn mass-weighted sums into centres of mass.
    for (let i = 0; i < this.count; i++) if (this.m[i] > 0) { this.mx[i] /= this.m[i]; this.my[i] /= this.m[i]; }
    return this;
  }

  insert(n, i, depth) {
    const b = this.bodies[i];
    for (;;) {
      this.m[n] += b.m; this.mx[n] += b.m * b.x; this.my[n] += b.m * b.y;
      if (this.child[n] < 0) {
        const j = this.body[n];
        if (j < 0) { this.body[n] = i; return; }
        // Coincident bodies: stop splitting and let the leaf's mass and centre
        // of mass stand for both (they sit at the same point anyway).
        if (depth > 48) return;
        this.split(n);
        const o = this.bodies[j];
        const q = this.quadrant(n, o.x, o.y);
        const c = this.child[n] + q;
        this.m[c] += o.m; this.mx[c] += o.m * o.x; this.my[c] += o.m * o.y; this.body[c] = j;
        this.body[n] = -1;
      }
      n = this.child[n] + this.quadrant(n, b.x, b.y);
      depth++;
    }
  }

  split(n) {
    const h = this.half[n] / 2, x = this.cx[n], y = this.cy[n];
    const first = this.node(x - h, y - h, h);
    this.node(x + h, y - h, h);
    this.node(x - h, y + h, h);
    this.node(x + h, y + h, h);
    this.child[n] = first;
  }

  quadrant(n, x, y) {
    return (x >= this.cx[n] ? 1 : 0) + (y >= this.cy[n] ? 2 : 0);
  }

  /**
   * Acceleration at (x, y) from the tree, skipping body `self` (an index into
   * the bodies passed to build, or -1). Writes into out = [ax, ay].
   * A cell is opened if it contains (x, y) or if its size / distance ≥ theta.
   */
  accel(x, y, self, G, eps2, theta, out) {
    const { m, mx, my, cx, cy, half, child, body } = this;
    const th2 = theta * theta;
    let stack = this.stack ?? (this.stack = new Int32Array(256));
    let sp = 0, ax = 0, ay = 0;
    stack[sp++] = 0;
    while (sp) {
      const n = stack[--sp];
      const mn = m[n];
      if (mn === 0) continue;
      const c = child[n];
      if (c < 0 && body[n] === self) continue;
      const dx = mx[n] - x, dy = my[n] - y;
      const d2 = dx * dx + dy * dy;
      const h = half[n];
      const far = c < 0 || (4 * h * h < th2 * d2 && (Math.abs(x - cx[n]) > h || Math.abs(y - cy[n]) > h));
      if (far) {
        const r2 = d2 + eps2;
        if (r2 === 0) continue;
        const k = (G * mn) / (r2 * Math.sqrt(r2));
        ax += dx * k; ay += dy * k;
      } else {
        if (sp + 4 > stack.length) {
          const bigger = new Int32Array(stack.length * 2);
          bigger.set(stack);
          stack = this.stack = bigger;
        }
        stack[sp++] = c; stack[sp++] = c + 1; stack[sp++] = c + 2; stack[sp++] = c + 3;
      }
    }
    out[0] = ax; out[1] = ay;
    return out;
  }
}
