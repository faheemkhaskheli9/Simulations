import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClimateSim, co2Forcing, dailyInsolation } from '../src/sims/climate.js';

const annualMean = (sim) => {
  let g = 0, ice = 0;
  for (let k = 0; k < 24; k++) { sim.advance(1 / 24); g += sim.globalMean(); ice += sim.iceLine(); }
  return { T: g / 24, ice: ice / 24 };
};

test('insolation: global mean is S0/4 and polar night has no sun', () => {
  let s = 0;
  for (let i = 0; i < 400; i++) s += dailyInsolation(1361, -1 + (2 * (i + 0.5)) / 400, 0.3);
  assert.ok(Math.abs(s / 400 - 1361 / 4) < 1, `mean ${s / 400}`);
  assert.equal(dailyInsolation(1361, -0.99, 0.4), 0); // southern winter pole
});

test('CO₂ doubling forcing is ~3.7 W/m²', () => {
  assert.ok(Math.abs(co2Forcing(560) - 3.71) < 0.02);
});

test('pre-industrial climate is Earth-like', () => {
  const sim = new ClimateSim();
  sim.advance(40);
  const { T, ice } = annualMean(sim);
  assert.ok(T > 12 && T < 16, `global mean ${T}`);
  assert.ok(ice > 60 && ice < 85, `ice edge ${ice}`);
  assert.ok(sim.T[30] > sim.T[59] + 20, 'equator warmer than the pole');
});

test('equilibrium climate sensitivity is within the IPCC likely range', () => {
  const a = new ClimateSim(); a.advance(40);
  const b = new ClimateSim(); b.params.co2 = 560; b.advance(80);
  const ecs = annualMean(b).T - annualMean(a).T;
  assert.ok(ecs > 2 && ecs < 4.5, `ECS ${ecs}`);
});

test('snowball Earth is a stable state (ice–albedo hysteresis)', () => {
  const sim = new ClimateSim();
  sim.loadScenario('snowball');
  sim.params.solar = 1361; // restore today's Sun: the ice still reflects too much light
  sim.advance(50);
  assert.ok(annualMean(sim).T < -20);
});

test('painting ice cools the planet and heating warms a band', () => {
  const sim = new ClimateSim();
  const before = annualMean(sim).T;
  sim.add('ice', 0, 0, 0.3);
  sim.advance(30);
  assert.ok(annualMean(sim).T < before - 1);
  const t = sim.T[30];
  sim.energy(0, -sim.x[30], 0.01, 0.5);
  assert.ok(sim.T[30] > t + 4);
});
