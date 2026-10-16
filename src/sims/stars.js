import { Simulation } from '../core/simulation.js';
import { blackbodyColor, clamp, fmt, rgb, TAU } from '../core/math.js';
import { evolve, mainSequenceLifetime, sampleSalpeter } from './stellar-model.js';

let nextId = 1;

/**
 * A stellar neighbourhood (light-years across) where nebulae collapse into
 * star clusters, stars burn through their lives on the Hertzsprung–Russell
 * diagram, and massive stars explode as supernovae whose shock waves can
 * trigger new star formation in nearby clouds.
 */
export class StarsSim extends Simulation {
  static meta = {
    id: 'stars',
    title: 'Stellar Life Cycles',
    category: 'Space',
    description:
      'Birth, life and death of stars. Nebulae form clusters, stars evolve into giants, white dwarfs, neutron stars and black holes. Change a star’s mass or age, feed it matter, or compress a nebula to trigger star formation. The HR diagram updates live.',
  };

  constructor(opts) {
    super(opts);
    this.timeUnit = 'Myr';
    this.background = '#020308';
    this.W = 200;
    this.H = 120;
    this.stars = [];
    this.nebulae = [];
    this.shocks = [];
    this.supernovae = 0;
    this.defineParams([
      { key: 'myrPerSecond', label: 'Time speed (Myr/s)', type: 'range', min: 0.01, max: 2000, value: 20, log: true },
      { key: 'formation', label: 'Star-formation efficiency', type: 'range', min: 0, max: 5, step: 0.05, value: 1 },
      { key: 'shockTrigger', label: 'Supernova-triggered formation', type: 'checkbox', value: true },
      { key: 'showHR', label: 'Show HR diagram', type: 'checkbox', value: true },
      { key: 'showLabels', label: 'Label bright stars', type: 'checkbox', value: false },
    ]);
    this.spawnKinds = [
      { id: 'sun', label: 'Sun-like star (1 M☉)' },
      { id: 'redDwarf', label: 'Red dwarf (0.3 M☉)' },
      { id: 'blue', label: 'Blue giant (15 M☉)' },
      { id: 'hyper', label: 'Very massive star (40 M☉)' },
      { id: 'random', label: 'Random (Salpeter IMF)' },
      { id: 'nebula', label: 'Molecular cloud (nebula)' },
    ];
    this.scenarios = [
      { id: 'nursery', label: 'Stellar nursery' },
      { id: 'cluster', label: 'Young open cluster' },
      { id: 'masses', label: 'Mass sequence (0.5 → 40 M☉)' },
      { id: 'old', label: 'Old globular cluster' },
      { id: 'empty', label: 'Empty region' },
    ];
    this.energyTool = { label: 'Feed matter / compress gas', negLabel: 'Strip mass' };
    this.chartKeys = ['stars', 'remnants'];
    this.loadScenario('nursery');
  }

  bounds() {
    return { x: 0, y: 0, w: this.W, h: this.H };
  }

  makeStar(mass, x, y, age = 0) {
    const s = {
      id: nextId++, mass, x, y, age,
      vx: this.rng.gaussian(0, 0.3), vy: this.rng.gaussian(0, 0.3), // ly/Myr
      alive: true, name: `Star ${nextId - 1}`,
    };
    s.state = evolve(mass, age);
    this.stars.push(s);
    return s;
  }

  makeNebula(x, y, mass = 600, r = 18) {
    const n = { id: nextId++, x, y, mass, r, alive: true, blobs: [], name: `Nebula ${nextId - 1}`, trigger: 0 };
    for (let i = 0; i < 14; i++) n.blobs.push([this.rng.gaussian(0, 0.4), this.rng.gaussian(0, 0.4), this.rng.range(0.4, 0.9), this.rng.range(0, 360)]);
    this.nebulae.push(n);
    return n;
  }

  loadScenario(id) {
    super.loadScenario(id);
    this.rng.seed(11);
    this.stars = []; this.nebulae = []; this.shocks = []; this.supernovae = 0;
    const P = this.params;
    if (id === 'nursery') {
      P.myrPerSecond = 2;
      this.makeNebula(60, 60, 900, 22);
      this.makeNebula(140, 50, 500, 16);
      for (let i = 0; i < 25; i++) this.makeStar(sampleSalpeter(this.rng), this.rng.range(10, 190), this.rng.range(10, 110), this.rng.range(0, 3000));
    } else if (id === 'cluster') {
      P.myrPerSecond = 5;
      for (let i = 0; i < 160; i++) this.makeStar(sampleSalpeter(this.rng), 100 + this.rng.gaussian(0, 20), 60 + this.rng.gaussian(0, 14), this.rng.range(0, 1));
    } else if (id === 'masses') {
      P.myrPerSecond = 20;
      const ms = [0.5, 0.8, 1, 1.5, 2, 3, 5, 8, 12, 20, 40];
      ms.forEach((m, i) => {
        const s = this.makeStar(m, 15 + i * 17, 60, 0);
        s.vx = s.vy = 0;
        s.name = `${m} M☉`;
      });
      P.showLabels = true;
    } else if (id === 'old') {
      P.myrPerSecond = 200;
      for (let i = 0; i < 300; i++) this.makeStar(sampleSalpeter(this.rng, 0.1, 3), 100 + this.rng.gaussian(0, 16), 60 + this.rng.gaussian(0, 16), 9000 + this.rng.range(0, 500));
    }
  }

  step(dt) {
    const dT = dt * this.params.myrPerSecond;
    this.time += dT;
    const P = this.params;
    for (const s of this.stars) {
      const before = s.state.phase;
      s.age += dT;
      s.x += s.vx * dT; s.y += s.vy * dT;
      if (s.x < 0 || s.x > this.W) s.vx = -s.vx;
      if (s.y < 0 || s.y > this.H) s.vy = -s.vy;
      s.x = clamp(s.x, 0, this.W); s.y = clamp(s.y, 0, this.H);
      s.state = evolve(s.mass, s.age);
      const after = s.state.phase;
      if (before !== after && (after === 'Neutron star' || after === 'Black hole')) {
        this.supernovae++;
        this.shocks.push({ x: s.x, y: s.y, r: 0, maxR: 40, energy: 1, kind: 'supernova' });
      } else if (before !== after && after === 'White dwarf') {
        this.shocks.push({ x: s.x, y: s.y, r: 0, maxR: 6, energy: 0.2, kind: 'nebula' });
      }
    }
    // Expanding shells (supernova remnants / planetary nebulae).
    for (const sh of this.shocks) {
      sh.r += dT * (sh.kind === 'supernova' ? 4 : 0.6);
      if (sh.kind === 'supernova' && P.shockTrigger) {
        for (const n of this.nebulae) {
          const d = Math.hypot(n.x - sh.x, n.y - sh.y);
          if (Math.abs(d - sh.r) < n.r) n.trigger = Math.max(n.trigger, 1.5);
        }
      }
    }
    this.shocks = this.shocks.filter((s) => s.r < s.maxR);
    // Star formation: rate ∝ mass, boosted when compressed.
    for (const n of this.nebulae) {
      n.trigger = Math.max(0, n.trigger - dT * 0.3);
      const rate = P.formation * (n.mass / 300) * (0.15 + n.trigger) * dT;
      let births = Math.floor(rate) + (this.rng.next() < rate % 1 ? 1 : 0);
      while (births-- > 0 && n.mass > 2) {
        const m = Math.min(n.mass, sampleSalpeter(this.rng));
        n.mass -= m * 3; // most gas is not converted into stars
        const a = this.rng.range(0, TAU), rr = Math.abs(this.rng.gaussian(0, n.r * 0.45));
        this.makeStar(m, n.x + rr * Math.cos(a), n.y + rr * Math.sin(a), 0);
      }
      n.r = Math.max(4, 22 * Math.sqrt(Math.max(n.mass, 0) / 900));
      if (n.mass <= 2) n.alive = false;
    }
    this.nebulae = this.nebulae.filter((n) => n.alive);
  }

  pick(x, y, r) {
    let best = null, bd = Math.max(r, 1.5) ** 2;
    for (const s of this.stars) {
      const d = (s.x - x) ** 2 + (s.y - y) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    if (best) return best;
    for (const n of this.nebulae) if ((n.x - x) ** 2 + (n.y - y) ** 2 < n.r * n.r) return n;
    return null;
  }

  locate(e) {
    if (!e.alive) return null;
    return e.blobs ? { x: e.x, y: e.y, r: e.r } : { x: e.x, y: e.y, px: this.starPx(e) + 4 };
  }

  add(kind, x, y) {
    const masses = { sun: 1, redDwarf: 0.3, blue: 15, hyper: 40 };
    if (kind === 'nebula') return this.makeNebula(x, y);
    const m = kind === 'random' ? sampleSalpeter(this.rng) : masses[kind] ?? 1;
    const s = this.makeStar(m, x, y, 0);
    s.vx = s.vy = 0;
    return s;
  }

  remove(e) {
    e.alive = false;
    this.stars = this.stars.filter((s) => s !== e);
    this.nebulae = this.nebulae.filter((n) => n !== e);
  }

  move(e, x, y) {
    e.x = x; e.y = y;
  }

  impulse(e, x, y, dx, dy) {
    if (e && !e.blobs) { e.vx += dx * 0.2; e.vy += dy * 0.2; }
  }

  energy(x, y, r, amount) {
    for (const s of this.stars) {
      if ((s.x - x) ** 2 + (s.y - y) ** 2 > r * r || s.state.remnantAge !== undefined) continue;
      // Accretion (or stripping) keeps the star at the same fractional age.
      const m2 = clamp(s.mass * Math.exp(amount * 0.5), 0.08, 150);
      s.age *= mainSequenceLifetime(m2) / mainSequenceLifetime(s.mass);
      s.mass = m2;
      s.state = evolve(s.mass, s.age);
    }
    for (const n of this.nebulae) {
      if ((n.x - x) ** 2 + (n.y - y) ** 2 > (r + n.r) ** 2) continue;
      if (amount > 0) n.trigger = Math.min(5, n.trigger + amount * 3);
      else n.mass = Math.max(0, n.mass * Math.exp(amount));
    }
  }

  describe(e) {
    if (e.blobs) {
      return { title: e.name, fields: [
        { key: 'mass', label: 'Gas mass (M☉)', type: 'number', value: e.mass },
        { key: 'trigger', label: 'Compression (0–5)', type: 'number', value: e.trigger, step: 0.1 },
        { key: 'r', label: 'Radius (ly)', type: 'readonly', value: fmt(e.r) },
      ] };
    }
    const st = e.state;
    const tms = mainSequenceLifetime(e.mass);
    return {
      title: `${e.name} — ${st.phase}`,
      fields: [
        { key: 'name', label: 'Name', type: 'text', value: e.name },
        { key: 'mass', label: 'Initial mass (M☉)', type: 'number', value: e.mass, step: 0.1 },
        { key: 'age', label: 'Age (Myr)', type: 'number', value: e.age, step: 10 },
        { key: 'phase', label: 'Phase', type: 'readonly', value: st.phase },
        { key: 'spectral', label: 'Spectral class', type: 'readonly', value: st.spectral },
        { key: 'T', label: 'Surface temp. (K)', type: 'readonly', value: Math.round(st.T) },
        { key: 'L', label: 'Luminosity (L☉)', type: 'readonly', value: fmt(st.L) },
        { key: 'R', label: 'Radius (R☉)', type: 'readonly', value: fmt(st.R) },
        { key: 'curMass', label: 'Current mass (M☉)', type: 'readonly', value: fmt(st.mass) },
        { key: 'tms', label: 'Main-sequence lifetime (Myr)', type: 'readonly', value: fmt(tms) },
      ],
    };
  }

  setProperty(e, key, value) {
    if (key === 'mass') e.mass = e.blobs ? Math.max(0, value) : clamp(value, 0.08, 150);
    else e[key] = value;
    if (!e.blobs) e.state = evolve(e.mass, e.age);
  }

  starPx(s) {
    const st = s.state;
    if (st.phase === 'Black hole') return 4;
    return clamp(2 + Math.log10(st.R + 1) * 3.2 + Math.log10(st.L + 1) * 0.6, 1.2, 16);
  }

  stats() {
    const count = {};
    for (const s of this.stars) count[s.state.phase] = (count[s.state.phase] || 0) + 1;
    const remnants = (count['White dwarf'] || 0) + (count['Neutron star'] || 0) + (count['Black hole'] || 0);
    return [
      { key: 'stars', label: 'Stars', value: this.stars.length },
      { key: 'ms', label: 'Main sequence', value: count['Main sequence'] || 0 },
      { key: 'giants', label: 'Giants', value: (count['Red giant'] || 0) + (count['Subgiant'] || 0) + (count['Red supergiant'] || 0) },
      { key: 'remnants', label: 'Remnants (WD/NS/BH)', value: remnants },
      { key: 'supernovae', label: 'Supernovae', value: this.supernovae },
      { key: 'gas', label: 'Nebular gas (M☉)', value: this.nebulae.reduce((a, n) => a + n.mass, 0) },
    ];
  }

  render(ctx, view, ui = {}) {
    for (const n of this.nebulae) {
      const glow = clamp(0.25 + n.trigger * 0.2, 0, 0.9);
      for (const [bx, by, br, hue] of n.blobs) {
        const [sx, sy] = view.toScreen(n.x + bx * n.r, n.y + by * n.r);
        const rr = br * n.r * view.scale;
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rr);
        g.addColorStop(0, `hsla(${300 + hue / 6},70%,55%,${glow * 0.5})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(sx, sy, rr, 0, TAU); ctx.fill();
      }
    }
    for (const sh of this.shocks) {
      const [sx, sy] = view.toScreen(sh.x, sh.y);
      const a = 1 - sh.r / sh.maxR;
      ctx.strokeStyle = sh.kind === 'supernova' ? `rgba(255,200,140,${a})` : `rgba(120,220,255,${a})`;
      ctx.lineWidth = sh.kind === 'supernova' ? 3 : 2;
      ctx.beginPath(); ctx.arc(sx, sy, sh.r * view.scale, 0, TAU); ctx.stroke();
    }
    ctx.font = '11px system-ui';
    for (const s of this.stars) {
      const st = s.state;
      const [sx, sy] = view.toScreen(s.x, s.y);
      const r = this.starPx(s);
      if (st.phase === 'Black hole') {
        ctx.fillStyle = '#000'; ctx.strokeStyle = '#b48cff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill(); ctx.stroke();
        continue;
      }
      const col = blackbodyColor(st.T);
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 2.5);
      g.addColorStop(0, rgb(col));
      g.addColorStop(0.4, rgb(col, 0.5));
      g.addColorStop(1, rgb(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sx, sy, r * 2.5, 0, TAU); ctx.fill();
      if (this.params.showLabels && (st.L > 10 || this.stars.length < 30)) {
        ctx.fillStyle = 'rgba(230,235,255,0.8)';
        ctx.fillText(`${s.name}: ${st.phase}`, sx + r + 4, sy - r);
      }
    }
    if (this.params.showHR) this.renderHR(ctx, ui);
  }

  renderHR(ctx, ui) {
    const w = 230, h = 170, selected = ui.selected;
    const x0 = ui.width - w - 12, y0 = ui.height - h - 12;
    ctx.fillStyle = 'rgba(10,14,28,0.85)';
    ctx.strokeStyle = '#2b3550';
    ctx.fillRect(x0, y0, w, h);
    ctx.strokeRect(x0, y0, w, h);
    ctx.fillStyle = '#9aa7c7';
    ctx.font = '10px system-ui';
    ctx.fillText('Hertzsprung–Russell diagram', x0 + 8, y0 + 13);
    ctx.fillText('← hotter   Temperature   cooler →', x0 + 30, y0 + h - 4);
    ctx.save();
    ctx.translate(x0 + 10, y0 + h / 2 + 30);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Luminosity →', 0, 0);
    ctx.restore();
    // log T from 4.7 (50 000 K) down to 3.4 (2 500 K); log L from -5 to 6.5.
    const px = (T) => x0 + 18 + ((4.7 - Math.log10(T)) / 1.3) * (w - 28);
    const py = (L) => y0 + 18 + ((6.5 - Math.log10(L)) / 11.5) * (h - 36);
    for (const s of this.stars) {
      const st = s.state;
      if (!st.T || st.L <= 0) continue;
      const x = px(clamp(st.T, 2500, 50000)), y = py(clamp(st.L, 1e-5, 3e6));
      ctx.fillStyle = s === selected ? '#fff' : rgb(blackbodyColor(st.T));
      ctx.fillRect(x - 1.5, y - 1.5, s === selected ? 5 : 3, s === selected ? 5 : 3);
    }
  }
}
