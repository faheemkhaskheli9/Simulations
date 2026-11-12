// World checkpoint runtime (F1.3). Version 1 had no runtime continuation data.
// Keep this independent of the UI so validation completes before a load mutates a world.
import { experimentSettings } from './execution.js';

const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

function number(v, label, min = 0) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min) {
    throw new Error(`Invalid checkpoint ${label}`);
  }
  return v;
}

function entries(v, label) {
  if (!isRecord(v)) throw new Error(`Invalid checkpoint ${label}`);
  return Object.entries(v);
}

/** Snapshot the clocks, coupling history, and scheduler continuation data. */
export function saveRuntime(world) {
  const e = world.experiment;
  const ambientPending = {};
  for (const site of world.sites.values()) {
    if (site.acc > 0) ambientPending[site.id] = site.acc;
  }
  return {
    mode: world.mode,
    clock: world.clock,
    lastTick: world.lastTick,
    experiment: e ? {
      tick: e.tick,
      maxBacklog: e.maxBacklog,
      budgetMs: e.budgetMs,
      ids: [...e.ids],
      ticks: e.ticks,
      pending: e.pending,
      deferred: e.deferred,
      lagging: e.lagging,
    } : null,
    scheduler: {
      cursor: world.scheduler.cursor,
      budget: world.scheduler.budget,
      slowFor: world.scheduler.slowFor,
      ambientPending,
    },
    couplingValues: { ...world.couplings.values },
    couplingMemo: JSON.parse(JSON.stringify(world.couplings.memo)),
  };
}

/** Parse without modifying any world state; legacy v1 files have no runtime. */
export function readRuntime(data, world, enabled) {
  if (data.version === 1) return null;
  const r = data.runtime;
  if (!isRecord(r) || !['preview', 'experiment'].includes(r.mode)) {
    throw new Error('Invalid checkpoint execution mode');
  }
  const clock = number(r.clock, 'clock');
  const lastTick = number(r.lastTick, 'lastTick');
  if (lastTick > clock + 1e-8) throw new Error('Invalid checkpoint lastTick');
  const scheduler = r.scheduler;
  if (!isRecord(scheduler)) throw new Error('Invalid checkpoint scheduler');
  const cursor = number(scheduler.cursor, 'scheduler cursor');
  if (!Number.isSafeInteger(cursor)) throw new Error('Invalid checkpoint scheduler cursor');
  const budget = number(scheduler.budget, 'scheduler budget');
  const slowFor = number(scheduler.slowFor, 'scheduler slowFor');
  if (!(budget > 0)) throw new Error('Invalid checkpoint scheduler budget');
  const ambientPending = {};
  for (const [id, amount] of entries(scheduler.ambientPending, 'ambient pending time')) {
    if (!world.sites.has(id)) throw new Error(`Unknown checkpoint site "${id}"`);
    ambientPending[id] = number(amount, `ambient pending time ${id}`);
  }

  const allowed = new Set(enabled);
  const couplingValues = {};
  for (const [id, value] of entries(r.couplingValues, 'coupling values')) {
    if (!allowed.has(id)) throw new Error(`Unexpected checkpoint coupling "${id}"`);
    couplingValues[id] = number(value, `coupling value ${id}`, -Infinity);
  }
  const couplingMemo = {};
  for (const [id, memo] of entries(r.couplingMemo, 'coupling history')) {
    if (!allowed.has(id)) throw new Error(`Unexpected checkpoint coupling history "${id}"`);
    const copied = {};
    for (const [key, value] of entries(memo, `coupling history ${id}`)) {
      if (key === 'window') {
        if (!Array.isArray(value) || value.length > 10) throw new Error('Invalid checkpoint rain window');
        copied.window = value.map((n) => number(n, 'rain window'));
      } else if (key === 'ref' || key === 'total') {
        copied[key] = number(value, `coupling history ${key}`, -Infinity);
      } else {
        throw new Error(`Invalid checkpoint coupling history key "${key}"`);
      }
    }
    couplingMemo[id] = copied;
  }

  let experiment = null;
  if (r.mode === 'experiment') {
    const e = r.experiment;
    if (!isRecord(e) || !Array.isArray(e.ids) || !e.ids.length) {
      throw new Error('Invalid checkpoint experiment participants');
    }
    const settings = experimentSettings(e);
    const ids = new Set();
    for (const id of e.ids) {
      if (typeof id !== 'string' || !world.sites.has(id) || ids.has(id) || !Object.hasOwn(data.sites, id)) {
        throw new Error(`Invalid checkpoint experiment site "${id}"`);
      }
      ids.add(id);
    }
    // Enabled couplings always join the experiment, even if they were enabled later.
    for (const id of enabled) {
      const def = world.couplings.get(id);
      if (!Object.hasOwn(data.sites, def.from) || !Object.hasOwn(data.sites, def.to)) {
        throw new Error('Checkpoint is missing a coupled experiment site');
      }
    }
    const ticks = number(e.ticks, 'experiment ticks');
    const pending = number(e.pending, 'experiment pending');
    // Optional for older v2 checkpoints written before deferred intake existed.
    const deferred = number(e.deferred ?? 0, 'experiment deferred');
    if (!Number.isSafeInteger(ticks) || pending > settings.maxBacklog + 1e-8
        || Math.abs(clock - ticks * settings.tick) > 1e-8 * Math.max(1, clock)
        || typeof e.lagging !== 'boolean') {
      throw new Error('Invalid checkpoint experiment clock or backlog');
    }
    experiment = { ...settings, ids, ticks, pending, deferred, lagging: e.lagging };
  } else if (r.experiment !== null) {
    throw new Error('Invalid checkpoint preview experiment state');
  }
  return { clock, lastTick, scheduler: { cursor, budget, slowFor, ambientPending },
    couplingValues, couplingMemo, experiment };
}
