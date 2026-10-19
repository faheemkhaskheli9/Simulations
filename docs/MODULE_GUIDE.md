# Module Guide: adding a new simulation

This guide shows how to add a new phenomenon to Simulations. The overall
architecture is described in the [System Design](SYSTEM_DESIGN.md).

The UI only talks to the **simulation contract**, so a new module automatically
gets the six tools (inspect, move, add, remove, force, energy), the parameter panel,
the statistics, the chart and deep linking. You don't write any UI code.

## 1. Create the module

Create `src/sims/pendulum.js`:

```js
import { Simulation } from '../core/simulation.js';

let nextId = 1;

export class PendulumSim extends Simulation {
  static meta = {
    id: 'pendulum',                 // used in the URL: #pendulum/single
    title: 'Pendulums',
    category: 'Classical',          // groups the simulation picker
    description: 'Simple pendulums under gravity with damping.',
    yUp: false,                     // true if world y is "up" (e.g. altitude)
    model: {                        // shown in the "Model & assumptions" dialog
      summary: 'Ideal pendulums in SI units.',
      equations: ['θ¨ = −(g/L)·sin θ − b·θ˙'],
      assumptions: ['Massless rigid rods; pivots are frictionless.'],
      references: ['Halliday, Resnick & Walker, Fundamentals of Physics'],
    },
  };

  constructor(opts) {
    super(opts);
    this.timeUnit = 's';
    this.defineParams([
      { key: 'g', label: 'Gravity (m/s²)', type: 'range', min: 0, max: 30, step: 0.1, value: 9.81 },
      { key: 'damping', label: 'Damping', type: 'range', min: 0, max: 1, step: 0.01, value: 0.02 },
    ]);
    this.spawnKinds = [{ id: 'bob', label: 'Pendulum' }];
    this.scenarios = [{ id: 'single', label: 'One pendulum' }];
    this.energyTool = { label: 'Swing harder', negLabel: 'Slow down' };
    this.chartKeys = ['energy'];
    this.loadScenario('single');
  }

  loadScenario(id) {
    super.loadScenario(id);           // resets time and records scenarioId
    this.rng.seed(1);                 // deterministic presets
    this.items = [];
    this.add('bob', 0, 0);
  }

  bounds() { return { x: -3, y: -3, w: 6, h: 6 }; }

  step(dt) {
    const h = dt / 10;                // sub-step for stability
    for (let s = 0; s < 10; s++) {
      for (const p of this.items) {
        p.w += (-(this.params.g / p.L) * Math.sin(p.th) - this.params.damping * p.w) * h;
        p.th += p.w * h;
      }
    }
    this.time += dt;
  }

  pos(p) { return [p.L * Math.sin(p.th), p.L * Math.cos(p.th)]; }

  render(ctx, view) {
    for (const p of this.items) {
      const [ox, oy] = view.toScreen(0, 0), [x, y] = view.toScreen(...this.pos(p));
      ctx.strokeStyle = '#888'; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = '#6aa8ff'; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
    }
  }

  add(kind, x, y) {
    const L = Math.max(0.2, Math.hypot(x, y) || 2);
    const p = { id: nextId++, L, th: Math.atan2(x, y) || 0.5, w: 0, alive: true };
    this.items.push(p);
    return p;                          // returning it auto-selects it
  }

  pick(x, y, r) {
    return this.items.find((p) => { const [px, py] = this.pos(p); return (px - x) ** 2 + (py - y) ** 2 < Math.max(r, 0.2) ** 2; }) ?? null;
  }

  locate(p) { if (!p.alive) return null; const [x, y] = this.pos(p); return { x, y, px: 12 }; }
  remove(p) { p.alive = false; this.items = this.items.filter((q) => q !== p); }
  move(p, x, y) { p.L = Math.max(0.2, Math.hypot(x, y)); p.th = Math.atan2(x, y); p.w = 0; }
  impulse(p, x, y, dx) { if (p) p.w += dx * 2; }
  energy(x, y, r, amount) { for (const p of this.items) p.w *= Math.exp(amount); }

  describe(p) {
    return { title: `Pendulum #${p.id}`, fields: [
      { key: 'L', label: 'Length (m)', type: 'number', value: p.L, step: 0.1 },
      { key: 'th', label: 'Angle (rad)', type: 'number', value: p.th, step: 0.05 },
      { key: 'period', label: 'Small-angle period (s)', type: 'readonly', value: (2 * Math.PI * Math.sqrt(p.L / this.params.g)).toFixed(2) },
      { key: 'stop', label: 'Stop swinging', type: 'action' },
    ] };
  }

  setProperty(p, key, value) {
    if (key === 'stop') p.w = 0;
    else if (key === 'L') p.L = Math.max(0.2, value);
    else p[key] = value;
  }

  // Save/load, undo and redo all build on these two methods.
  saveState() {
    return { items: this.items.map(({ id, L, th, w }) => ({ id, L, th, w })) };
  }

  loadState(st) {
    this.items = st.items.map((p) => ({ ...p, alive: true }));
    nextId = Math.max(nextId, ...this.items.map((p) => p.id + 1));
  }

  stats() {
    const E = this.items.reduce((s, p) => s + 0.5 * (p.L * p.w) ** 2 + this.params.g * p.L * (1 - Math.cos(p.th)), 0);
    return [
      { key: 'count', label: 'Pendulums', value: this.items.length },
      { key: 'energy', label: 'Energy per kg (J)', value: E },
    ];
  }
}
```

## 2. Register it

Add it to `src/sims/index.js`:

```js
import { PendulumSim } from './pendulum.js';
export const SIMULATIONS = [/* … */, PendulumSim];
```

## 3. Test it

`tests/contract.test.js` automatically runs your module through every tool and
scenario, and `tests/serialize.test.js` checks that save → load reproduces your world and
its future exactly. Add a behaviour test against a known result (for the pendulum: the
small-angle period equals 2π√(L/g)):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PendulumSim } from '../src/sims/pendulum.js';

test('small-angle period matches 2π√(L/g)', () => { /* … */ });
```

Run `npm test`, then `npm start` and open `http://localhost:8080/#pendulum/single`.

## 4. Add a lesson (optional)

Lessons live in `src/lessons/index.js`. Each is data plus small predicates over the
module's public state, so they need no UI code:

```js
{
  id: 'small-swings',                 // also the link: #learn/small-swings
  type: 'lesson',                     // or 'challenge' (add a fail(ctx) rule)
  title: 'Small swings keep time',
  summary: 'A pendulum’s period barely depends on its amplitude.',
  sim: 'pendulum',
  scenario: 'single',
  steps: [
    { text: 'Watch 10 swings.', check: (c) => c.elapsed >= 20 },
    { text: 'Set gravity to 1.6 (the Moon).', check: (c) => c.params.g <= 1.7 },
    { text: 'Slower! Press Next.' },  // no check: waits for Next
  ],
}
```

`ctx` gives `sim`, `params`, `stat(key)` (your `stats()` values), `start` (time, stats
and params when the step began), `elapsed`, `memo` (per-step scratch) and `selected`.
Add a scripted solution to `SOLUTIONS` in `tests/lessons.test.js`; the test plays the
lesson to completion, so a lesson that cannot be finished fails CI.

## 5. Placing a module in the 3D world

Every registered module should also have a **site** in the [3D world](world/SYSTEM_DESIGN.md).
No code in the module changes: add one entry to the place where the phenomenon happens in
`src/world/layout.js` (the layout test fails until every module has a site).

```js
// in a place's `sites` list; positions and sizes are in that place's unit
{ id: 'tides', sim: 'tides', scenario: 'spring', label: 'Tides', type: 'surface',
  surface: 'ground',          // 'ground' (lying flat), 'plane' (a screen) or 'slab' (a cross-section)
  center: [4, 0.02, -3], width: 6,   // the height follows your module's bounds() aspect
  params: { speed: 2 },       // optional: parameters for this setting
  view: { offset: [0, 5, 6] } },     // optional: where the camera looks from (relative to center)
```

The surface adapter draws your `render()` into a texture and maps clicks back to your
coordinates, so all six tools work exactly as in 2D. Keep `render()` free of assumptions
about the page (draw only to the context and view you are given).

A new **place** is also just data: `{ id, parent, label, unit: { name, metres }, size,
position (in the parent's unit), enterAt, exitAt, view, primary, sites }`. Keep `enterAt`
below `exitAt`, and the place inside its parent's extent (`exitAt × size`); the place tests
check both, and that no coordinate sent to the GPU exceeds 10⁶.

**A native 3D view** (optional) is a `Site` subclass in `src/world/native/`, registered in
`SITE_TYPES` in `src/world/world.js`. It implements `toPlace(x, y)` and `hit(ray)` (module
point ↔ place point), `render(fc)` using only the renderer's `mesh`, `spheres`, `points`,
`lines` and `texture` calls, and optionally `drawSelection(fc, entity)`. Read the module's
public state; change it only through the contract. See `native/globe.js` (Global Climate)
and `native/gravity3d.js` (Gravity).

**A coupling** joins two sites: add `{ id, label, from, to, param, unit, smoothing, explain,
read(sim, memo, ctx) }` to `COUPLINGS` in `src/world/couplings.js`. `read` returns the value
for the target's parameter (it is smoothed and clamped to the parameter's range for you).

## Contract reference

| Member | Notes |
|---|---|
| `static meta` | `id`, `title`, `category`, `description`, `yUp`, `model` (`summary`, `equations`, `assumptions`, `references`; required by the contract test) |
| `defineParams(defs)` | `{ key, label, type: 'range'\|'checkbox'\|'select', min, max, step, log, value, options }`; values in `this.params`; react in `onParamChange(key, value)` |
| `scenarios`, `loadScenario(id)` | Call `super.loadScenario(id)` first; seed `this.rng` |
| `step(dt)` | `dt` = real seconds × UI speed (≤ 0.4 s). Map to simulated time, sub-step, update `this.time` |
| `render(ctx, view, ui)` | Use `view.toScreen(x, y)` and `view.scale`. `ui = { selected, width, height }` for screen-space overlays |
| `bounds()` | World rect for "fit view" |
| `pick` / `locate` | Hit test; `locate` returns `{x, y, r}` (world radius) or `{x, y, px}` (pixel radius), or `null` once gone |
| `describe` / `setProperty` | Field types: `number`, `text`, `select` (with `options`), `readonly`, `action` (button; `setProperty(e, key, true)`) |
| `add(kind, x, y, r)` | Return the entity to select it, or `null` for bulk/terrain edits |
| `remove`, `removeAt(x, y, r)` | `removeAt` defaults to `pick` + `remove`; override for regions/terrain |
| `move(e, x, y)` | Called repeatedly while dragging |
| `impulse(e\|null, x, y, dx, dy)` | Drag vector in world units; handle `e = null` as a regional push |
| `energy(x, y, r, amount)` | Called every frame while held; `amount` is signed and already scaled by frame time |
| `saveState()` / `loadState(state)` | JSON-safe world state. Replace object references with ids; encode typed arrays with `encodeTyped`/`decodeInto` from `src/core/serialize.js`; validate enum values. Parameters, time and RNG are saved by the base class. Powers Save/Load and Undo/Redo |
| `stats()`, `chartKeys` | `[{ key, label, value, color? }]`; chart keys must exist in stats |
| `energyTool`, `timeUnit`, `background`, `formatTime()` | Labels and cosmetics |

## Checklist

- [ ] Deterministic scenarios (`this.rng.seed(...)`, never `Math.random`)
- [ ] Stable at the max speed setting (sub-step, clamp forces, cap counts)
- [ ] Every tool does something sensible, or is a harmless no-op
- [ ] Inspector values are clamped in `setProperty`
- [ ] Entities carry `alive`; `locate` returns `null` after removal
- [ ] `saveState`/`loadState` round-trip exactly (the serialization test enforces this)
- [ ] Physical units in labels
- [ ] Behaviour test against a known result
- [ ] Listed in the README catalogue and the [Roadmap](ROADMAP.md)
- [ ] `npm run docs:reference` regenerates [REFERENCE.md](REFERENCE.md) with the new module (the reference test fails until you do)
- [ ] A screenshot and a section in the [User Guide](USER_GUIDE.md): add a `sim-<id>` shot to `scripts/screenshots.mjs` and run `npm run docs:screenshots`
- [ ] A site in `src/world/layout.js`, at the place where the phenomenon happens ([§5](#5-placing-a-module-in-the-3d-world))
