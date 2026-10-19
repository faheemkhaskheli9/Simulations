# Product Requirements Document (PRD) — Simulations World (3D)

| | |
|---|---|
| **Product** | Simulations World: one explorable 3D world that contains every simulation |
| **Status** | v1.0: World Preview built, with the globe, native gravity and five couplings ([status](TRD.md#12-implementation-status)) |
| **Owner** | Faheem Khaskheli |
| **Last updated** | 2026-10-19 |
| **Related** | [Plan](PLAN.md) · [TRD](TRD.md) · [System Design](SYSTEM_DESIGN.md) · [ADR-006](../adr/006-in-house-webgl2-renderer.md) · [ADR-007](../adr/007-nested-scale-frames.md) · [ADR-008](../adr/008-sites-wrap-existing-modules.md) · product [PRD](../PRD.md) |

---

## 1. Summary

Today each simulation is a separate 2D page that you pick from a menu. **Simulations
World** puts all of them into **one continuous 3D world** that you fly through, from a
galaxy down to a single atom. Each simulation becomes a **site**: a place in the world
where that phenomenon happens (the Solar System, a star-forming nebula, the Earth's
climate on a globe, a thunderstorm over a valley, a savanna, a town with an epidemic, a
physics lab, a cell under a microscope, a box of molecules, one atom).

The six tools, parameters, inspector, statistics, lessons, save and share links all keep
working inside the world. Later, sites are **coupled**, so the Sun's output warms the
climate, the climate sets the weather, and rain feeds the ecosystem.

This answers open question 1 in the product PRD ("should the product move to 3D?"): the
3D world becomes a second way into the same simulations, and the 2D app stays.

## 2. Problem

- **Scale is invisible.** The catalogue spans 30 orders of magnitude, but a menu makes a
  galaxy and an atom look like neighbours. Learners never see *where* one phenomenon sits
  relative to another.
- **Topics feel unrelated.** Weather, climate, ecosystems and epidemics are linked in
  reality but are separate pages here, so the links can't be explored.
- **Some phenomena are 3D.** Orbits with inclination, galaxy collisions, crystal lattices,
  convection and the globe lose meaning when flattened.
- **Discovery is passive.** A list of ten cards invites less exploration than a world
  you can fly around.

## 3. Goals and non-goals

### Goals
| ID | Goal |
|---|---|
| WG1 | **One world:** every registered simulation is reachable as a site inside a single 3D world, with no page loads between them. |
| WG2 | **Powers of ten:** you can zoom continuously from galaxy to atom along one path, and always know what scale you are at. |
| WG3 | **Same tools everywhere:** the six tools, inspector, parameters, statistics, chart, lessons, undo, save and share work in the world exactly as in 2D. |
| WG4 | **Real 3D where it matters:** gravity, atoms, climate (globe) and weather get native 3D views; other sites may stay as 2D surfaces placed in 3D. |
| WG5 | **Connected science:** opt-in couplings pass real quantities between sites (insolation, surface temperature, rainfall, population). |
| WG6 | **Still instant:** no install, no build, no runtime dependency, works offline; falls back to the 2D app when 3D is not available. |
| WG7 | **Extensible:** a new module appears in the world by adding one site entry; native 3D is optional. |

### Non-goals
- A game: no avatar physics, quests, scoring beyond existing challenges, or multiplayer.
- One global clock or one physics engine across all scales. Each site keeps its own time
  and numerics (see [ADR-003](../adr/003-per-domain-numerical-methods.md)).
- Photorealism. Clear, stylised visuals beat expensive ones.
- VR/AR headsets in the first release (WebXR is a later option, §11).
- Replacing the 2D app. It stays the reference, accessible and low-end path.

## 4. Users

Same personas as the product PRD, with what the world adds for each:

| Persona | What the 3D world gives them |
|---|---|
| Curious learner | A guided tour through scales; "where am I?" always answered; one place to explore |
| Educator | Tours as lessons; links straight to a site and camera view; projector-friendly flythroughs |
| Hobbyist | 3D galaxies, crystals and storms to play with; coupling experiments ("dim the Sun, watch the savanna") |
| Developer | A site API that wraps existing modules; optional `render3D` for native views |

## 5. Experience walkthrough

1. **Arrive.** The page opens on the Milky Way with a slow drift. A short card says
   "This is one world. Every simulation is a place in it. Click a glowing marker or press
   **T** for the tour." A scale bar reads "100 000 light-years".
2. **Fly in.** Clicking the *Sun* marker flies the camera through the galaxy to the
   Solar System. The scale bar sweeps from light-years to AU. The gravity simulation is
   already running; planets orbit in 3D with their real inclinations.
3. **Enter a site.** The left panel now shows the Gravity tools and parameters, exactly
   like the 2D app. The user drags a planet, changes G, watches the chart.
4. **Keep going.** Zooming on Earth hands over to the *Global Climate* site on a globe.
   Lower down, the *Valley* region holds three sites side by side: a weather
   cross-section over the hills, the savanna ecosystem and a town where the epidemic runs.
5. **Go small.** Inside the town is a science campus: the *Mechanics Lab* hall, a
   microscope bench (the *Cell*), and a sample chamber that zooms to the *Atoms &
   Molecules* box and finally to one *Atomic Structure*.
6. **Connect.** In the World panel the user turns on *Sun → Climate* and lowers the
   Sun's luminosity in the Stars site. The globe ices over; the valley's weather cools;
   the savanna's grass shrinks; herbivores decline. The chart shows all four.
7. **Share.** *Share link* copies `…/#world/earth/valley/weather?view=…&stability=8`;
   the recipient lands on the same site, camera and parameters.

## 6. The world map

The world is a tree of **places**. Each place has its own scale and unit; sites live in
places. The default layout:

| Level | Place | Typical size | Sites (existing module · scenario) |
|---|---|---|---|
| L0 Cosmic | **Deep Space** | 10⁵ ly | Gravity · *galaxy collision* |
| L1 Galactic | **Orion Arm** | 100 ly | Stellar Life Cycles · *nebula* |
| L2 Stellar | **Solar System** | 60 AU | Gravity · *solar system* (+ Earth–Moon sub-site) |
| L3 Planetary | **Earth** | 12 700 km | Global Climate (on the globe) |
| L4 Regional | **The Valley** | 40 km | Weather & Atmosphere · Ecosystem & Evolution · Epidemic Spread |
| L5 Human | **Science Campus** | 100 m | Mechanics Lab |
| L6 Micro | **Microscope** | 50 µm | Cell Biology |
| L7 Nano | **Sample Chamber** | 20 nm | Atoms & Molecules |
| L8 Atomic | **Atom** | 1 Å (nucleus inset) | Atomic Structure |

Other scenarios of a module are reachable from the site's scenario picker (as today) or
as extra markers in the same place (e.g. a binary star in the Orion Arm).

## 7. Functional requirements

Priority: **P0** first release · **P1** soon after · **P2** later.

### 7.1 World and navigation
| ID | Requirement | Priority |
|---|---|---|
| WFR-1 | A single 3D scene contains every place and site in §6, loaded without page navigation | P0 |
| WFR-2 | Orbit / pan / zoom camera with mouse, touch (pinch, two-finger) and keyboard | P0 |
| WFR-3 | Continuous zoom across all levels with smooth hand-over between places; no visible jitter at any scale | P0 |
| WFR-4 | Site markers (label + icon) visible from the parent place; click flies to the site | P0 |
| WFR-5 | Scale bar and breadcrumb (*Deep Space › Solar System › Earth › Valley*) always visible; breadcrumb items fly back up | P0 |
| WFR-6 | **Atlas**: a searchable list of every place and site (keyboard accessible, also the non-3D fallback) | P0 |
| WFR-7 | Guided **tour** (galaxy → atom) with short captions; can be paused, skipped, or left at any stop | P1 |
| WFR-8 | Reduced-motion setting: camera jumps instead of flying | P0 |
| WFR-9 | Mini-map / "you are here" diagram of the scale ladder | P1 |

### 7.2 Sites and tools
| ID | Requirement | Priority |
|---|---|---|
| WFR-20 | Entering a site makes it **active**: the left/right panels show its tools, parameters, scenarios, inspector, stats and chart, as in the 2D app | P0 |
| WFR-21 | All six tools work on the active site by pointing in 3D (inspect, move, add, remove, force, energy) | P0 |
| WFR-22 | Every existing module works as a site with **no change to its code** (shown on a surface in 3D) | P0 |
| WFR-23 | Native 3D views: Gravity (3D orbits, inclination), Global Climate (globe) | P0 |
| WFR-24 | Native 3D views: Atoms & Molecules (3D box), Weather (extruded volume), Ecosystem (terrain) | P1 |
| WFR-25 | Native 3D views for the remaining modules where they help (Cell sphere, Atom orbitals) | P2 |
| WFR-26 | Visible but inactive sites keep animating at reduced rate or show their last frame; far sites pause | P0 |
| WFR-27 | "Open in 2D" on any site opens the classic app on the same world state | P0 |
| WFR-28 | Scenario picker, Reset, play/pause/step/speed apply to the active site | P0 |

### 7.3 Connected science (couplings)
| ID | Requirement | Priority |
|---|---|---|
| WFR-40 | A World panel lists available couplings, each with on/off and a short explanation | P1 |
| WFR-41 | Couplings: Stars → Climate (solar constant), Climate → Weather (surface temperature, humidity at the Valley's latitude), Weather → Ecosystem (rain → grass fertility), Climate → Ecosystem (season, temperature) | P1 |
| WFR-42 | Couplings: Ecosystem/Climate → Epidemic (season-dependent transmission), Gravity → Climate (Earth's orbital distance → insolation) | P2 |
| WFR-43 | Coupled quantities are visible in the inspector and chart with units and source site | P1 |
| WFR-44 | Couplings are off by default so every site still behaves exactly as its 2D version | P0 |

### 7.4 Persistence, sharing, education
| ID | Requirement | Priority |
|---|---|---|
| WFR-60 | Save/load the whole world (all touched sites, couplings, camera) as one file | P0 |
| WFR-61 | Share links address a site and camera: `#world/<place path>/<site>?<params>&view=<camera>` | P0 |
| WFR-62 | Existing 2D links (`#gravity/solar`) keep working in the 2D app; opening them with `world=1` lands on the matching site | P1 |
| WFR-63 | Lessons and challenges run inside the world; a lesson can fly the camera to its site | P1 |
| WFR-64 | Teacher mode `lock=` works on world links | P1 |
| WFR-65 | Undo/redo covers interventions on any site (per-site history) | P0 |

## 8. Non-functional requirements (summary)

Measurable versions are in the [TRD](TRD.md).

- **Fast:** first frame of the world within 3 s on a mid-range laptop; 60 fps while
  flying; ≥ 30 fps with the Weather site active.
- **Light:** no runtime dependencies, no build, world code ≤ 250 KB unminified on top of
  today's app; works offline after first load.
- **Graceful:** without WebGL2 or with `prefers-reduced-motion`, the Atlas and 2D app
  give access to everything.
- **Faithful:** every site's physics is identical to its 2D module (same tests pass).
- **Accessible:** keyboard-only use through the Atlas and panels; labels on every marker;
  readable contrast; no flashing.

## 9. Success metrics

| Metric | Target (3 months after launch) |
|---|---|
| Sessions that visit ≥ 3 sites | > 40 % (vs. ≥ 2 sims per session today) |
| Sessions that use the scale zoom across ≥ 3 levels | > 50 % |
| Sessions that enable at least one coupling | > 15 % |
| Tool use per session inside the world | ≥ 2D app baseline |
| Median fps on reference laptop while flying | ≥ 55 |
| Crash-free sessions | > 99.5 % |
| Visitors who fall back to 2D for lack of WebGL2 | < 3 % |

*(Analytics do not exist yet; these need privacy-friendly opt-in counters first.)*

## 10. Release plan

Phases and exit criteria are in the [Plan](PLAN.md).

| Release | Scope |
|---|---|
| **World Preview (P0 core)** | Engine, scale ladder, all sites via 2D surfaces, tools, Atlas, save/share, 3D gravity and globe |
| **World 1.0** | Tour, native 3D for atoms/weather/ecosystem, first couplings, lessons in the world |
| **World 1.x** | Remaining couplings, more native 3D, Workers/WebGPU, presenter view |

## 11. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Scope creep into a game engine | Never ships | In-house renderer limited to what sites need (ADR-006); 2D surfaces first (ADR-008) |
| Float precision across 30 orders of magnitude | Jitter, broken picking | Nested places with local frames and a floating origin (ADR-007) |
| Several heavy sites at once blow the frame budget | Low fps | Activity tiers and a per-frame step budget; one heavy site active at a time |
| Couplings produce nonsense across mismatched time scales | Credibility | Couplings exchange slow, averaged quantities; documented units; off by default |
| 3D navigation confuses learners | Users get lost | Breadcrumb, scale bar, Atlas, "fly home", tour |
| Low-end devices and old browsers | Exclusion | Feature detection, quality presets, 2D fallback |
| Two front-ends drift apart | Bugs, double work | Shared panels and contract; e2e tests run both |

## 12. Open questions

1. Should the world become the default landing page once it is stable, or stay behind a
   "Enter the World" button on the welcome screen? (Proposal: button first, default after
   World 1.0 if metrics hold.)
2. How literal should the map be (real Earth geography vs. a stylised valley)?
   (Proposal: stylised valley at a stated latitude, real coastlines only on the globe.)
3. Should time be linked between coupled sites (one "world speed"), or only quantities?
   (Proposal: quantities only, see System Design §8.)
4. Is WebXR (headset) support worth a P2 slot?
