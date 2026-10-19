// A site is a simulation module placed in the world (ADR-008). It wraps an
// unchanged Simulation instance, created lazily, and maps between the module's
// 2D coordinates and its place's 3D coordinates for drawing and for the tools.
import { History } from '../ui/history.js';
import { View } from '../ui/view.js';
import { v3, basisApply, basisApplyT, mat4 } from './engine/math3d.js';
import { rayPlane, rayAt } from './engine/ray.js';
import { circlePoints } from './engine/meshes.js';

/** Activity tiers (System Design §5.1). */
export const TIERS = ['active', 'ambient', 'frozen', 'unloaded'];

export class Site {
  constructor(spec, place, Sim) {
    this.id = spec.id;
    this.spec = spec;
    this.place = place;
    this.Sim = Sim;
    this.label = spec.label ?? Sim.meta.title;
    this.scenario = spec.scenario;
    this.sim = null;
    this.tier = 'unloaded';
    this.touched = false; // changed by the user: kept in saves, serialised before unloading
    this.blob = null; // serialised state of an unloaded touched site
    this.history = new History();
    this.error = null;
    this.cost = 0; // smoothed milliseconds per step
    this.acc = 0; // seconds owed to an ambient site (catch-up)
    this.idleSince = 0;
    this.drawn = false;
  }

  /** Centre of the site in place units (for markers, focus and culling). */
  get center() {
    return this.spec.at ?? this.spec.center ?? [0, 0, 0];
  }

  /** Where the site's marker sits (place units). */
  get anchor() {
    return this.center;
  }

  /** Default camera view onto the site: { target, offset } in place units. */
  get view() {
    return { target: this.center, offset: this.spec.view?.offset ?? [0, this.radius * 0.6, this.radius * 1.6] };
  }

  get radius() {
    return this.spec.width ? this.spec.width / 2 : 1;
  }

  /** Create the simulation on first use (W-FT-20). */
  ensure() {
    if (this.sim) return this.sim;
    const sim = new this.Sim();
    if (this.scenario && sim.scenarios.some((s) => s.id === this.scenario)) sim.loadScenario(this.scenario);
    // A site may set parameters for its setting (e.g. a slower galaxy collision).
    for (const [k, v] of Object.entries(this.spec.params ?? {})) sim.setParam(k, v);
    if (this.blob) sim.deserialize(this.blob);
    this.blob = null;
    this.sim = sim;
    this.setup();
    return sim;
  }

  /** A fresh simulation as this site starts it for a scenario (the reference for share links). */
  fresh(scenarioId = this.scenario) {
    const sim = new this.Sim();
    sim.loadScenario(scenarioId);
    if (scenarioId === this.scenario) for (const [k, v] of Object.entries(this.spec.params ?? {})) sim.setParam(k, v);
    return sim;
  }

  /** Subclass hook after the simulation exists. */
  setup() {}

  /** Free the simulation, keeping a serialised copy if the user changed it. */
  unload() {
    if (!this.sim) return;
    if (this.touched) this.blob = this.sim.serialize();
    this.sim = null;
    this.tier = 'unloaded';
    this.drawn = false;
  }

  /** Module units per place unit. */
  get mpp() {
    return 1;
  }

  /** Module point → place point. */
  toPlace() {
    return this.center;
  }

  /**
   * Ray (place units) → { x, y, t, inside, mpp, normal } with module coordinates,
   * distance along the ray, whether the point is on the site, module units per
   * place unit there, and the surface normal; or null on a miss.
   */
  hit() {
    return null;
  }

  render() {}

  /** Highlight the selected entity in 3D (surface sites draw it into their texture instead). */
  drawSelection(fc, entity) {
    const loc = this.sim.locate(entity);
    if (!loc) return;
    const p = this.toPlace(loc.x, loc.y);
    const r = Math.max(((loc.r ?? 0) / this.mpp) * 1.3, 9 * fc.pixelSize(v3.dist(p, fc.eye)));
    fc.ring(p, r, [1, 1, 1, 0.9]);
  }
}

// ---------- surfaces: any module, drawn into a texture (System Design §5.3) ----------

const GROUND = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; // lies on the ground, image top towards -z
const UPRIGHT = [[1, 0, 0], [0, 0, 1], [0, -1, 0]]; // stands facing +z, image top up

export class SurfaceSite extends Site {
  constructor(spec, place, Sim) {
    super(spec, place, Sim);
    this.basis = spec.surface === 'ground' ? GROUND : UPRIGHT;
    this.width = spec.width;
    this.height = spec.width; // until the module tells us its aspect
    this.view2d = new View();
    this.texSize = [1024, 1024];
    this.version = 0;
    this.texKey = `site:${this.id}`;
  }

  get radius() {
    return Math.hypot(this.width, this.height) / 2;
  }

  get normal() {
    return this.basis[1];
  }

  setup() {
    const b = this.sim.bounds();
    this.height = (this.width * b.h) / b.w;
    this.fitTexture(1024);
  }

  /** Size the texture (longest side `px`) and fit the module's bounds exactly into it. */
  fitTexture(px) {
    const b = this.sim.bounds();
    const aspect = b.h / b.w;
    const w = aspect <= 1 ? px : Math.round(px / aspect), h = aspect <= 1 ? Math.round(px * aspect) : px;
    this.texSize = [w, h];
    this.view2d.yUp = !!this.Sim.meta.yUp;
    this.view2d.resize(w, h);
    this.view2d.fit(b, 0);
  }

  /** Module units per place unit. */
  get mpp() {
    return this.texSize[0] / (this.width * this.view2d.scale);
  }

  toPlace(mx, my) {
    const [sx, sy] = this.view2d.toScreen(mx, my);
    const local = [(sx / this.texSize[0] - 0.5) * this.width, 0, (sy / this.texSize[1] - 0.5) * this.height];
    return v3.add(this.center, basisApply(this.basis, local));
  }

  hit(ray) {
    const t = rayPlane(ray, this.center, this.normal);
    if (t === null) return null;
    const local = basisApplyT(this.basis, v3.sub(rayAt(ray, t), this.center));
    const u = local[0] / this.width + 0.5, v = local[2] / this.height + 0.5;
    const [x, y] = this.view2d.toWorld(u * this.texSize[0], v * this.texSize[1]);
    return { x, y, t, inside: u >= 0 && u <= 1 && v >= 0 && v <= 1, mpp: this.mpp, normal: this.normal };
  }

  drawSelection() {} // drawn into the texture, exactly as in the 2D app

  render(fc) {
    const sim = this.sim, r = fc.renderer;
    const due = this.tier === 'active' || !this.drawn || fc.time - (this.lastDraw ?? 0) >= 1 / fc.ambientHz;
    if (due || !r.hasTexture(this.texKey)) {
      const want = this.tier === 'active' ? fc.texturePx : fc.texturePx / 2;
      if (Math.max(...this.texSize) !== want) this.fitTexture(want);
      const [w, h] = this.texSize;
      const canvas = fc.canvas(this, w, h);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = sim.background;
      ctx.fillRect(0, 0, w, h);
      sim.render(ctx, this.view2d, { selected: fc.selected, width: w, height: h });
      if (fc.selected) this.drawHighlight(ctx, fc.selected);
      r.texture(this.texKey, canvas, ++this.version);
      this.drawn = true;
      this.lastDraw = fc.time;
    }
    const model = mat4.model(this.basis, v3.sub(this.center, fc.eye), [this.width, 1, this.height]);
    r.mesh('quad', model, { texture: this.texKey, lit: 0 });
    if (this.spec.surface === 'slab') {
      // A thin dark block behind the cross-section gives it depth.
      const back = v3.add(this.center, basisApply(this.basis, [0, -this.width * 0.046, 0])); // front face just behind the picture
      r.mesh('box', mat4.model(this.basis, v3.sub(back, fc.eye), [this.width, this.width * 0.08, this.height]), { color: [0.12, 0.15, 0.22, 1], lit: 0.6 });
    }
    // Frame, so a dark module still reads as an object in the world.
    const c = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [-0.5, -0.5]]
      .flatMap(([a, b]) => fc.rel(v3.add(this.center, basisApply(this.basis, [a * this.width, 0.001 * this.width, b * this.height]))));
    r.lines(Float32Array.from(c), fc.active ? [0.45, 0.65, 1, 0.9] : [0.55, 0.62, 0.8, 0.45]);
  }

  /** Same selection highlight as the 2D app. */
  drawHighlight(ctx, entity) {
    const loc = this.sim.locate(entity);
    if (!loc) return;
    const [sx, sy] = this.view2d.toScreen(loc.x, loc.y);
    const r = loc.px ?? Math.max(6, loc.r * this.view2d.scale + 4);
    ctx.strokeStyle = '#ffffff';
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
}

/** A circle facing the camera, as camera-relative line positions. */
export function facingRing(center, radius, eye, up, segments = 40) {
  const f = v3.norm(v3.sub(center, eye));
  let a = v3.cross(f, up);
  if (v3.len(a) < 1e-9) a = v3.cross(f, [1, 0, 0]);
  a = v3.norm(a);
  const b = v3.cross(a, f);
  const pts = circlePoints(v3.sub(center, eye), a, b, radius, segments);
  return Float32Array.from(pts);
}
