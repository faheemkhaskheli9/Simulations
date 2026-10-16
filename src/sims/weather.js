import { Simulation } from '../core/simulation.js';
import { clamp, fmt } from '../core/math.js';
import { decodeInto, encodeTyped } from '../core/serialize.js';

const G = 9.81;
const LV_CP = 2488; // latent heat of vaporisation / specific heat (K per kg/kg)
const P0 = 100000;
const SCALE_H = 8500;

/** Saturation mixing ratio (kg/kg) at temperature T (K) and pressure p (Pa). */
export function qsat(T, p) {
  const es = 611.2 * Math.exp((17.67 * (T - 273.15)) / (T - 29.65));
  return (0.622 * es) / Math.max(p - es, 1);
}

/**
 * Vertical slice of the lower atmosphere (32 km wide, 16 km tall) solved with
 * a stable-fluids scheme: semi-Lagrangian advection + pressure projection,
 * Boussinesq buoyancy, and warm-rain microphysics (vapour ⇄ cloud → rain).
 * The sun heats the ground through a day/night cycle, lakes evaporate, and
 * mountains force air upward, producing cumulus clouds, sea breezes,
 * orographic rain and thunderstorms.
 */
export class WeatherSim extends Simulation {
  static meta = {
    id: 'weather',
    title: 'Weather & Atmosphere',
    category: 'Earth',
    description:
      'A vertical slice of the atmosphere: sunlight heats the ground, warm air rises, water vapour condenses into clouds and rain. Build mountains and lakes, add moisture, push the wind or heat a bubble of air to trigger a storm.',
    yUp: true,
  };

  constructor(opts) {
    super(opts);
    this.NX = 128;
    this.NY = 64;
    this.dx = 250; // metres per cell
    this.timeUnit = 's';
    this.background = '#0b1220';
    const n = this.NX * this.NY;
    for (const f of ['u', 'v', 'th', 'qv', 'qc', 'qr', 'p', 'div', 'tmp', 'tmp2']) this[f] = new Float32Array(n);
    this.terrain = new Int16Array(this.NX);
    this.water = new Uint8Array(this.NX);
    this.defineParams([
      { key: 'stepsPerFrame', label: 'Speed (steps/frame)', type: 'range', min: 1, max: 30, step: 1, value: 5 },
      { key: 'dt', label: 'Time step (s)', type: 'range', min: 1, max: 8, step: 0.5, value: 5 },
      { key: 'sun', label: 'Solar heating', type: 'range', min: 0, max: 3, step: 0.05, value: 1 },
      { key: 'cycle', label: 'Day/night cycle', type: 'checkbox', value: true },
      { key: 'wind', label: 'Background wind (m/s)', type: 'range', min: -20, max: 20, step: 0.5, value: 0 },
      { key: 'stability', label: 'Lapse stability (K/km)', type: 'range', min: 0, max: 8, step: 0.1, value: 3 },
      { key: 'soil', label: 'Soil moisture', type: 'range', min: 0, max: 1, step: 0.05, value: 0.2 },
      { key: 'view', label: 'Display', type: 'select', value: 'clouds', options: [
        { value: 'clouds', label: 'Clouds & rain' },
        { value: 'temperature', label: 'Temperature anomaly' },
        { value: 'humidity', label: 'Relative humidity' },
        { value: 'wind', label: 'Wind speed' },
      ] },
      { key: 'arrows', label: 'Wind arrows', type: 'checkbox', value: false },
    ]);
    this.spawnKinds = [
      { id: 'moisture', label: 'Moist air' },
      { id: 'cloud', label: 'Cloud droplets' },
      { id: 'mountain', label: 'Raise mountain' },
      { id: 'lake', label: 'Lake / sea surface' },
      { id: 'land', label: 'Dry land surface' },
    ];
    this.scenarios = [
      { id: 'sunny', label: 'Sunny day over land (cumulus)' },
      { id: 'seaBreeze', label: 'Coastline sea breeze' },
      { id: 'mountain', label: 'Orographic rain over a mountain' },
      { id: 'storm', label: 'Thunderstorm (humid, unstable)' },
      { id: 'night', label: 'Clear night' },
    ];
    this.energyTool = { label: 'Heat air', negLabel: 'Cool air' };
    this.chartKeys = ['cloudCover', 'updraft'];
    this.image = null;
    this.loadScenario('sunny');
  }

  idx(i, j) {
    return j * this.NX + i;
  }

  z(j) {
    return (j + 0.5) * this.dx;
  }

  /** Environmental potential temperature: troposphere + very stable stratosphere above 11 km. */
  thEnv(j) {
    const km = this.z(j) / 1000;
    return 300 + this.params.stability * km + 14 * Math.max(0, km - 11);
  }

  pressure(j) {
    return P0 * Math.exp(-this.z(j) / SCALE_H);
  }

  temperature(k, j) {
    return this.th[k] * Math.pow(this.pressure(j) / P0, 0.2857);
  }

  solid(i, j) {
    return j < this.terrain[((i % this.NX) + this.NX) % this.NX];
  }

  bounds() {
    return { x: 0, y: 0, w: (this.NX * this.dx) / 1000, h: (this.NY * this.dx) / 1000 };
  }

  loadScenario(id) {
    super.loadScenario(id);
    const P = this.params;
    const { NX, NY } = this;
    this.terrain.fill(1);
    this.water.fill(0);
    let rh0 = 0.6;
    P.wind = 0; P.stability = 3; P.sun = 1; P.soil = 0.2; P.cycle = true;
    this.time = 9 * 3600; // start at 09:00
    this.precip = 0;
    if (id === 'seaBreeze') {
      for (let i = 0; i < NX / 2; i++) this.water[i] = 1;
      this.time = 8 * 3600;
    } else if (id === 'mountain') {
      P.wind = 10; rh0 = 0.85; P.sun = 0.3;
      for (let i = 0; i < NX; i++) this.terrain[i] = 1 + Math.round(16 * Math.exp(-(((i - 70) / 12) ** 2)));
      for (let i = 0; i < 25; i++) this.water[i] = 1;
    } else if (id === 'storm') {
      rh0 = 0.75; P.stability = 2; P.sun = 1.4; P.soil = 0.6;
      this.time = 12 * 3600;
    } else if (id === 'night') {
      rh0 = 0.5;
      this.time = 21 * 3600;
    }
    this.rh0 = rh0;
    this.qvEnv = new Float32Array(NY);
    for (let j = 0; j < NY; j++) {
      const T = this.thEnv(j) * Math.pow(this.pressure(j) / P0, 0.2857);
      this.qvEnv[j] = rh0 * Math.max(0.1, 1 - (0.8 * j) / NY) * qsat(T, this.pressure(j));
      for (let i = 0; i < NX; i++) {
        const k = this.idx(i, j);
        this.th[k] = this.thEnv(j) + (this.rng.next() - 0.5) * 0.1;
        this.qv[k] = this.qvEnv[j];
        this.u[k] = P.wind; this.v[k] = 0;
        this.qc[k] = 0; this.qr[k] = 0; this.p[k] = 0;
      }
    }
    if (id === 'storm') this.energy(16, 1, 3, 1.2); // warm bubble to kick things off
  }

  onParamChange(key) {
    if (key === 'stability') {
      // Keep anomalies but shift the reference profile.
      for (let j = 0; j < this.NY; j++) {
        const T = this.thEnv(j) * Math.pow(this.pressure(j) / P0, 0.2857);
        this.qvEnv[j] = this.rh0 * Math.max(0.1, 1 - (0.8 * j) / this.NY) * qsat(T, this.pressure(j));
      }
    }
  }

  saveState() {
    const st = { rh0: this.rh0, precip: this.precip, qvEnv: encodeTyped(this.qvEnv) };
    for (const f of ['u', 'v', 'th', 'qv', 'qc', 'qr', 'p', 'terrain', 'water']) st[f] = encodeTyped(this[f]);
    return st;
  }

  loadState(st) {
    for (const f of ['u', 'v', 'th', 'qv', 'qc', 'qr', 'p', 'terrain', 'water', 'qvEnv']) decodeInto(this[f], st[f]);
    this.rh0 = st.rh0;
    this.precip = st.precip || 0;
  }

  /** Bilinear sample of field f at fractional cell coords (periodic in x). */
  sample(f, x, y) {
    const { NX, NY } = this;
    y = clamp(y, 0, NY - 1.001);
    const i0 = Math.floor(x), j0 = Math.floor(y);
    const fx = x - i0, fy = y - j0;
    const ia = ((i0 % NX) + NX) % NX, ib = (ia + 1) % NX;
    const r0 = j0 * NX, r1 = (j0 + 1) * NX;
    return (f[r0 + ia] * (1 - fx) + f[r0 + ib] * fx) * (1 - fy) + (f[r1 + ia] * (1 - fx) + f[r1 + ib] * fx) * fy;
  }

  advect(f, dt, fallSpeed = 0) {
    const { NX, NY, u, v, dx } = this;
    const out = this.tmp;
    const s = dt / dx;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i;
      out[k] = this.sample(f, i - u[k] * s, j - (v[k] - fallSpeed) * s);
    }
    f.set(out);
  }

  /** Rebuild the solid-cell mask from the terrain heights. */
  updateMask() {
    const { NX, NY } = this;
    if (!this.mask) this.mask = new Uint8Array(NX * NY);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) this.mask[j * NX + i] = j < this.terrain[i] ? 1 : 0;
  }

  /** Make the velocity field divergence-free (red-black Gauss–Seidel pressure solve). */
  project() {
    const { NX, NY, u, v, p, div } = this;
    this.updateMask();
    const m = this.mask;
    const top = NY - 1;
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const k = j * NX + i;
        if (m[k]) { div[k] = 0; continue; }
        const kr = j * NX + (i === NX - 1 ? 0 : i + 1), kl = j * NX + (i === 0 ? NX - 1 : i - 1);
        const ur = m[kr] ? 0 : u[kr], ul = m[kl] ? 0 : u[kl];
        const vt = j === top ? 0 : v[k + NX];
        const vb = j === 0 || m[k - NX] ? 0 : v[k - NX];
        div[k] = -0.5 * (ur - ul + vt - vb);
      }
    }
    for (let it = 0; it < 16; it++) {
      for (let parity = 0; parity < 2; parity++) {
        for (let j = 0; j < NY; j++) {
          for (let i = (j + parity) & 1; i < NX; i += 2) {
            const k = j * NX + i;
            if (m[k]) { p[k] = 0; continue; }
            const pc = p[k];
            const kr = j * NX + (i === NX - 1 ? 0 : i + 1), kl = j * NX + (i === 0 ? NX - 1 : i - 1);
            const pr = m[kr] ? pc : p[kr];
            const pl = m[kl] ? pc : p[kl];
            const pt = j === top ? pc : p[k + NX];
            const pb = j === 0 || m[k - NX] ? pc : p[k - NX];
            p[k] = pc + 1.7 * ((div[k] + pr + pl + pt + pb) / 4 - pc); // over-relaxed
          }
        }
      }
    }
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const k = j * NX + i;
        if (m[k]) { u[k] = 0; v[k] = 0; continue; }
        const pc = p[k];
        const kr = j * NX + (i === NX - 1 ? 0 : i + 1), kl = j * NX + (i === 0 ? NX - 1 : i - 1);
        const pr = m[kr] ? pc : p[kr];
        const pl = m[kl] ? pc : p[kl];
        const pt = j === top ? pc : p[k + NX];
        const pb = j === 0 || m[k - NX] ? pc : p[k - NX];
        u[k] -= 0.5 * (pr - pl);
        v[k] -= 0.5 * (pt - pb);
        if (j === 0 || j === top) v[k] = 0;
      }
    }
  }

  sunFactor() {
    if (!this.params.cycle) return 1;
    const hour = (this.time / 3600) % 24;
    return Math.sin(((hour - 6) / 12) * Math.PI); // >0 by day, <0 at night
  }

  physics(dt) {
    const { NX, NY, u, v, th, qv, qc, qr } = this;
    const P = this.params;
    // Buoyancy.
    for (let j = 0; j < NY; j++) {
      const te = this.thEnv(j), qe = this.qvEnv[j];
      for (let i = 0; i < NX; i++) {
        const k = j * NX + i;
        const b = G * ((th[k] - te) / te + 0.61 * (qv[k] - qe) - qc[k] - qr[k]);
        v[k] += b * dt;
      }
    }
    // Nudge the row-mean wind toward the background wind; damp near the lid.
    for (let j = 0; j < NY; j++) {
      let m = 0, c = 0;
      for (let i = 0; i < NX; i++) if (!this.solid(i, j)) { m += u[j * NX + i]; c++; }
      const du = c ? ((P.wind - m / c) * dt) / 900 : 0;
      const damp = j > NY - 6 ? 1 - (dt / 300) * (j - (NY - 6)) : 1;
      for (let i = 0; i < NX; i++) {
        const k = j * NX + i;
        u[k] += du;
        v[k] *= damp;
        // Relax temperature anomalies very slowly (radiative cooling).
        th[k] += ((this.thEnv(j) - th[k]) * dt) / 86400;
      }
    }
    // Microphysics: condensation/evaporation, autoconversion, accretion, rain evaporation.
    for (let j = 0; j < NY; j++) {
      const pj = this.pressure(j), ex = Math.pow(pj / P0, 0.2857);
      for (let i = 0; i < NX; i++) {
        const k = j * NX + i;
        if (this.solid(i, j)) continue;
        const T = th[k] * ex;
        const qs = qsat(T, pj);
        if (qv[k] > qs) {
          const d = (qv[k] - qs) * 0.4;
          qv[k] -= d; qc[k] += d; th[k] += (LV_CP * d) / ex;
        } else if (qc[k] > 0) {
          const d = Math.min(qc[k], (qs - qv[k]) * 0.4);
          qv[k] += d; qc[k] -= d; th[k] -= (LV_CP * d) / ex;
        }
        if (qc[k] > 5e-4) {
          const a = Math.min(qc[k], 1e-3 * dt * (qc[k] - 5e-4) + dt * 2.2 * qc[k] * Math.pow(qr[k], 0.875));
          qc[k] -= a; qr[k] += a;
        }
        if (qr[k] > 0 && qv[k] < qs) {
          const e = Math.min(qr[k], (dt * 1e-3 * (qs - qv[k])) / qs * qr[k] * 50);
          qr[k] -= e; qv[k] += e; th[k] -= (LV_CP * e) / ex;
        }
      }
    }
    // Surface: sun heats land (water stays cooler), night cools; evaporation.
    const sun = this.sunFactor() * P.sun;
    let rained = 0;
    for (let i = 0; i < NX; i++) {
      const j = this.terrain[i];
      if (j >= NY) continue;
      const k = j * NX + i;
      const wet = this.water[i];
      const heat = sun > 0 ? sun * (wet ? 3e-4 : 1.2e-3) : sun * (wet ? 5e-5 : 2.5e-4);
      th[k] += heat * dt;
      const T = this.temperature(k, j);
      const qs = qsat(T, this.pressure(j));
      const evap = (wet ? 6e-7 : 6e-7 * P.soil) * Math.max(0, 1 - qv[k] / qs) * (0.3 + Math.max(0, sun));
      qv[k] += evap * dt;
      // Rain that reaches the lowest air cell falls out (kg/m² == mm of water).
      const out = qr[k] * Math.min(1, (5 * dt) / this.dx);
      qr[k] -= out;
      rained += out * this.dx;
    }
    this.precip += rained / NX;
    this.rainRate = (rained / NX / dt) * 3600; // mm/h averaged over the domain
  }

  step() {
    const P = this.params, dt = P.dt;
    for (let s = 0; s < P.stepsPerFrame; s++) {
      this.physics(dt);
      this.advect(this.u, dt);
      this.advect(this.v, dt);
      this.project();
      this.advect(this.th, dt);
      this.advect(this.qv, dt);
      this.advect(this.qc, dt);
      this.advect(this.qr, dt, 5);
      this.time += dt;
    }
  }

  toCell(x, y) {
    return [Math.floor((x * 1000) / this.dx), Math.floor((y * 1000) / this.dx)];
  }

  forRadius(x, y, r, fn) {
    const [ci, cj] = this.toCell(x, y);
    const rc = Math.max(1, (r * 1000) / this.dx);
    for (let dj = -Math.ceil(rc); dj <= rc; dj++) for (let di = -Math.ceil(rc); di <= rc; di++) {
      const j = cj + dj;
      if (j < 0 || j >= this.NY) continue;
      const i = (((ci + di) % this.NX) + this.NX) % this.NX;
      const d2 = (di * di + dj * dj) / (rc * rc);
      if (d2 > 1 || this.solid(i, j)) continue;
      fn(this.idx(i, j), Math.exp(-3 * d2), i, j);
    }
  }

  pick(x, y) {
    const [i, j] = this.toCell(x, y);
    if (i < 0 || i >= this.NX || j < 0 || j >= this.NY) return null;
    return { i, j, alive: true };
  }

  locate(c) {
    return { x: ((c.i + 0.5) * this.dx) / 1000, y: ((c.j + 0.5) * this.dx) / 1000, r: this.dx / 1000 };
  }

  describe(c) {
    const { i, j } = c;
    if (this.solid(i, j)) {
      return { title: `Ground (column ${i})`, fields: [
        { key: 'terrain', label: 'Terrain height (m)', type: 'number', value: this.terrain[i] * this.dx, step: this.dx },
        { key: 'water', label: 'Surface', type: 'select', value: this.water[i] ? 'water' : 'land', options: [{ value: 'land', label: 'Land' }, { value: 'water', label: 'Water' }] },
      ] };
    }
    const k = this.idx(i, j);
    const T = this.temperature(k, j);
    const rh = this.qv[k] / qsat(T, this.pressure(j));
    return {
      title: `Air at ${fmt(this.z(j) / 1000)} km`,
      fields: [
        { key: 'tempC', label: 'Temperature (°C)', type: 'number', value: T - 273.15, step: 0.5 },
        { key: 'rh', label: 'Relative humidity (%)', type: 'number', value: rh * 100, step: 1 },
        { key: 'u', label: 'Wind u (m/s)', type: 'number', value: this.u[k], step: 0.5 },
        { key: 'v', label: 'Updraft w (m/s)', type: 'number', value: this.v[k], step: 0.5 },
        { key: 'qc', label: 'Cloud water (g/kg)', type: 'readonly', value: fmt(this.qc[k] * 1000) },
        { key: 'qr', label: 'Rain water (g/kg)', type: 'readonly', value: fmt(this.qr[k] * 1000) },
        { key: 'pressure', label: 'Pressure (hPa)', type: 'readonly', value: Math.round(this.pressure(j) / 100) },
        { key: 'anom', label: 'Buoyancy anomaly (K)', type: 'readonly', value: fmt(this.th[k] - this.thEnv(j)) },
      ],
    };
  }

  setProperty(c, key, value) {
    const { i, j } = c;
    const k = this.idx(i, j);
    if (key === 'terrain') this.terrain[i] = clamp(Math.round(value / this.dx), 0, this.NY - 8);
    else if (key === 'water') this.water[i] = value === 'water' ? 1 : 0;
    else if (key === 'tempC') this.th[k] = (value + 273.15) / Math.pow(this.pressure(j) / P0, 0.2857);
    else if (key === 'rh') this.qv[k] = (clamp(value, 0, 150) / 100) * qsat(this.temperature(k, j), this.pressure(j));
    else if (key === 'u') this.u[k] = value;
    else if (key === 'v') this.v[k] = value;
  }

  add(kind, x, y, r = 1.5) {
    const [ci] = this.toCell(x, y);
    const i = ((ci % this.NX) + this.NX) % this.NX;
    if (kind === 'mountain') {
      for (let d = -10; d <= 10; d++) {
        const ii = (i + d + this.NX) % this.NX;
        const add = Math.round(3 * Math.exp(-((d / 5) ** 2)));
        this.terrain[ii] = Math.min(this.NY - 8, this.terrain[ii] + add);
      }
    } else if (kind === 'lake' || kind === 'land') {
      for (let d = -6; d <= 6; d++) this.water[(i + d + this.NX) % this.NX] = kind === 'lake' ? 1 : 0;
    } else if (kind === 'moisture') {
      this.forRadius(x, y, r, (k, w, ii, jj) => {
        const qs = qsat(this.temperature(k, jj), this.pressure(jj));
        this.qv[k] = Math.max(this.qv[k], this.qv[k] + w * (qs * 1.05 - this.qv[k]));
      });
    } else if (kind === 'cloud') {
      this.forRadius(x, y, r, (k, w) => { this.qc[k] += 1.5e-3 * w; });
    }
    return null;
  }

  removeAt(x, y, r) {
    const [ci, cj] = this.toCell(x, y);
    const i = ((ci % this.NX) + this.NX) % this.NX;
    if (cj <= this.terrain[i] + 1) {
      for (let d = -6; d <= 6; d++) {
        const ii = (i + d + this.NX) % this.NX;
        this.terrain[ii] = Math.max(0, this.terrain[ii] - Math.round(2 * Math.exp(-((d / 3) ** 2))));
      }
    } else {
      this.forRadius(x, y, r, (k, w) => { this.qc[k] *= 1 - w; this.qr[k] *= 1 - w; this.qv[k] *= 1 - 0.5 * w; });
    }
    return null;
  }

  impulse(_, x, y, dx, dy) {
    // A drag of 1 km adds ~5 m/s of wind, falling off over a 2 km radius.
    this.forRadius(x, y, 2, (k, w) => { this.u[k] += dx * 5 * w; this.v[k] += dy * 5 * w; });
  }

  energy(x, y, r, amount) {
    this.forRadius(x, y, r, (k, w) => { this.th[k] += amount * 4 * w; });
  }

  stats() {
    const { NX, NY } = this;
    let cover = 0, maxW = 0, surfT = 0;
    for (let i = 0; i < NX; i++) {
      let cloudy = false;
      for (let j = 0; j < NY; j++) {
        const k = j * NX + i;
        if (this.qc[k] > 1e-4) cloudy = true;
        if (this.v[k] > maxW) maxW = this.v[k];
      }
      if (cloudy) cover++;
      const j = Math.min(this.terrain[i], NY - 1);
      surfT += this.temperature(this.idx(i, j), j) - 273.15;
    }
    return [
      { key: 'clock', label: 'Time of day', value: this.formatClock() },
      { key: 'cloudCover', label: 'Cloud cover (%)', value: (100 * cover) / NX },
      { key: 'updraft', label: 'Strongest updraft (m/s)', value: maxW },
      { key: 'rainRate', label: 'Rain rate (mm/h)', value: this.rainRate || 0 },
      { key: 'precip', label: 'Total rain (mm)', value: this.precip },
      { key: 'surfT', label: 'Mean surface air (°C)', value: surfT / NX },
    ];
  }

  formatClock() {
    const day = Math.floor(this.time / 86400) + 1;
    const h = Math.floor((this.time % 86400) / 3600), m = Math.floor((this.time % 3600) / 60);
    return `Day ${day}, ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  formatTime() {
    return this.formatClock();
  }

  render(ctx, view) {
    const { NX, NY, qc, qr, th, u, v } = this;
    if (!this.image || this.image.width !== NX) {
      this.canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(NX, NY) : Object.assign(document.createElement('canvas'), { width: NX, height: NY });
      this.cctx = this.canvas.getContext('2d');
      this.image = this.cctx.createImageData(NX, NY);
    }
    const d = this.image.data;
    const mode = this.params.view;
    const sun = clamp(this.sunFactor() * 1.5 + 0.3, 0, 1);
    for (let j = 0; j < NY; j++) {
      const row = NY - 1 - j; // image rows go top-down
      const h = j / NY;
      const skyR = (40 + 80 * sun) * (1 - h * 0.5), skyG = (60 + 120 * sun) * (1 - h * 0.4), skyB = 90 + 150 * sun * (1 - h * 0.3);
      const pj = this.pressure(j), ex = Math.pow(pj / P0, 0.2857);
      for (let i = 0; i < NX; i++) {
        const k = j * NX + i, o = (row * NX + i) * 4;
        let r = skyR, g = skyG, b = skyB;
        if (mode === 'clouds') {
          const c = clamp(qc[k] * 1500, 0, 1);
          const shade = 0.55 + 0.45 * sun;
          r += (255 * shade - r) * c; g += (255 * shade - g) * c; b += (255 * shade - b) * c;
          const rr = clamp(qr[k] * 3000, 0, 0.8);
          const snow = th[k] * ex < 273.15;
          r += ((snow ? 240 : 70) - r) * rr; g += ((snow ? 240 : 110) - g) * rr; b += ((snow ? 255 : 200) - b) * rr;
        } else if (mode === 'temperature') {
          const a = clamp((th[k] - this.thEnv(j)) / 4, -1, 1);
          r = a > 0 ? 255 : 255 * (1 + a); g = 255 * (1 - Math.abs(a)); b = a < 0 ? 255 : 255 * (1 - a);
        } else if (mode === 'humidity') {
          const rh = clamp(this.qv[k] / qsat(th[k] * ex, pj), 0, 1.2);
          r = 255 * (1 - rh) * 0.9; g = 140 + 80 * (1 - rh); b = 120 + 135 * rh;
        } else {
          const s = clamp(Math.hypot(u[k], v[k]) / 15, 0, 1);
          r = 255 * s; g = 80 + 120 * (1 - Math.abs(s - 0.5) * 2); b = 255 * (1 - s);
        }
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
      }
    }
    this.cctx.putImageData(this.image, 0, 0);
    const bw = this.bounds();
    const [x0, y0] = view.toScreen(0, bw.h), [x1, y1] = view.toScreen(bw.w, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.canvas, x0, y0, x1 - x0, y1 - y0);
    // Terrain and surface.
    const cw = this.dx / 1000;
    for (let i = 0; i < NX; i++) {
      const [sx, sy] = view.toScreen(i * cw, this.terrain[i] * cw);
      const [ex2, ey] = view.toScreen((i + 1) * cw, 0);
      ctx.fillStyle = this.water[i] ? '#1f5fa8' : this.terrain[i] > 8 ? '#6d6450' : '#3d6b35';
      ctx.fillRect(sx, sy, ex2 - sx + 0.5, ey - sy);
    }
    if (this.params.arrows) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let j = 2; j < NY; j += 4) for (let i = 2; i < NX; i += 4) {
        if (this.solid(i, j)) continue;
        const k = this.idx(i, j);
        const [sx, sy] = view.toScreen((i + 0.5) * cw, (j + 0.5) * cw);
        const sc = 0.6;
        ctx.moveTo(sx, sy); ctx.lineTo(sx + u[k] * sc, sy - v[k] * sc);
      }
      ctx.stroke();
    }
    // Sun / moon indicator.
    const sf = this.sunFactor();
    ctx.fillStyle = sf > 0 ? '#ffe27a' : '#dfe6ff';
    ctx.beginPath(); ctx.arc(x1 - 24, y0 + 24, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '12px system-ui';
    ctx.fillText(this.formatClock(), x1 - 130, y0 + 28);
  }
}
