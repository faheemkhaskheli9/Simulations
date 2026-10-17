import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seriesPoints } from '../src/ui/chart.js';

const box = { x0: 10, y0: 20, width: 300, height: 100 };

test('a short recording is stretched across the whole chart width', () => {
  const pts = seriesPoints([1, 2, 3], box);
  assert.deepEqual(pts.map(([x]) => x), [10, 160, 310]);
});

test('each series fills the plot height between its own minimum and maximum', () => {
  const pts = seriesPoints([5, 15, 10], box);
  assert.deepEqual(pts.map(([, y]) => y), [120, 20, 70]);
});

test('flat and too-short series are handled', () => {
  assert.deepEqual(seriesPoints([7], box), []);
  const flat = seriesPoints([4, 4, 4], box);
  assert.ok(flat.every(([, y]) => y === 70), 'a constant series sits mid-height');
});
