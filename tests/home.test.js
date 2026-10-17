import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldWelcome } from '../src/ui/home.js';

test('the welcome screen opens on a plain first visit only', () => {
  assert.equal(shouldWelcome('', null), true);
  assert.equal(shouldWelcome('#', null), true);
  assert.equal(shouldWelcome('#climate/today', null), false, 'deep links go straight to the simulation');
  assert.equal(shouldWelcome('', '1'), false, 'the user turned it off');
});
