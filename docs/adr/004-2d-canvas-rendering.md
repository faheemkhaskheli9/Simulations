# ADR-004: 2D Canvas rendering for v1

- **Status:** Accepted
- **Date:** 2026-10-16

## Context
We need fast, simple rendering of thousands of particles, grid fields and overlays that
works on every browser and is easy for module authors to use.

## Decision
Use the Canvas 2D API. Modules draw in screen space through `view.toScreen()`; grid fields
are written to an `ImageData` and scaled with one `drawImage`. The camera is 2D with
optional y-up.

## Alternatives considered
- **WebGL / WebGPU:** much faster for 10⁵+ elements and enables 3D, but a steeper authoring curve and more code.
- **SVG / DOM:** too slow for thousands of moving elements.

## Consequences
- ✅ Simple, portable and debuggable; adequate for current scales (≤ ~3 000 entities, 8 k-cell grids).
- ❌ Limits particle counts and rules out 3D for now.
- ↪ Roadmap M4: optional WebGPU renderer and 3D view behind the same `render` hook.
