// G0.07 — a minimal, isolated game session; science snapshots are untouched.
import { getUniverse } from './universes.js';
import { evaluateRules } from './evaluate.js';

export const SESSION_FORMAT = 'omniverse-session';
export const SESSION_VERSION = 1;

function validInteger(value, label, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid OMNIVERSE ' + label);
  return value;
}

function parseSession(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new RangeError('Invalid OMNIVERSE session');
  const proto = Object.getPrototypeOf(input);
  if (proto !== Object.prototype && proto !== null) throw new RangeError('Invalid OMNIVERSE session prototype');
  const required = ['format', 'schemaVersion', 'selectedUniverseId', 'seed', 'logicalTick', 'rulePackId', 'rulePackVersion'];
  if (Object.keys(input).length !== required.length || required.some((key) => !Object.hasOwn(input, key))) {
    throw new RangeError('Invalid OMNIVERSE session fields');
  }
  if (input.format !== SESSION_FORMAT || input.schemaVersion !== SESSION_VERSION) throw new RangeError('Incompatible OMNIVERSE session version');
  const { manifest, rulePack } = getUniverse(input.selectedUniverseId);
  if (input.rulePackId !== rulePack.id || input.rulePackVersion !== rulePack.version) {
    throw new RangeError('Incompatible OMNIVERSE rulepack reference');
  }
  return {
    format: SESSION_FORMAT, schemaVersion: SESSION_VERSION,
    selectedUniverseId: manifest.id,
    seed: validInteger(input.seed, 'seed', 0, 0xffffffff),
    logicalTick: validInteger(input.logicalTick, 'logical tick', 0, Number.MAX_SAFE_INTEGER),
    rulePackId: rulePack.id, rulePackVersion: rulePack.version,
  };
}

export class GameSession {
  constructor(universeId = 'prime', seed = 12345) {
    const { rulePack } = getUniverse(universeId);
    this.state = parseSession({
      format: SESSION_FORMAT, schemaVersion: SESSION_VERSION,
      selectedUniverseId: universeId, seed, logicalTick: 0,
      rulePackId: rulePack.id, rulePackVersion: rulePack.version,
    });
  }

  get selectedUniverseId() { return this.state.selectedUniverseId; }
  get logicalTick() { return this.state.logicalTick; }

  /** Explicitly select a rulepack. No implicit changes to science models. */
  selectUniverse(id) {
    const { rulePack } = getUniverse(id);
    this.state = {
      ...this.state, selectedUniverseId: id,
      rulePackId: rulePack.id, rulePackVersion: rulePack.version,
    };
  }

  advanceTicks(count = 1) {
    validInteger(count, 'tick increment', 0, Number.MAX_SAFE_INTEGER);
    this.state.logicalTick = validInteger(this.logicalTick + count, 'logical tick', 0, Number.MAX_SAFE_INTEGER);
  }

  evaluate(position) {
    const { manifest, rulePack } = getUniverse(this.state.selectedUniverseId);
    return evaluateRules({
      manifest, rulePack, localFrameId: manifest.id + ':root',
      position, tick: this.state.logicalTick,
    });
  }

  serialize() { return { ...this.state }; }

  /** Parsing and version checks finish before replacing any live session state. */
  load(input) {
    const replacement = parseSession(input);
    this.state = replacement;
    return this;
  }
}
