# ADR-006: In-house WebGL2 renderer for the 3D world

- **Status:** Proposed
- **Date:** 2026-10-18

## Context
The [3D world](../world/PRD.md) needs instanced spheres and points, lines, textured surfaces,
a globe, simple lighting and labels. The project has no runtime dependencies and no build
([ADR-001](001-zero-dependency-browser-app.md)), must work offline, and must not copy third-party code.

## Decision
Write a small WebGL2 layer in `src/world/engine/` (context, programs, buffers, meshes,
instancing, layered rendering). Modules draw only through a narrow `Renderer3DApi`
facade, never raw GL, so a WebGPU backend can be added later behind the same API.

## Alternatives considered
- **three.js / Babylon.js:** mature and fast to start, but a large dependency, vendored code
  or a CDN at runtime (breaks offline and the no-dependency rule), and much more than we need.
- **WebGPU only:** best performance, but not yet available on every target browser.
- **Canvas 2D with fake 3D:** no real depth, picking or lighting; does not scale.

## Consequences
- ✅ Keeps zero dependencies, no build and offline use; code stays readable for contributors.
- ✅ The facade lets the engine move to WebGPU without touching modules.
- ❌ About 2 000 lines of engine code to write, test and maintain.
- ↪ Limit the engine to features sites need; revisit if requirements grow towards a game engine.
