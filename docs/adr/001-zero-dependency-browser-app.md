# ADR-001: Zero-dependency, no-build browser application

- **Status:** Accepted
- **Date:** 2026-10-16

## Context
The product must open instantly for learners and be easy for contributors to modify.
Simulations must also be testable headlessly.

## Decision
Ship plain ES modules, HTML and CSS served as static files. No npm runtime dependencies,
no bundler or transpiler. Tests use Node's built-in `node:test`. A tiny `server.js` is
provided because browsers block ES modules on `file://`.

## Alternatives considered
- **React/Vue + Vite:** better component ergonomics, but adds a build, dependency churn
  and a barrier for scientists who just want to edit a model.
- **Game engine (Unity, Godot) or native app:** heavier distribution, no instant web access.
- **TypeScript:** stronger typing, but needs a compile step; JSDoc gives most of the benefit for now.

## Consequences
- ✅ Instant start, trivial deployment to any static host, readable source.
- ✅ Same module code runs in the browser and in Node tests.
- ❌ No type checking; UI code is imperative DOM manipulation.
- ↪ Revisit if the UI grows significantly (e.g. lessons and editors): TypeScript via JSDoc
  `// @ts-check` first, then a build only if needed.
