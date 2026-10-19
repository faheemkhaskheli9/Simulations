// Orbit camera that lives in one place at a time and hands over to parent or
// child places as it zooms (ADR-007). State is a target point and an eye offset
// in the current place's units; the up vector eases towards the place's +y.
import { v3, rotateAxis } from './math3d.js';

export const FOVY = (50 * Math.PI) / 180;
const MIN_POLAR = 0.05; // rad, keeps the camera off the poles

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class Camera3D {
  constructor(tree, place = tree.root) {
    this.tree = tree;
    this.place = place;
    this.target = [...place.view.target];
    this.offset = [...place.view.offset];
    this.up = [0, 1, 0];
    this.flight = null;
    this.onPlaceChange = null; // (place, previous) => void
  }

  get distance() {
    return v3.len(this.offset);
  }

  eye() {
    return v3.add(this.target, this.offset);
  }

  forward() {
    return v3.norm(v3.scale(this.offset, -1));
  }

  /** Width of one CSS pixel at the target distance, in local units. */
  pixelSize(viewportHeight, distance = this.distance) {
    return (2 * distance * Math.tan(FOVY / 2)) / Math.max(1, viewportHeight);
  }

  /** Orbit by screen-pixel deltas: horizontal turns around up, vertical tilts. */
  orbit(dx, dy) {
    const up = [0, 1, 0];
    let off = rotateAxis(this.offset, up, -dx * 0.005);
    const right = v3.norm(v3.cross(up, off));
    if (v3.len(right) > 0) {
      const tilted = rotateAxis(off, right, -dy * 0.005);
      const polar = Math.acos(Math.max(-1, Math.min(1, v3.dot(v3.norm(tilted), up))));
      if (polar > MIN_POLAR && polar < Math.PI - MIN_POLAR) off = tilted;
    }
    this.offset = off;
  }

  /** Pan the target by screen-pixel deltas. */
  pan(dx, dy, viewportHeight) {
    const s = this.pixelSize(viewportHeight);
    const f = this.forward();
    const right = v3.norm(v3.cross(f, this.up));
    const up = v3.cross(right, f);
    this.target = v3.add(this.target, v3.add(v3.scale(right, -dx * s), v3.scale(up, dy * s)));
  }

  /**
   * Multiply the distance by `factor` (< 1 zooms in). When zooming in towards
   * `point` (local units), the target moves towards it so the point stays put.
   */
  zoom(factor, point = null) {
    const d = this.distance;
    const maxD = this.place.parent ? Infinity : this.place.exitAt * this.place.size;
    const nd = Math.min(maxD, Math.max(this.place.minDistance, d * factor));
    const f = nd / d;
    if (point && f < 1) this.target = v3.lerp(this.target, point, 1 - f);
    this.offset = v3.scale(this.offset, f);
  }

  /** Move into another place, keeping the eye and target fixed in space. */
  moveTo(place) {
    if (place === this.place) return;
    const from = this.place;
    const eye = this.tree.convert(this.eye(), from, place);
    this.target = this.tree.convert(this.target, from, place);
    this.offset = v3.sub(eye, this.target);
    this.up = v3.norm(this.tree.convertVec(this.up, from, place));
    this.place = place;
    this.onPlaceChange?.(place, from);
  }

  /**
   * Hand over to a child or the parent when the distance crosses a threshold.
   * enterAt (in the parent) is smaller than exitAt (in the child), so a small
   * zoom back and forth never flickers between places. Returns true on change.
   */
  handOver() {
    const p = this.place, d = this.distance;
    if (p.parent && (d > p.exitAt * p.size || v3.len(this.target) > p.exitAt * p.size)) {
      this.moveTo(p.parent);
      return true;
    }
    for (const c of p.children) {
      const r = c.size * c.scale;
      if (d < c.enterAt * r && v3.dist(this.target, c.position) < 1.5 * r) {
        this.moveTo(c);
        return true;
      }
    }
    return false;
  }

  /** Ease the up vector towards the place's +y. */
  settleUp(dt) {
    const k = Math.min(1, dt * 4);
    this.up = v3.norm(v3.lerp(this.up, [0, 1, 0], k));
  }

  /**
   * Fly to a view in another place: the distance follows an arc in log space
   * and the target settles early, while the camera is still far away, so the
   * interpolation never mixes very large and very small coordinates.
   */
  flyTo(place, target, offset, duration = 2.5) {
    const startEyeDist = this.distance * this.place.unit.metres;
    const endDist = v3.len(offset) * place.unit.metres;
    const top = this.tree.common(this.place, place);
    const a = this.tree.convert(this.target, this.place, top), b = this.tree.convert(target, place, top);
    const sep = v3.dist(a, b) * top.unit.metres;
    this.flight = {
      place, target: [...target], offset: [...offset], t: 0, duration: Math.max(0.01, duration),
      startPlace: this.place, startTarget: [...this.target], startDir: v3.norm(this.offset),
      logA: Math.log(startEyeDist), logB: Math.log(endDist),
      logPeak: Math.log(Math.max(startEyeDist, endDist, sep * 1.2)),
    };
  }

  get flying() {
    return !!this.flight;
  }

  /** Advance a flight; returns true while flying. */
  update(dt) {
    const f = this.flight;
    if (!f) return false;
    f.t = Math.min(1, f.t + dt / f.duration);
    const t = ease(f.t);
    // Distance: rise to the peak, then descend (log space).
    const logD = t < 0.5
      ? f.logA + (f.logPeak - f.logA) * Math.sin(t * Math.PI)
      : f.logB + (f.logPeak - f.logB) * Math.sin(t * Math.PI);
    const dMetres = Math.exp(t >= 1 ? f.logB : logD);
    // Target and direction settle by 60 % of the flight.
    const s = Math.min(1, t / 0.6);
    // Work in the higher of the two places until the end so coordinates stay precise.
    const work = f.t >= 1 ? f.place : this.tree.common(f.startPlace, f.place);
    if (this.place !== work) this.moveTo(work);
    const from = this.tree.convert(f.startTarget, f.startPlace, work);
    const to = this.tree.convert(f.target, f.place, work);
    const dirA = v3.norm(this.tree.convertVec(f.startDir, f.startPlace, work));
    const dirB = v3.norm(this.tree.convertVec(f.offset, f.place, work));
    this.target = v3.lerp(from, to, s);
    let dir = v3.norm(v3.lerp(dirA, dirB, s));
    if (v3.len(dir) === 0) dir = dirB;
    this.offset = v3.scale(dir, dMetres / work.unit.metres);
    if (f.t >= 1) {
      this.moveTo(f.place);
      this.target = [...f.target];
      this.offset = [...f.offset];
      this.flight = null;
      return false;
    }
    return true;
  }

  /** Jump without animation (reduced motion). */
  jumpTo(place, target, offset) {
    this.flight = null;
    this.moveTo(place);
    this.target = [...target];
    this.offset = [...offset];
    this.up = [0, 1, 0];
  }

  serialize() {
    return { place: this.place.id, target: [...this.target], offset: [...this.offset] };
  }

  restore(data) {
    const place = this.tree.get(data?.place);
    if (!place || !v3.finite(data.target) || !v3.finite(data.offset) || v3.len(data.offset) <= 0) return false;
    this.jumpTo(place, data.target, data.offset);
    return true;
  }
}
