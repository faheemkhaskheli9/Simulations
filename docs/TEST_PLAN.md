# Test Plan

| | |
|---|---|
| **Last updated** | 2026-10-16 |
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
| Browser end-to-end | Playwright (Chromium) via `node:test` | `tests/e2e/app.e2e.mjs` | CI on every push / PR (`npm run test:e2e`) |
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
| `e2e/app.e2e.mjs` | per module: every tool in the real UI with no console errors | FT-13, RR-* |
| | undo/redo an added object; save → load a file; shared link parameters; CSV download | FT-24…27 |

Current result: **86 unit tests and 14 browser tests, all passing.**

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
- Visual regression snapshots for each scenario.
