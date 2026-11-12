import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUniverseManifest, parseRulePack, validateRulePair } from '../src/omniverse/validate.js';
import { LOCAL_FRAME, SI_UNITS } from '../src/omniverse/schema.js';

const manifest = () => ({
  format: 'omniverse-universe', schemaVersion: 1, id: 'prime', seed: 12345,
  generatorVersion: 1, rulePackId: 'prime-v1', rulePackVersion: 1,
  spatialFrame: LOCAL_FRAME, units: { ...SI_UNITS }, displayName: 'Prime',
  contentProfile: { biome: 'temperate' },
});
const pack = () => ({
  format: 'omniverse-rules', schemaVersion: 1, id: 'prime-v1', version: 1,
  capabilities: ['gravity-field.v1', 'local-time-rate.v1'],
  gravity: { base: [0, -9.81, 0], maxMagnitude: 50 },
  time: { baseRate: 1, minRate: 0.1, maxRate: 4 },
  fields: [],
});
const field = () => ({
  id: 'zone', capability: 'gravity-field.v1', center: [0, 0, 0],
  radius: 10, priority: 0, operation: 'replace', value: [0, 1.62, 0],
  falloff: 'linear',
});

test('G0 schemas accept a valid pair and detach it from mutable source objects', () => {
  const original = manifest(), rules = pack();
  const validated = validateRulePair(original, rules);
  assert.equal(validated.manifest.id, 'prime');
  assert.ok(Object.isFrozen(validated.rulePack.gravity.base));
  original.seed = 9;
  rules.gravity.base[1] = 99;
  assert.equal(validated.manifest.seed, 12345);
  assert.equal(validated.rulePack.gravity.base[1], -9.81);
});

test('G0 manifest rejects unknown keys, bad frame and invalid units', () => {
  assert.throws(() => parseUniverseManifest({ ...manifest(), evil: 1 }), /unknown key/);
  assert.throws(() => parseUniverseManifest({ ...manifest(), spatialFrame: 'solar-au' }), /frame/);
  assert.throws(() => parseUniverseManifest({ ...manifest(), units: { ...SI_UNITS, position: 'au' } }), /unit/);
  assert.throws(() => parseUniverseManifest({ ...manifest(), seed: -1 }), /seed/);
  assert.throws(() => parseUniverseManifest({ ...manifest(), displayName: '<script>\n' }), /display text/);
});

test('G0 RulePack rejects unknown capabilities, bad vectors and invalid operations', () => {
  assert.throws(() => parseRulePack({ ...pack(), capabilities: ['execute-script.v1'] }), /unsupported/);
  assert.throws(() => parseRulePack({ ...pack(), fields: [{ ...field(), radius: 0 }] }), /radius/);
  assert.throws(() => parseRulePack({ ...pack(), fields: [{ ...field(), center: [0, NaN, 0] }] }), /out of range/);
  assert.throws(() => parseRulePack({ ...pack(), fields: [{ ...field(), operation: 'multiply' }] }), /operation/);
  assert.throws(() => parseRulePack({ ...pack(), fields: [field(), field()] }), /duplicate field ids/);
  assert.throws(() => parseRulePack({ ...pack(), time: { baseRate: 0, minRate: 0.1, maxRate: 4 } }), /base time rate/);
  assert.throws(() => parseRulePack({ ...pack(), gravity: { base: [0, -500, 0], maxMagnitude: 100 } }), /base gravity/);
});

test('G0 pair refuses unknown schema and mismatched versions without mutating inputs', () => {
  assert.throws(() => validateRulePair({ ...manifest(), schemaVersion: 2 }, pack()), /format\/version/);
  assert.throws(() => validateRulePair(manifest(), { ...pack(), version: 2 }), /incompatible/);
  assert.throws(() => parseRulePack(Object.assign(Object.create(null), { ...pack(), __proto__: null, injection: 1 })), /unknown key/);
});
