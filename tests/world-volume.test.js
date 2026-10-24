// The native Weather volume (World TRD WFR-24): the slice extruded in depth,
// solid ground from the module's terrain, cloud puffs, rain and snow streaks
// and a sky tinted by the module's time of day and cloud cover.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIMULATIONS } from '../src/sims/index.js';
import { World } from '../src/world/world.js';
import { VolumeSite, skyTint, cloudCover, hash3 } from '../src/world/native/volume.js';
import { hexColor } from '../src/world/engine/colors.js';
import { v3 } from '../src/world/engine/math3d.js';

function site(scenario = 'storm') {
  const world = new World(SIMULATIONS);
  const s = world.sites.get('weather');
  assert.ok(s instanceof VolumeSite, 'the weather is drawn as a native volume');
  s.scenario = scenario;
  s.ensure();
  return s;
}

const pixelSize = (d) => d / 1000;

test('the volume keeps the slice in place and adds depth', () => {
  const s = site(), b = s.sim.bounds();
  assert.equal(s.height, (s.width * b.h) / b.w);
  assert.ok(s.depth > 0 && s.radius > Math.hypot(s.width, s.height) / 2);
  // Module points map to the same place points as the flat slice did.
  for (const [x, y] of [[0, 0], [b.w, b.h], [10, 3]]) {
    const a = s.toPlace(x, y), p = s.placeAt(x, y);
    assert.ok(v3.dist(a, p) < 1e-9, `${a} vs ${p}`);
  }
  // A ray straight at the middle plane hits the module point it aims at.
  const target = s.placeAt(12, 5), o = v3.add(target, [0, 0, 30]);
  const h = s.hit({ o, d: [0, 0, -1] });
  assert.ok(h.inside && Math.abs(h.x - 12) < 1e-6 && Math.abs(h.y - 5) < 1e-6);
});

test('the ground strip follows the terrain and is rebuilt only when it changes', () => {
  const s = site('mountain'), sim = s.sim, cw = (sim.dx / 1000) * s.scale;
  const m = s.groundMesh();
  assert.ok(Math.max(...m.indices) < m.positions.length / 3);
  // The top of column 70 (the mountain's peak) sits at its terrain height.
  const want = s.center[1] - s.height / 2 + sim.terrain[70] * cw, x = -s.width / 2 + 70.5 * cw;
  let found = false;
  for (let k = 0; k < m.positions.length; k += 3) {
    if (Math.abs(m.positions[k] - x) <= cw / 2 + 1e-9 && m.normals[k + 1] === 1) {
      assert.ok(Math.abs(m.positions[k + 1] + s.center[1] - want) < 1e-9);
      found = true;
    }
  }
  assert.ok(found);
  const w = s.wallMesh();
  assert.ok(Math.max(...w.indices) < w.positions.length / 3);
  const v0 = s.ground();
  assert.equal(s.ground(), v0, 'no rebuild without a change');
  sim.add('mountain', 8, 1);
  assert.equal(s.ground(), v0 + 1);
  sim.add('lake', 20, 1);
  assert.equal(s.ground(), v0 + 2);
  const tex = s.landTexture(), i = Math.floor(20 / (sim.dx / 1000));
  assert.ok(tex[i * 4 + 2] > tex[i * 4 + 1], 'lake columns are blue');
});

test('cloudy cells become puffs inside the block; clear air has none', () => {
  const s = site('sunny'), sim = s.sim, eye = [0, 0, 0];
  sim.qc.fill(0);
  assert.equal(s.cloudPoints(eye, pixelSize), 0);
  const i = 40, j = 20;
  sim.qc[j * sim.NX + i] = 1e-3;
  const n = s.cloudPoints(eye, pixelSize);
  assert.equal(n, 3);
  const cw = sim.dx / 1000, lo = s.placeAt(i * cw, j * cw, -s.depth / 2), hi = s.placeAt((i + 1) * cw, (j + 1) * cw, s.depth / 2);
  for (let k = 0; k < n; k++) {
    const p = Array.from(s.puffs.subarray(k * 8, k * 8 + 3));
    for (let q = 0; q < 3; q++) assert.ok(p[q] >= lo[q] - 1e-9 && p[q] <= hi[q] + 1e-9, `puff ${p}`);
    assert.ok(s.puffs[k * 8 + 3] > 0 && s.puffs[k * 8 + 7] > 0);
  }
  // Puffs keep their places from frame to frame.
  const first = Array.from(s.puffs.subarray(0, 24));
  s.cloudPoints(eye, pixelSize);
  assert.deepEqual(Array.from(s.puffs.subarray(0, 24)), first);
  assert.ok(Math.abs(cloudCover(sim) - 1 / sim.NX) < 1e-12);
});

test('rain falls as streaks, and as snow in freezing air', () => {
  const s = site('sunny'), sim = s.sim, eye = [0, 0, 0];
  sim.qr.fill(0);
  let [rain, snow] = s.precipLines(eye, 0);
  assert.equal(rain.length + snow.length, 0);
  sim.qr[5 * sim.NX + 30] = 1e-3; // low and warm
  sim.qr[60 * sim.NX + 30] = 1e-3; // near the top of the slice, far below freezing
  [rain, snow] = s.precipLines(eye, 0.3);
  assert.ok(rain.length > 0 && rain.length % 6 === 0);
  assert.ok(snow.length > 0 && snow.length % 6 === 0);
  for (let k = 0; k < rain.length; k += 6) assert.ok(rain[k + 1] > rain[k + 4], 'streaks run downwards');
  // Streaks move as time passes.
  const later = s.precipLines(eye, 0.6)[0];
  assert.notDeepEqual(Array.from(later), Array.from(rain));
});

test('the sky darkens at night and greys under cloud', () => {
  const s = site('sunny'), sim = s.sim, base = hexColor('#86a9d6');
  sim.qc.fill(0);
  sim.time = 12 * 3600;
  const noon = skyTint(sim, base);
  for (let q = 0; q < 3; q++) assert.ok(Math.abs(noon[q] - base[q]) < 1e-9, 'a clear noon keeps the place sky');
  sim.time = 0;
  const night = skyTint(sim, base);
  assert.ok(night[2] < 0.15 && night[0] < 0.05);
  sim.time = 12 * 3600;
  sim.qc.fill(1e-3);
  const overcast = s.skyTint(base);
  assert.ok(overcast[2] - overcast[0] < base[2] - base[0], 'an overcast sky is less blue');
});

test('hash3 is stable and spread over [0, 1)', () => {
  assert.equal(hash3(1, 2, 3), hash3(1, 2, 3));
  let sum = 0;
  for (let k = 0; k < 1000; k++) {
    const h = hash3(k, k * 7, 3);
    assert.ok(h >= 0 && h < 1);
    sum += h;
  }
  assert.ok(Math.abs(sum / 1000 - 0.5) < 0.05);
});
