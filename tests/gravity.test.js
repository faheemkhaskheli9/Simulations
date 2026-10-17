import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GravitySim, orbitalElements, G_SI_UNITS } from '../src/sims/gravity.js';

function twoBody() {
  const sim = new GravitySim();
  sim.loadScenario('empty');
  sim.params.merge = false;
  const sun = sim.addBody(sim.makeBody('star', 0, 0));
  const v = Math.sqrt(G_SI_UNITS / 1);
  const earth = sim.addBody(sim.makeBody('planet', 1, 0, 0, v));
  sim.fixMomentum();
  return { sim, sun, earth };
}

test('a circular 1 AU orbit takes one year and conserves energy', () => {
  const { sim, earth } = twoBody();
  const e0 = sim.totalEnergy();
  sim.params.maxStep = 0.0005;
  sim.advance(1);
  assert.ok(Math.hypot(earth.x - 1, earth.y) < 0.01, `ended at ${earth.x}, ${earth.y}`);
  const drift = Math.abs((sim.totalEnergy() - e0) / e0);
  assert.ok(drift < 1e-6, `energy drift ${drift}`);
});

test('orbital elements of a circular orbit', () => {
  const { sim, sun, earth } = twoBody();
  const o = orbitalElements(earth, sun, sim.G);
  assert.ok(Math.abs(o.a - 1) < 1e-3);
  assert.ok(o.e < 1e-3);
  assert.ok(Math.abs(o.period - 1) < 1e-3);
});

test('collisions merge bodies conserving mass and momentum', () => {
  const sim = new GravitySim();
  sim.loadScenario('empty');
  sim.params.gScale = 0;
  const a = sim.addBody(sim.makeBody('star', -0.001, 0, 1, 0));
  const b = sim.addBody(sim.makeBody('star', 0.001, 0, -0.5, 0, { m: 2 }));
  const p0 = a.m * a.vx + b.m * b.vx;
  sim.advance(0.001);
  assert.equal(sim.bodies.length, 1);
  const m = sim.bodies[0];
  assert.equal(m.m, 3);
  assert.ok(Math.abs(m.m * m.vx - p0) < 1e-12);
});

test('bodies added near a star start on a bound orbit', () => {
  const sim = new GravitySim();
  sim.loadScenario('empty');
  const star = sim.addBody(sim.makeBody('star', 0, 0));
  const p = sim.add('planet', 2, 0);
  const o = orbitalElements(p, star, sim.G);
  assert.ok(o.e < 0.01 && Math.abs(o.a - 2) < 0.01);
});

test('every scenario loads and steps', () => {
  const sim = new GravitySim();
  for (const s of sim.scenarios) {
    sim.loadScenario(s.id);
    sim.step(0.05);
    for (const b of sim.bodies) assert.ok(Number.isFinite(b.x) && Number.isFinite(b.vy), `${s.id}: ${b.name}`);
  }
});

test('galaxy collision stays bound: the cores merge instead of slingshotting apart', () => {
  const sim = new GravitySim();
  sim.loadScenario('galaxyCollision');
  for (let i = 0; i < 1200; i++) sim.step(1 / 60);
  const cores = sim.bodies.filter((b) => b.m > 0);
  assert.equal(cores.length, 1, 'cores merged');
  assert.ok(Math.hypot(cores[0].x, cores[0].y) < 30, `core drifted to ${cores[0].x}, ${cores[0].y}`);
  const inView = sim.bodies.filter((b) => Math.abs(b.x) < 110 && Math.abs(b.y) < 80).length;
  assert.ok(inView > 300, `only ${inView} stars left in view`);
});
