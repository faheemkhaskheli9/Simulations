// G0 browser smoke: inspector lifecycle, independent rule evaluation and safe imports.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const PORT = 8100 + Math.floor(Math.random() * 700);
let server, browser;

before(async () => {
  server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: root, stdio: 'pipe' });
  await new Promise((resolve) => server.stdout.once('data', resolve));
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
});

after(async () => { await browser?.close(); server?.kill(); });

test('G0 browser inspector switches universes and returns to unchanged science', async () => {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.goto('http://localhost:' + PORT + '/#gravity/solar');
  await page.waitForFunction(() => window.app?.sim?.meta.id === 'gravity');
  await page.click('#play'); // pause science state
  const original = await page.evaluate(() => JSON.stringify(app.sim.serialize()));
  await page.click('#game-btn');
  await page.locator('#game-inspector:not([hidden])').waitFor();
  assert.match(await page.locator('#game-output').textContent(), /-9\.810/);
  await page.selectOption('#game-universe', 'drift');
  await page.waitForFunction(() => location.hash === '#game/drift');
  assert.match(await page.locator('#game-output').textContent(), /1\.620/);
  await page.selectOption('#game-universe', 'flux');
  await page.waitForFunction(() => location.hash === '#game/flux');
  assert.match(await page.locator('#game-output').textContent(), /0\.500×/);
  await page.click('#game-step');
  assert.match(await page.locator('#game-output').textContent(), /Tick: 1/);
  await page.click('#game-science');
  await page.waitForFunction(() => app.gameStage && !app.gameStage.visible);
  assert.equal(await page.evaluate(() => JSON.stringify(app.sim.serialize())), original);
  assert.deepEqual(errors, []);
  await page.close();
});

test('G0 browser rejects invalid game session import without altering current state', async () => {
  const page = await browser.newPage();
  await page.goto('http://localhost:' + PORT + '/#game/drift');
  await page.locator('#game-inspector:not([hidden])').waitFor();
  const before = await page.evaluate(() => JSON.stringify(app.gameStage.session.serialize()));
  await page.setInputFiles('#game-file', {
    name: 'bad.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ format: 'omniverse-session', schemaVersion: 999 })),
  });
  await page.waitForFunction(() => document.querySelector('#game-message').textContent.includes('Could not import'));
  assert.equal(await page.evaluate(() => JSON.stringify(app.gameStage.session.serialize())), before);
  await page.close();
});
