import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildReference } from '../scripts/reference.mjs';

test('docs/REFERENCE.md matches the code (run `npm run docs:reference` to update)', () => {
  const onDisk = readFileSync(new URL('../docs/REFERENCE.md', import.meta.url), 'utf8');
  assert.equal(onDisk, buildReference());
});
