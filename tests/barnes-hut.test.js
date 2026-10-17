import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BarnesHut } from '../src/core/barnes-hut.js';
import { Random } from '../src/core/random.js';
import { GravitySim } from '../src/sims/gravity.js';

function cloud(n, seed = 1) {
  const rng = new Random(seed);
  return Array.from({ length: n }, () => ({ x: rng.gaussian(0, 10), y: rng.gaussian(0, 10), m: rng.range(0.1, 1) }));
}

function direct(bodies, i, G, eps2) {
  const b = bodies[i];
  let ax = 0, ay = 0;
  for (const [j, o] of bodies.entries()) {
    if (j === i) continue;
    const dx = o.x - b.x, dy = o.y - b.y, r2 = dx * dx + dy * dy + eps2;
    const k = (G * o.m) / (r2 * Math.sqrt(r2));
    ax += dx * k; ay += dy * k;
  }
  return [ax, ay];
}

function meanError(bodies, theta) {
  const tree = new BarnesHut().build(bodies);
  let sum = 0;
  for (let i = 0; i < bodies.length; i++) {
    const [ex, ey] = direct(bodies, i, 1, 0.01);
    const [ax, ay] = tree.accel(bodies[i].x, bodies[i].y, i, 1, 0.01, theta, [0, 0]);
    sum += Math.hypot(ax - ex, ay - ey) / Math.hypot(ex, ey);
  }
  return sum / bodies.length;
}

test('the tree conserves total mass and centre of mass', () => {
  const bodies = cloud(300);
  const tree = new BarnesHut().build(bodies);
  const m = bodies.reduce((s, b) => s + b.m, 0);
  const x = bodies.reduce((s, b) => s + b.m * b.x, 0) / m;
  assert.ok(Math.abs(tree.m[0] - m) < 1e-9);
  assert.ok(Math.abs(tree.mx[0] - x) < 1e-9);
});

test('a tiny opening angle reproduces the direct sum', () => {
  assert.ok(meanError(cloud(200), 1e-9) < 1e-12);
});

test('force errors grow with the opening angle but stay small', () => {
  const bodies = cloud(400);
  const e3 = meanError(bodies, 0.3), e6 = meanError(bodies, 0.6);
  assert.ok(e3 < e6, `${e3} vs ${e6}`);
  assert.ok(e6 < 0.05, `mean error ${e6}`);
});

test('coincident bodies do not hang or blow up the tree', () => {
  const bodies = [{ x: 1, y: 1, m: 1 }, { x: 1, y: 1, m: 1 }, { x: -3, y: 2, m: 1 }];
  const tree = new BarnesHut().build(bodies);
  const [ax, ay] = tree.accel(-3, 2, 2, 1, 0.01, 0.5, [0, 0]);
  assert.ok(Number.isFinite(ax) && Number.isFinite(ay) && ax > 0);
});

test('gravity uses the tree for large systems and conserves energy', () => {
  const sim = new GravitySim();
  sim.loadScenario('cluster');
  assert.equal(sim.bodies.length, 2000);
  const e0 = sim.totalEnergy();
  for (let i = 0; i < 20; i++) sim.step(1 / 60);
  const drift = Math.abs((sim.totalEnergy() - e0) / e0);
  assert.ok(drift < 5e-3, `energy drift ${drift}`);
  assert.ok(sim.tree.count > 1, 'tree was built');
});

test('switching scenarios restores parameters the cluster changed', () => {
  const sim = new GravitySim();
  sim.loadScenario('cluster');
  sim.loadScenario('solar');
  assert.equal(sim.params.softening, 0.001);
  assert.equal(sim.params.merge, true);
  assert.equal(sim.params.trails, true);
});
