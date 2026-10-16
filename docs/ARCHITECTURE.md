# Architecture

The project is a set of independent **simulation modules** behind one shared
**interaction contract**. The UI only talks to that contract, so every module gets
the same tools (inspect, move, add, remove, force, energy), parameter panel,
statistics and chart for free.

```
            ┌──────────────── src/ui/app.js ────────────────┐
 pointer ─► │ tools · camera (view.js) · params · inspector │ ─► canvas
            └───────────────┬───────────────────────────────┘
                            │ Simulation contract
     ┌──────────┬───────────┼───────────┬────────────┬───────────┐
  gravity     stars       atoms      weather     ecosystem    epidemic
```

## The simulation contract

Subclass `Simulation` (`src/core/simulation.js`) and implement what applies:

| Member | Purpose |
|---|---|
| `static meta` | `id`, `title`, `category` (groups the picker), `description`, `yUp` (true when world y means altitude) |
| `defineParams([...])` | Global parameters: `{ key, label, type: 'range' \| 'checkbox' \| 'select', min, max, step, log, value, options }`. Read them from `this.params`. Override `onParamChange(key, value)` when one needs extra work. |
| `scenarios`, `loadScenario(id)` | Preset worlds. Call `super.loadScenario(id)` first. |
| `spawnKinds`, `add(kind, x, y, radius)` | Things the Add tool can create. Return the new entity so it gets selected. |
| `step(dt)` | Advance by `dt` *real* seconds; map that to simulated time yourself (and sub-step if needed). |
| `render(ctx, view, ui)` | Draw with `view.toScreen(x, y)` and `view.scale` (pixels per world unit). `ui` has `selected`, `width`, `height`. |
| `bounds()` | World rectangle to fit the camera to. |
| `pick(x, y, r)` / `locate(e)` | Hit-testing, and the position of an entity for the selection ring. Return `null` from `locate` once it no longer exists. |
| `describe(e)` / `setProperty(e, key, value)` | Inspector fields: `{ key, label, type: 'number' \| 'text' \| 'select' \| 'readonly' \| 'action', value, options, step }`. |
| `move`, `remove`, `removeAt`, `impulse`, `energy` | Tool handlers. `impulse(entity \| null, x, y, dx, dy)` gets the drag vector in world units, and `energy(x, y, r, amount)` is called every frame while held, with `amount` signed and scaled by frame time. |
| `stats()`, `chartKeys` | Live numbers `[{ key, label, value, color? }]`; `chartKeys` picks which ones are plotted. |
| `energyTool`, `timeUnit`, `background`, `formatTime()` | Labels and cosmetics. |

Register the class in `src/sims/index.js`. `tests/contract.test.js` automatically checks
that the new module survives every tool and scenario.

## Design choices

- **No dependencies, no build.** Plain ES modules run directly in the browser and in Node, so
  the physics can be unit-tested headlessly (`npm test`).
- **Determinism.** Scenarios seed `this.rng` (`src/core/random.js`), so a scenario replays the
  same way until the user changes something.
- **Right-sized numerics per domain.** Gravity uses a symplectic leapfrog (energy drift < 1e-6
  per orbit in tests). Atoms use velocity-Verlet with a spatial hash. Weather uses
  semi-Lagrangian advection with an SOR pressure projection. Life modules are agent-based.
- **Physical units where it helps.** AU, years and M☉ for gravity; K, m/s, hPa and mm for
  weather; Myr, L☉ and R☉ for stars. Molecular dynamics uses reduced (Lennard-Jones) units
  with temperatures converted to Kelvin.

## Roadmap ideas

Natural next modules that fit the same contract:

- **Atomic structure / quantum:** Bohr and orbital models, photon emission spectra, radioactive decay chains, nuclear fusion in stellar cores.
- **Cell biology:** membranes, diffusion and osmosis, enzyme kinetics, mitosis, bacterial colonies with antibiotic resistance.
- **Human body:** heart and circulation, neurons and action potentials, immune response.
- **Planetary science:** plate tectonics, global climate and greenhouse effect, ocean currents, tides, erosion and the water cycle.
- **Classical physics:** rigid bodies, springs and pendulums, waves and optics, electromagnetism and circuits, fluids in 2D/3D.
- **Cosmology:** an expanding universe and structure formation, a Barnes–Hut tree for million-body galaxies.
- **Platform:** save/load and share worlds as JSON, scripting of experiments with parameter sweeps, WebGL/WebGPU rendering, a 3D view, Web Workers for heavy physics.
