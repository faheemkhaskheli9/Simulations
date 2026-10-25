// Scheduler, couplings, routes, saves and the climate globe
// (World TRD W-FT-40…43, W-FT-60…64, W-FT-80…84, W-SM-6…8, W-RR-3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIMULATIONS } from '../src/sims/index.js';
import { World, WORLD_FORMAT } from '../src/world/world.js';
import { Scheduler } from '../src/world/scheduler.js';
import { CouplingSet, hasCycle, growthFromRain, recentRain, annualInsolation, COUPLINGS } from '../src/world/couplings.js';
import { parseWorldHash, formatWorldHash, resolveRoute, parseView, sitePath } from '../src/world/routes.js';
import { globeTexture, bandForLatitude, rowLatitude, sunDirection, GLOBE_ROWS, GLOBE_COLS } from '../src/world/native/globe.js';
import { ClimateSim } from '../src/sims/climate.js';
import { soakSite } from '../scripts/soak.mjs';

// ---------- scheduler ----------

function fakeSite(id, costMs, clock, { tier = 'ambient', fail = false } = {}) {
  const site = { id, tier, acc: 0, cost: 0, error: null, steps: [] };
  site.sim = { step(dt) { if (fail) throw new Error('boom'); site.steps.push(dt); clock.t += costMs; } };
  return site;
}

test('the active site steps every frame with dt × speed (W-FT-40)', () => {
  const clock = { t: 0 };
  const s = new Scheduler({ now: () => clock.t });
  const active = fakeSite('a', 1, clock, { tier: 'active' });
  s.step([active], active, 0.02, 2);
  assert.deepEqual(active.steps, [0.04]);
});

test('ambient sites share the remaining budget, round-robin, with capped catch-up (W-FT-41)', () => {
  const clock = { t: 0 };
  const s = new Scheduler({ budgetMs: 10, now: () => clock.t });
  const sites = [fakeSite('x', 6, clock), fakeSite('y', 6, clock), fakeSite('z', 6, clock)];
  for (let f = 0; f < 6; f++) s.step(sites, null, 0.02);
  // At 6 ms each, only one (sometimes two) fit in 10 ms per frame; all get turns.
  for (const site of sites) assert.ok(site.steps.length >= 2, `${site.id} stepped ${site.steps.length}`);
  for (const site of sites) for (const h of site.steps) assert.ok(h <= 4 * 0.02 + 1e-12, 'catch-up is capped at 4 frames');
  const total = sites.reduce((n, x) => n + x.steps.length, 0);
  assert.ok(total <= 6 * 2, `budget respected (${total} steps)`);
});

test('the budget adapts down when frames are slow and recovers (W-FT-42)', () => {
  const s = new Scheduler({ budgetMs: 10, now: () => 0 });
  for (let i = 0; i < 61; i++) s.adapt(30, 1 / 60);
  assert.ok(s.budget < 10);
  const low = s.budget;
  for (let i = 0; i < 600; i++) s.adapt(10, 1 / 60);
  assert.ok(s.budget > low && s.budget <= 10);
});

test('a throwing site is frozen and logged once; others keep running (W-FT-43)', () => {
  const clock = { t: 0 }, logs = [];
  const s = new Scheduler({ now: () => clock.t, log: (...a) => logs.push(a) });
  const bad = fakeSite('bad', 1, clock, { fail: true }), good = fakeSite('good', 1, clock);
  for (let i = 0; i < 3; i++) s.step([bad, good], null, 0.02);
  assert.equal(bad.tier, 'frozen');
  assert.ok(bad.error);
  assert.equal(logs.length, 1);
  assert.ok(good.steps.length >= 2);
});

// ---------- couplings ----------

test('cycle detection', () => {
  assert.equal(hasCycle([['a', 'b'], ['b', 'c']]), false);
  assert.equal(hasCycle([['a', 'b'], ['b', 'c'], ['c', 'a']]), true);
  assert.equal(hasCycle([['a', 'a']]), true);
});

test('couplings are off by default, and a coupling that closes a loop is refused (W-FT-60, W-FT-61)', () => {
  const world = new World(SIMULATIONS);
  assert.equal(world.couplings.enabled.size, 0);
  const sites = new Map([['p', {}], ['q', {}]]);
  const defs = [{ id: 'pq', from: 'p', to: 'q' }, { id: 'qp', from: 'q', to: 'p' }];
  const set = new CouplingSet(sites, defs);
  assert.ok(set.set('pq', true));
  assert.equal(set.set('qp', true), false);
  assert.equal(set.set('nope', true), false);
  assert.ok(set.set('pq', false));
  assert.ok(set.set('qp', true));
});

test('every defined coupling joins existing sites and drives a declared parameter (W-AR-8)', () => {
  const world = new World(SIMULATIONS);
  assert.equal(world.couplings.defs.length, COUPLINGS.length);
  for (const d of COUPLINGS) {
    const target = world.sites.get(d.to).ensure();
    assert.ok(target.paramDefs.some((p) => p.key === d.param), `${d.id}: ${d.param}`);
    assert.ok(world.couplings.set(d.id, true), d.id);
  }
  assert.equal(hasCycle(COUPLINGS.map((d) => [d.from, d.to])), false);
});

test('values are smoothed, clamped to the parameter range and written once per tick (W-FT-62)', () => {
  const src = { value: 0 }, dst = { params: { k: 0 }, paramDefs: [{ key: 'k', min: 0, max: 10 }], setParam(k, v) { this.params[k] = v; } };
  const sites = new Map([['s', { ensure: () => src, place: null }], ['d', { ensure: () => dst, place: null }]]);
  const set = new CouplingSet(sites, [{ id: 'sd', from: 's', to: 'd', param: 'k', smoothing: 2, read: (sim) => sim.value }]);
  set.set('sd', true);
  src.value = 4;
  set.tick();
  assert.equal(dst.params.k, 4); // first value is taken as is
  src.value = 8;
  set.tick();
  assert.ok(dst.params.k > 4 && dst.params.k < 8, 'smoothed');
  src.value = 1e9;
  for (let i = 0; i < 20; i++) set.tick();
  assert.equal(dst.params.k, 10, 'clamped');
  src.value = NaN;
  set.tick();
  assert.equal(dst.params.k, 10, 'non-finite values are ignored (W-RR-3)');
});

test("coupled sites stay at least ambient, and driven parameters are reported (W-FT-64, W-FT-63)", () => {
  const world = new World(SIMULATIONS);
  world.couplings.set('climate-weather', true);
  world.setActive(world.sites.get('cell'));
  world.assignTiers(new Set(), 0);
  assert.equal(world.sites.get('climate').tier, 'ambient');
  assert.equal(world.sites.get('weather').tier, 'ambient');
  assert.equal(world.sites.get('ecosystem').tier, 'unloaded');
  assert.deepEqual(world.couplings.driven('weather'), { sun: 'Climate → Weather' });
});

test("Earth's orbit → Climate: moving the Earth outwards cools the planet", () => {
  const run = (scale) => {
    const world = new World(SIMULATIONS);
    const planets = world.sites.get('planets').ensure();
    const earth = planets.bodies.find((b) => b.name === 'Earth');
    earth.x *= scale;
    earth.y *= scale;
    world.couplings.set('orbit-climate', true);
    const climate = world.sites.get('climate').ensure();
    for (let i = 0; i < 20; i++) world.couplings.tick();
    climate.advance(40);
    return { solar: climate.params.solar, T: climate.globalMean() };
  };
  const near = run(1), far = run(1.08);
  assert.ok(Math.abs(near.solar - 1361) < 15, `solar ${near.solar}`);
  assert.ok(far.solar < near.solar - 150, `solar falls with distance (${far.solar})`);
  assert.ok(far.T < near.T - 5, `${far.T} vs ${near.T}`);
});

test('Weather → Ecosystem: more recent rain means faster plant growth (W-SM-8)', () => {
  let prev = -Infinity;
  for (const mm of [0, 0.5, 1, 2, 5, 10, 40]) {
    const g = growthFromRain(mm);
    assert.ok(g > prev, `${mm} mm`);
    assert.ok(g >= 0 && g <= 0.1);
    prev = g;
  }
  const memo = {};
  recentRain(memo, 0);
  recentRain(memo, 3);
  assert.equal(recentRain(memo, 3), 3);
  for (let i = 0; i < 12; i++) recentRain(memo, 3);
  assert.equal(recentRain(memo, 3), 0, 'old rain leaves the window');
});

test('Climate → Weather follows the seasons at the valley', () => {
  const world = new World(SIMULATIONS);
  world.couplings.set('climate-weather', true);
  const climate = world.sites.get('climate').ensure();
  const weather = world.sites.get('weather').ensure();
  const at = (t) => {
    climate.time = t;
    world.couplings.values = {};
    world.couplings.tick();
    return weather.params.sun;
  };
  const summer = at(0.25), winter = at(0.75);
  assert.ok(summer > 1.2 && winter < 0.8, `${summer} / ${winter}`);
  assert.ok(Math.abs(annualInsolation(0) - 418) < 15);
});

// ---------- routes ----------

test('routes parse and format losslessly (W-FT-84)', () => {
  const hash = formatWorldHash(['deep', 'orion', 'solar', 'earth', 'valley', 'weather'], { params: { stability: 8 }, view: { distance: 30, yaw: 0.6, pitch: 0.4 }, lock: 'all' });
  const r = parseWorldHash(hash);
  assert.deepEqual(r.segments, ['deep', 'orion', 'solar', 'earth', 'valley', 'weather']);
  assert.deepEqual(r.params, { stability: '8' });
  assert.deepEqual(r.view, { distance: 30, yaw: 0.6, pitch: 0.4 });
  assert.equal(r.lock, 'all');
  assert.equal(formatWorldHash(r.segments, { params: r.params, view: r.view, lock: r.lock }), hash);
  assert.deepEqual(parseWorldHash('#world').segments, []);
});

test('routes resolve by their last valid segment; unknown parts are reported', () => {
  const world = new World(SIMULATIONS);
  let r = resolveRoute(world, ['deep', 'orion', 'solar', 'earth', 'valley', 'weather']);
  assert.equal(r.site.id, 'weather');
  r = resolveRoute(world, ['weather']);
  assert.equal(r.place.id, 'valley');
  r = resolveRoute(world, ['earth', 'atlantis']);
  assert.equal(r.place.id, 'earth');
  assert.equal(r.site, null);
  assert.deepEqual(r.unknown, ['atlantis']);
  r = resolveRoute(world, ['nowhere']);
  assert.equal(r.place, world.tree.root);
  assert.deepEqual(sitePath(world.sites.get('cell')), ['deep', 'orion', 'solar', 'earth', 'valley', 'campus', 'microscope', 'cell']);
});

test('view parameters must be finite with a positive distance (W-RR-3)', () => {
  assert.equal(parseView('1,NaN,0'), null);
  assert.equal(parseView('-3,0,0'), null);
  assert.equal(parseView('x'), null);
  assert.ok(parseView('3,0,9').pitch < Math.PI / 2);
});

// ---------- saves ----------

function touchedWorld() {
  const world = new World(SIMULATIONS);
  const eco = world.sites.get('ecosystem');
  eco.ensure().setParam('growth', 0.05);
  eco.touched = true;
  const planets = world.sites.get('planets');
  planets.ensure().step(0.1);
  planets.touched = true;
  world.setActive(eco);
  world.couplings.set('climate-ecosystem', true);
  return world;
}

test('a world save holds the camera, active site, couplings and only the touched sites (W-FT-80)', () => {
  const world = touchedWorld();
  const data = JSON.parse(JSON.stringify(world.serialize({ serialize: () => ({ place: 'valley', target: [0, 0, 0], offset: [0, 1, 2] }) })));
  assert.equal(data.format, WORLD_FORMAT);
  assert.equal(data.active, 'ecosystem');
  assert.deepEqual(data.couplings, ['climate-ecosystem']);
  assert.deepEqual(Object.keys(data.sites).sort(), ['ecosystem', 'planets']);
  assert.equal(data.camera.place, 'valley');
});

test('save → load reproduces the touched sites and their future (W-FT-82)', () => {
  const a = touchedWorld();
  const data = JSON.parse(JSON.stringify(a.serialize()));
  const b = new World(SIMULATIONS);
  const { active } = b.load(data);
  assert.equal(active.id, 'ecosystem');
  assert.ok(b.couplings.enabled.has('climate-ecosystem'));
  for (const id of ['ecosystem', 'planets']) {
    const x = a.sites.get(id).sim, y = b.sites.get(id).sim;
    for (let i = 0; i < 20; i++) { x.step(1 / 30); y.step(1 / 30); }
    assert.deepEqual(y.stats(), x.stats(), id);
  }
});

test('bad world files are rejected and change nothing (W-FT-81, W-SP-3)', () => {
  const world = touchedWorld();
  const good = JSON.parse(JSON.stringify(world.serialize()));
  const before = world.sites.get('ecosystem').sim;
  const bad = [
    null, { format: 'nope' }, { ...good, version: 99 }, { ...good, sites: { atlantis: {} } },
    { ...good, active: 'atlantis' }, { ...good, couplings: ['made-up'] }, { ...good, camera: { place: 'nowhere' } },
    { ...good, sites: { ecosystem: { ...good.sites.ecosystem, sim: 'gravity' } } },
  ];
  for (const data of bad) {
    assert.throws(() => world.load(data), undefined, JSON.stringify(data)?.slice(0, 60));
    assert.equal(world.sites.get('ecosystem').sim, before, 'unchanged');
  }
});

test('a 2D save file opens at its site (W-FT-83)', () => {
  const sim = new ClimateSim();
  sim.loadScenario('snowball');
  const world = new World(SIMULATIONS);
  const site = world.loadSiteSave(JSON.parse(JSON.stringify(sim.serialize())));
  assert.equal(site.id, 'climate');
  assert.ok(site.touched);
  assert.equal(site.sim.scenarioId, 'snowball');
  assert.throws(() => world.loadSiteSave({ format: 'x' }));
});

// ---------- globe ----------

test('globe texture bands sit at their latitudes within 0.5° (W-SM-6)', () => {
  const sim = new ClimateSim();
  sim.loadScenario('iceAge');
  const n = sim.T.length;
  const tex = globeTexture(sim);
  assert.equal(tex.length, GLOBE_ROWS * GLOBE_COLS * 4);
  // Every row shows the band containing its latitude.
  for (let r = 0; r < GLOBE_ROWS; r++) {
    const lat = rowLatitude(r);
    const i = bandForLatitude(n, lat);
    assert.equal(i, sim.bandAt(-Math.sin((lat * Math.PI) / 180)), `row ${r}`);
  }
  // Band edges fall within half a degree of their true latitude.
  for (let k = 1; k < n; k++) {
    const edge = (Math.asin(-1 + (2 * k) / n) * 180) / Math.PI;
    const r = Math.floor(((90 - edge) / 180) * GLOBE_ROWS);
    assert.ok(Math.abs(rowLatitude(r) - edge) <= 0.5, `edge ${k}`);
  }
  // Ice shows white at the poles of an ice age.
  assert.deepEqual([...tex.slice(0, 3)], [235, 242, 252]);
});

test('the globe is lit at the solar declination of the model month (W-SM-6)', () => {
  for (const decl of [-0.4, 0, 0.2, 0.409]) {
    const s = sunDirection([0.6, 0, -0.8], decl);
    assert.ok(Math.abs(Math.asin(s[1]) - decl) < 1e-12);
    assert.ok(Math.abs(Math.hypot(...s) - 1) < 1e-12);
  }
  const sim = new ClimateSim();
  sim.time = 0.25; // June solstice
  assert.ok(Math.abs(sim.declination() - (23.44 * Math.PI) / 180) < 1e-9);
});

test('soak: the whole world with every coupling on stays finite and saves (W-RR-4)', () => {
  const world = new World(SIMULATIONS, undefined, { scheduler: { budgetMs: 1e9 } });
  for (const d of COUPLINGS) assert.ok(world.couplings.set(d.id, true));
  world.setActive(world.sites.get('ecosystem'));
  world.assignTiers(new Set(world.siteList), 0);
  for (let f = 0; f < 90; f++) world.step(1 / 30, 1);
  assert.ok(world.clock > 2.9 && Object.keys(world.couplings.values).length === COUPLINGS.length);
  for (const site of world.siteList) {
    for (const s of site.sim.stats()) if (typeof s.value === 'number') assert.ok(Number.isFinite(s.value), `${site.id}.${s.key}`);
    site.touched = true;
  }
  const data = JSON.parse(JSON.stringify(world.serialize()));
  const copy = new World(SIMULATIONS);
  copy.load(data);
  assert.equal(copy.couplings.enabled.size, COUPLINGS.length);
  assert.equal(Object.keys(data.sites).length, world.sites.size);
});

test('the long soak script passes a short run with every coupling on (W-RR-4)', () => {
  const r = soakSite('weather', 4);
  assert.deepEqual(r.problems, []);
  assert.equal(r.frames, 120);
  assert.ok(r.simulated > 3.9 && r.activeSimTime > 0);
});
