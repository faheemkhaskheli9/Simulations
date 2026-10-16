import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WeatherSim, qsat } from '../src/sims/weather.js';

test('saturation mixing ratio grows with temperature', () => {
  const q20 = qsat(293.15, 100000);
  assert.ok(q20 > 0.0140 && q20 < 0.0152, `q=${q20}`);
  assert.ok(qsat(303.15, 100000) > q20);
});

test('a warm, moist bubble rises and makes cloud', () => {
  const sim = new WeatherSim();
  sim.loadScenario('storm');
  sim.params.stepsPerFrame = 10;
  for (let i = 0; i < 30; i++) sim.step();
  const s = Object.fromEntries(sim.stats().map((x) => [x.key, x.value]));
  assert.ok(s.updraft > 1, `updraft ${s.updraft}`);
  assert.ok(s.cloudCover > 0, 'no clouds');
  for (const f of [sim.u, sim.v, sim.th, sim.qv]) assert.ok(f.every(Number.isFinite));
});

test('editing a cell sets its temperature and humidity', () => {
  const sim = new WeatherSim();
  const cell = sim.pick(10, 3);
  sim.setProperty(cell, 'tempC', 25);
  sim.setProperty(cell, 'rh', 80);
  const f = Object.fromEntries(sim.describe(cell).fields.map((x) => [x.key, x.value]));
  assert.ok(Math.abs(f.tempC - 25) < 1e-3);
  assert.ok(Math.abs(f.rh - 80) < 1e-3);
});

test('mountains can be raised and eroded', () => {
  const sim = new WeatherSim();
  const before = sim.terrain[40];
  sim.add('mountain', 40 * 0.25, 1);
  assert.ok(sim.terrain[40] > before);
  sim.removeAt(40 * 0.25, sim.terrain[40] * 0.25, 1);
  assert.ok(sim.terrain[40] < before + 3);
});
