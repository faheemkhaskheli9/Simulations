// F1.3: v2 checkpoints must resume evolved simulations and coupling history.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, WORLD_VERSION } from '../src/world/world.js';
import { SIMULATIONS } from '../src/sims/index.js';

const copy = (value) => JSON.parse(JSON.stringify(value));

function valley() {
  const w = new World(SIMULATIONS);
  for (const id of ['climate-weather', 'climate-ecosystem', 'weather-ecosystem', 'climate-epidemic']) {
    assert.equal(w.couplings.set(id, true), true);
  }
  w.setActive(w.sites.get('ecosystem'));
  w.startExperiment();
  return w;
}

test('v2 saves evolved but untouched sites and the complete execution clock', () => {
  const w = valley();
  w.runTicks(38); // exercises rain history and coupling smoothing
  w.step(0.01); // sub-tick pending time
  const data = copy(w.serialize());
  assert.equal(data.version, WORLD_VERSION);
  assert.equal(data.runtime.mode, 'experiment');
  assert.equal(data.runtime.experiment.ticks, 38);
  assert.ok(data.runtime.experiment.pending > 0);
  assert.ok(data.sites.weather && data.sites.climate && data.sites.epidemic);
  assert.ok(data.runtime.couplingMemo['weather-ecosystem'].window.length > 0);
  assert.equal(w.sites.get('weather').touched, false, 'physics is independent of user edits');
});

test('save → load → continue equals uninterrupted experiment, including coupling memo', () => {
  const original = valley();
  original.runTicks(70);
  original.step(0.02);
  const checkpoint = copy(original.serialize());
  const resumed = new World(SIMULATIONS);
  resumed.load(checkpoint);
  assert.deepEqual(copy(resumed.serialize()), checkpoint);
  assert.equal(resumed.backlog, original.backlog);
  original.step(0.03);
  resumed.step(0.03);
  original.runTicks(45);
  resumed.runTicks(45);
  assert.deepEqual(copy(resumed.serialize()), copy(original.serialize()));
});

test('version 1 world saves remain loadable and reset previous runtime', () => {
  const w = valley();
  w.runTicks(36);
  const legacy = copy(w.serialize());
  legacy.version = 1;
  delete legacy.runtime;
  const fresh = new World(SIMULATIONS);
  fresh.setActive(fresh.sites.get('mechanics'));
  fresh.startExperiment();
  fresh.runTicks(7);
  fresh.load(legacy);
  assert.equal(fresh.mode, 'preview');
  assert.equal(fresh.clock, 0);
  assert.equal(fresh.backlog, 0);
  assert.deepEqual(fresh.couplings.values, {});
  assert.deepEqual(fresh.couplings.memo, {});
  assert.equal(fresh.active.id, 'ecosystem');
});

test('invalid v2 runtime is rejected without modifying the active world', () => {
  const w = valley();
  w.runTicks(35);
  const good = copy(w.serialize());
  const before = copy(w.serialize());
  const invalid = [
    (r) => { r.runtime.clock = -2; },
    (r) => { r.runtime.experiment.pending = -1; },
    (r) => { r.runtime.experiment.pending = 100; },
    (r) => { r.runtime.experiment.ids.push('unknown'); },
    (r) => { delete r.sites.climate; },
    (r) => { r.runtime.couplingMemo['weather-ecosystem'].window = [NaN]; },
    (r) => { r.runtime.couplingValues['nonexistent'] = 1; },
    (r) => { r.runtime.scheduler.cursor = -1; },
    (r) => { r.runtime.experiment.ticks += 1; },
    (r) => { r.runtime = null; },
  ];
  for (const corrupt of invalid) {
    const bad = copy(good);
    corrupt(bad);
    assert.throws(() => w.load(bad));
    assert.deepEqual(copy(w.serialize()), before);
  }
});

test('new couplings enabled mid-experiment are included even before the first tick', () => {
  const w = new World(SIMULATIONS);
  w.setActive(w.sites.get('planets'));
  w.startExperiment();
  w.couplings.set('orbit-climate', true);
  const data = copy(w.serialize());
  assert.ok(data.sites.planets && data.sites.climate);
  const loaded = new World(SIMULATIONS);
  loaded.load(data);
  assert.deepEqual(copy(loaded.serialize()), data);
  w.runTicks(31);
  loaded.runTicks(31);
  assert.deepEqual(copy(loaded.serialize()), copy(w.serialize()));
});

test('preview clock and scheduler continuation survive v2 save/loading', () => {
  const fixedNow = () => 0;
  const a = new World(SIMULATIONS, undefined, { scheduler: { budgetMs: 1e9, now: fixedNow } });
  a.setActive(a.sites.get('mechanics'));
  a.assignTiers(new Set([a.sites.get('weather')]), 0);
  a.step(0.03, 2);
  a.step(0.03, 2);
  const saved = copy(a.serialize());
  const b = new World(SIMULATIONS, undefined, { scheduler: { budgetMs: 1e9, now: fixedNow } });
  b.load(saved);
  assert.equal(b.mode, 'preview');
  assert.deepEqual(copy(b.serialize()), saved);
  b.assignTiers(new Set([b.sites.get('weather')]), 1);
  a.assignTiers(new Set([a.sites.get('weather')]), 1);
  for (let i = 0; i < 5; i++) { a.step(0.02, 2); b.step(0.02, 2); }
  assert.deepEqual(copy(b.serialize()), copy(a.serialize()));
});
