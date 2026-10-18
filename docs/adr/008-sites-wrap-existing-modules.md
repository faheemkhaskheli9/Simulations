# ADR-008: Sites wrap existing modules; native 3D is optional

- **Status:** Proposed
- **Date:** 2026-10-18

## Context
There are ten tested 2D modules with one shared contract ([ADR-002](002-uniform-simulation-contract.md)).
Rewriting each for 3D would take months, risk the physics, and duplicate code.

## Decision
A **site** wraps an unchanged `Simulation`. By default a surface adapter renders the
module's `render()` into an OffscreenCanvas texture placed on a plane, ground patch,
slab or globe, and maps 3D pointer rays back to module coordinates so all six tools work.
Modules may optionally add `render3D`, `pick3D`, `locate3D`, 3D tool variants and
`outputs()` for a native view or couplings. Couplings use only `stats()`/`outputs()`
and `setParam`, so modules never depend on each other.

## Alternatives considered
- **Rewrite every module in 3D:** best visuals, but slow, risky and loses parity with 2D.
- **3D only for space, 2D app for the rest:** does not deliver one world.

## Consequences
- ✅ The whole catalogue is in the world early, with identical physics and tests.
- ✅ Native 3D can be added one module at a time.
- ❌ Surface sites look flat until they get native views; texture uploads cost GPU time.
