import { Simulation } from '../core/simulation.js';
import { fmt, TAU } from '../core/math.js';
import { pick } from '../core/serialize.js';
import { BarnesHut } from '../core/barnes-hut.js';
import { Octree } from '../core/octree.js';

// Above this many massive bodies the Barnes–Hut tree beats the direct sum.
const TREE_MIN = 64;

// Units: length = AU, time = years, mass = solar masses  =>  G = 4π².
export const G_SI_UNITS = 4 * Math.PI * Math.PI;

const KINDS = {
  star: { label: 'Star (1 M☉)', mass: 1, radius: 0.00465, color: '#ffd76a', px: 7 },
  redDwarf: { label: 'Red dwarf (0.2 M☉)', mass: 0.2, radius: 0.001, color: '#ff8a5c', px: 5 },
  planet: { label: 'Rocky planet (1 M⊕)', mass: 3.0e-6, radius: 4.26e-5, color: '#6fa8ff', px: 3 },
  gasGiant: { label: 'Gas giant (1 M♃)', mass: 9.55e-4, radius: 4.67e-4, color: '#d9a066', px: 5 },
  moon: { label: 'Moon', mass: 3.7e-8, radius: 1.16e-5, color: '#cccccc', px: 2 },
  blackHole: { label: 'Black hole (10 M☉)', mass: 10, radius: 1e-6, color: '#a070ff', px: 6 },
  asteroid: { label: 'Asteroid (test particle)', mass: 0, radius: 1e-6, color: '#9a9a9a', px: 1.5 },
  dust: { label: 'Dust cloud (40 particles)', mass: 0, radius: 1e-6, color: '#c8b48a', px: 1.2 },
};

const SOLAR = [
  ['Mercury', 0.387, 1.66e-7, 1.63e-5, '#b5b5b5', 2],
  ['Venus', 0.723, 2.45e-6, 4.05e-5, '#e8c27a', 3],
  ['Earth', 1.0, 3.0e-6, 4.26e-5, '#6fa8ff', 3],
  ['Mars', 1.524, 3.23e-7, 2.27e-5, '#d0603d', 2.5],
  ['Jupiter', 5.203, 9.55e-4, 4.67e-4, '#d9a066', 5],
  ['Saturn', 9.537, 2.86e-4, 3.89e-4, '#e3cf8f', 4.5],
  ['Uranus', 19.19, 4.37e-5, 1.69e-4, '#9fe0e8', 4],
  ['Neptune', 30.07, 5.15e-5, 1.64e-4, '#5577ff', 4],
];

let nextId = 1;

/**
 * N-body gravity with a symplectic leapfrog integrator. Massive bodies attract
 * each other; "test particles" (mass 0) only feel massive bodies, which lets us
 * simulate thousands of galaxy stars or asteroids cheaply.
 */
export class GravitySim extends Simulation {
  static meta = {
    id: 'gravity',
    title: 'Gravity & Orbits',
    category: 'Space',
    description:
      'N-body gravity: planets, moons, stars, black holes and galaxies. Fling bodies, add new ones in orbit, change masses, turn on a dark-matter halo to flatten galactic rotation curves, or switch to full 3D for inclined orbits and tilted galaxies.',
    model: {
      summary: 'Newtonian N-body gravity in astronomical units (AU, years, solar masses), so G = 4π² and Earth orbits in one year.',
      equations: [
        'a_i = Σ_j G m_j (r_j − r_i) / (|r_j − r_i|² + ε²)^{3/2}',
        'Kick–drift–kick leapfrog: v += a·dt/2; x += v·dt; v += a·dt/2',
      ],
      assumptions: [
        'Point masses in a 2D plane, or in full 3D with the 3D physics option (inclined orbits); no relativity, tides or radiation pressure.',
        'Plummer softening ε avoids infinite forces at close approach.',
        'Colliding bodies merge, conserving mass and momentum (inelastic).',
        'Test particles (galaxy stars, asteroids) feel gravity but exert none.',
        'An optional flat-rotation-curve halo stands in for dark matter.',
        'Direct O(N²) sum for small systems; above 64 massive bodies a Barnes–Hut quadtree (an octree in 3D, opening angle θ) gives O(N log N) forces.',
      ],
      references: [
        'Hockney & Eastwood, Computer Simulation Using Particles (1988), leapfrog integration',
        'Chenciner & Montgomery (2000), the figure-eight three-body orbit',
        'Toomre & Toomre (1972), galactic bridges and tails',
        'Barnes & Hut (1986), A hierarchical O(N log N) force-calculation algorithm, Nature 324',
      ],
    },
  };

  constructor(opts) {
    super(opts);
    this.timeUnit = 'yr';
    this.bodies = [];
    this.defineParams([
      { key: 'yearsPerSecond', label: 'Time speed (yr/s)', type: 'range', min: 0.001, max: 100, value: 0.5, log: true },
      { key: 'gScale', label: 'Gravity strength (× G)', type: 'range', min: 0, max: 5, step: 0.01, value: 1 },
      // Must stay far below the closest orbit (the Moon is 0.0026 AU from Earth);
      // galaxies and clusters set their own, larger softening.
      { key: 'softening', label: 'Softening (AU)', type: 'range', min: 0.000001, max: 2, value: 0.00001, log: true },
      { key: 'maxStep', label: 'Max integration step (yr)', type: 'range', min: 0.0001, max: 0.05, value: 0.002, log: true },
      { key: 'theta', label: 'Tree opening angle θ (0 = exact)', type: 'range', min: 0, max: 1.2, step: 0.05, value: 0.6 },
      // Off by default: the 2D paths below stay untouched, so every 2D scenario
      // evolves bit-identically whether or not this mode exists.
      { key: 'threeD', label: '3D physics (z, inclined orbits)', type: 'checkbox', value: false },
      { key: 'haloV', label: 'Dark-matter halo speed (AU/yr)', type: 'range', min: 0, max: 80, step: 0.5, value: 0 },
      { key: 'merge', label: 'Merge on collision', type: 'checkbox', value: true },
      // Bodies are drawn far larger than life, so collisions use an enlarged radius.
      // 20× keeps the Moon (Earth–Moon distance ≈ 47 Earth radii) safely in orbit.
      { key: 'collisionScale', label: 'Collision radius ×', type: 'range', min: 1, max: 500, value: 20, log: true },
      { key: 'orbitOnAdd', label: 'New bodies start in orbit', type: 'checkbox', value: true },
      { key: 'trails', label: 'Show trails', type: 'checkbox', value: true },
    ]);
    this.spawnKinds = Object.entries(KINDS).map(([id, k]) => ({ id, label: k.label }));
    this.scenarios = [
      { id: 'solar', label: 'Solar System' },
      { id: 'earthMoon', label: 'Earth & Moon' },
      { id: 'binary', label: 'Binary star + circumbinary planet' },
      { id: 'figure8', label: 'Three-body figure-eight' },
      { id: 'galaxy', label: 'Spiral galaxy (test stars)' },
      { id: 'galaxyCollision', label: 'Galaxy collision' },
      { id: 'cluster', label: 'Star cluster (2000 self-gravitating stars)' },
      { id: 'inclined', label: 'Inclined orbits (3D)' },
      { id: 'galaxy3d', label: 'Galaxy collision in 3D (tilted disks)' },
      { id: 'lonelyStar', label: 'Lone star (launch your own planets)' },
      { id: 'empty', label: 'Empty space' },
    ];
    this.energyTool = { label: 'Heat (speed up)', negLabel: 'Cool (slow down)' };
    this.chartKeys = ['energy', 'bodies'];
    this.tree = new BarnesHut();
    this.acc = [0, 0];
    this.tree3 = new Octree();
    this.acc3 = [0, 0, 0];
    this.loadScenario('solar');
  }

  get G() {
    return G_SI_UNITS * this.params.gScale;
  }

  makeBody(kind, x, y, vx = 0, vy = 0, extra = {}) {
    const k = KINDS[kind] ?? KINDS.planet;
    return {
      id: nextId++,
      kind,
      name: extra.name ?? `${k.label.split(' (')[0]} ${nextId - 1}`,
      x, y, vx, vy, ax: 0, ay: 0,
      z: extra.z ?? 0, vz: extra.vz ?? 0, az: 0,
      m: extra.m ?? k.mass,
      radius: extra.radius ?? k.radius,
      color: extra.color ?? k.color,
      px: extra.px ?? k.px,
      trail: [],
      tz: [], // trail heights, one per trail point
      alive: true,
    };
  }

  addBody(b) {
    this.bodies.push(b);
    this.accDirty = true;
    return b;
  }

  loadScenario(id) {
    super.loadScenario(id);
    this.bodies = [];
    this.params.haloV = 0;
    for (const key of ['softening', 'merge', 'trails', 'collisionScale', 'threeD']) this.params[key] = this.paramDefs.find((d) => d.key === key).value;
    const rng = this.rng;
    rng.seed(42);
    const G = G_SI_UNITS;
    const circ = (M, r) => Math.sqrt((G * M) / r);

    if (id === 'solar') {
      this.params.yearsPerSecond = 0.5;
      this.params.maxStep = 0.002;
      const sun = this.addBody(this.makeBody('star', 0, 0, 0, 0, { name: 'Sun', px: 8 }));
      for (const [name, a, m, radius, color, px] of SOLAR) {
        const th = rng.range(0, TAU);
        const v = circ(1, a);
        const p = this.addBody(this.makeBody('planet', a * Math.cos(th), a * Math.sin(th), -v * Math.sin(th), v * Math.cos(th), { name, m, radius, color, px }));
        if (name === 'Earth') {
          const am = 0.00257, vm = circ(m, am);
          this.addBody(this.makeBody('moon', p.x + am, p.y, p.vx, p.vy + vm, { name: 'Moon' }));
        }
      }
      for (let i = 0; i < 300; i++) {
        const a = rng.range(2.2, 3.3), th = rng.range(0, TAU), v = circ(1, a);
        this.addBody(this.makeBody('asteroid', a * Math.cos(th), a * Math.sin(th), -v * Math.sin(th), v * Math.cos(th), { name: `Asteroid ${i}` }));
      }
      this.fixMomentum();
      this.view = { x: -6, y: -6, w: 12, h: 12 };
    } else if (id === 'earthMoon') {
      this.params.yearsPerSecond = 0.02;
      this.params.maxStep = 0.0002;
      const earth = this.addBody(this.makeBody('planet', 0, 0, 0, 0, { name: 'Earth', px: 8 }));
      const am = 0.00257, vm = circ(earth.m, am);
      this.addBody(this.makeBody('moon', am, 0, 0, vm, { name: 'Moon', px: 4 }));
      this.fixMomentum();
      this.view = { x: -0.004, y: -0.004, w: 0.008, h: 0.008 };
    } else if (id === 'binary') {
      this.params.yearsPerSecond = 1;
      const m1 = 1, m2 = 0.8, d = 1;
      const v = Math.sqrt((G * (m1 + m2)) / d);
      this.addBody(this.makeBody('star', (-d * m2) / (m1 + m2), 0, 0, (-v * m2) / (m1 + m2), { name: 'Star A', m: m1 }));
      this.addBody(this.makeBody('star', (d * m1) / (m1 + m2), 0, 0, (v * m1) / (m1 + m2), { name: 'Star B', m: m2, color: '#ffb36a' }));
      const a = 4, vp = circ(m1 + m2, a);
      this.addBody(this.makeBody('planet', a, 0, 0, vp, { name: 'Tatooine', px: 4 }));
      this.view = { x: -5, y: -5, w: 10, h: 10 };
    } else if (id === 'figure8') {
      // Chenciner–Montgomery orbit (G = m = 1), rescaled to G = 4π².
      this.params.yearsPerSecond = 0.05;
      this.params.maxStep = 0.0005;
      const m = 1 / G;
      const p = [0.97000436, -0.24308753], v = [0.466203685, 0.43236573];
      this.addBody(this.makeBody('star', p[0], p[1], v[0], v[1], { name: 'A', m }));
      this.addBody(this.makeBody('star', -p[0], -p[1], v[0], v[1], { name: 'B', m, color: '#7fd0ff' }));
      this.addBody(this.makeBody('star', 0, 0, -2 * v[0], -2 * v[1], { name: 'C', m, color: '#ff7f9f' }));
      this.view = { x: -1.5, y: -1.5, w: 3, h: 3 };
    } else if (id === 'galaxy') {
      this.params.yearsPerSecond = 2;
      this.params.maxStep = 0.01;
      this.params.haloV = 30;
      this.makeGalaxy(0, 0, 0, 0, 1e4, 1500, 60, 1);
      this.view = { x: -70, y: -70, w: 140, h: 140 };
    } else if (id === 'galaxyCollision') {
      this.params.yearsPerSecond = 3;
      this.params.maxStep = 0.01;
      // A grazing (not head-on) encounter raises tidal tails. The cores are
      // softened so their close passage stays resolvable at this time step.
      this.params.softening = 1;
      this.makeGalaxy(-60, -22, 9, 0, 1e4, 900, 35, 1);
      this.makeGalaxy(60, 22, -9, 0, 6e3, 600, 28, -1);
      this.fixMomentum(); // centre-of-momentum frame, so the merger stays in view
      this.view = { x: -110, y: -80, w: 220, h: 160 };
    } else if (id === 'cluster') {
      // Crossing time ≈ √(a³ / GM) ≈ 18 yr for a = 200 AU and M ≈ 600 M☉.
      this.params.yearsPerSecond = 5;
      this.params.maxStep = 0.5;
      // Close two-star encounters dominate the energy error; 3 AU softening
      // (well under the ~8 AU mean star spacing) keeps drift to ~1 % per century.
      this.params.softening = 3;
      this.params.merge = false;
      this.params.trails = false;
      this.makeCluster(0, 0, 2000, 200, 1);
      this.view = { x: -700, y: -700, w: 1400, h: 1400 };
    } else if (id === 'inclined') {
      // Circular orbits tilted out of the reference plane, and one retrograde.
      this.params.threeD = true;
      this.params.yearsPerSecond = 0.5;
      this.params.maxStep = 0.002;
      this.addBody(this.makeBody('star', 0, 0, 0, 0, { name: 'Sun', px: 8 }));
      const orbits = [['Flat', 0.6, 0], ['Tilt 15°', 1, 15], ['Tilt 30°', 1.5, 30], ['Polar', 2.2, 90], ['Retrograde', 3, 150]];
      for (const [name, a, inc] of orbits) {
        const th = rng.range(0, TAU), v = circ(1, a), i = (inc * Math.PI) / 180;
        const [x, y, z] = tilt(a * Math.cos(th), a * Math.sin(th), i, 0);
        const [vx, vy, vz] = tilt(-v * Math.sin(th), v * Math.cos(th), i, 0);
        this.addBody(this.makeBody('planet', x, y, vx, vy, { name, z, vz, px: 3 }));
      }
      this.fixMomentum();
      this.view = { x: -4, y: -4, w: 8, h: 8 };
    } else if (id === 'galaxy3d') {
      // Two disks tilted against each other and against their orbit: the tidal
      // tails leave the plane, which a 2D model cannot show.
      this.params.threeD = true;
      this.params.yearsPerSecond = 3;
      this.params.maxStep = 0.01;
      this.params.softening = 1;
      this.placeGalaxy([-60, -22, -12], [9, 0, 1.5], 1e4, 900, 35, 1, 0.6, 0.3);
      this.placeGalaxy([60, 22, 12], [-9, 0, -1.5], 6e3, 600, 28, -1, 1.1, 2.2);
      this.fixMomentum();
      this.view = { x: -110, y: -80, w: 220, h: 160 };
    } else if (id === 'lonelyStar') {
      this.params.yearsPerSecond = 0.5;
      this.params.maxStep = 0.002;
      this.addBody(this.makeBody('star', 0, 0, 0, 0, { name: 'Sun', px: 8 }));
      this.view = { x: -3, y: -3, w: 6, h: 6 };
    } else {
      this.view = { x: -5, y: -5, w: 10, h: 10 };
    }
    this.accDirty = true;
  }

  makeGalaxy(cx, cy, vx, vy, M, n, R, spin) {
    const G = G_SI_UNITS;
    // The core stands for a supermassive black hole plus dense bulge: give it a
    // finite size so two cores that meet merge instead of slingshotting.
    const core = this.addBody(this.makeBody('blackHole', cx, cy, vx, vy, { name: 'Galactic core', m: M, px: 6, radius: 0.15 }));
    for (let i = 0; i < n; i++) {
      // Exponential-ish disk with two spiral arms seeded by angle perturbation.
      const r = 4 + R * Math.pow(this.rng.next(), 1.3);
      const arm = this.rng.next() < 0.5 ? 0 : Math.PI;
      const th = arm + r * 0.08 + this.rng.gaussian(0, 0.45);
      const halo = this.params.haloV;
      const v = Math.sqrt((G * M) / r + halo * halo) * spin;
      const x = cx + r * Math.cos(th), y = cy + r * Math.sin(th);
      const hue = 200 + this.rng.range(-30, 40);
      this.addBody(this.makeBody('asteroid', x, y, vx - v * Math.sin(th), vy + v * Math.cos(th), {
        name: `Star ${i}`, color: `hsl(${hue},70%,${this.rng.range(65, 90)}%)`, px: 1.4,
      }));
    }
    return core;
  }

  /**
   * A galaxy built flat at the origin, then tilted by `inc` about the line of
   * nodes at angle `node` and moved to `at` with velocity `vel` (3D only).
   */
  placeGalaxy(at, vel, M, n, R, spin, inc, node) {
    const first = this.bodies.length;
    this.makeGalaxy(0, 0, 0, 0, M, n, R, spin);
    for (let i = first; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      [b.x, b.y, b.z] = tilt(b.x, b.y, inc, node);
      [b.vx, b.vy, b.vz] = tilt(b.vx, b.vy, inc, node);
      b.x += at[0]; b.y += at[1]; b.z += at[2];
      b.vx += vel[0]; b.vy += vel[1]; b.vz += vel[2];
    }
  }

  /**
   * Plummer-sphere star cluster (projected into the plane) with n stars drawn
   * from a 0.1–2 M☉ power law, in rough virial equilibrium.
   */
  makeCluster(cx, cy, n, a, virial) {
    const rng = this.rng, G = G_SI_UNITS;
    const stars = [];
    let M = 0;
    for (let i = 0; i < n; i++) {
      const m = 0.1 * Math.pow(20, Math.pow(rng.next(), 2.5));
      // Plummer radius from the inverse cumulative mass, capped to avoid far outliers.
      const u = Math.min(0.98, rng.next());
      const r = a / Math.sqrt(Math.pow(u, -2 / 3) - 1);
      const th = rng.range(0, TAU);
      stars.push({ m, x: cx + r * Math.cos(th), y: cy + r * Math.sin(th) });
      M += m;
    }
    for (const [i, s] of stars.entries()) {
      const r = Math.hypot(s.x - cx, s.y - cy);
      // Isotropic random velocities with the local Plummer dispersion σ² = GM / (6√(r² + a²)).
      const sigma = Math.sqrt((virial * G * M) / (6 * Math.sqrt(r * r + a * a)));
      const hue = s.m > 1 ? 45 : s.m > 0.4 ? 25 : 10;
      this.addBody(this.makeBody('redDwarf', s.x, s.y, rng.gaussian(0, sigma), rng.gaussian(0, sigma), {
        name: `Star ${i + 1}`, m: s.m, color: `hsl(${hue},90%,${55 + 25 * Math.min(1, s.m / 2)}%)`, px: 1.4 + Math.min(2, s.m),
      }));
    }
    this.fixMomentum();
  }

  fixMomentum() {
    let px = 0, py = 0, pz = 0, m = 0;
    for (const b of this.bodies) { px += b.m * b.vx; py += b.m * b.vy; pz += b.m * b.vz; m += b.m; }
    if (!m) return;
    for (const b of this.bodies) { b.vx -= px / m; b.vy -= py / m; b.vz -= pz / m; }
  }

  onParamChange(key, value) {
    // Leaving 3D projects everything onto the orbital plane.
    if (key === 'threeD' && !value) {
      for (const b of this.bodies) { b.z = 0; b.vz = 0; b.az = 0; b.tz.fill(0); }
      this.accDirty = true;
    }
  }

  bounds() {
    return this.view;
  }

  saveState() {
    return {
      view: this.view,
      bodies: this.bodies.map((b) => pick(b, ['id', 'kind', 'name', 'x', 'y', ...(this.params.threeD ? ['z'] : []), 'vx', 'vy', ...(this.params.threeD ? ['vz'] : []), 'm', 'radius', 'color', 'px'])),
    };
  }

  loadState(st) {
    this.view = st.view;
    this.bodies = st.bodies.map((b) => ({ ...this.makeBody(b.kind, b.x, b.y, b.vx, b.vy), ...b, trail: [], tz: [], alive: true }));
    nextId = Math.max(nextId, ...this.bodies.map((b) => b.id + 1));
    this.accDirty = true;
  }

  computeAcc() {
    if (this.params.threeD) { this.computeAcc3(); return; }
    const bs = this.bodies, G = this.G, eps2 = this.params.softening ** 2;
    const massive = [];
    for (const b of bs) { b.ax = 0; b.ay = 0; if (b.m > 0) massive.push(b); }
    const theta = this.params.theta;
    if (theta > 0 && massive.length >= TREE_MIN) {
      const tree = this.tree.build(massive), out = this.acc;
      for (let i = 0; i < massive.length; i++) {
        const b = massive[i];
        tree.accel(b.x, b.y, i, G, eps2, theta, out);
        b.ax = out[0]; b.ay = out[1];
      }
      for (const t of bs) {
        if (t.m > 0) continue;
        tree.accel(t.x, t.y, -1, G, eps2, theta, out);
        t.ax = out[0]; t.ay = out[1];
      }
    } else {
      this.directAcc(bs, massive, G, eps2);
    }
    // Optional isothermal dark-matter halo around the heaviest body: a = v₀²/r.
    const v0 = this.params.haloV;
    if (v0 > 0 && massive.length) {
      const c = massive.reduce((p, q) => (q.m > p.m ? q : p));
      for (const b of bs) {
        if (b === c) continue;
        const dx = c.x - b.x, dy = c.y - b.y;
        const r2 = dx * dx + dy * dy + 1;
        const k = (v0 * v0) / r2;
        b.ax += dx * k; b.ay += dy * k;
      }
    }
    this.accDirty = false;
  }

  /** The 3D counterpart of computeAcc: an octree instead of a quadtree, and z everywhere. */
  computeAcc3() {
    const bs = this.bodies, G = this.G, eps2 = this.params.softening ** 2;
    const massive = [];
    for (const b of bs) { b.ax = 0; b.ay = 0; b.az = 0; if (b.m > 0) massive.push(b); }
    const theta = this.params.theta;
    if (theta > 0 && massive.length >= TREE_MIN) {
      const tree = this.tree3.build(massive), out = this.acc3;
      for (let i = 0; i < massive.length; i++) {
        const b = massive[i];
        tree.accel(b.x, b.y, b.z, i, G, eps2, theta, out);
        b.ax = out[0]; b.ay = out[1]; b.az = out[2];
      }
      for (const t of bs) {
        if (t.m > 0) continue;
        tree.accel(t.x, t.y, t.z, -1, G, eps2, theta, out);
        t.ax = out[0]; t.ay = out[1]; t.az = out[2];
      }
    } else {
      this.directAcc3(bs, massive, G, eps2);
    }
    const v0 = this.params.haloV;
    if (v0 > 0 && massive.length) {
      const c = massive.reduce((p, q) => (q.m > p.m ? q : p));
      for (const b of bs) {
        if (b === c) continue;
        const dx = c.x - b.x, dy = c.y - b.y, dz = c.z - b.z;
        const k = (v0 * v0) / (dx * dx + dy * dy + dz * dz + 1);
        b.ax += dx * k; b.ay += dy * k; b.az += dz * k;
      }
    }
    this.accDirty = false;
  }

  directAcc3(bs, massive, G, eps2) {
    for (let i = 0; i < massive.length; i++) {
      const a = massive[i];
      for (let j = i + 1; j < massive.length; j++) {
        const b = massive[j];
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const r2 = dx * dx + dy * dy + dz * dz + eps2;
        const inv = G / (r2 * Math.sqrt(r2));
        a.ax += dx * inv * b.m; a.ay += dy * inv * b.m; a.az += dz * inv * b.m;
        b.ax -= dx * inv * a.m; b.ay -= dy * inv * a.m; b.az -= dz * inv * a.m;
      }
    }
    for (const t of bs) {
      if (t.m > 0) continue;
      for (const s of massive) {
        const dx = s.x - t.x, dy = s.y - t.y, dz = s.z - t.z;
        const r2 = dx * dx + dy * dy + dz * dz + eps2;
        const inv = (G * s.m) / (r2 * Math.sqrt(r2));
        t.ax += dx * inv; t.ay += dy * inv; t.az += dz * inv;
      }
    }
  }

  /** Exact pairwise sum: massive bodies attract each other; test particles feel them. */
  directAcc(bs, massive, G, eps2) {
    for (let i = 0; i < massive.length; i++) {
      const a = massive[i];
      for (let j = i + 1; j < massive.length; j++) {
        const b = massive[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const r2 = dx * dx + dy * dy + eps2;
        const inv = G / (r2 * Math.sqrt(r2));
        a.ax += dx * inv * b.m; a.ay += dy * inv * b.m;
        b.ax -= dx * inv * a.m; b.ay -= dy * inv * a.m;
      }
    }
    for (const t of bs) {
      if (t.m > 0) continue;
      for (const s of massive) {
        const dx = s.x - t.x, dy = s.y - t.y;
        const r2 = dx * dx + dy * dy + eps2;
        const inv = (G * s.m) / (r2 * Math.sqrt(r2));
        t.ax += dx * inv; t.ay += dy * inv;
      }
    }
  }

  /** Advance simulated time by `simDt` years using kick-drift-kick leapfrog. */
  advance(simDt) {
    if (simDt <= 0) return;
    const n = Math.min(500, Math.max(1, Math.ceil(simDt / this.params.maxStep)));
    const h = simDt / n;
    if (this.accDirty) this.computeAcc();
    if (this.params.threeD) { this.leapfrog3(n, h); this.time += simDt; return; }
    const bs = this.bodies;
    for (let s = 0; s < n; s++) {
      for (const b of bs) {
        b.vx += 0.5 * h * b.ax; b.vy += 0.5 * h * b.ay;
        b.x += h * b.vx; b.y += h * b.vy;
      }
      this.computeAcc();
      for (const b of bs) { b.vx += 0.5 * h * b.ax; b.vy += 0.5 * h * b.ay; }
      if (this.params.merge) this.collide();
    }
    this.time += simDt;
  }

  /** n kick–drift–kick steps of size h in 3D (separate so the 2D loop stays as it was). */
  leapfrog3(n, h) {
    for (let s = 0; s < n; s++) {
      // Re-read each step: a merger replaces the array.
      for (const b of this.bodies) {
        b.vx += 0.5 * h * b.ax; b.vy += 0.5 * h * b.ay; b.vz += 0.5 * h * b.az;
        b.x += h * b.vx; b.y += h * b.vy; b.z += h * b.vz;
      }
      this.computeAcc3();
      for (const b of this.bodies) { b.vx += 0.5 * h * b.ax; b.vy += 0.5 * h * b.ay; b.vz += 0.5 * h * b.az; }
      if (this.params.merge) this.collide();
    }
  }

  step(dt) {
    this.advance(dt * this.params.yearsPerSecond);
    if (this.params.trails) {
      for (const b of this.bodies) {
        if (b.m === 0 && this.bodies.length > 200) continue;
        b.trail.push(b.x, b.y);
        b.tz.push(b.z);
        if (b.trail.length > 400) { b.trail.splice(0, 2); b.tz.splice(0, 1); }
      }
    }
  }

  collide() {
    const massive = this.bodies.filter((b) => b.m > 0);
    const k = this.params.collisionScale;
    let changed = false;
    for (let i = 0; i < massive.length; i++) {
      const a = massive[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < massive.length; j++) {
        const b = massive[j];
        if (!b.alive) continue;
        const rr = (a.radius + b.radius) * k;
        // In 2D every z is 0, so the extra terms add exactly nothing.
        if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2 < rr * rr) {
          // Perfectly inelastic merger conserving mass and momentum.
          const [big, small] = a.m >= b.m ? [a, b] : [b, a];
          const m = big.m + small.m;
          big.x = (big.x * big.m + small.x * small.m) / m;
          big.y = (big.y * big.m + small.y * small.m) / m;
          big.z = (big.z * big.m + small.z * small.m) / m;
          big.vx = (big.vx * big.m + small.vx * small.m) / m;
          big.vy = (big.vy * big.m + small.vy * small.m) / m;
          big.vz = (big.vz * big.m + small.vz * small.m) / m;
          big.radius = Math.cbrt(big.radius ** 3 + small.radius ** 3);
          big.m = m;
          small.alive = false;
          changed = true;
        }
      }
    }
    // Test particles that fall into a massive body are absorbed.
    for (const t of this.bodies) {
      if (t.m > 0 || !t.alive) continue;
      for (const s of massive) {
        if (!s.alive) continue;
        const rr = s.radius * k;
        if ((t.x - s.x) ** 2 + (t.y - s.y) ** 2 + (t.z - s.z) ** 2 < rr * rr) { t.alive = false; changed = true; break; }
      }
    }
    if (changed) {
      this.bodies = this.bodies.filter((b) => b.alive);
      this.computeAcc();
    }
  }

  dominantAttractor(x, y, exclude, z = 0) {
    let best = null, bestA = 0;
    for (const b of this.bodies) {
      if (b.m <= 0 || b === exclude) continue;
      const a = b.m / ((b.x - x) ** 2 + (b.y - y) ** 2 + (b.z - z) ** 2 + 1e-12);
      if (a > bestA) { bestA = a; best = b; }
    }
    return best;
  }

  add(kind, x, y) {
    const spawn = (k, px, py) => {
      const b = this.makeBody(k, px, py);
      const host = this.params.orbitOnAdd ? this.dominantAttractor(px, py) : null;
      if (host) {
        const dx = px - host.x, dy = py - host.y, r = Math.hypot(dx, dy) || 1e-9;
        const v = Math.sqrt((this.G * (host.m + b.m)) / r + (this.params.haloV ** 2));
        b.vx = host.vx - (v * dy) / r;
        b.vy = host.vy + (v * dx) / r;
        // In 3D, start in the host's horizontal plane.
        if (this.params.threeD) { b.z = host.z; b.vz = host.vz; }
      }
      return this.addBody(b);
    };
    if (kind === 'dust') {
      const spread = this.view.w * 0.02;
      for (let i = 0; i < 40; i++) spawn('dust', x + this.rng.gaussian(0, spread), y + this.rng.gaussian(0, spread));
      return null;
    }
    return spawn(kind, x, y);
  }

  pick(x, y, r) {
    let best = null, bd = r * r;
    for (const b of this.bodies) {
      const d = (b.x - x) ** 2 + (b.y - y) ** 2;
      // Prefer massive bodies when overlapping test particles.
      const score = b.m > 0 ? d * 0.25 : d;
      if (score < bd) { bd = score; best = b; }
    }
    return best;
  }

  locate(b) {
    return b.alive ? { x: b.x, y: b.y, px: b.px + 4 } : null;
  }

  remove(b) {
    b.alive = false;
    this.bodies = this.bodies.filter((o) => o !== b);
    this.accDirty = true;
  }

  move(b, x, y) {
    b.x = x; b.y = y; b.trail = []; b.tz = [];
    this.accDirty = true;
  }

  impulse(b, x, y, dx, dy) {
    // Dragging 1 AU imparts 2 AU/yr (~9.5 km/s) of velocity.
    const k = 2;
    if (b) { b.vx += dx * k; b.vy += dy * k; }
  }

  energy(x, y, r, amount) {
    const inside = this.bodies.filter((b) => (b.x - x) ** 2 + (b.y - y) ** 2 < r * r);
    if (!inside.length) return;
    let m = 0, vx = 0, vy = 0, vz = 0;
    for (const b of inside) { const w = b.m || 1e-12; m += w; vx += b.vx * w; vy += b.vy * w; vz += b.vz * w; }
    vx /= m; vy /= m; vz /= m;
    const f = Math.exp(amount * 0.6);
    for (const b of inside) {
      b.vx = vx + (b.vx - vx) * f;
      b.vy = vy + (b.vy - vy) * f;
      b.vz = vz + (b.vz - vz) * f;
    }
  }

  describe(b) {
    const host = this.dominantAttractor(b.x, b.y, b, b.z);
    const d3 = this.params.threeD;
    const fields = [
      { key: 'name', label: 'Name', type: 'text', value: b.name },
      { key: 'kind', label: 'Type', type: 'readonly', value: KINDS[b.kind]?.label ?? b.kind },
      { key: 'm', label: 'Mass (M☉)', type: 'number', value: b.m },
      { key: 'massEarth', label: 'Mass (M⊕)', type: 'number', value: b.m / 3.0e-6 },
      { key: 'radius', label: 'Radius (AU)', type: 'number', value: b.radius },
      { key: 'x', label: 'x (AU)', type: 'number', value: b.x },
      { key: 'y', label: 'y (AU)', type: 'number', value: b.y },
      ...(d3 ? [{ key: 'z', label: 'z (AU)', type: 'number', value: b.z }] : []),
      { key: 'vx', label: 'vx (AU/yr)', type: 'number', value: b.vx },
      { key: 'vy', label: 'vy (AU/yr)', type: 'number', value: b.vy },
      ...(d3 ? [{ key: 'vz', label: 'vz (AU/yr)', type: 'number', value: b.vz }] : []),
      { key: 'speed', label: 'Speed (km/s)', type: 'readonly', value: fmt(Math.hypot(b.vx, b.vy, b.vz) * 4.74) },
    ];
    if (host) {
      const o = orbitalElements(b, host, this.G);
      fields.push(
        { key: 'host', label: 'Orbiting', type: 'readonly', value: host.name },
        { key: 'a', label: 'Semi-major axis (AU)', type: 'readonly', value: o.a > 0 ? fmt(o.a) : 'unbound' },
        { key: 'e', label: 'Eccentricity', type: 'readonly', value: fmt(o.e) },
        { key: 'period', label: 'Period (yr)', type: 'readonly', value: o.a > 0 ? fmt(o.period) : '—' },
      );
      if (d3) fields.push({ key: 'inclination', label: 'Inclination (°)', type: 'readonly', value: fmt(o.inclination) });
    }
    return { title: b.name, fields };
  }

  setProperty(b, key, value) {
    if (key === 'name') b.name = value;
    else if (key === 'massEarth') b.m = Math.max(0, value * 3.0e-6);
    else if (key === 'm') b.m = Math.max(0, value);
    else if (key in b) b[key] = value;
    if (key === 'x' || key === 'y' || key === 'z') { b.trail = []; b.tz = []; }
    this.accDirty = true;
  }

  totalEnergy() {
    const G = this.G, eps2 = this.params.softening ** 2;
    const ms = this.bodies.filter((b) => b.m > 0);
    let ke = 0, pe = 0;
    for (let i = 0; i < ms.length; i++) {
      const a = ms[i];
      ke += 0.5 * a.m * (a.vx * a.vx + a.vy * a.vy + a.vz * a.vz);
      for (let j = i + 1; j < ms.length; j++) {
        const b = ms[j];
        pe -= (G * a.m * b.m) / Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2 + eps2);
      }
    }
    return ke + pe;
  }

  stats() {
    const massive = this.bodies.filter((b) => b.m > 0).length;
    return [
      { key: 'bodies', label: 'Bodies', value: this.bodies.length },
      { key: 'massive', label: 'Massive bodies', value: massive },
      { key: 'energy', label: 'Total energy (M☉AU²/yr²)', value: this.totalEnergy() },
    ];
  }

  render(ctx, view) {
    const bs = this.bodies;
    if (this.params.trails) {
      ctx.lineWidth = 1;
      for (const b of bs) {
        if (b.trail.length < 4) continue;
        ctx.strokeStyle = b.color;
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        for (let i = 0; i < b.trail.length; i += 2) {
          const [sx, sy] = view.toScreen(b.trail[i], b.trail[i + 1]);
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    for (const b of bs) {
      const [sx, sy] = view.toScreen(b.x, b.y);
      const r = Math.max(b.px, b.radius * view.scale);
      if (b.kind === 'blackHole') {
        ctx.fillStyle = '#000';
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill(); ctx.stroke();
        continue;
      }
      if (b.kind === 'star' || b.kind === 'redDwarf') {
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3);
        g.addColorStop(0, b.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(sx, sy, r * 3, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = b.color;
      if (r <= 1.6) { ctx.fillRect(sx - r / 2, sy - r / 2, r, r); continue; }
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
    }
    // Labels for named massive bodies.
    ctx.fillStyle = 'rgba(220,230,255,0.75)';
    ctx.font = '11px system-ui, sans-serif';
    for (const b of bs) {
      if (b.m <= 0 || bs.length > 60 && b.m < 1e-7) continue;
      const [sx, sy] = view.toScreen(b.x, b.y);
      ctx.fillText(b.name, sx + b.px + 3, sy - b.px - 2);
    }
  }
}

/** Osculating orbital elements of body b relative to host (z, vz optional). */
export function orbitalElements(b, host, G) {
  const rx = b.x - host.x, ry = b.y - host.y, rz = (b.z ?? 0) - (host.z ?? 0);
  const vx = b.vx - host.vx, vy = b.vy - host.vy, vz = (b.vz ?? 0) - (host.vz ?? 0);
  const mu = G * (host.m + b.m);
  const r = Math.hypot(rx, ry, rz), v2 = vx * vx + vy * vy + vz * vz;
  const eps = v2 / 2 - mu / r;
  const a = -mu / (2 * eps);
  // Specific angular momentum h = r × v; its tilt from +z is the inclination.
  const hx = ry * vz - rz * vy, hy = rz * vx - rx * vz, hz = rx * vy - ry * vx;
  const h2 = hx * hx + hy * hy + hz * hz;
  const e = Math.sqrt(Math.max(0, 1 + (2 * eps * h2) / (mu * mu)));
  const period = a > 0 ? TAU * Math.sqrt((a * a * a) / mu) : Infinity;
  const inclination = h2 > 0 ? (Math.acos(Math.max(-1, Math.min(1, hz / Math.sqrt(h2)))) * 180) / Math.PI : 0;
  return { a, e, period, inclination };
}

/**
 * Rotate the in-plane vector (x, y, 0) by inclination `inc` (radians) about
 * the line of nodes at angle `node` in the plane (Rodrigues' formula).
 */
export function tilt(x, y, inc, node) {
  const ux = Math.cos(node), uy = Math.sin(node), c = Math.cos(inc), s = Math.sin(inc);
  const k = (ux * x + uy * y) * (1 - c);
  return [x * c + ux * k, y * c + uy * k, (ux * y - uy * x) * s];
}
