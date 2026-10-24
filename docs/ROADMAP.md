# Roadmap

| | |
|---|---|
| **Last updated** | 2026-10-19 |
| **Related** | [PRD §10](PRD.md#10-release-plan) · [System Design §12](SYSTEM_DESIGN.md#12-evolution-and-extension-points) |

The long-term goal is to cover real-world phenomena at **every scale**. The product grows
along two tracks: the **platform** (persistence, performance, 3D, education) and the
**catalogue** (new simulation modules). Priorities: **P1** next, **P2** later, **P3** exploratory.

Execution order and acceptance criteria: [Future execution plan](#future-execution-plan-2026-10-19).

## Milestones

### M1 MVP (done)
- [x] App shell, camera, six universal tools, parameter panel, inspector, stats, chart
- [x] Gravity & Orbits, Stellar Life Cycles, Atoms & Molecules, Weather & Atmosphere, Ecosystem & Evolution, Epidemic Spread
- [x] Node test suite + contract test; product and technical documentation

### M2 Persistence and sharing (P1, done)
- [x] `serialize` / `deserialize` on the contract; save and load worlds as JSON files
- [x] Share links with simulation, scenario and changed parameters (`#gravity/solar?gScale=2`)
- [ ] Share links that embed the full world state (too large for URLs today; needs compression or hosting)
- [x] Undo / redo of user interventions
- [x] CSV export of recorded statistics
- [x] CI: unit and browser tests on every push and PR (`.github/workflows/test.yml`)
- [x] Deploy `main` to GitHub Pages (`.github/workflows/pages.yml`; enable *Settings → Pages → Source: GitHub Actions* once)
- [x] Installable and offline (PWA: web manifest + network-first service worker)
- [x] Pinch-zoom and two-finger pan on touch devices

### M3 Catalogue expansion (P1 done, P2–P3 next)

| Scale | Module | Key phenomena | Priority | Status |
|---|---|---|---|---|
| Subatomic / atomic | **Atomic Structure** | Shell model, electron transitions and emission spectra, ionisation, isotopes, α/β decay | P1 | ✅ Done |
| Nuclear | **Nuclear Physics** | Half-life statistics with many nuclei, fission chain reactions, fusion | P2 | Partly covered by Atomic Structure (decay chains) |
| Molecular | **Chemical Reactions** | Reaction kinetics, equilibrium, catalysts, acids and bases | P2 | |
| Cellular | **Cell Biology** | Diffusion and osmosis, membrane transport, respiration, membrane potential | P1 | ✅ Done (mitosis and enzyme kinetics still to come) |
| Cellular | **Bacterial Colonies** | Growth on nutrients, antibiotic resistance, quorum sensing | P2 | |
| Organism | **Human Body** | Heart and circulation, neurons and action potentials, immune response | P2 | |
| Organism | **Plant Growth** | Photosynthesis, phototropism, L-system morphology | P3 | |
| Classical | **Mechanics Lab** | Springs, pendulums, rods, ropes, collisions | P1 | ✅ Done (rigid polygons still to come) |
| Classical | **Waves & Optics** | Interference, diffraction, refraction, lenses | P2 | |
| Classical | **Electromagnetism** | Fields of charges and currents, circuits, induction | P2 | |
| Classical | **Fluid Dynamics** | Flow around obstacles, turbulence, buoyancy | P2 | |
| Planetary | **Global Climate** | Energy balance, greenhouse gases, ice-albedo feedback, seasons | P1 | ✅ Done |
| Planetary | **Plate Tectonics** | Convection, plates, volcanoes, earthquakes | P3 | |
| Planetary | **Oceans & Tides** | Tidal forces, currents, the water cycle, erosion | P3 | |
| Stellar | **Stellar Interior** | Hydrostatic equilibrium, fusion chains, energy transport | P3 | |
| Cosmic | **Cosmology** | Expansion, dark energy, large-scale structure formation | P3 | |

### M4 Scale and fidelity (P2)
- [ ] Run physics in Web Workers (typed-array state, transferable buffers)
- [ ] WebGPU compute for grids (weather, fluids) and particles (atoms, galaxies)
- [x] Barnes–Hut tree for gravity (used from 64 massive bodies; new 2000-star *Star cluster* scenario)
- [x] Neighbour lists for molecular dynamics (the 3D mode of Atoms & Molecules)
- [x] Optional 3D view with the same tools: the **3D world** (Gravity, Global Climate, Ecosystem, Weather, Atoms & Molecules, Cell Biology and Atomic Structure in native 3D; the rest on surfaces)
- [x] A 3D gravity mode: `z`, `vz`, octree Barnes–Hut, *Inclined orbits* and *Galaxy collision in 3D* scenarios
- [x] Native 3D for molecules: a 3D mode for Atoms & Molecules (FCC argon crystal, water in 3D), drawn as ball-and-stick in the world (the weather volume and the ecosystem terrain are done too)
- [ ] Weather: 2D horizontal (map) mode, ice microphysics, lightning

### M5 Education (P2)
- [x] Guided lessons that script scenarios, prompts and checkpoints (`src/lessons/`; 10 lessons, at least one per module)
- [x] Challenges with win and lose conditions (7 so far: ring vaccination, Snowball Earth, transmuting carbon, launching a planet into a circular orbit, balancing an ecosystem, making a thunderstorm, building molecules)
- [x] Lessons for the remaining modules (gravity, stars, atoms, weather) and a "put a planet in a stable orbit" challenge
- [x] More challenges (balance an ecosystem, make a thunderstorm, build molecules from a new *Molecule kit* scenario)
- [x] Teacher mode: share links with `lock=<keys>` or `lock=all` freeze parameters for learners
- [ ] Presenter view
- [x] Per-module "Model & assumptions" panel with references

### M6 Multi-scale worlds (World Preview done)

Built as **Simulations World**, one 3D world containing every simulation: see the [Plan](world/PLAN.md) (progress and next tasks), [PRD](world/PRD.md), [TRD](world/TRD.md) (status per requirement) and [System Design](world/SYSTEM_DESIGN.md).

- [x] Zoom-through-scales navigation (galaxy → star → planet → biosphere → cell → atom), with Atlas, breadcrumb, scale bar and a guided tour
- [x] Composite simulations that couple modules: Earth's orbit → climate, climate → weather, ecosystem and epidemic, weather (rain) → ecosystem
- [ ] Stellar flux drives planetary climate (Stars → Climate)
- [ ] Performance budgets measured on the reference laptop; Weather in a Web Worker

## Known limitations to address

| Area | Limitation | Planned fix |
|---|---|---|
| Ecosystem | Asexual reproduction; harsher scenarios (islands, invasion) still need immigration | Sexual reproduction, spatial refuges, more trophic levels |
| Weather | ~20–25 ms/frame; collocated grid; warm-rain only | Worker/WebGPU, staggered grid, ice phase |
| Atoms | 2D, no angle potentials beyond 1–3 repulsion; simplified bond chemistry | Angle terms, reaction energetics |
| Stars | Analytic tracks, no binaries | Binary evolution, mass transfer |
| Gravity | Barnes–Hut is monopole-only (~2 % force error at θ = 0.6) and runs on the main thread; mergers are still O(N²) | Quadrupole terms, Web Worker |
| Climate | 1D zonal model; ice cover is a smooth function of temperature rather than true sea-ice physics | Land/ocean split, sea-ice thermodynamics |
| Atomic Structure | Screened hydrogen-like energies are only accurate for hydrogen and hydrogen-like ions; stability rule misses some odd-odd nuclei (e.g. Co-60) | Tabulated levels and nuclide data |
| Cell Biology | Each particle stands for many molecules; time is accelerated; no cell division yet | Mitosis, enzyme kinetics |
| Mechanics | Circles only; no friction model beyond rolling damping | Rigid polygons, Coulomb friction |
| Platform | No analytics | Privacy-friendly, opt-in usage metrics |
| 3D world | The Cell and Atom views are render-only (their models stay 2D); 1 px lines; performance only measured on a software GPU | Wide lines, reference-laptop benchmarks |


## Future execution plan (2026-10-19)

This section sets the implementation order for the existing milestones above. Existing
completed work stays complete. Future checkboxes describe planned work, not implemented
features. P0 means a prerequisite for trustworthy experiments, P1 means next, P2 means
later, and P3 means exploratory.

**Direction:** a browser-based, connected science laboratory where users can explore,
form a hypothesis, change a variable, compare outcomes, and reproduce the result.
Keep offline use and the dependency-free runtime as defaults. Add infrastructure only
when a demonstrated requirement needs it.

### Phase sequence

| Phase | Priority | Outcome | Depends on | Planning estimate |
|---|---|---|---|---|
| F1: Trustworthy execution | P0 | Deterministic experiments and complete checkpoints | Existing simulation contract | 2–4 engineer-weeks |
| F2: Responsive, reliable world | P0/P1 | Measured performance and worker execution | F1 timing contract; baseline profiling can start now | 2–4 engineer-weeks |
| F3: Compare possible worlds | P1 | Control/treatment runs and repeatable parameter sweeps | F1; F2 for large batches | 3–5 engineer-weeks |
| F4: Validated connected science | P1 | Explicit coupling semantics and model validation reports | F1; F3 for ensemble reports | 3–5 engineer-weeks |
| F5: Complete native 3D | P2 | Real 3D behavior where it improves learning | F1, F2; existing World plan | 6–12+ engineer-weeks |
| F6: Classroom workflows | P2 | Teacher-authored experiments and learner evidence | F3, F4 | 3–5 engineer-weeks |
| F7: Catalogue and research extensions | P2/P3 | Carefully validated new domains and optional agent experiments | F1–F4 | Scope each module separately |

Estimates are rough active engineering effort for one experienced developer, not delivery
commitments. Re-estimate after F1 and hardware profiling; scientific review, device access,
and feedback can add calendar time. F4 validation should begin incrementally during F1.
The current World 1.0 definition of done in issue #2 remains authoritative: F2 alone does
not complete World 1.0 while required native views or other P1 requirements remain open.

### F1 — Trustworthy execution

Source-review observations to verify with regression tests: the scheduler applies speed
to the active site but not ambient sites, caps and discards ambient accumulated time,
and world saves omit clocks and coupling runtime history. These may suit interactive
preview behavior but must not define controlled experiment results.

- [ ] **F1.1: Define execution modes.** Keep interactive preview and add experiment mode with
  a fixed simulation step, stable site order, explicit per-module time mappings, and
  coupling tick cadence. Define pause, speed, inactive-site, and backlog behavior.
- [ ] **F1.2: Decouple physics from rendering.** Camera position, frame rate, visibility,
  and frame-budget decisions must not change an experiment's state at a given tick.
  Slow hardware may finish later; experiment mode must not silently drop simulation time.
- [ ] **F1.3: Complete checkpoints.** Version the format and save relevant evolved sites,
  RNG states, world clock, pending time, scheduler continuation data, coupling smoothing
  values and history, and scheduled interventions. Preserve legacy-save loading.
- [ ] **F1.4: Validate all mutation paths.** Apply shared parameter types, finite-value checks,
  bounds, enum validation, and unknown-key policy to UI, API, imports, and couplings.
  Validate complete imports before mutation; set documented size/entity limits.
- [ ] **F1.5: Record provenance.** Store schema version, model version, code revision when
  available, seed, timestep, parameters, enabled couplings, and intervention log.

**Exit criteria:** same-runtime runs with identical inputs match at equal ticks despite
different render schedules or active sites; uninterrupted and checkpoint-resumed runs
match; malformed imports leave the current world unchanged. Define numeric tolerances
for cross-browser comparisons instead of promising universal bit-identical floating-point
results. Add regression coverage for pause/speed changes and legacy saves.

### F2 — Responsive, reliable world

Extend existing [#9](https://github.com/faheemkhaskheli9/Simulations/issues/9)
and [#10](https://github.com/faheemkhaskheli9/Simulations/issues/10); do not create duplicate
performance or worker workstreams.

- [ ] **F2.1: Establish reproducible baselines.** Record device, browser, scenario, seed,
  object counts, resolution, p50/p95 frame and step times, and memory where measurable.
  Use the existing W-PR-1…8 budgets as the release targets.
- [ ] **F2.2: Move Weather to a Web Worker.** Define versioned commands and snapshots,
  ownership of typed-array buffers, bounded queues, cancellation, errors, and fallback.
  Test parity with the main-thread implementation.
- [ ] **F2.3: Profile remaining bottlenecks.** Optimize gravity collision candidate searches
  and molecular neighbor lists only after measuring their cost.
- [ ] **F2.4: Add adaptive visual quality.** Reduce surface refresh rate, resolution, and
  decorative detail without silently changing experiment physics.
- [ ] **F2.5: Finish reliability checks.** Complete the existing 10-simulated-minute soak,
  30-minute memory check, cross-browser/tablet checks, context-loss recovery checks,
  and useful user-visible failure/retry messages.

**Exit criteria:** publish hardware measurements against every applicable existing budget;
pass worker parity tests and long-run checks; document unsupported devices and fallback
behavior. Do not report software-GPU results as reference-laptop measurements.

### F3 — Compare possible worlds

The first complete user journey is: clone an ecosystem, introduce drought into only one
copy, run both for equal simulated time, compare populations, then repeat across seeds.

- [ ] **F3.1: Experiment manifest and runner.** Define starting checkpoint, hypotheses,
  control/treatment parameters, tick-stamped interventions, duration, seeds, and metrics.
  Support headless Node execution using the existing simulation modules.
- [ ] **F3.2: Paired comparison UI.** Clone a checkpoint into isolated runs; provide synchronized
  controls, clear changed-variable labels, chart overlays, and difference curves.
- [ ] **F3.3: Parameter sweeps and ensembles.** Add bounded concurrency, progress, cancellation,
  resume, and limits on combinations, runtime, and output size.
- [ ] **F3.4: Statistical reporting.** Show sample count, distributions and quantiles; distinguish
  spread across random seeds from uncertainty about real-world model accuracy.
  Document any confidence-interval method and assumptions.
- [ ] **F3.5: Portable experiment bundles.** Export manifest, checkpoints, raw CSV data,
  summary results, and provenance. Provide download/import before considering hosted sharing.
- [ ] **F3.6: Replay and branching.** Replay the intervention log and branch an experiment
  at a checkpoint; keep ordinary undo/redo behavior intact.

**Exit criteria:** an exported experiment reruns to equivalent results; comparison runs
share no mutable state; batch results equal individual runs for the same seeds; cancellation
leaves the UI usable. Ship three examples: drought, orbital-speed change, and CO₂ change.

### F4 — Validated connected science

Extend existing model-and-assumptions panels and scientific tests rather than replacing them.

- [ ] **F4.1: Coupling contracts.** Declare input/output units, conversion, model-time mapping,
  sample interval, smoothing semantics, valid ranges, missing-source behavior, and ownership
  when multiple couplings target one parameter. Detect conflicts explicitly.
- [ ] **F4.2: Explain transferred values.** Display the source value, conversion, resulting
  target value, and active assumptions. Label illustrative relationships as such; the
  climate-to-epidemic mapping must not be presented as a validated disease forecast.
- [ ] **F4.3: Validate numerical behavior.** Add timestep-refinement and conservation checks
  where applicable, including documented exceptions for thermostats, collisions,
  boundary fluxes, and deliberate user energy injection.
- [ ] **F4.4: Reference comparisons.** Maintain versioned, cited fixtures with units, license,
  tolerances, and validity ranges. Distinguish calibration data from validation data.
- [ ] **F4.5: Validation dashboard.** Report error, convergence, model limitations, and
  last-tested model version. Begin with gravity, mechanics, and climate, then expand.
- [ ] **F4.6: Extend couplings selectively.** Add Stars → Climate after defining a suitable
  Sun-like source. Keep cycle rejection until a feedback solver and stability policy exist.

**Exit criteria:** every enabled coupling has a documented contract; reference scenarios
pass declared tolerances; no claim of predictive accuracy rests solely on a visually
plausible result or a tuned example. Model changes update validation evidence.

### F5 — Complete native 3D

Continue [#7](https://github.com/faheemkhaskheli9/Simulations/issues/7) and the
[World plan](world/PLAN.md). Track visual 3D and physical 3D separately.

- [ ] **F5.1: True 3D gravity.** Add z/vz, octree force approximation, inclined-orbit scenarios,
  and 3D picking/intervention semantics. Preserve the existing 2D mode's regression results.
- [ ] **F5.2: Ecosystem and Weather views.** Add instanced organisms, terrain, cloud/rain
  visualization, and clear labeling wherever the underlying model remains 2D.
- [ ] **F5.3: Molecules.** Add optional 3D MD, geometry/angle terms, and ball-and-stick views
  with numerical validation and explicit simplified chemistry limits.
- [x] **F5.4: Atomic Structure and Cell views.** Add shell/membrane representations without
  implying that schematic electron shells are literal classical trajectories.
- [ ] **F5.5: Interaction parity.** Preserve all six tools, selection feedback, saves,
  lessons, keyboard access, and 2D fallback for every native view.

**Exit criteria:** meet the applicable World PRD/TRD requirements with test evidence;
rerun F2 budgets for each added view and retain accessible non-3D workflows.

### F6 — Classroom workflows

- [ ] **F6.1: Teacher experiment editor.** Author prompts, starting states, allowed controls,
  checkpoints, expected observations, and assessment rubrics.
- [ ] **F6.2: Learner notebook.** Capture prediction, intervention history, observations,
  charts, and conclusions locally; export a structured report.
- [ ] **F6.3: Presenter mode.** Large controls, legible charts, annotations, and staged reveal.
  Reuse the presenter item in #10.
- [ ] **F6.4: Accessibility and localization.** Keyboard-complete tasks, non-color-only plots,
  reduced motion, screen-reader summaries, accessible data tables, and externalized strings.
  Pilot English/Urdu content if learner feedback supports it.
- [ ] **F6.5: Pilot feedback.** Ask a small teacher/learner group to complete specific
  experiments; record completion problems and reproducibility failures without requiring
  accounts or collecting student identifiers.

**Exit criteria:** a teacher can create, share, run, and assess an experiment from exported
files; learners can complete the essential workflow with a keyboard; pilot findings are
recorded and critical failures resolved. Client-side teacher locks are classroom guidance,
not tamper-proof exam security.

### F7 — Catalogue and research extensions

Choose one module at a time from the existing M3 catalogue.

1. **Waves & Optics:** interference, refraction, lenses, and diffraction with analytic
   reference cases and lessons.
2. **Circuits / Electromagnetism:** start with DC circuits and Kirchhoff constraints;
   extend to RC dynamics and fields after validating the solver.
3. **Reaction kinetics and equilibrium:** concentration-based models first, with mass balance,
   temperature dependence, and transparent assumptions.
4. **Later:** bacterial colonies, neurons, fluid/terrain systems, and other catalogue entries
   according to learner demand and scientific review capacity.

Each new module must provide the common interaction contract, deterministic scenarios,
checkpoint support, units, assumptions, reference tests, a performance budget, one lesson,
and one comparison experiment before being called complete.

Optional **AI experimentation interface** after F1–F4: expose versioned reset, observe,
act, and step operations plus bounded experiment execution. This could let a separate
agent project learn control or experimental design in these environments. Start with a
small headless benchmark, held-out scenarios, and simple non-learning baselines. Keep it
optional and separate from the core educational UI; success in simplified simulations
does not establish human-level intelligence or real-world transfer.

### Delivery rules and next batch

- Maintain existing issues #2, #7, #9, and #10 as their canonical workstreams.
  When implementation starts, create only missing, scoped issues referencing the F identifiers.
- Keep one logical change per commit; update this roadmap and relevant TRD evidence when
  work actually passes its exit criteria.
- Run relevant unit and browser tests for behavior changes. Add numerical and
  save/resume regression tests for scientific execution changes.
- Defer WebGPU until CPU/worker measurements justify it; defer WebXR, hosted accounts,
  multiplayer, and a general AI tutor until core experiment workflows are validated.
- Track reproducibility failures, validation error, hardware performance, and pilot task
  completion. Avoid treating catalogue size or test count alone as product success.

**Next implementation batch:** F1.1 timing contract → F1.2 scheduling regressions and
fixed-step execution → F1.3 versioned checkpoints → F1.4 shared validation → F1.5 provenance.
Then ship the smallest F3 paired comparison while completing measured F2 improvements.
