# Roadmap

| | |
|---|---|
| **Last updated** | 2026-10-16 |
| **Related** | [PRD §10](PRD.md#10-release-plan) · [System Design §12](SYSTEM_DESIGN.md#12-evolution-and-extension-points) |

The long-term goal is to cover real-world phenomena at **every scale**. The product grows
along two tracks: the **platform** (persistence, performance, 3D, education) and the
**catalogue** (new simulation modules). Priorities: **P1** next, **P2** later, **P3** exploratory.

## Milestones

### M1 MVP (done)
- [x] App shell, camera, six universal tools, parameter panel, inspector, stats, chart
- [x] Gravity & Orbits, Stellar Life Cycles, Atoms & Molecules, Weather & Atmosphere, Ecosystem & Evolution, Epidemic Spread
- [x] Node test suite + contract test; product and technical documentation

### M2 Persistence and sharing (P1)
- [ ] `serialize` / `deserialize` on the contract; save and load worlds as JSON files
- [ ] Share links that include the world state (compressed in the URL)
- [ ] Undo / redo of user interventions
- [ ] CSV export of chart data
- [ ] CI: run tests on every PR; deploy `main` to GitHub Pages
- [ ] Pinch-zoom and two-finger pan on touch devices

### M3 Catalogue expansion (P1–P2)

| Scale | Module | Key phenomena | Priority |
|---|---|---|---|
| Subatomic / atomic | **Atomic Structure** | Bohr and orbital models, electron transitions and emission spectra, ionisation | P1 |
| Nuclear | **Nuclear Physics** | Radioactive decay chains, half-life, fission chain reactions, fusion | P2 |
| Molecular | **Chemical Reactions** | Reaction kinetics, equilibrium, catalysts, acids and bases | P2 |
| Cellular | **Cell Biology** | Diffusion and osmosis, membrane transport, enzyme kinetics, mitosis | P1 |
| Cellular | **Bacterial Colonies** | Growth on nutrients, antibiotic resistance, quorum sensing | P2 |
| Organism | **Human Body** | Heart and circulation, neurons and action potentials, immune response | P2 |
| Organism | **Plant Growth** | Photosynthesis, phototropism, L-system morphology | P3 |
| Classical | **Mechanics Lab** | Rigid bodies, springs, pendulums, collisions, friction | P1 |
| Classical | **Waves & Optics** | Interference, diffraction, refraction, lenses | P2 |
| Classical | **Electromagnetism** | Fields of charges and currents, circuits, induction | P2 |
| Classical | **Fluid Dynamics** | Flow around obstacles, turbulence, buoyancy | P2 |
| Planetary | **Global Climate** | Energy balance, greenhouse gases, ice-albedo feedback, seasons | P1 |
| Planetary | **Plate Tectonics** | Convection, plates, volcanoes, earthquakes | P3 |
| Planetary | **Oceans & Tides** | Tidal forces, currents, the water cycle, erosion | P3 |
| Stellar | **Stellar Interior** | Hydrostatic equilibrium, fusion chains, energy transport | P3 |
| Cosmic | **Cosmology** | Expansion, dark energy, large-scale structure formation | P3 |

### M4 Scale and fidelity (P2)
- [ ] Run physics in Web Workers (typed-array state, transferable buffers)
- [ ] WebGPU compute for grids (weather, fluids) and particles (atoms, galaxies)
- [ ] Barnes–Hut tree for 10⁵-body gravity; neighbour lists for molecular dynamics
- [ ] Optional 3D view (space, molecules) with the same tools
- [ ] Weather: 2D horizontal (map) mode, ice microphysics, lightning

### M5 Education (P2)
- [ ] Guided lessons that script scenarios, prompts and checkpoints
- [ ] Challenges ("put a planet in a stable orbit", "stop the epidemic with < 30 % vaccinated")
- [ ] Teacher mode: lock parameters, presenter view
- [ ] Per-module "Model & assumptions" panel with references

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
| Gravity | O(N²) for massive bodies | Barnes–Hut |
| Platform | No persistence, analytics, CI | M2 |
