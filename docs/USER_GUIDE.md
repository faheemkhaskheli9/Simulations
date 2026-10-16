# User Guide

## Getting started

1. Run `npm start` and open <http://localhost:8080> (or open the deployed site).
2. Choose a simulation from the **first dropdown** and a scenario from the **second**.
3. The simulation starts running. Use the tools on the left to interact with it.

| Area | What's there |
|---|---|
| Top bar | Simulation and scenario pickers, Play/Pause, Step, Reset, Fit view, speed multiplier, simulated clock, frame time |
| Left panel | Description, **Tools**, tool options, **Parameters** |
| Centre | The world (zoom with the wheel, pan with right-drag) and a live chart underneath |
| Right panel | **Inspector** for the selected object, and **Statistics** |

## The six tools

| Tool | Key | How to use it |
|---|---|---|
| **Inspect** | `1` | Click an object. The Inspector shows its properties; edit any field and press Enter. Buttons run actions (e.g. *Break all bonds*, *Clone this animal*). Dragging empty space pans the view. |
| **Move** | `2` | Drag an object to a new place. |
| **Add** | `3` | Choose *Object to add*, then click in the world. |
| **Remove** | `4` | Click or drag over things to delete them. In Weather, clicking near the ground erodes terrain; higher up, it dries the air. In Ecosystem, empty ground loses its plants. |
| **Force** | `5` | Press on an object (or empty space for a regional push), drag in the direction of the push, release. Longer drags push harder. |
| **Energy** | `6` | Hold the mouse to add energy inside the brush circle. Hold **Shift** or tick **Invert** to remove it. Adjust *Brush size* and *Strength*. |

Other shortcuts: `Space` play/pause · `.` single step · `f` fit view · `Esc` deselect ·
`Del` remove the selected object.

Links: the address bar keeps `#simulation/scenario` (e.g. `#weather/storm`), so you can
bookmark or share a scenario.

## Simulations and experiments to try

### Gravity & Orbits
Units: AU, years, solar masses. Energy tool = *heat* (spread velocities) / *cool*.
- **Solar System:** select Earth and read its period (~1 yr). Set Jupiter's mass ×100 in the Inspector and watch the asteroid belt.
- **Add tool:** new bodies start in a circular orbit around the nearest strong attractor. Turn off *New bodies start in orbit* to drop them at rest.
- **Figure-eight:** nudge one star with Force and watch the chaos.
- **Spiral galaxy:** set *Dark-matter halo speed* to 0 and the outer stars drift away. That's why dark matter was proposed.
- **Galaxy collision:** watch tidal tails form.

### Stellar Life Cycles
Units: light-years, million years. Energy tool = *feed matter / compress gas* / *strip mass*.
- **Mass sequence:** a row from 0.5 to 40 M☉. Speed up time and watch massive stars die first.
- Select a star and change its **Initial mass** or **Age** to jump through its life.
- Use Energy on a nebula to compress it and trigger a burst of star formation.
- The **HR diagram** (bottom right) plots luminosity against temperature; the selected star is white.

### Atoms & Molecules
Units: reduced molecular units; temperature shown in Kelvin. Energy tool = *heat* / *cool*.
- **Argon condensing:** droplets form at 60 K. Raise *Target temperature* to boil them.
- **Salt crystal:** heat it with the Energy tool to melt the lattice.
- **Hydrogen + oxygen:** watch the *Molecules* statistic for H₂ and H₂O.
- Inspect an atom and change its **Element** to transmute it.
- Turn on *Gravity* to see a gas stratify into an atmosphere.

### Weather & Atmosphere
A 32 km wide, 16 km tall slice of the sky. Energy tool = *heat air* / *cool air*.
- **Sunny day:** cumulus clouds pop up around midday.
- **Sea breeze:** the land heats faster than the sea, so the wind blows inland.
- **Mountain:** moist wind forced up the slope makes clouds and rain on the windward side.
- **Thunderstorm:** a towering cloud that rains out and spreads under the tropopause.
- Add moist air or a lake; raise mountains; heat a bubble near the ground to start convection.
- Switch *Display* to see temperature anomaly, humidity or wind speed.

### Ecosystem & Evolution
Energy tool = *feed / fertilise* / *drought / starve*.
- Watch the chart for predator–prey cycles.
- Set *Colour animals by* to **Speed gene** to see selection: prey under pressure get faster and smaller.
- Inspect an animal and edit its genes, or click *Clone this animal* to spread a mutant.
- Raise the temperature to 40 °C or apply drought and see who survives.

### Epidemic Spread
Units: days. Energy tool = *vaccinate* / *infect*.
- Compare the **Town outbreak** curve with **Social distancing** and **60 % vaccinated**.
- Turn on *Quarantine symptomatic*, or vaccinate a ring around an outbreak with the brush.
- **Waning immunity** shows an endemic disease that keeps coming back.

## Statistics and chart

The Statistics panel updates four times a second. The chart plots the key series of the
current simulation. Each series is scaled to its own range, so read exact values from
the legend.

## Troubleshooting

| Problem | Fix |
|---|---|
| Blank page when opening `index.html` directly | Browsers block ES modules on `file://`. Use `npm start`. |
| Simulation runs slowly | Lower *Steps per frame* / *Speed* parameters, or the top-bar speed multiplier. |
| Things flew off the screen | Press `f` (Fit view) or Reset. |
| Everything died or exploded | That's science! Press **Reset** to reload the scenario. |

## Glossary

| Term | Meaning |
|---|---|
| AU | Astronomical unit, the Earth–Sun distance (≈ 150 million km) |
| M☉, L☉, R☉ | Mass, luminosity and radius of the Sun |
| Test particle | A body that feels gravity but has no gravity of its own |
| Softening | A small distance added to avoid infinite forces at close range |
| HR diagram | Hertzsprung–Russell diagram: star luminosity against surface temperature |
| IMF | Initial mass function, the distribution of masses of newborn stars |
| Lennard-Jones | A model of attraction and repulsion between neutral atoms |
| Valence | The number of covalent bonds an atom can form |
| Thermostat | An algorithm that holds a simulated system near a target temperature |
| Potential temperature (θ) | Temperature air would have if brought to sea-level pressure; equal θ means neutral buoyancy |
| Relative humidity | Water vapour as a percentage of what the air can hold |
| Tropopause | Boundary (~11 km) above which the stable stratosphere stops storms rising |
| SEIR | Susceptible → Exposed → Infectious → Recovered disease model |
| Mutation | Random change in an offspring's genes |
