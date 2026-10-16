# ADR-003: Domain-specific numerical methods instead of one generic engine

- **Status:** Accepted
- **Date:** 2026-10-16

## Context
Phenomena span many orders of magnitude and mathematical forms: Hamiltonian N-body
dynamics, stiff molecular forces, incompressible fluids with phase change, and stochastic
agents. No single integrator handles these well.

## Decision
Each module picks the standard method for its domain:

| Module | Method |
|---|---|
| Gravity | Symplectic kick-drift-kick leapfrog, softening, adaptive substep count |
| Atoms | Velocity Verlet, spatial hash, Berendsen thermostat, force clamp |
| Weather | Stable fluids: semi-Lagrangian advection + red-black SOR pressure projection, saturation adjustment |
| Stars | Analytic evolutionary tracks (no integration) + event-driven population |
| Ecosystem / Epidemic | Fixed-step stochastic agent-based models |

Shared utilities (RNG, spatial hash, maths) live in `src/core/`.

## Alternatives considered
- **One generic particle engine:** easy to share, but wrong for fluids and agents and inaccurate for orbits.
- **External physics libraries:** conflicts with ADR-001 and usually focus on rigid-body games.

## Consequences
- ✅ Each module is physically appropriate and testable against known results.
- ❌ Less code reuse between modules; contributors need domain knowledge.
- ↪ Extract genuinely shared solvers into `src/core/` as patterns repeat (e.g. a grid fluid solver).
