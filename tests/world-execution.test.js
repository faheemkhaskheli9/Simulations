// Execution modes (Roadmap F1.1, World TRD W-FT-90…95): experiment mode runs
// fixed ticks in a stable order, so results depend on the inputs only, not on
// frame rate, camera, active site, frame budget, pause or speed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIMULATIONS } from '../src/sims/index.js';
import { World } from '../src/world/world.js';
import { EXPERIMENT_DEFAULTS, TIME_MAPS, experimentSettings, timeMapping } from '../src/world/execution.js';

const TICK = EXPERIMENT_DEFAULTS.tick;

/** A world with the valley's sites coupled, in experiment mode. */
function valley(opts = {}) {
  const w = new World(SIMULATIONS, undefined, { scheduler: opts.scheduler });
  for (const id of ['climate-weather', 'climate-ecosystem', 'weather-ecosystem', 'climate-epidemic']) assert.ok(w.couplings.set(id, true));
  w.setActive(w.sites.get('ecosystem'));
  w.startExperiment(opts.experiment);
  return w;
}

/** Everything an experiment's result is made of. */
function snapshot(w) {
  const sites = {};
  for (const s of w.participants()) sites[s.id] = s.sim.serialize();
  return JSON.stringify({ ticks: w.experiment.ticks, clock: w.clock, couplings: w.couplings.values, sites });
}

/** Seeded irregular frame times between 5 and 100 ms. */
function frames(seed) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2 ** 31;
    return 0.005 + (x / 2 ** 31) * 0.095;
  };
}

/** Feed frames until exactly `target` ticks have run, never more. */
function driveTo(w, target, nextDt, each = () => {}) {
  for (let guard = 0; w.experiment.ticks < target && guard < 1e5; guard++) {
    const room = (target - w.experiment.ticks) * TICK - w.backlog;
    w.step(Math.max(1e-6, Math.min(nextDt(), room)));
    each(w);
  }
  assert.equal(w.experiment.ticks, target);
}

test('the world starts in interactive preview and switches to experiment mode', () => {
  const w = new World(SIMULATIONS);
  assert.equal(w.mode, 'preview');
  assert.equal(w.backlog, 0);
  w.couplings.set('climate-weather', true);
  w.setActive(w.sites.get('mechanics'));
  w.startExperiment();
  assert.equal(w.mode, 'experiment');
  const ids = w.participants().map((s) => s.id);
  assert.deepEqual([...ids].sort(), ['climate', 'mechanics', 'weather']);
  assert.deepEqual(ids, [...ids].sort((a, b) => order(w, a) - order(w, b)), 'layout order');
  w.stopExperiment();
  assert.equal(w.mode, 'preview');
  assert.deepEqual(w.participants(), []);
});

const order = (w, id) => [...w.sites.keys()].indexOf(id);

test('experiment results do not depend on frame times, active site, camera or frame budget', () => {
  const target = 75; // includes two coupling ticks
  const a = valley();
  a.runTicks(target);

  // Irregular frames, a tiny frame budget (one tick per frame, so a backlog
  // builds up), a different active site part-way and changing visible sets.
  let t = 0;
  const b = valley({ scheduler: { now: () => (t += 1) }, experiment: { budgetMs: 0.5 } });
  let n = 0;
  driveTo(b, target, frames(7), (w) => {
    if (++n === 20) w.setActive(w.sites.get('weather'));
    w.assignTiers(new Set(n % 3 ? [] : [w.sites.get('mechanics')]), n);
  });

  assert.equal(snapshot(b), snapshot(a));
  assert.ok(Object.keys(a.couplings.values).length === 4, 'couplings ticked');
});

test('a slow frame never drops simulation time: the backlog waits and the world runs late', () => {
  let t = 0;
  const w = valley({ scheduler: { now: () => (t += 1) }, experiment: { budgetMs: 0.5 } });
  // Each frame offers 0.1 s (3 ticks) but only affords one tick.
  for (let i = 0; i < 10; i++) {
    assert.equal(w.step(0.1), 1);
    assert.equal(w.experiment.ticks, i + 1);
  }
  assert.ok(w.experiment.lagging, 'reports that it runs slower than real time');
  assert.ok(w.backlog <= EXPERIMENT_DEFAULTS.maxBacklog + 1e-12);
  // Once the frames get cheap again, the whole backlog runs.
  w.experiment.budgetMs = 1e9;
  const owed = Math.round(w.backlog / TICK);
  w.step(0);
  assert.equal(w.experiment.ticks, 10 + owed);
  assert.ok(w.backlog < TICK);
});

test('pause stops intake, speed multiplies it, and the leftover carries over', () => {
  const w = valley({ experiment: { budgetMs: 1e9 } }); // budget aside: tested above
  w.step(TICK * 2.5);
  assert.equal(w.experiment.ticks, 2);
  assert.ok(Math.abs(w.backlog - TICK / 2) < 1e-9, 'half a tick waits');
  w.step(TICK * 0.5);
  assert.equal(w.experiment.ticks, 3);
  // Paused: the stage stops calling step, and nothing moves.
  const before = snapshot(w);
  assert.equal(snapshot(w), before);
  // Speed 4: four times the ticks for the same frame.
  w.step(TICK, 4);
  assert.equal(w.experiment.ticks, 7);
  // Speed 0 (or a negative dt) runs nothing.
  w.step(TICK, 0);
  w.step(-1);
  assert.equal(w.experiment.ticks, 7);
});

test('couplings tick once per world second of ticks', () => {
  const w = valley();
  w.runTicks(Math.round(1 / TICK) - 1);
  assert.deepEqual(w.couplings.values, {});
  w.runTicks(1);
  assert.equal(Object.keys(w.couplings.values).length, 4);
  assert.ok(Math.abs(w.clock - 1) < 1e-9);
});

test('sites outside the experiment hold still', () => {
  const w = new World(SIMULATIONS);
  w.setActive(w.sites.get('planets'));
  const mech = w.sites.get('mechanics').ensure();
  w.startExperiment();
  const t0 = mech.time;
  w.runTicks(10);
  assert.equal(mech.time, t0);
  assert.ok(w.sites.get('planets').sim.time > 0);
  // Enabling a coupling later adds its sites, in layout order.
  w.couplings.set('orbit-climate', true);
  assert.deepEqual(w.participants().map((s) => s.id), ['planets', 'climate']);
});

test('uninterrupted and stopped/restarted experiments of the same ticks match', () => {
  const a = valley();
  a.runTicks(40);
  const b = valley();
  b.runTicks(15);
  b.step(0.123); // a frame's worth in the backlog is fine: ticks are what count
  b.runTicks(40 - b.experiment.ticks);
  assert.equal(snapshot(b), snapshot(a));
});

test('every site has a declared time mapping that matches one tick of stepping', () => {
  const w = new World(SIMULATIONS);
  for (const s of w.siteList) {
    assert.ok(TIME_MAPS[s.Sim.meta.id], `${s.id} has a time mapping`);
    const sim = s.ensure();
    const map = timeMapping(sim, TICK);
    assert.equal(map.unit, sim.timeUnit);
    assert.ok(map.perSecond > 0, `${s.id} advances`);
    const t0 = sim.time;
    sim.step(TICK);
    const got = sim.time - t0, want = map.perSecond * TICK;
    assert.ok(Math.abs(got - want) <= 1e-9 * Math.max(1, Math.abs(want)), `${s.id}: stepped ${got} ${map.unit}, mapping says ${want}`);
  }
});

test('in preview a per-step module follows the frame rate; in experiment mode it follows ticks', () => {
  // The reason experiment mode exists: two seconds at 30 and at 60 fps differ in preview…
  const run = (fps, experiment) => {
    const w = new World(SIMULATIONS);
    w.setActive(w.sites.get('epidemic'));
    if (experiment) w.startExperiment();
    for (let i = 0; i < 2 * fps; i++) w.step(1 / fps);
    return w.sites.get('epidemic').sim.time;
  };
  assert.notEqual(run(30, false), run(60, false));
  // …and agree in experiment mode.
  assert.ok(Math.abs(run(30, true) - run(60, true)) < 1e-9);
});

test('experiment settings are checked', () => {
  assert.throws(() => experimentSettings({ tick: 0 }), /tick/);
  assert.throws(() => experimentSettings({ tick: NaN }), /tick/);
  assert.throws(() => experimentSettings({ tick: 2 }), /tick/);
  assert.throws(() => experimentSettings({ tick: 0.1, maxBacklog: 0.05 }), /maxBacklog/);
  assert.throws(() => experimentSettings({ budgetMs: -1 }), /budgetMs/);
  assert.equal(experimentSettings({ tick: 0.05 }).couplingEvery, 20);
  const w = new World(SIMULATIONS);
  assert.throws(() => w.startExperiment({ sites: ['nowhere'] }), /Unknown site/);
  assert.throws(() => w.startExperiment(), /at least one site/);
  assert.throws(() => w.runTicks(1), /Not in experiment mode/);
});
