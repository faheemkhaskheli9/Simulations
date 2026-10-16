// Every simulation must support the shared interaction tools without throwing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIMULATIONS } from '../src/sims/index.js';

for (const S of SIMULATIONS) {
  test(`${S.meta.id}: implements the shared interaction contract`, () => {
    const sim = new S();
    assert.ok(S.meta.title && S.meta.category && S.meta.description);
    const m = S.meta.model;
    assert.ok(m?.summary, 'meta.model.summary');
    for (const k of ['equations', 'assumptions', 'references']) assert.ok(m[k]?.length, `meta.model.${k}`);
    assert.ok(sim.scenarios.length > 0 && sim.spawnKinds.length > 0);
    const b = sim.bounds();
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = b.w / 10;
    for (const d of sim.paramDefs) assert.ok(d.key in sim.params, d.key);
    for (const k of sim.spawnKinds) sim.add(k.id, cx, cy, r);
    sim.step(1 / 60);
    const e = sim.pick(cx, cy, r);
    if (e) {
      const info = sim.describe(e);
      assert.ok(info.title && info.fields.length);
      for (const f of info.fields) {
        if (f.type === 'number') sim.setProperty(e, f.key, Number(f.value));
      }
      assert.ok(sim.locate(e));
      sim.move(e, cx + r / 2, cy);
    }
    sim.impulse(e, cx, cy, r / 4, 0);
    sim.impulse(null, cx, cy, r / 4, 0);
    sim.energy(cx, cy, r, 0.5);
    sim.energy(cx, cy, r, -0.5);
    sim.removeAt(cx, cy, r);
    sim.step(1 / 60);
    for (const s of sim.stats()) assert.ok(s.label && s.value !== undefined, s.key);
    for (const k of sim.chartKeys) assert.ok(sim.stats().some((s) => s.key === k), `chart key ${k}`);
    for (const sc of sim.scenarios) { sim.loadScenario(sc.id); sim.step(1 / 60); }
  });
}
