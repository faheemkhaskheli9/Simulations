import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getUniverse } from '../src/omniverse/universes.js';
import { queryCapability, planTransfer } from '../src/omniverse/transfer.js';

const from = getUniverse('prime').manifest;
const to = getUniverse('drift').manifest;
const entity = () => ({
  kind: 'probe', massKg: 10, position: [0, 0, 0], velocity: [0, 0, 0],
  frameId: 'prime:root',
});
const frames = (target = 'prime') => ({ sourceFrameId: 'prime:root', targetFrameId: target + ':root' });

test('G0 ability query distinguishes physical capability from executable power', () => {
  const pack = getUniverse('prime').rulePack;
  assert.deepEqual(queryCapability(pack, { id: 'gravity-control' }, [0, 0, 0]), {
    supported: true, executable: false, reason: 'preflight-only', capability: 'gravity-field.v1',
  });
  assert.equal(queryCapability(pack, { id: 'energy-weave' }, [0, 0, 0]).reason, 'capability-not-implemented');
  assert.equal(queryCapability(pack, { id: 'unknown' }, [0, 0, 0]).reason, 'unknown-ability');
  assert.equal(queryCapability(pack, { id: 'gravity-control' }, [Infinity, 0, 0]).reason, 'invalid-query');
});

test('G0 transfer preflight permits identity without teleporting or changing state', () => {
  const original = entity();
  const result = planTransfer(from, from, original, frames());
  assert.deepEqual(result, { status: 'allowed', reasons: [], transforms: [] });
  assert.deepEqual(original, entity(), 'preflight is pure');
});

test('G0 transfer preflight blocks cross-universe portals until transformations exist', () => {
  assert.deepEqual(planTransfer(from, to, entity(), frames('drift')), {
    status: 'blocked', reasons: ['portal-runtime-unimplemented'], transforms: [],
  });
  assert.equal(planTransfer(from, to, entity(), frames('flux')).reasons[0], 'incompatible-frame');
  assert.equal(planTransfer(from, from, { ...entity(), massKg: NaN }, frames()).reasons[0], 'invalid-entity');
  assert.equal(planTransfer(from, { ...to, id: 'unknown' }, entity(), frames('unknown')).status, 'blocked');
  assert.equal(planTransfer(from, { ...to, rulePackVersion: 2 }, entity(), frames('drift')).status, 'blocked');
});
