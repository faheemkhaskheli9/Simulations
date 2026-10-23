# OMNIVERSE — Simulation-Driven Multiverse Game Plan

**Status:** Proposed, not implemented
**Last updated:** 2026-10-23
**Parent project:** Simulations
**Related:** [Roadmap](ROADMAP.md), [System Design](SYSTEM_DESIGN.md), [World plan](world/PLAN.md), [World PRD](world/PRD.md)

## 1. Vision and product boundary

Build a playable, persistent simulation-driven multiverse where each universe has its own coherent physical rules, environments, civilizations, technology and supernatural possibilities. Players explore from a small laboratory to planets, star systems, galaxies and alternative universes; they use experiments and powers to navigate laws they must discover.

**Do not promise a literal atom-by-atom whole-universe simulation.** Support an effectively unbounded *addressable* space through hierarchical deterministic procedural generation, multiresolution models, lazy generation and event-driven background approximations. Only the player's surroundings and a small number of important entities receive expensive simulation steps.

Keep two explicitly labeled experiences:
1. **Science Sandbox:** Existing educational simulators, documented laws, units and assumptions, reproducible experiments. Preserve behavior and public simulation contracts.
2. **OMNIVERSE Game:** Science-inspired but fictional world rules, abilities, quests, exploration, combat/puzzles, crafting and optional player-defined universes. Never present fictional constants or superpowers as scientifically validated.

The game is a new mode and set of extensions, **not** a replacement for the current browser-based science product. Do not rewrite the existing runtime in Unreal/Godot as an unvalidated prerequisite.

## 2. Core design pillars

- **Laws create gameplay:** Crossing universes changes feasible movement, tools, life forms, construction, weapons and the environment. Differences must be discoverable, consequential and internally coherent—not cosmetic palette swaps.
- **Player agency:** Explorer, scientist, builder, defender or reality engineer are viable playstyles.
- **Causality and consequences:** Player interventions trigger observable local changes, with persistent changes, factions and ecosystem reactions.
- **Layers of simulation:** Physics fidelity increases when observed, interacted with, or scientifically tested; it is reduced elsewhere without losing important state.
- **Reproducible surprises:** Seeded generation plus dynamic event logs lets players share locations, challenge seeds and divergent timelines.
- **A playable loop first:** Fun, readability and reliable controls take priority over a universe-size marketing number.

A meaningful point of differentiation against exploration-centric procedural games and science simulators is **cross-universe consequences of coherent law changes** plus an ability system built directly from those laws.

## 3. Player fantasy and main loop

**Working role:** Riftwalker, a character with an apparatus that detects and stabilizes reality boundaries.

15–30 minute playable loop:
1. Explore a local region and scan anomalies, life or structures.
2. Conduct a small experiment to infer the universe's rules.
3. Harvest or synthesize a compatible resource; unlock or tune one ability.
4. Solve a movement/combat/ecosystem challenge using the discovered rule.
5. Stabilize a rift, decide a consequence, earn a persistent blueprint or discovery.
6. Travel to a new universe where the same tools behave differently.

Long-term loops:
- Establish laboratories, settlements and automated research outposts.
- Engineer creatures, materials and spacecraft within local physical constraints.
- Influence factions, biospheres and civilizations over accelerated simulated time.
- Build and share bounded challenge universes; compare alternate histories.
- Endgame: specify and test a new universe's rule pack using validated constraints.

Avoid pure grind, empty planets and solely procedural fetch quests: each region should introduce a specific mechanical puzzle, strategic decision, resource tradeoff or ecosystem consequence.

## 4. Multiverse model

Hierarchy: **Omniverse → Universe → Galaxy/region → Star system → Celestial body → Surface sector → Local object/organism/material**.

Identifiers are immutable and deterministic:
- multiverse root seed + universe ID + generator version + path + local feature ID.
- Nested seeds have separate named random streams for terrain, stars, flora, settlements, events, loot and AI.
- Every generated object has a reproducible address independent of camera path or visit order.
- Store only modified deltas, player-owned objects, discoveries, faction/economy state and summarized offscreen dynamics.
- Preserve generator-version compatibility in saves, rather than silently reshuffling discovered worlds after an update.

**Universe manifest** (versioned data, not arbitrary executable code):
- ID, parent/branch, seed, generation recipe, lore tags, timestamps and discovery state.
- Physics rule-pack ID and bounded parameter values, plus declared units.
- Allowed chemistry/material/evolution/technology families and generated content palettes.
- Spatial topology, traversability, dimensional presentation and universe-local time mapping.
- Portal boundaries, transfer policy and incompatibility transformations.
- Difficulty profile and gameplay constraints; separate simulation-assumption disclosure.

Reality branches are **snapshot + event log + delta**, not full copies. Multiple universes run independently with their own time scales. Crossing a portal serializes an entity through a transfer adapter and validates compatibility; impossible transfers become explicit transformations, inventory quarantine or blocked crossings.

**MVP universe set:**

| Universe | Physical novelty | Game consequence |
|---|---|---|
| Prime | Familiar gravity, chemistry and time | Teaches controls and gives a scientific baseline |
| Drift | Low gravity with local inversion fields | Momentum-based travel, floating settlements, levitation-based construction |
| Flux | Strong localized time-rate differences | Time-synchronized doors, age-sensitive materials, delayed reactions |

Later archetypes, **not initial scope**: high-gravity Crush, topology-warped Fold, altered material-bond Crystal, organism-dominated Living, reversible-process Mirror, thermal inversion, 2D world slices, and higher-dimensional projections. Higher-dimensional mathematical experiments are specialized views; do not imply a fully simulated navigable 4D universe.

## 5. Rule-pack system: different physics without chaos

Expose a constrained, validated **RulePack** API with explicit capabilities:
- gravity: baseline field, local signed/inverted zones, falloff, body interactions;
- motion: drag, inertia, momentum exchange and maximum safe velocities;
- time: local time-rate field, world clock, bounded event ordering;
- energy: heat, electricity/light availability, dissipation and transfers;
- matter: predefined bond/material response presets, break/transform thresholds;
- topology/portals: explicit coordinate and transfer maps;
- biology: viable biome/organism templates under these bounds.

A rule pack is not permission to patch the entire JavaScript math runtime. Use a rule registry with domain capability declarations, versioned schemas, validity limits, dependencies and deterministic update ordering.

**Rule resolution order:** universe defaults → stable regional modifiers → bounded transient anomaly fields → active player ability effects → solver. Use the existing simulation contract through domain adapters; preserve the original code path in Science Sandbox.

For ordinary Earth-like gravity the existing N-body/leapfrog implementation remains authoritative. For fiction modes choose specialized solvers or explicitly approximate behavior; no solver is expected to support arbitrary incompatible laws. Declare which combinations are supported.

**Validity gate:** reject NaN/infinity, unstable parameter ranges, contradictory field definitions, zero/negative time mapping where unsupported, infinite portal loops, uncontrolled feedback and state transitions with no valid representation. Provide a visible "unstable reality" response rather than browser crashes.

**Cross-universe invariant policy:** identify conserved quantities inside each rule pack (where applicable), allowed power sources and what may change at a portal. Do not claim cross-universe conservation of energy when a fictional transfer explicitly injects energy. Log the fictional rule and cost.

## 6. Superpower system based on physics

Powers are **bounded operators on a domain**, with resource cost, cooldown, target scope, legality conditions and recovery/failure behavior. No generic omnipotent spell that bypasses the entire simulation.

| Power | Underlying operator | Gameplay and restrictions |
|---|---|---|
| Gravity Shift | Local gravitational field | Levitate, throw debris, divert projectiles; high mass requires more energy |
| Kinetic Redirection | Momentum/impulse transfer | Dash, deflect, launch; reacts differently to local inertia rules |
| Energy Weave | Heat/electric/thermal transfer | Melt, freeze, charge machines; affects surrounding ecosystem |
| Matter Reforge | Allowed material state transformation | Craft/repair/terraform; requires compatible feedstock and recipe |
| Time Shear | Bounded local process-rate modifier | Slow reactions/traps; cannot arbitrarily rewrite committed history |
| Phase Step | Portal/short-range relocation | Traverse topology; only between compatible anchored regions |
| Biogenesis | Bounded growth/mutation operator | Cultivate flora or biotech; ecological and resource consequences |

**Progression:** Discover law → unlock basic operator → obtain compatible energy/material → tune to a new universe → combine operators → craft bounded rule artifacts. Different universes can amplify, invert, suppress or mutate abilities predictably.

Players should inspect *why* an ability fails: missing matter, wrong medium, excessive entropy/cost, forbidden rule or unstable boundary. In PvP (much later), authoritative costs/cooldowns and deterministic validation will be mandatory.

## 7. World, life, civilization and NPC systems

**Space layer:** seed-derived galaxies/star systems and orbital architecture; active few-body orbital physics near observations, analytical orbital approximations elsewhere; existing stars/gravity modules provide prototype models.

**Planet layer:** climate archetype → tectonic/geology proxy → elevation and erosion-like shaping → hydrology → biome suitability → flora/fauna distribution → ruins/settlements → resources. Use tiled LOD terrain, player-local collisions and sparse world deltas. Existing Climate→Weather→Ecosystem coupling is the starting pattern.

**Life layer:** ecological niches, food webs, growth, migration, mutation and species traits; agent-level simulation close to the player, aggregate populations farther away. Current ecosystem module becomes a reference, not a claim of validated full-planet evolution.

**Civilization layer:** resource flows, settlements, technology capabilities, factions, diplomacy and bounded historical events. Use a deterministic strategic state machine when distant; spawn individual characters only near players. No LLM is required for simulation integrity.

**NPC intelligence:** behavior trees/utility AI first for moment-to-moment actions; optional offline/hosted LLM for dialogue flavor and quest drafting behind strict schema validation and a deterministic fallback. Never allow LLM output to directly mutate canonical physics state.

**Player-created worlds:** bounded editor for rules, seed, terrain recipes, scenarios and challenges; export/import signed-versioned manifests with local validation, no untrusted JS plugins by default.

## 8. Technical architecture mapped to the existing repo

Preserve the existing static JavaScript ES-module app and headless Node test strategy for the initial vertical slice.

Suggested new boundaries (names proposed; no code exists yet):
- src/omniverse/registry/: universe manifests, versioned RulePacks, capability matrix.
- src/omniverse/generation/: address/seed derivation, systems, sectors, biomes, POIs.
- src/omniverse/runtime/: active-region scheduler, time domains, event queues, snapshots.
- src/omniverse/physics/: domain-specific rule adapters, anomaly fields, transfer checks.
- src/omniverse/game/: avatar, movement, powers, inventory, resources, quests, progression.
- src/omniverse/ai/: agent/aggregate simulation, faction events, deterministic quest logic.
- src/omniverse/persistence/: save schemas, sparse deltas, migration, replay.
- src/omniverse/ui/: universe Atlas, law scanner, ability HUD, portal transitions, creator.
- tests/omniverse/: law validation, physics compatibility, determinism, checkpoint replay, gameplay tests.

Reusable current foundations:
- src/core/random.js, barnes-hut.js, spatial-hash.js;
- src/world/engine and nested src/world/places.js coordinate approach;
- src/world/scheduler.js, couplings.js, save/load;
- existing gravity, stars, climate, weather, ecosystem, mechanics and atoms;
- current browser-based automated checks and lessons/challenge patterns.

**Important dependency on existing roadmap:** Complete or reuse F1 fixed-step/checkpoint/provenance contracts before promising replayable alternate universes; F2 worker/performance profiling is the backbone of active-region simulation. Extend existing issue #9 and #10 for performance/worker work rather than duplicate them. F3 comparison/branching experiments are a direct precursor to timeline gameplay. Treat science mode as a regression-critical product.

**Time and simulation fidelity:**
- Active local cells: interactive substeps and actual player interactions.
- Neighboring sectors: sparse entity updates, lower-resolution grids and deterministic scheduled events.
- Distant star systems: analytic or strategic aggregate state, not particles.
- Unvisited areas: no continuously simulated data; generate from seed and advance selected event summaries on demand.
- Rendering follows camera and visual LOD; simulation correctness is not tied to display frame rate.

A single global float position is unacceptable at cosmic scale. Keep hierarchical reference frames, local coordinate origins, declared units and per-domain numerical scales. Current world location abstraction is the foundation. Portal transitions reset active local frame and reconcile conserved state via transfer rules.

**Data/security:** Local-only single-player is the MVP. Save files have strict size and schema limits; no eval or arbitrary script execution from shared worlds. Later online features require server-authoritative saves, power checks and abuse mitigation.

## 9. Game modes and interfaces

1. **Adventure:** avatar-controlled exploration, artifacts, law discovery, rift missions and power progression.
2. **Creator Sandbox:** place stars/planets/objects, change a permitted universe rule set, test scenarios and publish challenge manifests.
3. **Observer:** freely fly from galaxies to planetary surfaces, inspect evolution and speed up time with accurate/fictional labeling.
4. **Science Sandbox:** current application and education modules, unchanged by game-only assumptions.

Input defaults: WASD/gamepad avatar movement, first/third-person switch if practical, orbit/fly controls in observer mode, scanner, inventory/crafting, ability bar, Atlas and rule comparison panel.

The interface must explain the currently active laws and show a visual "rule delta" on universe crossing.

## 10. MVP vertical slice (strict scope)

**One playable region across three universes**, not a fully explorable multiverse on day one:
- 3 curated physics rule packs (Prime, Drift, Flux).
- 1 compact playable planetary sector per universe; each has a star/sky context and 2–3 authored-procedural points of interest. Other celestial bodies visible or inspectable as lower-fidelity objects.
- A player avatar with camera, grounded/low-G movement, scanner, inventory and save/load.
- 5 working powers: gravity, kinetic, energy, bounded time and portal step.
- At least 6 distinct law-based puzzles, 3 hazards, 1 crafting/upgrade mechanic, 1 NPC/faction archetype.
- Portal traversal with proper transformation and visible compatibility results.
- Persistent discoveries, local world modifications and branch/save checkpoints.
- Guided 30–60-minute story/quest path plus replayable seeded exploration.
- Browser desktop first; single-player and offline. No realtime multiplayer, no full-galaxy faction simulator, no arbitrary reality code execution.

**MVP acceptance:** A new player can discover a law, solve a problem with a power, cross a portal, observe the power behave differently, return to a persistent edited location, and resume from save; no crashes on supported hardware during a 30-minute scripted run.

## 11. Roadmap and dependencies

| Phase | Priority | Deliverable | Indicative active engineering time |
|---|---|---|---|
| G0 Product & simulation integrity | P0 | Game/science modes and rule semantics; reuse existing F1 deterministic timing/snapshot and F2 benchmarks | 2–4 weeks, shared with F1/F2 |
| G1 Playable movement and world | P0 | Avatar, camera, collisions, one terrain sector, scanner, game UI | 4–6 weeks |
| G2 Three physics universes | P0 | RulePack schema, Prime/Drift/Flux, field visualization, crossings, time mapping | 4–6 weeks |
| G3 Powers and quests | P0 | Five powers, energy costs, puzzles, progression, hazards, local persistence | 4–8 weeks |
| G4 Procedural exploration | P1 | Seeded sector/star-system generator, LOD streaming, discovery Atlas, world deltas | 6–10 weeks |
| G5 More lasting gameplay | P2 | Better ecosystems/NPCs, settlements, crafting economy, user-authored challenge sharing | 8–16 weeks |
| G6 Online social world (optional) | P3 | Co-op and authoritative simulation, creator discovery, moderation, shard/instance routing | Separately re-estimate |

These are **effort ranges, not dates or commitments**. Integration, assets, content design, QA and unfamiliar engine limitations can substantially increase them; a polished commercial game is a multi-year ambition if developed primarily solo.

**Milestone sequence:**
- **Prototype A:** One planet sector, gravity power and an inversion zone: does changing the physical law actually make play more fun?
- **Prototype B:** Two connected sectors with different rules, persistent return trip, 3 puzzles.
- **Vertical slice:** Three universes, powers, onboarding, quests and replayable seeds.
- **Early access candidate:** New world content generation, exploration variety, stable saves, clear progression and strong performance.
- **Long-term:** Civilizations, universe engineering, authored community universes and optional co-op.

Stop/go gate after Prototype A: If the differentiated physics is unstable, hard to explain or not fun, improve the core before expanding galaxy counts.

## 12. Quality, fairness and acceptance tests

- **Science regression:** Existing simulation physics and user flows must still pass unchanged when game mode is disabled.
- **Determinism:** Same manifest, seed, inputs and tick schedule produce equivalent states; document browser floating-point tolerances.
- **State restoration:** Checkpoint + replay matches uninterrupted session, including time domains, RNG state, powers and portal events.
- **Rule validation:** Reject nonfinite inputs, unsupported combinations, out-of-range time/gravity, cyclical dependencies and invalid transfers without corrupting saves.
- **Power costs:** No infinite energy, negative cooldown or duplicated inventory via repeated portal crossing, pause/resume, branching or loading.
- **Travel precision:** No jitter or coordinate overflow moving between planetary and cosmic scale, or across universes.
- **Streaming:** Revisiting a generated sector restores the same landmarks and changed structures regardless of arrival order.
- **Background simulation:** Offscreen summaries reconcile with nearby detailed simulation and never duplicate/destroy persistent player objects.
- **Save upgrades:** Old versions load through tested migrations or clear failure handling; no silent world reshuffling.
- **Performance:** Target 30–60 fps for the MVP on a measured reference desktop configuration; budget physics, generation, rendering and memory separately, including low-quality fallback. Publish actual hardware results.
- **Content integrity:** No unwinnable seeded starter scenarios; puzzle solvability property tests and escape/reset points.
- **Security:** Validate imported creator manifests; block prototype pollution, huge imports, scripts and abusive content if online sharing is later introduced.
- **Accessibility:** Key rebinding, reduced-motion portal transitions, readable overlays and non-color-only rule indicators.

Each phase ships demo coverage plus Node tests, applicable browser E2E, and updated documentation; run the current npm test and npm run test:e2e for regression.

## 13. Risks and deliberate exclusions

| Risk | Mitigation |
|---|---|
| Scope explosion: "entire universe" | Lazy deterministic generation; one region first; do not simulate every atom |
| Fictional physics makes numerical solvers unstable | Bounded compatible rule families, tests, solver adapters and fallbacks |
| Procedural variety feels repetitive | Hand-authored mechanistic archetypes, strong discovery hooks, quality review |
| Powers trivialize progression | Finite energy, local constraints, counterplay and predictable compatibility |
| Cross-universe paradoxes/time exploits | Independent clocks, event-order contract, snapshot branching and explicit portal transfer policy |
| Browser performance on low-end devices | Profile current engine, Web Workers and optional WebGPU later; quality tiers |
| Education loses scientific integrity | Hard separation of Science Sandbox and Game Mode |
| Multiplayer increases complexity/cost | Strictly defer until offline retention and stability are proven |
| Optional generative AI causes lore inconsistency | Structured generated proposals plus validation; never canonical physics mutations |

## 14. First implementation order / planning backlog

1. Create a game-mode boundary and non-invasive interface prototype; preserve current Science Sandbox.
2. Extend F1 execution/checkpoint semantics to game-specific clocks, RNG, snapshots and events.
3. Implement RulePack schemas and compatibility tests for Prime, Drift and Flux.
4. Build one locally navigable planet-sector prototype with repeatable seed and terrain streaming.
5. Implement gravity and kinetic powers with measurable costs and nonfinite/invalid-state guards.
6. Add portals between two physics rule packs and a puzzle that depends on both.
7. Build save/reload/return-trip persistence, event log and branch metadata.
8. Add scanner, law discovery, crafting/upgrades, four further puzzle types and scripted intro.
9. Introduce third universe, time-rate puzzles and deterministic NPC/hazard behavior.
10. Profile the vertical slice; add asset variety and AI only after validating fun and performance.

**Immediate best next task:** Prototype A — locally navigable 3D planetary sector with a visible switchable gravity-inversion region and one gravity manipulation ability. Integrate through a separate game route; ship with automated tests and preserve existing browser science behavior.

## 15. External baselines for positioning (verified October 2026)

- Universe Sandbox: gravity, collisions, stellar evolution, climate and simulated materials. https://universesandbox.com/
- SpaceEngine: realistic procedural universe-scale exploration and scale transitions. https://spaceengine.org/
- No Man's Sky: procedural exploration/survival across enormous numbers of star systems. https://www.nomanssky.com/about/
- Unreal World Partition and PCG: reference architectures for chunk streaming and world generation, not a mandatory stack migration. https://dev.epicgames.com/documentation/unreal-engine/world-partition-in-unreal-engine and https://dev.epicgames.com/documentation/unreal-engine/procedural-content-generation-overview
- Godot large-world coordinates: useful tradeoff documentation; no direct Godot dependency planned. https://docs.godotengine.org/en/stable/tutorials/physics/large_world_coordinates.html

**Success thesis:** A universe generator is an engineering means, not the product. The product is an exploratory adventure where changing coherent physical rules changes what players can actually do.
