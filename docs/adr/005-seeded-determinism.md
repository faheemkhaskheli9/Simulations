# ADR-005: Seeded randomness for reproducible scenarios

- **Status:** Accepted
- **Date:** 2026-10-16

## Context
Educators need demos that behave the same way every time, and tests need repeatable outcomes.

## Decision
All module randomness goes through `Random` (mulberry32) in `src/core/random.js`. Every
`loadScenario` reseeds it. `Math.random` is not used in simulation code.

## Alternatives considered
- `Math.random`: simpler, but makes scenarios and tests non-reproducible.

## Consequences
- ✅ Same scenario gives the same evolution until the user intervenes; stable tests.
- ❌ Real-time variations (frame timing) still change trajectories slightly, since `dt` follows the frame rate.
- ↪ A fixed-timestep "replay" mode can be added together with persistence (M2).
