import { Simulation } from '../core/simulation.js';
import { SpatialHash } from '../core/spatial-hash.js';
import { clamp, TAU } from '../core/math.js';
import { pick } from '../core/serialize.js';

// Reduced molecular-dynamics units: length σ≈3 Å, energy ε, mass in amu.
// One reduced temperature unit ≈ 120 K (the argon well depth).
export const KELVIN_PER_UNIT = 120;

export const ELEMENTS = {
  H: { name: 'Hydrogen', mass: 1, sigma: 0.6, eps: 0.1, valence: 1, charge: 0, color: '#f2f2f2' },
  C: { name: 'Carbon', mass: 12, sigma: 1.0, eps: 0.3, valence: 4, charge: 0, color: '#555a64' },
  N: { name: 'Nitrogen', mass: 14, sigma: 0.95, eps: 0.3, valence: 3, charge: 0, color: '#4a6cff' },
  O: { name: 'Oxygen', mass: 16, sigma: 0.9, eps: 0.35, valence: 2, charge: 0, color: '#ff4a4a' },
  Ne: { name: 'Neon', mass: 20, sigma: 0.9, eps: 0.3, valence: 0, charge: 0, color: '#ff9f4a' },
  Ar: { name: 'Argon', mass: 40, sigma: 1.0, eps: 1.0, valence: 0, charge: 0, color: '#58c8e8' },
  Na: { name: 'Sodium ion', mass: 23, sigma: 0.9, eps: 0.5, valence: 0, charge: 1, color: '#b06cff' },
  Cl: { name: 'Chloride ion', mass: 35, sigma: 1.2, eps: 0.5, valence: 0, charge: -1, color: '#5ee05e' },
};

const BOND_K = 300;
const COULOMB_K = 20;
const COULOMB_CUT = 6;
const FMAX = 2000;

let nextId = 1;

/**
 * 2D molecular dynamics: Lennard-Jones atoms, Coulomb ions, and simple
 * covalent chemistry (atoms with free valence form spring bonds when they meet
 * gently and break them when stretched too far). Shows gas → liquid → solid
 * phase changes, crystallisation of salt and formation of H₂, H₂O, CH₄ ...
 */
export class AtomsSim extends Simulation {
  static meta = {
    id: 'atoms',
    title: 'Atoms & Molecules',
    category: 'Matter',
    description:
      'Molecular dynamics with Lennard-Jones forces, ionic charges and covalent bonding. Heat or cool regions to melt, boil or freeze matter, mix elements to form molecules, or transmute atoms in the inspector.',
  };

  constructor(opts) {
    super(opts);
    this.timeUnit = 'τ';
    this.background = '#070a12';
    this.atoms = [];
    this.W = 60;
    this.H = 40;
    this.hash = new SpatialHash(3);
    this.wallImpulse = 0;
    this.pressure = 0;
    this.defineParams([
      { key: 'speed', label: 'Steps per frame', type: 'range', min: 1, max: 40, step: 1, value: 10 },
      { key: 'dt', label: 'Time step (τ)', type: 'range', min: 0.0005, max: 0.006, step: 0.0005, value: 0.003 },
      { key: 'thermostat', label: 'Thermostat', type: 'checkbox', value: true },
      { key: 'targetT', label: 'Target temperature (K)', type: 'range', min: 5, max: 2000, step: 5, value: 300 },
      { key: 'gravity', label: 'Gravity', type: 'range', min: 0, max: 20, step: 0.1, value: 0 },
      { key: 'bonding', label: 'Chemical bonding', type: 'checkbox', value: true },
      { key: 'bondEnergy', label: 'Bond strength (break stretch)', type: 'range', min: 1.1, max: 2.5, step: 0.05, value: 1.5 },
      { key: 'coulomb', label: 'Electrostatics', type: 'checkbox', value: true },
      { key: 'showBonds', label: 'Draw bonds', type: 'checkbox', value: true },
    ]);
    this.spawnKinds = [
      ...Object.entries(ELEMENTS).map(([id, e]) => ({ id, label: `${e.name} (${id})` })),
      { id: 'H2O', label: 'Water molecule (H₂O)' },
      { id: 'CH4', label: 'Methane (CH₄)' },
    ];
    this.scenarios = [
      { id: 'gas', label: 'Argon gas' },
      { id: 'condense', label: 'Argon condensing (cold)' },
      { id: 'salt', label: 'Salt crystal (NaCl) — heat to dissolve/melt' },
      { id: 'water', label: 'Hydrogen + oxygen → water' },
      { id: 'organic', label: 'Carbon + hydrogen soup' },
      { id: 'mixture', label: 'Noble-gas mixture with gravity' },
    ];
    this.energyTool = { label: 'Heat', negLabel: 'Cool' };
    this.chartKeys = ['T', 'pressure'];
    this.loadScenario('gas');
  }

  bounds() {
    return { x: 0, y: 0, w: this.W, h: this.H };
  }

  makeAtom(el, x, y, T = this.params.targetT) {
    const e = ELEMENTS[el];
    const sd = Math.sqrt(T / KELVIN_PER_UNIT / e.mass);
    return {
      id: nextId++, el, x, y,
      vx: this.rng.gaussian(0, sd), vy: this.rng.gaussian(0, sd),
      fx: 0, fy: 0, bonds: [], alive: true,
      charge: e.charge,
    };
  }

  loadScenario(id) {
    super.loadScenario(id);
    this.rng.seed(7);
    this.atoms = [];
    const P = this.params;
    P.gravity = 0;
    P.thermostat = true;
    const fill = (els, n, x0 = 1, y0 = 1, x1 = this.W - 1, y1 = this.H - 1) => {
      for (let i = 0; i < n; i++) this.placeRandom(this.rng.pick(els), x0, y0, x1, y1);
    };
    if (id === 'gas') {
      P.targetT = 300;
      fill(['Ar'], 220);
    } else if (id === 'condense') {
      P.targetT = 60;
      fill(['Ar'], 320);
    } else if (id === 'salt') {
      P.targetT = 300;
      const n = 12, a = 1.25, ox = this.W / 2 - (n * a) / 2, oy = this.H / 2 - (n * a) / 2;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const at = this.makeAtom((i + j) % 2 ? 'Na' : 'Cl', ox + i * a, oy + j * a, 20);
        this.atoms.push(at);
      }
      fill(['Ne'], 40);
    } else if (id === 'water') {
      P.targetT = 400;
      fill(['H'], 160);
      fill(['O'], 80);
    } else if (id === 'organic') {
      P.targetT = 500;
      fill(['H'], 200);
      fill(['C'], 50);
      fill(['N'], 15);
    } else if (id === 'mixture') {
      P.targetT = 200;
      P.gravity = 4;
      fill(['Ar'], 120);
      fill(['Ne'], 120);
    }
  }

  saveState() {
    return {
      pressure: this.pressure,
      atoms: this.atoms.map((a) => ({ ...pick(a, ['id', 'el', 'x', 'y', 'vx', 'vy', 'charge']), bonds: a.bonds.map((b) => b.id) })),
    };
  }

  loadState(st) {
    const byId = new Map();
    this.atoms = st.atoms.filter((a) => ELEMENTS[a.el]).map((a) => {
      const at = { ...a, fx: 0, fy: 0, bonds: [], alive: true };
      byId.set(at.id, at);
      return at;
    });
    for (const a of st.atoms) {
      const at = byId.get(a.id);
      if (at) at.bonds = a.bonds.map((id) => byId.get(id)).filter(Boolean);
    }
    this.pressure = st.pressure || 0;
    nextId = Math.max(nextId, ...this.atoms.map((a) => a.id + 1));
    this.forcesReady = false;
  }

  placeRandom(el, x0, y0, x1, y1) {
    const s = ELEMENTS[el].sigma;
    for (let tries = 0; tries < 50; tries++) {
      const x = this.rng.range(x0, x1), y = this.rng.range(y0, y1);
      let ok = true;
      for (const a of this.atoms) {
        const d = (ELEMENTS[a.el].sigma + s) * 0.5;
        if ((a.x - x) ** 2 + (a.y - y) ** 2 < d * d) { ok = false; break; }
      }
      if (ok) { const at = this.makeAtom(el, x, y); this.atoms.push(at); return at; }
    }
    return null;
  }

  bondLength(a, b) {
    return 0.4 * (ELEMENTS[a.el].sigma + ELEMENTS[b.el].sigma);
  }

  computeForces() {
    const atoms = this.atoms, P = this.params;
    let pe = 0;
    // Screen-style coordinates: +y is down, so gravity pulls toward larger y.
    for (const a of atoms) { a.fx = 0; a.fy = ELEMENTS[a.el].mass * P.gravity * 0.05; }
    this.hash.rebuild(atoms);
    // Lennard-Jones (skipping covalently bonded pairs).
    for (const a of atoms) {
      const ea = ELEMENTS[a.el];
      this.hash.query(a.x, a.y, 3, (b) => {
        if (b.id <= a.id) return;
        if (a.bonds.includes(b)) return;
        const eb = ELEMENTS[b.el];
        const sigma = 0.5 * (ea.sigma + eb.sigma);
        const rc = 2.5 * sigma;
        const dx = b.x - a.x, dy = b.y - a.y;
        const r2 = dx * dx + dy * dy;
        if (r2 > rc * rc || r2 === 0) return;
        const eps = Math.sqrt(ea.eps * eb.eps);
        const s2 = (sigma * sigma) / r2, s6 = s2 * s2 * s2;
        let f = (24 * eps * (2 * s6 * s6 - s6)) / r2;
        f = clamp(f, -FMAX, FMAX);
        pe += 4 * eps * (s6 * s6 - s6);
        a.fx -= f * dx; a.fy -= f * dy;
        b.fx += f * dx; b.fy += f * dy;
      });
    }
    // Screened, cut-off Coulomb between charged particles.
    if (P.coulomb) {
      const charged = atoms.filter((a) => a.charge);
      for (let i = 0; i < charged.length; i++) {
        const a = charged[i];
        for (let j = i + 1; j < charged.length; j++) {
          const b = charged[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const r2 = dx * dx + dy * dy;
          if (r2 > COULOMB_CUT * COULOMB_CUT) continue;
          const r = Math.sqrt(r2) || 1e-6;
          const shift = 1 / (COULOMB_CUT * COULOMB_CUT);
          let f = COULOMB_K * a.charge * b.charge * (1 / r2 - shift) / r;
          f = clamp(f, -FMAX, FMAX);
          pe += COULOMB_K * a.charge * b.charge * (1 / r - 1 / COULOMB_CUT);
          a.fx -= f * dx; a.fy -= f * dy;
          b.fx += f * dx; b.fy += f * dy;
        }
      }
    }
    // Covalent bonds as harmonic springs + soft angle repulsion between neighbours.
    for (const a of atoms) {
      for (const b of a.bonds) {
        if (b.id <= a.id) continue;
        const r0 = this.bondLength(a, b);
        const dx = b.x - a.x, dy = b.y - a.y;
        const r = Math.hypot(dx, dy) || 1e-6;
        const f = (BOND_K * (r - r0)) / r;
        pe += 0.5 * BOND_K * (r - r0) ** 2;
        a.fx += f * dx; a.fy += f * dy;
        b.fx -= f * dx; b.fy -= f * dy;
      }
      if (a.bonds.length >= 2) {
        for (let i = 0; i < a.bonds.length; i++) for (let j = i + 1; j < a.bonds.length; j++) {
          const p = a.bonds[i], q = a.bonds[j];
          const dmin = 1.6 * Math.max(this.bondLength(a, p), this.bondLength(a, q));
          const dx = q.x - p.x, dy = q.y - p.y;
          const r = Math.hypot(dx, dy) || 1e-6;
          if (r >= dmin) continue;
          const f = (40 * (r - dmin)) / r;
          p.fx += f * dx; p.fy += f * dy;
          q.fx -= f * dx; q.fy -= f * dy;
        }
      }
    }
    this.potential = pe;
  }

  updateBonds() {
    const P = this.params;
    // Break over-stretched bonds.
    for (const a of this.atoms) {
      for (let i = a.bonds.length - 1; i >= 0; i--) {
        const b = a.bonds[i];
        const r = Math.hypot(b.x - a.x, b.y - a.y);
        if (r > this.bondLength(a, b) * P.bondEnergy) this.unbond(a, b);
      }
    }
    if (!P.bonding) return;
    // Form bonds between nearby atoms with free valence and modest relative speed.
    for (const a of this.atoms) {
      const va = ELEMENTS[a.el].valence;
      if (a.bonds.length >= va) continue;
      this.hash.query(a.x, a.y, 1.2, (b) => {
        if (b === a || a.bonds.length >= va) return;
        if (b.bonds.length >= ELEMENTS[b.el].valence || a.bonds.includes(b)) return;
        const r0 = this.bondLength(a, b);
        const dx = b.x - a.x, dy = b.y - a.y;
        if (dx * dx + dy * dy > (r0 * 1.25) ** 2) return;
        const dv2 = (b.vx - a.vx) ** 2 + (b.vy - a.vy) ** 2;
        if (dv2 > 400) return; // too energetic to stick
        a.bonds.push(b); b.bonds.push(a);
      });
    }
  }

  unbond(a, b) {
    a.bonds = a.bonds.filter((x) => x !== b);
    b.bonds = b.bonds.filter((x) => x !== a);
  }

  temperatureUnits() {
    if (!this.atoms.length) return 0;
    let ke = 0;
    for (const a of this.atoms) ke += 0.5 * ELEMENTS[a.el].mass * (a.vx * a.vx + a.vy * a.vy);
    return ke / this.atoms.length; // 2D equipartition: <KE> = kT
  }

  step() {
    const P = this.params, h = P.dt;
    if (!this.atoms.length) return;
    if (!this.forcesReady) { this.computeForces(); this.forcesReady = true; }
    let wall = 0;
    for (let s = 0; s < P.speed; s++) {
      for (const a of this.atoms) {
        const im = 1 / ELEMENTS[a.el].mass;
        a.vx += 0.5 * h * a.fx * im; a.vy += 0.5 * h * a.fy * im;
        a.x += h * a.vx; a.y += h * a.vy;
        // Reflecting walls; accumulate momentum transfer for pressure.
        const m = ELEMENTS[a.el].mass, rad = ELEMENTS[a.el].sigma * 0.5;
        if (a.x < rad) { a.x = rad; if (a.vx < 0) { wall += 2 * m * -a.vx; a.vx = -a.vx; } }
        if (a.x > this.W - rad) { a.x = this.W - rad; if (a.vx > 0) { wall += 2 * m * a.vx; a.vx = -a.vx; } }
        if (a.y < rad) { a.y = rad; if (a.vy < 0) { wall += 2 * m * -a.vy; a.vy = -a.vy; } }
        if (a.y > this.H - rad) { a.y = this.H - rad; if (a.vy > 0) { wall += 2 * m * a.vy; a.vy = -a.vy; } }
      }
      this.computeForces();
      for (const a of this.atoms) {
        const im = 1 / ELEMENTS[a.el].mass;
        a.vx += 0.5 * h * a.fx * im; a.vy += 0.5 * h * a.fy * im;
      }
      if (s % 5 === 0) this.updateBonds();
      if (P.thermostat) {
        const T = this.temperatureUnits();
        const T0 = P.targetT / KELVIN_PER_UNIT;
        if (T > 0) {
          const lam = Math.sqrt(clamp(1 + (h / 0.5) * (T0 / T - 1), 0.8, 1.25));
          for (const a of this.atoms) { a.vx *= lam; a.vy *= lam; }
        }
      }
      this.time += h;
    }
    // Pressure = impulse / (time · perimeter), exponentially smoothed.
    const p = wall / (P.speed * h * 2 * (this.W + this.H));
    this.pressure = this.pressure * 0.9 + p * 0.1;
  }

  pick(x, y, r) {
    let best = null, bd = Math.max(r, 0.6) ** 2;
    for (const a of this.atoms) {
      const d = (a.x - x) ** 2 + (a.y - y) ** 2;
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  locate(a) {
    return a.alive ? { x: a.x, y: a.y, r: ELEMENTS[a.el].sigma * 0.6 } : null;
  }

  add(kind, x, y) {
    const T = this.params.targetT;
    const put = (el, px, py) => {
      const a = this.makeAtom(el, clamp(px, 0.5, this.W - 0.5), clamp(py, 0.5, this.H - 0.5), T);
      this.atoms.push(a);
      return a;
    };
    let made;
    if (kind === 'H2O') {
      const o = put('O', x, y), h1 = put('H', x - 0.6, y + 0.45), h2 = put('H', x + 0.6, y + 0.45);
      o.bonds.push(h1, h2); h1.bonds.push(o); h2.bonds.push(o);
      made = o;
    } else if (kind === 'CH4') {
      const c = put('C', x, y);
      for (const [dx, dy] of [[0.65, 0], [-0.65, 0], [0, 0.65], [0, -0.65]]) {
        const hh = put('H', x + dx, y + dy);
        c.bonds.push(hh); hh.bonds.push(c);
      }
      made = c;
    } else made = put(kind, x, y);
    this.forcesReady = false;
    return made;
  }

  remove(a) {
    for (const b of [...a.bonds]) this.unbond(a, b);
    a.alive = false;
    this.atoms = this.atoms.filter((o) => o !== a);
    this.forcesReady = false;
  }

  move(a, x, y) {
    a.x = clamp(x, 0.3, this.W - 0.3);
    a.y = clamp(y, 0.3, this.H - 0.3);
    a.vx *= 0.5; a.vy *= 0.5;
    this.forcesReady = false;
  }

  impulse(a, x, y, dx, dy) {
    const k = 3;
    if (a) {
      // Push the whole molecule so bonds aren't instantly torn apart.
      for (const m of this.molecule(a)) { m.vx += dx * k; m.vy += dy * k; }
    } else {
      for (const b of this.atoms) {
        const d2 = (b.x - x) ** 2 + (b.y - y) ** 2;
        if (d2 < 9) { b.vx += dx * k; b.vy += dy * k; }
      }
    }
  }

  energy(x, y, r, amount) {
    const f = Math.exp(amount * 1.5);
    for (const a of this.atoms) {
      if ((a.x - x) ** 2 + (a.y - y) ** 2 < r * r) { a.vx *= f; a.vy *= f; }
    }
  }

  molecule(a) {
    const seen = new Set([a]), stack = [a];
    while (stack.length) for (const b of stack.pop().bonds) if (!seen.has(b)) { seen.add(b); stack.push(b); }
    return [...seen];
  }

  static formula(atoms) {
    const count = {};
    for (const a of atoms) count[a.el] = (count[a.el] || 0) + 1;
    // Hill order: C, H, then alphabetical.
    const order = Object.keys(count).sort((p, q) => {
      const rank = (e) => (e === 'C' ? 0 : e === 'H' ? 1 : 2);
      return rank(p) - rank(q) || p.localeCompare(q);
    });
    const sub = (n) => (n === 1 ? '' : String(n).replace(/\d/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[d]));
    return order.map((e) => e + sub(count[e])).join('');
  }

  moleculeCensus() {
    const seen = new Set(), census = {};
    for (const a of this.atoms) {
      if (seen.has(a) || !a.bonds.length) continue;
      const mol = this.molecule(a);
      mol.forEach((m) => seen.add(m));
      const f = AtomsSim.formula(mol);
      census[f] = (census[f] || 0) + 1;
    }
    return census;
  }

  describe(a) {
    const e = ELEMENTS[a.el];
    const mol = this.molecule(a);
    return {
      title: `${e.name} atom`,
      fields: [
        { key: 'el', label: 'Element', type: 'select', value: a.el, options: Object.keys(ELEMENTS).map((k) => ({ value: k, label: `${k} — ${ELEMENTS[k].name}` })) },
        { key: 'charge', label: 'Charge (e)', type: 'number', value: a.charge, step: 1 },
        { key: 'mass', label: 'Mass (amu)', type: 'readonly', value: e.mass },
        { key: 'bonds', label: 'Bonds / valence', type: 'readonly', value: `${a.bonds.length} / ${e.valence}` },
        { key: 'molecule', label: 'Molecule', type: 'readonly', value: mol.length > 1 ? AtomsSim.formula(mol) : '(free atom)' },
        { key: 'vx', label: 'vx', type: 'number', value: a.vx },
        { key: 'vy', label: 'vy', type: 'number', value: a.vy },
        { key: 'ke', label: 'Kinetic energy (K)', type: 'readonly', value: Math.round(0.5 * e.mass * (a.vx ** 2 + a.vy ** 2) * KELVIN_PER_UNIT) },
        { key: 'breakBonds', label: 'Break all bonds', type: 'action' },
      ],
    };
  }

  setProperty(a, key, value) {
    if (key === 'el' && ELEMENTS[value]) {
      a.el = value;
      a.charge = ELEMENTS[value].charge;
      while (a.bonds.length > ELEMENTS[value].valence) this.unbond(a, a.bonds[a.bonds.length - 1]);
    } else if (key === 'breakBonds') {
      for (const b of [...a.bonds]) this.unbond(a, b);
    } else if (key in a) a[key] = value;
    this.forcesReady = false;
  }

  stats() {
    const T = this.temperatureUnits() * KELVIN_PER_UNIT;
    const census = Object.entries(this.moleculeCensus()).sort((p, q) => q[1] - p[1]).slice(0, 5);
    return [
      { key: 'atoms', label: 'Atoms', value: this.atoms.length },
      { key: 'T', label: 'Temperature (K)', value: T },
      { key: 'pressure', label: 'Pressure (reduced)', value: this.pressure },
      { key: 'molecules', label: 'Molecules', value: census.length ? census.map(([f, n]) => `${n}×${f}`).join(', ') : 'none' },
    ];
  }

  render(ctx, view) {
    const [x0, y0] = view.toScreen(0, 0), [x1, y1] = view.toScreen(this.W, this.H);
    ctx.strokeStyle = '#2b3550';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    if (this.params.showBonds) {
      ctx.strokeStyle = 'rgba(220,220,240,0.7)';
      ctx.lineWidth = Math.max(1, view.scale * 0.15);
      ctx.beginPath();
      for (const a of this.atoms) for (const b of a.bonds) {
        if (b.id < a.id) continue;
        const [ax, ay] = view.toScreen(a.x, a.y), [bx, by] = view.toScreen(b.x, b.y);
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
      }
      ctx.stroke();
    }
    for (const a of this.atoms) {
      const e = ELEMENTS[a.el];
      const [sx, sy] = view.toScreen(a.x, a.y);
      const r = Math.max(1.5, e.sigma * 0.5 * view.scale);
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
      if (a.charge && r > 5) {
        ctx.fillStyle = '#000';
        ctx.font = `${Math.round(r)}px system-ui`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(a.charge > 0 ? '+' : '−', sx, sy);
        ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      }
    }
  }
}
