# ADR-007: Nested places with local frames and camera-relative rendering

- **Status:** Accepted (implemented 2026-10-19)
- **Date:** 2026-10-18

## Context
The world spans from ~10²¹ m (a galaxy) to ~10⁻¹⁰ m (an atom). GPU float32 has about
7 significant digits, and a single depth buffer cannot cover more than a few orders of
magnitude without artefacts.

## Decision
Organise the world as a tree of **places**, each with its own unit, size and pose in its
parent. The camera lives in one current place in float64 and hands over to a child or
parent at thresholds with hysteresis. Transforms are composed in float64 on the CPU,
the camera position is subtracted, then values are sent as float32. Places render in
layers back-to-front by scale, each with its own near/far planes and a depth clear.

## Alternatives considered
- **One global coordinate system with a logarithmic depth buffer:** fixes depth but not
  vertex precision; jitter at small scales.
- **Separate scenes with loading screens between scales:** simple but breaks the
  continuous "powers of ten" experience, which is the point of the world.

## Consequences
- ✅ Precise rendering and picking at every scale; local units match each module's units.
- ✅ Places double as the navigation model (breadcrumb, Atlas, routes).
- ❌ Hand-over logic and per-layer rendering add complexity and need careful tests.
