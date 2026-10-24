/**
 * Barnes–Hut octree for O(N log N) gravitational accelerations in 3D.
 *
 * The 3D counterpart of the quadtree in barnes-hut.js: bodies are any objects
 * with x, y, z and m (> 0), and a cube of size s at distance d is treated as a
 * single point mass at its centre of mass when s / d < theta. theta = 0 reduces
 * to the exact direct sum. Flat typed arrays, so a rebuild allocates nothing
 * after warm-up.
 */
export class Octree {
  constructor() {
    this.cap = 0;
    this.grow(1024);
  }

  grow(cap) {
    const keys = ['cx', 'cy', 'cz', 'half', 'm', 'mx', 'my', 'mz', 'body', 'child'];
    const old = this.cap ? Object.fromEntries(keys.map((k) => [k, this[k]])) : null;
    this.cap = cap;
    for (const k of ['cx', 'cy', 'cz', 'half', 'm', 'mx', 'my', 'mz']) this[k] = new Float64Array(cap);
    this.child = new Int32Array(cap); // first of 8 consecutive children, or -1 for a leaf
    this.body = new Int32Array(cap); // body index for an occupied leaf, -1 if empty
    if (old) for (const k of keys) this[k].set(old[k]);
  }

  node(cx, cy, cz, half) {
    if (this.count + 8 > this.cap) this.grow(this.cap * 2);
    const i = this.count++;
    this.cx[i] = cx; this.cy[i] = cy; this.cz[i] = cz; this.half[i] = half;
    this.m[i] = 0; this.mx[i] = 0; this.my[i] = 0; this.mz[i] = 0;
    this.child[i] = -1; this.body[i] = -1;
    return i;
  }

  /** Build the tree over `bodies` (all with m > 0). */
  build(bodies) {
    this.bodies = bodies;
    this.count = 0;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const b of bodies) {
      if (b.x < x0) x0 = b.x; if (b.x > x1) x1 = b.x;
      if (b.y < y0) y0 = b.y; if (b.y > y1) y1 = b.y;
      if (b.z < z0) z0 = b.z; if (b.z > z1) z1 = b.z;
    }
    const half = Math.max(x1 - x0, y1 - y0, z1 - z0, 1e-12) / 2 * 1.0001;
    const root = this.node((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, half);
    for (let i = 0; i < bodies.length; i++) this.insert(root, i, 0);
    for (let i = 0; i < this.count; i++) {
      const m = this.m[i];
      if (m > 0) { this.mx[i] /= m; this.my[i] /= m; this.mz[i] /= m; }
    }
    return this;
  }

  addMass(n, b) {
    this.m[n] += b.m; this.mx[n] += b.m * b.x; this.my[n] += b.m * b.y; this.mz[n] += b.m * b.z;
  }

  insert(n, i, depth) {
    const b = this.bodies[i];
    for (;;) {
      this.addMass(n, b);
      if (this.child[n] < 0) {
        const j = this.body[n];
        if (j < 0) { this.body[n] = i; return; }
        // Coincident bodies: the leaf's mass and centre of mass stand for both.
        if (depth > 48) return;
        this.split(n);
        const o = this.bodies[j];
        const c = this.child[n] + this.octant(n, o.x, o.y, o.z);
        this.addMass(c, o);
        this.body[c] = j;
        this.body[n] = -1;
      }
      n = this.child[n] + this.octant(n, b.x, b.y, b.z);
      depth++;
    }
  }

  split(n) {
    const h = this.half[n] / 2, x = this.cx[n], y = this.cy[n], z = this.cz[n];
    let first = -1;
    for (let o = 0; o < 8; o++) {
      const i = this.node(x + (o & 1 ? h : -h), y + (o & 2 ? h : -h), z + (o & 4 ? h : -h), h);
      if (o === 0) first = i;
    }
    this.child[n] = first;
  }

  octant(n, x, y, z) {
    return (x >= this.cx[n] ? 1 : 0) + (y >= this.cy[n] ? 2 : 0) + (z >= this.cz[n] ? 4 : 0);
  }

  /**
   * Acceleration at (x, y, z) from the tree, skipping body `self` (an index into
   * the bodies passed to build, or -1). Writes into out = [ax, ay, az].
   * A cell is opened if it contains the point or if its size / distance ≥ theta.
   */
  accel(x, y, z, self, G, eps2, theta, out) {
    const { m, mx, my, mz, cx, cy, cz, half, child, body } = this;
    const th2 = theta * theta;
    let stack = this.stack ?? (this.stack = new Int32Array(512));
    let sp = 0, ax = 0, ay = 0, az = 0;
    stack[sp++] = 0;
    while (sp) {
      const n = stack[--sp];
      const mn = m[n];
      if (mn === 0) continue;
      const c = child[n];
      if (c < 0 && body[n] === self) continue;
      const dx = mx[n] - x, dy = my[n] - y, dz = mz[n] - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const h = half[n];
      const far = c < 0 || (4 * h * h < th2 * d2 && (Math.abs(x - cx[n]) > h || Math.abs(y - cy[n]) > h || Math.abs(z - cz[n]) > h));
      if (far) {
        const r2 = d2 + eps2;
        if (r2 === 0) continue;
        const k = (G * mn) / (r2 * Math.sqrt(r2));
        ax += dx * k; ay += dy * k; az += dz * k;
      } else {
        if (sp + 8 > stack.length) {
          const bigger = new Int32Array(stack.length * 2);
          bigger.set(stack);
          stack = this.stack = bigger;
        }
        for (let o = 0; o < 8; o++) stack[sp++] = c + o;
      }
    }
    out[0] = ax; out[1] = ay; out[2] = az;
    return out;
  }
}
