import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHash, parseHash, coerceParams, diffParams, toCSV } from '../src/ui/persistence.js';
import { History } from '../src/ui/history.js';
import { GravitySim } from '../src/sims/gravity.js';

test('share links round-trip simulation, scenario and parameters', () => {
  const h = buildHash('gravity', 'solar', { gScale: 2, merge: false });
  assert.deepEqual(parseHash(h), { simId: 'gravity', scenarioId: 'solar', params: { gScale: '2', merge: 'false' } });
  assert.deepEqual(parseHash('#atoms'), { simId: 'atoms', scenarioId: '', params: {} });
});

test('link parameters are typed, clamped and filtered', () => {
  const defs = new GravitySim().paramDefs;
  const p = coerceParams(defs, { gScale: '99', merge: 'false', trails: '1', evil: 'x', softening: 'abc' });
  assert.deepEqual(p, { gScale: 5, merge: false, trails: true });
});

test('diffParams only reports changed values', () => {
  assert.deepEqual(diffParams({ a: 1, b: true, c: 0.1 + 0.2 }, { a: 1, b: false, c: 0.3 }), { b: true });
});

test('CSV escapes values', () => {
  const csv = toCSV([{ t: 1, s: 'a,b' }], [{ key: 't', label: 'Time' }, { key: 's', label: 'Note "x"' }]);
  assert.equal(csv, 'Time,"Note ""x"""\n1,"a,b"\n');
});

test('undo/redo restores snapshots in order', () => {
  const h = new History(2);
  h.checkpoint('s0'); h.checkpoint('s1'); h.checkpoint('s2'); // s0 falls off (limit 2)
  assert.equal(h.undo('s3'), 's2');
  assert.equal(h.undo('s2'), 's1');
  assert.equal(h.undo('s1'), null);
  assert.equal(h.redo('s1'), 's2');
  h.checkpoint('new');
  assert.equal(h.canRedo, false);
});
