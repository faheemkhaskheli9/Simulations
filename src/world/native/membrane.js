// Native 3D view of the Cell Biology module: the cell as a sphere. Its 2D disc
// is the cell's equator, so the membrane becomes a translucent sphere of the
// module's radius, swelling and shrinking with it. Molecules keep their module
// x and y and get a stable depth of their own: inside the cell within the
// sphere, outside it beyond the sphere, so a molecule is inside the sphere
// exactly when the module counts it inside. Mitochondria are lit ellipsoids,
// the nucleus a soft sphere, and membrane proteins sit round the equator, where
// the module puts them. Module x runs along the place's x and module y
// (screen-down in 2D) runs down. Render-only: it reads the module's public state
// and changes it only through the simulation contract; the tools act on the
// middle plane, the cell's equator (review R2).
import { Site } from '../site.js';
import { v3, mat4, IDENTITY_BASIS } from '../engine/math3d.js';
import { rayPlane, rayAt } from '../engine/ray.js';
import { circlePoints } from '../engine/meshes.js';
import { hexColor } from '../engine/colors.js';
import { hash3 } from './volume.js';
import { SPECIES, PROTEINS, CENTER, R0 } from '../../sims/cell.js';

const DEPTH = 15; // half-depth (µm) of the fluid around the cell
const MEMBRANE = hexColor('#8fb4ff'), STRETCHED = hexColor('#ff8a5c');
const NUCLEUS = [0.59, 0.43, 0.78, 0.45];
const MITO = hexColor('#ff8c5a'), DEAD = hexColor('#787878');
const PLANE = [0.55, 0.62, 0.8, 0.3], PLANE_ACTIVE = [0.45, 0.65, 1, 0.7];

/** A stable number in [-1, 1) for an entity id (its depth within the room it has). */
const spread = (id, salt = 3) => 2 * hash3(id, salt, 5) - 1;

export class MembraneSite extends Site {
  constructor(spec, place, Sim) {
    super(spec, place, Sim);
    this.width = spec.width;
    this.balls = new Float32Array(0);
  }

  /** Place units per module unit (µm). */
  get scale() {
    return this.width / (this.sim?.bounds().w ?? 60);
  }

  get height() {
    return (this.sim?.bounds().h ?? 40) * this.scale;
  }

  get radius() {
    return Math.hypot(this.width, this.height) / 2;
  }

  get mpp() {
    return 1 / this.scale;
  }

  /** Module point and depth (µm from the middle plane, towards the camera) → place point. */
  placeAt(mx, my, mz = 0) {
    const c = this.center, s = this.scale;
    return [c[0] + (mx - CENTER[0]) * s, c[1] - (my - CENTER[1]) * s, c[2] + mz * s];
  }

  toPlace(mx, my) {
    return this.placeAt(mx, my);
  }

  /**
   * Depth of a molecule at (x, y): inside the cell's disc it stays within the
   * sphere, outside the disc it lies beyond it, up to the fluid's depth. Both
   * are 0 on the membrane, so a molecule crossing it does not jump.
   */
  depthOf(id, x, y, fill = 0.92) {
    const R = this.sim.R, r2 = (x - CENTER[0]) ** 2 + (y - CENTER[1]) ** 2;
    const room = r2 < R * R ? Math.sqrt(R * R - r2) * fill : Math.min(DEPTH, Math.sqrt(r2 - R * R));
    return spread(id) * room;
  }

  /** Place point of a particle, protein or mitochondrion. */
  entityAt(e) {
    const sim = this.sim;
    if (e.type) return this.placeAt(...sim.proteinPos(e));
    return this.placeAt(e.x, e.y, this.depthOf(e.id, e.x, e.y, e.sp ? 0.92 : 0.5));
  }

  /** Rays meet the middle plane (the cell's equator), where the tools act. */
  hit(ray) {
    const c = this.center, s = this.scale, b = this.sim.bounds();
    const t = rayPlane(ray, c, [0, 0, 1]);
    if (t === null) return null;
    const p = rayAt(ray, t);
    const x = (p[0] - c[0]) / s + CENTER[0], y = CENTER[1] - (p[1] - c[1]) / s;
    return { x, y, t, inside: x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h, mpp: this.mpp, normal: [0, 0, 1] };
  }

  drawSelection(fc, entity) {
    const sim = this.sim, loc = sim.locate(entity);
    if (!loc) return;
    const p = entity === sim.membrane ? this.placeAt(loc.x, loc.y) : this.entityAt(entity);
    const r = Math.max(loc.r * this.scale * 1.3, 9 * fc.pixelSize(v3.dist(p, fc.eye)));
    fc.ring(p, r, [1, 1, 1, 0.9]);
  }

  /** Instance data (8 floats per sphere, camera-relative) for molecules and proteins; returns the count. */
  moleculeSpheres(eye, minRadius = 0) {
    const sim = this.sim, proteins = sim.params.showProteins && !sim.burst ? sim.proteins : [];
    const n = sim.particles.length + proteins.length;
    if (this.balls.length < n * 8) this.balls = new Float32Array(n * 8 + 64);
    let k = 0;
    const put = (p, radius, color, glow) => {
      this.balls.set([p[0] - eye[0], p[1] - eye[1], p[2] - eye[2], Math.max(radius, minRadius), color[0], color[1], color[2], glow], k * 8);
      k++;
    };
    for (const p of sim.particles) put(this.entityAt(p), SPECIES[p.sp].r * this.scale, hexColor(SPECIES[p.sp].color), 0.3);
    for (const p of proteins) put(this.entityAt(p), 0.5 * this.scale, hexColor(p.active ? PROTEINS[p.type].color : '#555555'), 0.1);
    return k;
  }

  /** Orientation of a mitochondrion: its long axis along its module angle, in the middle plane. */
  mitoBasis(m) {
    const c = Math.cos(m.angle), s = Math.sin(m.angle);
    return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
  }

  /** The membrane's colour: blue, orange once stretched towards bursting (as in 2D). */
  membraneColor() {
    return this.sim.R > R0 * 1.25 ? STRETCHED : MEMBRANE;
  }

  /** The middle plane's outline (the module's bounds) and the cell's equator, as camera-relative line strips. */
  outlines(eye) {
    const b = this.sim.bounds();
    const rect = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h], [b.x, b.y]]
      .flatMap(([x, y]) => v3.sub(this.placeAt(x, y), eye));
    const equator = circlePoints(v3.sub(this.center, eye), [1, 0, 0], [0, 1, 0], this.sim.R * this.scale, 96);
    return { rect: Float32Array.from(rect), equator: Float32Array.from(equator) };
  }

  render(fc) {
    const r = fc.renderer, sim = this.sim, s = this.scale, rel = v3.sub(this.center, fc.eye);
    const px = fc.pixelSize(v3.dist(this.center, fc.eye));
    const { rect, equator } = this.outlines(fc.eye);
    r.lines(rect, fc.active ? PLANE_ACTIVE : PLANE);
    r.spheres(this.balls, this.moleculeSpheres(fc.eye, px * 0.8), true);
    for (const m of sim.mitos) {
      const c = m.active ? MITO : DEAD;
      r.mesh('sphere', mat4.model(this.mitoBasis(m), v3.sub(this.entityAt(m), fc.eye), [1.6 * s, 0.9 * s, 0.9 * s]), { color: [c[0], c[1], c[2], 1], lit: 1, night: 0.35 });
    }
    const color = this.membraneColor();
    if (!sim.burst) {
      r.mesh('sphere', mat4.model(IDENTITY_BASIS, rel, sim.R * 0.28 * s), { color: NUCLEUS, lit: 1, night: 0.4, depthWrite: false });
      r.mesh('sphere', mat4.model(IDENTITY_BASIS, rel, sim.R * s), { color: [color[0], color[1], color[2], 0.16], lit: 1, night: 0.35, depthWrite: false });
      r.lines(equator, [color[0], color[1], color[2], 0.9]);
    } else {
      // A ruptured membrane: only a faint broken outline is left.
      r.lines(equator, [color[0], color[1], color[2], 0.3], false);
    }
  }
}
