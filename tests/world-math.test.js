// 3D maths, rays and meshes of the world engine (World TRD W-FT-8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { v3, mat4, tangentBasis, basisApply, basisApplyT, rotateAxis, yawPitch, offsetFromYawPitch } from '../src/world/engine/math3d.js';
import { screenRay, rayPlane, raySphere, rayAABB, rayNearestSphere, rayAt } from '../src/world/engine/ray.js';
import { sphere, quad, box, disc, circlePoints } from '../src/world/engine/meshes.js';
import { hexColor } from '../src/world/engine/colors.js';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const closeV = (a, b, tol) => a.forEach((x, i) => close(x, b[i], tol));

test('vector helpers', () => {
  closeV(v3.cross([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
  close(v3.dot([1, 2, 3], [4, 5, 6]), 32);
  close(v3.len(v3.norm([3, 4, 12])), 1);
  closeV(rotateAxis([1, 0, 0], [0, 1, 0], Math.PI / 2), [0, 0, -1]);
  assert.ok(v3.finite([1, 2, 3]) && !v3.finite([1, NaN, 3]) && !v3.finite([1, 2]));
});

test('tangent basis is orthonormal and points up, east and south', () => {
  for (const [lat, lon] of [[0, 0], [34, -10], [-60, 120], [89, 45]]) {
    const [e, u, s] = tangentBasis(lat, lon);
    for (const a of [e, u, s]) close(v3.len(a), 1);
    close(v3.dot(e, u), 0); close(v3.dot(e, s), 0); close(v3.dot(u, s), 0);
    close(Math.asin(u[1]) * 180 / Math.PI, lat, 1e-9);
    assert.ok(e[1] === 0, 'east is horizontal');
    const p = [0.3, -1.2, 2.5];
    closeV(basisApplyT([e, u, s], basisApply([e, u, s], p)), p);
  }
});

test('model and projection matrices', () => {
  const m = mat4.model([[0, 0, -1], [0, 1, 0], [1, 0, 0]], [10, 20, 30], [2, 3, 4]);
  closeV(mat4.transform(m, [1, 1, 1]).slice(0, 3), [10 + 4, 20 + 3, 30 - 2]);
  const p = mat4.perspective(Math.PI / 2, 1, 1, 100);
  const near = mat4.transform(p, [0, 0, -1]), far = mat4.transform(p, [0, 0, -100]);
  close(near[2] / near[3], -1);
  close(far[2] / far[3], 1);
  const v = mat4.lookDir([0, 0, -1], [0, 1, 0]);
  closeV(mat4.transform(v, [1, 2, 3]).slice(0, 3), [1, 2, 3]);
});

test('yaw/pitch round-trip', () => {
  for (const off of [[3, 4, 5], [-2, 0.5, -7], [0, 10, 0.001]]) {
    const { distance, yaw, pitch } = yawPitch(off);
    closeV(offsetFromYawPitch(distance, yaw, pitch), off, 1e-9);
  }
});

test('ray intersections agree with reference values to 1e-9', () => {
  const ray = { o: [0, 5, 0], d: [0, -1, 0] };
  close(rayPlane(ray, [0, 0, 0], [0, 1, 0]), 5);
  assert.equal(rayPlane({ o: [0, 5, 0], d: [1, 0, 0] }, [0, 0, 0], [0, 1, 0]), null);
  assert.equal(rayPlane({ o: [0, 5, 0], d: [0, 1, 0] }, [0, 0, 0], [0, 1, 0]), null, 'plane behind');
  close(raySphere({ o: [0, 0, -10], d: [0, 0, 1] }, [0, 0, 0], 2), 8);
  close(raySphere({ o: [0, 0, 0], d: [0, 0, 1] }, [0, 0, 0], 2), 2, 1e-12);
  const oblique = { o: [1, 0, -10], d: [0, 0, 1] };
  close(raySphere(oblique, [0, 0, 0], 2), 10 - Math.sqrt(3));
  assert.equal(raySphere({ o: [3, 0, -10], d: [0, 0, 1] }, [0, 0, 0], 2), null);
  close(rayAABB({ o: [-5, 0.5, 0.5], d: [1, 0, 0] }, { min: [0, 0, 0], max: [1, 1, 1] }), 5);
  close(rayAABB({ o: [0.5, 0.5, 0.5], d: [0, 0, 1] }, { min: [0, 0, 0], max: [1, 1, 1] }), 0.5);
  assert.equal(rayAABB({ o: [-5, 2, 0.5], d: [1, 0, 0] }, { min: [0, 0, 0], max: [1, 1, 1] }), null);
  const hit = rayNearestSphere({ o: [0, 0, -10], d: [0, 0, 1] }, [{ c: [0, 0, 5], r: 1, item: 'far' }, { c: [0, 0, 0], r: 1, item: 'near' }]);
  assert.equal(hit.item, 'near');
  close(hit.t, 9);
  closeV(rayAt(ray, 2), [0, 3, 0]);
});

test('the screen centre ray points along the view direction', () => {
  const r = screenRay([1, 2, 3], [0, 0, -1], [0, 1, 0], Math.PI / 3, 800, 600, 400, 300);
  closeV(r.d, [0, 0, -1]);
  const right = screenRay([0, 0, 0], [0, 0, -1], [0, 1, 0], Math.PI / 3, 800, 600, 800, 300);
  assert.ok(right.d[0] > 0 && Math.abs(right.d[1]) < 1e-12);
});

test('meshes are well formed', () => {
  for (const [name, m] of Object.entries({ sphere: sphere(8, 16), quad: quad(), box: box(), disc: disc(12) })) {
    const n = m.positions.length / 3;
    assert.equal(m.normals.length, n * 3, name);
    assert.equal(m.uvs.length, n * 2, name);
    assert.ok(m.indices.every((i) => i < n), `${name} indices in range`);
    for (let i = 0; i < n; i++) close(Math.hypot(m.normals[i * 3], m.normals[i * 3 + 1], m.normals[i * 3 + 2]), 1, 1e-6);
  }
  const pts = circlePoints([0, 0, 0], [1, 0, 0], [0, 1, 0], 2, 8);
  close(Math.hypot(pts[3], pts[4], pts[5]), 2);
});

test('CSS colours parse', () => {
  assert.deepEqual(hexColor('#ff0000'), [1, 0, 0, 1]);
  assert.deepEqual(hexColor('#0f0', 0.5), [0, 1, 0, 0.5]);
  assert.deepEqual(hexColor('rgb(0, 0, 255)'), [0, 0, 1, 1]);
});
