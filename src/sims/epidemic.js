import { Simulation } from '../core/simulation.js';
import { SpatialHash } from '../core/spatial-hash.js';
import { clamp, TAU } from '../core/math.js';

export const STATES = {
  S: { label: 'Susceptible', color: '#7fb2ff' },
  E: { label: 'Exposed (incubating)', color: '#ffd166' },
  I: { label: 'Infectious', color: '#ff4d4d' },
  R: { label: 'Recovered (immune)', color: '#6ee07a' },
  V: { label: 'Vaccinated', color: '#c58cff' },
  D: { label: 'Deceased', color: '#555' },
};

let nextId = 1;

/**
 * Agent-based SEIR epidemic: people move between home and a few hubs, infect
 * neighbours within a contact radius, incubate, recover or die, and may lose
 * immunity. Explore distancing, quarantine, vaccination and virulence.
 */
export class EpidemicSim extends Simulation {
  static meta = {
    id: 'epidemic',
    title: 'Epidemic Spread',
    category: 'Life',
    description:
      'Disease transmission between individuals (SEIR model). Tune infectiousness, incubation, mortality, distancing and quarantine; vaccinate regions or seed new outbreaks and watch the epidemic curve.',
  };

  constructor(opts) {
    super(opts);
    this.timeUnit = 'days';
    this.background = '#0b0e16';
    this.W = 600;
    this.H = 400;
    this.people = [];
    this.hash = new SpatialHash(20);
    this.defineParams([
      { key: 'speed', label: 'Steps per frame', type: 'range', min: 1, max: 20, step: 1, value: 3 },
      { key: 'radius', label: 'Contact radius', type: 'range', min: 2, max: 20, step: 0.5, value: 7 },
      { key: 'beta', label: 'Transmission chance / contact-day', type: 'range', min: 0, max: 2, step: 0.01, value: 0.6 },
      { key: 'incubation', label: 'Incubation (days)', type: 'range', min: 0, max: 14, step: 0.5, value: 4 },
      { key: 'infectious', label: 'Infectious period (days)', type: 'range', min: 1, max: 30, step: 0.5, value: 8 },
      { key: 'mortality', label: 'Fatality rate', type: 'range', min: 0, max: 0.5, step: 0.005, value: 0.02 },
      { key: 'waning', label: 'Immunity lasts (days, 0 = forever)', type: 'range', min: 0, max: 365, step: 5, value: 0 },
      { key: 'distancing', label: 'Social distancing', type: 'range', min: 0, max: 1, step: 0.05, value: 0 },
      { key: 'quarantine', label: 'Quarantine symptomatic', type: 'checkbox', value: false },
      { key: 'mobility', label: 'Mobility', type: 'range', min: 0, max: 3, step: 0.05, value: 1 },
    ]);
    this.spawnKinds = [
      { id: 'S', label: 'Healthy person' },
      { id: 'I', label: 'Infected person' },
      { id: 'crowd', label: 'Crowd of 30' },
    ];
    this.scenarios = [
      { id: 'town', label: 'Town outbreak' },
      { id: 'distanced', label: 'With social distancing' },
      { id: 'vaccinated', label: '60% vaccinated' },
      { id: 'endemic', label: 'Waning immunity (endemic)' },
    ];
    this.energyTool = { label: 'Vaccinate', negLabel: 'Infect' };
    this.chartKeys = ['S', 'I', 'R', 'D'];
    this.loadScenario('town');
  }

  bounds() {
    return { x: 0, y: 0, w: this.W, h: this.H };
  }

  makePerson(x, y, state = 'S') {
    const p = {
      id: nextId++, x, y, hx: x, hy: y, vx: 0, vy: 0, state, t: 0, alive: true,
      still: this.rng.next(), // personal propensity to stay home
      trip: null,
    };
    this.people.push(p);
    return p;
  }

  loadScenario(id) {
    super.loadScenario(id);
    this.rng.seed(5);
    this.people = [];
    const P = this.params;
    P.distancing = id === 'distanced' ? 0.7 : 0;
    P.waning = id === 'endemic' ? 120 : 0;
    this.hubs = [[150, 120], [450, 110], [300, 300]];
    for (let i = 0; i < 700; i++) this.makePerson(this.rng.range(5, this.W - 5), this.rng.range(5, this.H - 5));
    if (id === 'vaccinated') for (const p of this.people) if (this.rng.next() < 0.6) p.state = 'V';
    for (let i = 0; i < 4; i++) {
      const p = this.rng.pick(this.people.filter((q) => q.state === 'S'));
      p.state = 'I';
    }
  }

  tick(dt) {
    const P = this.params;
    const moving = this.people.filter((p) => p.state !== 'D');
    this.hash.rebuild(moving);
    for (const p of moving) {
      p.t += dt;
      const isolated = (P.quarantine && p.state === 'I' && p.t > 1) || p.still < P.distancing;
      // Movement: occasional trips to hubs, otherwise jitter around home.
      if (!isolated) {
        if (!p.trip && this.rng.next() < 0.15 * dt * P.mobility) p.trip = this.rng.pick(this.hubs);
        let tx = p.hx, ty = p.hy;
        if (p.trip) {
          tx = p.trip[0]; ty = p.trip[1];
          if ((p.x - tx) ** 2 + (p.y - ty) ** 2 < 400 && this.rng.next() < 0.5 * dt) p.trip = null;
        }
        p.vx += ((tx - p.x) * 0.3 + this.rng.gaussian(0, 25)) * dt * P.mobility;
        p.vy += ((ty - p.y) * 0.3 + this.rng.gaussian(0, 25)) * dt * P.mobility;
        p.vx *= 0.85; p.vy *= 0.85;
        p.x = clamp(p.x + p.vx * dt, 0, this.W);
        p.y = clamp(p.y + p.vy * dt, 0, this.H);
      }
      if (p.state === 'I') {
        if (!isolated || !P.quarantine) {
          this.hash.query(p.x, p.y, P.radius, (q) => {
            if (q.state !== 'S') return;
            if ((q.x - p.x) ** 2 + (q.y - p.y) ** 2 > P.radius * P.radius) return;
            if (this.rng.next() < P.beta * dt) { q.state = P.incubation > 0 ? 'E' : 'I'; q.t = 0; }
          });
        }
        if (p.t > P.infectious) {
          p.t = 0;
          p.state = this.rng.next() < P.mortality ? 'D' : 'R';
        }
      } else if (p.state === 'E' && p.t > P.incubation) {
        p.state = 'I'; p.t = 0;
      } else if (p.state === 'R' && P.waning > 0 && p.t > P.waning) {
        p.state = 'S'; p.t = 0;
      }
    }
    this.time += dt;
  }

  step() {
    for (let i = 0; i < this.params.speed; i++) this.tick(0.1);
  }

  pick(x, y, r) {
    let best = null, bd = Math.max(r, 5) ** 2;
    for (const p of this.people) {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  locate(p) {
    return p.alive ? { x: p.x, y: p.y, r: 4 } : null;
  }

  add(kind, x, y) {
    if (kind === 'crowd') {
      for (let i = 0; i < 30; i++) this.makePerson(x + this.rng.gaussian(0, 15), y + this.rng.gaussian(0, 15));
      return null;
    }
    return this.makePerson(x, y, kind);
  }

  remove(p) {
    p.alive = false;
    this.people = this.people.filter((q) => q !== p);
  }

  move(p, x, y) {
    p.x = p.hx = clamp(x, 0, this.W);
    p.y = p.hy = clamp(y, 0, this.H);
  }

  impulse(p, x, y, dx, dy) {
    const targets = p ? [p] : this.people.filter((q) => (q.x - x) ** 2 + (q.y - y) ** 2 < 900);
    for (const t of targets) { t.vx += dx * 3; t.vy += dy * 3; }
  }

  energy(x, y, r, amount) {
    for (const p of this.people) {
      if ((p.x - x) ** 2 + (p.y - y) ** 2 > r * r) continue;
      if (amount > 0 && (p.state === 'S' || p.state === 'R') && this.rng.next() < amount * 5) p.state = 'V';
      if (amount < 0 && (p.state === 'S' || p.state === 'V') && this.rng.next() < -amount * 5) { p.state = 'I'; p.t = 0; }
    }
  }

  describe(p) {
    return {
      title: `Person #${p.id}`,
      fields: [
        { key: 'state', label: 'Health state', type: 'select', value: p.state, options: Object.entries(STATES).map(([value, s]) => ({ value, label: s.label })) },
        { key: 't', label: 'Days in state', type: 'number', value: p.t, step: 0.5 },
        { key: 'still', label: 'Stays home (0 = never, 1 = always)', type: 'number', value: p.still, step: 0.05 },
        { key: 'goHome', label: 'Send home', type: 'action' },
      ],
    };
  }

  setProperty(p, key, value) {
    if (key === 'state') { p.state = value; p.t = 0; }
    else if (key === 'goHome') { p.x = p.hx; p.y = p.hy; p.trip = null; }
    else p[key] = value;
  }

  stats() {
    const c = { S: 0, E: 0, I: 0, R: 0, V: 0, D: 0 };
    for (const p of this.people) c[p.state]++;
    return Object.entries(STATES).map(([k, s]) => ({ key: k, label: s.label, value: c[k], color: s.color }));
  }

  render(ctx, view) {
    for (const [hx, hy] of this.hubs) {
      const [sx, sy] = view.toScreen(hx, hy);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(sx, sy, 25 * view.scale, 0, TAU); ctx.stroke();
    }
    const [x0, y0] = view.toScreen(0, 0), [x1, y1] = view.toScreen(this.W, this.H);
    ctx.strokeStyle = '#2b3550';
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    const r = Math.max(1.5, 3 * view.scale);
    for (const p of this.people) {
      const [sx, sy] = view.toScreen(p.x, p.y);
      ctx.fillStyle = STATES[p.state].color;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
      if (p.state === 'I') {
        ctx.strokeStyle = 'rgba(255,77,77,0.25)';
        ctx.beginPath(); ctx.arc(sx, sy, this.params.radius * view.scale, 0, TAU); ctx.stroke();
      }
    }
  }
}
