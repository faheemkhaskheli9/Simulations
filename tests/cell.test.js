import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CellSim } from '../src/sims/cell.js';

const run = (sim, seconds) => { for (let i = 0; i < seconds * 60; i++) sim.step(1 / 60); };
const stat = (sim, key) => sim.stats().find((s) => s.key === key).value;

test('resting membrane potential is negative, like a real cell (−50 to −90 mV)', () => {
  const sim = new CellSim();
  sim.loadScenario('neuron');
  run(sim, 10);
  const vm = stat(sim, 'vm');
  assert.ok(vm < -50 && vm > -90, `Vm = ${vm}`);
});

test('a cell in fresh water swells and bursts; in syrup it shrinks', () => {
  const hypo = new CellSim();
  hypo.loadScenario('hypotonic');
  run(hypo, 20);
  assert.equal(hypo.burst, true);
  const hyper = new CellSim();
  hyper.loadScenario('hypertonic');
  run(hyper, 20);
  assert.ok(hyper.R < 8, `R = ${hyper.R}`);
});

test('a cell in normal fluid keeps its size', () => {
  const sim = new CellSim();
  sim.loadScenario('neuron');
  run(sim, 20);
  assert.ok(Math.abs(sim.R - 10) < 1, `R = ${sim.R}`);
});

test('oxygen diffuses in freely; glucose needs transporters', () => {
  const sim = new CellSim();
  sim.loadScenario('diffusion');
  sim.proteins = []; // remove the glucose transporters
  run(sim, 15);
  const c = sim.counts();
  assert.ok(c.in.o2 > 5, `O₂ inside ${c.in.o2}`);
  assert.equal(c.in.glucose, 0);
});

test('mitochondria make ATP from glucose and oxygen, releasing CO₂', () => {
  const sim = new CellSim();
  sim.params.metabolism = 0;
  sim.params.pumpRate = 0;
  run(sim, 20);
  assert.ok(sim.atpMade > 0 && sim.atp > 400);
  const c = sim.counts();
  assert.ok(c.in.co2 + c.out.co2 > 0);
});

test('without ATP the pumps stop and the ion gradient runs down', () => {
  const sim = new CellSim();
  sim.loadScenario('neuron');
  sim.proteins.push({ id: 9999, type: 'naChannel', angle: 2.5, active: true, alive: true, clock: 0 });
  sim.energy(0, 0, 1, -10); // poison: drain all ATP
  sim.params.metabolism = 50;
  for (const m of sim.mitos) m.active = false;
  run(sim, 60);
  assert.equal(sim.atp, 0);
  assert.ok(sim.counts().in.na > 5, 'sodium leaked in');
});
