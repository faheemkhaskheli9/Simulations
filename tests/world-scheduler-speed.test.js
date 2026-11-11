// F1.2: interactive preview must apply the same speed to active and ambient sites.
// Fixed-tick experiment mode is covered separately by world-execution.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scheduler } from '../src/world/scheduler.js';

function site(id, clock, { tier = 'ambient', costMs = 0 } = {}) {
  const s = { id, tier, acc: 0, cost: 0, error: null, steps: [] };
  s.sim = { step(dt) { s.steps.push(dt); clock.now += costMs; } };
  return s;
}

test('preview applies the same speed to active and ambient simulations', () => {
  const clock = { now: 0 };
  const scheduler = new Scheduler({ now: () => clock.now });
  const active = site('active', clock, { tier: 'active' });
  const background = site('background', clock);
  scheduler.step([active, background], active, 0.02, 3);
  assert.deepEqual(active.steps, [0.06]);
  assert.deepEqual(background.steps, [0.06]);
  scheduler.step([active, background], active, 0.02, 0.5);
  assert.equal(active.steps[1], 0.01);
  assert.equal(background.steps[1], 0.01);
});

test('capped catch-up uses scaled, not unscaled, simulation time', () => {
  const clock = { now: 0 };
  const scheduler = new Scheduler({ now: () => clock.now, budgetMs: 10 });
  const a = site('a', clock, { costMs: 11 });
  const b = site('b', clock, { costMs: 11 });
  for (let frame = 0; frame < 6; frame++) scheduler.step([a, b], null, 0.02, 5);
  assert.ok(a.steps.length > 0 && b.steps.length > 0);
  for (const s of [a, b]) {
    for (const dt of s.steps) assert.ok(dt > 0 && dt <= 4 * 0.02 * 5 + 1e-12, `${s.id} got ${dt}`);
  }
});

test('zero speed and invalid frame inputs do not advance or poison pending time', () => {
  const clock = { now: 0 };
  const scheduler = new Scheduler({ now: () => clock.now });
  const active = site('active', clock, { tier: 'active' });
  const background = site('background', clock);
  scheduler.step([active, background], active, 0.02, 1);
  const previous = background.acc;
  for (const [dt, speed] of [[0.02, 0], [0.02, -1], [-1, 1], [NaN, 1], [0.02, NaN], [Infinity, 1]]) {
    assert.deepEqual(scheduler.step([active, background], active, dt, speed), []);
  }
  assert.equal(active.steps.length, 1);
  assert.equal(background.steps.length, 1);
  assert.equal(background.acc, previous);
});
