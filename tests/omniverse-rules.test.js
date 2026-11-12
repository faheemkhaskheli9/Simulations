import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getUniverse } from '../src/omniverse/universes.js';
import { evaluateRules } from '../src/omniverse/evaluate.js';

const at = (id, position, tick = 0) => {
  const { manifest, rulePack } = getUniverse(id);
  return evaluateRules({ manifest, rulePack, localFrameId: id + ':root', position, tick });
};

test('G0 Prime uses Earth-like gravity and ordinary local time', () => {
  assert.deepEqual(at('prime', [0, 0, 0]).gravity, [0, -9.81, 0]);
  assert.equal(at('prime', [0, 0, 0]).timeRate, 1);
  assert.deepEqual(at('prime', [0, 0, 0]).contributingFields, []);
});

test('G0 Drift gravity inverts only within its field', () => {
  const center = at('drift', [0, 0, 0], 15);
  assert.deepEqual(center.gravity, [0, 1.62, 0]);
  assert.deepEqual(center.contributingFields, ['gravity-inversion']);
  assert.equal(center.provenance.tick, 15);
  assert.equal(at('drift', [10, 0, 0]).gravity[1], -1.62);
  assert.deepEqual(at('drift', [10, 0, 0]).contributingFields, ['gravity-inversion']);
  assert.equal(at('drift', [11, 0, 0]).gravity[1], -1.62);
  assert.deepEqual(at('drift', [11, 0, 0]).contributingFields, []);
});

test('G0 Flux time is half-speed at center, graded at mid-radius and normal outside', () => {
  assert.equal(at('flux', [0, 0, 0]).timeRate, 0.5);
  assert.equal(at('flux', [5, 0, 0]).timeRate, 0.75);
  assert.equal(at('flux', [12, 0, 0]).timeRate, 1);
  assert.deepEqual(at('flux', [0, 0, 0]).gravity, [0, -9.81, 0]);
});

test('G0 field overlaps are stable by priority then lexical field id, not input order', () => {
  const { manifest, rulePack } = getUniverse('prime');
  const field = (id, priority, y) => ({
    id, capability: 'gravity-field.v1', center: [0, 0, 0], radius: 2,
    priority, operation: 'replace', value: [0, y, 0], falloff: 'constant',
  });
  const fields = [field('z-field', 0, 2), field('a-field', 0, -2), field('first', -1, 10)];
  const evaluate = (order) => evaluateRules({
    manifest, rulePack: { ...rulePack, fields: order },
    localFrameId: 'prime:root', position: [0, 0, 0], tick: 10,
  });
  const a = evaluate(fields), b = evaluate([...fields].reverse());
  assert.deepEqual(a, b);
  assert.deepEqual(a.contributingFields, ['first', 'a-field', 'z-field']);
  assert.equal(a.gravity[1], 2);
});

test('G0 evaluator rejects malformed frames, positions, ticks and unauthorized powers', () => {
  const { manifest, rulePack } = getUniverse('prime');
  const args = { manifest, rulePack, localFrameId: 'prime:root', position: [0, 0, 0], tick: 0 };
  assert.throws(() => evaluateRules({ ...args, localFrameId: 'drift:root' }), /frame/);
  assert.throws(() => evaluateRules({ ...args, position: [0, Infinity, 0] }), /finite/);
  assert.throws(() => evaluateRules({ ...args, position: [0] }), /finite/);
  assert.throws(() => evaluateRules({ ...args, tick: -1 }), /tick/);
  assert.throws(() => evaluateRules({ ...args, tick: 1.5 }), /tick/);
  assert.throws(() => evaluateRules({ ...args, transientEffects: [{ ability: 'run-script' }] }), /not supported/);
});

test('G0 resolved fields reject gravity/time limits without changing source rules', () => {
  const { manifest, rulePack } = getUniverse('prime');
  const tooStrong = {
    id: 'giant-pull', capability: 'gravity-field.v1',
    center: [0, 0, 0], radius: 2, priority: 1,
    operation: 'add', value: [0, 80, 0], falloff: 'constant',
  };
  const original = JSON.stringify(rulePack);
  assert.throws(() => evaluateRules({
    manifest, rulePack: { ...rulePack, fields: [tooStrong] },
    localFrameId: 'prime:root', position: [0, 0, 0], tick: 0,
  }), /bounded/);
  assert.equal(JSON.stringify(rulePack), original);
});
