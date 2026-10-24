// The native Atomic Structure view (World TRD W-FT-28): a nucleus of packed
// nucleons, electron shells as spheres, electrons on tilted orbits that the
// tools can still pick.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIMULATIONS } from '../src/sims/index.js';
import { World } from '../src/world/world.js';
import { ShellsSite, orbitPlane, nucleonOffset } from '../src/world/native/shells.js';
import { v3 } from '../src/world/engine/math3d.js';

function site() {
  const world = new World(SIMULATIONS);
  const s = world.sites.get('shells');
  assert.ok(s instanceof ShellsSite, 'the atom is drawn natively');
  s.ensure();
  return s;
}

test('electrons circle their shell on stable tilted orbits', () => {
  const s = site(), sim = s.sim;
  for (const e of sim.electrons) {
    const [u, v] = orbitPlane(e.id);
    assert.ok(Math.abs(v3.len(u) - 1) < 1e-12 && Math.abs(v3.len(v) - 1) < 1e-12 && Math.abs(v3.dot(u, v)) < 1e-12);
    assert.ok(Math.abs(v3.len(s.electronAt(e)) - sim.shellRadius(e.n)) < 1e-9, 'on its shell sphere');
  }
  const tilts = sim.electrons.map((e) => Math.abs(orbitPlane(e.id)[1][2]));
  assert.ok(new Set(tilts.map((t) => t.toFixed(3))).size > 3, 'orbits are tilted differently');
  const e = sim.electrons[0], a = s.electronAt(e);
  assert.deepEqual(s.electronAt(e), a, 'stable');
  sim.step(0.5);
  assert.ok(v3.dist(s.electronAt(e), a) > 1e-3, 'and they move');
});

test('nucleons fill a ball of the nucleus radius, protons and neutrons in proportion', () => {
  for (const A of [1, 12, 56, 238]) {
    for (let i = 0; i < A; i++) assert.ok(v3.len(nucleonOffset(i, A, 2)) <= 2 + 1e-9);
  }
  const s = site(), sim = s.sim, A = sim.Z + sim.N;
  const n = s.atomSpheres([0, 0, 0]);
  assert.equal(n, A + sim.electrons.length);
  let protons = 0;
  for (let i = 0; i < A; i++) if (s.balls[i * 8 + 4] > 0.9) protons++;
  assert.equal(protons, sim.Z);
});

test('a ray through an electron picks it; elsewhere rays hit the middle plane', () => {
  const s = site(), sim = s.sim;
  const e = sim.electrons.find((o) => Math.abs(s.electronAt(o)[2]) > 0.5) ?? sim.electrons[0];
  const p = s.placeAt(...s.electronAt(e)), eye = v3.add(p, [10, 20, 200]);
  const h = s.hit({ o: eye, d: v3.norm(v3.sub(p, eye)) });
  assert.ok(h.inside && Math.abs(h.t - (v3.dist(eye, p) - 1.8 * 0.22 * s.scale)) < 1e-6);
  assert.equal(sim.pick(h.x, h.y, 0.3), e, 'the module picks the electron the ray went through');
  // Away from every electron, the ray meets the middle plane at the aimed point.
  sim.electrons = [];
  const target = s.placeAt(6, -4), m = s.hit({ o: v3.add(target, [5, 5, 100]), d: v3.norm([-5, -5, -100]) });
  assert.ok(m.inside && Math.abs(m.x - 6) < 1e-9 && Math.abs(m.y + 4) < 1e-9);
  assert.ok(Math.abs(m.mpp * s.scale - 1) < 1e-12);
  assert.equal(sim.pick(0, 0, 0.3), sim.nucleus, 'the centre is the nucleus');
});

test('shells drawn match the 2D view, and the plaque sits below the outermost one', () => {
  const s = site(), sim = s.sim;
  assert.deepEqual(s.shellLevels(), { used: 2, drawn: 2 }, 'carbon: two shells');
  sim.excite(sim.outermost(), 5);
  assert.equal(s.shellLevels().drawn, 5);
  const { at, h } = s.plaque();
  assert.ok(at[1] + h / 2 < s.center[1] - sim.shellRadius(5) * s.scale);
});

test('photons and decay particles are glowing points that fade', () => {
  const s = site(), sim = s.sim;
  sim.particles = [];
  sim.shine(3);
  for (let i = 0; i < 60 && !sim.particles.length; i++) sim.step(0.1);
  assert.ok(sim.particles.length > 0, 'light was emitted');
  const n = s.particlePoints([0, 0, 0]);
  assert.equal(n, sim.particles.length);
  for (let k = 0; k < n; k++) assert.ok(s.glow[k * 8 + 7] > 0 && s.glow[k * 8 + 7] <= 1);
});
