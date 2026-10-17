// Every lesson must reference real modules, scenarios, parameters and statistics,
// and must be completable: each one is played through headlessly with a scripted
// solution, exactly as a learner would do it in the UI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIMULATIONS } from '../src/sims/index.js';
import { LESSONS } from '../src/lessons/index.js';
import { LessonRunner } from '../src/lessons/runner.js';

const DT = 0.05; // the UI's largest real-time frame step
const MAX_SECONDS = 240; // real seconds a learner would wait for one step

const once = (fn) => (sim, tick) => { if (tick === 0) fn(sim); };
const every = (seconds, fn) => (sim, tick) => { if (tick % Math.round(seconds / DT) === 0) fn(sim); };
const vaccinateAround = (sim) => {
  for (const p of sim.people) if (p.state === 'I' || p.state === 'E') sim.energy(p.x, p.y, 22, 1);
};

// One entry per step: an action run every tick while the step is active (or null).
const SOLUTIONS = {
  greenhouse: [null, once((s) => s.setParam('co2', 560)), null, null],
  'flatten-curve': [null, once((s) => { s.setParam('distancing', 0.6); s.setParam('quarantine', true); }), null, null],
  'hydrogen-light': [
    every(1, (s) => s.add('photon', 0, 0)),
    (s, tick) => { if (tick === 0) s.setParam('photonLevel', 8); if (tick % 4 === 0) s.add('photon', 0, 0); },
    once((s) => s.add('proton', 0, 0)),
  ],
  'energy-conservation': [null, once((s) => s.setParam('drag', 0.3)), null],
  osmosis: [null, null, once((s) => s.loadScenario('hypertonic')), null],
  'predator-prey': [
    once((s) => s.setParam('immigration', false)),
    once((s) => { for (const a of [...s.animals]) if (a.species === 'carnivore') s.remove(a); }),
    null,
    null,
  ],
  'ring-vaccination': [every(0.5, vaccinateAround)],
  'escape-snowball': [
    once((s) => { s.setParam('solar', 1600); s.setParam('co2', 1500); }),
    once((s) => { s.setParam('solar', 1361); s.setParam('co2', 280); }),
  ],
  'carbon-dating': [once((s) => s.setParam('decaySpeed', 100))],
  kepler: [
    null,
    once((s) => { const e = s.bodies.find((b) => b.name === 'Earth'); s.impulse(e, e.x, e.y, e.vx * 0.09, e.vy * 0.09); }),
    null,
    null,
  ],
  'star-lives': [null, null, null, null],
  'states-of-matter': [once((s) => s.setParam('targetT', 20)), null, once((s) => s.setParam('targetT', 600)), null],
  clouds: [null, null, once((s) => s.setParam('sun', 0)), null],
  'stable-orbit': [
    // Add a planet 1 AU out, then throw it sideways at circular speed (2π AU/yr).
    once((s) => { const p = s.add('planet', 1, 0); s.impulse(p, p.x, p.y, 0, Math.PI); }),
  ],
  // Feed the last few foxes through the lean years.
  'balance-ecosystem': [every(1, (s) => {
    const foxes = s.animals.filter((a) => a.species === 'carnivore');
    if (foxes.length <= 6) for (const a of foxes) s.energy(a.x, a.y, 3, 1);
  })],
  'make-thunderstorm': [once((s) => s.setParam('stability', 2))],
  // Drop hydrogens next to each heavy atom, one per free bond.
  'build-molecules': [once((s) => {
    const hs = s.atoms.filter((a) => a.el === 'H');
    for (const [el, n] of [['C', 4], ['N', 3], ['O', 2]]) {
      const c = s.atoms.find((a) => a.el === el);
      for (let k = 0; k < n; k++) s.move(hs.shift(), c.x + 0.6 * Math.cos((2 * Math.PI * k) / n), c.y + 0.6 * Math.sin((2 * Math.PI * k) / n));
    }
  })],
};

test('lesson ids are unique and every lesson has a scripted solution', () => {
  const ids = LESSONS.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const l of LESSONS) {
    assert.ok(SOLUTIONS[l.id], `no solution for ${l.id}`);
    assert.equal(SOLUTIONS[l.id].length, l.steps.length, `${l.id}: one solution entry per step`);
  }
});

for (const lesson of LESSONS) {
  test(`lesson ${lesson.id}: references valid content and can be completed`, () => {
    const S = SIMULATIONS.find((s) => s.meta.id === lesson.sim);
    assert.ok(S, `unknown simulation ${lesson.sim}`);
    assert.ok(['lesson', 'challenge'].includes(lesson.type));
    assert.ok(lesson.title && lesson.summary && lesson.steps.length);
    const sim = new S();
    assert.ok(sim.scenarios.some((s) => s.id === lesson.scenario), `unknown scenario ${lesson.scenario}`);
    sim.loadScenario(lesson.scenario);
    for (const [k, v] of Object.entries(lesson.params ?? {})) {
      assert.ok(k in sim.params, `unknown parameter ${k}`);
      sim.setParam(k, v);
    }

    const runner = new LessonRunner(lesson, sim);
    const solution = SOLUTIONS[lesson.id];
    while (runner.state === 'active') {
      const at = runner.index;
      if (runner.manual) { runner.advance(sim); continue; }
      let tick = 0;
      while (runner.state === 'active' && runner.index === at) {
        assert.ok(tick * DT < MAX_SECONDS, `${lesson.id}: step ${at + 1} not reached in ${MAX_SECONDS}s: "${runner.step.text}"`);
        solution[at]?.(sim, tick);
        sim.step(DT);
        runner.update(sim);
        tick++;
      }
      if (process.env.LESSON_TIMING) console.log(`${lesson.id} step ${at + 1}: ${(tick * DT).toFixed(1)} s`);
    }
    assert.equal(runner.state, 'complete', runner.failReason);
  });
}

test('a challenge fails when its rule is broken', () => {
  const lesson = LESSONS.find((l) => l.id === 'escape-snowball');
  const sim = new (SIMULATIONS.find((s) => s.meta.id === 'climate'))();
  sim.loadScenario(lesson.scenario);
  const runner = new LessonRunner(lesson, sim);
  sim.setParam('solar', 1600);
  sim.step(DT);
  runner.update(sim);
  assert.equal(runner.state, 'active');
  sim.setParam('obliquity', 0);
  runner.update(sim);
  assert.equal(runner.state, 'failed');
  assert.match(runner.failReason, /Only CO₂/);
});

test('an eccentric orbit does not win the launch challenge, and orbit assist loses it', () => {
  const lesson = LESSONS.find((l) => l.id === 'stable-orbit');
  const sim = new (SIMULATIONS.find((s) => s.meta.id === 'gravity'))();
  sim.loadScenario(lesson.scenario);
  for (const [k, v] of Object.entries(lesson.params)) sim.setParam(k, v);
  const runner = new LessonRunner(lesson, sim);
  const p = sim.add('planet', 1, 0);
  sim.impulse(p, p.x, p.y, 0, 4); // 8 AU/yr: an elongated ellipse (e ≈ 0.6)
  for (let t = 0; t < 10 / DT; t++) { sim.step(DT); runner.update(sim); }
  assert.equal(runner.state, 'active');
  sim.setParam('orbitOnAdd', true);
  runner.update(sim);
  assert.equal(runner.state, 'failed');
});

test('steps without a check wait for Next', () => {
  const lesson = { id: 't', type: 'lesson', title: 'T', summary: 's', sim: 'gravity', scenario: 'solar', steps: [{ text: 'a' }, { text: 'b', check: () => true }] };
  const sim = new (SIMULATIONS.find((s) => s.meta.id === 'gravity'))();
  const runner = new LessonRunner(lesson, sim);
  assert.ok(runner.manual);
  assert.equal(runner.update(sim), false);
  runner.advance(sim);
  assert.equal(runner.index, 1);
  assert.equal(runner.update(sim), true);
  assert.equal(runner.state, 'complete');
});

test('doing nothing loses the vaccination challenge', () => {
  const lesson = LESSONS.find((l) => l.id === 'ring-vaccination');
  const sim = new (SIMULATIONS.find((s) => s.meta.id === 'epidemic'))();
  sim.loadScenario(lesson.scenario);
  const runner = new LessonRunner(lesson, sim);
  for (let t = 0; t < MAX_SECONDS / DT && runner.state === 'active'; t++) { sim.step(DT); runner.update(sim); }
  assert.equal(runner.state, 'failed');
});

const play = (id, act, seconds) => {
  const lesson = LESSONS.find((l) => l.id === id);
  const sim = new (SIMULATIONS.find((s) => s.meta.id === lesson.sim))();
  sim.loadScenario(lesson.scenario);
  for (const [k, v] of Object.entries(lesson.params ?? {})) sim.setParam(k, v);
  const runner = new LessonRunner(lesson, sim);
  for (let t = 0; t < seconds / DT && runner.state === 'active'; t++) { act?.(sim, t); sim.step(DT); runner.update(sim); }
  return runner;
};

test('left alone, the predators starve and the ecosystem challenge is lost', () => {
  const runner = play('balance-ecosystem', null, 60);
  assert.equal(runner.state, 'failed');
  assert.match(runner.failReason, /carnivores died out/);
});

test('adding animals loses the ecosystem challenge', () => {
  const runner = play('balance-ecosystem', (s, t) => { if (t === 5) s.add('carnivore', 100, 100); }, 1);
  assert.equal(runner.state, 'failed');
  assert.match(runner.failReason, /may not be added/);
});

test('switching to the storm scenario loses the thunderstorm challenge', () => {
  const runner = play('make-thunderstorm', (s, t) => { if (t === 2) s.loadScenario('storm'); }, 1);
  assert.equal(runner.state, 'failed');
  assert.match(runner.failReason, /scenario changed/);
});

test('the molecule kit does not build molecules by itself, and transmuting loses', () => {
  let runner = play('build-molecules', null, 20);
  assert.equal(runner.state, 'active');
  runner = play('build-molecules', (s, t) => { if (t === 2) s.setProperty(s.atoms.find((a) => a.el === 'C'), 'el', 'O'); }, 1);
  assert.equal(runner.state, 'failed');
  assert.match(runner.failReason, /atoms changed/);
});
