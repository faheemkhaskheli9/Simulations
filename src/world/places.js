// The world is a tree of places, one per scale. Each place has its own unit and
// a pose inside its parent, so coordinates stay small at every scale (ADR-007).
import { v3, IDENTITY_BASIS, basisApply, basisApplyT, tangentBasis, sphericalToCartesian } from './engine/math3d.js';

export class Place {
  constructor(spec, parent = null) {
    this.id = spec.id;
    this.label = spec.label ?? spec.id;
    this.description = spec.description ?? '';
    this.parent = parent;
    this.unit = spec.unit; // { name, metres }
    this.size = spec.size; // characteristic radius, local units
    this.lat = spec.lat ?? null;
    if (spec.lat !== undefined) {
      // Placed on the surface of a sphere of radius spec.radius (parent units).
      this.position = sphericalToCartesian(spec.lat, spec.lon ?? 0, spec.radius ?? parent.occluder ?? 0);
      this.basis = tangentBasis(spec.lat, spec.lon ?? 0);
    } else {
      this.position = spec.position ? [...spec.position] : [0, 0, 0];
      this.basis = spec.basis ?? IDENTITY_BASIS;
    }
    this.follow = spec.follow ?? null; // { site, body } keeps the place on a moving body
    this.enterAt = spec.enterAt ?? 3; // enter when camera distance < enterAt · size (parent units)
    this.exitAt = spec.exitAt ?? 8; // leave when camera distance > exitAt · size (local units)
    this.minDistance = spec.minDistance ?? null; // set by PlaceTree once children are known
    this.occluder = spec.occluder ?? 0; // radius of an opaque sphere at the origin (e.g. a planet)
    this.ancestors = spec.ancestors ?? 2; // how many ancestor places draw behind this one
    this.sky = spec.sky ?? '#02030a';
    this.light = spec.light ?? null; // direction towards the light, local; null = ambient only
    this.decor = spec.decor ?? [];
    this.view = spec.view ?? { target: [0, 0, 0], offset: [0, this.size * 0.9, this.size * 1.6] };
    this.primary = spec.primary ?? null; // site activated when the camera arrives
    this.children = [];
    this.siteSpecs = spec.sites ?? [];
    if (parent) parent.children.push(this);
  }

  /** Radius of everything that belongs to this place (local units). */
  get extent() {
    return this.exitAt * this.size;
  }

  /** Parent units per local unit. */
  get scale() {
    return this.parent ? this.unit.metres / this.parent.unit.metres : 1;
  }

  toParent(p) {
    return v3.add(this.position, basisApply(this.basis, v3.scale(p, this.scale)));
  }

  fromParent(p) {
    return v3.scale(basisApplyT(this.basis, v3.sub(p, this.position)), 1 / this.scale);
  }

  vecToParent(v) {
    return basisApply(this.basis, v3.scale(v, this.scale));
  }

  vecFromParent(v) {
    return v3.scale(basisApplyT(this.basis, v), 1 / this.scale);
  }

  /** Root → this. */
  path() {
    const out = [];
    for (let p = this; p; p = p.parent) out.unshift(p);
    return out;
  }

  depth() {
    return this.path().length - 1;
  }
}

export class PlaceTree {
  constructor(specs) {
    this.byId = new Map();
    for (const s of specs) {
      if (this.byId.has(s.id)) throw new Error(`Duplicate place id ${s.id}`);
      const parent = s.parent ? this.byId.get(s.parent) : null;
      if (s.parent && !parent) throw new Error(`Place ${s.id}: parent ${s.parent} must be listed first`);
      this.byId.set(s.id, new Place(s, parent));
    }
    this.root = [...this.byId.values()].find((p) => !p.parent);
    // The camera must be able to get close enough to enter every child.
    for (const p of this.byId.values()) {
      if (p.minDistance !== null) continue;
      const enter = p.children.map((c) => c.enterAt * c.size * c.scale * 0.3);
      p.minDistance = Math.min(p.size * 1e-3, ...enter);
    }
  }

  get(id) {
    return this.byId.get(id);
  }

  get all() {
    return [...this.byId.values()];
  }

  /** Lowest common ancestor. */
  common(a, b) {
    const pa = new Set(a.path());
    for (let p = b; p; p = p.parent) if (pa.has(p)) return p;
    return this.root;
  }

  /** Convert a point from place `from` to place `to` (float64 throughout). */
  convert(p, from, to) {
    if (from === to) return [...p];
    const top = this.common(from, to);
    let q = p;
    for (let x = from; x !== top; x = x.parent) q = x.toParent(q);
    const down = [];
    for (let x = to; x !== top; x = x.parent) down.push(x);
    for (let i = down.length - 1; i >= 0; i--) q = down[i].fromParent(q);
    return q;
  }

  /** Convert a direction/displacement (no translation). */
  convertVec(v, from, to) {
    if (from === to) return [...v];
    const top = this.common(from, to);
    let q = v;
    for (let x = from; x !== top; x = x.parent) q = x.vecToParent(q);
    const down = [];
    for (let x = to; x !== top; x = x.parent) down.push(x);
    for (let i = down.length - 1; i >= 0; i--) q = down[i].vecFromParent(q);
    return q;
  }

  /** Metres per local unit of `place`. */
  metres(place) {
    return place.unit.metres;
  }
}

const UNITS = [
  ['ly', 9.4607e15], ['AU', 1.495978707e11], ['km', 1e3], ['m', 1], ['mm', 1e-3], ['µm', 1e-6], ['nm', 1e-9], ['Å', 1e-10], ['pm', 1e-12],
];

/** Human-readable length, choosing the unit by magnitude: "3.2 AU", "40 km", "18 nm". */
export function formatLength(metres) {
  if (!Number.isFinite(metres) || metres <= 0) return '—';
  for (const [name, m] of UNITS) {
    const v = metres / m;
    if (v >= 1 || name === 'pm') {
      if (name === 'ly' && v >= 1e3) return `${Math.round(v).toLocaleString('en')} ly`;
      if (name === 'AU' && v >= 2e4) continue;
      return `${v >= 100 ? Math.round(v) : +v.toPrecision(2)} ${name}`;
    }
  }
  return '—';
}
