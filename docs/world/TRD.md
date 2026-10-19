# Technical Requirements Document (TRD) — Simulations World (3D)

| | |
|---|---|
| **Status** | v1.0: implementation status per requirement in [§12](#12-implementation-status) |
| **Last updated** | 2026-10-19 |
| **Related** | [PRD](PRD.md) · [System Design](SYSTEM_DESIGN.md) · [Plan](PLAN.md) · 2D [TRD](../TRD.md) · [ADRs](../adr/) |

This document turns the [World PRD](PRD.md) into **testable technical requirements**.
Every requirement of the 2D [TRD](../TRD.md) still applies to the simulation modules;
this document adds what the 3D world needs. IDs are prefixed `W-` to keep them distinct.

Verification: **T** automated test · **M** manual check · **I** inspection / code review · **B** benchmark.
Status of each requirement: see [§12](#12-implementation-status).

---

## 1. Scope

In scope: the 3D engine (`src/world/engine/`), places, sites, scheduler, couplings,
world persistence and routes, the world UI, the shared panels extracted from the 2D app,
native 3D views, and their tests. Out of scope: changes to module physics except the
optional 3D modes listed in §5, back-end services, accounts, analytics, WebXR.

## 2. Technology constraints

| ID | Requirement | Verification |
|---|---|---|
| W-TC-1 | No runtime dependencies and no build step; the world is plain ES modules, HTML, CSS and GLSL in template strings | I |
| W-TC-2 | Rendering uses **WebGL2**; all GL calls are confined to `src/world/engine/` | I |
| W-TC-3 | Modules and native 3D views draw through `Renderer3DApi` only, never raw GL | I |
| W-TC-4 | Everything in `src/world/` except `engine/gl.js`, `engine/renderer.js` and `ui/` runs in Node ≥ 18 without DOM or GL | T |
| W-TC-5 | Target browsers: current Chrome, Edge, Firefox, Safari (WebGL2, OffscreenCanvas 2D, Pointer Events) | M |
| W-TC-6 | Added source for the world (excluding tests and docs) ≤ 250 KB unminified | I |
| W-TC-7 | No third-party code copied into the repository | I |
| W-TC-8 | Works offline as part of the existing PWA (all world files in the service-worker cache) | M |

## 3. Architecture requirements

| ID | Requirement | Verification |
|---|---|---|
| W-AR-1 | Every registered module runs in the world through the surface adapter **with no change to its source** | T (world contract test) |
| W-AR-2 | The world interacts with simulations only through the `Simulation` contract plus the optional `render3D`/`pick3D`/`locate3D`/`*3D` tool hooks and `outputs()` | I |
| W-AR-3 | Modules must not import anything from `src/world/` | I (lint script) |
| W-AR-4 | Tools, parameters, inspector, stats, chart and history are one shared component (`SitePanels`) used by both the 2D app and the world | I |
| W-AR-5 | The world layout (places and sites) is data in one file; adding a place or site requires no code elsewhere | I |
| W-AR-6 | A layout test checks every site's module id and scenario id, and that every registered module appears at least once | T |
| W-AR-7 | Each place has its own unit and frame; no coordinate sent to the GPU exceeds 10⁶ in magnitude in any scene of the default layout | T |
| W-AR-8 | Couplings read only `stats()`/`outputs()` and write only declared parameters through `setParam` | I/T |

## 4. Functional technical requirements

### 4.1 Engine and camera
| ID | Requirement | Verification |
|---|---|---|
| W-FT-1 | Camera state is `(place, target, distance, yaw, pitch)` with float64 values; zoom is logarithmic (constant factor per wheel notch at every level) | T |
| W-FT-2 | Place hand-over uses `enterAt`/`exitAt` hysteresis; zooming back and forth across a boundary by ±1 % never toggles the current place | T |
| W-FT-3 | Converting the camera into a child place and back returns the same world position within 1e-9 relative error | T |
| W-FT-4 | Rendering uses per-layer near/far planes and depth clears; no z-fighting visible at any level of the default tour | M/visual test |
| W-FT-5 | No visible vertex jitter when the camera is at any place's `exitAt` distance or closest zoom | M/visual test |
| W-FT-6 | `fly-to` reaches any site from any place in ≤ 4 s (≤ 0.3 s jump with reduced motion) | T (e2e) |
| W-FT-7 | WebGL context loss is recovered without reloading and without resetting any simulation | T (e2e, `WEBGL_lose_context`) |
| W-FT-8 | Ray–plane, ray–sphere, ray–AABB and ray–instanced-sphere intersection functions agree with reference values to 1e-9 | T |

### 4.2 Sites and tools
| ID | Requirement | Verification |
|---|---|---|
| W-FT-20 | Sites are created lazily when their place first enters the render set; start-up creates only the initial place's sites | T |
| W-FT-21 | Exactly one site is **Active** at a time; panels always reflect the active site's simulation | T |
| W-FT-22 | Tiers Active/Ambient/Frozen/Unloaded follow System Design §5.1; an unloaded touched site restores identically from its serialised blob | T |
| W-FT-23 | For a surface site, `hit(ray)` maps to module coordinates within 0.5 texel of the 2D `view.toWorld` for the same point | T |
| W-FT-24 | Each of the six tools on a surface site produces the same contract calls (method and arguments within tolerance) as the 2D app does for the same module point | T (world contract test) |
| W-FT-25 | Energy-brush radius and force-drag vectors are converted to module units using the hit scale; a 40 px brush covers the same module area as in 2D at equal on-screen size (± 10 %) | T |
| W-FT-26 | Selection, brush and force gizmos are drawn at `locate3D` in 3D and follow moving entities | M |
| W-FT-27 | Stale selections clear when `locate` returns null (as 2D FT-14) | T |
| W-FT-28 | Native 3D views exist for Gravity and Global Climate (P0); Atoms, Weather and Ecosystem (P1) | M/T |
| W-FT-29 | "Open in 2D" opens the 2D app with the site's current serialised state | T (e2e) |

### 4.3 Scheduler
| ID | Requirement | Verification |
|---|---|---|
| W-FT-40 | The active site steps every frame with clamped `dt` (≤ 50 ms) × speed, as in the 2D app | T |
| W-FT-41 | Ambient sites step only within the remaining per-frame budget (default 10 ms), round-robin, with catch-up capped at 4 × frame dt | T (fake clock) |
| W-FT-42 | The budget adapts down when frame time stays above 20 ms for 1 s and recovers gradually | T (fake clock) |
| W-FT-43 | A throwing `step` or `render` freezes only that site and is logged once | T |

### 4.4 Couplings
| ID | Requirement | Verification |
|---|---|---|
| W-FT-60 | Couplings are off by default; with none enabled, every site's state after N steps equals the 2D module's state for the same seed and inputs | T |
| W-FT-61 | The coupling graph is validated as acyclic; enabling a coupling that creates a cycle is refused | T |
| W-FT-62 | Couplings tick once per world second with exponential smoothing; values written are clamped to the target parameter's declared range | T |
| W-FT-63 | A parameter driven by a coupling shows its source and is read-only in the panel until the coupling is turned off | M/T (e2e) |
| W-FT-64 | Coupled source sites are kept at least Ambient | T |

### 4.5 Persistence, routes, education
| ID | Requirement | Verification |
|---|---|---|
| W-FT-80 | World save format `simulations-world3d` v1 contains camera, active site, enabled couplings and the 2D save blob of each touched site | T |
| W-FT-81 | Loading a world file validates the format, version, place and site ids, and each site blob with the existing 2D validation | T |
| W-FT-82 | Save → load reproduces every touched site such that subsequent evolution is identical (as 2D MQ-6) | T |
| W-FT-83 | A 2D save file loaded into the world opens the matching site with that state | T |
| W-FT-84 | Routes `#world/<place…>/<site>?<params>&view=…&lock=…` parse and format losslessly; unknown segments fall back to the nearest valid place with a notice | T |
| W-FT-85 | Undo/redo keeps ≥ 40 steps per site; switching sites switches history | T (e2e) |
| W-FT-86 | Lessons run in the world unchanged (`LessonRunner` against the active site); a lesson may specify a site to fly to | T |

## 5. Scientific model requirements (3D additions)

The 2D SM-1…SM-36 and RR-5 continue to hold for every module. Optional 3D physics modes
add these:

| ID | Module | Requirement | Verification |
|---|---|---|---|
| W-SM-1 | Gravity (3D mode) | A circular orbit inclined 30° at 1 AU around 1 M☉ closes in 1.00 yr (± 0.01 AU) and keeps its inclination within 0.1° | T |
| W-SM-2 | Gravity (3D mode) | Relative energy drift < 1e-6 over one orbit; angular momentum vector conserved to 1e-8 | T |
| W-SM-3 | Gravity (3D mode) | Barnes–Hut octree mean force error ≤ 3 % at θ = 0.6 versus direct sum | T |
| W-SM-4 | Gravity | With the 3D mode off, every existing scenario evolves bit-identically to before the change | T |
| W-SM-5 | Atoms (3D mode) | Thermostat reaches target T within ± 15 %; bonds never exceed valence; 3D FCC argon crystal stays ordered below its melting temperature | T |
| W-SM-6 | Climate globe | The globe texture's band boundaries map to latitudes within 0.5°; the terminator matches the declination for the model month | T |
| W-SM-7 | Couplings | Stars → Climate: halving solar luminosity drives the coupled climate to a snowball state; restoring it keeps the snowball (hysteresis, as SM-26) | T |
| W-SM-8 | Couplings | Weather → Ecosystem: higher accumulated precipitation raises ecosystem `growth` monotonically within its range | T |

## 6. Performance requirements

Reference machine: mid-range laptop (4-core CPU, integrated GPU), Chromium, Medium quality, 1920 × 1080.

| ID | Requirement | Verification |
|---|---|---|
| W-PR-1 | First world frame ≤ 3 s after page load on a local server (Deep Space only) | B |
| W-PR-2 | ≥ 55 fps median while flying the scripted tour with no heavy site active | B |
| W-PR-3 | ≥ 30 fps with the Weather site active and its siblings ambient | B |
| W-PR-4 | Simulation work per frame ≤ the scheduler budget (10 ms default) excluding the active site's own step | B |
| W-PR-5 | CPU render time ≤ 3 ms per frame; ≤ 300 draw calls in any default view | B |
| W-PR-6 | GPU memory ≤ 256 MB on Medium; texture uploads ≤ 1 × 1024² + ambient at ≤ 10 Hz | B |
| W-PR-7 | Memory stays bounded over a 30-minute tour loop (heap growth < 10 %) | B |
| W-PR-8 | Place hand-over causes no frame > 50 ms (lazy loading split across frames) | B |
| W-PR-9 | 3D Gravity supports ≥ 2 000 bodies (Barnes–Hut) and 3D galaxies ≥ 10 000 test particles at ≥ 30 fps | B |

## 7. Reliability and fallbacks

| ID | Requirement | Verification |
|---|---|---|
| W-RR-1 | Without WebGL2 the world route shows the Atlas list, and every entry opens its site in the 2D app | T (e2e, WebGL disabled) |
| W-RR-2 | Sustained < 20 fps for 5 s offers a lower quality preset, then the 2D app | M |
| W-RR-3 | All numeric values crossing frames, couplings and routes are checked finite; non-finite values are rejected | T |
| W-RR-4 | A soak test runs the tour with all couplings for 10 simulated minutes per site with all fields finite and a successful save/load | T |

## 8. Usability and accessibility

| ID | Requirement | Verification |
|---|---|---|
| W-UA-1 | Every place and site is reachable by keyboard through the Atlas (search, arrow keys, Enter) | T (e2e) |
| W-UA-2 | Camera keys: arrows/WASD orbit, `+`/`-` zoom, `Backspace` up one place, `H` home, `T` tour, `F` focus active site; existing 2D shortcuts unchanged | M |
| W-UA-3 | `prefers-reduced-motion` and an in-app toggle replace flights with jumps and disable idle drift | T |
| W-UA-4 | Breadcrumb and scale bar are text, update within 100 ms of a hand-over, and are announced through an ARIA live region | M |
| W-UA-5 | Markers have text labels; colour is never the only cue | I |
| W-UA-6 | Touch: one-finger tool or orbit, pinch zoom, two-finger pan; tap a marker to fly | M |
| W-UA-7 | No content flashes more than 3 times per second | I |

## 9. Security and privacy

| ID | Requirement | Verification |
|---|---|---|
| W-SP-1 | No runtime network calls, cookies or personal data (as 2D SP-1) | I |
| W-SP-2 | Shader sources are static; no shader text built from user or file data | I |
| W-SP-3 | World files and routes are validated before use (W-FT-81, W-FT-84); file size capped at 20 MB | T |
| W-SP-4 | No `eval`, `new Function` or `innerHTML` with dynamic data | I |

## 10. Maintainability and quality

| ID | Requirement | Verification |
|---|---|---|
| W-MQ-1 | `npm test` includes all world unit, contract and layout tests | T |
| W-MQ-2 | `npm run test:e2e` includes world e2e tests on Chromium with SwiftShader | T |
| W-MQ-3 | A [Module Guide](../MODULE_GUIDE.md) section explains adding a layout entry and an optional `render3D` | I |
| W-MQ-4 | The 2D e2e suite keeps passing after `SitePanels` is extracted | T |
| W-MQ-5 | The engine has JSDoc on every exported function and class | I |

## 11. Traceability (World PRD → TRD)

| PRD | TRD |
|---|---|
| WG1 One world, WFR-1, WFR-20…22, WFR-26 | W-AR-1, W-AR-5, W-AR-6, W-FT-20…22 |
| WG2 Powers of ten, WFR-2…9 | W-AR-7, W-FT-1…6, W-UA-2…4 |
| WG3 Same tools, WFR-21, WFR-27, WFR-28, WFR-60…65 | W-AR-4, W-FT-23…29, W-FT-80…86 |
| WG4 Real 3D, WFR-23…25 | W-FT-28, W-SM-1…6, W-PR-9 |
| WG5 Connected science, WFR-40…44 | W-AR-8, W-FT-60…64, W-SM-7, W-SM-8 |
| WG6 Still instant, NFRs | W-TC-1…8, W-PR-1…8, W-RR-1…2 |
| WG7 Extensible | W-AR-2, W-AR-3, W-AR-5, W-MQ-3 |

## 12. Implementation status

As of 2026-10-19. **Met**: implemented and verified as stated · **Partial**: implemented in
part, or verified only in part · **Open**: not built yet. Test files are in `tests/`.

### Technology, architecture
| ID | Status | Evidence / notes |
|---|---|---|
| W-TC-1 | Met | No dependencies, no build; shaders are static strings in `engine/materials.js` |
| W-TC-2 | Met | `world-sites.test.js` fails if code outside `src/world/engine/` calls WebGL |
| W-TC-3 | Met | Sites draw only through `Renderer` (`mesh`, `spheres`, `points`, `lines`, `texture`) |
| W-TC-4 | Met | World, places, sites, scheduler, couplings, routes and saves all run in the Node tests |
| W-TC-5 | Partial | Tested in Chromium (CI); Firefox and Safari not yet checked by hand |
| W-TC-6 | Met | 134 KB; `world-sites.test.js` enforces ≤ 250 KB |
| W-TC-7 | Met | All code written for the project |
| W-TC-8 | Met | Every world file is pre-cached by `sw.js` (`simulations-v3`); a test keeps the list complete |
| W-AR-1 | Met | Modules unchanged (only `ICE_T` exported from `climate.js`); `world-sites.test.js` shows every site evolves exactly like its 2D module |
| W-AR-2 | Met | Sites call the contract; native views read public state |
| W-AR-3 | Met | `world-sites.test.js` |
| W-AR-4 | Met | Changed by review R1: the panels stay in `App`; `App.bindSim(sim, { history, driven })` binds the active site's simulation, and both apps share `src/ui/tools.js` |
| W-AR-5 | Met | `src/world/layout.js` |
| W-AR-6 | Met | `world-sites.test.js` |
| W-AR-7 | Met | `world-places.test.js` checks every default scene |
| W-AR-8 | Met | `world-runtime.test.js` |

### Engine, sites, scheduler, couplings, persistence
| ID | Status | Evidence / notes |
|---|---|---|
| W-FT-1 | Met | Camera state is (place, target, offset) per review R4; yaw/pitch are derived for links. `world-places.test.js` |
| W-FT-2, W-FT-3 | Met | `world-places.test.js` |
| W-FT-4, W-FT-5 | Met | Per-layer near/far planes and depth clears; checked in the User Guide screenshots |
| W-FT-6 | Met | `world-places.test.js` (≤ duration), `world.e2e.mjs` (Atlas flight < 4 s; reduced motion jumps) |
| W-FT-7 | Met | `world.e2e.mjs` (`WEBGL_lose_context`) |
| W-FT-8 | Met | `world-math.test.js` |
| W-FT-20…25 | Met | `world-sites.test.js` (lazy creation, tiers, unloading, half-texel hits, tool-call parity, brush size) |
| W-FT-26 | Met | Selection ring (native) or highlight in the texture (surfaces); brush ring and force arrow on the site |
| W-FT-27 | Met | `world-sites.test.js`; the panels clear a stale selection as in 2D |
| W-FT-28 | Partial | Gravity and Global Climate native (P0); Atoms, Weather and Ecosystem still surfaces (P1) |
| W-FT-29 | Met | `world.e2e.mjs` |
| W-FT-40…43 | Met | `world-runtime.test.js` (fake clock) |
| W-FT-60…64 | Met | `world-runtime.test.js`, `world-sites.test.js`, `world.e2e.mjs` (read-only driven parameter) |
| W-FT-80…83 | Met | `world-runtime.test.js`, `world.e2e.mjs` |
| W-FT-84 | Met | `world-runtime.test.js`, `world.e2e.mjs` (share link reopens site, parameters and camera) |
| W-FT-85 | Met | `world.e2e.mjs` (per-site history) |
| W-FT-86 | Met | `world.e2e.mjs` (a lesson flies to its site; `lesson.site` may name one) |

### Science, performance, reliability, usability, security, quality
| ID | Status | Evidence / notes |
|---|---|---|
| W-SM-1…5 | Open | The optional 3D physics modes are not built yet |
| W-SM-6 | Met | `world-runtime.test.js` (bands within 0.5°, light at the model's declination) |
| W-SM-7 | Open | Needs a "Sun" star in Stars. Earth's orbit → Climate is built and tested instead |
| W-SM-8 | Met | `world-runtime.test.js` |
| W-PR-1 | Partial | First world frame < 0.3 s in headless Chromium; not yet measured on the reference laptop |
| W-PR-2…9 | Open | Only software-GPU (SwiftShader) numbers so far, see the [Plan](PLAN.md#measured-so-far) |
| W-RR-1 | Met | `world.e2e.mjs` (WebGL2 disabled → Atlas → 2D) |
| W-RR-2 | Partial | Implemented (offer after 5 s below 20 fps); not yet checked by hand |
| W-RR-3 | Met | `world-runtime.test.js` (routes, couplings), save validation |
| W-RR-4 | Partial | Soak test runs every site with all couplings and saves/loads; the 10-simulated-minute version is open |
| W-UA-1 | Met | `world.e2e.mjs` |
| W-UA-2 | Met | Arrows/WASD orbit, `+`/`-` zoom, Backspace up, H home, T tour, F focus, Esc leaves the tour |
| W-UA-3 | Met | `world.e2e.mjs` |
| W-UA-4, W-UA-5, W-UA-7 | Met | Text breadcrumb in an ARIA live region; text markers; no flashing content |
| W-UA-6 | Partial | Pinch zoom, two-finger pan and tapping markers implemented; not yet tried on a tablet |
| W-SP-1, W-SP-2, W-SP-4 | Met | Inspection |
| W-SP-3 | Met | Validation tests; files over 20 MB are refused |
| W-MQ-1…4 | Met | `npm test` and `npm run test:e2e` include the world; [Module Guide](../MODULE_GUIDE.md#placing-a-module-in-the-3d-world) |
| W-MQ-5 | Partial | JSDoc on the engine's main classes and functions, not yet on every export |
