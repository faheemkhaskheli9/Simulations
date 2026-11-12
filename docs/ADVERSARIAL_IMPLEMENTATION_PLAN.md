# Adversarial implementation plan — Science runtime and OMNIVERSE

**Reviewed:** 2026-11-12 · **Scope:** `main` · **Status:** rolling implementation, not a completed release.

## Canonical work tracking

This is a test-driven implementation order and risk register, **not a replacement** for
`docs/ROADMAP.md` (F1–F6), `docs/omniverse/G0_FOUNDATION_PLAN.md` (G0), or
GitHub issues [#20](https://github.com/faheemkhaskheli9/Simulations/issues/20)
and [#12](https://github.com/faheemkhaskheli9/Simulations/issues/12).
Do not open duplicate issues for work tracked there. A checked item here is not
evidence that its entire parent phase is complete.

## Review evidence and repairs already landed

| Risk | Evidence | Status | Required release proof |
|---|---|---|---|
| 3D solar flux ignores z | `src/world/couplings.js` orbit-climate distance | Fixed: `0749a9e` | Inclined-orbit test and unchanged 2D results |
| Malformed URL can terminate local server | `server.js` decodes without a handler | Fixed: `ec86fa7`, hardened: `3a82a30` | Malformed encoding/NUL returns 400, next request works |
| Offline world misses checkpoint import | `sw.js` lacked `src/world/checkpoint.js` | Fixed: `a7e3304` | Dependency-closure unit test + real offline smoke |
| Preview clock ignores speed | `World.step()` applied speed to physics only | Fixed: `07ba545` | 1×/2× cadence, pause/invalid frame regression |
| Unvalidated public parameter writes | `Simulation.setParam()` accepted arbitrary data | Partially fixed: `784a458` | Bounds/type tests; still audit imports, entity properties |
| Excess experiment intake silently dropped | `World.advance()` truncated backlog | Fixed: `ff59990` | Saturation conservation, save/resume with deferred time |
| World simulations can resume from fresh defaults after idle unloading | `Site.unload()` keeps only touched state | Open: define preview vs persistent state policy | Advance idle world, unload/revisit, compare with intended model |
| Missing fully qualified scientific coupling contracts | units/time maps/smoothing embedded in functions | Open F4.1 | Per-coupling contract, reference fixtures and constraints |
| No runnable multiverse game | `src/omniverse/` not present at review | Open G0/G1 | Rule inspector first; then playable gravity puzzle |

**Adversarial caveat:** Static code inspection and committed tests do not prove a release.
Run Node tests, browser tests and target-device performance checks before promoting a milestone.

## Milestones in dependency order

### R0 — Runtime correctness (P0, existing F1)
1. Keep the two execution modes separate: approximate interactive preview versus fixed-tick reproducible experiment.
2. Make world/coupling clocks consistent with actual accepted simulation time. Document and test what preview discards for ambient sites.
3. Account for every experiment intake second. Keep runnable pending time bounded and hold overflow as deferred duration; persist both.
4. Close all mutation channels: parameters, object properties, history/undo, imported snapshots, couplings, UI controls and queued effects. Validate types, finite numbers, bounds and enums; explicitly define unknown-key behavior. Do not invalidate existing scenario presets merely because UI slider bounds differ.
5. Save full model versions, code revision, seeds and RNG state, clock, scheduler continuation, coupling state and ordered intervention records. Validate before swapping live state; migrate older saves.
6. Test same tick after different frame schedules, mode switching, cap saturation, invalid input, offscreen unload/reload, pause and checkpoint continuation.

**Exit:** identical headless inputs produce identical same-runtime snapshots at equal ticks; no silent time loss; malformed state leaves current state unchanged; migration fixtures pass.

### R1 — Reliability and performance (P1, existing F2 and World #9/#10)
1. Add response/security tests for the static server and offline dependency-closure tests. Validate clean installs, interrupted updates and offline World cold start in a real browser.
2. Benchmark 30/60/144Hz display schedules, desktop and low-end Android hardware: p50/p95 frame and step latency, memory, render resolution, simulation size, seed and device identifier.
3. Move weather computation to a bounded Web Worker protocol with transferable buffers, cancellation, stable error handling and main-thread fallback. Physics output must agree within a documented tolerance.
4. Profile N-body collision candidates, particle-neighbour queries, object churn, draw calls and texture refresh; optimize proven hotspots only.
5. Handle WebGL2 absence, context loss, device sleep/wake, storage exhaustion and long-running soak tests.

**Exit:** reproducible reference-device measurements against existing W-PR budgets; failure recovery, parity and offline tests.

### R2 — Reproducible scientific experiments (P1, existing F3)
1. Define manifest: initial checkpoint, model versions, intervention schedule, control/treatment values, seed list, duration, metrics and provenance.
2. Build pure headless runner; isolate compared worlds; provide deterministically ordered intervention application.
3. Support paired experiments and repeated-seed ensembles, bounded concurrency and cancellation.
4. Export/import full portable bundles; replay and branch without violating snapshot immutability.
5. Report uncertainty, seed-to-seed variation and observed error separately.

**Exit:** compare drought vs control, orbital-speed and CO₂ interventions at equal logical ticks; rerun exported bundles equivalently.

### R3 — Scientific validity (P1, existing F4)
1. Add explicit dimension/unit, scale, timestep, valid range, smoothing and ownership metadata to each coupling.
2. Fix coordinate-frame handling and verify 2D/3D equality when z=0. Treat multi-writer coupling conflicts as errors, not unspecified last-writer wins.
3. Validate conservation and convergence where physically applicable; add calibrate-vs-validate splits, reference fixtures and model-version evidence.
4. Mark climate-to-infection coupling illustrative, not a validated epidemiological forecast. Keep science vs game claims distinct.
5. Add a user-readable model limitations and validation panel.

**Exit:** no enabled coupling without declared units, assumptions, source/target time mapping and reference validation status.

### R4 — Complete World product (P2, existing F5/F6)
1. Separate real simulated 3D domains from 2D models visualized in 3D.
2. Preserve all six interaction tools, keyboard/pointer access, undo, sharing and state load in each native view.
3. Deliver accessible tables, screen-reader alternatives, reduced motion, teacher notebook, presenter tools and localization pilot.
4. Run a usability pilot and correct task-completion blockers before expanding the catalogue.

**Exit:** feature-parity and accessibility acceptance matrix; learning tasks completed in representative user testing.

### G0 — OMNIVERSE foundation (P1 after R0 contracts)
1. `G0.01–04`: preserve science baselines; add isolated `#game/<universe>` route, strict versioned data-only RulePack/UniverseManifest schemas and built-in Prime/Drift/Flux.
2. `G0.05–06`: build deterministic, DOM-free evaluator, bounded spherical fields, explicit local SI reference frame and stable overlap/priority semantics.
3. `G0.07–10`: atomic game-session save/import; capability and portal preflight only; rule inspector; injected logical tick. Do not attempt teleportation or gameplay yet.
4. `G0.11–12`: fuzz malformed/untrusted rules, invalid floats and giant payloads; render fallback, PWA, ADRs and migration tests.

**Exit:** inspector demonstrates known numerical fixtures; reload, isolation and malformed-import tests pass. This is **not yet playable**.

### G1 — First playable physics puzzle (P1, Game epic #12)
1. One local terrain arena, character/controller, gravity inversion region and reliable collision.
2. One energy-costed power, scanner explaining local rules, one puzzle whose solution depends on the chosen law.
3. Checkpoint, reset, death/softlock escape and route cleanup; keyboard/touch controls.
4. Two rounds of hands-on playtesting; measure completion, failures and time to learn.

**Exit:** a player can enter, discover the law, use a power and finish the puzzle without developer assistance.

### G2–G3 — Multiverse vertical slice (after G1)
1. Add compatible portal transfer transforms, inventory/resource policies, event ordering across local time domains and safe arrival handling.
2. Add Drift/Flux puzzles, five bounded powers and six varied law-based challenges; explicit energy/momentum budget whenever required by the fictional rule pack.
3. Publish a 30-minute replayable experience with state restoration and reproducible seed fixtures.

**Exit:** two universes lead to materially different solutions with the same abilities; save→resume and portal→return are stable.

### G4 — Procedural scale (after vertical slice)
1. Versioned hierarchical addressing: universe→galaxy→system→planet→sector; independent domain seeds.
2. Bounded active sectors, LOD visuals, offscreen aggregate simulation and persistent sparse deltas.
3. Deterministic load order, fast-travel restoration and generator upgrades preserving discovered locations.

**Exit:** traversal order and rendering changes do not re-roll visited world state; memory remains budgeted over long journeys.

### G5–G6 — Optional ecosystem, civilization, creators and online
1. Only after player testing: faction systems, ecology, crafting and discoverable authored challenge manifests.
2. Separate optional LLM dialogue from canonical deterministic game state. Reject executable rule payloads.
3. Multiplayer only after validated server authority, cheat/abuse controls, replay semantics and demonstrated demand.

**Exit:** optional complexity improves engagement without invalidating offline saves or physics guarantees.

## Adversarial threat matrix

| Attack/failure | Expected failure | Countermeasure and invariant |
|---|---|---|
| Malicious JSON, keys, huge typed arrays, deep trees | Freeze, unsafe mutation, memory exhaustion | Reject size/depth/entity count; prototype-safe maps; validate full payload before adoption |
| NaN, extreme mass, invalid time multiplier | Solver divergence or infinite loops | Finite/unit/range validators; bounded step count; known capability registry |
| FPS/budget/camera dependence | Divergent experiments | Pure fixed ticks; render-only adaptive quality; seeded deterministic streams |
| Saving with a pending tick/event | Different future after resume | Persist runnable/deferred time, RNG, model state, event queue and stable ordering |
| Portal under incompatible physics | Lost items, invalid frame, infinite energy | Explicit transfer preflight and transform policy; consistent stable IDs |
| Multiple couplings writing one parameter | Order-dependent science | Ownership/conflict rejection or declared reducer |
| Physics anomalies trivialized by powers | No puzzle decisions | Power costs, cooldowns, supported-target constraints; playtest counterexamples |
| Procedural infinite emptiness | Large but uninteresting world | Distinct mechanics, POI density gates and authored seed fixtures |
| Worker crash/cancel during checkpoint | Half-applied state | Versioned message sequence, atomic swap and recovery/fallback |
| Old service worker + new module graph | Offline load failure | Import-closure test, cache version discipline, cold-start browser test |

## Release policy

- One logical task and its tests per commit. Preserve previous save formats, science routes and public contracts.
- Never count CI billing failures or unrun browser tests as passed.
- Require adversarial counterexamples for every claimed fixed invariant.
- Keep F1, F2 and game epic issues open until their *full* exit criteria are demonstrated.
- Prefer a smaller functioning, measured vertical slice over more models, procedural features or documentation-only milestones.
