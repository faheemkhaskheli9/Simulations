import {
  OMNIVERSE_SCHEMA_VERSION, UNIVERSE_FORMAT, RULEPACK_FORMAT,
  LOCAL_FRAME, SI_UNITS, CAPABILITIES, MAX_SPATIAL_FIELDS,
} from './schema.js';

function fail(message) { throw new RangeError('OMNIVERSE: ' + message); }

function record(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(label + ' must be a plain object');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(label + ' must be a plain object');
  return value;
}

function keys(value, required, optional, label) {
  record(value, label);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(label + ' has unknown key ' + key);
  for (const key of required) if (!Object.hasOwn(value, key)) fail(label + ' is missing ' + key);
}

function id(value, label) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(value)) fail(label + ' must be a stable slug');
  return value;
}

function humanText(value, label, limit = 120) {
  if (typeof value !== 'string' || value.length === 0 || value.length > limit || /[\u0000-\u001f\u007f]/.test(value)) {
    fail(label + ' must be nonempty, bounded display text');
  }
  return value;
}

function number(value, label, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(label + ' is out of range');
  return value;
}

function integer(value, label, min, max) {
  if (!Number.isSafeInteger(value)) fail(label + ' must be an integer');
  return number(value, label, min, max);
}

function vector(value, label, limit) {
  if (!Array.isArray(value) || value.length !== 3) fail(label + ' must be a 3D vector');
  return value.map((n, i) => number(n, label + '[' + i + ']', -limit, limit));
}

function enumValue(value, label, options) {
  if (!options.includes(value)) fail(label + ' is unsupported');
  return value;
}

function immutable(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) immutable(item);
    Object.freeze(value);
  }
  return value;
}

/** Fully normalize and freeze an untrusted UniverseManifest v1. */
export function parseUniverseManifest(input) {
  keys(input, ['format', 'schemaVersion', 'id', 'seed', 'generatorVersion', 'rulePackId',
    'rulePackVersion', 'spatialFrame', 'units', 'displayName', 'contentProfile'], [], 'manifest');
  if (input.format !== UNIVERSE_FORMAT || input.schemaVersion !== OMNIVERSE_SCHEMA_VERSION) fail('unsupported manifest format/version');
  if (input.spatialFrame !== LOCAL_FRAME) fail('unsupported local frame');
  keys(input.units, Object.keys(SI_UNITS), [], 'manifest units');
  for (const [key, expected] of Object.entries(SI_UNITS)) {
    if (input.units[key] !== expected) fail('manifest unit ' + key + ' must be ' + expected);
  }
  keys(input.contentProfile, ['biome'], ['description'], 'content profile');
  const profile = { biome: id(input.contentProfile.biome, 'biome') };
  if (input.contentProfile.description !== undefined) profile.description = humanText(input.contentProfile.description, 'biome description', 200);
  return immutable({
    format: UNIVERSE_FORMAT,
    schemaVersion: OMNIVERSE_SCHEMA_VERSION,
    id: id(input.id, 'universe id'),
    seed: integer(input.seed, 'seed', 0, 0xffffffff),
    generatorVersion: integer(input.generatorVersion, 'generator version', 1, 65535),
    rulePackId: id(input.rulePackId, 'rulepack id'),
    rulePackVersion: integer(input.rulePackVersion, 'rulepack version', 1, 65535),
    spatialFrame: LOCAL_FRAME,
    units: { ...SI_UNITS },
    displayName: humanText(input.displayName, 'display name'),
    contentProfile: profile,
  });
}

function parseField(field, capabilities) {
  keys(field, ['id', 'capability', 'center', 'radius', 'priority', 'operation', 'value', 'falloff'], [], 'field');
  const capability = enumValue(field.capability, 'field capability', CAPABILITIES);
  if (!capabilities.includes(capability)) fail('field capability is not declared by rulepack');
  const gravity = capability === 'gravity-field.v1';
  const operation = enumValue(field.operation, 'field operation', gravity ? ['replace', 'add'] : ['replace', 'multiply']);
  return {
    id: id(field.id, 'field id'),
    capability,
    center: vector(field.center, 'field center', 1e6),
    radius: number(field.radius, 'field radius', 1e-6, 1e6),
    priority: integer(field.priority, 'field priority', -100, 100),
    operation,
    value: gravity ? vector(field.value, 'field gravity', 100) : number(field.value, 'field time rate', 0.01, 10),
    falloff: enumValue(field.falloff, 'field falloff', ['constant', 'linear']),
  };
}

/** Fully normalize and freeze a data-only RulePack; never execute imported expressions. */
export function parseRulePack(input) {
  keys(input, ['format', 'schemaVersion', 'id', 'version', 'capabilities',
    'gravity', 'time', 'fields'], [], 'rulepack');
  if (input.format !== RULEPACK_FORMAT || input.schemaVersion !== OMNIVERSE_SCHEMA_VERSION) fail('unsupported rulepack format/version');
  if (!Array.isArray(input.capabilities) || input.capabilities.length === 0 || input.capabilities.length > CAPABILITIES.length) fail('invalid capabilities');
  const capabilities = input.capabilities.map((c) => enumValue(c, 'capability', CAPABILITIES));
  if (new Set(capabilities).size !== capabilities.length) fail('duplicate capabilities');
  keys(input.gravity, ['base', 'maxMagnitude'], [], 'gravity');
  const gravity = {
    base: vector(input.gravity.base, 'base gravity', 100),
    maxMagnitude: number(input.gravity.maxMagnitude, 'max gravity', 0.01, 100),
  };
  if (Math.hypot(...gravity.base) > gravity.maxMagnitude) fail('base gravity exceeds allowed magnitude');
  keys(input.time, ['baseRate', 'minRate', 'maxRate'], [], 'time');
  const time = {
    baseRate: number(input.time.baseRate, 'base time rate', 0.01, 10),
    minRate: number(input.time.minRate, 'minimum time rate', 0.01, 10),
    maxRate: number(input.time.maxRate, 'maximum time rate', 0.01, 10),
  };
  if (time.minRate > time.baseRate || time.baseRate > time.maxRate) fail('invalid time-rate limits');
  if (!Array.isArray(input.fields) || input.fields.length > MAX_SPATIAL_FIELDS) fail('too many fields');
  const fields = input.fields.map((field) => parseField(field, capabilities));
  if (new Set(fields.map((field) => field.id)).size !== fields.length) fail('duplicate field ids');
  return immutable({
    format: RULEPACK_FORMAT,
    schemaVersion: OMNIVERSE_SCHEMA_VERSION,
    id: id(input.id, 'rulepack id'),
    version: integer(input.version, 'rulepack version', 1, 65535),
    capabilities,
    gravity,
    time,
    fields,
  });
}

/** Manifest/RulePack version agreement must be checked before evaluation or import. */
export function validateRulePair(manifest, pack) {
  const universe = parseUniverseManifest(manifest);
  const rules = parseRulePack(pack);
  if (universe.rulePackId !== rules.id || universe.rulePackVersion !== rules.version) {
    fail('manifest references an incompatible rulepack');
  }
  return immutable({ manifest: universe, rulePack: rules });
}
