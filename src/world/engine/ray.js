// Ray casting for picking. A ray is { o: [x, y, z], d: unit [x, y, z] }.
import { v3 } from './math3d.js';

/**
 * Ray through screen point (sx, sy) for a camera with eye, forward, up and
 * vertical field of view, on a viewport of width × height CSS pixels.
 */
export function screenRay(eye, forward, up, fovy, width, height, sx, sy) {
  const f = v3.norm(forward);
  const r = v3.norm(v3.cross(f, up));
  const u = v3.cross(r, f);
  const t = Math.tan(fovy / 2);
  const nx = ((2 * sx) / width - 1) * t * (width / height);
  const ny = (1 - (2 * sy) / height) * t;
  return { o: eye, d: v3.norm(v3.add(f, v3.add(v3.scale(r, nx), v3.scale(u, ny)))) };
}

/** Distance along the ray to the plane through p with normal n, or null. */
export function rayPlane(ray, p, n) {
  const denom = v3.dot(ray.d, n);
  if (Math.abs(denom) < 1e-12) return null;
  const t = v3.dot(v3.sub(p, ray.o), n) / denom;
  return t >= 0 ? t : null;
}

/** Nearest non-negative distance to a sphere, or null. */
export function raySphere(ray, c, r) {
  const oc = v3.sub(ray.o, c);
  const b = v3.dot(oc, ray.d);
  const disc = b * b - (v3.dot(oc, oc) - r * r);
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t0 = -b - s, t1 = -b + s;
  if (t0 >= 0) return t0;
  return t1 >= 0 ? t1 : null;
}

/** Distance to an axis-aligned box {min, max}, or null (slab method). */
export function rayAABB(ray, box) {
  let tmin = -Infinity, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(ray.d[i]) < 1e-15) {
      if (ray.o[i] < box.min[i] || ray.o[i] > box.max[i]) return null;
      continue;
    }
    let a = (box.min[i] - ray.o[i]) / ray.d[i], b = (box.max[i] - ray.o[i]) / ray.d[i];
    if (a > b) [a, b] = [b, a];
    tmin = Math.max(tmin, a);
    tmax = Math.min(tmax, b);
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return tmin >= 0 ? tmin : tmax;
}

/** Nearest sphere hit among [{ c, r, item }]; returns { t, item } or null. */
export function rayNearestSphere(ray, spheres) {
  let best = null;
  for (const s of spheres) {
    const t = raySphere(ray, s.c, s.r);
    if (t !== null && (!best || t < best.t)) best = { t, item: s.item };
  }
  return best;
}

export const rayAt = (ray, t) => v3.add(ray.o, v3.scale(ray.d, t));
