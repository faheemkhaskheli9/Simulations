// Native 3D view of the Gravity module: bodies as lit spheres or glowing points
// on the orbital plane (or above and below it in the module's 3D mode, where
// module z is the place's up axis), with trails, orbit ellipses and labels. It reads the module's public
// state and changes it only through the contract (review R2).
import { Site } from '../site.js';
import { v3 } from '../engine/math3d.js';
import { rayPlane, rayAt } from '../engine/ray.js';
import { hexColor } from '../engine/colors.js';

const GLOW = new Set(['star', 'redDwarf']);
const POINTS_ABOVE = 300; // larger systems draw their test particles as points

export class GravitySite extends Site {
  constructor(spec, place, Sim) {
    super(spec, place, Sim);
    this.scale = spec.scale ?? 1; // place units per module unit (AU)
    this.hidden = new Set(spec.hide ?? []);
    this.spheres = new Float32Array(0);
    this.points = new Float32Array(0);
  }

  get radius() {
    const b = this.sim?.bounds() ?? { w: 12, h: 12 };
    return (Math.max(b.w, b.h) / 2) * this.scale;
  }

  get anchor() {
    const b = this.spec.markAt && this.sim?.bodies.find((x) => x.name === this.spec.markAt);
    return b ? this.toPlace(b.x, b.y, b.z) : this.center;
  }

  get mpp() {
    return 1 / this.scale;
  }

  /** Module position of the body the site is centred on (e.g. the Earth for the Moon's orbit). */
  originXY() {
    if (!this.spec.origin || !this.sim) return [0, 0, 0];
    const b = this.sim.bodies.find((x) => x.name === this.spec.origin);
    return b ? [b.x, b.y, b.z ?? 0] : [0, 0, 0];
  }

  toPlace(mx, my, mz = 0) {
    const [ox, oy, oz] = this.originXY(), at = this.center;
    return [at[0] + (mx - ox) * this.scale, at[1] + (mz - oz) * this.scale, at[2] + (my - oy) * this.scale];
  }

  hit(ray) {
    const at = this.center;
    const t = rayPlane(ray, at, [0, 1, 0]);
    if (t === null) return null;
    const p = rayAt(ray, t), [ox, oy] = this.originXY();
    return { x: (p[0] - at[0]) / this.scale + ox, y: (p[2] - at[2]) / this.scale + oy, t, inside: true, mpp: this.mpp, normal: [0, 1, 0] };
  }

  /** Bodies to skip: hidden ones, and those a place we are inside stands for. */
  hiddenNow(fc) {
    const out = new Set(this.hidden);
    for (const [placeId, names] of Object.entries(this.spec.hideInside ?? {})) {
      if (fc.inside(placeId)) for (const n of names) out.add(n);
    }
    return out;
  }

  /** Position of a body relative to the camera, in place units. */
  relPos(b, ox, oy, oz, eye) {
    const at = this.center;
    return [at[0] + (b.x - ox) * this.scale - eye[0], at[1] + ((b.z ?? 0) - oz) * this.scale - eye[1], at[2] + (b.y - oy) * this.scale - eye[2]];
  }

  render(fc) {
    const sim = this.sim, r = fc.renderer, bodies = sim.bodies;
    const [ox, oy, oz] = this.originXY();
    const hidden = this.hiddenNow(fc);
    const many = bodies.length > POINTS_ABOVE;
    if (this.spheres.length < bodies.length * 8) this.spheres = new Float32Array(bodies.length * 8);
    if (this.points.length < bodies.length * 8 * 2) this.points = new Float32Array(bodies.length * 16);
    let ns = 0, np = 0;
    const labels = bodies.length <= 40;
    for (const b of bodies) {
      if (hidden.has(b.name)) continue;
      const p = this.relPos(b, ox, oy, oz, fc.eye);
      const dist = Math.hypot(p[0], p[1], p[2]);
      const px = fc.pixelSize(dist);
      const [cr, cg, cb] = hexColor(b.color);
      if (many && b.m === 0) {
        this.points.set([p[0], p[1], p[2], Math.max(1.5, b.px * 1.4), cr, cg, cb, 0.85], np * 8);
        np++;
        continue;
      }
      const radius = Math.max(b.radius * this.scale, b.px * px);
      const glow = GLOW.has(b.kind) || !this.spec.lit ? 1 : 0;
      const col = b.kind === 'blackHole' ? [0.02, 0, 0.05] : [cr, cg, cb];
      this.spheres.set([p[0], p[1], p[2], radius, col[0], col[1], col[2], glow], ns * 8);
      ns++;
      if (GLOW.has(b.kind) || b.kind === 'blackHole') {
        // A soft halo, drawn as a large additive point.
        this.points.set([p[0], p[1], p[2], Math.min(80, (radius / px) * 6 + 8), cr, cg, cb, 0.5], np * 8);
        np++;
      }
      if (labels && b.m > 0 && !(bodies.length > 20 && b.m < 1e-7)) fc.label(b.name, v3.add(p, fc.eye), radius / px + 4);
    }
    // Trails (module coordinates, every second point is a position).
    if (sim.params.trails && bodies.length <= 400) {
      for (const b of bodies) {
        if (hidden.has(b.name) || b.trail.length < 6 || (many && b.m === 0)) continue;
        const n = b.trail.length / 2, buf = new Float32Array(n * 3);
        const at = this.center, tz = b.tz ?? [], skip = tz.length - n;
        for (let i = 0; i < n; i++) {
          buf[i * 3] = at[0] + (b.trail[i * 2] - ox) * this.scale - fc.eye[0];
          buf[i * 3 + 1] = at[1] + ((tz[i + skip] ?? 0) - oz) * this.scale - fc.eye[1];
          buf[i * 3 + 2] = at[2] + (b.trail[i * 2 + 1] - oy) * this.scale - fc.eye[2];
        }
        r.lines(buf, hexColor(b.color, 0.4));
      }
    }
    // Orbit ellipses: one closed loop per body bound to its host.
    if (sim.params.orbits) {
      for (const { body, points } of sim.orbitEllipses()) {
        if (hidden.has(body.name)) continue;
        const n = points.length / 3, buf = new Float32Array((n + 1) * 3);
        for (let i = 0; i <= n; i++) {
          const j = (i % n) * 3;
          buf[i * 3] = this.center[0] + (points[j] - ox) * this.scale - fc.eye[0];
          buf[i * 3 + 1] = this.center[1] + (points[j + 2] - oz) * this.scale - fc.eye[1];
          buf[i * 3 + 2] = this.center[2] + (points[j + 1] - oy) * this.scale - fc.eye[2];
        }
        r.lines(buf, hexColor(body.color, 0.55));
      }
    }
    r.spheres(this.spheres, ns);
    r.points(this.points, np, true);
  }
}
