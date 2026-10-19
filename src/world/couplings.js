// Connected science (System Design §8): couplings pass slow, smoothed quantities
// between sites through the existing contract only. They read a source's public
// state or stats and write one declared parameter of the target with setParam
// (W-AR-8). They are off by default (W-FT-60/WFR-44).
import { dailyInsolation } from '../sims/climate.js';
import { clamp } from '../core/math.js';

const S0 = 1361; // W/m² at 1 AU
const DEG = Math.PI / 180;

/** Annual-mean daily insolation at a latitude for a solar constant S (W/m²). */
export function annualInsolation(latDeg, S = S0, obliquityDeg = 23.44) {
  let sum = 0;
  for (let k = 0; k < 96; k++) sum += dailyInsolation(S, Math.sin(latDeg * DEG), obliquityDeg * DEG * Math.sin((2 * Math.PI * (k + 0.5)) / 96));
  return sum / 96;
}

/** Climate band temperature and sunlight at a latitude, read from the model's state. */
function climateAt(sim, latDeg) {
  const n = sim.T.length, s = Math.sin(latDeg * DEG);
  const i = Math.min(n - 1, Math.max(0, Math.floor(((s + 1) / 2) * n)));
  return { T: sim.T[i], sun: sim.insolation(i) };
}

export const COUPLINGS = [
  {
    id: 'orbit-climate', label: "Earth's orbit → Climate", from: 'planets', to: 'climate', param: 'solar', unit: 'W/m²', smoothing: 2,
    explain: "Sunlight reaching the Earth falls with the square of its distance from the Sun, so the climate's solar constant follows the Earth in the Solar System (1361 W/m² at 1 AU). Drag the Earth outwards and the planet freezes.",
    read(sim) {
      const e = sim.bodies.find((b) => b.name === 'Earth'), s = sim.bodies.find((b) => b.name === 'Sun');
      if (!e || !s) return null;
      const r2 = (e.x - s.x) ** 2 + (e.y - s.y) ** 2;
      return r2 > 0 ? S0 / r2 : null;
    },
  },
  {
    id: 'climate-weather', label: 'Climate → Weather', from: 'climate', to: 'weather', param: 'sun', unit: '× today', smoothing: 2,
    explain: "The valley's solar heating follows the climate model's sunlight at its latitude: strong in summer, weak in winter, and weaker still if the Sun dims.",
    read(sim, memo, ctx) {
      memo.ref ??= annualInsolation(ctx.lat);
      return climateAt(sim, ctx.lat).sun / memo.ref;
    },
  },
  {
    id: 'climate-ecosystem', label: 'Climate → Ecosystem', from: 'climate', to: 'ecosystem', param: 'temperature', unit: '°C', smoothing: 3,
    explain: "The savanna's temperature is the climate model's surface temperature at the valley's latitude, so seasons and climate change reach the animals.",
    read(sim, memo, ctx) {
      return climateAt(sim, ctx.lat).T;
    },
  },
  {
    id: 'weather-ecosystem', label: 'Weather → Ecosystem', from: 'weather', to: 'ecosystem', param: 'growth', unit: '/s', smoothing: 3,
    explain: 'Rain feeds the grass: plant growth on the savanna rises with the rain that fell in the valley over the last ten seconds.',
    read(sim, memo) {
      return growthFromRain(recentRain(memo, sim.precip));
    },
  },
  {
    id: 'climate-epidemic', label: 'Climate → Epidemic', from: 'climate', to: 'epidemic', param: 'beta', unit: '/contact-day', smoothing: 3,
    explain: 'Many infections spread more easily in winter, when people meet indoors: transmission in the town rises as the sunlight at its latitude falls.',
    read(sim, memo, ctx) {
      memo.ref ??= annualInsolation(ctx.lat);
      return 0.6 * (1 + 0.5 * (1 - climateAt(sim, ctx.lat).sun / memo.ref));
    },
  },
];

const RAIN_WINDOW = 10; // world ticks (seconds)

/** Rain (mm) that fell over the last RAIN_WINDOW ticks, from a running total. */
export function recentRain(memo, total) {
  memo.window ??= [];
  const last = memo.total ?? total;
  memo.total = total;
  memo.window.push(Math.max(0, total - last));
  if (memo.window.length > RAIN_WINDOW) memo.window.shift();
  return memo.window.reduce((a, b) => a + b, 0);
}

/** Plant growth rate from recent rain: rises monotonically and saturates (W-SM-8). */
export const growthFromRain = (mm) => 0.008 + 0.042 * (1 - Math.exp(-mm / 3));

/** True if the directed graph given as [from, to] pairs has a cycle. */
export function hasCycle(edges) {
  const out = new Map();
  for (const [a, b] of edges) (out.get(a) ?? out.set(a, []).get(a)).push(b);
  const state = new Map(); // 1 visiting, 2 done
  const visit = (n) => {
    if (state.get(n) === 1) return true;
    if (state.get(n) === 2) return false;
    state.set(n, 1);
    for (const m of out.get(n) ?? []) if (visit(m)) return true;
    state.set(n, 2);
    return false;
  };
  return [...out.keys()].some(visit);
}

/** The enabled couplings of one world and their smoothed values. */
export class CouplingSet {
  constructor(sites, defs = COUPLINGS) {
    this.sites = sites; // Map id → Site
    this.defs = defs.filter((d) => sites.has(d.from) && sites.has(d.to));
    this.enabled = new Set();
    this.values = {};
    this.memo = {};
  }

  get(id) {
    return this.defs.find((d) => d.id === id);
  }

  /** Enable or disable; refuses (returns false) an unknown id or one that would make a cycle (W-FT-61). */
  set(id, on) {
    const def = this.get(id);
    if (!def) return false;
    if (!on) {
      this.enabled.delete(id);
      delete this.values[id];
      delete this.memo[id];
      return true;
    }
    const edges = [...this.enabled].map((e) => this.get(e)).map((d) => [d.from, d.to]);
    if (hasCycle([...edges, [def.from, def.to]])) return false;
    this.enabled.add(id);
    return true;
  }

  /** Site ids that enabled couplings read from or write to (kept at least ambient). */
  involved() {
    const ids = new Set();
    for (const id of this.enabled) {
      const d = this.get(id);
      ids.add(d.from).add(d.to);
    }
    return ids;
  }

  /** Parameters of a site driven by couplings: { key: label }. */
  driven(siteId) {
    const out = {};
    for (const id of this.enabled) {
      const d = this.get(id);
      if (d.to === siteId) out[d.param] = d.label;
    }
    return out;
  }

  /** One world tick (once per second): read, smooth, clamp and write (W-FT-62). */
  tick() {
    for (const id of this.enabled) {
      const d = this.get(id);
      const src = this.sites.get(d.from).ensure(), dst = this.sites.get(d.to).ensure();
      const memo = (this.memo[id] ??= {});
      const raw = d.read(src, memo, { lat: siteLatitude(this.sites.get(d.to)) });
      if (!Number.isFinite(raw)) continue;
      const prev = this.values[id] ?? raw;
      let v = prev + (raw - prev) * (1 - Math.exp(-1 / d.smoothing));
      const def = dst.paramDefs.find((p) => p.key === d.param);
      if (def?.min !== undefined) v = clamp(v, def.min, def.max);
      if (!Number.isFinite(v)) continue;
      this.values[id] = v;
      dst.setParam(d.param, v);
    }
  }
}

/** Latitude of a site's place, or of the nearest ancestor placed on a globe. */
export function siteLatitude(site) {
  for (let p = site.place; p; p = p.parent) if (p.lat !== null && p.lat !== undefined) return p.lat;
  return 45;
}
