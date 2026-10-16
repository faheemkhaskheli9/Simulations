# ADR-002: One uniform interaction contract for all simulations

- **Status:** Accepted
- **Date:** 2026-10-16

## Context
The product has to cover very different phenomena (orbits, molecules, weather, life) and
let users act on all of them: inspect, edit, add, remove, move, push and add energy. Writing
a custom UI per simulation would not scale to "all possible entities".

## Decision
Define a single `Simulation` base class with a small contract (`pick`, `describe`,
`setProperty`, `add`, `move`, `removeAt`, `impulse`, `energy`, `stats`, `paramDefs`,
`scenarios`, …). The UI is generic and calls only this contract. Entities are opaque
handles owned by the module. Each module defines what "energy" or "force" means for its
domain (heat, accretion, food, vaccine…).

## Alternatives considered
- **Entity-component-system shared by all modules:** too rigid for grid-based models (weather) and agent-based ones (epidemic) at once.
- **Per-module bespoke UIs:** maximum flexibility but inconsistent UX and high cost per module.

## Consequences
- ✅ New modules get the full UI for free; consistent learning curve.
- ✅ A contract test can validate every module automatically.
- ❌ Some tools map loosely in some domains (e.g. "move" on a weather grid is a no-op).
- ↪ Optional capabilities (persistence, 3D) are added as optional contract methods.
