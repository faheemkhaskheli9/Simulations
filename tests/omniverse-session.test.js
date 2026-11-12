import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameSession, SESSION_FORMAT } from '../src/omniverse/session.js';

test('G0 session switches universes without touching scientific engine instances', () => {
  const game = new GameSession();
  assert.deepEqual(game.evaluate([0, 0, 0]).gravity, [0, -9.81, 0]);
  game.advanceTicks(3);
  game.selectUniverse('drift');
  assert.deepEqual(game.evaluate([0, 0, 0]).gravity, [0, 1.62, 0]);
  game.selectUniverse('flux');
  assert.equal(game.evaluate([0, 0, 0]).timeRate, 0.5);
  assert.equal(game.logicalTick, 3);
});

test('G0 session checkpoint resumes exactly and keeps schema/rulepack provenance', () => {
  const a = new GameSession('drift', 999);
  a.advanceTicks(123);
  const saved = JSON.parse(JSON.stringify(a.serialize()));
  assert.equal(saved.format, SESSION_FORMAT);
  const b = new GameSession();
  b.load(saved);
  assert.deepEqual(b.serialize(), saved);
  assert.deepEqual(b.evaluate([4, 3, 0]), a.evaluate([4, 3, 0]));
  a.advanceTicks(5);
  b.advanceTicks(5);
  assert.deepEqual(a.serialize(), b.serialize());
});

test('G0 session rejects all incompatible imports atomically', () => {
  const game = new GameSession();
  const initial = game.serialize();
  const corruptions = [
    { ...initial, format: 'simulations-world' },
    { ...initial, schemaVersion: 999 },
    { ...initial, selectedUniverseId: '__proto__' },
    { ...initial, logicalTick: -2 },
    { ...initial, logicalTick: NaN },
    { ...initial, seed: 0x100000000 },
    { ...initial, rulePackVersion: 2 },
    { ...initial, rulePackId: 'unknown' },
    { ...initial, arbitrary: 'payload' },
  ];
  for (const invalid of corruptions) {
    assert.throws(() => game.load(invalid));
    assert.deepEqual(game.serialize(), initial, 'partial mutation on failed load');
  }
});

test('G0 tick API validates overflow and invalid counts', () => {
  const game = new GameSession();
  for (const count of [-1, 0.5, Infinity, NaN]) assert.throws(() => game.advanceTicks(count));
  game.advanceTicks(Number.MAX_SAFE_INTEGER);
  assert.throws(() => game.advanceTicks(1), /logical tick/);
});
