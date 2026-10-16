import { Simulation } from '../core/simulation.js';
import { clamp, fmt } from '../core/math.js';
import { decodeInto, encodeTyped } from '../core/serialize.js';

// Diffusive energy-balance climate model (Budyko–Sellers / North 1981).
// Grid is uniform in x = sin(latitude), so every band has the same area.
const N = 60;
const A_OLR = 202.2; // W/m², outgoing longwave at 0 °C
const B_OLR = 2.09; // W/m²/K, longwave feedback
const HEAT_CAP = 12.7; // W·yr/m²/K, ~100 m ocean mixed layer
const ICE_T = -10; // °C, surface temperature where ice forms

export const SURFACES = {
  ocean: { label: 'Ocean', albedo: 0, color: [40, 90, 160] },
  forest: { label: 'Forest', albedo: -0.04, color: [40, 110, 50] },
  grassland: { label: 'Grassland', albedo: 0.02, color: [120, 150, 60] },
  desert: { label: 'Desert', albedo: 0.1, color: [210, 180, 120] },
  ice: { label: 'Ice sheet', albedo: 0.32, color: [235, 240, 250] },
};

/** CO₂ radiative forcing (W/m²) relative to pre-industrial 280 ppm (Myhre et al. 1998). */
export const co2Forcing = (ppm) => 5.35 * Math.log(ppm / 280);

/** Daily-mean top-of-atmosphere insolation (W/m²) at sin(lat) = x, solar declination δ (rad). */
export function dailyInsolation(S0, x, delta) {
  const phi = Math.asin(clamp(x, -1, 1));
  const t = -Math.tan(phi) * Math.tan(delta);
  const h0 = t >= 1 ? 0 : t <= -1 ? Math.PI : Math.acos(t); // polar night / midnight sun
  return (S0 / Math.PI) * (h0 * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(h0));
}

/**
 * Zonal-mean surface temperature by latitude, driven by sunlight (with seasons
 * and axial tilt), CO₂ greenhouse forcing, poleward heat transport and the
 * ice–albedo feedback, which makes snowball and hothouse states possible.
 */
export class ClimateSim extends Simulation {
  static meta = {
    id: 'climate',
    title: 'Global Climate',
    category: 'Earth',
    description:
      'An energy-balance model of Earth: sunlight, greenhouse gases, ice–albedo feedback and heat transport set the temperature of every latitude. Change CO₂, the Sun or the tilt of the axis, paint deserts, forests or ice, and look for tipping points such as Snowball Earth.',
  };

  constructor(opts) {
    super(opts);
    this.timeUnit = 'yr';
    this.background = '#03060d';
    this.x = new Float64Array(N); // band centres in sin(lat)
    for (let i = 0; i < N; i++) this.x[i] = -1 + (2 * (i + 0.5)) / N;
    this.T = new Float64Array(N);
    this.surface = new Uint8Array(N); // index into SURFACE_KEYS
    this.defineParams([
      { key: 'yearsPerSecond', label: 'Time speed (yr/s)', type: 'range', min: 0.05, max: 50, value: 2, log: true },
      { key: 'co2', label: 'CO₂ (ppm)', type: 'range', min: 100, max: 5000, value: 280, log: true },
      { key: 'solar', label: 'Solar constant (W/m²)', type: 'range', min: 1100, max: 1600, step: 1, value: 1361 },
      { key: 'obliquity', label: 'Axial tilt (°)', type: 'range', min: 0, max: 90, step: 0.5, value: 23.44 },
      { key: 'transport', label: 'Heat transport (W/m²/K)', type: 'range', min: 0, max: 2, step: 0.01, value: 0.43 },
      { key: 'iceAlbedo', label: 'Ice albedo', type: 'range', min: 0.3, max: 0.8, step: 0.01, value: 0.62 },
      { key: 'baseAlbedo', label: 'Ice-free albedo (clouds etc.)', type: 'range', min: 0.15, max: 0.5, step: 0.005, value: 0.3 },
      { key: 'seasons', label: 'Seasonal cycle', type: 'checkbox', value: true },
    ]);
    this.spawnKinds = Object.entries(SURFACES).map(([id, s]) => ({ id, label: `Paint ${s.label.toLowerCase()}` }));
    this.scenarios = [
      { id: 'preindustrial', label: 'Pre-industrial Earth (280 ppm)' },
      { id: 'today', label: 'Today (420 ppm)' },
      { id: 'doubled', label: 'Doubled CO₂ (560 ppm)' },
      { id: 'iceAge', label: 'Ice age (180 ppm)' },
      { id: 'snowball', label: 'Snowball Earth (faint young Sun)' },
      { id: 'hothouse', label: 'Hothouse (1500 ppm)' },
      { id: 'noTilt', label: 'No axial tilt' },
    ];
    this.energyTool = { label: 'Heat region', negLabel: 'Cool region' };
    this.chartKeys = ['globalT', 'iceLine'];
    this.loadScenario('preindustrial');
  }

  static SURFACE_KEYS = Object.keys(SURFACES);

  surfaceOf(i) {
    return ClimateSim.SURFACE_KEYS[this.surface[i]];
  }

  loadScenario(id) {
    super.loadScenario(id);
    const P = this.params;
    Object.assign(P, { co2: 280, solar: 1361, obliquity: 23.44, transport: 0.43, iceAlbedo: 0.62, baseAlbedo: 0.3, seasons: true });
    let T0 = (x) => 30 - 45 * x * x; // warm start
    if (id === 'today') P.co2 = 420;
    else if (id === 'doubled') P.co2 = 560;
    else if (id === 'iceAge') P.co2 = 180;
    else if (id === 'hothouse') P.co2 = 1500;
    else if (id === 'noTilt') P.obliquity = 0;
    else if (id === 'snowball') { P.solar = 1361 * 0.94; T0 = () => -40; }
    // Rough continents: deserts in the subtropics, forests in the mid-latitudes.
    for (let i = 0; i < N; i++) {
      const lat = Math.abs(Math.asin(this.x[i])) * (180 / Math.PI);
      const key = lat > 20 && lat < 32 ? 'desert' : lat > 45 && lat < 62 ? 'forest' : 'ocean';
      this.surface[i] = ClimateSim.SURFACE_KEYS.indexOf(key);
      this.T[i] = T0(this.x[i]);
    }
    // Spin up to a seasonal equilibrium so scenarios open in a meaningful state.
    this.advance(30);
    this.time = 0;
  }

  albedo(i) {
    const P = this.params, T = this.T[i];
    const surf = SURFACES[this.surfaceOf(i)];
    const open = clamp(P.baseAlbedo + surf.albedo, 0.05, 0.9);
    if (surf === SURFACES.ice) return Math.max(open, P.iceAlbedo);
    // Smooth transition into sea ice / snow cover around ICE_T.
    const f = 0.5 * (1 - Math.tanh((T - ICE_T) / 2));
    return open + (P.iceAlbedo - open) * f;
  }

  declination() {
    if (!this.params.seasons) return null;
    return (this.params.obliquity * Math.PI) / 180 * Math.sin(2 * Math.PI * this.time);
  }

  /** Insolation per band: daily mean for the current date, or the annual mean. */
  insolation(i) {
    const P = this.params, x = this.x[i];
    const d = this.declination();
    if (d !== null) return dailyInsolation(P.solar, x, d);
    // Annual mean via numeric average over the year (cached per obliquity/solar).
    const key = `${P.solar}|${P.obliquity}`;
    if (this.annualKey !== key) {
      this.annualKey = key;
      this.annual = new Float64Array(N);
      const eps = (P.obliquity * Math.PI) / 180;
      for (let j = 0; j < N; j++) {
        let s = 0;
        for (let k = 0; k < 96; k++) s += dailyInsolation(P.solar, this.x[j], eps * Math.sin((2 * Math.PI * (k + 0.5)) / 96));
        this.annual[j] = s / 96;
      }
    }
    return this.annual[i];
  }

  advance(years) {
    const P = this.params, T = this.T;
    const dx = 2 / N;
    // Explicit diffusion is stable for dt < C·dx²/(2D); keep a safety margin.
    const dtMax = Math.min(0.01, (0.4 * HEAT_CAP * dx * dx) / Math.max(P.transport, 1e-6));
    const n = Math.max(1, Math.ceil(years / dtMax));
    const dt = years / n;
    const A = A_OLR - co2Forcing(P.co2);
    const flux = new Float64Array(N + 1);
    for (let s = 0; s < n; s++) {
      // Diffusive poleward transport: d/dx[D(1-x²) dT/dx], zero flux at the poles.
      for (let k = 1; k < N; k++) {
        const xe = -1 + (2 * k) / N;
        flux[k] = P.transport * (1 - xe * xe) * (T[k] - T[k - 1]) / dx;
      }
      flux[0] = flux[N] = 0;
      for (let i = 0; i < N; i++) {
        const absorbed = this.insolation(i) * (1 - this.albedo(i));
        const olr = A + B_OLR * T[i];
        T[i] += (dt / HEAT_CAP) * (absorbed - olr + (flux[i + 1] - flux[i]) / dx);
      }
      this.time += dt;
    }
  }

  step(dt) {
    this.advance(dt * this.params.yearsPerSecond);
  }

  globalMean() {
    let s = 0;
    for (let i = 0; i < N; i++) s += this.T[i];
    return s / N; // equal-area bands
  }

  /** Lowest |latitude| (deg) that is ice covered, per hemisphere average; 90 if ice-free. */
  iceLine() {
    let north = 90, south = 90;
    for (let i = 0; i < N; i++) {
      if (this.T[i] > ICE_T && this.surfaceOf(i) !== 'ice') continue;
      const lat = (Math.asin(this.x[i]) * 180) / Math.PI;
      if (lat >= 0) north = Math.min(north, lat); else south = Math.min(south, -lat);
    }
    return (north + south) / 2;
  }

  // ---------- geometry: Earth drawn as a disc, rows = sin(latitude) ----------

  bounds() {
    return { x: -1.25, y: -1.15, w: 4.1, h: 2.3 };
  }

  bandAt(y) {
    const x = -y; // world y points down; north is up
    if (x < -1 || x > 1) return -1;
    return clamp(Math.floor(((x + 1) / 2) * N), 0, N - 1);
  }

  pick(x, y) {
    if (x * x + y * y > 1.05) return null;
    const i = this.bandAt(y);
    return i < 0 ? null : { band: i, alive: true };
  }

  locate(e) {
    return { x: 0, y: -this.x[e.band], r: 0.05 };
  }

  latitudeDeg(i) {
    return (Math.asin(this.x[i]) * 180) / Math.PI;
  }

  describe(e) {
    const i = e.band;
    const lat = this.latitudeDeg(i);
    return {
      title: `Latitude ${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? 'N' : 'S'}`,
      fields: [
        { key: 'T', label: 'Temperature (°C)', type: 'number', value: this.T[i], step: 0.5 },
        { key: 'surface', label: 'Surface', type: 'select', value: this.surfaceOf(i), options: Object.entries(SURFACES).map(([value, s]) => ({ value, label: s.label })) },
        { key: 'albedo', label: 'Albedo (reflectivity)', type: 'readonly', value: fmt(this.albedo(i)) },
        { key: 'sun', label: 'Sunlight today (W/m²)', type: 'readonly', value: Math.round(this.insolation(i)) },
        { key: 'iced', label: 'Frozen', type: 'readonly', value: this.T[i] <= ICE_T ? 'yes' : 'no' },
      ],
    };
  }

  setProperty(e, key, value) {
    if (key === 'T') this.T[e.band] = clamp(value, -100, 100);
    else if (key === 'surface' && SURFACES[value]) this.surface[e.band] = ClimateSim.SURFACE_KEYS.indexOf(value);
  }

  forBands(y, r, fn) {
    for (let i = 0; i < N; i++) if (Math.abs(-this.x[i] - y) <= Math.max(r, 1 / N)) fn(i);
  }

  add(kind, x, y, r = 0.1) {
    const k = ClimateSim.SURFACE_KEYS.indexOf(kind);
    if (k >= 0) this.forBands(y, r, (i) => { this.surface[i] = k; });
    return null;
  }

  removeAt(x, y, r) {
    // Removing a surface type reverts it to open ocean.
    this.forBands(y, r, (i) => { this.surface[i] = 0; });
    return null;
  }

  move() {}

  remove() {}

  impulse(_, x, y, dx, dy) {
    // Drag north/south to push heat that way (an extra ocean current).
    const from = this.bandAt(y), to = this.bandAt(y + dy);
    if (from < 0 || to < 0 || from === to) return;
    const q = Math.min(10, Math.abs(dy) * 20);
    this.T[from] -= q / 2;
    this.T[to] += q / 2;
  }

  energy(x, y, r, amount) {
    this.forBands(y, r, (i) => { this.T[i] += amount * 10; });
  }

  saveState() {
    return { T: encodeTyped(this.T), surface: encodeTyped(this.surface) };
  }

  loadState(st) {
    decodeInto(this.T, st.T);
    for (let i = 0; i < N; i++) if (!Number.isFinite(this.T[i])) this.T[i] = 0;
    decodeInto(this.surface, st.surface);
    for (let i = 0; i < N; i++) if (this.surface[i] >= ClimateSim.SURFACE_KEYS.length) this.surface[i] = 0;
  }

  stats() {
    const T = this.T;
    return [
      { key: 'month', label: 'Month', value: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Math.floor((((this.time % 1) + 1) % 1) * 12 + 2.75) % 12] },
      { key: 'globalT', label: 'Global mean (°C)', value: this.globalMean() },
      { key: 'equatorT', label: 'Equator (°C)', value: (T[N / 2 - 1] + T[N / 2]) / 2 },
      { key: 'northPoleT', label: 'North pole (°C)', value: T[N - 1] },
      { key: 'southPoleT', label: 'South pole (°C)', value: T[0] },
      { key: 'iceLine', label: 'Ice edge latitude (°)', value: this.iceLine() },
      { key: 'forcing', label: 'CO₂ forcing (W/m²)', value: co2Forcing(this.params.co2) },
    ];
  }

  formatTime() {
    return `Year ${Math.floor(this.time) + 1}`;
  }

  tempColor(T) {
    const t = clamp((T + 40) / 75, 0, 1); // -40 °C … +35 °C
    const r = Math.round(255 * clamp(1.5 * t - 0.2, 0, 1));
    const g = Math.round(255 * clamp(1 - Math.abs(t - 0.5) * 2, 0, 1) * 0.9);
    const b = Math.round(255 * clamp(1.2 - 1.6 * t, 0, 1));
    return `rgb(${r},${g},${b})`;
  }

  render(ctx, view) {
    const [cx, cy] = view.toScreen(0, 0);
    const R = view.scale;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    for (let i = 0; i < N; i++) {
      const top = cy - (this.x[i] + 1 / N) * R, h = (2 / N) * R + 0.5;
      const surf = SURFACES[this.surfaceOf(i)];
      const iced = this.T[i] <= ICE_T || surf === SURFACES.ice;
      // Left half: temperature map. Right half: what the surface looks like.
      ctx.fillStyle = this.tempColor(this.T[i]);
      ctx.fillRect(cx - R, top, R, h);
      const [r, g, b] = iced ? [235, 242, 252] : surf.color;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(cx, top, R, h);
    }
    // Night side shading from the sun's declination (seasons).
    const d = this.declination() ?? 0;
    ctx.fillStyle = 'rgba(0,0,10,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx + R * 0.35, cy, R * 0.75, R * 1.2, d, -Math.PI / 2, Math.PI / 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#7fa8ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    // Tilted axis and incoming sunlight.
    const tilt = (this.params.obliquity * Math.PI) / 180 * (this.params.seasons ? Math.sin(2 * Math.PI * this.time) : 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.moveTo(cx - Math.sin(tilt) * R * 1.15, cy - Math.cos(tilt) * R * 1.15);
    ctx.lineTo(cx + Math.sin(tilt) * R * 1.15, cy + Math.cos(tilt) * R * 1.15);
    ctx.stroke();
    ctx.fillStyle = '#ffd76a';
    ctx.font = '12px system-ui';
    ctx.fillText('☀ sunlight →', cx - R - 4, cy - R - 6);
    ctx.fillStyle = 'rgba(220,230,255,0.75)';
    ctx.fillText('temperature', cx - R + 6, cy + R + 16);
    ctx.fillText('surface / ice', cx + 10, cy + R + 16);

    // Temperature vs latitude profile.
    const [px0, py0] = view.toScreen(1.35, -1);
    const [px1, py1] = view.toScreen(2.75, 1);
    ctx.strokeStyle = '#2b3550';
    ctx.strokeRect(px0, py0, px1 - px0, py1 - py0);
    const tx = (T) => px0 + ((clamp(T, -60, 45) + 60) / 105) * (px1 - px0);
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(160,200,255,0.5)';
    ctx.beginPath(); ctx.moveTo(tx(0), py0); ctx.lineTo(tx(0), py1); ctx.stroke();
    ctx.strokeStyle = 'rgba(235,242,252,0.5)';
    ctx.beginPath(); ctx.moveTo(tx(ICE_T), py0); ctx.lineTo(tx(ICE_T), py1); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#ff8a5c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const y = cy - this.x[i] * R;
      if (i === 0) ctx.moveTo(tx(this.T[i]), y); else ctx.lineTo(tx(this.T[i]), y);
    }
    ctx.stroke();
    ctx.fillStyle = '#9aa7c7';
    ctx.font = '11px system-ui';
    ctx.fillText('-60 °C', px0, py1 + 14);
    ctx.fillText('0', tx(0) - 3, py1 + 14);
    ctx.fillText('+45 °C', px1 - 34, py1 + 14);
    ctx.fillText('N pole', px1 + 6, py0 + 10);
    ctx.fillText('Equator', px1 + 6, cy + 4);
    ctx.fillText('S pole', px1 + 6, py1);
  }
}
