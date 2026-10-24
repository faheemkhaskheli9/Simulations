// The native Ecosystem terrain (World TRD W-FT-28, WFR-24): terrain from
// fertility, plant cover as its texture, instanced animals standing on it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIMULATIONS } from '../src/sims/index.js';
import { World } from '../src/world/world.js';
import { TerrainSite, terrainHeights, fertilityStamp } from '../src/world/native/terrain.js';
import { EcosystemSim, groundColor, animalColor } from '../src/sims/ecosystem.js';
import { hexColor, hslToRgb } from '../src/world/engine/colors.js';
import { v3 } from '../src/world/engine/math3d.js';

function site(scenario = 'balanced') {
  const world = new World(SIMULATIONS);
  const s = world.sites.get('ecosystem');
  assert.ok(s instanceof TerrainSite, 'the savanna is drawn as a native terrain');
  s.scenario = scenario;
  s.ensure();
  return s;
}

test('fertile ground stands higher than barren ground', () => {
  const s = site('islands'), sim = s.sim;
  // The middle of an island (cells 20, 15) against open desert (cells 5, 45).
  const island = s.heightAt(20.5 * sim.cell, 15.5 * sim.cell), desert = s.heightAt(5.5 * sim.cell, 45.5 * sim.cell);
  assert.ok(island > desert + 0.02 * s.width, `${island} vs ${desert}`);
  const h = terrainHeights(sim, s.width);
  assert.equal(h.length, (sim.GX + 1) * (sim.GY + 1));
  for (const v of h) assert.ok(v >= 0 && v <= 0.05 * s.width, `height ${v}`);
});

test('feeding the land raises the terrain; the mesh is rebuilt only when fertility changes', () => {
  const s = site(), sim = s.sim, x = 400, y = 250;
  const before = s.heightAt(x, y), v0 = s.terrainVersion;
  s.heightAt(10, 10);
  assert.equal(s.terrainVersion, v0, 'no rebuild without a change');
  const stamp = fertilityStamp(sim.fertile);
  sim.energy(x, y, 60, 1);
  assert.notEqual(fertilityStamp(sim.fertile), stamp);
  assert.ok(s.heightAt(x, y) > before);
  assert.equal(s.terrainVersion, v0 + 1);
});

test('the terrain mesh covers the grid and its normals point up', () => {
  const s = site(), { GX, GY } = s.sim;
  const m = s.terrainMesh(), n = (GX + 1) * (GY + 1);
  assert.equal(m.positions.length, n * 3);
  assert.equal(m.indices.length, GX * GY * 6);
  assert.ok(Math.max(...m.indices) < n);
  for (let k = 0; k < n; k++) assert.ok(m.normals[k * 3 + 1] > 0.9);
  // Corners of the mesh sit at the edges of the site.
  assert.ok(Math.abs(m.positions[0] + s.width / 2) < 1e-6 && Math.abs(m.positions[2] + s.depth / 2) < 1e-6);
  const sk = s.skirtMesh();
  assert.ok(Math.max(...sk.indices) < sk.positions.length / 3);
});

test('the ground texture shows the same plant colours as the 2D view', () => {
  const s = site(), sim = s.sim;
  sim.step(1);
  const tex = s.groundTexture();
  assert.equal(tex.length, sim.GX * sim.GY * 4);
  for (const k of [0, 123, 2000, sim.grass.length - 1]) {
    const c = groundColor(sim.grass[k], sim.fertile[k]).map((v) => Math.max(0, Math.min(255, v)));
    assert.deepEqual([...tex.slice(k * 4, k * 4 + 3)], c.map((v) => Math.trunc(v)));
  }
});

test('every animal is drawn standing on the terrain, its head along its heading', () => {
  const s = site(), sim = s.sim, eye = [0, 0, 0];
  const n = s.animalSpheres(eye);
  assert.equal(n, sim.animals.length * 2);
  sim.animals.forEach((a, i) => {
    const body = s.bodies.subarray(i * 16, i * 16 + 8), head = s.bodies.subarray(i * 16 + 8, i * 16 + 16);
    const ground = s.toPlace(a.x, a.y), r = body[3];
    assert.ok(Math.abs(body[0] - ground[0]) < 1e-5 && Math.abs(body[2] - ground[2]) < 1e-5);
    assert.ok(body[1] - r < ground[1] + 1e-6 && body[1] > ground[1], 'rests on the ground');
    const dir = v3.norm([head[0] - body[0], 0, head[2] - body[2]]);
    assert.ok(Math.abs(dir[0] - Math.cos(a.heading)) < 1e-4 && Math.abs(dir[2] - Math.sin(a.heading)) < 1e-4);
    const [cr, cg, cb] = hexColor(animalColor(a, 'species'));
    assert.ok(Math.abs(body[4] - cr) < 1e-6 && Math.abs(body[5] - cg) < 1e-6 && Math.abs(body[6] - cb) < 1e-6);
  });
  // Colour modes follow the 2D app.
  sim.setParam('colorBy', 'energy');
  s.animalSpheres(eye);
  const [r, g, b] = hexColor(animalColor(sim.animals[0], 'energy'));
  assert.ok(Math.abs(s.bodies[4] - r) < 1e-6 && Math.abs(s.bodies[5] - g) < 1e-6 && Math.abs(s.bodies[6] - b) < 1e-6);
});

test('a ray hits the terrain at the module point, also over hills, and misses report outside', () => {
  const s = site('islands');
  for (const [mx, my] of [[205, 155], [600, 120], [12, 480], [400, 380]]) {
    const p = s.toPlace(mx, my);
    for (const from of [[0, 6, 0.01], [3, 4, 5], [-6, 2, -3]]) {
      const eye = v3.add(p, from);
      const h = s.hit({ o: eye, d: v3.norm(v3.sub(p, eye)) });
      assert.ok(h && h.inside, `hit ${mx},${my}`);
      assert.ok(Math.abs(h.x - mx) < 1e-6 && Math.abs(h.y - my) < 1e-6, `${h.x},${h.y} vs ${mx},${my}`);
      assert.ok(h.normal[1] > 0.5);
    }
  }
  const away = s.hit({ o: v3.add(s.center, [s.width * 2, 3, 0]), d: v3.norm([1, -1, 0]) });
  assert.ok(away && !away.inside);
  assert.equal(s.hit({ o: v3.add(s.center, [0, 3, 0]), d: [0, 1, 0] }), null);
});

test('hsl colours convert like CSS', () => {
  assert.deepEqual(hslToRgb(0, 1, 0.5), [1, 0, 0]);
  assert.deepEqual(hslToRgb(120, 1, 0.5).map((v) => Math.round(v * 255)), [0, 255, 0]);
  assert.deepEqual(hslToRgb(240, 1, 0.5).map((v) => Math.round(v * 255)), [0, 0, 255]);
  assert.deepEqual(hexColor('hsl(60, 100%, 50%)', 0.5), [1, 1, 0, 0.5]);
});

test('the 2D Ecosystem draws with the same colours as before the shared helpers', () => {
  const sim = new EcosystemSim();
  assert.deepEqual(groundColor(0.5, 1), [45, 105, 30]);
  assert.equal(animalColor(sim.animals[0], 'species'), '#f4f0dc');
});
