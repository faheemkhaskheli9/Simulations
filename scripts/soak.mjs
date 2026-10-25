// Long soak of the 3D world (World TRD W-RR-4): with every coupling on, each site
// in turn is the active site for 10 simulated minutes of world time while the rest
// keep running as the scheduler allows. Every simulated minute all statistics,
// saved states and coupling values must be finite and no site may have stopped;
// at the end the world is saved, loaded into a fresh world and must match.
// Sites run in parallel child processes, one per core.
//   npm run soak                         (all sites, 10 minutes each)
//   node scripts/soak.mjs --minutes 1 planets weather
import { spawn } from 'node:child_process';
import { availableParallelism, cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { SIMULATIONS } from '../src/sims/index.js';
import { World } from '../src/world/world.js';
import { COUPLINGS } from '../src/world/couplings.js';

const FRAME = 1 / 30; // a 30 fps frame, the world's slowest normal pace

/** Every number reachable in a plain object graph, with its path. */
function* numbers(value, path = '') {
  if (typeof value === 'number') yield [path, value];
  else if (Array.isArray(value) || ArrayBuffer.isView(value)) for (let i = 0; i < value.length; i++) yield* numbers(value[i], `${path}[${i}]`);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) yield* numbers(v, path ? `${path}.${k}` : k);
}

/** Problems with the world right now, as messages (empty when healthy). */
function check(world) {
  const bad = [];
  for (const site of world.siteList) {
    if (site.error) bad.push(`${site.id} stopped: ${site.error.message ?? site.error}`);
    if (!site.sim) continue;
    for (const s of site.sim.stats()) if (typeof s.value === 'number' && !Number.isFinite(s.value)) bad.push(`${site.id} statistic ${s.key} = ${s.value}`);
    for (const [path, v] of numbers(site.sim.saveState())) if (!Number.isFinite(v)) { bad.push(`${site.id} state ${path} = ${v}`); break; }
  }
  for (const [path, v] of numbers(world.couplings.values)) if (!Number.isFinite(v)) bad.push(`coupling ${path} = ${v}`);
  return bad;
}

/** Soak one site; returns a report. Exported for the short unit-test version. */
export function soakSite(siteId, seconds, { scheduler } = {}) {
  const world = new World(SIMULATIONS, undefined, { scheduler });
  for (const d of COUPLINGS) if (!world.couplings.set(d.id, true)) throw new Error(`coupling ${d.id} refused`);
  const site = world.sites.get(siteId);
  if (!site) throw new Error(`unknown site "${siteId}"`);
  world.setActive(site);
  globalThis.gc?.();
  const heap0 = process.memoryUsage().heapUsed;
  const t0 = performance.now();
  const problems = [];
  const frames = Math.round(seconds / FRAME);
  for (let f = 1; f <= frames && !problems.length; f++) {
    world.assignTiers(new Set(), world.clock);
    world.step(FRAME, 1);
    if (f % 1800 === 0 || f === frames) problems.push(...check(world).map((m) => `t=${world.clock.toFixed(0)} s: ${m}`));
  }
  const ms = performance.now() - t0;

  // Save the whole world and load it into a fresh one: every site must match.
  for (const s of world.siteList) if (s.sim) s.touched = true;
  const data = JSON.parse(JSON.stringify(world.serialize()));
  const copy = new World(SIMULATIONS);
  const { active } = copy.load(data);
  if (active?.id !== siteId) problems.push(`save/load: active site ${active?.id}`);
  if (copy.couplings.enabled.size !== COUPLINGS.length) problems.push('save/load: couplings lost');
  for (const s of world.siteList) {
    if (!s.sim) continue;
    const back = copy.sites.get(s.id).sim;
    if (JSON.stringify(back?.serialize()) !== JSON.stringify(s.sim.serialize())) problems.push(`save/load: ${s.id} differs`);
  }
  globalThis.gc?.();
  return {
    site: siteId,
    simulated: world.clock,
    frames,
    msPerFrame: ms / frames,
    activeSimTime: site.sim.time,
    heapMB: [heap0 / 2 ** 20, process.memoryUsage().heapUsed / 2 ** 20],
    saveKB: JSON.stringify(data).length / 1024,
    problems,
  };
}

async function main() {
  const args = process.argv.slice(2);
  let minutes = 10;
  const i = args.indexOf('--minutes');
  if (i >= 0) minutes = Number(args.splice(i, 2)[1]);
  if (!(minutes > 0)) throw new Error('--minutes must be a positive number');

  if (args[0] === '--child') {
    process.stdout.write(JSON.stringify(soakSite(args[1], minutes * 60)));
    return;
  }

  const ids = args.length ? args : [...new World(SIMULATIONS).sites.keys()];
  const workers = Math.max(1, Math.min(ids.length, availableParallelism?.() ?? cpus().length));
  console.log(`Soak: ${ids.length} sites × ${minutes} simulated minutes, all ${COUPLINGS.length} couplings on, ${workers} in parallel`);
  const script = fileURLToPath(import.meta.url);
  const queue = [...ids], reports = [];
  const run = (id) => new Promise((resolve) => {
    const child = spawn(process.execPath, ['--expose-gc', script, '--child', id, '--minutes', String(minutes)], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', (code) => {
      let r;
      try { r = JSON.parse(out); } catch { r = { site: id, problems: [`exited with code ${code}`] }; }
      reports.push(r);
      const status = r.problems.length ? `FAIL ${r.problems[0]}` : 'ok';
      const detail = r.frames ? ` ${r.frames} frames, ${r.msPerFrame.toFixed(1)} ms/frame, heap ${r.heapMB[0].toFixed(0)}→${r.heapMB[1].toFixed(0)} MB, save ${r.saveKB.toFixed(0)} KB` : '';
      console.log(`  ${id.padEnd(10)} ${status}${detail}`);
      resolve();
    });
  });
  await Promise.all(Array.from({ length: workers }, async () => { while (queue.length) await run(queue.shift()); }));
  const failed = reports.filter((r) => r.problems.length);
  console.log(failed.length ? `${failed.length} of ${reports.length} sites failed` : `All ${reports.length} sites healthy and saved/loaded`);
  process.exitCode = failed.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
