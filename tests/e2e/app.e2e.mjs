// Browser end-to-end tests. Requires Playwright: `npm i -D playwright && npx playwright install chromium`.
// Run with: npm run test:e2e
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const PORT = 8000 + Math.floor(Math.random() * 900);
const BASE = `http://localhost:${PORT}/`;
const SIMS = ['gravity', 'stars', 'atom', 'atoms', 'mechanics', 'weather', 'climate', 'cell', 'ecosystem', 'epidemic'];

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

async function openPage(hash) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE + hash);
  await page.waitForFunction(() => window.app?.sim);
  return { page, errors };
}

async function center(page) {
  const box = await page.locator('#world').boundingBox();
  return [box.x + box.width / 2, box.y + box.height / 2];
}

for (const id of SIMS) {
  test(`${id}: every tool works without console errors`, async () => {
    const { page, errors } = await openPage(`#${id}`);
    await page.waitForTimeout(800);
    const [cx, cy] = await center(page);
    for (const key of ['3', '6', '5', '4', '2', '1']) {
      await page.keyboard.press(key);
      await page.mouse.move(cx + 30, cy + 20);
      await page.mouse.down();
      await page.mouse.move(cx + 80, cy - 10, { steps: 4 });
      await page.mouse.up();
    }
    await page.waitForTimeout(300);
    assert.deepEqual(errors, []);
    await page.close();
  });
}

test('undo and redo an added object', async () => {
  const { page } = await openPage('#gravity/empty');
  await page.click('#play'); // pause
  const count = () => page.evaluate(() => window.app.sim.bodies.length);
  const [cx, cy] = await center(page);
  await page.keyboard.press('3');
  await page.selectOption('#kind-select', 'star');
  await page.mouse.click(cx, cy);
  assert.equal(await count(), 1);
  await page.keyboard.press('Control+z');
  assert.equal(await count(), 0);
  await page.keyboard.press('Control+Shift+z');
  assert.equal(await count(), 1);
  await page.close();
});

test('save to a file and load it back', async () => {
  const { page } = await openPage('#atoms/salt');
  await page.click('#play');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#save')]);
  const saved = JSON.parse(await readFile(await dl.path(), 'utf8'));
  assert.equal(saved.sim, 'atoms');
  const n = saved.state.atoms.length;
  await page.goto(`${BASE}#gravity/solar`);
  await page.waitForFunction(() => window.app.sim.meta.id === 'gravity');
  await page.setInputFiles('#load-file', { name: 'w.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await page.waitForFunction(() => window.app.sim.meta.id === 'atoms');
  assert.equal(await page.evaluate(() => window.app.sim.atoms.length), n);
  assert.match(await page.locator('#status').textContent(), /Loaded/);
  await page.close();
});

test('shared links restore parameters', async () => {
  const { page } = await openPage('#gravity/solar?gScale=2.5&trails=false');
  const p = await page.evaluate(() => window.app.sim.params);
  assert.equal(p.gScale, 2.5);
  assert.equal(p.trails, false);
  await page.close();
});

test('statistics export as CSV', async () => {
  const { page } = await openPage('#epidemic/town');
  await page.waitForTimeout(1500);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#csv')]);
  const csv = await readFile(await dl.path(), 'utf8');
  const lines = csv.trim().split('\n');
  assert.match(lines[0], /^Time \(days\),Susceptible/);
  assert.ok(lines.length > 3);
  await page.close();
});

test('model & assumptions dialog describes the current simulation', async () => {
  const { page, errors } = await openPage('#climate');
  await page.click('#model-btn');
  assert.ok(await page.locator('#model-dialog').evaluate((d) => d.open));
  assert.match(await page.locator('#model-title').textContent(), /Global Climate/);
  assert.ok(await page.locator('#model-body li').count() >= 6);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#model-dialog').evaluate((d) => d.open), false);
  assert.deepEqual(errors, []);
  await page.close();
});
