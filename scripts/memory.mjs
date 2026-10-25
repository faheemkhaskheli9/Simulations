// Memory check of the 3D world (World TRD W-PR-7): the guided tour loops for 30
// minutes in Chromium with every coupling on, and the JS heap (after a forced
// garbage collection) must not grow by 10 % or more. The baseline is taken after
// the first full loop, once every site has been created and drawn. Requires
// Playwright (see scripts/screenshots.mjs).
//   npm run soak:memory                  (30 minutes)
//   node scripts/memory.mjs --minutes 5
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TOUR } from '../src/world/layout.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const PORT = 8900 + Math.floor(Math.random() * 90);
const args = process.argv.slice(2);
const i = args.indexOf('--minutes');
const minutes = i >= 0 ? Number(args[i + 1]) : 30;
if (!(minutes > 0)) throw new Error('--minutes must be a positive number');
const SAMPLE_S = 30;
const LIMIT = 0.1;

const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: root, stdio: 'pipe' });
await new Promise((res) => server.stdout.once('data', res));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('world.welcomed', '1'); } catch { /* ignore */ } });
  await page.goto(`http://localhost:${PORT}/#world`);
  await page.waitForFunction(() => window.app?.stage?.world.active);
  const cdp = await page.context().newCDPSession(page);
  const heap = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    return (await cdp.send('Runtime.getHeapUsage')).usedSize / 2 ** 20;
  };

  // Every coupling on, and the tour restarts whenever it reaches the atom.
  // window.__stops counts the stops the tour has flown to.
  await page.evaluate(() => {
    const { world, tour } = app.stage, go = tour.go.bind(tour);
    window.__stops = 0;
    tour.go = (index) => { window.__stops++; go(index); };
    for (const d of world.couplings.defs) world.couplings.set(d.id, true);
    tour.start();
    setInterval(() => { if (!tour.running) tour.start(); }, 500);
  });

  const t0 = Date.now(), samples = [];
  let baseline = null;
  console.log(`Memory: the tour loops for ${minutes} minutes with every coupling on; heap sampled every ${SAMPLE_S} s`);
  while (Date.now() - t0 < minutes * 60e3) {
    await page.waitForTimeout(SAMPLE_S * 1000);
    const mb = await heap();
    const stop = await page.evaluate(() => window.__stops);
    const cpu = await page.evaluate(() => app.stage.frameMs);
    samples.push(mb);
    if (baseline === null && stop > TOUR.length) baseline = mb;
    const min = ((Date.now() - t0) / 60e3).toFixed(1);
    console.log(`  ${min.padStart(5)} min  stop ${String(stop).padStart(3)}  heap ${mb.toFixed(1)} MB${baseline !== null ? `  (${(((mb - baseline) / baseline) * 100).toFixed(1)} % vs baseline)` : ''}  world CPU ${cpu.toFixed(1)} ms/frame`);
  }
  if (baseline === null) throw new Error('the tour did not finish one loop; run for longer');
  const end = [...samples.slice(-3)].sort((a, b) => a - b)[1] ?? samples.at(-1);
  const growth = (end - baseline) / baseline;
  console.log(`Baseline ${baseline.toFixed(1)} MB after the first loop, end ${end.toFixed(1)} MB (median of the last 3): growth ${(growth * 100).toFixed(1)} % (limit ${LIMIT * 100} %)`);
  if (errors.length) console.log(`Page errors:\n  ${errors.join('\n  ')}`);
  process.exitCode = growth < LIMIT && !errors.length ? 0 : 1;
} finally {
  await browser.close();
  server.kill();
}

