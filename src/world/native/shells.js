// Native 3D view of the Atomic Structure module: one atom in depth. The nucleus
// is a ball of protons and neutrons, each electron shell is a faint lit sphere,
// and every electron circles its shell on a tilted orbit of its own, so the
// shells read as spheres rather than rings. The element badge and the emission
// spectrum hang below the atom on a plaque. Module x runs along the place's x and
// module y (screen-down in 2D) runs down. Render-only: it reads the module's
// public state and changes it only through the simulation contract. The tools
// act on the middle plane, except that a ray through an electron's ball picks
// that electron.
import { Site } from '../site.js';
import { v3, mat4, IDENTITY_BASIS } from '../engine/math3d.js';
import { rayPlane, rayAt, raySphere } from '../engine/ray.js';
import { hexColor } from '../engine/colors.js';
import { hash3 } from './volume.js';
import { clamp } from '../../core/math.js';
import { spectrumColor } from '../../sims/atom.js';

const ELECTRON = 0.22; // electron radius in module units, as in the 2D view
const PICK = 1.8; // a ray within this many electron radii picks the electron
const PROTON = hexColor('#ff5a5a'), NEUTRON = hexColor('#a0a6b4');
const GROUND = hexColor('#5ab0ff'), EXCITED = hexColor('#ffe066');
const SHELL = [0.43, 0.59, 0.9];
const PARTICLE = { alpha: hexColor('#ff9a4a'), beta: hexColor('#7cf0ff'), electron: hexColor('#5ab0ff') };
const PLAQUE = [1100, 100]; // plaque texture in px: badge on the left, spectrum in the middle
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** Unit vectors spanning electron `id`'s orbit plane: a stable tilt and node per electron. */
export function orbitPlane(id) {
  const inc = Math.acos(1 - 2 * hash3(id, 7, 1)), node = hash3(id, 7, 2) * Math.PI * 2;
  const u = [Math.cos(node), Math.sin(node), 0];
  const v = [-Math.sin(node) * Math.cos(inc), Math.cos(node) * Math.cos(inc), Math.sin(inc)];
  return [u, v];
}

/** Nucleon i of A packed in a ball of radius R (sunflower in depth): [x, y, z] relative to the centre. */
export function nucleonOffset(i, A, R) {
  if (A <= 1) return [0, 0, 0];
  const r = R * Math.cbrt((i + 0.5) / A), y = 1 - (2 * (i + 0.5)) / A, s = Math.sqrt(Math.max(0, 1 - y * y));
  return [Math.cos(i * GOLDEN) * s * r, y * r, Math.sin(i * GOLDEN) * s * r];
}

export class ShellsSite extends Site {
  constructor(spec, place, Sim) {
    super(spec, place, Sim);
    this.width = spec.width;
    this.balls = new Float32Array(0);
    this.glow = new Float32Array(0);
    this.plaqueKey = `plaque:${this.id}`;
    this.plaqueStamp = null;
    this.plaqueVersion = 0;
  }

  /** Place units per module unit. */
  get scale() {
    return this.width / (this.sim?.bounds().w ?? 25);
  }

  get height() {
    return this.width;
  }

  get radius() {
    return this.width / 2;
  }

  get mpp() {
    return 1 / this.scale;
  }

  /** Module offset from the nucleus (x right, y down, z near) → place point. */
  placeAt(mx, my, mz = 0) {
    const c = this.center, s = this.scale;
    return [c[0] + mx * s, c[1] - my * s, c[2] + mz * s];
  }

  toPlace(mx, my) {
    return this.placeAt(mx, my);
  }

  /** An electron's position in module units, [x, y, z], on its tilted orbit. */
  electronAt(e) {
    const r = this.sim.shellRadius(e.n), [u, v] = orbitPlane(e.id);
    const c = Math.cos(e.angle) * r, s = Math.sin(e.angle) * r;
    return [u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s];
  }

  /** Front-most electron whose ball the ray passes through: { e, t } or null. */
  electronHit(ray) {
    let best = null;
    for (const e of this.sim.electrons) {
      const t = raySphere(ray, this.placeAt(...this.electronAt(e)), ELECTRON * PICK * this.scale);
      if (t !== null && (!best || t < best.t)) best = { e, t };
    }
    return best;
  }

  /**
   * Rays meet the middle plane, where the tools act. A ray through an electron
   * returns that electron's 2D module position, so the module picks it.
   */
  hit(ray) {
    const c = this.center, s = this.scale, b = this.sim.bounds();
    const on = this.electronHit(ray);
    if (on) {
      const r = this.sim.shellRadius(on.e.n);
      return { x: Math.cos(on.e.angle) * r, y: Math.sin(on.e.angle) * r, t: on.t, inside: true, mpp: this.mpp, normal: [0, 0, 1] };
    }
    const t = rayPlane(ray, c, [0, 0, 1]);
    if (t === null) return null;
    const p = rayAt(ray, t);
    const x = (p[0] - c[0]) / s, y = -(p[1] - c[1]) / s;
    return { x, y, t, inside: x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h, mpp: this.mpp, normal: [0, 0, 1] };
  }

  drawSelection(fc, entity) {
    const sim = this.sim;
    if (!sim.locate(entity)) return;
    const nucleus = entity === sim.nucleus;
    const p = nucleus ? this.center : this.placeAt(...this.electronAt(entity));
    const r = Math.max((nucleus ? sim.nucleusRadius() + 0.2 : 0.4) * this.scale * 1.3, 9 * fc.pixelSize(v3.dist(p, fc.eye)));
    fc.ring(p, r, [1, 1, 1, 0.9]);
  }

  /** Shells drawn: every level up to the highest in use, and at least two (as in 2D). */
  shellLevels() {
    const sim = this.sim;
    const used = Math.max(1, ...sim.electrons.map((e) => e.n), ...sim.groundShells(sim.electrons.length));
    return { used, drawn: Math.max(used, 2) };
  }

  /** Instance data (8 floats per sphere, camera-relative) for nucleons and electrons; returns the count. */
  atomSpheres(eye, minRadius = 0) {
    const sim = this.sim, A = sim.Z + sim.N, n = A + sim.electrons.length;
    if (this.balls.length < n * 8) this.balls = new Float32Array(n * 8 + 64);
    const R = sim.nucleusRadius(), rn = Math.max(minRadius, ((0.9 * R) / Math.cbrt(Math.max(A, 1))) * this.scale);
    let k = 0;
    const put = (p, radius, color, glow) => {
      this.balls.set([p[0] - eye[0], p[1] - eye[1], p[2] - eye[2], radius, color[0], color[1], color[2], glow], k * 8);
      k++;
    };
    for (let i = 0; i < A; i++) {
      // Protons and neutrons interleaved evenly, as in the 2D view.
      const proton = Math.floor(((i + 1) * sim.Z) / A) > Math.floor((i * sim.Z) / A);
      put(this.placeAt(...nucleonOffset(i, A, R)), rn, proton ? PROTON : NEUTRON, 0);
    }
    const re = Math.max(minRadius, ELECTRON * this.scale);
    for (const e of sim.electrons) {
      const excited = e.n > e.ground;
      put(this.placeAt(...this.electronAt(e)), re, excited ? EXCITED : GROUND, excited ? 1 : 0.6);
    }
    return k;
  }

  /** Emitted photons and decay particles as glowing points on the middle plane (8 floats each); returns the count. */
  particlePoints(eye) {
    const list = this.sim.particles;
    if (this.glow.length < list.length * 8) this.glow = new Float32Array(list.length * 8 + 32);
    let k = 0;
    for (const p of list) {
      const q = this.placeAt(p.x, p.y);
      const c = p.kind === 'photon' ? hexColor(spectrumColor(p.nm)) : PARTICLE[p.kind] ?? PARTICLE.electron;
      const size = p.kind === 'photon' ? 9 : p.kind === 'alpha' ? 12 : 6;
      this.glow.set([q[0] - eye[0], q[1] - eye[1], q[2] - eye[2], size, c[0], c[1], c[2], clamp(p.life / 2.5, 0, 1)], k * 8);
      k++;
    }
    return k;
  }

  /** Redraw the badge and spectrum plaque when the atom or its lines changed. */
  updatePlaque(fc) {
    const sim = this.sim, r = fc.renderer;
    const stamp = `${sim.Z},${sim.N},${sim.electrons.length},${sim.photons},${sim.lines.length}`;
    if (stamp === this.plaqueStamp && r.hasTexture(this.plaqueKey)) return;
    const [w, h] = PLAQUE, canvas = fc.canvas(this, w, h), ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(8,11,22,0.85)';
    ctx.fillRect(0, 0, w, h);
    sim.renderBadge(ctx);
    sim.renderSpectrum(ctx, { width: w, height: h });
    r.texture(this.plaqueKey, canvas, ++this.plaqueVersion);
    this.plaqueStamp = stamp;
  }

  /** Centre and size (place units) of the plaque below the outermost drawn shell. */
  plaque() {
    const w = this.width, h = (w * PLAQUE[1]) / PLAQUE[0], top = this.sim.shellRadius(this.shellLevels().drawn) + 1.2;
    return { at: v3.add(this.center, [0, -top * this.scale - h / 2, 0]), w, h };
  }

  render(fc) {
    const r = fc.renderer, sim = this.sim;
    const px = fc.pixelSize(v3.dist(this.center, fc.eye));
    r.spheres(this.balls, this.atomSpheres(fc.eye, px * 0.8));
    r.points(this.glow, this.particlePoints(fc.eye), true);
    // Shells, outermost first, as faint lit spheres (depth not written, so all show through).
    const { used, drawn } = this.shellLevels();
    for (let n = drawn; n >= 1; n--) {
      const alpha = n <= used ? 0.07 : 0.025;
      r.mesh('sphere', mat4.model(IDENTITY_BASIS, v3.sub(this.center, fc.eye), sim.shellRadius(n) * this.scale),
        { color: [...SHELL, alpha * (fc.active ? 1.3 : 1)], lit: 1, night: 0.4, depthWrite: false });
    }
    this.updatePlaque(fc);
    const { at, w, h } = this.plaque();
    r.mesh('quad', mat4.model([[1, 0, 0], [0, 0, 1], [0, -1, 0]], v3.sub(at, fc.eye), [w, 1, h]), { texture: this.plaqueKey, lit: 0 });
  }
}
