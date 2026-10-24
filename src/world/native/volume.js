// Native 3D view of the Weather module: its vertical slice extruded in depth
// into a block of air. The ground profile becomes a solid strip of land, cloud
// water fills the block as soft puffs, rain and snow fall as streaks, and the
// place's sky follows the module's time of day and cloud cover. The module's
// own picture (any Display) stays on the back wall. Render-only: it reads the
// module's public state and changes it only through the simulation contract.
import { Site, SurfaceSite } from '../site.js';
import { v3, mat4, IDENTITY_BASIS } from '../engine/math3d.js';
import { clamp } from '../../core/math.js';

const CLOUD_MIN = 1e-4; // cloud water (kg/kg) below which a cell shows no puff
const RAIN_MIN = 1e-4; // rain water (kg/kg) below which a cell shows no streak
const PUFFS = 3; // puffs per cloudy cell, spread through the depth
const MAX_STREAKS = 4; // streaks per rainy cell
const LAND = [0.24, 0.42, 0.21], ROCK = [0.43, 0.39, 0.31], WATER = [0.12, 0.37, 0.66];
const SOIL = [0.3, 0.24, 0.17, 1];
const NIGHT = [0.03, 0.04, 0.09], OVERCAST = [0.52, 0.55, 0.6];
const RAIN = [0.62, 0.74, 1, 0.55], SNOW = [0.95, 0.97, 1, 0.85];

/** A stable pseudo-random number in [0, 1) for integer inputs (no state, so puffs keep their places). */
export function hash3(a, b, c) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul(c + 0x165667b1, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Fraction of columns with any cloud, as the module's own Cloud cover stat counts it. */
export function cloudCover(sim) {
  const { NX, NY, qc } = sim;
  let n = 0;
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NY; j++) if (qc[j * NX + i] > CLOUD_MIN) { n++; break; }
  }
  return n / NX;
}

/** Daylight in 0…1, the same brightness the 2D sky uses (dark at night, full by mid-morning). */
export function daylight(sim) {
  return clamp(sim.sunFactor() * 1.5 + 0.3, 0, 1);
}

/**
 * Sky colour [r, g, b, 1] for the place around the module: the place's own sky
 * by day, deep blue at night, and greyer the more of the sky is cloud.
 */
export function skyTint(sim, base) {
  const d = daylight(sim), cover = cloudCover(sim);
  const out = [0, 0, 0, 1];
  for (let q = 0; q < 3; q++) {
    const clear = NIGHT[q] + (base[q] - NIGHT[q]) * d;
    const grey = NIGHT[q] + (OVERCAST[q] - NIGHT[q]) * d;
    out[q] = clear + (grey - clear) * 0.6 * cover;
  }
  return out;
}

export class VolumeSite extends SurfaceSite {
  constructor(spec, place, Sim) {
    super({ ...spec, surface: 'upright' }, place, Sim);
    this.depth = spec.depth ?? spec.width / 4;
    this.groundKey = `ground:${this.id}`;
    this.wallKey = `wall:${this.id}`;
    this.landKey = `land:${this.id}`;
    this.groundStamp = null;
    this.groundVersion = 0;
    this.puffs = new Float32Array(0);
    this.streaks = [new Float32Array(0), new Float32Array(0)];
  }

  get radius() {
    return Math.hypot(this.width, this.height, this.depth) / 2;
  }

  /** Place units per module unit (km). */
  get scale() {
    return this.width / this.sim.bounds().w;
  }

  /** Module point (km along, km up) at depth z (place units from the middle plane) → place point. */
  placeAt(mx, my, z = 0) {
    const c = this.center, b = this.sim.bounds(), s = this.scale;
    return [c[0] + (mx - b.w / 2) * s, c[1] + (my - b.h / 2) * s, c[2] + z];
  }

  /** The 3D selection ring on the middle plane, where the tools act. */
  drawSelection(fc, entity) {
    Site.prototype.drawSelection.call(this, fc, entity);
  }

  /** A change stamp for the ground profile and surface: the land is rebuilt only when it changes. */
  stamp() {
    const { terrain, water } = this.sim;
    let a = 0;
    for (let i = 0; i < terrain.length; i++) a = (Math.imul(a, 31) + terrain[i] * 2 + water[i]) | 0;
    return a;
  }

  /** Rebuild the land's meshes and colours if the module's ground changed. */
  ground() {
    const st = this.stamp();
    if (st !== this.groundStamp) {
      this.groundStamp = st;
      this.groundVersion++;
    }
    return this.groundVersion;
  }

  /** Colour of ground column i, as the 2D view paints it (water, high rock, low land). */
  columnColor(i) {
    const { terrain, water } = this.sim;
    return water[i] ? WATER : terrain[i] > 8 ? ROCK : LAND;
  }

  /** NX × 1 RGBA texture of the column colours. */
  landTexture() {
    const NX = this.sim.NX, tex = new Uint8Array(NX * 4);
    for (let i = 0; i < NX; i++) {
      const c = this.columnColor(i);
      tex.set([c[0] * 255, c[1] * 255, c[2] * 255, 255], i * 4);
    }
    return tex;
  }

  /**
   * Top of the land (relative to the site's centre): a stepped strip, one step
   * per ground column exactly as the module's solid cells, with risers between
   * columns of different height, across the full depth.
   */
  groundMesh() {
    const { NX, terrain, dx } = this.sim, s = this.scale, cw = (dx / 1000) * s;
    const x0 = -this.width / 2, y0 = -this.height / 2, hd = this.depth / 2;
    const pos = [], nrm = [], uv = [], idx = [];
    const quad = (pts, n, u) => {
      const k = pos.length / 3;
      for (const p of pts) { pos.push(...p); nrm.push(...n); uv.push(u, 0.5); }
      idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
    };
    for (let i = 0; i < NX; i++) {
      const xa = x0 + i * cw, xb = xa + cw, y = y0 + terrain[i] * cw, u = (i + 0.5) / NX;
      quad([[xa, y, -hd], [xa, y, hd], [xb, y, -hd], [xb, y, hd]], [0, 1, 0], u);
      if (i + 1 < NX && terrain[i + 1] !== terrain[i]) {
        const yn = y0 + terrain[i + 1] * cw, up = terrain[i + 1] > terrain[i];
        // The riser belongs to the higher column and faces the lower one.
        quad([[xb, y, -hd], [xb, yn, -hd], [xb, y, hd], [xb, yn, hd]], [up ? -1 : 1, 0, 0], up ? u + 1 / NX : u);
      }
    }
    return { positions: Float32Array.from(pos), normals: Float32Array.from(nrm), uvs: Float32Array.from(uv), indices: Uint16Array.from(idx) };
  }

  /** Front and end walls of the land, down to the bottom of the slice, so the strip reads as solid ground. */
  wallMesh() {
    const { NX, terrain, dx } = this.sim, s = this.scale, cw = (dx / 1000) * s;
    const x0 = -this.width / 2, y0 = -this.height / 2, hd = this.depth / 2;
    const pos = [], nrm = [], idx = [];
    const quad = (pts, n) => {
      const k = pos.length / 3;
      for (const p of pts) { pos.push(...p); nrm.push(...n); }
      idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
    };
    for (let i = 0; i < NX; i++) {
      const xa = x0 + i * cw, xb = xa + cw, y = y0 + terrain[i] * cw;
      quad([[xa, y0, hd], [xb, y0, hd], [xa, y, hd], [xb, y, hd]], [0, 0, 1]);
    }
    const yl = y0 + terrain[0] * cw, yr = y0 + terrain[NX - 1] * cw, xr = x0 + NX * cw;
    quad([[x0, y0, -hd], [x0, y0, hd], [x0, yl, -hd], [x0, yl, hd]], [-1, 0, 0]);
    quad([[xr, y0, hd], [xr, y0, -hd], [xr, yr, hd], [xr, yr, -hd]], [1, 0, 0]);
    return { positions: Float32Array.from(pos), normals: Float32Array.from(nrm), uvs: new Float32Array((pos.length / 3) * 2), indices: Uint16Array.from(idx) };
  }

  /**
   * Cloud puffs (8 floats per point, camera-relative: x, y, z, size px, r, g, b, a):
   * PUFFS per cloudy cell at stable random depths, as thick as the cloud water.
   */
  cloudPoints(eye, pixelSize) {
    const sim = this.sim, { NX, NY, qc, dx } = sim, cw = dx / 1000, s = this.scale;
    const shade = 0.55 + 0.45 * daylight(sim);
    const size = cw * s * 2.2;
    let out = this.puffs, n = 0;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const q = qc[j * NX + i];
      if (q <= CLOUD_MIN || sim.solid(i, j)) continue;
      const a = clamp(q * 1500, 0, 1) * 0.5;
      for (let k = 0; k < PUFFS; k++) {
        if ((n + 1) * 8 > out.length) {
          const grown = new Float32Array(Math.max(1024, out.length * 2));
          grown.set(out);
          out = this.puffs = grown;
        }
        const p = this.placeAt((i + hash3(i, j, k)) * cw, (j + hash3(j, k, i)) * cw, (hash3(k, i, j) - 0.5) * this.depth * 0.9);
        const rel = v3.sub(p, eye);
        out.set([rel[0], rel[1], rel[2], size / pixelSize(Math.max(v3.len(rel), 1e-9)), shade, shade, shade * 1.02, a], n * 8);
        n++;
      }
    }
    return n;
  }

  /**
   * Rain and snow streaks as line pairs (camera-relative), [rain, snow]: more
   * streaks the more rain water a cell holds, falling through the cell over time.
   * Snow is rain in sub-freezing air, as in the 2D view.
   */
  precipLines(eye, time) {
    const sim = this.sim, { NX, NY, qr, dx } = sim, cw = dx / 1000;
    const bufs = [[], []];
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i, q = qr[k];
      if (q <= RAIN_MIN || sim.solid(i, j)) continue;
      const snow = sim.temperature(k, j) < 273.15 ? 1 : 0;
      const count = Math.min(MAX_STREAKS, Math.ceil(q * 3000 * MAX_STREAKS));
      const fall = snow ? 0.35 : 1.4; // cells per second on screen
      const len = (snow ? 0.12 : 0.7) * cw;
      for (let m = 0; m < count; m++) {
        const phase = (hash3(i, j, m + 7) + time * fall) % 1;
        const x = (i + hash3(i, m, j)) * cw, y = (j + 1 - phase) * cw;
        const z = (hash3(m, j, i) - 0.5) * this.depth * 0.9;
        const top = v3.sub(this.placeAt(x, y, z), eye), bottom = v3.sub(this.placeAt(x, y - len, z), eye);
        bufs[snow].push(...top, ...bottom);
      }
    }
    this.streaks = bufs.map((b) => Float32Array.from(b));
    return this.streaks;
  }

  /** The place's sky, tinted by this module's time of day and cloud cover. */
  skyTint(base) {
    return skyTint(this.sim, base);
  }

  /** The twelve edges of the block of air, camera-relative, as line pairs. */
  edges(eye) {
    const hw = this.width / 2, hh = this.height / 2, hd = this.depth / 2, c = this.center;
    const corner = (a, b, d) => v3.sub(v3.add(c, [a * hw, b * hh, d * hd]), eye);
    const out = [];
    for (const [p, q] of [
      [[-1, -1, -1], [1, -1, -1]], [[-1, 1, -1], [1, 1, -1]], [[-1, -1, 1], [1, -1, 1]], [[-1, 1, 1], [1, 1, 1]],
      [[-1, -1, -1], [-1, 1, -1]], [[1, -1, -1], [1, 1, -1]], [[-1, -1, 1], [-1, 1, 1]], [[1, -1, 1], [1, 1, 1]],
      [[-1, -1, -1], [-1, -1, 1]], [[1, -1, -1], [1, -1, 1]], [[-1, 1, -1], [-1, 1, 1]], [[1, 1, -1], [1, 1, 1]],
    ]) out.push(...corner(...p), ...corner(...q));
    return Float32Array.from(out);
  }

  render(fc) {
    const r = fc.renderer, NX = this.sim.NX;
    // The module's own picture on the back wall, so every Display still shows.
    this.updatePicture(fc, false);
    const back = v3.add(this.center, [0, 0, -this.depth / 2]);
    r.mesh('quad', mat4.model(this.basis, v3.sub(back, fc.eye), [this.width, 1, this.height]), { texture: this.texKey, lit: 0 });
    // The land.
    const version = this.ground();
    if (!r.hasTexture(this.landKey) || this.landVersion !== version) {
      r.texture(this.landKey, this.landTexture(), version, NX, 1, false);
      this.landVersion = version;
    }
    r.dynamicMesh(this.groundKey, () => this.groundMesh(), version);
    r.dynamicMesh(this.wallKey, () => this.wallMesh(), version);
    const model = mat4.model(IDENTITY_BASIS, v3.sub(this.center, fc.eye), 1);
    r.mesh(this.groundKey, model, { texture: this.landKey, lit: 1, night: 0.45 });
    r.mesh(this.wallKey, model, { color: SOIL, lit: 0.8, night: 0.45 });
    // Rain and snow, then the clouds over them.
    const [rain, snow] = this.precipLines(fc.eye, fc.time);
    r.lines(rain, RAIN, false);
    r.lines(snow, SNOW, false);
    const n = this.cloudPoints(fc.eye, fc.pixelSize);
    r.points(this.puffs, n);
    r.lines(this.edges(fc.eye), fc.active ? [0.45, 0.65, 1, 0.9] : [0.55, 0.62, 0.8, 0.45], false);
  }
}
