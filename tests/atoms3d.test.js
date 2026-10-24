// The Atoms & Molecules 3D mode (World TRD W-SM-5): thermostat, valence and a
// 3D FCC argon crystal; and the 2D model left bit-identical.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { AtomsSim, ELEMENTS, KELVIN_PER_UNIT } from '../src/sims/atoms.js';

const near = (a, b, r) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2 < r * r;

/** Each atom's nearest neighbours (within 1.3σ; 12 inside an FCC crystal). */
const neighbours = (sim) => sim.atoms.map((a) => sim.atoms.filter((b) => b !== a && near(a, b, 1.3)));

/** Fraction of the starting neighbour pairs still in contact (1.6σ): rotation-free crystal order. */
function kept(sim, N) {
  let k = 0, t = 0;
  sim.atoms.forEach((a, i) => { for (const b of N[i]) { t++; if (near(a, b, 1.6)) k++; } });
  return k / t;
}

const kelvin = (sim) => sim.temperatureUnits() * KELVIN_PER_UNIT;

test('W-SM-5: the 3D thermostat reaches the target temperature within ±15 %', () => {
  for (const [id, target] of [['water3d', 600], ['crystal3d', 30]]) {
    const sim = new AtomsSim();
    sim.loadScenario(id);
    assert.equal(sim.params.threeD, true);
    sim.params.targetT = target;
    for (let i = 0; i < 200; i++) sim.step();
    const T = kelvin(sim);
    assert.ok(Math.abs(T - target) <= 0.15 * target, `${id}: T=${T} K, target ${target} K`);
    // 3D equipartition: <KE> = 3/2 kT counts vz too.
    let ke = 0;
    for (const a of sim.atoms) ke += 0.5 * ELEMENTS[a.el].mass * (a.vx ** 2 + a.vy ** 2 + a.vz ** 2);
    assert.ok(Math.abs(sim.temperatureUnits() - (2 * ke) / (3 * sim.atoms.length)) < 1e-12);
  }
});

test('W-SM-5: bonds never exceed valence in 3D, and molecules form', () => {
  const sim = new AtomsSim();
  sim.loadScenario('water3d');
  for (let i = 0; i < 300; i++) {
    sim.step();
    if (i % 20 === 0) for (const a of sim.atoms) assert.ok(a.bonds.length <= ELEMENTS[a.el].valence, `${a.el} has ${a.bonds.length} bonds`);
  }
  const census = sim.moleculeCensus();
  assert.ok(census['H₂O'] > 0 && census['H₂'] > 0, JSON.stringify(census));
  // Atoms really use the depth, and stay inside the box.
  const zs = sim.atoms.map((a) => a.z);
  assert.ok(Math.max(...zs) - Math.min(...zs) > sim.D * 0.7);
  for (const a of sim.atoms) {
    assert.ok(a.x >= 0 && a.x <= sim.W && a.y >= 0 && a.y <= sim.H && a.z >= 0 && a.z <= sim.D);
    for (const b of a.bonds) assert.ok(b.bonds.includes(a), 'bonds are symmetric');
  }
});

test('W-SM-5: a 3D FCC argon crystal stays ordered below its melting point and melts above it', () => {
  const cold = new AtomsSim();
  cold.loadScenario('crystal3d');
  assert.equal(cold.atoms.length, 500);
  const N = neighbours(cold);
  // Interior atoms of a face-centred cubic lattice have 12 nearest neighbours.
  assert.equal(Math.max(...N.map((n) => n.length)), 12);
  for (let i = 0; i < 400; i++) cold.step();
  assert.ok(kelvin(cold) < 50, `cold T=${kelvin(cold)}`);
  assert.ok(kept(cold, N) > 0.97, `order at 40 K: ${kept(cold, N)}`);

  const hot = new AtomsSim();
  hot.loadScenario('crystal3d');
  hot.params.targetT = 200;
  const M = neighbours(hot);
  for (let i = 0; i < 400; i++) hot.step();
  assert.ok(kept(hot, M) < 0.6, `order at 200 K: ${kept(hot, M)}`);
});

test('the 3D neighbour list matches a direct sum of the forces', () => {
  const sim = new AtomsSim();
  sim.loadScenario('crystal3d');
  sim.params.targetT = 300;
  for (let i = 0; i < 20; i++) sim.step();
  sim.computeForces3();
  const list = sim.atoms.map((a) => [a.fx, a.fy, a.fz]);
  // Direct O(N²) Lennard-Jones sum (argon only, no bonds or charges).
  const e = ELEMENTS.Ar, rc2 = (2.5 * e.sigma) ** 2;
  sim.atoms.forEach((a, i) => {
    const f = [0, 0, 0];
    for (const b of sim.atoms) {
      if (b === a) continue;
      const d = [b.x - a.x, b.y - a.y, b.z - a.z], r2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2;
      if (r2 > rc2) continue;
      const s6 = (e.sigma ** 2 / r2) ** 3, k = Math.max(-2000, Math.min(2000, (24 * e.eps * (2 * s6 * s6 - s6)) / r2));
      for (let q = 0; q < 3; q++) f[q] -= k * d[q];
    }
    for (let q = 0; q < 3; q++) assert.ok(Math.abs(f[q] - list[i][q]) < 1e-9 * (1 + Math.abs(f[q])), `atom ${i} axis ${q}`);
  });
});

test('3D saves keep z and vz; leaving 3D flattens and entering lifts onto the middle plane', () => {
  const sim = new AtomsSim();
  sim.loadScenario('water3d');
  for (let i = 0; i < 30; i++) sim.step();
  const copy = new AtomsSim();
  copy.deserialize(JSON.parse(JSON.stringify(sim.serialize())));
  assert.equal(copy.params.threeD, true);
  assert.deepEqual(copy.atoms.map((a) => [a.x, a.y, a.z, a.vz, a.bonds.length]), sim.atoms.map((a) => [a.x, a.y, a.z, a.vz, a.bonds.length]));
  sim.step();
  copy.step();
  assert.deepEqual(copy.atoms.map((a) => a.z), sim.atoms.map((a) => a.z), 'restored state evolves identically');

  sim.setParam('threeD', false);
  assert.ok(sim.atoms.every((a) => a.z === 0 && a.vz === 0));
  sim.step();
  assert.ok(sim.atoms.every((a) => a.z === 0 && Number.isFinite(a.x)));
  sim.setParam('threeD', true);
  assert.ok(sim.atoms.every((a) => Math.abs(a.z - sim.D / 2) <= 0.3));
  sim.step();
  assert.ok(sim.atoms.every((a) => Number.isFinite(a.z) && Number.isFinite(a.vz)));
});

test('3D tools: Add goes on the middle plane, methane is a tetrahedron, Inspect takes the front atom', () => {
  const sim = new AtomsSim();
  sim.loadScenario('water3d');
  sim.atoms = [];
  const c = sim.add('CH4', 30, 20);
  assert.equal(c.z, sim.D / 2);
  const d = c.bonds.map((h) => Math.hypot(h.x - c.x, h.y - c.y, h.z - c.z));
  for (const x of d) assert.ok(Math.abs(x - d[0]) < 1e-12);
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const p = c.bonds[i], q = c.bonds[j];
    const cos = ((p.x - c.x) * (q.x - c.x) + (p.y - c.y) * (q.y - c.y) + (p.z - c.z) * (q.z - c.z)) / (d[0] * d[0]);
    assert.ok(Math.abs(cos + 1 / 3) < 1e-9, 'tetrahedral angle 109.5°');
  }
  const back = sim.add('Ar', 10, 10), front = sim.add('Ar', 10, 10);
  back.z = 2; front.z = 14;
  assert.equal(sim.pick(10, 10, 0.5), front);
  assert.equal(sim.describe(front).fields.find((f) => f.key === 'z').value, 14);
  sim.setProperty(front, 'z', 99);
  assert.ok(front.z <= sim.D);
  sim.move(front, 12, 11);
  assert.equal(front.z, sim.D - 0.3, 'Move keeps the depth');
});

// Fingerprints of every 2D scenario after 20 frames, recorded before the 3D mode existed.
const GOLDEN = {
  gas: 'e51b5c4b3112cd97',
  condense: 'cf50b2be62df537f',
  salt: '749837428cb90d5c',
  water: '3a3b56e54d319c3b',
  organic: 'e83b9ade6b39d2ce',
  mixture: '4d13dd680edbea52',
  kit: '39a150c39e7e71af',
};

test('with the 3D mode off, every 2D scenario evolves bit-identically to before', () => {
  const sim = new AtomsSim();
  const f = new Float64Array(1);
  for (const [id, want] of Object.entries(GOLDEN)) {
    sim.loadScenario(id);
    assert.equal(sim.params.threeD, false, id);
    for (let i = 0; i < 20; i++) sim.step(1 / 60);
    const h = createHash('sha256');
    for (const a of sim.atoms) for (const v of [a.x, a.y, a.vx, a.vy, a.bonds.length]) { f[0] = v; h.update(new Uint8Array(f.buffer)); }
    assert.equal(h.digest('hex').slice(0, 16), want, id);
    assert.ok(sim.atoms.every((a) => a.z === 0 && a.vz === 0), `${id} stayed in the plane`);
  }
});
