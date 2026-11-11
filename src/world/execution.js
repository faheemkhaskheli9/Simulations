// Execution modes of the world (Roadmap F1.1, World TRD W-FT-90…95).
//
// Interactive preview (the default) keeps the world responsive: the active site
// steps by the frame's dt × speed, ambient sites share a frame budget and catch
// up with one capped step, and couplings tick about once per world second. How
// far each site gets therefore depends on the frame rate, the camera and the
// hardware, which is fine for exploring and wrong for an experiment.
//
// Experiment mode advances the world in fixed ticks instead:
//   - every tick steps each participating site by exactly `tick` world seconds,
//     in layout order, whatever is on screen or active;
//   - participants are the sites chosen when the experiment starts (by default
//     the active site and every site an enabled coupling uses) plus the sites of
//     couplings enabled later; all other sites hold still;
//   - couplings tick every `couplingEvery` ticks (one world second);
//   - pause stops intake; speed multiplies intake; nothing is ever skipped:
//     ticks a frame cannot afford wait in a backlog, and once the backlog holds
//     `maxBacklog` world seconds the world runs slower than real time instead of
//     dropping simulation time.
// So the state after N ticks depends only on the starting state, the settings
// and the interventions, not on how the ticks were spread over frames.

export const EXPERIMENT_DEFAULTS = Object.freeze({ tick: 1 / 30, maxBacklog: 0.5, budgetMs: 10 });

/**
 * How each module turns world seconds into its own time (W-FT-92). A `rate`
 * module advances `dt × factor(params)` per step; a `per-step` module ignores dt
 * and advances `amount(params)` per step, so in preview its pace follows the
 * frame rate and in experiment mode it follows the tick.
 */
export const TIME_MAPS = {
  gravity: { kind: 'rate', factor: (p) => p.yearsPerSecond },
  climate: { kind: 'rate', factor: (p) => p.yearsPerSecond },
  stars: { kind: 'rate', factor: (p) => p.myrPerSecond },
  mechanics: { kind: 'rate', factor: (p) => p.slowmo },
  cell: { kind: 'rate', factor: (p) => p.speed },
  atom: { kind: 'rate', factor: () => 1 },
  weather: { kind: 'per-step', amount: (p) => p.dt * p.stepsPerFrame },
  atoms: { kind: 'per-step', amount: (p) => p.dt * p.speed },
  ecosystem: { kind: 'per-step', amount: (p) => 0.5 * p.speed },
  epidemic: { kind: 'per-step', amount: (p) => 0.1 * p.speed },
};

/**
 * A module's time per world second at a given tick: { kind, unit, perSecond }.
 * Null for a module without a declared mapping.
 */
export function timeMapping(sim, tick = EXPERIMENT_DEFAULTS.tick) {
  // Reject invalid time scales before dividing per-step advances by the tick.
  if (!(Number.isFinite(tick) && tick > 0)) throw new RangeError('tick must be finite and positive');
  const map = TIME_MAPS[sim.meta.id];
  if (!map) return null;
  const perSecond = map.kind === 'rate' ? map.factor(sim.params) : map.amount(sim.params) / tick;
  // A bad parameter must not leak Infinity/NaN into experiment provenance.
  if (!Number.isFinite(perSecond)) throw new RangeError('time mapping must be finite');
  return { kind: map.kind, unit: sim.timeUnit, perSecond };
}

/** Check and complete experiment settings; throws on bad values. */
export function experimentSettings({ tick = EXPERIMENT_DEFAULTS.tick, maxBacklog = EXPERIMENT_DEFAULTS.maxBacklog, budgetMs = EXPERIMENT_DEFAULTS.budgetMs } = {}) {
  if (!(Number.isFinite(tick) && tick > 0 && tick <= 1)) throw new Error('tick must be a number of seconds in (0, 1]');
  if (!(Number.isFinite(maxBacklog) && maxBacklog >= tick)) throw new Error('maxBacklog must be at least one tick');
  if (!(Number.isFinite(budgetMs) && budgetMs > 0)) throw new Error('budgetMs must be a positive number');
  return { tick, maxBacklog, budgetMs, couplingEvery: Math.max(1, Math.round(1 / tick)) };
}
