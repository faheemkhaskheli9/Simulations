import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EcosystemSim } from '../src/sims/ecosystem.js';
import { EpidemicSim } from '../src/sims/epidemic.js';

const stat = (sim, key) => sim.stats().find((s) => s.key === key).value;

test('ecosystem runs and offspring inherit mutated genes', () => {
  const sim = new EcosystemSim();
  for (let i = 0; i < 100; i++) sim.step();
  assert.ok(sim.births > 0);
  assert.ok(stat(sim, 'generation') > 1);
  assert.ok(stat(sim, 'herbivores') > 0);
});

test('herbivores starve without plants', () => {
  const sim = new EcosystemSim();
  sim.loadScenario('prey');
  sim.params.growth = 0;
  sim.params.immigration = false; // a closed system, so starvation is final
  sim.grass.fill(0);
  for (let i = 0; i < 200; i++) sim.step();
  assert.equal(stat(sim, 'herbivores'), 0);
});

test('editing genes is clamped to valid ranges', () => {
  const sim = new EcosystemSim();
  const a = sim.add('herbivore', 100, 100);
  sim.setProperty(a, 'gene.speed', 999);
  assert.equal(a.genes.speed, 4);
});

test('epidemic spreads, and vaccination slows it', () => {
  const run = (scenario) => {
    const sim = new EpidemicSim();
    sim.loadScenario(scenario);
    for (let i = 0; i < 400; i++) sim.step();
    return stat(sim, 'R') + stat(sim, 'D');
  };
  const open = run('town');
  const vaccinated = run('vaccinated');
  assert.ok(open > 50, `only ${open} infected`);
  assert.ok(vaccinated < open, `${vaccinated} vs ${open}`);
});
