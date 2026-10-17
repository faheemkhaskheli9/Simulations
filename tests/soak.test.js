// Soak test: every scenario of every simulation runs for a while and must stay
// numerically healthy. This is the automated form of the audit behind
// docs/IMPROVEMENT_PLAN.md; scenario-specific invariants live in regressions.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIMULATIONS } from '../src/sims/index.js';

const FRAMES = { weather: 60, gravity: 240 }; // the heaviest modules run shorter
const DEFAULT_FRAMES = 360;

/** Every number reachable in a plain object graph, with its path. */
function* numbers(value, path = '') {
  if (typeof value === 'number') yield [path, value];
  else if (Array.isArray(value)) for (let i = 0; i < value.length; i++) yield* numbers(value[i], `${path}[${i}]`);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) yield* numbers(v, path ? `${path}.${k}` : k);
}

for (const S of SIMULATIONS) {
  const scenarios = new S().scenarios;
  for (const { id } of scenarios) {
    test(`${S.meta.id}/${id} stays finite and consistent`, () => {
      const sim = new S();
      sim.loadScenario(id);
      const frames = FRAMES[S.meta.id] ?? DEFAULT_FRAMES;
      for (let i = 0; i < frames; i++) sim.step(1 / 60);
      for (const s of sim.stats()) {
        if (typeof s.value === 'number') assert.ok(Number.isFinite(s.value), `statistic ${s.key} = ${s.value}`);
      }
      // The saved world (positions, velocities, energies…) must hold only finite numbers.
      const state = sim.saveState();
      for (const [path, v] of numbers(state)) assert.ok(Number.isFinite(v), `state ${path} = ${v}`);
      assert.ok(Number.isFinite(sim.time) && sim.time > 0, `clock ${sim.time}`);
      // A saved world must load back exactly.
      const copy = new S();
      copy.deserialize(JSON.parse(JSON.stringify(sim.serialize())));
      assert.equal(JSON.stringify(copy.serialize()), JSON.stringify(sim.serialize()));
    });
  }
}
