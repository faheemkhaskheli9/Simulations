// Regression tests for the issues found by the October 2026 audit
// (docs/IMPROVEMENT_PLAN.md). Each test names the plan item it guards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GravitySim } from '../src/sims/gravity.js';
import { AtomSim } from '../src/sims/atom.js';

const run = (sim, seconds) => { for (let i = 0; i < seconds * 60; i++) sim.step(1 / 60); };

test('A1: the Moon stays in orbit around Earth (Earth & Moon, Solar System)', () => {
  for (const scenario of ['earthMoon', 'solar']) {
    const sim = new GravitySim();
    sim.loadScenario(scenario);
    sim.advance(1);
    const moon = sim.bodies.find((b) => b.name === 'Moon');
    const earth = sim.bodies.find((b) => b.name === 'Earth');
    assert.ok(moon && earth, `${scenario}: Moon merged into Earth`);
    const d = Math.hypot(moon.x - earth.x, moon.y - earth.y);
    assert.ok(d > 0.0023 && d < 0.0029, `${scenario}: Moon at ${d} AU (real orbit 0.0024–0.0027)`);
  }
});

test('A2: radioactive decay never leaves an impossible multiply-charged negative ion', () => {
  const sim = new AtomSim();
  sim.loadScenario('uranium');
  let worst = 0;
  for (let i = 0; i < 6000; i++) {
    sim.step(1 / 60);
    worst = Math.min(worst, sim.Z - sim.electrons.length);
  }
  assert.ok(sim.decays.length >= 3, 'the decay chain progressed');
  assert.ok(sim.Z - sim.electrons.length >= -1, `final charge ${sim.Z - sim.electrons.length}`);
  assert.ok(worst >= -4, `charge dipped to ${worst}`);
});

test('A2: the uranium-238 series alternates α and β⁻ decays and ends at lead-206', () => {
  const sim = new AtomSim();
  sim.loadScenario('uranium');
  sim.params.decaySpeed = 100;
  for (let i = 0; i < 30000 && !(sim.Z === 82 && sim.N === 124); i++) sim.step(1 / 60);
  assert.equal(`${sim.Z}-${sim.Z + sim.N}`, '82-206', sim.decays.join(' | '));
  const chain = sim.decays.join(' ');
  for (const step of ['Ra-226', 'Rn-222', 'Pb-210']) assert.ok(chain.includes(step), `missing ${step}: ${chain}`);
  assert.ok(chain.includes('β⁻') && chain.includes('α'));
});

test('A3: immigration never brings species the scenario excluded', async () => {
  const { EcosystemSim } = await import('../src/sims/ecosystem.js');
  const sim = new EcosystemSim();
  sim.loadScenario('prey');
  run(sim, 40); // ~10 years
  assert.equal(sim.animals.filter((a) => a.species === 'carnivore').length, 0);
  sim.add('carnivore', 100, 100); // once the user adds foxes, they count as native
  assert.ok(sim.native.has('carnivore'));
});

test('A4/B3: healthy cells keep their volume, voltage and energy for a full minute', async () => {
  const { CellSim } = await import('../src/sims/cell.js');
  for (const scenario of ['diffusion', 'respiration', 'neuron']) {
    const sim = new CellSim();
    sim.loadScenario(scenario);
    const atp0 = sim.atp;
    let lo = Infinity, hi = 0;
    for (let i = 0; i < 3600; i++) {
      sim.step(1 / 60);
      const v = (sim.R / 10) ** 3;
      lo = Math.min(lo, v); hi = Math.max(hi, v);
    }
    assert.ok(lo > 0.8 && hi < 1.2, `${scenario}: volume ranged ${lo.toFixed(2)}–${hi.toFixed(2)} of normal`);
    const vm = sim.membranePotential();
    assert.ok(vm < -45 && vm > -95, `${scenario}: Vm ${vm}`);
    assert.ok(sim.atp >= 0.5 * atp0, `${scenario}: ATP ${sim.atp} of ${atp0}`);
  }
});

test('A4: potassium is held inside by the membrane voltage, not lost by diffusion', async () => {
  const { CellSim } = await import('../src/sims/cell.js');
  const sim = new CellSim();
  sim.loadScenario('neuron');
  const k0 = sim.counts().in.k;
  run(sim, 60);
  assert.ok(sim.counts().in.k >= 0.8 * k0, `K⁺ inside fell from ${k0} to ${sim.counts().in.k}`);
});

test('A5: with waning immunity the disease comes back in new waves (endemic)', async () => {
  const { EpidemicSim } = await import('../src/sims/epidemic.js');
  const sim = new EpidemicSim();
  sim.loadScenario('endemic');
  const active = () => sim.people.filter((p) => p.state === 'I' || p.state === 'E').length;
  let died = false, waves = 0, inWave = true;
  while (sim.time < 6 * 365) {
    sim.step(1 / 60);
    const n = active();
    if (inWave && n === 0) { inWave = false; died = true; }
    else if (!inWave && n >= 5) { inWave = true; waves++; }
  }
  assert.ok(died, 'the first wave ended');
  assert.ok(waves >= 1, 'the disease returned after dying out');
});
