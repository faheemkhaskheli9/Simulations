// The native Atoms & Molecules box (World TRD WFR-24): atoms as ball-and-stick
// in the module's 3D box, tools on the middle plane.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIMULATIONS } from '../src/sims/index.js';
import { World } from '../src/world/world.js';
import { MoleculesSite } from '../src/world/native/molecules.js';
import { ELEMENTS } from '../src/sims/atoms.js';
import { v3 } from '../src/world/engine/math3d.js';

function site() {
  const world = new World(SIMULATIONS);
  const s = world.sites.get('atoms');
  assert.ok(s instanceof MoleculesSite, 'the sample chamber is drawn as a native box');
  s.ensure();
  assert.equal(s.sim.params.threeD, true, 'the chamber runs the 3D mode');
  return s;
}

test('the box maps module x, y (down) and z (towards the camera) into the place', () => {
  const s = site(), sim = s.sim;
  assert.ok(Math.abs(s.height - (s.width * sim.H) / sim.W) < 1e-12 && s.depth > 0);
  const c = s.placeAt(sim.W / 2, sim.H / 2, sim.D / 2);
  assert.ok(v3.dist(c, s.center) < 1e-12);
  const p = s.placeAt(sim.W, sim.H, sim.D);
  assert.ok(p[0] > c[0] && p[1] < c[1] && p[2] > c[2], 'x right, y down, z near');
  // A ray straight at the middle plane hits the module point it aims at.
  const target = s.placeAt(12, 30), h = s.hit({ o: v3.add(target, [0, 0, 5]), d: [0, 0, -1] });
  assert.ok(h.inside && Math.abs(h.x - 12) < 1e-9 && Math.abs(h.y - 30) < 1e-9);
  assert.ok(Math.abs(h.mpp * s.scale - 1) < 1e-12);
  assert.equal(s.hit({ o: v3.add(target, [0, 0, 5]), d: [1, 0, 0] }), null, 'a ray along the plane misses');
  assert.equal(s.hit({ o: v3.add(s.placeAt(-5, 0), [0, 0, 5]), d: [0, 0, -1] }).inside, false);
});

test('atoms are balls at their depth; bonded atoms are smaller and joined by sticks', () => {
  const s = site(), sim = s.sim, eye = [1, 2, 3];
  sim.atoms = [];
  const o = sim.add('H2O', 20, 20), free = sim.add('Ar', 40, 10);
  free.z = 3;
  const n = s.atomSpheres(eye);
  assert.equal(n, 4);
  const at = (a) => sim.atoms.indexOf(a) * 8;
  const pf = s.placeAt(free.x, free.y, free.z);
  for (let q = 0; q < 3; q++) assert.ok(Math.abs(s.balls[at(free) + q] - (pf[q] - eye[q])) < 1e-5);
  assert.ok(Math.abs(s.balls[at(free) + 3] - 0.45 * ELEMENTS.Ar.sigma * s.scale) < 1e-6);
  assert.ok(s.balls[at(o) + 3] < 0.45 * ELEMENTS.O.sigma * s.scale, 'bonded oxygen is a smaller ball');
  // Two O–H bonds → two six-sided sticks.
  assert.equal(s.bondPairs().length, 2);
  const m = s.stickMesh();
  assert.equal(m.positions.length / 3, 2 * 12);
  assert.equal(m.indices.length, 2 * 36);
  assert.ok(Math.max(...m.indices) < m.positions.length / 3);
  // Every stick vertex lies on a cylinder around its bond.
  const [h1] = o.bonds, p = v3.sub(s.placeAt(o.x, o.y, o.z), s.center), q = v3.sub(s.placeAt(h1.x, h1.y, h1.z), s.center);
  const axis = v3.norm(v3.sub(q, p)), want = 0.09 * s.scale;
  for (let k = 0; k < 12; k++) {
    const v = Array.from(m.positions.subarray(k * 3, k * 3 + 3)), d = v3.sub(v, p);
    const off = v3.sub(d, v3.scale(axis, v3.dot(d, axis)));
    assert.ok(Math.abs(v3.len(off) - want) < 1e-5);
  }
  // Without drawn bonds, every atom is a full-size ball.
  sim.params.showBonds = false;
  s.atomSpheres(eye);
  assert.ok(Math.abs(s.balls[at(o) + 3] - 0.45 * ELEMENTS.O.sigma * s.scale) < 1e-6);
});

test('in the 2D mode the atoms sit on the middle plane; the frame has twelve edges', () => {
  const s = site(), sim = s.sim;
  sim.setParam('threeD', false);
  s.atomSpheres([0, 0, 0]);
  for (let k = 0; k < sim.atoms.length; k++) assert.ok(Math.abs(s.balls[k * 8 + 2] - s.center[2]) < 1e-5);
  assert.equal(s.frameLines([0, 0, 0]).length, 12 * 2 * 3);
});

test('the tools act through the contract at the module point under the cursor', () => {
  const s = site(), sim = s.sim;
  const h = s.hit({ o: v3.add(s.placeAt(30, 20), [0, 0, 5]), d: [0, 0, -1] });
  const before = sim.atoms.length;
  const made = sim.add('Ne', h.x, h.y);
  assert.equal(sim.atoms.length, before + 1);
  assert.ok(Math.abs(made.x - 30) < 1e-9 && made.z === sim.D / 2);
  assert.equal(sim.pick(h.x, h.y, 0.3), made);
  for (let i = 0; i < 5; i++) sim.step();
  assert.ok(sim.atoms.every((a) => Number.isFinite(a.x + a.y + a.z)));
});
