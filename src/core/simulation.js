import { Random } from './random.js';

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

  formatTime() {
    return `${this.time.toFixed(2)} ${this.timeUnit}`;
  }
}
