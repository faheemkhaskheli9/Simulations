# Roadmap

| | |
|---|---|
| **Last updated** | 2026-10-17 |
| **Related** | [PRD §10](PRD.md#10-release-plan) · [System Design §12](SYSTEM_DESIGN.md#12-evolution-and-extension-points) |

The long-term goal is to cover real-world phenomena at **every scale**. The product grows
along two tracks: the **platform** (persistence, performance, 3D, education) and the
**catalogue** (new simulation modules). Priorities: **P1** next, **P2** later, **P3** exploratory.

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
- [ ] Neighbour lists for molecular dynamics
- [ ] Optional 3D view (space, molecules) with the same tools
- [ ] Weather: 2D horizontal (map) mode, ice microphysics, lightning

### M5 Education (P2)
- [x] Guided lessons that script scenarios, prompts and checkpoints (`src/lessons/`; 10 lessons, at least one per module)
- [x] Challenges with win and lose conditions (7 so far: ring vaccination, Snowball Earth, transmuting carbon, launching a planet into a circular orbit, balancing an ecosystem, making a thunderstorm, building molecules)
- [x] Lessons for the remaining modules (gravity, stars, atoms, weather) and a "put a planet in a stable orbit" challenge
- [x] More challenges (balance an ecosystem, make a thunderstorm, build molecules from a new *Molecule kit* scenario)
- [x] Teacher mode: share links with `lock=<keys>` or `lock=all` freeze parameters for learners
- [ ] Presenter view
- [x] Per-module "Model & assumptions" panel with references

### M6 Multi-scale worlds (P3)
- [ ] Composite simulations that couple modules (weather drives the ecosystem; stellar
      flux drives planetary climate)
- [ ] Zoom-through-scales navigation (galaxy → star → planet → biosphere → cell → atom)

## Known limitations to address

| Area | Limitation | Planned fix |
|---|---|---|
| Ecosystem | Predators tend to overshoot; immigration keeps species alive | More realistic functional responses, refuges, sexual reproduction |
| Weather | ~20–25 ms/frame; collocated grid; warm-rain only | Worker/WebGPU, staggered grid, ice phase |
| Atoms | 2D, no angle potentials beyond 1–3 repulsion; simplified bond chemistry | Angle terms, reaction energetics |
| Stars | Analytic tracks, no binaries | Binary evolution, mass transfer |
| Gravity | Barnes–Hut is monopole-only (~2 % force error at θ = 0.6) and runs on the main thread; mergers are still O(N²) | Quadrupole terms, Web Worker |
| Climate | 1D zonal model; small polar ice caps are unstable, so Arctic ice vanishes abruptly near 420 ppm | Land/ocean split, sea-ice thermodynamics |
| Atomic Structure | Screened hydrogen-like energies are only accurate for hydrogen and hydrogen-like ions; stability rule misses some odd-odd nuclei (e.g. Co-60) | Tabulated levels and nuclide data |
| Cell Biology | Each particle stands for many molecules; time is accelerated; no cell division yet | Mitosis, enzyme kinetics |
| Mechanics | Circles only; no friction model beyond rolling damping | Rigid polygons, Coulomb friction |
| Platform | No analytics | Privacy-friendly, opt-in usage metrics |
