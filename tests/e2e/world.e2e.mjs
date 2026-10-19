// Browser end-to-end tests of the 3D world (World TRD W-MQ-2). Chromium with
// SwiftShader provides WebGL2 headless. Run with: npm run test:e2e
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const PORT = 8000 + Math.floor(Math.random() * 900);
const BASE = `http://localhost:${PORT}/`;
const SITES = ['galaxies', 'nursery', 'planets', 'climate', 'moon', 'weather', 'ecosystem', 'epidemic', 'mechanics', 'cell', 'atoms', 'shells'];

let server, browser;

before(async () => {
  server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: root, stdio: 'pipe' });
  await new Promise((res) => server.stdout.once('data', res));
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
});

after(async () => {
  await browser?.close();
  server?.kill();
});

async function openWorld(hash = '#world', { noWebGL = false, reducedMotion = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 }, acceptDownloads: true, reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  if (noWebGL) {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : orig.call(this, type, ...rest); };
    });
  }
  await page.addInitScript(() => { try { localStorage.setItem('world.welcomed', '1'); } catch { /* ignore */ } });
  await page.goto(BASE + hash);
  if (!noWebGL) await page.waitForFunction(() => window.app?.stage?.world.active);
  return { page, errors };
}

const state = (page) => page.evaluate(() => ({ place: app.stage.camera.place.id, active: app.stage.world.active.id, flying: app.stage.camera.flying }));

async function center(page) {
  const box = await page.locator('#world-gl').boundingBox();
  return [box.x + box.width / 2, box.y + box.height / 2];
}

test('the world opens in deep space and draws something', async () => {
  const { page, errors } = await openWorld();
  await page.waitForTimeout(800);
  assert.equal((await state(page)).place, 'deep');
  assert.match(await page.textContent('#breadcrumb'), /Deep Space/);
  assert.match(await page.textContent('#scalebar'), /ly/);
  const shot = await page.locator('#world-gl').screenshot();
  assert.ok(new Set(shot.subarray(200, 20000)).size > 20, 'the canvas is not blank');
  assert.ok(await page.locator('.marker.place', { hasText: 'Orion Arm' }).isVisible());
  assert.deepEqual(errors, []);
  await page.close();
});

for (const id of SITES) {
  test(`${id}: every tool works on the site without console errors`, async () => {
    const { page, errors } = await openWorld(`#world/${id}`);
    await page.waitForTimeout(600);
    assert.equal((await state(page)).active, id);
    const [cx, cy] = await center(page);
    for (const key of ['3', '6', '5', '4', '2', '1']) {
      await page.keyboard.press(key);
      await page.mouse.move(cx + 10, cy + 10);
      await page.mouse.down();
      await page.mouse.move(cx + 50, cy - 10, { steps: 4 });
      await page.mouse.up();
    }
    await page.waitForTimeout(300);
    assert.deepEqual(errors, []);
    await page.close();
  });
}

test('the Atlas reaches any site with the keyboard, and the flight takes under 4 s (W-UA-1, W-FT-6)', async () => {
  const { page } = await openWorld();
  await page.click('#atlas-btn');
  await page.keyboard.type('savanna ecosystem');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !app.stage.camera.flying, null, { timeout: 4000 });
  assert.deepEqual(await state(page), { place: 'valley', active: 'ecosystem', flying: false });
  assert.match(await page.textContent('#sim-title'), /Ecosystem/);
  await page.close();
});

test('reduced motion jumps instead of flying (W-UA-3)', async () => {
  const { page } = await openWorld('#world', { reducedMotion: true });
  assert.ok(await page.isChecked('#reduced-motion'));
  await page.click('#atlas-btn');
  await page.keyboard.type('cell');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  assert.deepEqual(await state(page), { place: 'microscope', active: 'cell', flying: false });
  await page.close();
});

test('scrolling on markers zooms from deep space down to one atom', async () => {
  const { page } = await openWorld();
  const path = ['Orion Arm', 'Solar System', 'Earth', 'The Valley', 'Science Campus', 'Microscope', 'Sample Chamber', 'Atom'];
  for (const name of path) {
    for (let i = 0; i < 80; i++) {
      const marker = page.locator('.marker.place:visible', { hasText: name });
      if (!(await marker.count())) break;
      await marker.first().dispatchEvent('wheel', { deltaY: -400 });
      await page.waitForTimeout(20);
    }
  }
  await page.waitForTimeout(200);
  assert.deepEqual(await state(page), { place: 'atom', active: 'shells', flying: false });
  assert.match(await page.textContent('#breadcrumb'), /Deep Space.*Earth.*The Valley.*Atom/);
  assert.match(await page.textContent('#scalebar'), /pm/);
  await page.close();
});

test('each site keeps its own undo history (W-FT-85)', async () => {
  const { page } = await openWorld('#world/planets');
  await page.click('#play'); // pause
  const [cx, cy] = await center(page);
  const bodies = () => page.evaluate(() => app.sim.bodies.length);
  const n0 = await bodies();
  await page.keyboard.press('3');
  await page.selectOption('#kind-select', 'planet');
  await page.mouse.click(cx - 220, cy + 160); // empty space, away from the markers
  assert.equal(await bodies(), n0 + 1);
  await page.evaluate(() => app.stage.activate(app.stage.world.sites.get('moon'), { fly: false }));
  assert.ok(await page.isDisabled('#undo'), 'the Moon site has its own (empty) history');
  await page.evaluate(() => app.stage.activate(app.stage.world.sites.get('planets'), { fly: false }));
  assert.ok(!(await page.isDisabled('#undo')));
  await page.keyboard.press('Control+z');
  assert.equal(await bodies(), n0);
  await page.close();
});

test('save the world to a file and load it back (W-FT-80…82)', async () => {
  const { page, errors } = await openWorld('#world/ecosystem');
  await page.evaluate(() => { app.sim.setParam('growth', 0.07); app.stage.touch(); });
  await page.check('#couplings input[type=checkbox] >> nth=2');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#save')]);
  const data = JSON.parse(await readFile(await dl.path(), 'utf8'));
  assert.equal(data.format, 'simulations-world3d');
  assert.ok(data.sites.ecosystem);
  assert.deepEqual(data.couplings, ['climate-ecosystem']);
  // Change things, then load the file.
  await page.evaluate(() => { app.stage.world.couplings.set('climate-ecosystem', false); app.stage.activate(app.stage.world.sites.get('cell'), { fly: false }); });
  await page.setInputFiles('#load-file', { name: 'world.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await page.waitForFunction(() => app.stage.world.active.id === 'ecosystem');
  assert.equal(await page.evaluate(() => app.sim.params.growth), 0.07);
  assert.ok(await page.evaluate(() => app.stage.world.couplings.enabled.has('climate-ecosystem')));
  assert.ok(await page.isChecked('#couplings input[type=checkbox] >> nth=2'));
  assert.deepEqual(errors, []);
  await page.close();
});

test('a share link reproduces the site, changed parameters and camera (W-FT-84)', async () => {
  const { page } = await openWorld('#world/weather');
  await page.waitForTimeout(300);
  await page.evaluate(() => { app.sim.setParam('stability', 7.5); app.stage.camera.orbit(60, 20); });
  await page.click('#share');
  const hash = await page.evaluate(() => location.hash);
  assert.match(hash, /^#world\/deep\/orion\/solar\/earth\/valley\/weather\?/);
  assert.match(hash, /stability=7\.5/);
  assert.match(hash, /view=/);
  const offset = await page.evaluate(() => app.stage.camera.offset);
  const other = await openWorld(hash);
  await other.page.waitForTimeout(300);
  assert.equal((await state(other.page)).active, 'weather');
  assert.equal(await other.page.evaluate(() => app.sim.params.stability), 7.5);
  const offset2 = await other.page.evaluate(() => app.stage.camera.offset);
  offset.forEach((v, i) => assert.ok(Math.abs(v - offset2[i]) < 1e-3 * Math.hypot(...offset)));
  await page.close();
  await other.page.close();
});

test('a parameter driven by a coupling is read-only and says why (W-FT-63)', async () => {
  const { page } = await openWorld('#world/weather');
  await page.check('#couplings input[type=checkbox] >> nth=1'); // Climate → Weather
  await page.waitForTimeout(700);
  const row = page.locator('.param.driven');
  assert.equal(await row.count(), 1);
  assert.match(await row.getAttribute('title'), /Climate → Weather/);
  assert.ok(await row.locator('input').isDisabled());
  await page.uncheck('#couplings input[type=checkbox] >> nth=1');
  await page.waitForTimeout(700);
  assert.equal(await page.locator('.param.driven').count(), 0);
  await page.close();
});

test('Open in 2D carries the site state into the classic view (W-FT-29)', async () => {
  const { page } = await openWorld('#world/planets');
  await page.click('#play');
  const n = await page.evaluate(() => { const s = app.sim; s.addBody(s.makeBody('planet', 3, 3)); app.stage.touch(); return s.bodies.length; });
  await page.click('#world-btn');
  await page.waitForFunction(() => !app.stage && app.sim?.meta.id === 'gravity');
  assert.equal(await page.evaluate(() => location.hash), '#gravity/solar');
  assert.equal(await page.evaluate(() => app.sim.bodies.length), n);
  assert.ok(await page.isVisible('#world'));
  // And back into the world, which kept its state.
  await page.click('#world-btn');
  await page.waitForFunction(() => app.stage?.world.active);
  assert.equal(await page.evaluate(() => app.stage.world.sites.get('planets').sim.bodies.length), n);
  await page.close();
});

test('WebGL context loss is recovered without resetting any simulation (W-FT-7)', async () => {
  const { page, errors } = await openWorld('#world/climate');
  await page.waitForTimeout(400);
  const t0 = await page.evaluate(() => app.sim.time);
  await page.evaluate(() => { window.lose = app.stage.renderer.gl.getExtension('WEBGL_lose_context'); window.lose.loseContext(); });
  await page.waitForTimeout(300);
  assert.ok(await page.evaluate(() => app.stage.renderer.lost));
  await page.evaluate(() => window.lose.restoreContext());
  await page.waitForFunction(() => !app.stage.renderer.lost);
  await page.waitForTimeout(400);
  assert.ok((await page.evaluate(() => app.sim.time)) > t0, 'the simulation kept its state and kept running');
  assert.ok((await page.evaluate(() => app.stage.renderer.drawCalls)) > 0, 'drawing again');
  assert.deepEqual(errors.filter((e) => !/context|WebGL/i.test(e)), []);
  await page.close();
});

test('lessons run in the world and fly to their site (W-FT-86)', async () => {
  const { page } = await openWorld('#world/galaxies');
  await page.click('#learn');
  await page.click('.lesson-item button >> nth=0');
  await page.waitForFunction(() => !app.stage.camera.flying, null, { timeout: 5000 });
  const lesson = await page.evaluate(() => app.lessons.runner.lesson);
  assert.equal(await page.evaluate(() => app.stage.world.active.Sim.meta.id), lesson.sim);
  assert.ok(await page.isVisible('#lesson'));
  await page.close();
});

test('the guided tour visits the sites in order and can be left (WFR-7)', async () => {
  const { page } = await openWorld('#world', { reducedMotion: true });
  await page.keyboard.press('t');
  assert.ok(await page.isVisible('#tour-card'));
  assert.equal((await state(page)).active, 'galaxies');
  await page.click('#tour-card button >> text=Next ▶');
  await page.waitForTimeout(100);
  assert.equal((await state(page)).active, 'nursery');
  await page.keyboard.press('Escape');
  assert.ok(!(await page.isVisible('#tour-card')));
  await page.close();
});

test('without WebGL2 the world is an Atlas whose entries open in 2D (W-RR-1)', async () => {
  const { page, errors } = await openWorld('#world', { noWebGL: true });
  await page.waitForSelector('#atlas-dialog[open]');
  assert.match(await page.textContent('#atlas-body'), /cannot show the 3D world/);
  await page.fill('.atlas-search', 'epidemic');
  await page.click('.atlas-list button >> nth=0');
  await page.waitForFunction(() => app.sim?.meta.id === 'epidemic');
  assert.equal(await page.evaluate(() => location.hash), '#epidemic/town');
  assert.deepEqual(errors, []);
  await page.close();
});
