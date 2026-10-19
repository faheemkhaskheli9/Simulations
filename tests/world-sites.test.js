// The world layout and the site contract (World TRD W-AR-1, W-AR-6, W-FT-20…25, W-FT-27).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SIMULATIONS } from '../src/sims/index.js';
import { World } from '../src/world/world.js';
import { PLACES, TOUR } from '../src/world/layout.js';
import { SurfaceSite } from '../src/world/site.js';
import { View } from '../src/ui/view.js';
import { ToolSession, TOOLS } from '../src/ui/tools.js';
import { v3 } from '../src/world/engine/math3d.js';
import { FOVY } from '../src/world/engine/camera3d.js';

test('every layout site names a registered module and one of its scenarios; every module appears (W-AR-6)', () => {
  const world = new World(SIMULATIONS);
  const used = new Set();
  for (const site of world.sites.values()) {
    const sim = new site.Sim();
    assert.ok(sim.scenarios.some((s) => s.id === site.scenario), `${site.id}: scenario ${site.scenario}`);
    for (const k of Object.keys(site.spec.params ?? {})) assert.ok(sim.paramDefs.some((d) => d.key === k), `${site.id}: param ${k}`);
    used.add(site.Sim.meta.id);
  }
  for (const S of SIMULATIONS) assert.ok(used.has(S.meta.id), `${S.meta.id} has no site`);
  for (const p of world.tree.all) {
    assert.ok(!p.primary || world.sites.get(p.primary)?.place === p, `${p.id}: primary site lives there`);
    if (p.parent) assert.ok(v3.len(p.position) <= p.parent.extent, `${p.id} lies inside ${p.parent.id}`);
  }
  for (const stop of TOUR) assert.ok(world.sites.has(stop.site), `tour stop ${stop.site}`);
});

test('ids are unique across places and sites', () => {
  const ids = [...PLACES.map((p) => p.id), ...PLACES.flatMap((p) => (p.sites ?? []).map((s) => s.id))];
  assert.equal(new Set(ids).size, ids.length);
  const bad = PLACES.map((p) => (p.id === 'deep' ? { ...p, sites: [...p.sites, { ...p.sites[0] }] } : p));
  assert.throws(() => new World(SIMULATIONS, bad), /not unique/);
});

test('modules do not import anything from the world (W-AR-3)', async () => {
  for (const S of SIMULATIONS) {
    const src = await readFile(new URL(`../src/sims/${S.meta.id}.js`, import.meta.url), 'utf8');
    assert.ok(!/from ['"][^'"]*world\//.test(src), `${S.meta.id} imports world code`);
  }
});

test('sites are created lazily: a new world creates none (W-FT-20)', () => {
  const world = new World(SIMULATIONS);
  assert.ok(world.siteList.every((s) => s.sim === null && s.tier === 'unloaded'));
  const deep = world.tree.root;
  world.assignTiers(new Set(deep.sites), 0);
  for (const s of world.sites.values()) assert.equal(!!s.sim, deep.sites.includes(s), s.id);
});

test('exactly one site is active; tiers follow visibility and unload after a while (W-FT-21, W-FT-22)', () => {
  const world = new World(SIMULATIONS);
  const valley = world.tree.get('valley');
  world.setActive(world.sites.get('weather'));
  world.assignTiers(new Set(valley.sites), 0);
  assert.deepEqual(world.siteList.filter((s) => s.tier === 'active').map((s) => s.id), ['weather']);
  assert.equal(world.sites.get('ecosystem').tier, 'ambient');
  // The ecosystem leaves the view: frozen, then unloaded; a touched site keeps its state.
  const eco = world.sites.get('ecosystem');
  eco.sim.step(0.5);
  eco.touched = true;
  const before = eco.sim.serialize();
  world.assignTiers(new Set(), 10);
  assert.equal(eco.tier, 'frozen');
  world.assignTiers(new Set(), 500);
  assert.equal(eco.tier, 'unloaded');
  assert.equal(eco.sim, null);
  eco.ensure();
  assert.deepEqual(eco.sim.serialize(), before);
});

/** A camera looking straight at a module point on a site, at the distance where one screen pixel equals 1/scale2d module units. */
function lookAt(site, mx, my, scale2d, height) {
  const p = site.toPlace(mx, my);
  const n = site.normal ?? [0, 1, 0];
  const d = height / (2 * Math.tan(FOVY / 2) * site.mpp * scale2d);
  const eye = v3.add(p, v3.scale(n, d));
  return { eye, ray: { o: eye, d: v3.norm(v3.sub(p, eye)) } };
}

test('a ray through a module point hits that point within half a texel (W-FT-23)', () => {
  const world = new World(SIMULATIONS);
  for (const site of world.sites.values()) {
    site.ensure();
    const b = site.sim.bounds();
    for (const [fx, fy] of [[0.2, 0.3], [0.5, 0.5], [0.85, 0.7]]) {
      const mx = b.x + b.w * fx, my = b.y + b.h * fy;
      const target = site.toPlace(mx, my);
      // Look from outside: along the globe's normal, or obliquely onto a flat site.
      const eye = site.spec.type === 'globe' ? v3.add(target, v3.sub(target, site.center))
        : v3.add(target, [site.radius * 0.3, site.radius * 0.8, site.radius * 1.2]);
      const h = site.hit({ o: eye, d: v3.norm(v3.sub(target, eye)) });
      assert.ok(h, `${site.id} missed`);
      const texel = site instanceof SurfaceSite ? 1 / site.view2d.scale : 1e-9 * Math.max(b.w, b.h);
      if (site.spec.type === 'globe') {
        assert.ok(Math.abs(h.y - Math.max(-1, Math.min(1, my))) < 1e-9, `${site.id} latitude`);
      } else {
        assert.ok(Math.abs(h.x - mx) <= texel / 2 && Math.abs(h.y - my) <= texel / 2, `${site.id}: ${h.x},${h.y} vs ${mx},${my}`);
      }
    }
  }
});

/** Record the contract calls a session makes. */
function recorder(sim) {
  const calls = [];
  for (const m of ['pick', 'add', 'removeAt', 'move', 'impulse', 'energy']) {
    const orig = sim[m].bind(sim);
    sim[m] = (...args) => {
      calls.push([m, ...args.map((a) => (typeof a === 'number' ? a : typeof a))]);
      return orig(...args);
    };
  }
  return calls;
}

function session(sim, tool) {
  const host = { sim, tool, selected: null, toolKind: () => sim.spawnKinds[0]?.id, brushPx: () => 40, checkpoint() {}, select(e) { host.selected = e; } };
  return new ToolSession(host);
}

test('each tool makes the same contract calls in the world as in 2D, with the same brush size (W-FT-24, W-FT-25)', () => {
  const world = new World(SIMULATIONS);
  const H = 700;
  for (const site of world.siteList.filter((s) => s instanceof SurfaceSite)) {
    site.ensure();
    const b = site.sim.bounds();
    const view = new View();
    view.yUp = !!site.Sim.meta.yUp;
    view.resize(900, H);
    view.fit(b);
    const a = [b.x + b.w * 0.4, b.y + b.h * 0.45], z = [b.x + b.w * 0.55, b.y + b.h * 0.6];
    for (const { id: tool } of TOOLS) {
      // 2D: screen points through the 2D view.
      const sim2 = site.fresh();
      const calls2 = recorder(sim2);
      const s2 = session(sim2, tool);
      const p2 = (m) => ({ x: m[0], y: m[1], upp: 1 / view.scale });
      s2.down(p2(a), 0); s2.move(p2(z), 100); s2.energy(p2(z), 0.1, 1, 1); s2.up(p2(z));
      // World: rays through the same module points, seen at the same on-screen scale.
      const sim3 = site.fresh();
      const calls3 = recorder(sim3);
      const s3 = session(sim3, tool);
      const at = (m) => {
        const { ray } = lookAt(site, a[0], a[1], view.scale, H);
        const target = site.toPlace(m[0], m[1]);
        const h = site.hit({ o: ray.o, d: v3.norm(v3.sub(target, ray.o)) });
        const pxPlace = (2 * h.t * Math.tan(FOVY / 2)) / H;
        return { x: h.x, y: h.y, upp: pxPlace * h.mpp };
      };
      s3.down(at(a), 0); s3.move(at(z), 100); s3.energy(at(z), 0.1, 1, 1); s3.up(at(z));
      assert.equal(calls3.length, calls2.length, `${site.id}/${tool}: number of calls`);
      calls2.forEach((c, i) => {
        assert.equal(calls3[i][0], c[0], `${site.id}/${tool}: call ${i}`);
        c.slice(1).forEach((v, k) => {
          const w = calls3[i][k + 1];
          if (typeof v === 'number') assert.ok(Math.abs(w - v) <= 0.1 * Math.abs(v) + 1e-6 * Math.max(b.w, b.h), `${site.id}/${tool} ${c[0]} arg ${k}: ${w} vs ${v}`);
          else assert.equal(w, v);
        });
      });
    }
  }
});

test('stale selections are reported gone by the module (W-FT-27)', () => {
  const world = new World(SIMULATIONS);
  const site = world.sites.get('planets');
  const sim = site.ensure();
  const body = sim.bodies.find((b) => b.name === 'Mars');
  assert.ok(sim.locate(body));
  sim.remove(body);
  assert.equal(sim.locate(body), null);
});

test('a site with no couplings evolves exactly like the 2D module (W-FT-60, W-AR-1)', () => {
  const world = new World(SIMULATIONS);
  for (const site of world.siteList.filter((s) => !s.spec.params)) {
    const sim3 = site.ensure();
    const sim2 = new site.Sim();
    sim2.loadScenario(site.scenario);
    for (let i = 0; i < 10; i++) {
      world.scheduler.run(site, 1 / 60);
      sim2.step(1 / 60);
    }
    // Every statistic is identical. (Saves differ only in object ids, which come from
    // module-wide counters and so differ between any two instances.)
    assert.deepEqual(sim3.stats(), sim2.stats(), site.id);
    assert.equal(sim3.time, sim2.time);
    assert.equal(sim3.rng.state, sim2.rng.state, site.id);
  }
});

test('world code: offline-cached, within its size budget, GL only in the engine (W-TC-2, W-TC-6, W-TC-8)', async () => {
  const { readdir, stat } = await import('node:fs/promises');
  const walk = async (dir) => (await Promise.all((await readdir(new URL(dir, import.meta.url), { withFileTypes: true }))
    .map((d) => (d.isDirectory() ? walk(`${dir}${d.name}/`) : [`${dir}${d.name}`])))).flat();
  const files = (await walk('../src/world/')).filter((f) => f.endsWith('.js'));
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  let bytes = 0;
  for (const f of files) {
    const rel = f.replace('../', '');
    assert.ok(sw.includes(`'${rel}'`), `${rel} is missing from the service worker's WORLD list`);
    bytes += (await stat(new URL(f, import.meta.url))).size;
    if (!rel.startsWith('src/world/engine/')) {
      const src = await readFile(new URL(f, import.meta.url), 'utf8');
      assert.ok(!/getContext\(['"]webgl|\bgl\.(draw|create|bind|tex)/.test(src), `${rel} calls WebGL directly`);
    }
  }
  assert.ok(bytes <= 250 * 1024, `world code is ${bytes} bytes`);
});
