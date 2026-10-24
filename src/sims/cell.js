import { Simulation } from '../core/simulation.js';
import { clamp, fmt, TAU } from '../core/math.js';
import { pick } from '../core/serialize.js';

// Molecular species. D = diffusion coefficient (µm²/s, time is accelerated);
// perm = probability of slipping straight through the lipid bilayer;
// via = membrane protein that lets it cross; sigma = osmotic reflection coefficient
// (0 for molecules that cross freely and so exert no lasting osmotic pressure).
export const SPECIES = {
  o2: { label: 'Oxygen (O₂)', D: 6, perm: 0.9, sigma: 0, color: '#7fc8ff', r: 0.22 },
  co2: { label: 'Carbon dioxide (CO₂)', D: 5, perm: 0.9, sigma: 0, color: '#c0c6d2', r: 0.24 },
  // Glucose equilibrates through GLUT transporters, so it exerts no lasting osmotic pressure.
  glucose: { label: 'Glucose', D: 2.5, perm: 0, sigma: 0, via: 'glut', color: '#ffd34d', r: 0.3 },
  na: { label: 'Sodium ion (Na⁺)', D: 4, perm: 0.03, sigma: 1, z: 1, via: 'naChannel', color: '#b06cff', r: 0.22 },
  k: { label: 'Potassium ion (K⁺)', D: 4.5, perm: 0.002, sigma: 1, z: 1, via: 'kChannel', color: '#5ee05e', r: 0.24 },
  urea: { label: 'Urea (permeant)', D: 4, perm: 0.4, sigma: 0, color: '#ff9f6a', r: 0.22 },
  sucrose: { label: 'Sucrose (impermeant)', D: 2, perm: 0, sigma: 1, color: '#ff6aa8', r: 0.3 },
  lactate: { label: 'Lactate', D: 3, perm: 0.05, sigma: 0.8, color: '#e8e8a0', r: 0.24 },
};

export const PROTEINS = {
  pump: { label: 'Na⁺/K⁺ pump (uses ATP)', color: '#ff5c6c' },
  kChannel: { label: 'K⁺ leak channel', color: '#5ee05e' },
  naChannel: { label: 'Na⁺ channel', color: '#b06cff' },
  glut: { label: 'Glucose transporter (GLUT)', color: '#ffd34d' },
};

export const CENTER = [30, 20];
const W = 60, H = 40;
export const R0 = 10;
// Membrane capacitance in model units: each net cation moved changes the voltage by this much.
const MV_PER_ION = 2;

let nextId = 1;

/**
 * A single animal cell. Molecules random-walk (Brownian diffusion); the
 * membrane lets gases through, while ions and sugars need channels or
 * transporters. Water follows solutes (osmosis), so the cell swells or
 * shrinks and can burst. Mitochondria turn glucose and oxygen into ATP,
 * which Na⁺/K⁺ pumps spend to keep the ion gradients. The membrane is a
 * capacitor: its voltage follows the net charge inside, and ions crossing it
 * feel that voltage, so the resting potential is a true pump–leak balance.
 */
export class CellSim extends Simulation {
  static meta = {
    id: 'cell',
    title: 'Cell Biology',
    category: 'Life',
    description:
      'Inside a living cell: diffusion through the membrane, osmosis that swells or shrinks the cell, ion channels and ATP-powered pumps that create the membrane potential, and mitochondria that burn glucose with oxygen. Add molecules and proteins, poison the cell or feed it.',
    model: {
      summary: 'A single animal cell. Each particle stands for many molecules, and time is accelerated.',
      equations: [
        'Brownian motion: Δx ~ N(0, 2D·Δt)',
        'Membrane as a capacitor: V_m = (cations inside − fixed anions)·e / C, starting at the GHK resting value (RT/F)·ln[(P_K[K⁺]_o + P_Na[Na⁺]_o) / (P_K[K⁺]_i + P_Na[Na⁺]_i)], P_K : P_Na = 1 : 0.04',
        'Ion crossing against the voltage succeeds with Boltzmann probability exp(−z·e·V_m / kT)',
        'Osmosis: water flux ∝ Σ σ·(c_in − c_out); volume follows (σ = 0 for solutes that equilibrate: gases, urea, glucose via GLUT)',
        'Respiration: glucose + O₂ → ATP + CO₂;  Na⁺/K⁺ pump: 1 ATP moves 3 Na⁺ out and 2 K⁺ in',
      ],
      assumptions: [
        'Gases cross the lipid bilayer; ions and sugars need channels or transporters. Na⁺ leaks in slowly; the pump only cycles when it has Na⁺ to export.',
        'Fixed negative charges (proteins) inside the cell hold K⁺ in (Donnan effect); one ion of charge shifts the voltage by 2 mV in this model.',
        'The cell bursts when its radius exceeds the membrane-strength limit; there is no cytoskeleton or cell wall.',
        'No cell division, gene expression or enzyme kinetics yet.',
        'Stoichiometry is simplified (real respiration yields ~30 ATP per glucose).',
      ],
      references: [
        'Goldman (1943); Hodgkin & Katz (1949), membrane potential',
        'Alberts et al., Molecular Biology of the Cell',
        'Skou (1957), the Na⁺/K⁺-ATPase',
      ],
    },
  };

  constructor(opts) {
    super(opts);
    this.timeUnit = 's';
    this.background = '#0b0f1a';
    this.membrane = { id: 0, type: 'membrane', alive: true };
    this.defineParams([
      { key: 'speed', label: 'Time speed (×)', type: 'range', min: 0.1, max: 10, value: 1, log: true },
      { key: 'temperature', label: 'Temperature (°C)', type: 'range', min: 0, max: 60, step: 1, value: 37 },
      { key: 'waterPerm', label: 'Water permeability (aquaporins)', type: 'range', min: 0, max: 5, step: 0.05, value: 1 },
      { key: 'pumpRate', label: 'Pump rate (cycles/s per pump)', type: 'range', min: 0, max: 10, step: 0.1, value: 3 },
      { key: 'metabolism', label: 'Basal ATP use (ATP/s)', type: 'range', min: 0, max: 50, step: 1, value: 4 },
      { key: 'strength', label: 'Membrane strength (burst at × radius)', type: 'range', min: 1.1, max: 2, step: 0.05, value: 1.4 },
      { key: 'showProteins', label: 'Show membrane proteins', type: 'checkbox', value: true },
    ]);
    this.spawnKinds = [
      ...Object.entries(SPECIES).map(([id, s]) => ({ id, label: `${s.label} ×10` })),
      ...Object.entries(PROTEINS).map(([id, p]) => ({ id, label: `${p.label} (on membrane)` })),
      { id: 'mito', label: 'Mitochondrion (inside cell)' },
    ];
    this.scenarios = [
      { id: 'respiration', label: 'Cellular respiration' },
      { id: 'diffusion', label: 'Diffusion: gases vs. glucose' },
      { id: 'neuron', label: 'Resting membrane potential' },
      { id: 'hypotonic', label: 'Osmosis: cell in fresh water (bursts)' },
      { id: 'hypertonic', label: 'Osmosis: cell in syrup (shrinks)' },
    ];
    this.energyTool = { label: 'Feed ATP', negLabel: 'Poison (drain ATP)' };
    this.chartKeys = ['atp', 'vm'];
    this.loadScenario('respiration');
  }

  bounds() {
    return { x: 0, y: 0, w: W, h: H };
  }

  // ---------- setup ----------

  makeParticle(sp, x, y) {
    const p = { id: nextId++, sp, x, y, alive: true };
    this.particles.push(p);
    return p;
  }

  scatter(sp, count, where) {
    for (let i = 0; i < count; i++) {
      let x, y;
      for (let k = 0; k < 50; k++) {
        if (where === 'in') {
          const r = this.R * 0.95 * Math.sqrt(this.rng.next()), a = this.rng.range(0, TAU);
          x = CENTER[0] + r * Math.cos(a); y = CENTER[1] + r * Math.sin(a);
        } else {
          x = this.rng.range(0.5, W - 0.5); y = this.rng.range(0.5, H - 0.5);
        }
        if ((where === 'in') === this.isInside(x, y) && !this.inMito(x, y)) break;
      }
      this.makeParticle(sp, x, y);
    }
  }

  addProtein(type, angle) {
    const p = { id: nextId++, type, angle, active: true, alive: true, clock: 0 };
    this.proteins.push(p);
    return p;
  }

  loadScenario(id) {
    super.loadScenario(id);
    this.rng.seed(23);
    this.R = R0;
    this.burst = false;
    this.particles = [];
    this.proteins = [];
    this.mitos = [];
    this.atp = 400;
    this.atpMade = 0;
    const P = this.params;
    P.waterPerm = 1;
    P.metabolism = 4;
    const ring = (type, n, offset = 0) => { for (let i = 0; i < n; i++) this.addProtein(type, offset + (i / n) * TAU); };
    const mitos = (n) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + 0.4, r = 5.5;
        this.mitos.push({ id: nextId++, x: CENTER[0] + r * Math.cos(a), y: CENTER[1] + r * Math.sin(a), angle: a, active: true, alive: true });
      }
    };
    // Resting ion gradients: K⁺ concentrated inside, Na⁺ outside.
    const ions = () => {
      this.scatter('k', 38, 'in'); this.scatter('k', 15, 'out');
      this.scatter('na', 5, 'in'); this.scatter('na', 260, 'out');
    };
    if (id === 'respiration') {
      ions();
      this.scatter('glucose', 60, 'out'); this.scatter('o2', 120, 'out');
      ring('glut', 6); ring('pump', 4, 0.3); ring('kChannel', 4, 0.6); mitos(4);
    } else if (id === 'diffusion') {
      ions(); // normal isotonic fluid, so glucose entering only changes the volume slightly
      this.scatter('o2', 150, 'out'); this.scatter('glucose', 120, 'out'); this.scatter('urea', 80, 'out');
      ring('glut', 3); ring('pump', 4, 0.3); ring('kChannel', 4, 0.6); P.metabolism = 0;
    } else if (id === 'neuron') {
      ions();
      this.scatter('glucose', 40, 'out'); this.scatter('o2', 80, 'out');
      ring('pump', 6, 0.3); ring('kChannel', 8, 0.6); ring('naChannel', 2, 1.1); ring('glut', 4); mitos(3);
      this.atp = 800;
    } else {
      ions();
      ring('pump', 4); ring('kChannel', 4, 0.6);
      P.waterPerm = id === 'hypotonic' ? 1.2 : 0.5;
    }
    this.balanceOsmotically();
    const c0 = this.counts();
    this.fixedCharge = c0.in.k + c0.in.na - this.ghkPotential(c0) / MV_PER_ION;
    // Osmotic challenges are applied after the cell is in balance with normal fluid.
    if (id === 'hypotonic') {
      let keep = 20;
      this.particles = this.particles.filter((p) => this.isInside(p.x, p.y) || (p.sp === 'na' && keep-- > 0));
    } else if (id === 'hypertonic') {
      this.scatter('sucrose', 450, 'out');
    }
  }

  /** Set the impermeant cell contents (proteins, nucleic acids…) so water is at equilibrium. */
  balanceOsmotically() {
    const { aIn, aOut } = this.areas();
    const { nIn, nOut } = this.osmolytes();
    this.contents = Math.max(0, (nOut / aOut) * aIn - nIn);
  }

  /** Osmotically effective particle counts (weighted by reflection coefficient). */
  osmolytes() {
    let nIn = 0, nOut = 0;
    for (const p of this.particles) {
      const w = SPECIES[p.sp].sigma;
      if (this.isInside(p.x, p.y)) nIn += w; else nOut += w;
    }
    return { nIn, nOut };
  }

  // ---------- geometry ----------

  isInside(x, y) {
    if (this.burst) return false;
    return (x - CENTER[0]) ** 2 + (y - CENTER[1]) ** 2 < this.R * this.R;
  }

  inMito(x, y) {
    return this.mitos.find((m) => m.active && (x - m.x) ** 2 + (y - m.y) ** 2 < 1.6 * 1.6) || null;
  }

  proteinPos(p) {
    return [CENTER[0] + this.R * Math.cos(p.angle), CENTER[1] + this.R * Math.sin(p.angle)];
  }

  proteinAt(angle, type) {
    for (const p of this.proteins) {
      if (!p.active || p.type !== type) continue;
      const d = Math.abs(((angle - p.angle + 3 * Math.PI) % TAU) - Math.PI);
      if (d < 0.14) return p;
    }
    return null;
  }

  counts() {
    const c = { in: {}, out: {} };
    for (const k of Object.keys(SPECIES)) { c.in[k] = 0; c.out[k] = 0; }
    for (const p of this.particles) c[this.isInside(p.x, p.y) ? 'in' : 'out'][p.sp]++;
    return c;
  }

  areas() {
    const aIn = this.burst ? 0 : Math.PI * this.R * this.R;
    return { aIn, aOut: W * H - aIn };
  }

  /**
   * Membrane potential (mV). The membrane is a capacitor: the voltage follows the
   * net charge inside (mobile cations minus fixed negatively charged proteins), so
   * every K⁺ that leaks out makes the inside more negative and pulls K⁺ back.
   * The fixed charge is calibrated so each scenario starts at its GHK value.
   */
  membranePotential(c = this.counts()) {
    if (this.burst) return 0;
    const cations = c.in.k + c.in.na;
    return clamp((cations - this.fixedCharge) * MV_PER_ION, -150, 60);
  }

  /** Goldman–Hodgkin–Katz resting potential from concentrations (P_K : P_Na = 1 : 0.04). */
  ghkPotential(c = this.counts()) {
    if (this.burst) return 0;
    const { aIn, aOut } = this.areas();
    const T = this.params.temperature + 273.15;
    const k = (8.314 * T) / 96485 * 1000 * Math.LN10; // mV per decade
    const out = c.out.k / aOut + 0.04 * (c.out.na / aOut);
    const inn = c.in.k / aIn + 0.04 * (c.in.na / aIn);
    if (out <= 0 || inn <= 0) return 0;
    return k * Math.log10(out / inn);
  }

  // ---------- dynamics ----------

  tick(h) {
    const P = this.params;
    const tFactor = (P.temperature + 273.15) / 310;
    const cx = CENTER[0], cy = CENTER[1];
    // Ions feel the membrane voltage: crossing "uphill" by an energy z·e·Vm
    // succeeds with Boltzmann probability exp(−z·e·Vm / kT). This is what holds
    // K⁺ inside a negatively charged cell instead of letting it diffuse away.
    const vm = this.burst ? 0 : this.membranePotential();
    const vt = (8.314 * (P.temperature + 273.15)) / 96485 * 1000; // thermal voltage, mV
    // Brownian motion with membrane crossing rules.
    for (const p of this.particles) {
      const s = SPECIES[p.sp];
      const sd = Math.sqrt(2 * s.D * tFactor * h);
      const nx = clamp(p.x + this.rng.gaussian(0, sd), 0.2, W - 0.2);
      const ny = clamp(p.y + this.rng.gaussian(0, sd), 0.2, H - 0.2);
      const wasIn = this.isInside(p.x, p.y), nowIn = this.isInside(nx, ny);
      if (wasIn !== nowIn) {
        const angle = Math.atan2(ny - cy, nx - cx);
        const electric = s.z ? Math.min(1, Math.exp(((wasIn ? 1 : -1) * s.z * vm) / vt)) : 1;
        const through = this.rng.next() < s.perm * electric || (s.via && this.proteinAt(angle, s.via) && this.rng.next() < 0.7 * electric);
        if (!through) continue; // bounced off the membrane
      }
      p.x = nx; p.y = ny;
    }
    if (!this.burst) {
      this.metabolize(h);
      this.pumpIons(h);
      this.osmosis(h);
    }
    this.atp = Math.max(0, this.atp - P.metabolism * h * (this.burst ? 0 : 1));
    this.particles = this.particles.filter((p) => p.alive);
    this.time += h;
  }

  metabolize() {
    // Glucose reaching an active mitochondrion is burned: aerobically with
    // oxygen (lots of ATP, CO₂ released) or anaerobically (little ATP, lactate).
    for (const g of this.particles) {
      if (!g.alive || g.sp !== 'glucose') continue;
      const m = this.inMito(g.x, g.y);
      if (!m) continue;
      g.alive = false;
      const o2 = this.particles.filter((p) => p.alive && p.sp === 'o2' && this.isInside(p.x, p.y))
        .sort((a, b) => (a.x - m.x) ** 2 + (a.y - m.y) ** 2 - ((b.x - m.x) ** 2 + (b.y - m.y) ** 2));
      if (o2.length >= 2) {
        o2[0].alive = false; o2[1].alive = false;
        this.atp += 30; this.atpMade += 30;
        for (let k = 0; k < 2; k++) this.makeParticle('co2', m.x + this.rng.range(-0.5, 0.5), m.y + this.rng.range(-0.5, 0.5));
      } else {
        this.atp += 2; this.atpMade += 2;
        this.makeParticle('lactate', m.x, m.y);
      }
    }
  }

  pumpIons(h) {
    const P = this.params;
    for (const pump of this.proteins) {
      if (pump.type !== 'pump' || !pump.active) continue;
      pump.clock += P.pumpRate * h;
      while (pump.clock >= 1) {
        pump.clock -= 1;
        if (this.atp < 1) break;
        const [px, py] = this.proteinPos(pump);
        const near = (sp, inside) => this.particles.filter((p) => p.alive && p.sp === sp && this.isInside(p.x, p.y) === inside && (p.x - px) ** 2 + (p.y - py) ** 2 < 16);
        const na = near('na', true).slice(0, 3), k = near('k', false).slice(0, 2);
        // A coupled exchanger: no cycle without sodium to export (3 Na⁺ out : 2 K⁺ in).
        if (!na.length) continue;
        this.atp -= 1;
        const out = this.R + 0.4, inn = this.R - 0.4;
        for (const p of na) { p.x = CENTER[0] + out * Math.cos(pump.angle); p.y = CENTER[1] + out * Math.sin(pump.angle); }
        for (const p of k) { p.x = CENTER[0] + inn * Math.cos(pump.angle); p.y = CENTER[1] + inn * Math.sin(pump.angle); }
      }
    }
  }

  osmosis(h) {
    const P = this.params;
    const { aIn, aOut } = this.areas();
    const o = this.osmolytes();
    const nIn = o.nIn + this.contents, nOut = o.nOut;
    // Water flows toward the side with more dissolved (impermeant) particles.
    const dA = P.waterPerm * 300 * (nIn / aIn - nOut / aOut) * h;
    const newA = clamp(aIn + dA, Math.PI * (R0 * 0.45) ** 2, W * H * 0.5);
    this.resize(Math.sqrt(newA / Math.PI));
    if (this.R > R0 * P.strength) this.lyse();
  }

  resize(R) {
    const old = this.R;
    if (Math.abs(R - old) < 1e-9) return;
    const cx = CENTER[0], cy = CENTER[1];
    for (const p of this.particles) {
      const dx = p.x - cx, dy = p.y - cy, r = Math.hypot(dx, dy);
      if (r < old) { p.x = cx + (dx * R) / old; p.y = cy + (dy * R) / old; } // inside: move with the cytoplasm
      else if (r < R + 0.05) { const f = (R + 0.1) / (r || 1); p.x = cx + dx * f; p.y = cy + dy * f; } // pushed out by the membrane
    }
    for (const m of this.mitos) {
      m.x = cx + ((m.x - cx) * R) / old;
      m.y = cy + ((m.y - cy) * R) / old;
    }
    this.R = R;
  }

  lyse() {
    this.burst = true;
    for (const m of this.mitos) m.active = false;
    for (const p of this.proteins) p.active = false;
  }

  step(dt) {
    const total = dt * this.params.speed;
    const n = Math.max(1, Math.ceil(total / 0.02));
    for (let i = 0; i < n; i++) this.tick(total / n);
  }

  // ---------- interaction ----------

  pick(x, y, r) {
    let best = null, bd = Math.max(r, 0.6) ** 2;
    for (const p of this.particles) {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    if (best) return best;
    if (this.params.showProteins) {
      for (const p of this.proteins) {
        const [px, py] = this.proteinPos(p);
        if ((px - x) ** 2 + (py - y) ** 2 < Math.max(r, 0.8) ** 2) return p;
      }
    }
    for (const m of this.mitos) if ((m.x - x) ** 2 + (m.y - y) ** 2 < 2.2 ** 2) return m;
    const d = Math.hypot(x - CENTER[0], y - CENTER[1]);
    return Math.abs(d - this.R) < Math.max(r, 0.8) || d < this.R ? this.membrane : null;
  }

  locate(e) {
    if (e === this.membrane) return { x: CENTER[0], y: CENTER[1], r: this.R + 0.4 };
    if (!e.alive) return null;
    if (e.type) { const [x, y] = this.proteinPos(e); return { x, y, r: 0.8 }; }
    if (e.angle !== undefined && e.active !== undefined && !e.sp) return { x: e.x, y: e.y, r: 2 };
    return { x: e.x, y: e.y, r: 0.5 };
  }

  add(kind, x, y, r = 1.5) {
    if (SPECIES[kind]) {
      for (let i = 0; i < 10; i++) {
        const a = this.rng.range(0, TAU), d = r * Math.sqrt(this.rng.next());
        this.makeParticle(kind, clamp(x + d * Math.cos(a), 0.3, W - 0.3), clamp(y + d * Math.sin(a), 0.3, H - 0.3));
      }
      return null;
    }
    if (PROTEINS[kind]) {
      if (this.burst) return null;
      return this.addProtein(kind, Math.atan2(y - CENTER[1], x - CENTER[0]));
    }
    if (kind === 'mito' && this.isInside(x, y)) {
      const m = { id: nextId++, x, y, angle: 0, active: true, alive: true };
      this.mitos.push(m);
      return m;
    }
    return null;
  }

  remove(e) {
    if (e === this.membrane) { this.lyse(); return; }
    e.alive = false;
    this.particles = this.particles.filter((p) => p !== e);
    this.proteins = this.proteins.filter((p) => p !== e);
    this.mitos = this.mitos.filter((m) => m !== e);
  }

  removeAt(x, y, r) {
    let removed = 0;
    for (const p of this.particles) if ((p.x - x) ** 2 + (p.y - y) ** 2 < r * r) { p.alive = false; removed++; }
    this.particles = this.particles.filter((p) => p.alive);
    if (removed) return null;
    const e = this.pick(x, y, r);
    if (e && e !== this.membrane) this.remove(e);
    return e === this.membrane ? null : e;
  }

  move(e, x, y) {
    if (e === this.membrane) return;
    if (e.type) { e.angle = Math.atan2(y - CENTER[1], x - CENTER[0]); return; }
    if (e.sp) { e.x = clamp(x, 0.2, W - 0.2); e.y = clamp(y, 0.2, H - 0.2); return; }
    if (this.isInside(x, y)) { e.x = x; e.y = y; }
  }

  impulse(e, x, y, dx, dy) {
    // A drag creates a flow that carries molecules along (they still obey the membrane).
    const targets = e && e.sp ? [e] : this.particles.filter((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < 9);
    for (const p of targets) {
      const nx = clamp(p.x + dx, 0.2, W - 0.2), ny = clamp(p.y + dy, 0.2, H - 0.2);
      if (this.isInside(p.x, p.y) === this.isInside(nx, ny)) { p.x = nx; p.y = ny; }
    }
  }

  energy(x, y, r, amount) {
    this.atp = Math.max(0, this.atp + amount * 400);
  }

  describe(e) {
    if (e === this.membrane) {
      return {
        title: this.burst ? 'Cell membrane (ruptured)' : 'Cell membrane',
        fields: [
          { key: 'R', label: 'Cell radius (µm)', type: 'readonly', value: fmt(this.R) },
          { key: 'contents', label: 'Dissolved cell contents (particles)', type: 'number', value: Math.round(this.contents), step: 10 },
          { key: 'atp', label: 'ATP molecules', type: 'number', value: Math.round(this.atp), step: 50 },
          { key: 'vm', label: 'Membrane potential (mV)', type: 'readonly', value: fmt(this.membranePotential()) },
          { key: 'lyse', label: 'Rupture the membrane', type: 'action' },
        ],
      };
    }
    if (e.type) {
      return {
        title: PROTEINS[e.type].label,
        fields: [
          { key: 'type', label: 'Protein', type: 'select', value: e.type, options: Object.entries(PROTEINS).map(([value, p]) => ({ value, label: p.label })) },
          { key: 'active', label: 'Working', type: 'select', value: e.active ? 'yes' : 'no', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No (blocked)' }] },
        ],
      };
    }
    if (e.sp) {
      return {
        title: SPECIES[e.sp].label,
        fields: [
          { key: 'sp', label: 'Molecule', type: 'select', value: e.sp, options: Object.entries(SPECIES).map(([value, s]) => ({ value, label: s.label })) },
          { key: 'where', label: 'Location', type: 'readonly', value: this.isInside(e.x, e.y) ? 'inside the cell' : 'outside the cell' },
          { key: 'D', label: 'Diffusion coefficient (µm²/s)', type: 'readonly', value: SPECIES[e.sp].D },
          { key: 'crosses', label: 'Crosses membrane via', type: 'readonly', value: SPECIES[e.sp].perm > 0.3 ? 'lipid bilayer (freely)' : SPECIES[e.sp].via ? PROTEINS[SPECIES[e.sp].via].label : 'nothing (impermeant)' },
        ],
      };
    }
    return {
      title: 'Mitochondrion',
      fields: [
        { key: 'active', label: 'Working', type: 'select', value: e.active ? 'yes' : 'no', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No (poisoned)' }] },
        { key: 'made', label: 'ATP made by all mitochondria', type: 'readonly', value: this.atpMade },
      ],
    };
  }

  setProperty(e, key, value) {
    if (e === this.membrane) {
      if (key === 'contents') this.contents = clamp(value, 0, 5000);
      else if (key === 'atp') this.atp = clamp(value, 0, 1e6);
      else if (key === 'lyse') this.lyse();
      return;
    }
    if (key === 'active') e.active = value === 'yes' && !this.burst;
    else if (key === 'type' && PROTEINS[value]) e.type = value;
    else if (key === 'sp' && SPECIES[value]) e.sp = value;
  }

  saveState() {
    return {
      R: this.R, burst: this.burst, atp: this.atp, atpMade: this.atpMade, contents: this.contents, fixedCharge: this.fixedCharge,
      particles: this.particles.map((p) => pick(p, ['id', 'sp', 'x', 'y'])),
      proteins: this.proteins.map((p) => pick(p, ['id', 'type', 'angle', 'active', 'clock'])),
      mitos: this.mitos.map((m) => pick(m, ['id', 'x', 'y', 'angle', 'active'])),
    };
  }

  loadState(st) {
    this.R = clamp(Number(st.R) || R0, 1, 30);
    this.burst = !!st.burst;
    this.atp = Math.max(0, Number(st.atp) || 0);
    this.atpMade = Number(st.atpMade) || 0;
    this.contents = Math.max(0, Number(st.contents) || 0);
    this.fixedCharge = Number.isFinite(st.fixedCharge) ? st.fixedCharge : 50;
    this.particles = st.particles.filter((p) => SPECIES[p.sp]).map((p) => ({ ...p, alive: true }));
    this.proteins = st.proteins.filter((p) => PROTEINS[p.type]).map((p) => ({ ...p, alive: true }));
    this.mitos = st.mitos.map((m) => ({ ...m, alive: true }));
    nextId = Math.max(nextId, ...[...this.particles, ...this.proteins, ...this.mitos].map((o) => o.id + 1));
  }

  status() {
    if (this.burst) return 'burst (lysed)';
    if (this.R > R0 * 1.15) return 'swollen';
    if (this.R < R0 * 0.85) return 'shrunken (crenated)';
    if (this.atp < 1) return 'out of energy';
    return 'healthy';
  }

  stats() {
    const c = this.counts();
    return [
      { key: 'status', label: 'Cell status', value: this.status() },
      { key: 'volume', label: 'Volume vs. normal (%)', value: this.burst ? 0 : 100 * (this.R / R0) ** 3 },
      { key: 'atp', label: 'ATP', value: this.atp },
      { key: 'vm', label: 'Membrane potential (mV)', value: this.membranePotential(c) },
      { key: 'glucoseIn', label: 'Glucose inside / outside', value: `${c.in.glucose} / ${c.out.glucose}` },
      { key: 'o2In', label: 'O₂ inside / outside', value: `${c.in.o2} / ${c.out.o2}` },
      { key: 'co2In', label: 'CO₂ inside / outside', value: `${c.in.co2} / ${c.out.co2}` },
      { key: 'kIn', label: 'K⁺ inside / outside', value: `${c.in.k} / ${c.out.k}` },
      { key: 'naIn', label: 'Na⁺ inside / outside', value: `${c.in.na} / ${c.out.na}` },
    ];
  }

  render(ctx, view) {
    const [cx, cy] = view.toScreen(CENTER[0], CENTER[1]);
    const R = this.R * view.scale;
    const [x0, y0] = view.toScreen(0, 0), [x1, y1] = view.toScreen(W, H);
    ctx.fillStyle = '#0f1626';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    if (!this.burst) {
      // Cytoplasm and membrane (wavy when shrunken).
      const shrunk = clamp((R0 * 0.92 - this.R) / (R0 * 0.3), 0, 1);
      ctx.beginPath();
      for (let k = 0; k <= 120; k++) {
        const a = (k / 120) * TAU;
        const rr = R * (1 + 0.06 * shrunk * Math.sin(a * 14));
        const px = cx + rr * Math.cos(a), py = cy + rr * Math.sin(a);
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.fillStyle = 'rgba(70,110,160,0.25)';
      ctx.fill();
      ctx.strokeStyle = this.R > R0 * 1.25 ? '#ff8a5c' : '#8fb4ff';
      ctx.lineWidth = Math.max(2, 0.35 * view.scale);
      ctx.stroke();
      // Nucleus (decorative).
      ctx.fillStyle = 'rgba(150,110,200,0.25)';
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.28, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(200,180,240,0.5)';
      ctx.font = '11px system-ui';
      ctx.fillText('nucleus', cx - 18, cy + 4);
    } else {
      ctx.strokeStyle = 'rgba(143,180,255,0.35)';
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const m of this.mitos) {
      const [mx, my] = view.toScreen(m.x, m.y);
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(m.angle);
      ctx.fillStyle = m.active ? 'rgba(255,140,90,0.55)' : 'rgba(120,120,120,0.4)';
      ctx.beginPath(); ctx.ellipse(0, 0, 1.6 * view.scale, 0.9 * view.scale, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = m.active ? '#ffb48a' : '#888';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = -2; k <= 2; k++) { ctx.moveTo(k * 0.5 * view.scale, -0.6 * view.scale); ctx.lineTo(k * 0.5 * view.scale + 0.2 * view.scale, 0.6 * view.scale); }
      ctx.stroke();
      ctx.restore();
    }
    if (this.params.showProteins && !this.burst) {
      for (const p of this.proteins) {
        const [px, py] = view.toScreen(...this.proteinPos(p));
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.active ? PROTEINS[p.type].color : '#555';
        ctx.fillRect(-0.45 * view.scale, -0.3 * view.scale, 0.9 * view.scale, 0.6 * view.scale);
        ctx.restore();
      }
    }
    for (const p of this.particles) {
      const s = SPECIES[p.sp];
      const [sx, sy] = view.toScreen(p.x, p.y);
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(1.5, s.r * view.scale), 0, TAU); ctx.fill();
    }
    // Legend.
    ctx.font = '11px system-ui';
    let ly = y0 + 14;
    for (const [k, s] of Object.entries(SPECIES)) {
      if (!this.particles.some((p) => p.sp === k)) continue;
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(x0 + 10, ly - 4, 4, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(220,230,255,0.8)';
      ctx.fillText(s.label, x0 + 18, ly);
      ly += 15;
    }
  }
}
