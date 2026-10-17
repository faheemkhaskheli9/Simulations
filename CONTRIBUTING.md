# Contributing

Thanks for helping simulate the universe!

## Setup

```bash
git clone https://github.com/faheemkhaskheli9/Simulations.git
cd Simulations
npm start      # http://localhost:8080
npm test       # Node ≥ 18, no install needed
```

## Workflow

1. Create a branch from the default branch: `feature/<short-name>` or `fix/<short-name>`.
2. Make focused changes; keep each pull request to one module or one platform feature.
3. Run `npm test` and try your change in the browser (all tools, all scenarios).
4. Open a pull request describing **what** changed, **why**, and **how you verified it**.

## Adding a simulation

Follow the [Module Guide](docs/MODULE_GUIDE.md). In short: subclass `Simulation`,
register it in `src/sims/index.js`, add a behaviour test, and list it in the README
and [Roadmap](docs/ROADMAP.md).

## Conventions

- Plain ES modules, no runtime dependencies, no build step ([ADR-001](docs/adr/001-zero-dependency-browser-app.md)).
- 2-space indentation, single quotes, semicolons, `const`/`let` only.
- Use `this.rng` for randomness, never `Math.random` ([ADR-005](docs/adr/005-seeded-determinism.md)).
- Label parameters and inspector fields with physical units.
- Brief comments that explain *why* (the model or approximation), not *what*.
- Significant design decisions get an ADR in `docs/adr/`.

## Review checklist

- [ ] `npm test` passes (the contract test covers your module automatically)
- [ ] New behaviour has a test against a known result
- [ ] No console errors in the browser; frame time stays within [TRD PR-2/PR-3](docs/TRD.md#6-performance-requirements)
- [ ] Inputs clamped; no NaN at max speed or with extreme tool use
- [ ] Docs updated (README catalogue, User Guide, Roadmap/TRD status if relevant)
- [ ] `npm run docs:reference` re-run if you changed scenarios, parameters, spawn kinds, statistics, model notes or lessons (a test fails otherwise)
- [ ] `npm run docs:screenshots` re-run if the change is visible in the User Guide screenshots (needs Playwright: `npm install --no-save playwright && npx playwright install chromium`)
