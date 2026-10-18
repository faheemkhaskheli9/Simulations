# Product Requirements Document (PRD) — Simulations

| | |
|---|---|
| **Product** | Simulations: an interactive sandbox of the natural world |
| **Status** | Draft v1.0 (MVP built: six simulation modules) |
| **Owner** | Faheem Khaskheli |
| **Last updated** | 2026-10-16 |
| **Related** | [TRD](TRD.md) · [System Design](SYSTEM_DESIGN.md) · [Test Plan](TEST_PLAN.md) · [Roadmap](ROADMAP.md) · [User Guide](USER_GUIDE.md) |

---

## 1. Vision

A single place where anyone can **simulate real-world objects and phenomena at every
scale**, from atoms and molecules through living things, weather and planets to stars
and galaxies, and **experiment** with them: set up scenarios, interact with objects,
apply forces and energy, add or remove things, and change the parameters of nature
to see what happens.

> "What happens if I double gravity? If I heat this cloud? If predators get faster?
> If 60 % of people are vaccinated?" Every question should be one click away from
> an answer you can watch.

## 2. Problem statement

- Learners meet science as static equations and pictures. The *dynamics*, meaning how
  systems evolve, interact and respond to change, are what build intuition, and they
  are hard to see.
- Existing simulators are fragmented. Each covers one topic (an orbit applet, an
  epidemic model, a weather toy) with different controls, and most do not let you
  *modify* the world while it runs.
- Research-grade tools (GROMACS, WRF, N-body codes) are accurate but inaccessible to
  non-specialists.

**Opportunity:** a unified, approachable, browser-based sandbox with **one interaction
model across all domains**, built to grow into an ever larger catalogue of phenomena.

## 3. Goals and non-goals

### Goals
1. **G1 Breadth:** cover physics, chemistry, earth science, astronomy and biology in
   one product, with one consistent set of tools.
2. **G2 Interactivity:** every simulation supports inspecting, editing, moving, adding,
   removing, applying force and adding or removing energy, live.
3. **G3 Experimentation:** tunable global parameters, preset scenarios, live statistics
   and charts so users can test hypotheses.
4. **G4 Plausibility:** qualitatively correct behaviour grounded in real models and
   units, validated by automated tests.
5. **G5 Accessibility:** runs instantly in a browser with no install, account or build.
6. **G6 Extensibility:** adding a new phenomenon means writing one module against a
   documented contract.

### Non-goals (for now)
- Quantitative research-grade accuracy or validated forecasting.
- 3D rendering (2D first; 3D is on the roadmap).
- Multiplayer or real-time collaboration.
- User accounts, cloud storage and monetisation.

## 4. Target users and personas

| Persona | Description | Primary needs |
|---|---|---|
| **Curious learner** (high-school / university student) | Learning science, wants intuition | Presets that "just work", clear explanations, safe experimentation |
| **Educator** | Teaches a class, demos concepts live | Reliable scenarios, deep links to a scenario, readable stats and charts |
| **Hobbyist / science enthusiast** | Explores for fun | Freedom to break things: huge forces, weird parameters, combining objects |
| **Developer / researcher-tinkerer** | Wants to add or modify models | Clean module contract, tests, documented architecture |

## 5. User stories

| ID | As a… | I want to… | So that… |
|---|---|---|---|
| US-1 | learner | pick a simulation and a preset scenario | I can see a phenomenon immediately |
| US-2 | learner | pause, play, step and change speed | I can follow fast or slow processes |
| US-3 | any user | click an object and see its properties | I understand what it is and its state |
| US-4 | any user | edit an object's properties (mass, element, genes, health state…) | I can test "what if" on one object |
| US-5 | any user | add new objects (planets, atoms, mountains, animals…) | I can build my own scenario |
| US-6 | any user | remove objects | I can see the effect of their absence |
| US-7 | any user | drag objects to new positions | I can rearrange the system |
| US-8 | any user | apply a force or impulse by dragging | I can perturb the system |
| US-9 | any user | inject or remove energy in a region (heat, food, vaccine, accretion) | I can drive phase changes, storms, growth |
| US-10 | experimenter | change global parameters (G, temperature, mutation rate…) live | I can test hypotheses about laws of nature |
| US-11 | experimenter | watch live statistics and a time-series chart | I can measure outcomes |
| US-12 | educator | share a link that opens a specific simulation and scenario | students land on the right demo |
| US-13 | developer | add a new simulation module by implementing one interface | the product grows without UI work |

## 6. Functional requirements

Priority: **P0** must have (MVP) · **P1** should have · **P2** could have.

### 6.1 Platform and shell
| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-1 | Simulation picker grouped by category (Space, Matter, Earth, Life) | P0 | Done |
| FR-2 | Scenario picker per simulation; Reset reloads the current scenario | P0 | Done |
| FR-3 | Play / pause / single step / speed multiplier (⅛× to 8×) | P0 | Done |
| FR-4 | Pan (right-drag) and zoom (wheel) camera; "fit view" | P0 | Done |
| FR-5 | Deep links `#<simulation>/<scenario>` | P1 | Done |
| FR-6 | Keyboard shortcuts for tools and playback | P1 | Done |
| FR-7 | Responsive layout usable on tablets / narrow screens | P1 | Done (basic) |
| FR-8 | Save / load a full world state as a file; share a link with simulation, scenario and parameters | P1 | Done |
| FR-9 | Undo / redo of user interventions | P2 | Done |

### 6.2 Universal interaction tools (every simulation)
| ID | Tool | Requirement | Priority | Status |
|---|---|---|---|---|
| FR-10 | Inspect | Select an object; show its properties; edit numeric, text and enum properties; run object actions | P0 | Done |
| FR-11 | Move | Drag a selected object to a new position | P0 | Done |
| FR-12 | Add | Add an object of a chosen kind at the cursor | P0 | Done |
| FR-13 | Remove | Delete the object or region under the cursor (click or drag) | P0 | Done |
| FR-14 | Force | Drag to apply a directional impulse to an object or region, with an arrow preview | P0 | Done |
| FR-15 | Energy | Hold to add energy in a brush area; Shift or "Invert" removes it; brush size and strength adjustable | P0 | Done |

### 6.3 Experimentation
| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-20 | Per-simulation global parameters (sliders, incl. log scale; toggles; selects) editable live | P0 | Done |
| FR-21 | Live statistics panel | P0 | Done |
| FR-22 | Time-series chart of key statistics | P0 | Done |
| FR-23 | Export statistics as CSV | P1 | Done |
| FR-24 | Parameter sweeps / scripted experiments | P2 | Planned |

### 6.4 Simulation catalogue (MVP)
| ID | Module | Must demonstrate | Status |
|---|---|---|---|
| FR-30 | Gravity & Orbits | Kepler orbits, Solar System, moons, binaries, chaotic 3-body, galaxies, dark-matter halo, mergers | Done |
| FR-31 | Stellar Life Cycles | Star formation from nebulae, main sequence → giant → remnant by mass, supernovae, HR diagram | Done |
| FR-32 | Atoms & Molecules | Gas/liquid/solid behaviour, ionic crystals, covalent bonding by valence, temperature and pressure | Done |
| FR-33 | Weather & Atmosphere | Convection, cloud formation, rain/snow, day/night, sea breeze, orographic rain, storms | Done |
| FR-34 | Ecosystem & Evolution | Food chain, population cycles, heritable mutating genes, environmental pressure | Done |
| FR-35 | Epidemic Spread | SEIR dynamics, distancing, quarantine, vaccination, mortality, waning immunity | Done |
| FR-36 | Atomic Structure | Shells and configurations, emission spectra, ionisation, isotopes, radioactive decay | Done |
| FR-37 | Mechanics Lab | Collisions, pendulums, springs, ropes; energy and momentum readouts | Done |
| FR-38 | Global Climate | Seasons, CO₂ forcing, ice–albedo feedback and tipping points, surface painting | Done |
| FR-39 | Cell Biology | Diffusion, selective permeability, osmosis, respiration, ion pumps, membrane potential | Done |
| FR-40+ | Further modules (human body, chemistry, waves, EM, tectonics, cosmology…) | See [Roadmap](ROADMAP.md) | Planned |

## 7. Non-functional requirements (summary)

Detailed and measurable versions are in the [TRD](TRD.md).

- **Performance:** interactive frame rate (≥ 30 fps target, ≥ 60 fps for light modules) on a mid-range laptop.
- **Zero install:** static files only; any modern evergreen browser.
- **Reliability:** no simulation may crash the app; a failing step pauses the simulation instead.
- **Determinism:** scenarios are reproducible from a seed.
- **Quality:** automated tests for physics behaviour and for the interaction contract of every module.
- **Accessibility:** keyboard operable controls, readable contrast (dark theme), labelled inputs.

## 8. Success metrics

| Metric | Target (first public release) |
|---|---|
| Time from page load to first moving simulation | < 2 s |
| Share of sessions that use at least one interaction tool | > 60 % |
| Share of sessions that change at least one parameter | > 40 % |
| Average simulations explored per session | ≥ 2 |
| Crash-free sessions | > 99.5 % |
| New simulation module added by an outside contributor in < 1 day using the docs | yes |

*(Analytics are not implemented yet; see the Roadmap.)*

## 9. User experience principles

1. **Alive on arrival:** every simulation opens running a meaningful preset.
2. **Same tools everywhere:** learn the six tools once and use them in every domain.
3. **Show, then explain:** visuals first, numbers in the inspector, stats and chart.
4. **Safe to break:** extreme inputs are clamped or handled; Reset is always one click.
5. **Honest models:** state that models are simplified; use real units where possible.

## 10. Release plan

| Phase | Scope | Status |
|---|---|---|
| **M1 MVP** | Shell, universal tools, six modules, tests, docs | Complete |
| **M2 Persistence and sharing** | Save/load worlds, share links, CSV export, undo/redo, CI | Complete |
| **M3 Catalogue expansion** | Atomic structure, cell biology, climate, classical mechanics | P1 complete; P2 modules next |
| **M4 Scale and fidelity** | Web Workers, WebGL/WebGPU, Barnes–Hut, 3D views | Planned |
| **M5 Education** | Guided lessons, challenges, teacher mode | Planned |

## 11. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Scope is effectively "everything" | Never ships | Module contract plus a prioritised roadmap; ship modules incrementally |
| Simplified models mislead learners | Credibility | Document assumptions per module; test against known results (1-year orbit, Sun's properties…) |
| Heavy simulations are slow on low-end devices | Poor UX | Steps/frame parameters, Web Workers and GPU on the roadmap |
| Emergent models collapse (e.g. extinction) | Boring or confusing outcomes | Tuned defaults, immigration option, Reset |
| Inconsistent UX as modules multiply | Steep learning curve | Shared UI owns all tools; contract test enforces support |

## 12. Open questions

1. Should the long-term product move to 3D by default, or keep 2D as primary with 3D for space only? Proposed answer: a single 3D world as a second way in, with 2D kept; see the [World PRD](world/PRD.md).
2. Is a guided "lesson" layer in scope for v2, or should it be a separate product?
3. What licence and contribution model will apply to community modules?
4. ~~Is there a need for offline / installable (PWA) mode?~~ Resolved: the app ships a web manifest and a network-first service worker, so it installs and works offline.
