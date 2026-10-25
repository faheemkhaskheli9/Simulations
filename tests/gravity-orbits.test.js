// Orbit ellipses (World Plan W4, Gravity): the osculating Kepler ellipse of
// each bound body, drawn in the 2D view and, tilted, in the world's 3D view.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GravitySim, orbitEllipse, orbitalElements, tilt, G_SI_UNITS } from '../src/sims/gravity.js';
import { World } from '../src/world/world.js';
import { SIMULATIONS } from '../src/sims/index.js';

const DEG = Math.PI / 180;
const at = (pts, i) => [pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]];

function twoBody(r, v, inc = 0) {
  const sim = new GravitySim();
  sim.loadScenario('empty');
  sim.params.threeD = true;
  const sun = sim.addBody(sim.makeBody('star', 0, 0));
  const [vx, vy, vz] = tilt(0, v, inc, 0);
  const p = sim.addBody(sim.makeBody('planet', r, 0, vx, vy, { vz }));
  return { sim, sun, p };
}

test('a circular orbit gives a circle of the orbit radius through the body', () => {
  const { sim, sun, p } = twoBody(1, Math.sqrt(G_SI_UNITS * (1 + 3e-6)));
  const pts = orbitEllipse(p, sun, sim.G, 64);
  assert.equal(pts.length, 64 * 3);
  for (let i = 0; i < 64; i++) assert.ok(Math.abs(Math.hypot(...at(pts, i)) - 1) < 1e-9);
  assert.ok(Math.hypot(pts[0] - 1, pts[1], pts[2]) < 1e-9, 'starts at the body');
});

test('an eccentric orbit has the right periapsis, apoapsis and focus', () => {
  // At periapsis r_p = a(1 − e) with v² = μ(1 + e)/r_p.
  const e = 0.6, rp = 0.5, mu = G_SI_UNITS * (1 + 3e-6);
  const { sim, sun, p } = twoBody(rp, Math.sqrt((mu * (1 + e)) / rp));
  const pts = orbitEllipse(p, sun, sim.G, 200);
  const rs = Array.from({ length: 200 }, (_, i) => Math.hypot(...at(pts, i)));
  assert.ok(Math.abs(Math.min(...rs) - rp) < 1e-9);
  const a = rp / (1 - e);
  assert.ok(Math.abs(Math.max(...rs) - a * (1 + e)) < 1e-9);
  assert.ok(Math.abs(orbitalElements(p, sun, sim.G).e - e) < 1e-9);
  // The body sits on its ellipse.
  const d = Math.min(...Array.from({ length: 200 }, (_, i) => Math.hypot(pts[i * 3] - p.x, pts[i * 3 + 1] - p.y, pts[i * 3 + 2] - p.z)));
  assert.ok(d < 1e-9);
});

test('an inclined orbit gives an ellipse tilted by its inclination', () => {
  const { sim, sun, p } = twoBody(1, Math.sqrt(G_SI_UNITS), 30 * DEG);
  const pts = orbitEllipse(p, sun, sim.G, 96);
  const zmax = Math.max(...Array.from({ length: 96 }, (_, i) => Math.abs(pts[i * 3 + 2])));
  assert.ok(Math.abs(zmax - Math.sin(30 * DEG)) < 2e-3, `peak height ${zmax}`);
  // Every point lies in the plane normal to r × v.
  const n = [0, -Math.sin(30 * DEG), Math.cos(30 * DEG)];
  for (let i = 0; i < 96; i++) assert.ok(Math.abs(at(pts, i).reduce((s, x, k) => s + x * n[k], 0)) < 1e-9);
});

test('unbound and degenerate orbits have no ellipse', () => {
  const esc = twoBody(1, Math.sqrt(2 * G_SI_UNITS) * 1.01);
  assert.equal(orbitEllipse(esc.p, esc.sun, esc.sim.G), null);
  const fall = twoBody(1, 0);
  assert.equal(orbitEllipse(fall.p, fall.sun, fall.sim.G), null);
});

test('in the Solar System every planet orbits the Sun and the Moon orbits the Earth', () => {
  const sim = new GravitySim();
  sim.loadScenario('solar');
  const sun = sim.bodies.find((b) => b.name === 'Sun');
  const massive = sim.bodies.filter((b) => b.m > 0);
  assert.equal(sim.orbitHost(sun), null, 'the Sun has no orbit');
  for (const b of massive) {
    if (b === sun) continue;
    assert.equal(sim.orbitHost(b).name, b.name === 'Moon' ? 'Earth' : 'Sun', b.name);
  }
  const ells = sim.orbitEllipses();
  assert.equal(ells.length, massive.length - 1, 'the asteroids get none');
  const moon = ells.find((o) => o.body.name === 'Moon');
  const a = orbitalElements(moon.body, moon.host, sim.G).a;
  assert.ok(Math.abs(a - 0.00257) < 3e-4, `the Moon's ellipse is about 0.0026 AU across, a = ${a}`);
});

test('galaxies draw no ellipses for their stars, clusters none at all; off by default', () => {
  const sim = new GravitySim();
  assert.equal(sim.params.orbits, false);
  sim.loadScenario('galaxy3d');
  assert.ok(sim.orbitEllipses().every((o) => o.body.kind === 'blackHole'));
  sim.loadScenario('cluster');
  assert.deepEqual(sim.orbitEllipses(), []);
});

test("the world's Solar System and Earth & Moon show orbit ellipses", () => {
  const world = new World(SIMULATIONS);
  for (const id of ['planets', 'moon']) {
    const s = world.sites.get(id);
    s.ensure();
    assert.equal(s.sim.params.orbits, true, id);
  }
  const moon = world.sites.get('moon').sim;
  assert.ok(moon.orbitEllipses().some((o) => o.body.name === 'Moon' && o.host.name === 'Earth'));
});
