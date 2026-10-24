import { Simulation } from '../core/simulation.js';
import { clamp, fmt, TAU } from '../core/math.js';

const SYMBOLS = ('n H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr ' +
  'Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os ' +
  'Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og').split(' ');
const NAMES = ('Neutronium Hydrogen Helium Lithium Beryllium Boron Carbon Nitrogen Oxygen Fluorine Neon Sodium Magnesium Aluminium ' +
  'Silicon Phosphorus Sulfur Chlorine Argon Potassium Calcium Scandium Titanium Vanadium Chromium Manganese Iron Cobalt Nickel ' +
  'Copper Zinc Gallium Germanium Arsenic Selenium Bromine Krypton').split(' ');
export const MAX_Z = SYMBOLS.length - 1;

export const symbolOf = (Z) => SYMBOLS[clamp(Z, 0, MAX_Z)];
export const nameOf = (Z) => NAMES[Z] ?? `Element ${Z} (${symbolOf(Z)})`;

const RYDBERG_EV = 13.6057;
const HC_EV_NM = 1239.84;
const MAX_LEVEL = 7;

// Subshells in Madelung (aufbau) filling order.
const SUBSHELLS = ['1s', '2s', '2p', '3s', '3p', '4s', '3d', '4p', '5s', '4d', '5p', '6s', '4f', '5d', '6p', '7s', '5f', '6d', '7p'];
const CAP = { s: 2, p: 6, d: 10, f: 14 };

/** Ground-state electron configuration as [{ n, l, count }] in filling order. */
export function configuration(electrons) {
  const out = [];
  let left = electrons;
  for (const sub of SUBSHELLS) {
    if (left <= 0) break;
    const count = Math.min(left, CAP[sub[1]]);
    out.push({ n: Number(sub[0]), l: sub[1], count });
    left -= count;
  }
  return out;
}

export function configString(electrons) {
  const sup = (k) => String(k).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);
  return configuration(electrons).map((s) => `${s.n}${s.l}${sup(s.count)}`).join(' ') || '—';
}

/** Semi-empirical (Weizsäcker) nuclear binding energy in MeV. */
export function bindingEnergy(Z, N) {
  const A = Z + N;
  if (A < 2 || Z < 1) return 0;
  const aV = 15.75, aS = 17.8, aC = 0.711, aA = 23.7, aP = 11.18;
  let B = aV * A - aS * A ** (2 / 3) - (aC * Z * (Z - 1)) / A ** (1 / 3) - (aA * (A - 2 * Z) ** 2) / A;
  if (Z % 2 === 0 && N % 2 === 0) B += aP / Math.sqrt(A);
  else if (Z % 2 === 1 && N % 2 === 1) B -= aP / Math.sqrt(A);
  return Math.max(0, B);
}

/** Most stable proton number for mass number A (bottom of the valley of stability). */
export const stableZ = (A) => A / (1.98 + 0.0155 * A ** (2 / 3));

/** Width of the band of stable isotopes around the valley (in protons); wider for heavy nuclei. */
export const stabilityTolerance = (A) => 0.6 + 0.02 * A ** (2 / 3);

/** Predicted decay mode of a nucleus, or null if (treated as) stable. */
export function decayMode(Z, N) {
  const A = Z + N;
  if (A === 0) return null;
  if (Z === 0) return N > 0 ? 'beta-' : null;
  // Odd–odd nuclei lack the pairing bonus, so their band of stability is narrower.
  const dz = Z - stableZ(A), tol = stabilityTolerance(A) * (Z % 2 && N % 2 ? 0.5 : 1);
  // Heavy nuclei shed mass by alpha decay, but a neutron-rich one beta-decays
  // first, so chains alternate α and β⁻ (U-238 → … → Pb-206) as in nature.
  if (A > 209 || Z > 83) return dz < -tol ? 'beta-' : 'alpha';
  if (dz > tol) return 'beta+';
  if (dz < -tol) return 'beta-';
  return null;
}

/** Wavelength (nm) of a photon of energy E (eV). */
export const wavelengthNm = (eV) => HC_EV_NM / eV;

/** Approximate visible colour of light of wavelength λ (nm). */
export function spectrumColor(nm) {
  let r = 0, g = 0, b = 0;
  if (nm >= 380 && nm < 440) { r = (440 - nm) / 60; b = 1; }
  else if (nm < 490 && nm >= 440) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510 && nm >= 490) { g = 1; b = (510 - nm) / 20; }
  else if (nm < 580 && nm >= 510) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645 && nm >= 580) { r = 1; g = (645 - nm) / 65; }
  else if (nm <= 750 && nm >= 645) { r = 1; }
  else return nm < 380 ? 'rgb(170,120,255)' : 'rgb(140,40,40)'; // UV / IR, drawn dim
  return `rgb(${Math.round(255 * r)},${Math.round(255 * g)},${Math.round(255 * b)})`;
}

let nextId = 1;

/**
 * A single atom: nucleus of protons and neutrons, electrons in shells. Photons
 * excite electrons, which fall back emitting light at characteristic
 * wavelengths (the element's emission spectrum). Unstable nuclei decay by
 * alpha or beta emission. Electron energies use a screened hydrogen-like model;
 * nuclear binding uses the semi-empirical mass formula.
 */
export class AtomSim extends Simulation {
  static meta = {
    id: 'atom',
    title: 'Atomic Structure',
    category: 'Matter',
    description:
      'Build atoms from protons, neutrons and electrons. Shine light to excite electrons and watch them emit the element’s spectral lines, strip electrons to make ions, or add neutrons until the nucleus becomes radioactive and decays.',
    model: {
      summary: 'One atom: a nucleus of protons and neutrons plus electrons in shells, with photon absorption and emission and radioactive decay.',
      equations: [
        'E_n ≈ −13.6 eV · Z_eff² / n² (screened hydrogen-like levels)',
        'λ = hc / ΔE ≈ 1240 nm·eV / ΔE',
        'B(A,Z) = a_V·A − a_S·A^{2/3} − a_C·Z(Z−1)/A^{1/3} − a_A·(A−2Z)²/A ± δ (Weizsäcker)',
      ],
      assumptions: [
        'Electrons fill subshells in Madelung (aufbau) order; exceptions such as Cr and Cu are ignored.',
        'Energy levels are exact only for hydrogen and hydrogen-like ions; other elements are approximate.',
        'Stability and decay mode (α, β⁻, β⁺) come from the semi-empirical mass formula and the valley of stability, so a few odd–odd nuclei (e.g. Co-60) are misclassified.',
        'Decay is random with a tunable speed-up; real half-lives are not tabulated.',
        'Orbits are drawn as rings for clarity; real electrons are probability clouds.',
      ],
      references: [
        'Bohr (1913), hydrogen spectrum',
        'von Weizsäcker (1935), semi-empirical mass formula',
        'NIST Atomic Spectra Database (for comparing real lines)',
      ],
    },
  };

  constructor(opts) {
    super(opts);
    this.timeUnit = 's';
    this.background = '#04060c';
    this.defineParams([
      { key: 'emissionRate', label: 'Emission rate (1/s)', type: 'range', min: 0.1, max: 20, value: 2, log: true },
      { key: 'photonLevel', label: `Photon energy: max level reached (${MAX_LEVEL + 1} = ionising UV)`, type: 'range', min: 2, max: MAX_LEVEL + 1, step: 1, value: 6 },
      { key: 'recombination', label: 'Ions recapture electrons', type: 'checkbox', value: true },
      { key: 'radioactivity', label: 'Radioactive decay', type: 'checkbox', value: true },
      { key: 'decaySpeed', label: 'Decay speed (×)', type: 'range', min: 0.01, max: 100, value: 1, log: true },
      { key: 'orbitSpeed', label: 'Electron animation speed', type: 'range', min: 0, max: 3, step: 0.05, value: 1 },
    ]);
    this.spawnKinds = [
      { id: 'electron', label: 'Electron' },
      { id: 'proton', label: 'Proton (changes element)' },
      { id: 'neutron', label: 'Neutron (changes isotope)' },
      { id: 'photon', label: 'Photon (excite an electron)' },
    ];
    this.scenarios = [
      { id: 'hydrogen', label: 'Hydrogen (Balmer lines)' },
      { id: 'helium', label: 'Helium' },
      { id: 'carbon12', label: 'Carbon-12' },
      { id: 'carbon14', label: 'Carbon-14 (radioactive)' },
      { id: 'neon', label: 'Neon' },
      { id: 'iron', label: 'Iron-56 (most tightly bound)' },
      { id: 'uranium', label: 'Uranium-238 (alpha decay chain)' },
    ];
    this.energyTool = { label: 'Shine light (excite)', negLabel: 'Stimulate emission' };
    this.chartKeys = ['photons', 'charge'];
    this.nucleus = { id: 0, type: 'nucleus', alive: true };
    this.particles = []; // transient visuals: photons, alpha/beta particles
    this.loadScenario('hydrogen');
  }

  loadScenario(id) {
    super.loadScenario(id);
    this.rng.seed(17);
    const iso = { hydrogen: [1, 0], helium: [2, 2], carbon12: [6, 6], carbon14: [6, 8], neon: [10, 10], iron: [26, 30], uranium: [92, 146] }[id] ?? [1, 0];
    this.setNucleus(iso[0], iso[1]);
    this.electrons = [];
    this.setElectronCount(iso[0]);
    this.lines = [];
    this.photons = 0;
    this.decays = [];
    this.particles = [];
    this.lastLine = null;
    this.params.decaySpeed = id === 'uranium' ? 30 : 1;
  }

  setNucleus(Z, N) {
    this.Z = clamp(Math.round(Z), 0, MAX_Z);
    this.N = clamp(Math.round(N), 0, 250);
    this.decayClock = 0;
  }

  /** Reset to `count` electrons, all in the ground state. */
  setElectronCount(count) {
    const n = clamp(Math.round(count), 0, MAX_Z + 10);
    const shells = this.groundShells(n);
    this.electrons = shells.map((shell, i) => ({
      id: nextId++, n: shell, ground: shell, angle: (i * 2.39996) % TAU, alive: true,
    }));
  }

  groundShells(count) {
    const out = [];
    for (const s of configuration(count)) for (let k = 0; k < s.count; k++) out.push(s.n);
    return out;
  }

  /** Re-derive ground shells after adding/removing electrons, keeping excitations where possible. */
  regroundElectrons() {
    const shells = this.groundShells(this.electrons.length);
    const sorted = [...this.electrons].sort((a, b) => a.ground - b.ground);
    sorted.forEach((e, i) => {
      const wasExcited = e.n > e.ground;
      e.ground = shells[i];
      if (!wasExcited || e.n < e.ground) e.n = e.ground;
    });
  }

  /** Screened nuclear charge felt by electron e at level n. */
  zEff(e, n = e.n) {
    let screen = 0;
    for (const o of this.electrons) {
      if (o === e) continue;
      if (o.n < n) screen += 1;
      else if (o.n === n) screen += 0.35;
    }
    return Math.max(1, this.Z - screen);
  }

  /** Energy (eV) of electron e if it sat at level n (negative = bound). */
  levelEnergy(e, n) {
    if (this.Z === 0) return 0;
    const z = this.zEff(e, n);
    return (-RYDBERG_EV * z * z) / (n * n);
  }

  capacity(n) {
    return 2 * n * n;
  }

  occupancy(n) {
    let c = 0;
    for (const e of this.electrons) if (e.n === n) c++;
    return c;
  }

  outermost() {
    let best = null;
    for (const e of this.electrons) if (!best || e.n > best.n || (e.n === best.n && e.id > best.id)) best = e;
    return best;
  }

  /** Raise electron e to a higher level, or ionise it beyond MAX_LEVEL. Returns absorbed energy (eV). */
  excite(e, target) {
    const from = e.n;
    if (target > MAX_LEVEL) {
      const absorbed = -this.levelEnergy(e, from);
      this.ionize(e);
      return absorbed;
    }
    if (target <= from || this.occupancy(target) >= this.capacity(target)) return 0;
    e.n = target;
    return this.levelEnergy(e, target) - this.levelEnergy(e, from);
  }

  ionize(e) {
    this.electrons = this.electrons.filter((o) => o !== e);
    e.alive = false;
    this.spawnParticle('electron', e);
  }

  /** Electron e drops to level `to`, emitting a photon. */
  emit(e, to) {
    const dE = this.levelEnergy(e, e.n) - this.levelEnergy(e, to);
    e.n = to;
    if (dE <= 0) return null;
    const nm = wavelengthNm(dE);
    this.photons++;
    this.lastLine = nm;
    this.lines.push(nm);
    if (this.lines.length > 300) this.lines.shift();
    this.spawnParticle('photon', e, nm);
    return nm;
  }

  spawnParticle(kind, e, nm) {
    const ang = e ? e.angle : this.rng.range(0, TAU);
    const r0 = e ? this.shellRadius(e.n) : 0.5;
    this.particles.push({ kind, nm, x: Math.cos(ang) * r0, y: Math.sin(ang) * r0, dx: Math.cos(ang), dy: Math.sin(ang), life: 2.5 });
  }

  step(dt) {
    const P = this.params;
    this.time += dt;
    // Spontaneous emission: excited electrons fall to a lower level with a vacancy.
    for (const e of [...this.electrons]) {
      if (e.n <= e.ground) continue;
      if (this.rng.next() > 1 - Math.exp(-P.emissionRate * dt)) continue;
      const options = [];
      for (let n = e.ground; n < e.n; n++) if (this.occupancy(n) < this.capacity(n)) options.push(n);
      if (options.length) this.emit(e, this.rng.pick(options));
    }
    // Recombination: a positive ion captures a free electron into a high level,
    // which then cascades down emitting a recombination spectrum.
    const charge = this.Z - this.electrons.length;
    if (P.recombination && charge > 0 && this.occupancy(MAX_LEVEL) < this.capacity(MAX_LEVEL) && this.rng.next() < 1 - Math.exp(-0.4 * charge * dt)) {
      const e = { id: nextId++, n: MAX_LEVEL, ground: MAX_LEVEL, angle: this.rng.range(0, TAU), alive: true };
      this.electrons.push(e);
      this.regroundElectrons();
      e.n = MAX_LEVEL; // arrives at the top before cascading
    }
    // Auto-detachment: an atom can hold at most one surplus electron (a −1 ion,
    // as after alpha decay or when electrons are added by hand); extra
    // electrons are too weakly bound and fly off.
    const surplus = this.electrons.length - this.Z - 1;
    if (surplus > 0) {
      let lost = 0;
      for (let k = 0; k < surplus; k++) if (this.rng.next() < 1 - Math.exp(-4 * dt)) lost++;
      for (let k = 0; k < lost; k++) this.ionize(this.outermost());
      if (lost) this.regroundElectrons();
    }
    // Radioactive decay with a rate that grows with distance from stability.
    const mode = P.radioactivity ? decayMode(this.Z, this.N) : null;
    if (mode) {
      const A = this.Z + this.N;
      const excess = Math.abs(this.Z - stableZ(A)) - stabilityTolerance(A);
      const rate = 0.05 * P.decaySpeed * (mode === 'alpha' ? 1 : Math.exp(2 * excess));
      if (this.rng.next() < 1 - Math.exp(-rate * dt)) this.decay(mode);
    }
    for (const e of this.electrons) e.angle += (dt * P.orbitSpeed * 2.5) / (e.n * e.n) ** 0.75;
    for (const p of this.particles) {
      const v = p.kind === 'photon' ? 9 : p.kind === 'alpha' ? 3 : 6;
      p.x += p.dx * v * dt; p.y += p.dy * v * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  decay(mode) {
    const before = `${symbolOf(this.Z)}-${this.Z + this.N}`;
    if (mode === 'alpha') this.setNucleus(this.Z - 2, this.N - 2);
    else if (mode === 'beta-') this.setNucleus(this.Z + 1, this.N - 1);
    else this.setNucleus(this.Z - 1, this.N + 1);
    this.spawnParticle(mode === 'alpha' ? 'alpha' : 'beta', null);
    this.decays.push(`${before} → ${symbolOf(this.Z)}-${this.Z + this.N} (${mode === 'alpha' ? 'α' : mode === 'beta-' ? 'β⁻' : 'β⁺'})`);
    if (this.decays.length > 20) this.decays.shift();
    this.regroundElectrons();
  }

  // ---------- geometry ----------

  shellRadius(n) {
    return 1.8 + 1.35 * n;
  }

  nucleusRadius() {
    return 0.35 + 0.12 * Math.cbrt(Math.max(1, this.Z + this.N)) * 2.2;
  }

  electronPos(e) {
    const r = this.shellRadius(e.n);
    return [Math.cos(e.angle) * r, Math.sin(e.angle) * r];
  }

  bounds() {
    return { x: -12.5, y: -12.5, w: 25, h: 25 };
  }

  pick(x, y, r) {
    let best = null, bd = Math.max(r, 0.5) ** 2;
    for (const e of this.electrons) {
      const [ex, ey] = this.electronPos(e);
      const d = (ex - x) ** 2 + (ey - y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    if (best) return best;
    return x * x + y * y < (this.nucleusRadius() + 0.3) ** 2 ? this.nucleus : null;
  }

  locate(e) {
    if (e === this.nucleus) return { x: 0, y: 0, r: this.nucleusRadius() + 0.2 };
    if (!e.alive) return null;
    const [x, y] = this.electronPos(e);
    return { x, y, r: 0.4 };
  }

  add(kind, x, y) {
    if (kind === 'proton') { this.setNucleus(this.Z + 1, this.N); this.regroundElectrons(); return this.nucleus; }
    if (kind === 'neutron') { this.setNucleus(this.Z, this.N + 1); return this.nucleus; }
    if (kind === 'photon') { this.shine(1); return null; }
    if (this.electrons.length >= MAX_Z + 10) return null;
    const e = { id: nextId++, n: 1, ground: 1, angle: Math.atan2(y, x), alive: true };
    this.electrons.push(e);
    this.regroundElectrons();
    return e;
  }

  shine(count) {
    for (let k = 0; k < count; k++) {
      const e = this.outermost();
      const top = this.params.photonLevel;
      // The photon is only absorbed if it can lift the electron to a level ≤ top;
      // top = MAX_LEVEL + 1 means ionising ultraviolet.
      if (!e || e.n >= top) return;
      this.excite(e, e.n + 1 + Math.floor(this.rng.next() * (top - e.n)));
    }
  }

  remove(e) {
    if (e === this.nucleus) {
      if (this.Z > 0) this.setNucleus(this.Z - 1, this.N);
      else if (this.N > 0) this.setNucleus(0, this.N - 1);
      this.regroundElectrons();
      return;
    }
    this.ionize(e);
    this.regroundElectrons();
  }

  move() {}

  impulse(e, x, y, dx, dy) {
    if (!e || e === this.nucleus) return;
    const levels = Math.max(1, Math.round(Math.hypot(dx, dy) / 1.35));
    this.excite(e, e.n + levels);
  }

  energy(x, y, r, amount) {
    // Accumulate brush "dose" so a held brush delivers photons at a steady rate.
    this.dose = (this.dose || 0) + Math.abs(amount) * 6;
    while (this.dose >= 1) {
      this.dose -= 1;
      if (amount > 0) this.shine(1);
      else {
        const e = this.electrons.find((o) => o.n > o.ground);
        if (e) this.emit(e, e.ground);
      }
    }
  }

  describe(e) {
    if (e === this.nucleus) {
      const A = this.Z + this.N, B = bindingEnergy(this.Z, this.N), mode = decayMode(this.Z, this.N);
      return {
        title: `Nucleus: ${symbolOf(this.Z)}-${A}`,
        fields: [
          { key: 'Z', label: 'Protons (Z)', type: 'number', value: this.Z, step: 1 },
          { key: 'N', label: 'Neutrons (N)', type: 'number', value: this.N, step: 1 },
          { key: 'electrons', label: 'Electrons', type: 'number', value: this.electrons.length, step: 1 },
          { key: 'element', label: 'Element', type: 'readonly', value: nameOf(this.Z) },
          { key: 'B', label: 'Binding energy (MeV)', type: 'readonly', value: fmt(B) },
          { key: 'BA', label: 'Binding per nucleon (MeV)', type: 'readonly', value: A ? fmt(B / A) : '—' },
          { key: 'stable', label: 'Stability', type: 'readonly', value: mode ? `unstable (${mode === 'alpha' ? 'α' : mode === 'beta-' ? 'β⁻' : 'β⁺'} decay)` : 'stable' },
          { key: 'decayNow', label: 'Force a decay now', type: 'action' },
        ],
      };
    }
    const E = this.levelEnergy(e, e.n);
    return {
      title: `Electron #${e.id}`,
      fields: [
        { key: 'n', label: 'Energy level n', type: 'number', value: e.n, step: 1 },
        { key: 'ground', label: 'Ground-state level', type: 'readonly', value: e.ground },
        { key: 'E', label: 'Energy (eV)', type: 'readonly', value: fmt(E) },
        { key: 'zeff', label: 'Effective nuclear charge', type: 'readonly', value: fmt(this.zEff(e)) },
        { key: 'state', label: 'State', type: 'readonly', value: e.n > e.ground ? 'excited' : 'ground' },
        { key: 'relax', label: 'Emit photon (drop to ground)', type: 'action' },
        { key: 'ionize', label: 'Ionise (remove)', type: 'action' },
      ],
    };
  }

  setProperty(e, key, value) {
    if (e === this.nucleus) {
      if (key === 'Z') { this.setNucleus(value, this.N); this.regroundElectrons(); }
      else if (key === 'N') this.setNucleus(this.Z, value);
      else if (key === 'electrons') this.setElectronCount(value);
      else if (key === 'decayNow') { const m = decayMode(this.Z, this.N); if (m) this.decay(m); }
      return;
    }
    if (key === 'n') {
      const n = clamp(Math.round(value), e.ground, MAX_LEVEL + 1);
      if (n > e.n) this.excite(e, n);
      else if (n < e.n && this.occupancy(n) < this.capacity(n)) this.emit(e, n);
    } else if (key === 'relax') this.emit(e, e.ground);
    else if (key === 'ionize') { this.ionize(e); this.regroundElectrons(); }
  }

  saveState() {
    return {
      Z: this.Z, N: this.N, photons: this.photons, lastLine: this.lastLine, decayClock: this.decayClock,
      lines: this.lines, decays: this.decays,
      electrons: this.electrons.map(({ id, n, ground, angle }) => ({ id, n, ground, angle })),
    };
  }

  loadState(st) {
    this.setNucleus(st.Z, st.N);
    this.decayClock = st.decayClock || 0;
    this.photons = st.photons || 0;
    this.lastLine = st.lastLine ?? null;
    this.lines = (st.lines || []).filter(Number.isFinite);
    this.decays = (st.decays || []).map(String);
    this.electrons = st.electrons.slice(0, MAX_Z + 10).map((e) => ({
      id: e.id, n: clamp(e.n | 0, 1, MAX_LEVEL), ground: clamp(e.ground | 0, 1, MAX_LEVEL), angle: +e.angle || 0, alive: true,
    }));
    this.particles = [];
    nextId = Math.max(nextId, ...this.electrons.map((e) => e.id + 1));
  }

  ionizationEnergy() {
    const e = this.outermost();
    return e ? -this.levelEnergy(e, e.n) : 0;
  }

  stats() {
    const A = this.Z + this.N, charge = this.Z - this.electrons.length;
    const mode = decayMode(this.Z, this.N);
    return [
      { key: 'element', label: 'Element', value: `${nameOf(this.Z)} (${symbolOf(this.Z)})` },
      { key: 'isotope', label: 'Isotope', value: `${symbolOf(this.Z)}-${A}` },
      { key: 'charge', label: 'Charge (e)', value: charge },
      { key: 'config', label: 'Ground configuration', value: configString(this.electrons.length) },
      { key: 'ionization', label: 'Outer-electron binding (eV)', value: this.ionizationEnergy() },
      { key: 'bindingPerNucleon', label: 'Nuclear binding / nucleon (MeV)', value: A ? bindingEnergy(this.Z, this.N) / A : 0 },
      { key: 'stability', label: 'Nucleus', value: mode ? `radioactive (${mode})` : 'stable' },
      { key: 'photons', label: 'Photons emitted', value: this.photons },
      { key: 'lastLine', label: 'Last emission line (nm)', value: this.lastLine ?? '—' },
      { key: 'decays', label: 'Decay history', value: this.decays.length ? this.decays.slice(-3).join('; ') : 'none' },
    ];
  }

  render(ctx, view, ui) {
    const [cx, cy] = view.toScreen(0, 0);
    const s = view.scale;
    // Shells.
    const maxN = Math.max(1, ...this.electrons.map((e) => e.n), ...this.groundShells(this.electrons.length));
    for (let n = 1; n <= Math.max(maxN, 2); n++) {
      ctx.strokeStyle = n <= maxN ? 'rgba(110,150,230,0.35)' : 'rgba(110,150,230,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, this.shellRadius(n) * s, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(140,160,210,0.6)';
      ctx.font = '10px system-ui';
      ctx.fillText(`n=${n}`, cx + this.shellRadius(n) * s * 0.71 + 3, cy - this.shellRadius(n) * s * 0.71);
    }
    // Nucleus: protons and neutrons packed on a sunflower spiral.
    const A = this.Z + this.N, R = this.nucleusRadius() * s;
    const nr = Math.max(1.5, R / Math.sqrt(Math.max(A, 1)) * 0.95);
    for (let i = 0; i < A; i++) {
      const rr = R * Math.sqrt((i + 0.5) / Math.max(A, 1)), th = i * 2.39996;
      // Interleave protons and neutrons evenly.
      const isProton = Math.floor(((i + 1) * this.Z) / A) > Math.floor((i * this.Z) / A);
      ctx.fillStyle = isProton ? '#ff5a5a' : '#a0a6b4';
      ctx.beginPath(); ctx.arc(cx + Math.cos(th) * rr, cy + Math.sin(th) * rr, nr, 0, TAU); ctx.fill();
    }
    // Electrons.
    for (const e of this.electrons) {
      const [ex, ey] = this.electronPos(e);
      const [sx, sy] = view.toScreen(ex, ey);
      const excited = e.n > e.ground;
      if (excited) {
        ctx.fillStyle = 'rgba(255,220,90,0.25)';
        ctx.beginPath(); ctx.arc(sx, sy, 9, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = excited ? '#ffe066' : '#5ab0ff';
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(2.5, 0.22 * s), 0, TAU); ctx.fill();
    }
    // Emitted photons and decay particles.
    for (const p of this.particles) {
      const [sx, sy] = view.toScreen(p.x, p.y);
      ctx.globalAlpha = clamp(p.life / 2.5, 0, 1);
      if (p.kind === 'photon') {
        ctx.strokeStyle = spectrumColor(p.nm);
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let k = 0; k <= 12; k++) {
          const t = k / 12, along = -t * 1.6 * s, wob = Math.sin(t * Math.PI * 4) * 4;
          const px = sx + p.dx * along - p.dy * wob, py = sy + p.dy * along + p.dx * wob;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      } else {
        ctx.fillStyle = p.kind === 'alpha' ? '#ff9a4a' : p.kind === 'beta' ? '#7cf0ff' : '#5ab0ff';
        ctx.beginPath(); ctx.arc(sx, sy, p.kind === 'alpha' ? 6 : 3, 0, TAU); ctx.fill();
        if (p.kind === 'alpha') { ctx.fillStyle = '#000'; ctx.font = '9px system-ui'; ctx.fillText('α', sx - 3, sy + 3); }
      }
    }
    ctx.globalAlpha = 1;
    this.renderBadge(ctx);
    this.renderSpectrum(ctx, ui);
  }

  /** Element badge: symbol, Z and A, charge and name. */
  renderBadge(ctx) {
    const A = this.Z + this.N;
    ctx.fillStyle = 'rgba(17,22,38,0.9)';
    ctx.fillRect(14, 14, 150, 70);
    ctx.strokeStyle = '#2b3550';
    ctx.strokeRect(14, 14, 150, 70);
    ctx.fillStyle = '#dfe6f7';
    ctx.font = 'bold 30px system-ui';
    ctx.fillText(symbolOf(this.Z), 24, 52);
    ctx.font = '11px system-ui';
    ctx.fillStyle = '#9aa7c7';
    ctx.fillText(`Z=${this.Z}  A=${A}`, 90, 34);
    const charge = this.Z - this.electrons.length;
    ctx.fillText(charge === 0 ? 'neutral' : `ion ${charge > 0 ? '+' : ''}${charge}`, 90, 50);
    ctx.fillText(nameOf(this.Z).slice(0, 22), 24, 74);
  }

  renderSpectrum(ctx, ui) {
    const w = Math.min(520, ui.width - 40), h = 46, x0 = (ui.width - w) / 2, y0 = ui.height - h - 14;
    ctx.fillStyle = 'rgba(10,14,28,0.92)';
    ctx.fillRect(x0, y0, w, h);
    const lo = 90, hi = 1000;
    const px = (nm) => x0 + ((nm - lo) / (hi - lo)) * w;
    // Visible band backdrop.
    for (let nm = 380; nm <= 750; nm += 4) {
      ctx.fillStyle = spectrumColor(nm);
      ctx.globalAlpha = 0.12;
      ctx.fillRect(px(nm), y0, px(nm + 4) - px(nm) + 0.5, h - 14);
    }
    ctx.globalAlpha = 1;
    const seen = new Map();
    for (const nm of this.lines) {
      const key = Math.round(nm * 2) / 2;
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    for (const [nm, count] of seen) {
      if (nm < lo || nm > hi) continue;
      ctx.strokeStyle = spectrumColor(nm);
      ctx.globalAlpha = clamp(0.35 + count * 0.1, 0, 1);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px(nm), y0 + 2); ctx.lineTo(px(nm), y0 + h - 16); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#9aa7c7';
    ctx.font = '10px system-ui';
    for (const nm of [200, 400, 600, 800]) ctx.fillText(`${nm} nm`, px(nm) - 14, y0 + h - 3);
    ctx.fillText('Emission spectrum · UV', x0 + 4, y0 + 12);
    ctx.fillText('IR', px(850), y0 + 12);
  }
}
