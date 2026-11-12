// G0.05 — DOM-free, deterministic local gravity/time evaluation.
// Caller supplies tick and frame explicitly. No wall-clock, renderer or random state.
import { validateRulePair } from './validate.js';

function position3(value) {
  if (!Array.isArray(value) || value.length !== 3
    || value.some((n) => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1e6)) {
    throw new RangeError('OMNIVERSE: position must be a finite local 3D vector');
  }
  return value;
}

function order(a, b) {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Pure rule evaluator for a single root local frame.
 *
 * Spatial fields are evaluated in ascending priority and ASCII ID order.
 * Boundary points are inside the field; linear falloff has zero weight there.
 * No powers or scripted transient effects are executed in G0.
 */
export function evaluateRules({
  manifest, rulePack, localFrameId, position, tick, transientEffects = [],
}) {
  const validated = validateRulePair(manifest, rulePack);
  const universe = validated.manifest, rules = validated.rulePack;
  if (localFrameId !== universe.id + ':root') throw new RangeError('OMNIVERSE: mismatched local frame');
  position3(position);
  if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError('OMNIVERSE: invalid logical tick');
  if (!Array.isArray(transientEffects) || transientEffects.length !== 0) {
    throw new RangeError('OMNIVERSE: transient abilities are not supported in G0');
  }

  let gravity = [...rules.gravity.base];
  let timeRate = rules.time.baseRate;
  const contributingFields = [];
  for (const field of [...rules.fields].sort(order)) {
    const distance = Math.hypot(
      position[0] - field.center[0],
      position[1] - field.center[1],
      position[2] - field.center[2],
    );
    if (distance > field.radius) continue;
    const weight = field.falloff === 'constant' ? 1 : Math.max(0, 1 - distance / field.radius);
    contributingFields.push(field.id);
    if (field.capability === 'gravity-field.v1') {
      gravity = gravity.map((component, i) => field.operation === 'replace'
        ? component * (1 - weight) + field.value[i] * weight
        : component + field.value[i] * weight);
    } else {
      timeRate = field.operation === 'replace'
        ? timeRate * (1 - weight) + field.value * weight
        : timeRate * (1 + (field.value - 1) * weight);
    }
  }
  if (gravity.some((n) => !Number.isFinite(n)) || !Number.isFinite(timeRate)
    || Math.hypot(...gravity) > rules.gravity.maxMagnitude + 1e-10
    || timeRate < rules.time.minRate || timeRate > rules.time.maxRate) {
    throw new RangeError('OMNIVERSE: resolved field exceeds bounded physical rules');
  }
  return {
    gravity,
    timeRate,
    contributingFields,
    provenance: {
      manifestId: universe.id,
      rulePackId: rules.id,
      rulePackVersion: rules.version,
      localFrameId,
      tick,
    },
    warnings: [],
  };
}
