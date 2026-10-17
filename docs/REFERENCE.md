# Simulation Reference

> Generated from the source code by `npm run docs:reference`. Do not edit by hand:
> `tests/reference.test.js` fails if this file is out of date.

For how to use the app, see the [User Guide](USER_GUIDE.md).

## Contents

- [Gravity & Orbits](#gravity) (Space)
- [Stellar Life Cycles](#stars) (Space)
- [Atomic Structure](#atom) (Matter)
- [Atoms & Molecules](#atoms) (Matter)
- [Mechanics Lab](#mechanics) (Classical)
- [Weather & Atmosphere](#weather) (Earth)
- [Global Climate](#climate) (Earth)
- [Cell Biology](#cell) (Life)
- [Ecosystem & Evolution](#ecosystem) (Life)
- [Epidemic Spread](#epidemic) (Life)
- [Lessons and challenges](#lessons-and-challenges)

<a id="gravity"></a>

## Gravity & Orbits

**Category:** Space · **Link:** `#gravity` · **Time unit:** yr

N-body gravity: planets, moons, stars, black holes and galaxies. Fling bodies, add new ones in orbit, change masses, or turn on a dark-matter halo to flatten galactic rotation curves.

**Model.** Newtonian N-body gravity in astronomical units (AU, years, solar masses), so G = 4π² and Earth orbits in one year.

### Scenarios

| Scenario | Link |
|---|---|
| Solar System | `#gravity/solar` |
| Earth & Moon | `#gravity/earthMoon` |
| Binary star + circumbinary planet | `#gravity/binary` |
| Three-body figure-eight | `#gravity/figure8` |
| Spiral galaxy (test stars) | `#gravity/galaxy` |
| Galaxy collision | `#gravity/galaxyCollision` |
| Star cluster (2000 self-gravitating stars) | `#gravity/cluster` |
| Lone star (launch your own planets) | `#gravity/lonelyStar` |
| Empty space | `#gravity/empty` |

### Parameters

| Parameter | Link key | Range | Default |
|---|---|---|---|
| Time speed (yr/s) | `yearsPerSecond` | 0.001 – 100 (log scale) | 0.5 |
| Gravity strength (× G) | `gScale` | 0 – 5 | 1 |
| Softening (AU) | `softening` | 0 – 1 | 0.001 |
| Max integration step (yr) | `maxStep` | 0.0001 – 0.05 (log scale) | 0.002 |
| Tree opening angle θ (0 = exact) | `theta` | 0 – 1.2 | 0.6 |
| Dark-matter halo speed (AU/yr) | `haloV` | 0 – 80 | 0 |
| Merge on collision | `merge` | on / off | on |
| Collision radius × | `collisionScale` | 1 – 500 (log scale) | 60 |
| New bodies start in orbit | `orbitOnAdd` | on / off | on |
| Show trails | `trails` | on / off | on |

### Things you can add

- Star (1 M☉)
- Red dwarf (0.2 M☉)
- Rocky planet (1 M⊕)
- Gas giant (1 M♃)
- Moon
- Black hole (10 M☉)
- Asteroid (test particle)
- Dust cloud (40 particles)

### Tool meanings

| Tool | In this simulation |
|---|---|
| Energy | **Heat (speed up)** (hold Shift or tick Invert: **Cool (slow down)**) |
| Add | Adds the kind chosen in *Object to add* (list above) |
| Inspect | Shows and edits the clicked object's properties |

### Statistics

| Statistic | Charted |
|---|---|
| Bodies | ✓ |
| Massive bodies |  |
| Total energy (M☉AU²/yr²) | ✓ |

### Equations

1. a_i = Σ_j G m_j (r_j − r_i) / (|r_j − r_i|² + ε²)^{3/2}
2. Kick–drift–kick leapfrog: v += a·dt/2; x += v·dt; v += a·dt/2

### Simplifications

- Point masses in a 2D plane; no relativity, tides or radiation pressure.
- Plummer softening ε avoids infinite forces at close approach.
- Colliding bodies merge, conserving mass and momentum (inelastic).
- Test particles (galaxy stars, asteroids) feel gravity but exert none.
- An optional flat-rotation-curve halo stands in for dark matter.
- Direct O(N²) sum for small systems; above 64 massive bodies a Barnes–Hut quadtree (opening angle θ) gives O(N log N) forces.

### Further reading

- Hockney & Eastwood, Computer Simulation Using Particles (1988), leapfrog integration
- Chenciner & Montgomery (2000), the figure-eight three-body orbit
- Toomre & Toomre (1972), galactic bridges and tails
- Barnes & Hut (1986), A hierarchical O(N log N) force-calculation algorithm, Nature 324

<a id="stars"></a>

## Stellar Life Cycles

**Category:** Space · **Link:** `#stars` · **Time unit:** Myr

Birth, life and death of stars. Nebulae form clusters, stars evolve into giants, white dwarfs, neutron stars and black holes. Change a star’s mass or age, feed it matter, or compress a nebula to trigger star formation. The HR diagram updates live.

**Model.** A neighbourhood of nebulae and stars. Each star follows an analytic evolutionary track set by its initial mass.

### Scenarios

| Scenario | Link |
|---|---|
| Stellar nursery | `#stars/nursery` |
| Young open cluster | `#stars/cluster` |
| Mass sequence (0.5 → 40 M☉) | `#stars/masses` |
| Old globular cluster | `#stars/old` |
| Empty region | `#stars/empty` |

### Parameters

| Parameter | Link key | Range | Default |
|---|---|---|---|
| Time speed (Myr/s) | `myrPerSecond` | 0.01 – 2000 (log scale) | 20 |
| Star-formation efficiency | `formation` | 0 – 5 | 1 |
| Supernova-triggered formation | `shockTrigger` | on / off | on |
| Show HR diagram | `showHR` | on / off | on |
| Label bright stars | `showLabels` | on / off | off |

### Things you can add

- Sun-like star (1 M☉)
- Red dwarf (0.3 M☉)
- Blue giant (15 M☉)
- Very massive star (40 M☉)
- Random (Salpeter IMF)
- Molecular cloud (nebula)

### Tool meanings

| Tool | In this simulation |
|---|---|
| Energy | **Feed matter / compress gas** (hold Shift or tick Invert: **Strip mass**) |
| Add | Adds the kind chosen in *Object to add* (list above) |
| Inspect | Shows and edits the clicked object's properties |

### Statistics

| Statistic | Charted |
|---|---|
| Stars | ✓ |
| Main sequence |  |
| Giants |  |
| Remnants (WD/NS/BH) | ✓ |
| Supernovae |  |
| Nebular gas (M☉) |  |

### Equations

1. Main-sequence lifetime t_MS ≈ 10⁴ Myr · (M/M☉)^−2.5
2. L = 4πR²σT⁴ (sets the star’s place on the H–R diagram)
3. Salpeter IMF: dN/dM ∝ M^−2.35 (0.1–60 M☉)

### Simplifications

- Tracks are fitted to be qualitatively right, not precise; there is no stellar-structure solve.
- Phases: main sequence → giant → white dwarf (< 8 M☉), neutron star (< 25 M☉) or black hole.
- White dwarfs cool along a Mestel law, L ∝ t^−7/5.
- Supernova shock waves compress nearby gas, which can trigger star formation.
- Single stars only: no binaries or mass transfer.

### Further reading

- Salpeter (1955), the initial mass function
- Mestel (1952), white-dwarf cooling
- Kippenhahn, Weigert & Weiss, Stellar Structure and Evolution

<a id="atom"></a>

## Atomic Structure

**Category:** Matter · **Link:** `#atom` · **Time unit:** s

Build atoms from protons, neutrons and electrons. Shine light to excite electrons and watch them emit the element’s spectral lines, strip electrons to make ions, or add neutrons until the nucleus becomes radioactive and decays.

**Model.** One atom: a nucleus of protons and neutrons plus electrons in shells, with photon absorption and emission and radioactive decay.

### Scenarios

| Scenario | Link |
|---|---|
| Hydrogen (Balmer lines) | `#atom/hydrogen` |
| Helium | `#atom/helium` |
| Carbon-12 | `#atom/carbon12` |
| Carbon-14 (radioactive) | `#atom/carbon14` |
| Neon | `#atom/neon` |
| Iron-56 (most tightly bound) | `#atom/iron` |
| Uranium-238 (alpha decay chain) | `#atom/uranium` |

### Parameters

| Parameter | Link key | Range | Default |
|---|---|---|---|
| Emission rate (1/s) | `emissionRate` | 0.1 – 20 (log scale) | 2 |
| Photon energy: max level reached (8 = ionising UV) | `photonLevel` | 2 – 8 | 6 |
| Ions recapture electrons | `recombination` | on / off | on |
| Radioactive decay | `radioactivity` | on / off | on |
| Decay speed (×) | `decaySpeed` | 0.01 – 100 (log scale) | 1 |
| Electron animation speed | `orbitSpeed` | 0 – 3 | 1 |

### Things you can add

- Electron
- Proton (changes element)
- Neutron (changes isotope)
- Photon (excite an electron)

### Tool meanings

| Tool | In this simulation |
|---|---|
| Energy | **Shine light (excite)** (hold Shift or tick Invert: **Stimulate emission**) |
| Add | Adds the kind chosen in *Object to add* (list above) |
| Inspect | Shows and edits the clicked object's properties |

### Statistics

| Statistic | Charted |
|---|---|
| Element |  |
| Isotope |  |
| Charge (e) | ✓ |
| Ground configuration |  |
| Outer-electron binding (eV) |  |
| Nuclear binding / nucleon (MeV) |  |
| Nucleus |  |
| Photons emitted | ✓ |
| Last emission line (nm) |  |
| Decay history |  |

### Equations

1. E_n ≈ −13.6 eV · Z_eff² / n² (screened hydrogen-like levels)
2. λ = hc / ΔE ≈ 1240 nm·eV / ΔE
3. B(A,Z) = a_V·A − a_S·A^{2/3} − a_C·Z(Z−1)/A^{1/3} − a_A·(A−2Z)²/A ± δ (Weizsäcker)

### Simplifications

- Electrons fill subshells in Madelung (aufbau) order; exceptions such as Cr and Cu are ignored.
- Energy levels are exact only for hydrogen and hydrogen-like ions; other elements are approximate.
- Stability and decay mode (α, β⁻, β⁺) come from the semi-empirical mass formula and the valley of stability, so a few odd–odd nuclei (e.g. Co-60) are misclassified.
- Decay is random with a tunable speed-up; real half-lives are not tabulated.
- Orbits are drawn as rings for clarity; real electrons are probability clouds.

### Further reading

- Bohr (1913), hydrogen spectrum
- von Weizsäcker (1935), semi-empirical mass formula
- NIST Atomic Spectra Database (for comparing real lines)

<a id="atoms"></a>

## Atoms & Molecules

**Category:** Matter · **Link:** `#atoms` · **Time unit:** τ

Molecular dynamics with Lennard-Jones forces, ionic charges and covalent bonding. Heat or cool regions to melt, boil or freeze matter, mix elements to form molecules, or transmute atoms in the inspector.

**Model.** 2D molecular dynamics in reduced units (σ ≈ 3 Å, one temperature unit ≈ 120 K) with van der Waals, ionic and simple covalent interactions.

### Scenarios

| Scenario | Link |
|---|---|
| Argon gas | `#atoms/gas` |
| Argon condensing (cold) | `#atoms/condense` |
| Salt crystal (NaCl) — heat to dissolve/melt | `#atoms/salt` |
| Hydrogen + oxygen → water | `#atoms/water` |
| Carbon + hydrogen soup | `#atoms/organic` |
| Noble-gas mixture with gravity | `#atoms/mixture` |
| Molecule kit (build by hand) | `#atoms/kit` |

### Parameters

| Parameter | Link key | Range | Default |
|---|---|---|---|
| Steps per frame | `speed` | 1 – 40 | 10 |
| Time step (τ) | `dt` | 0.0005 – 0.006 | 0.003 |
| Thermostat | `thermostat` | on / off | on |
| Target temperature (K) | `targetT` | 5 – 2000 | 300 |
| Gravity | `gravity` | 0 – 20 | 0 |
| Chemical bonding | `bonding` | on / off | on |
| Bond strength (break stretch) | `bondEnergy` | 1.1 – 2.5 | 1.5 |
| Electrostatics | `coulomb` | on / off | on |
| Draw bonds | `showBonds` | on / off | on |

### Things you can add

- Hydrogen (H)
- Carbon (C)
- Nitrogen (N)
- Oxygen (O)
- Neon (Ne)
- Argon (Ar)
- Sodium ion (Na)
- Chloride ion (Cl)
- Water molecule (H₂O)
- Methane (CH₄)

### Tool meanings

| Tool | In this simulation |
|---|---|
| Energy | **Heat** (hold Shift or tick Invert: **Cool**) |
| Add | Adds the kind chosen in *Object to add* (list above) |
| Inspect | Shows and edits the clicked object's properties |

### Statistics

| Statistic | Charted |
|---|---|
| Atoms |  |
| Temperature (K) | ✓ |
| Pressure (reduced) | ✓ |
| Molecules |  |

### Equations

1. Lennard-Jones: V(r) = 4ε[(σ/r)¹² − (σ/r)⁶], cut off at 2.5σ
2. Screened, cut-off Coulomb force between ions
3. Velocity-Verlet integration; a Berendsen (velocity-rescaling) thermostat pulls T toward the target
4. Pressure from the momentum atoms transfer to the walls

### Simplifications

- Two dimensions, so densities and phase-change temperatures differ from 3D.
- Covalent bonds are springs that form when atoms with free valence meet gently and break when overstretched; no quantum chemistry or bond-angle terms beyond a soft repulsion between neighbours.
- Reaction energetics are simplified; bonding does not release realistic heat.
- Water, methane and other molecules are built from these rules, not from force fields.

### Further reading

- Allen & Tildesley, Computer Simulation of Liquids
- Frenkel & Smit, Understanding Molecular Simulation

<a id="mechanics"></a>

## Mechanics Lab

**Category:** Classical · **Link:** `#mechanics` · **Time unit:** s

Newtonian mechanics: balls, pendulums, springs, ropes and collisions under gravity. Build contraptions, change masses and bounciness, fling things, and watch momentum and energy being exchanged.

**Model.** Rigid circular balls, fixed anchors, rigid rods and Hookean springs under uniform gravity in SI units.

### Scenarios

| Scenario | Link |
|---|---|
| Newton's cradle | `#mechanics/cradle` |
| Double pendulum (chaos) | `#mechanics/doublePendulum` |
| Projectiles at different angles | `#mechanics/projectiles` |
| Mass–spring oscillators | `#mechanics/springs` |
| Rope bridge | `#mechanics/bridge` |
| Billiards break (no gravity) | `#mechanics/billiards` |
| Empty lab | `#mechanics/empty` |

### Parameters

| Parameter | Link key | Range | Default |
|---|---|---|---|
| Gravity (m/s²) | `gravity` | 0 – 30 | 9.81 |
| Air drag (1/s) | `drag` | 0 – 2 | 0 |
| Substeps per frame | `substeps` | 4 – 80 | 24 |
| Time scale | `slowmo` | 0.05 – 2 (log scale) | 1 |
| Walls and floor | `walls` | on / off | on |
| Show velocity vectors | `vectors` | on / off | off |
| Show trails | `trails` | on / off | on |

### Things you can add

- Ball (1 kg)
- Heavy ball (10 kg)
- Bouncy ball
- Fixed anchor
- Pendulum (anchor + rod + ball)
- Ball on a spring to nearest
- Ball on a rod to nearest
- Rope (chain of 10 links)

### Tool meanings

| Tool | In this simulation |
|---|---|
| Energy | **Shake (add kinetic energy)** (hold Shift or tick Invert: **Brake (remove energy)**) |
| Add | Adds the kind chosen in *Object to add* (list above) |
| Inspect | Shows and edits the clicked object's properties |

### Statistics

| Statistic | Charted |
|---|---|
| Bodies |  |
| Kinetic energy (J) | ✓ |
| Potential energy (J) | ✓ |
| Total mechanical energy (J) |  |
| Total momentum (kg·m/s) |  |

### Equations

1. Spring force: F = k(d − L₀) + c·v_rel (Hooke’s law with damping)
2. Rods: position-based constraint |x_a − x_b| = L, solved iteratively each substep
3. Collisions: impulse j = −(1+e)·v_n / (1/m_a + 1/m_b), conserving momentum
4. Linear drag: F = −b·v

### Simplifications

- Bodies are circles; there are no rigid polygons yet.
- No sliding friction model beyond rolling damping.
- Many substeps per frame keep rods stiff and energy drift small; total energy is conserved only when drag is zero and collisions are perfectly elastic.

### Further reading

- Müller et al. (2007), Position Based Dynamics
- Halliday, Resnick & Walker, Fundamentals of Physics

<a id="weather"></a>

## Weather & Atmosphere

**Category:** Earth · **Link:** `#weather` · **Time unit:** s

A vertical slice of the atmosphere: sunlight heats the ground, warm air rises, water vapour condenses into clouds and rain. Build mountains and lakes, add moisture, push the wind or heat a bubble of air to trigger a storm.

**Model.** A 32 km × 16 km vertical slice of the lower atmosphere (128 × 64 cells of 250 m) solved as a stable fluid with heat and moisture.

### Scenarios

| Scenario | Link |
|---|---|
| Sunny day over land (cumulus) | `#weather/sunny` |
| Coastline sea breeze | `#weather/seaBreeze` |
| Orographic rain over a mountain | `#weather/mountain` |
| Thunderstorm (humid, unstable) | `#weather/storm` |
| Clear night | `#weather/night` |

### Parameters

| Parameter | Link key | Range | Default |
|---|---|---|---|
| Speed (steps/frame) | `stepsPerFrame` | 1 – 30 | 5 |
| Time step (s) | `dt` | 1 – 8 | 5 |
| Solar heating | `sun` | 0 – 3 | 1 |
| Day/night cycle | `cycle` | on / off | on |
| Background wind (m/s) | `wind` | -20 – 20 | 0 |
| Lapse stability (K/km) | `stability` | 0 – 8 | 3 |
| Soil moisture | `soil` | 0 – 1 | 0.2 |
| Display | `view` | Clouds & rain, Temperature anomaly, Relative humidity, Wind speed | Clouds & rain |
| Wind arrows | `arrows` | on / off | off |

### Things you can add

- Moist air
- Cloud droplets
- Raise mountain
- Lake / sea surface
- Dry land surface

### Tool meanings

| Tool | In this simulation |
|---|---|
| Energy | **Heat air** (hold Shift or tick Invert: **Cool air**) |
| Add | Adds the kind chosen in *Object to add* (list above) |
| Inspect | Shows and edits the clicked object's properties |

### Statistics

| Statistic | Charted |
|---|---|
| Time of day |  |
| Cloud cover (%) | ✓ |
| Strongest updraft (m/s) | ✓ |
| Rain rate (mm/h) |  |
| Total rain (mm) |  |
| Mean surface air (°C) |  |

### Equations

1. Semi-Lagrangian advection + pressure projection (incompressible Boussinesq flow)
2. Buoyancy: b = g·(θ′/θ₀ + 0.61 q_v − q_c − q_r)
3. Condensation when q_v > q_sat(T, p), releasing latent heat L_v/c_p · Δq
4. Warm rain: cloud water autoconverts and accretes into falling rain

### Simplifications

- 2D slice: no Coriolis force, fronts or large-scale weather systems.
- Warm-rain microphysics only: no ice, hail or lightning; “snow” is rain falling into sub-freezing air.
- Collocated grid with numerical diffusion; turbulence is not resolved.
- Surface heating follows a prescribed day/night cycle; radiation is not computed.

### Further reading

- Stam (1999), Stable Fluids
- Kessler (1969), warm-rain parameterisation
- Houze, Cloud Dynamics

<a id="climate"></a>

## Global Climate

**Category:** Earth · **Link:** `#climate` · **Time unit:** yr

An energy-balance model of Earth: sunlight, greenhouse gases, ice–albedo feedback and heat transport set the temperature of every latitude. Change CO₂, the Sun or the tilt of the axis, paint deserts, forests or ice, and look for tipping points such as Snowball Earth.

**Model.** A latitude-resolved diffusive energy-balance model of Earth’s zonal-mean surface temperature.

### Scenarios

| Scenario | Link |
|---|---|
| Pre-industrial Earth (280 ppm) | `#climate/preindustrial` |
| Today (420 ppm) | `#climate/today` |
| Doubled CO₂ (560 ppm) | `#climate/doubled` |
| Ice age (180 ppm) | `#climate/iceAge` |
| Snowball Earth (faint young Sun) | `#climate/snowball` |
| Hothouse (1500 ppm) | `#climate/hothouse` |
| No axial tilt | `#climate/noTilt` |

### Parameters

| Parameter | Link key | Range | Default |
|---|---|---|---|
| Time speed (yr/s) | `yearsPerSecond` | 0.05 – 50 (log scale) | 2 |
| CO₂ (ppm) | `co2` | 100 – 5000 (log scale) | 280 |
| Solar constant (W/m²) | `solar` | 1100 – 1600 | 1361 |
| Axial tilt (°) | `obliquity` | 0 – 90 | 23.44 |
| Heat transport (W/m²/K) | `transport` | 0 – 2 | 0.43 |
| Ice albedo | `iceAlbedo` | 0.3 – 0.8 | 0.62 |
| Ice-free albedo (clouds etc.) | `baseAlbedo` | 0.15 – 0.5 | 0.3 |
| Seasonal cycle | `seasons` | on / off | on |

### Things you can add

- Paint ocean
- Paint forest
- Paint grassland
- Paint desert
- Paint ice sheet

### Tool meanings

| Tool | In this simulation |
|---|---|
| Energy | **Heat region** (hold Shift or tick Invert: **Cool region**) |
| Add | Adds the kind chosen in *Object to add* (list above) |
| Inspect | Shows and edits the clicked object's properties |

### Statistics

| Statistic | Charted |
|---|---|
| Month |  |
| Global mean (°C) | ✓ |
| Equator (°C) |  |
| North pole (°C) |  |
| South pole (°C) |  |
| Ice edge latitude (°) | ✓ |
| CO₂ forcing (W/m²) |  |

### Equations

1. C ∂T/∂t = S(x,t)·(1 − α(T)) − (A + B·T) + ∂/∂x[D(1 − x²) ∂T/∂x],  x = sin(latitude)
2. A = 202.2 W/m² − ΔF_CO₂,  B = 2.09 W/m²/K
3. ΔF_CO₂ = 5.35 · ln(CO₂ / 280 ppm) W/m²
4. Albedo α jumps to the ice value where the surface is cold enough to freeze

### Simplifications

- One dimension (latitude): no land/ocean split, continents, clouds or ocean currents.
- Climate sensitivity is ~3 K per CO₂ doubling, set by B and the ice feedback.
- Ice responds instantly to temperature; small polar caps are unstable, so Arctic ice can vanish abruptly.
- Seasons come from daily-mean insolation with axial tilt; the orbit is circular.

### Further reading

- Budyko (1969); Sellers (1969), energy-balance models
- North (1975; 1981), diffusive EBM
- Myhre et al. (1998), CO₂ radiative forcing

<a id="cell"></a>

## Cell Biology

**Category:** Life · **Link:** `#cell` · **Time unit:** s

Inside a living cell: diffusion through the membrane, osmosis that swells or shrinks the cell, ion channels and ATP-powered pumps that create the membrane potential, and mitochondria that burn glucose with oxygen. Add molecules and proteins, poison the cell or feed it.

**Model.** A single animal cell. Each particle stands for many molecules, and time is accelerated.

### Scenarios

| Scenario | Link |
|---|---|
| Cellular respiration | `#cell/respiration` |
| Diffusion: gases vs. glucose | `#cell/diffusion` |
| Resting membrane potential | `#cell/neuron` |
| Osmosis: cell in fresh water (bursts) | `#cell/hypotonic` |
| Osmosis: cell in syrup (shrinks) | `#cell/hypertonic` |

### Parameters

| Parameter | Link key | Range | Default |
|---|---|---|---|
| Time speed (×) | `speed` | 0.1 – 10 (log scale) | 1 |
| Temperature (°C) | `temperature` | 0 – 60 | 37 |
| Water permeability (aquaporins) | `waterPerm` | 0 – 5 | 1 |
| Pump rate (cycles/s per pump) | `pumpRate` | 0 – 10 | 3 |
| Basal ATP use (ATP/s) | `metabolism` | 0 – 50 | 8 |
| Membrane strength (burst at × radius) | `strength` | 1.1 – 2 | 1.4 |
| Show membrane proteins | `showProteins` | on / off | on |

### Things you can add

- Oxygen (O₂) ×10
- Carbon dioxide (CO₂) ×10
- Glucose ×10
- Sodium ion (Na⁺) ×10
- Potassium ion (K⁺) ×10
- Urea (permeant) ×10
- Sucrose (impermeant) ×10
- Lactate ×10
- Na⁺/K⁺ pump (uses ATP) (on membrane)
- K⁺ leak channel (on membrane)
- Na⁺ channel (on membrane)
- Glucose transporter (GLUT) (on membrane)
- Mitochondrion (inside cell)

### Tool meanings

| Tool | In this simulation |
|---|---|
| Energy | **Feed ATP** (hold Shift or tick Invert: **Poison (drain ATP)**) |
| Add | Adds the kind chosen in *Object to add* (list above) |
| Inspect | Shows and edits the clicked object's properties |

### Statistics

| Statistic | Charted |
|---|---|
| Cell status |  |
| Volume vs. normal (%) |  |
| ATP | ✓ |
| Membrane potential (mV) | ✓ |
| Glucose inside / outside |  |
| O₂ inside / outside |  |
| CO₂ inside / outside |  |
| K⁺ inside / outside |  |
| Na⁺ inside / outside |  |

### Equations

1. Brownian motion: Δx ~ N(0, 2D·Δt)
2. GHK potential: V_m = (RT/F)·ln[(P_K[K⁺]_o + P_Na[Na⁺]_o) / (P_K[K⁺]_i + P_Na[Na⁺]_i)], P_K : P_Na = 1 : 0.04
3. Osmosis: water flux ∝ Σ σ·(c_in − c_out); volume follows
4. Respiration: glucose + O₂ → ATP + CO₂;  Na⁺/K⁺ pump: 1 ATP moves 3 Na⁺ out and 2 K⁺ in

### Simplifications

- Gases cross the lipid bilayer; ions and sugars need channels or transporters.
- The cell bursts when its radius exceeds the membrane-strength limit; there is no cytoskeleton or cell wall.
- No cell division, gene expression or enzyme kinetics yet.
- Stoichiometry is simplified (real respiration yields ~30 ATP per glucose).

### Further reading

- Goldman (1943); Hodgkin & Katz (1949), membrane potential
- Alberts et al., Molecular Biology of the Cell
- Skou (1957), the Na⁺/K⁺-ATPase

<a id="ecosystem"></a>

## Ecosystem & Evolution

**Category:** Life · **Link:** `#ecosystem` · **Time unit:** days

Predators, prey and plants with heritable genes. Watch population cycles and natural selection; change climate, food supply or mutation rate, edit an animal’s genes, feed regions or cause droughts.

**Model.** Agent-based food web of grass, herbivores and carnivores with heritable, mutating genes.

### Scenarios

| Scenario | Link |
|---|---|
| Balanced predator–prey | `#ecosystem/balanced` |
| Prey only (grazing pressure) | `#ecosystem/prey` |
| Fertile islands in a desert | `#ecosystem/islands` |
| Fast predator invasion | `#ecosystem/invasion` |

### Parameters

| Parameter | Link key | Range | Default |
|---|---|---|---|
| Steps per frame | `speed` | 1 – 20 | 3 |
| Plant growth rate | `growth` | 0 – 0.1 | 0.02 |
| Seasonal variation | `seasons` | 0 – 1 | 0.4 |
| Temperature (°C) | `temperature` | -10 – 45 | 20 |
| Mutation rate | `mutation` | 0 – 0.5 | 0.08 |
| Energy per unit of plants | `plantEnergy` | 5 – 60 | 20 |
| Predator energy gain | `huntEfficiency` | 0.1 – 1 | 0.5 |
| Immigration from outside | `immigration` | on / off | on |
| Population cap | `maxPop` | 100 – 3000 | 1500 |
| Colour animals by | `colorBy` | Species, Speed gene, Size gene, Energy | Species |

### Things you can add

- Herbivore (rabbit)
- Carnivore (fox)
- Herd of 10 herbivores
- Pack of 4 carnivores
- Plant patch

### Tool meanings

| Tool | In this simulation |
|---|---|
| Energy | **Feed / fertilise** (hold Shift or tick Invert: **Drought / starve**) |
| Add | Adds the kind chosen in *Object to add* (list above) |
| Inspect | Shows and edits the clicked object's properties |

### Statistics

| Statistic | Charted |
|---|---|
| Herbivores | ✓ |
| Carnivores | ✓ |
| Plant cover (%) |  |
| Avg herbivore speed |  |
| Avg carnivore speed |  |
| Avg herbivore size |  |
| Avg carnivore size |  |
| Latest generation |  |
| Season |  |

### Equations

1. Metabolic cost per day ∝ 0.5·size^0.75 + 0.12·speed² + sensing + effort while chasing or fleeing
2. Reproduction when energy exceeds a threshold ∝ size / fertility; offspring genes = parent genes × (1 + mutation noise)
3. Grass regrows logistically on a grid, modulated by season and temperature

### Simplifications

- Asexual reproduction; no mating, social behaviour or disease.
- Predators see prey within their sense radius and catch it with a set efficiency; predator overshoot is common.
- Optional immigration re-seeds extinct species so runs do not end early.
- Selection is emergent: no fitness function is coded.

### Further reading

- Lotka (1925); Volterra (1926), predator–prey dynamics
- Kleiber (1932), metabolic scaling
- Grimm & Railsback, Individual-based Modeling and Ecology

<a id="epidemic"></a>

## Epidemic Spread

**Category:** Life · **Link:** `#epidemic` · **Time unit:** days

Disease transmission between individuals (SEIR model). Tune infectiousness, incubation, mortality, distancing and quarantine; vaccinate regions or seed new outbreaks and watch the epidemic curve.

**Model.** Agent-based SEIR epidemic: people travel between home and shared hubs and infect others within a contact radius.

### Scenarios

| Scenario | Link |
|---|---|
| Town outbreak | `#epidemic/town` |
| With social distancing | `#epidemic/distanced` |
| 60% vaccinated | `#epidemic/vaccinated` |
| Waning immunity (endemic) | `#epidemic/endemic` |

### Parameters

| Parameter | Link key | Range | Default |
|---|---|---|---|
| Steps per frame | `speed` | 1 – 20 | 3 |
| Contact radius | `radius` | 2 – 20 | 7 |
| Transmission chance / contact-day | `beta` | 0 – 2 | 0.6 |
| Incubation (days) | `incubation` | 0 – 14 | 4 |
| Infectious period (days) | `infectious` | 1 – 30 | 8 |
| Fatality rate | `mortality` | 0 – 0.5 | 0.02 |
| Immunity lasts (days, 0 = forever) | `waning` | 0 – 365 | 0 |
| Social distancing | `distancing` | 0 – 1 | 0 |
| Quarantine symptomatic | `quarantine` | on / off | off |
| Mobility | `mobility` | 0 – 3 | 1 |

### Things you can add

- Healthy person
- Infected person
- Crowd of 30

### Tool meanings

| Tool | In this simulation |
|---|---|
| Energy | **Vaccinate** (hold Shift or tick Invert: **Infect**) |
| Add | Adds the kind chosen in *Object to add* (list above) |
| Inspect | Shows and edits the clicked object's properties |

### Statistics

| Statistic | Charted |
|---|---|
| Susceptible | ✓ |
| Exposed (incubating) |  |
| Infectious | ✓ |
| Recovered (immune) | ✓ |
| Vaccinated |  |
| Deceased | ✓ |

### Equations

1. P(infection per contact-day) = β·dt for each infectious neighbour within the contact radius
2. S → E → I → R (or D with the fatality rate); R → S after the waning period
3. Basic reproduction number R₀ ≈ β · contacts per day · infectious period

### Simplifications

- Fixed incubation and infectious periods (no distributions).
- Everyone is equally susceptible; there are no age groups or households.
- Distancing makes a share of people stay home; quarantine isolates symptomatic cases after one day.
- Vaccination gives full, permanent protection.

### Further reading

- Kermack & McKendrick (1927), compartmental epidemic models
- Anderson & May, Infectious Diseases of Humans

<a id="lessons-and-challenges"></a>

## Lessons and challenges

| Title | Type | Simulation | Steps | Link | Summary |
|---|---|---|---|---|---|
| The greenhouse effect | lesson | Global Climate | 4 | `#learn/greenhouse` | Double CO₂ and watch the planet warm until it balances again. |
| Flattening the curve | lesson | Epidemic Spread | 4 | `#learn/flatten-curve` | Let an outbreak take off, then bend the curve with distancing and quarantine. |
| Light from atoms | lesson | Atomic Structure | 3 | `#learn/hydrogen-light` | Excite hydrogen with photons, ionise it, then turn it into helium. |
| Where does the energy go? | lesson | Mechanics Lab | 3 | `#learn/energy-conservation` | Kinetic and potential energy trade places; drag turns them into heat. |
| Osmosis | lesson | Cell Biology | 4 | `#learn/osmosis` | See a cell swell and burst in fresh water, then shrink in syrup. |
| Who keeps whom in check? | lesson | Ecosystem & Evolution | 4 | `#learn/predator-prey` | Remove the predators and watch the prey population explode. |
| Why planets orbit | lesson | Gravity & Orbits | 4 | `#learn/kepler` | Push Earth off its circle and see Kepler’s laws at work. |
| The lives of stars | lesson | Stellar Life Cycles | 4 | `#learn/star-lives` | Heavy stars live fast and die in supernovae; light ones fade slowly. |
| Solid, liquid, gas | lesson | Atoms & Molecules | 4 | `#learn/states-of-matter` | Cool argon until it condenses, then heat it back into a gas. |
| How clouds form | lesson | Weather & Atmosphere | 4 | `#learn/clouds` | Sunshine warms the ground, air rises and cools, and water vapour condenses. |
| Stop the outbreak | challenge | Epidemic Spread | 1 | `#learn/ring-vaccination` | End the epidemic while vaccinating under 30 % of people and keeping infections under 25 %. |
| Escape Snowball Earth | challenge | Global Climate | 2 | `#learn/escape-snowball` | Thaw a frozen planet, then find out whether it refreezes. |
| Transmute carbon | challenge | Atomic Structure | 1 | `#learn/carbon-dating` | Turn carbon-14 into nitrogen without touching its protons. |
| Launch a planet | challenge | Gravity & Orbits | 1 | `#learn/stable-orbit` | Put a new planet into a nearly circular orbit around a lone star. |
| Balance an ecosystem | challenge | Ecosystem & Evolution | 1 | `#learn/balance-ecosystem` | Keep both foxes and rabbits alive for three years with no animals arriving from outside. |
| Make a thunderstorm | challenge | Weather & Atmosphere | 1 | `#learn/make-thunderstorm` | Turn a fair-weather sky into a downpour before the Sun sets. |
| Build molecules | challenge | Atoms & Molecules | 1 | `#learn/build-molecules` | Assemble water, ammonia and methane from loose atoms by hand. |
