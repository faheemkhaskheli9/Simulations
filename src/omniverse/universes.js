// G0.04 — three deterministic, finite, game-only rule fixtures.
// These are fictional game rules, not claims of scientific accuracy.
import { validateRulePair } from './validate.js';
import { LOCAL_FRAME, SI_UNITS } from './schema.js';

function universe(id, seed, displayName, biome, gravity, fields = []) {
  const manifest = {
    format: 'omniverse-universe', schemaVersion: 1, id, seed,
    generatorVersion: 1, rulePackId: id + '-v1', rulePackVersion: 1,
    spatialFrame: LOCAL_FRAME, units: { ...SI_UNITS },
    displayName, contentProfile: { biome },
  };
  const rulePack = {
    format: 'omniverse-rules', schemaVersion: 1, id: id + '-v1', version: 1,
    capabilities: ['gravity-field.v1', 'local-time-rate.v1'],
    gravity: { base: gravity, maxMagnitude: 50 },
    time: { baseRate: 1, minRate: 0.1, maxRate: 4 },
    fields,
  };
  return validateRulePair(manifest, rulePack);
}

const BUILT_INS = Object.freeze({
  prime: universe('prime', 12345, 'Prime', 'temperate', [0, -9.81, 0]),
  drift: universe('drift', 23456, 'Drift', 'floating', [0, -1.62, 0], [{
    id: 'gravity-inversion', capability: 'gravity-field.v1',
    center: [0, 0, 0], radius: 10, priority: 0,
    operation: 'replace', value: [0, 1.62, 0], falloff: 'linear',
  }]),
  flux: universe('flux', 34567, 'Flux', 'temporal', [0, -9.81, 0], [{
    id: 'slow-time-zone', capability: 'local-time-rate.v1',
    center: [0, 0, 0], radius: 10, priority: 0,
    operation: 'replace', value: 0.5, falloff: 'linear',
  }]),
});

export function listUniverses() {
  return Object.values(BUILT_INS).map(({ manifest }) => ({
    id: manifest.id, displayName: manifest.displayName, frameId: manifest.id + ':root',
  }));
}

export function getUniverse(id) {
  if (!Object.hasOwn(BUILT_INS, id)) throw new RangeError('Unknown OMNIVERSE universe: ' + id);
  return BUILT_INS[id];
}
