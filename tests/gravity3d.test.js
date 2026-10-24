import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Octree } from '../src/core/octree.js';
import { Random } from '../src/core/random.js';
import { GravitySim, orbitalElements, tilt, G_SI_UNITS } from '../src/sims/gravity.js';

const DEG = Math.PI / 180;

/** A 1 M☉ star and an Earth-mass planet on a circular 1 AU orbit inclined by `inc`. */
function inclinedOrbit(inc) {
  const sim = new GravitySim();
  sim.loadScenario('empty');
  sim.params.threeD = true;
  sim.params.merge = false;
  sim.params.maxStep = 0.0005;
  const sun = sim.addBody(sim.makeBody('star', 0, 0));
  const v = Math.sqrt(G_SI_UNITS);
  const [vx, vy, vz] = tilt(0, v, inc, 0);
  const earth = sim.addBody(sim.makeBody('planet', 1, 0, vx, vy, { vz }));
  sim.fixMomentum();
  return { sim, sun, earth };
}

function angularMomentum(sim) {
  let lx = 0, ly = 0, lz = 0;
  for (const b of sim.bodies) {
    lx += b.m * (b.y * b.vz - b.z * b.vy);
    ly += b.m * (b.z * b.vx - b.x * b.vz);
    lz += b.m * (b.x * b.vy - b.y * b.vx);
  }
  return [lx, ly, lz];
}

test('W-SM-1: an orbit inclined 30° closes in one year and keeps its inclination', () => {
  const { sim, sun, earth } = inclinedOrbit(30 * DEG);
  const start = [earth.x - sun.x, earth.y - sun.y, earth.z - sun.z];
  assert.ok(Math.abs(orbitalElements(earth, sun, sim.G).inclination - 30) < 1e-9);
  let worst = 0;
  for (let i = 0; i < 100; i++) {
    sim.advance(0.01);
    worst = Math.max(worst, Math.abs(orbitalElements(earth, sun, sim.G).inclination - 30));
  }
  const miss = Math.hypot(earth.x - sun.x - start[0], earth.y - sun.y - start[1], earth.z - sun.z - start[2]);
  assert.ok(miss < 0.01, `missed the start by ${miss} AU`);
  assert.ok(worst < 0.1, `inclination drifted ${worst}°`);
  assert.ok(Math.abs(earth.z) > 0 || Math.abs(earth.vz) > 0, 'the orbit leaves the plane');
});

test('W-SM-2: energy and the angular momentum vector are conserved over one orbit', () => {
  const { sim } = inclinedOrbit(30 * DEG);
  const e0 = sim.totalEnergy(), l0 = angularMomentum(sim);
  sim.advance(1);
  const drift = Math.abs((sim.totalEnergy() - e0) / e0);
  assert.ok(drift < 1e-6, `energy drift ${drift}`);
  const l1 = angularMomentum(sim), n0 = Math.hypot(...l0);
  const dl = Math.hypot(l1[0] - l0[0], l1[1] - l0[1], l1[2] - l0[2]) / n0;
  assert.ok(dl < 1e-8, `angular momentum drift ${dl}`);
});

function cloud3(n, seed = 1) {
  const rng = new Random(seed);
  return Array.from({ length: n }, () => ({ x: rng.gaussian(0, 10), y: rng.gaussian(0, 10), z: rng.gaussian(0, 10), m: rng.range(0.1, 1) }));
}

function meanError3(bodies, theta) {
  const tree = new Octree().build(bodies);
  let sum = 0;
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    let ex = 0, ey = 0, ez = 0;
    for (const [j, o] of bodies.entries()) {
      if (j === i) continue;
      const dx = o.x - b.x, dy = o.y - b.y, dz = o.z - b.z, r2 = dx * dx + dy * dy + dz * dz + 0.01;
      const k = o.m / (r2 * Math.sqrt(r2));
      ex += dx * k; ey += dy * k; ez += dz * k;
    }
    const [ax, ay, az] = tree.accel(b.x, b.y, b.z, i, 1, 0.01, theta, [0, 0, 0]);
    sum += Math.hypot(ax - ex, ay - ey, az - ez) / Math.hypot(ex, ey, ez);
  }
  return sum / bodies.length;
}

test('W-SM-3: the octree force error is ≤ 3 % at θ = 0.6 and vanishes as θ → 0', () => {
  const bodies = cloud3(500);
  const e6 = meanError3(bodies, 0.6);
  assert.ok(e6 <= 0.03, `mean error ${e6}`);
  assert.ok(meanError3(bodies, 0.3) < e6);
  assert.ok(meanError3(cloud3(150), 1e-9) < 1e-12);
});

test('the octree conserves mass and centre of mass, and survives coincident bodies', () => {
  const bodies = cloud3(300);
  const tree = new Octree().build(bodies);
  const m = bodies.reduce((s, b) => s + b.m, 0);
  const z = bodies.reduce((s, b) => s + b.m * b.z, 0) / m;
  assert.ok(Math.abs(tree.m[0] - m) < 1e-9);
  assert.ok(Math.abs(tree.mz[0] - z) < 1e-9);
  const same = [{ x: 1, y: 1, z: 1, m: 1 }, { x: 1, y: 1, z: 1, m: 1 }, { x: -3, y: 2, z: 0, m: 1 }];
  const a = new Octree().build(same).accel(-3, 2, 0, 2, 1, 0.01, 0.5, [0, 0, 0]);
  assert.ok(a.every(Number.isFinite) && a[0] > 0 && a[2] > 0);
});

// Fingerprints of every 2D scenario after 30 frames, recorded before the 3D mode existed.
const GOLDEN = {
  solar: 'bb850d5305eb00c4',
  earthMoon: '93d2e907123a49e2',
  binary: 'b2547ddfcedfd2ee',
  figure8: 'ce5b5bb850744a73',
  galaxy: 'f14d85307122fe4e',
  galaxyCollision: 'ed2d0b263346cff4',
  cluster: 'e0adce4d8cb0b115',
  lonelyStar: '6841360c725e8cfc',
};

test('W-SM-4: with the 3D mode off, every 2D scenario evolves bit-identically to before', () => {
  const sim = new GravitySim();
  const f = new Float64Array(1);
  for (const [id, want] of Object.entries(GOLDEN)) {
    sim.loadScenario(id);
    assert.equal(sim.params.threeD, false, id);
    for (let i = 0; i < 30; i++) sim.step(1 / 60);
    const h = createHash('sha256');
    for (const b of sim.bodies) for (const v of [b.x, b.y, b.vx, b.vy, b.m]) { f[0] = v; h.update(new Uint8Array(f.buffer)); }
    assert.equal(h.digest('hex').slice(0, 16), want, id);
    assert.ok(sim.bodies.every((b) => b.z === 0 && b.vz === 0), `${id} stayed in the plane`);
  }
});

test('the inclined-orbits scenario holds each planet at its tilt', () => {
  const sim = new GravitySim();
  sim.loadScenario('inclined');
  assert.equal(sim.params.threeD, true);
  const sun = sim.bodies.find((b) => b.name === 'Sun');
  const want = { Flat: 0, 'Tilt 15°': 15, 'Tilt 30°': 30, Polar: 90, Retrograde: 150 };
  for (let i = 0; i < 120; i++) sim.step(1 / 60);
  for (const [name, inc] of Object.entries(want)) {
    const p = sim.bodies.find((b) => b.name === name);
    assert.ok(Math.abs(orbitalElements(p, sun, sim.G).inclination - inc) < 0.5, `${name}: ${orbitalElements(p, sun, sim.G).inclination}`);
  }
  const d = sim.describe(sim.bodies.find((b) => b.name === 'Polar'));
  assert.ok(d.fields.some((x) => x.key === 'z') && d.fields.some((x) => x.key === 'inclination'));
});

test('the 3D galaxy collision leaves the plane and merges its cores', () => {
  const sim = new GravitySim();
  sim.loadScenario('galaxy3d');
  sim.params.theta = 0.6;
  for (let i = 0; i < 1200; i++) sim.step(1 / 60);
  const cores = sim.bodies.filter((b) => b.m > 0);
  assert.equal(cores.length, 1, 'cores merged');
  const c = cores[0];
  assert.ok(Math.hypot(c.x, c.y, c.z) < 30, `core drifted to ${c.x}, ${c.y}, ${c.z}`);
  const thick = sim.bodies.filter((b) => Math.abs(b.z) > 5).length;
  assert.ok(thick > 100, `only ${thick} stars left the plane`);
  for (const b of sim.bodies) assert.ok(Number.isFinite(b.z) && Number.isFinite(b.vz), b.name);
});

test('the octree path agrees with the direct sum in 3D', () => {
  const sim = new GravitySim();
  sim.loadScenario('empty');
  sim.params.threeD = true;
  const rng = new Random(7);
  for (let i = 0; i < 80; i++) sim.addBody(sim.makeBody('star', rng.gaussian(0, 20), rng.gaussian(0, 20), 0, 0, { z: rng.gaussian(0, 20), m: 0.5 }));
  sim.params.theta = 0;
  sim.computeAcc();
  const exact = sim.bodies.map((b) => [b.ax, b.ay, b.az]);
  sim.params.theta = 0.6;
  sim.computeAcc();
  assert.ok(sim.tree3.count > 1, 'octree was built');
  let err = 0;
  sim.bodies.forEach((b, i) => { err += Math.hypot(b.ax - exact[i][0], b.ay - exact[i][1], b.az - exact[i][2]) / Math.hypot(...exact[i]); });
  assert.ok(err / sim.bodies.length < 0.03, `mean error ${err / sim.bodies.length}`);
});

test('3D state saves and loads, and leaving 3D flattens onto the plane', () => {
  const sim = new GravitySim();
  sim.loadScenario('inclined');
  sim.step(0.1);
  const data = JSON.parse(JSON.stringify(sim.serialize()));
  const copy = new GravitySim();
  copy.deserialize(data);
  assert.equal(copy.params.threeD, true);
  const p = sim.bodies.find((b) => b.name === 'Polar'), q = copy.bodies.find((b) => b.name === 'Polar');
  assert.equal(q.z, p.z);
  assert.equal(q.vz, p.vz);
  copy.setParam('threeD', false);
  assert.ok(copy.bodies.every((b) => b.z === 0 && b.vz === 0));
  copy.step(0.05);
  assert.ok(copy.bodies.every((b) => b.z === 0 && Number.isFinite(b.x)));
});

test('switching from a 3D scenario back to a 2D one turns the 3D mode off', () => {
  const sim = new GravitySim();
  sim.loadScenario('galaxy3d');
  sim.loadScenario('solar');
  assert.equal(sim.params.threeD, false);
  assert.ok(sim.bodies.every((b) => b.z === 0));
});
