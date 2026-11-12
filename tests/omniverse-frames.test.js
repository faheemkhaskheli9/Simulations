import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/omniverse/session.js';
import { sampleLocalPhysics } from '../src/omniverse/frames.js';

test('G0 local SI adapter preserves gravity/time dimensions and input immutability', () => {
  const game = new GameSession('prime');
  const p = [1, 2, 3];
  const a = sampleLocalPhysics(game, { frameId: 'prime:root', position: p, dtGlobal: 0.02 });
  assert.deepEqual(a.accelerationMetersPerSecondSquared, [0, -9.81, 0]);
  assert.equal(a.dtGlobalSeconds, 0.02);
  assert.equal(a.dtLocalSeconds, 0.02);
  assert.equal(game.logicalTick, 0, 'sampling never advances authoritative clock');
  p[0] = 999;
  assert.equal(a.positionMeters[0], 1, 'outgoing sample is detached from mutable source');
  assert.ok(Object.isFrozen(a.accelerationMetersPerSecondSquared));
});

test('G0 local time scales only the entity step, never the shared logical clock', () => {
  const game = new GameSession('flux');
  game.advanceTicks(3);
  const sample = sampleLocalPhysics(game, { frameId: 'flux:root', position: [0, 0, 0], dtGlobal: 0.02 });
  assert.equal(sample.dtLocalSeconds, 0.01);
  assert.equal(sample.timeRate, 0.5);
  assert.equal(game.logicalTick, 3);
  const normal = sampleLocalPhysics(game, { frameId: 'flux:root', position: [20, 0, 0], dtGlobal: 0.02 });
  assert.equal(normal.dtLocalSeconds, 0.02);
});

test('G0 local adapter rejects frame mixing, bad timesteps and nonfinite state', () => {
  const game = new GameSession('drift');
  assert.deepEqual(sampleLocalPhysics(game, {
    frameId: 'drift:root', position: [0, 0, 0], dtGlobal: 0.03,
  }).accelerationMetersPerSecondSquared, [0, 1.62, 0]);
  assert.throws(() => sampleLocalPhysics(game, { frameId: 'prime:root', position: [0, 0, 0], dtGlobal: 0.03 }), /frame/);
  for (const dtGlobal of [-1, 2, Infinity, NaN]) {
    assert.throws(() => sampleLocalPhysics(game, { frameId: 'drift:root', position: [0, 0, 0], dtGlobal }), /dtGlobal/);
  }
  assert.throws(() => sampleLocalPhysics(game, { frameId: 'drift:root', position: [0, NaN, 0], dtGlobal: 0.03 }), /position/);
});
