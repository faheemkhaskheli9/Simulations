import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIMULATIONS } from '../src/sims/index.js';
import { encodeTyped, decodeInto } from '../src/core/serialize.js';

test('typed arrays round-trip through base64', () => {
  const a = new Float32Array([1.5, -2, 3e-7, 42]);
  const b = decodeInto(new Float32Array(4), encodeTyped(a));
  assert.deepEqual([...b], [...a]);
  assert.throws(() => decodeInto(new Float32Array(3), encodeTyped(a)));
});

for (const S of SIMULATIONS) {
  test(`${S.meta.id}: save → JSON → load reproduces the world and its future`, () => {
    const a = new S();
    for (let i = 0; i < 5; i++) a.step(1 / 30);
    const json = JSON.stringify(a.serialize());
    const b = new S();
    b.loadScenario(b.scenarios[b.scenarios.length - 1].id); // start from a different world
    b.deserialize(JSON.parse(json));
    assert.equal(JSON.stringify(b.serialize()), json, 'restored snapshot differs');
    for (let i = 0; i < 5; i++) { a.step(1 / 30); b.step(1 / 30); }
    assert.equal(JSON.stringify(b.serialize()), JSON.stringify(a.serialize()), 'futures diverge');
  });

  test(`${S.meta.id}: rejects saves for other simulations or formats`, () => {
    const sim = new S();
    assert.throws(() => sim.deserialize({ format: 'nope' }));
    assert.throws(() => sim.deserialize({ ...sim.serialize(), sim: 'other' }));
    assert.throws(() => sim.deserialize({ ...sim.serialize(), version: 999 }));
  });
}
