import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evolve, mainSequenceLifetime, sampleSalpeter } from '../src/sims/stellar-model.js';
import { StarsSim } from '../src/sims/stars.js';
import { Random } from '../src/core/random.js';

test('the present-day Sun is a G-type main-sequence star', () => {
  const s = evolve(1, 4600);
  assert.equal(s.phase, 'Main sequence');
  assert.equal(s.spectral, 'G');
  assert.ok(s.L > 0.9 && s.L < 1.5, `L=${s.L}`);
  assert.ok(Math.abs(s.T - 5778) < 600, `T=${s.T}`);
});

test('lifetimes shrink steeply with mass', () => {
  assert.ok(mainSequenceLifetime(1) > 9000);
  assert.ok(mainSequenceLifetime(10) < 50);
});

test('end states depend on initial mass', () => {
  assert.equal(evolve(1, 20000).phase, 'White dwarf');
  assert.equal(evolve(15, 200).phase, 'Neutron star');
  assert.equal(evolve(40, 200).phase, 'Black hole');
  assert.equal(evolve(0.2, 13000).phase, 'Main sequence');
  assert.equal(evolve(1, 10400).phase, 'Red giant');
});

test('Salpeter sampling favours low-mass stars', () => {
  const rng = new Random(1);
  const ms = Array.from({ length: 5000 }, () => sampleSalpeter(rng));
  const low = ms.filter((m) => m < 1).length / ms.length;
  assert.ok(low > 0.7, `fraction below 1 M☉: ${low}`);
  assert.ok(ms.every((m) => m >= 0.1 && m <= 60));
});

test('a massive star eventually goes supernova in the simulation', () => {
  const sim = new StarsSim();
  sim.loadScenario('empty');
  const s = sim.add('blue', 50, 50);
  for (let i = 0; i < 40 && s.state.phase !== 'Neutron star'; i++) sim.step(1); // 20 Myr/s
  assert.equal(s.state.phase, 'Neutron star');
  assert.equal(sim.supernovae, 1);
});

test('nebulae form stars', () => {
  const sim = new StarsSim();
  sim.loadScenario('empty');
  sim.params.myrPerSecond = 2;
  sim.add('nebula', 100, 60);
  for (let i = 0; i < 30; i++) sim.step(0.5);
  assert.ok(sim.stars.length > 0);
});
