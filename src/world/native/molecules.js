// Native 3D view of the Atoms & Molecules module: its box of atoms in depth, as
// ball-and-stick. Free atoms are lit spheres at their van der Waals size; bonded
// atoms shrink to balls joined by sticks. Module x runs along the place's x,
// module y (screen-down in 2D) runs down, and module z comes towards the
// default camera. Outside the 3D mode the atoms sit on the box's middle plane.
// Render-only: it reads the module's public state and changes it only through
// the simulation contract; the tools act on the middle plane (review R2).
import { Site } from '../site.js';
import { v3, mat4, IDENTITY_BASIS } from '../engine/math3d.js';
import { rayPlane, rayAt } from '../engine/ray.js';
import { hexColor } from '../engine/colors.js';
import { ELEMENTS } from '../../sims/atoms.js';

const FREE = 0.45; // free-atom radius in σ (near the 2D view's 0.5σ discs)
const BALL = 0.28; // bonded-atom radius in σ
const STICK = 0.09; // stick radius in σ
const SIDES = 6; // sides of a stick's cylinder
const MAX_STICKS = Math.floor(65536 / (SIDES * 2)); // 16-bit mesh indices
const STICK_COLOR = [0.78, 0.8, 0.86, 1];
const FRAME = [0.45, 0.55, 0.78, 0.6], FRAME_ACTIVE = [0.45, 0.65, 1, 0.9];

export class MoleculesSite extends Site {
  constructor(spec, place, Sim) {
    super(spec, place, Sim);
    this.width = spec.width;
    this.balls = new Float32Array(0);
    this.stickKey = `sticks:${this.id}`;
    this.stickVersion = 0;
  }

  /** Place units per module unit (σ). */
  get scale() {
    return this.width / (this.sim?.W ?? 60);
  }

  get height() {
    return (this.sim?.H ?? 40) * this.scale;
  }

  get depth() {
    return (this.sim?.D ?? 16) * this.scale;
  }

  get radius() {
    return Math.hypot(this.width, this.height, this.depth) / 2;
  }

  get mpp() {
    return 1 / this.scale;
  }

  /** Module depth of an atom: its z in 3D, the middle plane otherwise. */
  zOf(a) {
    return this.sim.params.threeD ? a.z : this.sim.D / 2;
  }

  /** Module point → place point (mz defaults to the middle plane). */
  placeAt(mx, my, mz = this.sim.D / 2) {
    const c = this.center, s = this.scale, sim = this.sim;
    return [c[0] + (mx - sim.W / 2) * s, c[1] - (my - sim.H / 2) * s, c[2] + (mz - sim.D / 2) * s];
  }

  toPlace(mx, my) {
    return this.placeAt(mx, my);
  }

  /** Rays meet the middle plane, where the tools act. */
  hit(ray) {
    const c = this.center, sim = this.sim, s = this.scale;
    const t = rayPlane(ray, c, [0, 0, 1]);
    if (t === null) return null;
    const p = rayAt(ray, t);
    const x = (p[0] - c[0]) / s + sim.W / 2, y = sim.H / 2 - (p[1] - c[1]) / s;
    return { x, y, t, inside: x >= 0 && x <= sim.W && y >= 0 && y <= sim.H, mpp: this.mpp, normal: [0, 0, 1] };
  }

  drawSelection(fc, entity) {
    const loc = this.sim.locate(entity);
    if (!loc) return;
    const p = this.placeAt(loc.x, loc.y, this.sim.params.threeD ? loc.z : undefined);
    const r = Math.max(loc.r * this.scale * 1.3, 9 * fc.pixelSize(v3.dist(p, fc.eye)));
    fc.ring(p, r, [1, 1, 1, 0.9]);
  }

  /** Radius of an atom's ball in place units: smaller once it is bonded and bonds are drawn. */
  ballRadius(a) {
    const bonded = a.bonds.length && this.sim.params.showBonds;
    return ELEMENTS[a.el].sigma * (bonded ? BALL : FREE) * this.scale;
  }

  /** Instance data for the atoms (8 floats per sphere, camera-relative); returns the count. */
  atomSpheres(eye, minRadius = 0) {
    const atoms = this.sim.atoms;
    if (this.balls.length < atoms.length * 8) this.balls = new Float32Array(atoms.length * 8 + 64);
    let n = 0;
    for (const a of atoms) {
      const p = this.placeAt(a.x, a.y, this.zOf(a));
      const [cr, cg, cb] = hexColor(ELEMENTS[a.el].color);
      this.balls.set([p[0] - eye[0], p[1] - eye[1], p[2] - eye[2], Math.max(this.ballRadius(a), minRadius), cr, cg, cb, 0], n * 8);
      n++;
    }
    return n;
  }

  /** Bonded pairs, each once. */
  bondPairs() {
    const out = [];
    for (const a of this.sim.atoms) for (const b of a.bonds) if (b.id > a.id) out.push([a, b]);
    return out.slice(0, MAX_STICKS);
  }

  /** One open cylinder per bond, in place units relative to the site's centre. */
  stickMesh() {
    const pairs = this.bondPairs(), c = this.center, rad = STICK * this.scale;
    const nv = pairs.length * SIDES * 2;
    const positions = new Float32Array(nv * 3), normals = new Float32Array(nv * 3), uvs = new Float32Array(nv * 2);
    const indices = new Uint16Array(pairs.length * SIDES * 6);
    let v = 0, k = 0;
    for (const [a, b] of pairs) {
      const p = v3.sub(this.placeAt(a.x, a.y, this.zOf(a)), c), q = v3.sub(this.placeAt(b.x, b.y, this.zOf(b)), c);
      const axis = v3.norm(v3.sub(q, p));
      let u = v3.cross(axis, [0, 1, 0]);
      if (v3.len(u) < 1e-6) u = v3.cross(axis, [1, 0, 0]);
      u = v3.norm(u);
      const w = v3.cross(axis, u), base = v;
      for (let i = 0; i < SIDES; i++) {
        const ang = (i / SIDES) * Math.PI * 2, n = v3.add(v3.scale(u, Math.cos(ang)), v3.scale(w, Math.sin(ang)));
        for (const end of [p, q]) {
          positions.set(v3.add(end, v3.scale(n, rad)), v * 3);
          normals.set(n, v * 3);
          v++;
        }
      }
      for (let i = 0; i < SIDES; i++) {
        const a0 = base + i * 2, a1 = a0 + 1, b0 = base + ((i + 1) % SIDES) * 2, b1 = b0 + 1;
        indices.set([a0, b0, a1, a1, b0, b1], k);
        k += 6;
      }
    }
    return { positions, normals, uvs, indices };
  }

  /** The box's twelve edges as camera-relative line pairs. */
  frameLines(eye) {
    const sim = this.sim, out = [];
    const corner = (i) => this.placeAt(i & 1 ? sim.W : 0, i & 2 ? sim.H : 0, i & 4 ? sim.D : 0);
    for (let i = 0; i < 8; i++) {
      for (const bit of [1, 2, 4]) {
        if (i & bit) continue;
        out.push(...v3.sub(corner(i), eye), ...v3.sub(corner(i | bit), eye));
      }
    }
    return Float32Array.from(out);
  }

  render(fc) {
    const r = fc.renderer;
    r.lines(this.frameLines(fc.eye), fc.active ? FRAME_ACTIVE : FRAME, false);
    const px = fc.pixelSize(v3.dist(this.center, fc.eye));
    const n = this.atomSpheres(fc.eye, px * 0.8);
    r.spheres(this.balls, n, n > 2000);
    if (this.sim.params.showBonds && this.sim.atoms.some((a) => a.bonds.length)) {
      // Atoms move every frame, so the sticks are rebuilt every frame.
      r.dynamicMesh(this.stickKey, () => this.stickMesh(), ++this.stickVersion);
      r.mesh(this.stickKey, mat4.model(IDENTITY_BASIS, v3.sub(this.center, fc.eye), 1), { color: STICK_COLOR, lit: 1 });
    }
  }
}
