# Technical Requirements Document (TRD) — Simulations

| | |
|---|---|
| **Status** | Draft v1.0 |
| **Last updated** | 2026-10-16 |
| **Related** | [PRD](PRD.md) · [System Design](SYSTEM_DESIGN.md) · [Test Plan](TEST_PLAN.md) · [ADRs](adr/) |

This document turns the product requirements in the [PRD](PRD.md) into **testable
technical requirements**. Each requirement has an ID, a verification method and its
current status.

Verification: **T** automated test · **M** manual check · **I** inspection / code review · **B** benchmark.

---

## 1. Scope

In scope: the browser application (shell, UI, rendering), the simulation engine
core, all simulation modules, the local development server and the automated test
suite. Out of scope for v1: back-end services, accounts, persistence, analytics.

## 2. Technology constraints

| ID | Requirement | Verification | Status |
|---|---|---|---|
| TC-1 | Pure client-side app delivered as static files (HTML, CSS, ES modules) | I | Met |
| TC-2 | **No runtime dependencies and no build step**; source runs as-is in the browser | I | Met |
| TC-3 | Simulation code must run in Node.js ≥ 18 without a DOM, for headless testing | T | Met |
| TC-4 | Target browsers: current Chrome, Edge, Firefox and Safari (ES2022, Canvas 2D, Pointer Events, OffscreenCanvas optional) | M | Met (tested in Chromium) |
| TC-5 | Rendering through the Canvas 2D API; HiDPI-aware (devicePixelRatio) | I | Met |
| TC-6 | Development server: `npm start` serves the repo root with no dependencies | M | Met |
| TC-7 | Licence-clean: no third-party code copied into the repo | I | Met |

## 3. Architecture requirements

| ID | Requirement | Verification | Status |
|---|---|---|---|
| AR-1 | Every simulation is a subclass of `Simulation` implementing the **interaction contract** (see [System Design §4](SYSTEM_DESIGN.md#4-the-simulation-contract)) | T (contract test) | Met |
| AR-2 | The UI must not contain domain-specific logic; it interacts with modules only through the contract | I | Met |
| AR-3 | Modules are registered in one place (`src/sims/index.js`); adding a module requires no UI changes | I | Met |
| AR-4 | Simulation state is owned by the module; the UI holds only references (selection) and view state | I | Met |
| AR-5 | Modules must not depend on each other; shared code lives in `src/core/` | I | Met |
| AR-6 | All randomness in modules goes through the seedable `Random` class | I | Met |

## 4. Functional technical requirements

### 4.1 Simulation lifecycle
| ID | Requirement | Verification | Status |
|---|---|---|---|
| FT-1 | `loadScenario(id)` fully re-initialises the world deterministically for a given seed | T | Met |
| FT-2 | `step(dt)` accepts real elapsed seconds (≤ 50 ms per frame after clamping) and advances simulated time | T | Met |
| FT-3 | Modules sub-step internally to stay numerically stable at any user speed setting | T/I | Met |
| FT-4 | An exception thrown during `step` must not crash the app; the UI pauses and logs it | I | Met |

### 4.2 Interaction contract
| ID | Requirement | Verification | Status |
|---|---|---|---|
| FT-10 | `pick(x, y, r)` returns the nearest entity within tolerance, or null | T | Met |
| FT-11 | `describe(e)` returns a title and typed fields (`number`, `text`, `select`, `readonly`, `action`) | T | Met |
| FT-12 | `setProperty(e, key, value)` validates and clamps values to physically meaningful ranges | T | Met |
| FT-13 | `add`, `remove`/`removeAt`, `move`, `impulse`, `energy` work in every module without throwing, with or without a target entity | T | Met |
| FT-14 | `locate(e)` returns null for entities that no longer exist, so the UI can clear stale selections | T | Met |
| FT-15 | `stats()` returns labelled values; every key in `chartKeys` exists in `stats()` | T | Met |

### 4.3 UI
| ID | Requirement | Verification | Status |
|---|---|---|---|
| FT-20 | Parameter controls are generated from `paramDefs` (range with optional log scale, checkbox, select) and resync after a scenario load | M | Met |
| FT-21 | The inspector refreshes live (≤ 300 ms) without overwriting a field the user is editing | M | Met |
| FT-22 | Stats refresh at 4 Hz; the chart samples at 4 Hz while running, keeping the last 400 samples | I | Met |
| FT-23 | Camera supports pan, zoom-at-cursor and fit-to-bounds, and y-up worlds (`meta.yUp`) | M | Met |
| FT-24 | URL hash `#sim/scenario` loads that simulation and scenario | M | Met |

## 5. Scientific model requirements

Each module must reproduce the listed reference behaviour.

| ID | Module | Requirement | Verification | Status |
|---|---|---|---|---|
| SM-1 | Gravity | Units AU / yr / M☉ with G = 4π²; a circular 1 AU orbit around 1 M☉ closes in 1.00 yr (±0.01 AU) | T | Met |
| SM-2 | Gravity | Symplectic integrator; relative energy drift < 1e-6 over one orbit at the default step | T | Met |
| SM-3 | Gravity | Mergers conserve mass and linear momentum exactly | T | Met |
| SM-4 | Gravity | Bodies added near an attractor start on a circular orbit (e < 0.01) | T | Met |
| SM-5 | Stars | The Sun at 4.6 Gyr: main sequence, class G, L ≈ 1 L☉, T ≈ 5778 K (±600 K) | T | Met |
| SM-6 | Stars | End states by initial mass: < 8 M☉ → white dwarf; 8–25 M☉ → neutron star; > 25 M☉ → black hole | T | Met |
| SM-7 | Stars | Initial masses sampled from a Salpeter IMF (0.1–60 M☉) | T | Met |
| SM-8 | Atoms | Thermostat brings the temperature to its target within ±15 % | T | Met |
| SM-9 | Atoms | Bonds never exceed element valence; molecules reported in Hill notation | T | Met |
| SM-10 | Weather | Saturation mixing ratio at 20 °C, 1000 hPa within 0.0140–0.0152 kg/kg | T | Met |
| SM-11 | Weather | A warm, moist perturbation produces an updraft > 1 m/s and cloud | T | Met |
| SM-12 | Weather | All prognostic fields remain finite | T | Met |
| SM-13 | Ecosystem | Reproduction passes mutated genes to offspring; genes clamp to valid ranges | T | Met |
| SM-14 | Ecosystem | Herbivores die out without plants (energy conservation sanity check) | T | Met |
| SM-15 | Epidemic | An outbreak infects > 50 people in the default town; 60 % vaccination reduces total infections | T | Met |

## 6. Performance requirements

Reference machine: mid-range laptop (4-core, integrated GPU), Chromium, default scenario and settings.

| ID | Requirement | Verification | Status |
|---|---|---|---|
| PR-1 | First render ≤ 2 s after page load on a local server | B | Met |
| PR-2 | Simulation step + render ≤ 16 ms/frame for Gravity, Stars, Atoms, Ecosystem, Epidemic | B | Met (0.1–4 ms step time measured headless) |
| PR-3 | Weather ≤ 33 ms/frame at default settings | B | Met at the limit (~20–25 ms measured headless); optimisation on roadmap |
| PR-4 | Galaxy scenarios support ≥ 1 500 test particles interactively | B | Met |
| PR-5 | Memory stays bounded during long runs (trails, chart, populations capped) | I | Met |
| PR-6 | UI controls respond within 100 ms while simulations run | M | Met |

## 7. Reliability and robustness

| ID | Requirement | Verification | Status |
|---|---|---|---|
| RR-1 | Numerical safeguards: force clamping (atoms), softening (gravity), CFL-safe step sizes (weather), sub-step caps | I/T | Met |
| RR-2 | Invalid inspector input (NaN, empty) is ignored | I | Met |
| RR-3 | Population and entity counts are capped (e.g. `maxPop`) to avoid runaway growth | I | Met |
| RR-4 | Removing a selected entity clears the selection; no dangling references in the inspector | M | Met |

## 8. Usability and accessibility

| ID | Requirement | Verification | Status |
|---|---|---|---|
| UA-1 | All controls are native, labelled form elements | I | Met |
| UA-2 | Keyboard shortcuts: Space, `.`, `f`, `1`–`6`, Esc, Del | M | Met |
| UA-3 | Layout adapts below 900 px width | M | Met |
| UA-4 | Touch input via Pointer Events (single-pointer tools) | M | Partial: no pinch-zoom yet |
| UA-5 | Colour is not the only carrier of information for state (labels in inspector and stats) | I | Met |

## 9. Security and privacy

| ID | Requirement | Verification | Status |
|---|---|---|---|
| SP-1 | No network calls at runtime, no cookies, no personal data collected | I | Met |
| SP-2 | Dev server rejects path traversal outside the project root | I | Met |
| SP-3 | No use of `eval`, `innerHTML` with user data, or dynamic code loading | I | Met |
| SP-4 | Future shared-world files must be validated against a schema before loading | — | Planned |

## 10. Maintainability and quality

| ID | Requirement | Verification | Status |
|---|---|---|---|
| MQ-1 | `npm test` runs all suites with Node's built-in test runner | T | Met (30 tests) |
| MQ-2 | Every registered module is covered automatically by `tests/contract.test.js` | T | Met |
| MQ-3 | Each module has at least one physics or behaviour test against a known result | T | Met |
| MQ-4 | Code style: ES modules, no globals (except `window.app` for debugging), JSDoc on module classes | I | Met |
| MQ-5 | CI runs tests on every pull request | — | Planned |

## 11. Traceability (PRD → TRD)

| PRD | TRD |
|---|---|
| G1 Breadth, FR-30…35 | SM-1…SM-15 |
| G2 Interactivity, FR-10…15 | AR-1, FT-10…15 |
| G3 Experimentation, FR-20…22 | FT-20…22 |
| G4 Plausibility | SM-*, RR-1 |
| G5 Accessibility | TC-1, TC-2, TC-4, UA-* |
| G6 Extensibility, US-13 | AR-1…AR-5, MQ-2 |
| NFR performance | PR-1…PR-6 |
