import { Random } from './random.js';
import { SAVE_FORMAT, SAVE_VERSION } from './serialize.js';

/**
 * Base class for every simulation module.
 *
 * A simulation owns its world state and exposes a small, uniform interaction
 * surface so the shared UI can offer the same tools everywhere:
 *
 *   inspect  – pick(x, y) + describe(entity) / setProperty(entity, key, value)
 *   move     – move(entity, x, y)
 *   add      – add(kind, x, y)              (kinds listed in spawnKinds)
 *   remove   – removeAt(x, y, radius)
 *   force    – impulse(entity|null, x, y, dx, dy)
 *   energy   – energy(x, y, radius, amount) (amount > 0 adds, < 0 removes)
 *
 * Tunable global parameters are declared in paramDefs and read from this.params.
 */
export class Simulation {
  static meta = {
    id: 'base',
    title: 'Base',
    category: 'Misc',
    description: '',
    yUp: false, // world y axis points up (e.g. altitude) instead of down
  };

  constructor({ seed = 12345 } = {}) {
    this.rng = new Random(seed);
    this.time = 0;
    this.params = {};
    this.paramDefs = [];
    this.spawnKinds = [];
    this.scenarios = [];
    this.energyTool = { label: 'Add energy', negLabel: 'Remove energy' };
    this.timeUnit = 's';
    this.background = '#05070d';
    this.chartKeys = [];
  }

  get meta() {
    return this.constructor.meta;
  }

  defineParams(defs) {
    this.paramDefs = defs;
    for (const d of defs) if (!(d.key in this.params)) this.params[d.key] = d.value;
  }

  setParam(key, value) {
    this.params[key] = value;
    this.onParamChange(key, value);
  }

  onParamChange() {}

  loadScenario(id) {
    this.time = 0;
    this.scenarioId = id;
  }

  /** Advance by `dt` real seconds (the module maps this to simulated time). */
  step() {}

  render() {}

  /** World-space rectangle {x, y, w, h} the camera should fit initially. */
  bounds() {
    return { x: 0, y: 0, w: 100, h: 100 };
  }

  pick() {
    return null;
  }

  /** Position/size of an entity for selection highlighting, or null if gone. */
  locate() {
    return null;
  }

  describe() {
    return null;
  }

  setProperty() {}

  add() {}

  move() {}

  removeAt(x, y, radius) {
    const e = this.pick(x, y, radius);
    if (e) this.remove(e);
    return e;
  }

  remove() {}

  impulse() {}

  energy() {}

  /** Live statistics: [{key, label, value, unit?}]. */
  stats() {
    return [];
  }

  /** Module-specific world state as JSON-safe data. Override together with loadState. */
  saveState() {
    throw new Error(`${this.meta.id} does not support saving`);
  }

  loadState() {
    throw new Error(`${this.meta.id} does not support loading`);
  }

  /** Full snapshot: parameters, clock, RNG and world state. */
  serialize() {
    return {
      format: SAVE_FORMAT,
      version: SAVE_VERSION,
      sim: this.meta.id,
      scenario: this.scenarioId,
      time: this.time,
      rng: this.rng.state,
      params: { ...this.params },
      state: this.saveState(),
    };
  }

  deserialize(data) {
    if (!data || data.format !== SAVE_FORMAT) throw new Error('Not a Simulations save file');
    if (data.version > SAVE_VERSION) throw new Error('Save file is from a newer version');
    if (data.sim !== this.meta.id) throw new Error(`Save is for "${data.sim}", not "${this.meta.id}"`);
    // Only accept known parameters, with the declared type.
    for (const d of this.paramDefs) {
      const v = data.params?.[d.key];
      if (v === undefined) continue;
      const ok = d.type === 'checkbox' ? typeof v === 'boolean' : d.type === 'select' ? d.options.some((o) => o.value === v) : Number.isFinite(v);
      if (ok) this.params[d.key] = v;
    }
    this.scenarioId = data.scenario ?? this.scenarioId;
    this.time = Number.isFinite(data.time) ? data.time : 0;
    if (Number.isFinite(data.rng)) this.rng.state = data.rng >>> 0;
    this.loadState(data.state);
    for (const d of this.paramDefs) this.onParamChange(d.key, this.params[d.key]);
  }

  formatTime() {
    return `${this.time.toFixed(2)} ${this.timeUnit}`;
  }
}
