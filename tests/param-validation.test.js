import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIMULATIONS } from '../src/sims/index.js';

test('all simulation parameter entrypoints reject invalid, unknown and out-of-range values', () => {
  for (const Sim of SIMULATIONS) {
    const sim = new Sim();
    const unknown = '__invalid__';
    assert.throws(() => sim.setParam(unknown, 1), /Unknown parameter/, Sim.meta.id);
    for (const def of sim.paramDefs) {
      const initial = sim.params[def.key];
      assert.throws(() => sim.setParam(def.key, NaN), /Invalid value/, `${Sim.meta.id}.${def.key}: NaN`);
      assert.throws(() => sim.setParam(def.key, Infinity), /Invalid value/, `${Sim.meta.id}.${def.key}: Infinity`);
      if (def.type === 'checkbox') {
        assert.throws(() => sim.setParam(def.key, 'true'), /Invalid value/);
      } else if (def.type === 'select') {
        assert.throws(() => sim.setParam(def.key, '__invalid__'), /Invalid value/);
      } else {
        if (def.min !== undefined) assert.throws(() => sim.setParam(def.key, def.min - 1), /Invalid value/);
        if (def.max !== undefined) assert.throws(() => sim.setParam(def.key, def.max + 1), /Invalid value/);
      }
      assert.equal(sim.params[def.key], initial, 'rejected write does not mutate state');
    }
  }
});

test('valid numeric and discrete writes still go through the ordinary parameter contract', () => {
  for (const Sim of SIMULATIONS) {
    const sim = new Sim();
    for (const d of sim.paramDefs) {
      if (d.type === 'checkbox') sim.setParam(d.key, sim.params[d.key]);
      else if (d.type === 'select') sim.setParam(d.key, d.options[0].value);
      else sim.setParam(d.key, d.min ?? d.value);
    }
  }
});
