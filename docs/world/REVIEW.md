# Design Review — Simulations World (3D)

| | |
|---|---|
| **Reviewed** | [Plan](PLAN.md), [PRD](PRD.md), [TRD](TRD.md), [System Design](SYSTEM_DESIGN.md) v0.1 |
| **Date** | 2026-10-18 |
| **Outcome** | Approved with the changes below; all of them are folded into v0.2 of the documents |

The review checked the documents against the code they build on (`src/ui/app.js`,
`src/core/simulation.js`, each module's coordinates, units and scenarios) and against
what WebGL2 can do. Each finding lists the change made.

## Findings

| # | Area | Finding | Change |
|---|---|---|---|
| R1 | Architecture | Extracting a `SitePanels` component from `app.js` (Plan W2) is the riskiest step and is not needed: `App` already owns every panel and only needs a way to bind an *existing* simulation instance and to hand drawing and pointer input to another stage. | `App` gains `bindSim(sim, { history })` and an optional **stage**; the world is a stage. W-AR-4 and Plan W2 updated. |
| R2 | Architecture | Native 3D views were described as methods added to modules, which contradicts W-AR-1 ("no change to module source"). | Native views live in `src/world/native/`, read a module's public state, and change it only through the contract. Module hooks stay possible later. |
| R3 | Places | The place frame stored a `scale` that is already given by the two units, and had no way to place a region tangent to a globe or to keep the Earth place on the moving Earth of the Solar System simulation. | Scale is derived from units; frames get an orthonormal basis (`lat`/`lon` helper) and an optional `follow` anchor that tracks a body in a site. |
| R4 | Camera | A yaw/pitch camera breaks when handing over into a rotated frame (the valley on the globe). | Camera stores target + eye offset vectors (converted exactly at hand-over) and eases its up vector to the place's up. |
| R5 | Camera | Fly-to across 30 orders of magnitude was unspecified and would lose precision if the target were interpolated at small scales. | Fly-to animates log distance on an arc and finishes moving the target while the camera is still far away. |
| R6 | Rendering | Child places drawn after a depth clear show through their parent's globe (the valley seen through the Earth). | Places may declare an occluder sphere; hidden children are skipped. |
| R7 | UI | GL billboards plus a text atlas for markers are work-heavy and not accessible. | Markers are DOM buttons positioned over the canvas: focusable, labelled, clickable. |
| R8 | Tools | 3D gizmos for selection, brush and force arrow are unnecessary on surface sites. | Surface sites draw the same overlays as the 2D app into their texture; native sites draw 3D rings and arrows. |
| R9 | Couplings | Stars → Climate needs a "Sun" star the Stars simulation does not have; Climate → Weather needed a new Weather parameter. | Stars → Climate moves to P2. Climate → Weather drives the existing `sun` parameter. Gravity → Climate (Earth–Sun distance) is P1. Couplings may read public state as well as `stats()`. |
| R10 | Rendering | WebGL2 ignores line widths above 1 px on most platforms. | 1 px lines for trails and gizmos in v1; wide lines later. |
| R11 | PRD | The walkthrough promised planets "with their real inclinations", which needs the 3D gravity mode planned for W4. | Wording changed to the orbital plane; inclination comes with the 3D mode. |
| R12 | World map | The Orion Arm had no galaxy around it, and the galaxy-collision site sat at the origin of Deep Space. | A procedural Milky Way surrounds the Orion Arm; the colliding galaxies sit far away in Deep Space. |
| R13 | Routes | Full place paths in links break whenever the layout changes. | Place and site ids are unique, so routes resolve by their last segment; the path is kept for readability. |
| R14 | TRD | Couplings writing a parameter needed a UI rule. | Driven parameters are disabled in the panel with the coupling named in their tooltip (reuses the teacher-lock mechanism). |
| R15 | Plan | No order was given for what to build first inside each phase, and some items (3D physics modes, Workers) are large. | The first implementation covers W0–W3, the two P0 native views, the P1 couplings, the tour and the tests; 3D physics modes, Workers and WebGPU remain later work. |

## Risks re-checked

- **Texture uploads:** measured in headless Chromium with SwiftShader, well within budget for one 1024 px surface per frame plus ambient surfaces at 8 Hz.
- **WebGL2 availability:** confirmed in the CI browser (Chromium with SwiftShader); the Atlas fallback covers browsers without it.
- **Precision:** with per-place units every coordinate sent to the GPU stays below 10⁶ (checked by a test over the default layout).
