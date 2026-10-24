// Native 3D view of the Ecosystem module: its fertility grid raised into a
// terrain (fertile ground stands higher, barren ground lies low), painted with
// the plant cover, and its animals drawn as instanced bodies with a head that
// points along their heading. Render-only: it reads the module's public state
// (grid, animals) and changes it only through the simulation contract.
import { Site } from '../site.js';
import { v3, mat4, IDENTITY_BASIS } from '../engine/math3d.js';
import { rayPlane, rayAt } from '../engine/ray.js';
import { hexColor } from '../engine/colors.js';
import { groundColor, animalColor } from '../../sims/ecosystem.js';

const RISE = 0.04; // height of fully fertile ground (fertility 2), as a fraction of the width
const RELIEF = 0.008; // gentle rolling relief everywhere, as a fraction of the width
const SOIL = [0.24, 0.18, 0.12, 1];

/** Rolling relief in 0…1 at module point (x, y) of a W-wide world, so a uniform field still reads as land. */
export function relief(x, y, W) {
  const a = (x / W) * 2 * Math.PI, b = (y / W) * 2 * Math.PI;
  return 0.5 + 0.25 * Math.sin(3 * a + 1.1 * Math.sin(2 * b)) + 0.15 * Math.sin(5 * b - 2 * a + 0.7) + 0.1 * Math.sin(9 * a + 7 * b);
}

/**
 * Heights (place units) at the (GX + 1) × (GY + 1) grid corners: each corner's
 * fertility is the mean of the cells around it, smoothed once more, so the
 * terrain follows the fertility field without stair steps.
 */
export function terrainHeights(sim, width) {
  const { GX, GY, cell, W } = sim, f = sim.fertile, nx = GX + 1, ny = GY + 1;
  const corner = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let s = 0, n = 0;
    for (let dj = -1; dj <= 0; dj++) for (let di = -1; di <= 0; di++) {
      const ci = i + di, cj = j + dj;
      if (ci < 0 || cj < 0 || ci >= GX || cj >= GY) continue;
      s += Math.min(2, f[cj * GX + ci]);
      n++;
    }
    corner[j * nx + i] = s / n;
  }
  const h = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let s = 0, n = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ci = i + di, cj = j + dj;
      if (ci < 0 || cj < 0 || ci >= nx || cj >= ny) continue;
      s += corner[cj * nx + ci];
      n++;
    }
    h[j * nx + i] = width * ((RISE * s) / n / 2 + RELIEF * relief(i * cell, j * cell, W));
  }
  return h;
}

/** A change stamp for the fertility field: the terrain is rebuilt only when it changes. */
export function fertilityStamp(f) {
  let a = 0, b = 0;
  for (let k = 0; k < f.length; k++) {
    a += f[k];
    b += f[k] * ((k % 97) + 1);
  }
  return `${f.length}:${a}:${b}`;
}

export class TerrainSite extends Site {
  constructor(spec, place, Sim) {
    super(spec, place, Sim);
    this.width = spec.width;
    this.depth = spec.width;
    this.texKey = `site:${this.id}`;
    this.meshKey = `terrain:${this.id}`;
    this.skirtKey = `skirt:${this.id}`;
    this.version = 0;
    this.stamp = null;
    this.heights = null;
    this.bodies = new Float32Array(0);
    this.tex = null;
  }

  setup() {
    const b = this.sim.bounds();
    this.depth = (this.width * b.h) / b.w;
    this.stamp = null;
  }

  get radius() {
    return Math.hypot(this.width, this.depth) / 2;
  }

  /** Place units per module unit. */
  get scale() {
    return this.width / this.sim.W;
  }

  get mpp() {
    return 1 / this.scale;
  }

  /** Corner heights, rebuilt when the fertility field changed (e.g. after the Feed tool). */
  terrain() {
    const stamp = fertilityStamp(this.sim.fertile);
    if (stamp !== this.stamp || !this.heights) {
      this.heights = terrainHeights(this.sim, this.width);
      this.stamp = stamp;
      this.hmax = Math.max(...this.heights);
      this.terrainVersion = (this.terrainVersion ?? 0) + 1;
    }
    return this.heights;
  }

  /** Terrain height (place units, above the site's centre) at module point (mx, my). */
  heightAt(mx, my) {
    this.terrain();
    return this.sample(mx, my);
  }

  /** Height from the current corner heights, bilinear between corners (call terrain() first). */
  sample(mx, my) {
    const h = this.heights, { GX, GY, cell } = this.sim, nx = GX + 1;
    const u = Math.max(0, Math.min(GX, mx / cell)), v = Math.max(0, Math.min(GY, my / cell));
    const i = Math.min(GX - 1, Math.floor(u)), j = Math.min(GY - 1, Math.floor(v));
    const fx = u - i, fy = v - j, k = j * nx + i;
    return (h[k] * (1 - fx) + h[k + 1] * fx) * (1 - fy) + (h[k + nx] * (1 - fx) + h[k + nx + 1] * fx) * fy;
  }

  /** Upward surface normal at module point (mx, my). */
  normalAt(mx, my) {
    this.terrain();
    return this.slopeNormal(mx, my);
  }

  slopeNormal(mx, my) {
    const e = this.sim.cell * 0.5, s = this.scale;
    const dx = (this.sample(mx + e, my) - this.sample(mx - e, my)) / (2 * e * s);
    const dz = (this.sample(mx, my + e) - this.sample(mx, my - e)) / (2 * e * s);
    return v3.norm([-dx, 1, -dz]);
  }

  toPlace(mx, my) {
    this.terrain();
    return this.placeAt(mx, my);
  }

  placeAt(mx, my) {
    const c = this.center, s = this.scale, b = this.sim.bounds();
    return [c[0] + (mx - b.w / 2) * s, c[1] + this.sample(mx, my), c[2] + (my - b.h / 2) * s];
  }

  /** Place point → module point (ignoring height). */
  toModule(p) {
    const c = this.center, s = this.scale, b = this.sim.bounds();
    return [(p[0] - c[0]) / s + b.w / 2, (p[2] - c[2]) / s + b.h / 2];
  }

  /**
   * The first point where the ray meets the terrain: march through the
   * terrain's bounding box, then bisect the crossing. A ray that misses the
   * terrain falls back to its mean level, flagged as outside.
   */
  hit(ray) {
    this.terrain();
    const c = this.center, hw = this.width / 2, hd = this.depth / 2;
    const lo = [c[0] - hw, c[1] - 1e-9, c[2] - hd], hi = [c[0] + hw, c[1] + this.hmax + 1e-9, c[2] + hd];
    let t0 = 0, t1 = Infinity;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(ray.d[k]) < 1e-15) {
        if (ray.o[k] < lo[k] || ray.o[k] > hi[k]) { t1 = -1; break; }
        continue;
      }
      let a = (lo[k] - ray.o[k]) / ray.d[k], b = (hi[k] - ray.o[k]) / ray.d[k];
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
    }
    const above = (t) => {
      const p = rayAt(ray, t), [mx, my] = this.toModule(p);
      return p[1] - c[1] - this.sample(mx, my);
    };
    if (t1 >= t0 && above(t0) > 0) {
      const steps = 400, dt = (t1 - t0) / steps;
      let prev = t0;
      for (let s = 1; s <= steps; s++) {
        const t = t0 + s * dt;
        if (above(t) > 0) { prev = t; continue; }
        let a = prev, b = t;
        for (let it = 0; it < 80 && b - a > 1e-15 * Math.max(1, b); it++) {
          const m = (a + b) / 2;
          if (above(m) > 0) a = m; else b = m;
        }
        return this.result(ray, (a + b) / 2, true);
      }
    }
    const t = rayPlane(ray, v3.add(c, [0, this.hmax / 2, 0]), [0, 1, 0]);
    return t === null ? null : this.result(ray, t, false);
  }

  result(ray, t, onTerrain) {
    const [x, y] = this.toModule(rayAt(ray, t)), b = this.sim.bounds();
    const inside = onTerrain && x >= 0 && x <= b.w && y >= 0 && y <= b.h;
    return { x, y, t, inside, mpp: this.mpp, normal: this.normalAt(x, y) };
  }

  /** Terrain mesh (positions relative to the site's centre) with plant-cover texture coordinates. */
  terrainMesh() {
    const h = this.terrain(), { GX, GY, cell } = this.sim, nx = GX + 1, ny = GY + 1, s = this.scale;
    const positions = new Float32Array(nx * ny * 3), normals = new Float32Array(nx * ny * 3), uvs = new Float32Array(nx * ny * 2);
    const indices = new Uint16Array(GX * GY * 6);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, mx = i * cell, my = j * cell;
      positions.set([(mx - this.sim.W / 2) * s, h[k], (my - this.sim.H / 2) * s], k * 3);
      normals.set(this.slopeNormal(mx, my), k * 3);
      uvs.set([i / GX, j / GY], k * 2);
    }
    let o = 0;
    for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
      const a = j * nx + i, b = a + nx;
      indices.set([a, b, a + 1, a + 1, b, b + 1], o);
      o += 6;
    }
    return { positions, normals, uvs, indices };
  }

  /** Soil walls down to the ground around the terrain's edge, so it reads as a raised block of land. */
  skirtMesh() {
    const { GX, GY, cell, W, H } = this.sim, s = this.scale;
    const edge = [];
    for (let i = 0; i <= GX; i++) edge.push([i * cell, 0, [0, 0, -1]]);
    for (let j = 1; j <= GY; j++) edge.push([W, j * cell, [1, 0, 0]]);
    for (let i = GX - 1; i >= 0; i--) edge.push([i * cell, H, [0, 0, 1]]);
    for (let j = GY - 1; j >= 0; j--) edge.push([0, j * cell, [-1, 0, 0]]);
    const n = edge.length, positions = new Float32Array(n * 6), normals = new Float32Array(n * 6), uvs = new Float32Array(n * 4);
    const indices = new Uint16Array((n - 1) * 6);
    edge.forEach(([mx, my, nrm], k) => {
      const x = (mx - W / 2) * s, z = (my - H / 2) * s;
      positions.set([x, this.sample(mx, my), z, x, -this.center[1], z], k * 6);
      normals.set([...nrm, ...nrm], k * 6);
      if (k < n - 1) indices.set([2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 2, 2 * k + 1, 2 * k + 3], k * 6);
    });
    return { positions, normals, uvs, indices };
  }

  /** RGBA plant-cover texture, one texel per grid cell, the same colours as the 2D view. */
  groundTexture() {
    const { grass, fertile } = this.sim, n = grass.length;
    if (!this.tex || this.tex.length !== n * 4) this.tex = new Uint8Array(n * 4);
    for (let k = 0; k < n; k++) {
      const c = groundColor(grass[k], fertile[k]);
      for (let q = 0; q < 3; q++) this.tex[k * 4 + q] = Math.max(0, Math.min(255, c[q]));
      this.tex[k * 4 + 3] = 255;
    }
    return this.tex;
  }

  /**
   * Instance data for the animals (8 floats per sphere, camera-relative): a body
   * resting on the ground and a smaller head ahead of it along the heading.
   */
  animalSpheres(eye, minRadius = 0) {
    this.terrain();
    const sim = this.sim, s = this.scale, mode = sim.params.colorBy;
    if (this.bodies.length < sim.animals.length * 16) this.bodies = new Float32Array(sim.animals.length * 16 + 64);
    const out = this.bodies;
    let n = 0;
    for (const a of sim.animals) {
      if (!a.alive) continue;
      const r = Math.max((2 + 1.6 * a.genes.size) * s * 0.6, minRadius);
      const p = this.placeAt(a.x, a.y), cx = Math.cos(a.heading), cz = Math.sin(a.heading);
      const [cr, cg, cb] = hexColor(animalColor(a, mode));
      out.set([p[0] - eye[0], p[1] + r * 0.85 - eye[1], p[2] - eye[2], r, cr, cg, cb, 0], n * 8);
      n++;
      const shade = a.species === 'carnivore' ? 0.75 : 0.9;
      out.set([p[0] + cx * r * 1.05 - eye[0], p[1] + r * 1.3 - eye[1], p[2] + cz * r * 1.05 - eye[2], r * 0.55, cr * shade, cg * shade, cb * shade, 0], n * 8);
      n++;
    }
    return n;
  }

  render(fc) {
    const r = fc.renderer, sim = this.sim, { GX, GY } = sim;
    const due = this.tier === 'active' || !this.drawn || fc.time - (this.lastDraw ?? 0) >= 1 / fc.ambientHz;
    if (due || !r.hasTexture(this.texKey)) {
      r.texture(this.texKey, this.groundTexture(), ++this.version, GX, GY);
      this.drawn = true;
      this.lastDraw = fc.time;
    }
    this.terrain();
    r.dynamicMesh(this.meshKey, () => this.terrainMesh(), this.terrainVersion);
    r.dynamicMesh(this.skirtKey, () => this.skirtMesh(), this.terrainVersion);
    const model = mat4.model(IDENTITY_BASIS, v3.sub(this.center, fc.eye), 1);
    r.mesh(this.meshKey, model, { texture: this.texKey, lit: 1, night: 0.45 });
    r.mesh(this.skirtKey, model, { color: SOIL, lit: 0.8, night: 0.45 });
    const px = fc.pixelSize(v3.dist(this.center, fc.eye));
    const n = this.animalSpheres(fc.eye, px * 0.9);
    r.spheres(this.bodies, n, true);
  }
}
