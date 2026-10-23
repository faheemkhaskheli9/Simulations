# OMNIVERSE — G0: Detailed Foundation Plan

**Status:** Planned, not implemented. **Priority:** P0. **Estimate:** 15–23 engineer-days of focused G0 work, plus shared F1 dependencies if unfinished. **Date:** 2026-10-23.  
**Parent:** [OMNIVERSE plan](../MULTIVERSE_GAME_PLAN.md) · [Epic #12](https://github.com/faheemkhaskheli9/Simulations/issues/12) · [Shared F1/F2 roadmap](../ROADMAP.md#future-execution-plan-2026-10-19)

## 1. Deliverable and boundaries

G0 creates a separately routed game foundation with versioned universe data, validated physics rule packs, deterministic rule evaluation, and a usable rule inspector. G0 **does not** deliver playable avatars, planets, combat, missions, terrain, portals, or multiplayer. Those belong to G1–G6.

**Exit demo:** Enter Game mode on Prime; inspect gravity and time; switch to Drift and observe a gravity-inversion zone; switch to Flux and observe local time-rate changes; export/import a minimal Game session; return to untouched 2D/3D Science modes.

**Non-negotiables:** preserve existing scientific equations and saves; retain browser ES modules, current WebGL2 and Node tests; no additional backend or alternate game engine as a prerequisite; no executable imported rule scripts.

## 2. Baseline from the actual repository

| Existing file | Relevant behavior | G0 action |
|---|---|---|
| `src/ui/app.js`, `src/main.js` | App handles hash routing, 2D and lazy 3D stages | Add `#game/<id>` route; manage one active stage and its listeners |
| `src/world/ui/world-stage.js` | WebGL2 world stage and UI binding | Reuse rendering concepts but isolate game state from science site instances |
| `src/world/world.js` | Place tree, scheduler, couplings and touched-site saves | Leave science World logic unchanged |
| `src/world/scheduler.js` | Frame-budgeted ambient stepping may discard time | F1 handles deterministic fixed-step execution; do not fork scheduler |
| `src/core/simulation.js` | Scientific simulation contract, serialization and RNG | Keep science contracts unchanged; add separate game adapters |
| `src/core/random.js` | Seedable PRNG | Reuse, deriving distinct per-universe/subsystem seeds |
| `src/world/places.js`, `engine/camera3d.js` | Nested local frames and scale-safe rendering | Specify game-frame unit conversion and reuse rendering infrastructure |
| `src/world/couplings.js` | Smoothed science couplings | Do not treat as general-purpose game reality code |
| `src/world/routes.js` | `#world/...` | Do not reinterpret science routes |
| `sw.js`, `tests/` | Offline assets, Node + Playwright scripts | Add lazy game files and tests without new runtime dependencies |

**Dependency reality:** F1 in `docs/ROADMAP.md` already owns fixed-step execution, complete checkpointing, atomic mutation validation and provenance; F2 and issues #9/#10 own performance/worker improvements. Those remain the shared source of truth. G0 guarantees only deterministic *pure rule evaluation* at a supplied logical tick, **not** complete history replay of all scientific or game worlds.

## 3. Architecture decisions and invariants

**A. Mode isolation:** Existing `#world/...` and 2D routes stay Science. New `#game/prime`, `#game/drift`, `#game/flux` select a lazy GameStage with private GameSession. No game imports into `src/sims/*`. Entering/leaving a mode unregisters owned input handlers and stops its updates. Do not reuse scientific `World` as the game session.

**B. Capability-based RulePacks:** Imported rules are **data**, interpreted by registered, code-defined capabilities. G0 recognizes `gravity-field.v1` and `local-time-rate.v1` only. Invalid or unknown capabilities fail validation; no arbitrary JavaScript or user-defined expressions.

**C. Units and reference frames:** Game-local coordinates use metres, seconds, kilograms, 3D y-up. Gravity returns acceleration vector in m/s², not the astronomical `G` used by N-body solar-system models. Frames have explicit IDs and conversion boundaries; future portal crossings are not implicit coordinate copying.

**D. Determinism:** All evaluators take explicit position, local frame, integer logical tick and validated rules. No wall time, DOM, camera, render FPS or global RNG in rule evaluation. Use stable per-universe/subsystem seeds.

**E. Persistence:** Separate `omniverse-session` format, schema version 1. Validate complete import before mutating a session. Incompatible future/unknown RulePack versions must yield a clear error. Preserve old Science save importers.

**F. Fiction disclosure:** Prime is an approximate game baseline, not a replacement for validated Science Mode. Drift and Flux are fictional; clearly label their assumptions in the UI.

## 4. Proposed source layout

- `src/omniverse/schema.js` — current schema constants and bounds.
- `src/omniverse/validate.js` — strict parse, normalization, immutable validated results.
- `src/omniverse/rules/registry.js` — approved capability IDs and evaluator registration.
- `src/omniverse/rules/fields.js` — pure sphere geometry, falloff and priority resolution.
- `src/omniverse/rules/evaluate.js` — canonical headless `evaluateRules` API.
- `src/omniverse/universes/{prime,drift,flux}.js` and `index.js` — built-in manifests.
- `src/omniverse/session.js` — universe selection and logical tick state.
- `src/omniverse/persistence.js` — atomic session import/export.
- `src/omniverse/transfer.js` — transfer compatibility preflight, not travel.
- `src/omniverse/ui/game-stage.js`, `rule-inspector.js` — browser shell and inspector.
- `tests/omniverse-*.test.js`, `tests/e2e/omniverse.e2e.mjs` — existing script-compatible names.
- `docs/adr/` — implementation ADRs, using the next available numbers.

Game rule modules must be DOM- and renderer-independent. Keep the initial inspector minimal; reuse existing renderer only when it reduces work.

## 5. RulePack v1 contract

A **UniverseManifest** has: `format='omniverse-universe'`, `schemaVersion=1`, stable `id`, `seed` (unsigned 32-bit), `generatorVersion`, `rulePackId`, `rulePackVersion`, `spatialFrame='local-3d-y-up'`, declared SI units, `displayName`, and `contentProfile` metadata.

A **RulePack** has: `format='omniverse-rules'`, `schemaVersion=1`, immutable ID/version; declared capabilities; gravity base vector and allowed magnitude range; local time base rate and valid bounds; plus an ordered set of spatial fields. Each field declares a unique ID, capability, sphere center/radius (in metres), bounded priority, permitted operation/value and constant-or-linear falloff.

### Initial three universes

| Universe | Gravity outside special fields | Local time | Special field and inspection fixture |
|---|---|---|---|
| Prime | [0, -9.81, 0] m/s² | 1 | No field; acceleration downward |
| Drift | [0, -1.62, 0] m/s² | 1 | Spherical inversion: at center gravity [0, +1.62, 0] |
| Flux | [0, -9.81, 0] m/s² | 1 | Spherical time field: at center local rate 0.5 |

These are game-design parameters, not a claim that exotic physics is scientifically correct.

### Pure evaluation API

Input: `evaluateRules({manifest, rulePack, localFrameId, position:[x,y,z], tick, transientEffects:[]})`.

Output: `{gravity:[gx,gy,gz], timeRate, contributingFields:[ids], provenance:{manifestId,rulePackId,rulePackVersion,tick}, warnings:[]}`.

**Resolution order:** pack baseline → spatial fields sorted by increasing priority then lexicographic ID → later transient ability effects in a separate final tier → final finite/bounds validation. Gravity fields may `replace` (interpolate toward vector) or `add` bounded vectors; time fields may `replace` or `multiply` by positive bounded scalars. Disallow nonsensical operations rather than infer semantics. Sphere boundary includes equality; linear falloff weight equals `1-distance/radius` inside. Explicit tests must cover ties, overlaps, centers, boundaries and invalid values.

**Time rule:** The authoritative global tick advances exactly once. A local subsystem later computes `dtLocal = dtGlobal × timeRate`; it must not also scale global scheduler time. No negative time rates, time reversal, zero rate, or cyclic causality in G0.

### Capability and transfer interfaces (definitions only)

- `queryCapability(rulePack, abilityDescriptor, position)` returns supported/unsupported with machine-readable reasons. Reserve gravity-control, kinetic-redirect, energy-weave, time-shear identifiers; do not implement powers.
- `planTransfer(sourceManifest, targetManifest, entityDescriptor, frames)` returns `allowed`, `transformed`, or `blocked` plus reasons/transforms. G0 only validates/preflights; actual teleportation belongs to G2.

### Minimal G0 session format

`{format:'omniverse-session',schemaVersion:1,selectedUniverseId:'prime',seed:12345,logicalTick:0,rulePackId:'prime-v1',rulePackVersion:1}`

Do not serialize fictional future inventory or world chunks. Future full checkpoints need F1 clock, RNG state, event queue and scheduler continuation. Reject incompatible save formats without altering the current session.

## 6. Implementation backlog, dependencies and effort

| Task | Priority | Action | Depends on | Effort | Proof |
|---|---|---|---|---|---|
| **G0.01** | P0 | Capture existing route, test and save baselines; document current F1 gaps | — | 0.5–1 day | Baseline tests/results recorded |
| **G0.02** | P0 | Implement `#game` route, lazy GameStage, enter/leave ownership | .01 | 1–2 days | Game→Science→Game does not duplicate handlers or disturb science |
| **G0.03** | P0 | Strict schema, normalization and prototype-safe validators | .01 | 1.5–2 days | Good fixtures pass; malformed input rejected |
| **G0.04** | P0 | Rule/universe registry with Prime/Drift/Flux built-ins | .03 | 1–1.5 days | Stable IDs, known versions, explicit unknown-ID errors |
| **G0.05** | P0 | Spatial evaluator, deterministic overlaps, gravity/time ops | .04 | 2–3 days | Numeric center/edge/overlap/tie fixtures pass |
| **G0.06** | P0 | Local 3D frame/units and domain-adapter interface | .05 | 1–1.5 days | Cannot confuse game local gravity with orbital `G` |
| **G0.07** | P0 | Minimal session serializer with atomic validated load | .03,.04 | 1.5–2 days | Same valid session roundtrips; invalid leaves original unchanged |
| **G0.08** | P1 | Ability compatibility + portal transfer preflight contracts | .04,.06 | 1–2 days | Unknown/unsafe transfers blocked with reason codes |
| **G0.09** | P0 | Inspector UI, universe switch, field output and warning labels | .02,.05 | 1.5–2.5 days | Prime/Drift/Flux demo runs in browser |
| **G0.10** | P0 | Injected logical-tick contract; connect to shared F1 API when available | .05,.07 | 1–2 days | Same tick/input yields same result independent of render |
| **G0.11** | P0 | Unit, isolation, security, routing and browser regression tests | .02–.10 | 2–3 days | Current and new suites pass |
| **G0.12** | P1 | PWA cache, ADRs, usage/limitations and G1 handoff | .09,.11 | 1–1.5 days | Offline smoke, docs and accepted interfaces |

Effort ranges represent **active engineering work**, not deadlines. Some steps can be parallelized after the schema is stable. Prefer one logical change and its tests per commit; do not replace the existing roadmap or open a duplicate performance issue.

### Delivery gates

1. **A — Schema ready:** .01/.03/.04 done; all packs validated and discoverable.
2. **B — Rules ready:** .05/.06/.10 done; pure, bounded and deterministic evaluation verified.
3. **C — Integration ready:** .02/.07/.09 done; actual inspector works without modifying Science Mode.
4. **D — G0 complete:** .08/.11/.12 done; regressions, security, offline behavior, docs, and G1 contracts pass.

## 7. Test matrix and acceptance criteria

| Area | Required test cases |
|---|---|
| Validation | Valid v1; missing keys; duplicate IDs; unknown capabilities; mismatched versions; wrong array shapes; unsupported operations |
| Numerical | NaN/Infinity; negative/zero radius; invalid vectors; extreme coordinates; negative/zero/out-of-range local time |
| Rule semantics | Prime downward; Drift low-gravity/upward inversion; Flux 0.5 time; center, boundary, outside, overlapping and equal-priority fields |
| Determinism | Same manifest, tick, position and inputs produce equal results; sampling order and render cadence irrelevant |
| RNG | Derived domain seeds stable and independent of feature generation order |
| Persistence | Exact accepted session roundtrip, older science-save separation, incompatible version rejection and no partial mutation |
| Isolation | `src/sims` does not import game; switching modes and saving Science states remains compatible |
| Browser | Three game routes, old world route, legacy 2D routes, unknown universe, reduced motion, absent WebGL2, lack of local storage |
| Transfer preflight | Valid identity case, unknown destination, incompatible frames/capability, stable reason codes |
| Security | Huge/deep payloads; unsafe object keys; HTML in titles; invalid import does not execute scripts or corrupt state |
| Performance | Inspector load time and rule-evaluation throughput recorded on reference browser/device, not promised without measurements |

**Run:** `npm test`, `npm run test:e2e`, `npm start`; retain current CI and update `sw.js` with lazy Game modules. If browser dependencies are missing locally, record tests as unrun, not passed. Cross-platform numerical checks need documented tolerances; do not promise bit-identical floating-point across browsers.

## 8. Final acceptance and G1 handoff

G0 is complete only when a developer can open the Game Inspector, change between three coherent rule packs, inspect gravity/time and field contributions, verify that malformed manifests fail safely, save/restore the minimal game session, and return to science routes without regressions.

G1 must be able to construct a GameSession, query gravity at a player position in a local frame, and hand the resulting acceleration to a **new character/rigid-body adapter**. No runtime is authorized to rewrite the original scientific `Simulation` parameters simply because a player entered Drift or Flux.

**First implementation packet:** baseline + schema + registry + pure evaluator and tests. Then add route/UI, persistence and preflight. Start the gravity-inversion *playground* only after the G0 release gate.
