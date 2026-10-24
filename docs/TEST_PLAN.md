# Test Plan

| | |
|---|---|
| **Last updated** | 2026-10-19 |
| **Related** | [TRD](TRD.md) (requirement IDs referenced below) · [System Design §10](SYSTEM_DESIGN.md#10-testing-strategy) |

## 1. Objectives

1. Show that each simulation reproduces known physical, chemical or biological behaviour (TRD §5).
2. Guarantee that every registered module honours the interaction contract (TRD §4.2).
3. Catch numerical instability (NaN, explosions) before release.
4. Check that the UI works end-to-end in a real browser with no console errors.

## 2. Test levels

| Level | Tooling | Location | When |
|---|---|---|---|
| Unit / model | `node:test` + `node:assert` | `tests/*.test.js` | Every change (`npm test`) |
| Contract | `node:test`, loops over the registry | `tests/contract.test.js` | Every change |
| Behaviour / scenario | `node:test`, runs scenarios for N steps | per-module test files | Every change |
| Serialization | `node:test`, loops over the registry | `tests/serialize.test.js` | Every change |
| Browser end-to-end | Playwright (Chromium) via `node:test` | `tests/e2e/app.e2e.mjs`, `tests/e2e/world.e2e.mjs` | CI on every push / PR (`npm run test:e2e`) |
| 3D world (unit) | `node:test`, no DOM or GL | `tests/world-*.test.js` | Every change |
| Manual exploratory | Checklist below | — | Before release |
| Performance | Frame-time readout (`ms/frame` in the top bar) and headless timing | — | Before release |

Run everything with:

```bash
npm test                     # unit, behaviour, contract, serialization
npm install --no-save playwright && npx playwright install chromium
npm run test:e2e             # real-browser tests
```

## 3. Automated test inventory

| File | Test | Verifies |
|---|---|---|
| `gravity.test.js` | circular 1 AU orbit takes one year and conserves energy | SM-1, SM-2 |
| | orbital elements of a circular orbit | SM-1 |
| | collisions merge bodies conserving mass and momentum | SM-3 |
| | bodies added near a star start on a bound orbit | SM-4 |
| | every scenario loads and steps (finite values) | FT-1, RR-1 |
| `gravity3d.test.js` | 3D mode: a 30° orbit closes in one year and keeps its tilt; energy and angular-momentum vector conserved; octree force error ≤ 3 % at θ = 0.6; every 2D scenario bit-identical to golden fingerprints; inclined-orbits and 3D galaxy scenarios; save/load and flattening | W-SM-1…4 |
| `atoms3d.test.js` | Atoms 3D mode: thermostat within ±15 % in 3D; valence never exceeded, H₂ and H₂O form, atoms use the depth; FCC argon crystal ordered at 40 K and molten at 200 K; neighbour-list forces equal a direct sum; save/load keeps z, vz; flattening and lifting; tetrahedral CH₄, front-most pick; every 2D scenario bit-identical to golden fingerprints | W-SM-5 |
| `stellar.test.js` | present-day Sun is a G-type main-sequence star | SM-5 |
| | lifetimes shrink steeply with mass | SM-5 |
| | end states depend on initial mass | SM-6 |
| | Salpeter sampling favours low-mass stars | SM-7 |
| | a massive star goes supernova in the simulation | SM-6 |
| | nebulae form stars | FR-31 |
| `atoms.test.js` | thermostat drives gas to target temperature | SM-8 |
| | hydrogen and oxygen form molecules; valence respected | SM-9 |
| | formulae use Hill notation | SM-9 |
| | heating raises kinetic energy; removing an atom breaks its bonds | FT-13 |
| | transmuting an atom trims bonds to the new valence | FT-12 |
| `weather.test.js` | saturation mixing ratio vs temperature | SM-10 |
| | warm moist bubble rises and makes cloud; fields finite | SM-11, SM-12 |
| | editing a cell sets temperature and humidity | FT-12 |
| | mountains can be raised and eroded | FT-13 |
| `life.test.js` | offspring inherit mutated genes | SM-13 |
| | herbivores starve without plants | SM-14 |
| | gene edits are clamped | SM-13, FT-12 |
| | epidemic spreads, and vaccination slows it | SM-15 |
| `atom.test.js` | hydrogen Lyman-α, H-α, H-β and 13.6 eV ionisation | SM-16 |
| | aufbau configurations | SM-17 |
| | binding energy per nucleon peaks near iron | SM-18 |
| | stability and decay modes; C-14 decays to N-14 | SM-19 |
| | photons emitted only at hydrogen lines; ionisation and recombination; no ionisation by visible light | SM-20 |
| `mechanics.test.js` | elastic collision swaps velocities | SM-21 |
| | free fall, pendulum period, spring period | SM-22 |
| | rods stay rigid; cradle keeps its energy; removing a ball removes its links | SM-23, FT-13 |
| `climate.test.js` | insolation mean and polar night; CO₂ forcing | SM-24 |
| | pre-industrial climate; climate sensitivity | SM-25 |
| | snowball hysteresis | SM-26 |
| | painting ice cools; heating a band warms it | FT-13 |
| `cell.test.js` | resting membrane potential | SM-27 |
| | swelling, bursting, shrinking; stable isotonic volume | SM-28 |
| | selective permeability; ATP production; gradient rundown without ATP | SM-29 |
| `contract.test.js` | per module: meta, params, every spawn kind, pick, describe, setProperty, locate, move, impulse (with and without target), energy ±, removeAt, stats, chart keys, every scenario | AR-1, FT-10…15 |

| `serialize.test.js` | typed arrays round-trip through base64 | MQ-6 |
| | per module: save → JSON → load reproduces the world **and its future** | MQ-6, FT-25 |
| | per module: rejects foreign or newer save files | SP-4 |
| `persistence.test.js` | share links round-trip; link parameters typed, clamped and filtered | FT-24 |
| | diffParams, CSV escaping | FT-27 |
| | undo/redo stack order and limit | FT-26 |
| `regressions.test.js` | one test per audit finding: Moon stays in orbit; uranium series ends at Pb-206 with a sane charge; no foreign immigrants; cells keep volume, voltage and ATP; K⁺ held by the voltage; endemic waves return; ecosystem persists 10 years without immigration (3 seeds); Arctic ice today and gradual retreat; cluster energy drift < 3 % | [Improvement plan](IMPROVEMENT_PLAN.md) |
| `soak.test.js` | **every scenario of every simulation** runs for several seconds: statistics and the whole saved state stay finite, the clock advances, and the world round-trips through save/load | RR-1, MQ-6 |
| `chart.test.js`, `home.test.js` | chart layout fills the width and each series' range; the welcome screen opens only on a plain first visit | C1, C2 |
| `reference.test.js` | `docs/REFERENCE.md` is identical to what the code generates (docs can't go stale) | MQ |
| `lessons.test.js` | every lesson references a real module, scenario and parameters, and is **played through to completion** with a scripted solution | M5 |
| | challenges fail when their rule is broken (and when the learner does nothing: outbreak spreads, predators starve; the molecule kit never assembles itself); manual steps wait for Next | M5 |
| `world-math.test.js` | vectors, bases, matrices, yaw/pitch; ray–plane/sphere/box/nearest-sphere against reference values; meshes; colours | W-FT-8 |
| `world-places.test.js` | child ↔ parent conversion to 1e-9; log zoom; hand-over hysteresis at ±1 % for every place; eye fixed across hand-over; fly-to galaxy → atom on time and precise; camera save/restore; no GPU coordinate above 10⁶ in any default scene | W-FT-1…3, W-FT-6, W-AR-7 |
| `world-sites.test.js` | layout names real modules and scenarios, every module has a site, unique ids, modules never import world code; lazy creation, tiers, unloading with state kept; rays hit module points within half a texel; **the six tools make the same calls as in 2D** at the same on-screen scale; a site with no couplings evolves exactly like its 2D module; offline cache list, 250 KB budget, GL only in the engine | W-AR-1, W-AR-3, W-AR-6, W-FT-20…27, W-FT-60, W-TC-2, W-TC-6, W-TC-8 |
| `world-terrain.test.js` | Ecosystem terrain: fertile ground stands higher; rebuilt only when fertility changes; mesh covers the grid; plant colours as in 2D; animals stand on it | W-FT-28, WFR-24 |
| `world-volume.test.js` | Weather volume: module points map as on the flat slice; ground strip follows the terrain and is rebuilt only when it changes; cloud puffs stay inside their cell and keep their places; rain streaks fall, snow in freezing air; the sky darkens at night and greys under cloud | W-FT-28, WFR-24 |
| `world-molecules.test.js` | Atoms box: module x, y (down) and z map into the place; rays hit the middle plane at the aimed point; atoms are balls at their depth, smaller when bonded; one six-sided stick per bond, on a cylinder round it; 2D atoms on the middle plane; tools act through the contract | W-FT-28, WFR-24 |
| `world-runtime.test.js` | scheduler (fake clock: active step, budget, round-robin, catch-up cap, adaptation, error isolation); couplings (off by default, loops refused, smoothing, clamping, non-finite values ignored, coupled sites kept ambient, Earth's orbit cools the climate, rain → growth, seasons → weather); routes; saves (contents, round-trip with identical future, rejection of bad files with nothing changed, 2D saves open at their site); globe bands within 0.5° and lit at the declination; soak with every coupling | W-FT-40…43, W-FT-60…64, W-FT-80…84, W-SM-6, W-SM-8, W-RR-3, W-RR-4 |
| `e2e/app.e2e.mjs` | per module: every tool in the real UI with no console errors | FT-13, RR-* |
| `e2e/world.e2e.mjs` | the world opens and draws; every tool on all 12 sites with no console errors; Atlas by keyboard (< 4 s flight); reduced motion; scrolling from deep space to one atom; per-site undo; world save → load; share link reproduces site, parameters and camera; driven parameter read-only; Open in 2D carries state; WebGL context loss recovered; lessons fly to their site; the tour; no-WebGL2 fallback | W-FT-6, W-FT-7, W-FT-29, W-FT-63, W-FT-80…86, W-UA-1, W-UA-3, W-RR-1 |
| | welcome screen: one card and live thumbnail per simulation, opens a simulation, can be turned off | FT-28 |
| | undo/redo an added object; save → load a file; shared link parameters; CSV download | FT-24…27 |
| | Model & assumptions dialog; lesson catalogue → lesson advancing on real clicks; `#learn/<id>` links; completion stored | M5 |

Current result: **258 unit tests and 45 browser tests, all passing.**

## 4. Browser smoke test

For each of gravity/solar, gravity/galaxy, stars/nursery, atoms/water, weather/storm,
ecosystem/balanced and epidemic/town:

1. Load `#<sim>/<scenario>` and let it run for 3–6 s.
2. Use Add, Energy, Force, Remove and Inspect with a drag across the canvas.
3. Click the centre to select; screenshot.
4. **Pass:** no `pageerror` or console error; the frame time is shown; the canvas is not blank.

Last run: all seven passed with no console errors.

## 5. Manual exploratory checklist (release)

- [ ] Every simulation and scenario loads from the picker and from a deep link
- [ ] Play / pause / step / speed / reset / fit view work; keyboard shortcuts work
- [ ] Each tool behaves as described in the [User Guide](USER_GUIDE.md) in each module
- [ ] Inspector edits take effect immediately; a focused field is not overwritten
- [ ] Removing the selected object clears the inspector
- [ ] Parameter sliders update values; scenario load resyncs sliders
- [ ] Chart and stats update while running and freeze while paused
- [ ] Narrow (< 900 px) layout is usable; touch tools work on a tablet
- [ ] Extreme inputs (max speed, huge brush, max energy) don't produce NaN or freeze the app

## 6. Performance targets

See TRD PR-1…PR-6. Measure with the top-bar `ms/frame` readout (step time) and
browser dev-tools performance profiles on the reference machine.

## 7. Adding tests for a new module

1. Registering the module enrols it in the contract test automatically.
2. Add at least one behaviour test against a known analytic or empirical result.
3. Add a "every scenario loads and stays finite" test if the module has numerical state.

## 8. Planned improvements

- Long-run soak tests (10⁴ steps) checking bounded memory and finite state.
- Visual regression snapshots for each scenario and each place of the 3D world.
- A scripted-tour performance probe for the 3D world on the reference laptop (W-PR-1…8).
