// The native Cell sphere (World TRD W-FT-28): the membrane as a sphere of the
// module's radius, molecules at stable depths that agree with inside/outside,
// tools on the cell's equator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIMULATIONS } from '../src/sims/index.js';
import { World } from '../src/world/world.js';
import { MembraneSite } from '../src/world/native/membrane.js';
import { CENTER, R0 } from '../src/sims/cell.js';
import { v3 } from '../src/world/engine/math3d.js';

function site() {
  const world = new World(SIMULATIONS);
  const s = world.sites.get('cell');
  assert.ok(s instanceof MembraneSite, 'the cell is drawn as a native sphere');
  s.ensure();
  return s;
}

test('the cell maps module x, y (down) into the place; rays hit the equator at the aimed point', () => {
  const s = site(), sim = s.sim;
  assert.ok(v3.dist(s.placeAt(...CENTER), s.center) < 1e-12);
  const p = s.placeAt(CENTER[0] + 5, CENTER[1] + 5, 2);
  assert.ok(p[0] > s.center[0] && p[1] < s.center[1] && p[2] > s.center[2], 'x right, y down, z near');
  const target = s.placeAt(12, 30), h = s.hit({ o: v3.add(target, [3, 4, 20]), d: v3.norm([-3, -4, -20]) });
  assert.ok(h.inside && Math.abs(h.x - 12) < 1e-9 && Math.abs(h.y - 30) < 1e-9);
  assert.ok(Math.abs(h.mpp * s.scale - 1) < 1e-12);
  assert.equal(s.hit({ o: v3.add(target, [0, 0, 5]), d: [1, 0, 0] }), null, 'a ray along the plane misses');
  assert.equal(s.hit({ o: v3.add(s.placeAt(-5, 0), [0, 0, 5]), d: [0, 0, -1] }).inside, false);
  assert.ok(sim.particles.length > 100);
});

test('a molecule is inside the membrane sphere exactly when the module counts it inside', () => {
  const s = site(), sim = s.sim, c = s.center, R = sim.R * s.scale;
  let inside = 0;
  for (const p of sim.particles) {
    const d = v3.dist(s.entityAt(p), c);
    if (sim.isInside(p.x, p.y)) { inside++; assert.ok(d < R, `#${p.id} inside`); } else assert.ok(d >= R - 1e-9, `#${p.id} outside`);
  }
  assert.ok(inside > 20, 'some molecules are inside');
  // Depths are stable from frame to frame, and spread to both sides of the equator.
  const zs = sim.particles.map((p) => s.entityAt(p)[2] - c[2]);
  assert.deepEqual(sim.particles.map((p) => s.entityAt(p)[2] - c[2]), zs);
  assert.ok(zs.some((z) => z > 1) && zs.some((z) => z < -1));
  // Depth goes to 0 at the membrane from both sides, so a crossing does not jump.
  const id = sim.particles[0].id, edge = CENTER[0] + sim.R;
  assert.ok(Math.abs(s.depthOf(id, edge - 1e-6, CENTER[1])) < 0.01 && Math.abs(s.depthOf(id, edge + 1e-6, CENTER[1])) < 0.01);
});

test('molecules and proteins are balls; proteins sit on the equator; mitochondria are inside', () => {
  const s = site(), sim = s.sim;
  const n = s.moleculeSpheres([0, 0, 0]);
  assert.equal(n, sim.particles.length + sim.proteins.length);
  for (const p of sim.proteins) {
    const q = s.entityAt(p);
    assert.ok(Math.abs(q[2] - s.center[2]) < 1e-12 && Math.abs(v3.dist(q, s.center) - sim.R * s.scale) < 1e-9);
  }
  for (const m of sim.mitos) assert.ok(v3.dist(s.entityAt(m), s.center) < sim.R * s.scale);
  sim.setParam('showProteins', false);
  assert.equal(s.moleculeSpheres([0, 0, 0]), sim.particles.length, 'hidden proteins are not drawn');
});

test('the sphere follows the module: it swells with the cell and turns orange when stretched', () => {
  const s = site(), sim = s.sim;
  const before = s.outlines([0, 0, 0]).equator;
  assert.ok(Math.abs(Math.hypot(before[0], before[1]) - sim.R * s.scale) < 1e-5);
  assert.deepEqual(s.membraneColor().slice(0, 3), [0x8f / 255, 0xb4 / 255, 1]);
  sim.resize(R0 * 1.3);
  const after = s.outlines([0, 0, 0]).equator;
  assert.ok(Math.abs(Math.hypot(after[0], after[1]) - R0 * 1.3 * s.scale) < 1e-5);
  assert.deepEqual(s.membraneColor().slice(0, 3), [1, 0x8a / 255, 0x5c / 255]);
});

test('the tools act through the contract at the module point under the cursor', () => {
  const s = site(), sim = s.sim;
  const h = s.hit({ o: v3.add(s.placeAt(5, 5), [0, 0, 5]), d: [0, 0, -1] });
  const before = sim.particles.length;
  sim.add('o2', h.x, h.y);
  assert.equal(sim.particles.length, before + 10);
  const centre = s.hit({ o: v3.add(s.center, [0, 0, 5]), d: [0, 0, -1] });
  assert.ok(Math.abs(centre.x - CENTER[0]) < 1e-9 && Math.abs(centre.y - CENTER[1]) < 1e-9);
  for (let i = 0; i < 5; i++) sim.step(1 / 30);
  assert.ok(sim.particles.every((p) => v3.finite(s.entityAt(p))));
});
