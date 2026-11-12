// G0.08: capability and portal compatibility preflight only.
// No ability is executable and no teleportation occurs in this module.
import { parseUniverseManifest, parseRulePack } from './validate.js';
import { getUniverse } from './universes.js';

const ABILITIES = Object.freeze({
  'gravity-control': 'gravity-field.v1',
  'kinetic-redirect': null,
  'energy-weave': null,
  'time-shear': 'local-time-rate.v1',
});

const blocked = (reason) => ({ status: 'blocked', reasons: [reason], transforms: [] });
const vec3 = (x) => Array.isArray(x) && x.length === 3 && x.every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e6);

/** Whether a ruleset declares the law an eventual ability needs. G0 cannot execute abilities. */
export function queryCapability(rulePack, descriptor, position) {
  const rules = parseRulePack(rulePack);
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)
    || typeof descriptor.id !== 'string' || !vec3(position)) {
    return { supported: false, executable: false, reason: 'invalid-query' };
  }
  if (!Object.hasOwn(ABILITIES, descriptor.id)) return { supported: false, executable: false, reason: 'unknown-ability' };
  const capability = ABILITIES[descriptor.id];
  if (!capability) return { supported: false, executable: false, reason: 'capability-not-implemented' };
  if (!rules.capabilities.includes(capability)) return { supported: false, executable: false, reason: 'missing-capability' };
  return { supported: true, executable: false, reason: 'preflight-only', capability };
}

/**
 * Validate a potential transfer, without moving or transforming an entity.
 * G0 permits an identity preflight in the same universe only. Cross-universe
 * transfers need the G2 transform and conserved-quantity policies first.
 */
export function planTransfer(sourceManifest, targetManifest, entityDescriptor, frames) {
  let source, target;
  try {
    source = parseUniverseManifest(sourceManifest);
    target = parseUniverseManifest(targetManifest);
  } catch {
    return blocked('invalid-manifest');
  }
  try {
    const sourceKnown = getUniverse(source.id).manifest;
    const targetKnown = getUniverse(target.id).manifest;
    if (JSON.stringify(sourceKnown) !== JSON.stringify(source)
      || JSON.stringify(targetKnown) !== JSON.stringify(target)) return blocked('unknown-universe-version');
  } catch {
    return blocked('unknown-universe');
  }
  if (!frames || typeof frames !== 'object'
    || frames.sourceFrameId !== source.id + ':root'
    || frames.targetFrameId !== target.id + ':root') return blocked('incompatible-frame');
  if (!entityDescriptor || typeof entityDescriptor !== 'object'
    || !['probe', 'player', 'object'].includes(entityDescriptor.kind)
    || !(typeof entityDescriptor.massKg === 'number' && Number.isFinite(entityDescriptor.massKg)
      && entityDescriptor.massKg >= 0 && entityDescriptor.massKg <= 1e12)
    || !vec3(entityDescriptor.position) || !vec3(entityDescriptor.velocity)
    || entityDescriptor.frameId !== frames.sourceFrameId) return blocked('invalid-entity');
  if (source.id === target.id) return { status: 'allowed', reasons: [], transforms: [] };
  return blocked('portal-runtime-unimplemented');
}
