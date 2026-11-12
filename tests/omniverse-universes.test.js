import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getUniverse, listUniverses } from '../src/omniverse/universes.js';
import { validateRulePair } from '../src/omniverse/validate.js';

test('G0 registry lists the three expected versioned game universes', () => {
  assert.deepEqual(listUniverses().map((x) => x.id), ['prime', 'drift', 'flux']);
  for (const { id, frameId } of listUniverses()) {
    const { manifest, rulePack } = getUniverse(id);
    assert.equal(frameId, id + ':root');
    assert.equal(manifest.rulePackId, rulePack.id);
    assert.equal(manifest.rulePackVersion, rulePack.version);
    assert.ok(Object.isFrozen(rulePack.fields));
    assert.deepEqual(validateRulePair(manifest, rulePack), getUniverse(id));
  }
});

test('G0 registry rejects unknown prototype keys and cannot be modified by callers', () => {
  for (const key of ['__proto__', 'constructor', 'toString', 'unknown']) {
    assert.throws(() => getUniverse(key), /Unknown/);
  }
  const prime = getUniverse('prime');
  assert.throws(() => { prime.rulePack.gravity.base[1] = 0; }, TypeError);
  assert.equal(getUniverse('prime').rulePack.gravity.base[1], -9.81);
});
