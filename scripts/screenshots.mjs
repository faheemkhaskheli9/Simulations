// Regenerates the User Guide screenshots in docs/images/ by driving the real app
// in Chromium. Requires Playwright:
//   npm install --no-save playwright && npx playwright install chromium
//   npm run docs:screenshots            (or: node scripts/screenshots.mjs [name ...])
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const outDir = fileURLToPath(new URL('../docs/images/', import.meta.url));
const PORT = 8700 + Math.floor(Math.random() * 200);
const BASE = `http://localhost:${PORT}/`;
const only = new Set(process.argv.slice(2));

mkdirSync(outDir, { recursive: true });
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: root, stdio: 'pipe' });
await new Promise((res) => server.stdout.once('data', res));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];

async function newPage(viewport = { width: 1280, height: 800 }) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => errors.push(String(e)));
  return page;
}

async function open(page, hash, wait = 2500) {
  await page.goto(BASE + hash);
  await page.waitForFunction(() => window.app?.sim);
  await page.waitForTimeout(wait);
}

const pause = (page) => page.evaluate(() => window.app.setRunning(false));

/** Open a #world route, skipping the first-visit notice, and let it settle. */
async function openWorld(page, hash, wait = 3000) {
  await page.addInitScript(() => { try { localStorage.setItem('world.welcomed', '1'); } catch { /* ignore */ } });
  await page.goto(BASE + hash);
  await page.waitForFunction(() => window.app?.stage?.world.active);
  await page.waitForTimeout(wait);
}

/** World point → page coordinates of the canvas. */
async function worldToPage(page, x, y) {
  const box = await page.locator('#world').boundingBox();
  const [sx, sy] = await page.evaluate(([wx, wy]) => window.app.view.toScreen(wx, wy), [x, y]);
  return [box.x + sx, box.y + sy];
}

async function canvasPoint(page, fx, fy) {
  const box = await page.locator('#world').boundingBox();
  return [box.x + box.width * fx, box.y + box.height * fy];
}

/** Draw numbered callouts around elements: [{ sel, n, label }]. */
function annotate(page, marks) {
  return page.evaluate((list) => {
    for (const { sel, n, label } of list) {
      const target = document.querySelector(sel);
      if (!target) continue;
      const r = target.getBoundingClientRect();
      const box = Object.assign(document.createElement('div'), { className: 'doc-mark' });
      Object.assign(box.style, {
        position: 'fixed', left: `${r.left + 2}px`, top: `${r.top + 2}px`, width: `${r.width - 4}px`, height: `${r.height - 4}px`,
        border: '2px solid #ffcc33', borderRadius: '6px', pointerEvents: 'none', zIndex: 9999, boxShadow: '0 0 0 2px rgba(0,0,0,0.4)',
      });
      const badge = Object.assign(document.createElement('div'), { textContent: label ? `${n}  ${label}` : String(n) });
      Object.assign(badge.style, {
        position: 'absolute', left: '6px', top: '6px', background: '#ffcc33', color: '#111', font: 'bold 13px system-ui',
        padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap',
      });
      box.append(badge);
      document.body.append(box);
    }
  }, marks);
}

const clearMarks = (page) => page.evaluate(() => document.querySelectorAll('.doc-mark').forEach((m) => m.remove()));

async function save(page, name, clip) {
  await page.screenshot({ path: `${outDir}${name}.jpg`, type: 'jpeg', quality: 82, clip });
  console.log('saved', name);
}

async function clipOf(page, sel, pad = 0) {
  const b = await page.locator(sel).boundingBox();
  return { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + 2 * pad, height: b.height + 2 * pad };
}

const SHOTS = {
  async interface(page) {
    await open(page, '#gravity/solar', 3000);
    await page.evaluate(() => window.app.select(window.app.sim.bodies.find((b) => b.name === 'Earth')));
    await page.waitForTimeout(400);
    await pause(page);
    await annotate(page, [
      { sel: '.topbar', n: 1, label: 'Top bar' },
      { sel: '.panel.left section:nth-of-type(2)', n: 2, label: 'Tools' },
      { sel: '#params', n: 3, label: 'Parameters' },
      { sel: '#world', n: 4, label: 'World' },
      { sel: '#chart', n: 5, label: 'Chart' },
      { sel: '#inspector', n: 6, label: 'Inspector' },
      { sel: '#stats', n: 7, label: 'Statistics' },
    ]);
    await save(page, 'interface');
    await clearMarks(page);
  },

  async welcome(page) {
    await page.goto(BASE);
    await page.waitForSelector('#home-dialog[open]');
    await page.waitForTimeout(4000); // thumbnails render one per frame
    await save(page, 'welcome');
  },

  async topbar(page) {
    await open(page, '#gravity/solar', 800);
    await save(page, 'topbar', await clipOf(page, '.topbar'));
  },

  async 'tool-inspect'(page) {
    await open(page, '#gravity/solar', 2500);
    await pause(page);
    const earth = await page.evaluate(() => { const e = window.app.sim.bodies.find((b) => b.name === 'Earth'); return [e.x, e.y]; });
    await page.keyboard.press('1');
    const [x, y] = await worldToPage(page, ...earth);
    await page.mouse.click(x, y);
    await page.waitForTimeout(500);
    await save(page, 'tool-inspect');
  },

  async 'tool-add'(page) {
    await open(page, '#gravity/lonelyStar', 600);
    await page.keyboard.press('3');
    await page.selectOption('#kind-select', 'planet');
    for (const [fx, fy] of [[0.62, 0.5], [0.5, 0.3], [0.32, 0.62], [0.7, 0.72]]) {
      await page.mouse.click(...await canvasPoint(page, fx, fy));
      await page.waitForTimeout(150);
    }
    await page.selectOption('#kind-select', 'gasGiant');
    await page.mouse.click(...await canvasPoint(page, 0.82, 0.35));
    await page.waitForTimeout(2500);
    await page.mouse.move(...await canvasPoint(page, 0.25, 0.3));
    await page.waitForTimeout(200);
    await save(page, 'tool-add');
  },

  async 'tool-move'(page) {
    await open(page, '#mechanics/cradle', 300);
    await pause(page);
    await page.keyboard.press('2');
    const ball = await page.evaluate(() => { const b = window.app.sim.balls.filter((o) => !o.fixed).at(-1); return [b.x, b.y]; });
    const [x, y] = await worldToPage(page, ...ball);
    await page.mouse.move(x, y);
    await page.mouse.down();
    const [tx, ty] = await worldToPage(page, ball[0] + 2.4, ball[1] - 1.6);
    await page.mouse.move(tx, ty, { steps: 10 });
    await page.waitForTimeout(200);
    await save(page, 'tool-move');
    await page.mouse.up();
  },

  async 'tool-force'(page) {
    await open(page, '#mechanics/billiards', 400);
    await pause(page);
    await page.keyboard.press('5');
    const cue = await page.evaluate(() => { const b = window.app.sim.balls.find((o) => o.label === 'cue') ?? window.app.sim.balls.at(-1); return [b.x, b.y]; });
    const [x, y] = await worldToPage(page, ...cue);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 140, y + 60, { steps: 8 });
    await page.waitForTimeout(150);
    await save(page, 'tool-force');
    await page.mouse.up();
  },

  async 'tool-energy'(page) {
    await open(page, '#atoms/salt', 1500);
    await page.keyboard.press('6');
    await page.locator('#brush').fill('90');
    const [x, y] = await canvasPoint(page, 0.5, 0.5);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(2200);
    await save(page, 'tool-energy');
    await page.mouse.up();
  },

  async 'tool-remove'(page) {
    await open(page, '#cell/hypertonic', 300);
    await pause(page);
    await page.keyboard.press('4');
    await page.locator('#brush').fill('48');
    const [x0, y0] = await canvasPoint(page, 0.22, 0.3);
    const [x1, y1] = await canvasPoint(page, 0.78, 0.7);
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    for (let i = 1; i <= 40; i++) {
      await page.mouse.move(x0 + ((x1 - x0) * i) / 40, y0 + ((y1 - y0) * i) / 40);
      await page.waitForTimeout(70); // the tool removes on a short repeat interval
    }
    await page.mouse.up();
    await page.waitForTimeout(200);
    await save(page, 'tool-remove');
  },

  async share(page) {
    await open(page, '#weather/sunny?sun=1.6&wind=6', 800);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await page.click('#share');
    await page.waitForTimeout(300);
    await save(page, 'share', await clipOf(page, '.topbar'));
  },

  async 'learn-dialog'(page) {
    await open(page, '#climate/preindustrial', 800);
    await page.click('#learn');
    await page.waitForTimeout(400);
    await save(page, 'learn-dialog');
    await page.keyboard.press('Escape');
  },

  async 'lesson-card'(page) {
    await open(page, '#learn/greenhouse', 4000);
    await save(page, 'lesson-card');
  },

  async 'model-dialog'(page) {
    await open(page, '#cell/respiration', 800);
    await page.click('#model-btn');
    await page.waitForTimeout(400);
    await save(page, 'model-dialog');
    await page.keyboard.press('Escape');
  },

  async 'teacher-mode'(page) {
    await open(page, '#climate/preindustrial?co2=560&lock=co2', 1500);
    await save(page, 'teacher-mode', await clipOf(page, '.panel.left'));
  },

  async mobile() {
    const page = await newPage({ width: 390, height: 844 });
    await open(page, '#epidemic/town', 1300);
    await save(page, 'mobile');
    await page.close();
  },

  // ---- one picture per simulation, with something selected in the inspector ----
  async 'sim-gravity'(page) {
    await open(page, '#gravity/galaxyCollision', 3300);
    await save(page, 'sim-gravity');
  },
  async 'sim-stars'(page) {
    await open(page, '#stars/cluster?myrPerSecond=60', 6000);
    await page.mouse.click(...await canvasPoint(page, 0.5, 0.5));
    await page.waitForTimeout(400);
    await save(page, 'sim-stars');
  },
  async 'sim-atom'(page) {
    await open(page, '#atom/hydrogen', 500);
    await page.keyboard.press('6');
    await page.mouse.move(...await canvasPoint(page, 0.5, 0.5));
    await page.mouse.down();
    await page.waitForTimeout(5000);
    await page.mouse.up();
    await page.waitForTimeout(800);
    await save(page, 'sim-atom');
  },
  async 'sim-atoms'(page) {
    await open(page, '#atoms/water', 6000);
    await page.mouse.click(...await canvasPoint(page, 0.5, 0.5));
    await page.waitForTimeout(400);
    await save(page, 'sim-atoms');
  },
  async 'sim-mechanics'(page) {
    await open(page, '#mechanics/bridge', 3500);
    await save(page, 'sim-mechanics');
  },
  async 'sim-weather'(page) {
    await open(page, '#weather/storm', 3200);
    await save(page, 'sim-weather');
  },
  async 'sim-climate'(page) {
    await open(page, '#climate/iceAge', 3000);
    await page.mouse.click(...await worldToPage(page, 0, -0.75));
    await page.waitForTimeout(400);
    await save(page, 'sim-climate');
  },
  async 'sim-cell'(page) {
    await open(page, '#cell/respiration', 6000);
    await save(page, 'sim-cell');
  },
  async 'sim-ecosystem'(page) {
    await open(page, '#ecosystem/balanced?colorBy=speed', 10000);
    await page.mouse.click(...await canvasPoint(page, 0.5, 0.5));
    await page.waitForTimeout(400);
    await save(page, 'sim-ecosystem');
  },
  async 'sim-epidemic'(page) {
    await open(page, '#epidemic/town', 1400);
    await save(page, 'sim-epidemic');
  },

  // ---------- the 3D world ----------
  async 'world-deep'(page) {
    await openWorld(page, '#world', 2500);
    await annotate(page, [
      { sel: '#breadcrumb', n: 1, label: 'Where you are' },
      { sel: '.hud-actions', n: 2, label: 'Atlas, tour, up, home' },
      { sel: '#scalebar', n: 3, label: 'Scale' },
      { sel: '.marker.place', n: 4, label: '' },
      { sel: '#couplings', n: 5, label: 'Connected science' },
    ]);
    await save(page, 'world-deep');
    await clearMarks(page);
  },
  async 'world-solar'(page) {
    await openWorld(page, '#world/planets?view=9.5,0.35,0.42', 4000);
    await save(page, 'world-solar');
  },
  async 'world-earth'(page) {
    await openWorld(page, '#world/climate?view=26000,0.9,0.3', 2500);
    await save(page, 'world-earth');
  },
  async 'world-valley'(page) {
    await openWorld(page, '#world/valley', 4000);
    await save(page, 'world-valley');
  },
  async 'world-tools'(page) {
    await openWorld(page, '#world/ecosystem', 3000);
    await page.keyboard.press('6');
    const box = await page.locator('#world-gl').boundingBox();
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.55);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await save(page, 'world-tools');
    await page.mouse.up();
  },
  async 'world-lab'(page) {
    await openWorld(page, '#world/mechanics?view=24,0.35,0.12', 3000);
    await save(page, 'world-lab');
  },
  async 'world-cell'(page) {
    await openWorld(page, '#world/cell?view=70,0.25,0.15', 4000);
    await save(page, 'world-cell');
  },
  async 'world-atlas'(page) {
    await openWorld(page, '#world/weather', 1500);
    await page.click('#atlas-btn');
    await page.waitForTimeout(300);
    await save(page, 'world-atlas');
  },
  async 'world-tour'(page) {
    await openWorld(page, '#world', 500);
    await page.check('#reduced-motion');
    await page.click('#tour-btn');
    for (let i = 0; i < 4; i++) await page.click('#tour-card button >> text=Next ▶');
    await page.uncheck('#reduced-motion');
    await page.waitForTimeout(3000);
    await save(page, 'world-tour');
  },
  async 'world-couplings'(page) {
    await openWorld(page, '#world/weather', 500);
    for (const n of [0, 1, 3]) await page.check(`#couplings input[type=checkbox] >> nth=${n}`);
    await page.waitForTimeout(3500);
    await save(page, 'world-couplings', await clipOf(page, '.panel.right'));
  },
};

try {
  for (const [name, shoot] of Object.entries(SHOTS)) {
    if (only.size && !only.has(name)) continue;
    const page = await newPage();
    try {
      await shoot(page);
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.kill();
}
if (errors.length) {
  console.error('Errors:\n' + errors.join('\n'));
  process.exitCode = 1;
}
