import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHash, coerceParams, parseHash } from '../src/ui/persistence.js';

const defs = [
  { key: 'enabled', type: 'checkbox' },
  { key: 'level', type: 'range', min: 0, max: 5 },
  { key: 'mode', type: 'select', options: [{ value: 'fast' }, { value: 'slow' }] },
];

test('malformed percent escapes in share-link paths return an empty navigation target', () => {
  for (const hash of ['#gravity/%', '#%ZZ/solar?level=2', '#gravity/%E0%A4%A']) {
    assert.deepEqual(parseHash(hash), { simId: '', scenarioId: '', params: {} });
  }
  assert.deepEqual(parseHash(buildHash('a/b', 'c%d', { level: 3 })), {
    simId: 'a/b', scenarioId: 'c%d', params: { level: '3' },
  });
});

test('valid shared parameters are typed, bounded and filtered', () => {
  assert.deepEqual(coerceParams(defs, {
    enabled: 'false', level: '12.5', mode: 'fast', extra: 'ignored',
  }), { enabled: false, level: 5, mode: 'fast' });
  assert.deepEqual(coerceParams(defs, {
    enabled: '1', level: '-8', mode: 'slow',
  }), { enabled: true, level: 0, mode: 'slow' });
});

test('invalid checkbox, blank and non-finite numeric values never override defaults', () => {
  assert.deepEqual(coerceParams(defs, { enabled: 'maybe', level: '', mode: 'invalid' }), {});
  assert.deepEqual(coerceParams(defs, { enabled: '', level: '   ', mode: 'slow' }), { mode: 'slow' });
  assert.deepEqual(coerceParams(defs, { enabled: '0', level: 'Infinity' }), { enabled: false });
  assert.deepEqual(coerceParams(defs, { enabled: 'true', level: null }), { enabled: true });
});

test('inherited values are not treated as supplied link parameters', () => {
  const raw = Object.create({ level: '4', mode: 'slow' });
  raw.enabled = 'true';
  assert.deepEqual(coerceParams(defs, raw), { enabled: true });
});
