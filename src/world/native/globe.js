// Native 3D view of the Global Climate module: its latitude bands mapped onto a
// globe, with ice, and lit by the Sun at the model's solar declination
// (W-SM-6). Render-only: the climate physics is unchanged.
import { Site } from '../site.js';
import { v3, mat4, IDENTITY_BASIS } from '../engine/math3d.js';
import { raySphere, rayAt } from '../engine/ray.js';
import { circlePoints } from '../engine/meshes.js';
import { SURFACES, ICE_T } from '../../sims/climate.js';

export const GLOBE_ROWS = 360; // texture rows, north pole first: 0.5° each
export const GLOBE_COLS = 128; // longitude texels: only brightness varies along a row

/** Climate band containing latitude `latDeg` for a model with n equal-area bands (as ClimateSim.bandAt). */
export function bandForLatitude(n, latDeg) {
  const s = Math.sin((latDeg * Math.PI) / 180);
  return Math.min(n - 1, Math.max(0, Math.floor(((s + 1) / 2) * n)));
}

/** Latitude (degrees) at the centre of texture row r. */
export const rowLatitude = (r, rows = GLOBE_ROWS) => 90 - ((r + 0.5) * 180) / rows;

/** Colour of band i as the eye would see it: ice, or the surface type. */
export function bandColor(sim, i) {
  const surf = SURFACES[sim.surfaceOf(i)];
  if (sim.T[i] <= ICE_T || surf === SURFACES.ice) return [235, 242, 252];
  return surf.color;
}

/**
 * Texture shading by longitude and latitude. The model is zonal (one value per
 * band), so only the brightness varies, to read as terrain rather than stripes;
 * the surface type and ice always come from the band.
 */
export function relief(lonDeg, latDeg) {
  const a = (lonDeg * Math.PI) / 180, b = (latDeg * Math.PI) / 180;
  return 0.9 + 0.06 * Math.sin(3 * a + 2 * Math.sin(2 * b)) + 0.04 * Math.sin(7 * a - 5 * b + 1.3) + 0.03 * Math.sin(13 * a + 11 * b);
}

/** RGBA texels (rows × cols, north first) for the globe texture. */
export function globeTexture(sim, rows = GLOBE_ROWS, cols = GLOBE_COLS) {
  const n = sim.T.length, out = new Uint8Array(rows * cols * 4);
  for (let r = 0; r < rows; r++) {
    const lat = rowLatitude(r, rows), i = bandForLatitude(n, lat);
    const [cr, cg, cb] = bandColor(sim, i);
    const iced = cr === 235 && cg === 242 && cb === 252;
    for (let c = 0; c < cols; c++) {
      const k = iced ? 1 : relief((c / cols) * 360 - 180, lat);
      const o = (r * cols + c) * 4;
      out[o] = Math.min(255, cr * k);
      out[o + 1] = Math.min(255, cg * k);
      out[o + 2] = Math.min(255, cb * k);
      out[o + 3] = 255;
    }
  }
  return out;
}

/**
 * Direction to the Sun in the globe's frame (+y = north pole): the horizontal
 * direction `towards` (from the real Sun when known) raised to declination δ.
 */
export function sunDirection(towards, declination) {
  let h = [towards?.[0] ?? 1, 0, towards?.[2] ?? 0];
  if (Math.hypot(h[0], h[2]) < 1e-12) h = [1, 0, 0];
  h = v3.norm(h);
  return v3.norm(v3.add(v3.scale(h, Math.cos(declination)), [0, Math.sin(declination), 0]));
}

export class GlobeSite extends Site {
  constructor(spec, place, Sim) {
    super(spec, place, Sim);
    this.R = spec.radius;
    this.texKey = `site:${this.id}`;
    this.version = 0;
  }

  get radius() {
    return this.R;
  }

  get mpp() {
    return 1 / this.R;
  }

  /** Module y = −sin(latitude); shown on the meridian at longitude 0. */
  toPlace(mx, my) {
    const s = Math.max(-1, Math.min(1, -my)), c = Math.sqrt(1 - s * s);
    return v3.add(this.center, [c * this.R, s * this.R, 0]);
  }

  hit(ray) {
    const t = raySphere(ray, this.center, this.R);
    if (t === null) return null;
    const p = v3.sub(rayAt(ray, t), this.center);
    const s = p[1] / v3.len(p);
    return { x: 0, y: -s, t, inside: true, mpp: this.mpp, normal: v3.norm(p) };
  }

  sun(fc) {
    const d = this.sim.declination?.() ?? 0;
    return sunDirection(fc.light, d ?? 0);
  }

  render(fc) {
    const r = fc.renderer;
    if (this.tier === 'active' || !this.drawn || fc.time - (this.lastDraw ?? 0) >= 1 / fc.ambientHz || !r.hasTexture(this.texKey)) {
      r.texture(this.texKey, globeTexture(this.sim), ++this.version, GLOBE_COLS, GLOBE_ROWS);
      this.drawn = true;
      this.lastDraw = fc.time;
    }
    const sun = this.sun(fc);
    const saved = r.light;
    r.light = sun;
    const rel = v3.sub(this.center, fc.eye);
    r.mesh('sphere', mat4.model(IDENTITY_BASIS, rel, this.R), { texture: this.texKey, lit: 1, night: 0.12, cull: true });
    // A thin atmosphere and the rotation axis.
    r.mesh('sphere', mat4.model(IDENTITY_BASIS, rel, this.R * 1.015), { color: [0.45, 0.65, 1, 0.12], lit: 0.4, night: 0.2, depthWrite: false, cull: true });
    r.light = saved;
    r.lines(Float32Array.from([...v3.add(rel, [0, -1.25 * this.R, 0]), ...v3.add(rel, [0, 1.25 * this.R, 0])]), [1, 1, 1, 0.45]);
  }

  /** The selected band is a whole circle of latitude. */
  drawSelection(fc, entity) {
    if (!entity || entity.band === undefined) return;
    const s = this.sim.x[entity.band], y = s * this.R, rr = Math.sqrt(1 - s * s) * this.R * 1.004;
    const pts = circlePoints(v3.sub(v3.add(this.center, [0, y, 0]), fc.eye), [1, 0, 0], [0, 0, -1], rr, 96);
    fc.renderer.lines(Float32Array.from(pts), [1, 1, 1, 0.95]);
  }
}
