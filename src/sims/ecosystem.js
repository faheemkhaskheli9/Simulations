import { Simulation } from '../core/simulation.js';
import { SpatialHash } from '../core/spatial-hash.js';
import { clamp, TAU } from '../core/math.js';
import { decodeInto, encodeTyped, pick } from '../core/serialize.js';

const GENES = {
  speed: { label: 'Speed', min: 0.3, max: 4, herb: 1.2, carn: 1.5 },
  size: { label: 'Body size', min: 0.4, max: 3, herb: 1, carn: 1.3 },
  sense: { label: 'Sense range', min: 5, max: 120, herb: 40, carn: 40 },
  fertility: { label: 'Fertility', min: 0.2, max: 2, herb: 1, carn: 0.8 },
};

let nextId = 1;

/**
 * Agent-based ecosystem with natural selection. Grass regrows on a grid,
 * herbivores graze and flee, carnivores hunt. Each animal carries genes
 * (speed, size, senses, fertility) that cost energy; offspring inherit
 * mutated copies, so populations evolve as you change the environment.
 */
export class EcosystemSim extends Simulation {
  static meta = {
    id: 'ecosystem',
    title: 'Ecosystem & Evolution',
    category: 'Life',
    description:
      'Predators, prey and plants with heritable genes. Watch population cycles and natural selection; change climate, food supply or mutation rate, edit an animal’s genes, feed regions or cause droughts.',
    model: {
      summary: 'Agent-based food web of grass, herbivores and carnivores with heritable, mutating genes.',
      equations: [
        'Metabolic cost per day ∝ b·size^0.75 + 0.2·speed² + sensing + effort while chasing or fleeing (b = 0.5 for prey, 0.35 for predators, which idle cheaply between meals)',
        'Energy reserves are capped at max(200·size, 1.25 × breeding threshold): fat stores scale with body size',
        'Capture odds per tick ∝ size ratio ÷ (1 + rival predators nearby) (predator interference); handling time ∝ prey size',
        'Reproduction when energy exceeds a threshold ∝ size / fertility; offspring genes = parent genes × (1 + mutation noise)',
        'Grass regrows logistically on a grid, modulated by season and temperature',
      ],
      assumptions: [
        'Asexual reproduction; no mating, social behaviour or disease.',
        'Prey notice a stalking predator with a delay and predators pounce at close range; prey younger than 30 days stay hidden (a refuge). These stabilising mechanisms let both species persist without immigration in the balanced scenario.',
        'Optional immigration re-seeds species native to the world if they die out (needed in the harsher islands and invasion scenarios).',
        'Selection is emergent: no fitness function is coded.',
      ],
      references: [
        'Lotka (1925); Volterra (1926), predator–prey dynamics',
        'Kleiber (1932), metabolic scaling',
        'Grimm & Railsback, Individual-based Modeling and Ecology',
      ],
    },
  };

  constructor(opts) {
    super(opts);
    this.timeUnit = 'days';
    this.background = '#0a120a';
    this.W = 800;
    this.H = 500;
    this.cell = 10;
    this.GX = this.W / this.cell;
    this.GY = this.H / this.cell;
    this.grass = new Float32Array(this.GX * this.GY);
    this.fertile = new Float32Array(this.GX * this.GY);
    this.animals = [];
    this.hash = new SpatialHash(60);
    this.births = 0;
    this.deaths = 0;
    this.defineParams([
      { key: 'speed', label: 'Steps per frame', type: 'range', min: 1, max: 20, step: 1, value: 3 },
      { key: 'growth', label: 'Plant growth rate', type: 'range', min: 0, max: 0.1, step: 0.001, value: 0.02 },
      { key: 'seasons', label: 'Seasonal variation', type: 'range', min: 0, max: 1, step: 0.05, value: 0.4 },
      { key: 'temperature', label: 'Temperature (°C)', type: 'range', min: -10, max: 45, step: 1, value: 20 },
      { key: 'mutation', label: 'Mutation rate', type: 'range', min: 0, max: 0.5, step: 0.01, value: 0.08 },
      { key: 'plantEnergy', label: 'Energy per unit of plants', type: 'range', min: 5, max: 60, step: 1, value: 20 },
      { key: 'huntEfficiency', label: 'Predator energy gain', type: 'range', min: 0.1, max: 1, step: 0.05, value: 0.5 },
      { key: 'immigration', label: 'Immigration from outside', type: 'checkbox', value: true },
      { key: 'maxPop', label: 'Population cap', type: 'range', min: 100, max: 3000, step: 50, value: 1500 },
      { key: 'colorBy', label: 'Colour animals by', type: 'select', value: 'species', options: [
        { value: 'species', label: 'Species' }, { value: 'speed', label: 'Speed gene' }, { value: 'size', label: 'Size gene' }, { value: 'energy', label: 'Energy' },
      ] },
    ]);
    this.spawnKinds = [
      { id: 'herbivore', label: 'Herbivore (rabbit)' },
      { id: 'carnivore', label: 'Carnivore (fox)' },
      { id: 'herd', label: 'Herd of 10 herbivores' },
      { id: 'pack', label: 'Pack of 4 carnivores' },
      { id: 'plants', label: 'Plant patch' },
    ];
    this.scenarios = [
      { id: 'balanced', label: 'Balanced predator–prey' },
      { id: 'prey', label: 'Prey only (grazing pressure)' },
      { id: 'islands', label: 'Fertile islands in a desert' },
      { id: 'invasion', label: 'Fast predator invasion' },
    ];
    this.energyTool = { label: 'Feed / fertilise', negLabel: 'Drought / starve' };
    this.chartKeys = ['herbivores', 'carnivores'];
    this.loadScenario('balanced');
  }

  bounds() {
    return { x: 0, y: 0, w: this.W, h: this.H };
  }

  makeAnimal(species, x, y, genes) {
    const g = genes ?? Object.fromEntries(Object.entries(GENES).map(([k, d]) => [k, d[species === 'herbivore' ? 'herb' : 'carn'] * this.rng.range(0.85, 1.15)]));
    const a = {
      id: nextId++, species, x, y, heading: this.rng.range(0, TAU),
      genes: g, energy: 60 * g.size, age: 0, alive: true, generation: 1,
    };
    this.animals.push(a);
    return a;
  }

  loadScenario(id) {
    super.loadScenario(id);
    this.rng.seed(3);
    this.animals = [];
    this.births = this.deaths = 0;
    this.fertile.fill(1);
    if (id === 'islands') {
      this.fertile.fill(0.05);
      for (const [cx, cy] of [[20, 15], [60, 12], [40, 38]]) {
        for (let j = 0; j < this.GY; j++) for (let i = 0; i < this.GX; i++) {
          if ((i - cx) ** 2 + (j - cy) ** 2 < 100) this.fertile[j * this.GX + i] = 1.4;
        }
      }
    }
    for (let k = 0; k < this.grass.length; k++) this.grass[k] = this.fertile[k] * this.rng.range(0.3, 1);
    const rx = () => this.rng.range(0, this.W), ry = () => this.rng.range(0, this.H);
    const herb = id === 'invasion' ? 220 : 160, carn = id === 'prey' ? 0 : id === 'invasion' ? 0 : 8;
    for (let i = 0; i < herb; i++) this.makeAnimal('herbivore', rx(), ry());
    for (let i = 0; i < carn; i++) this.makeAnimal('carnivore', rx(), ry());
    if (id === 'invasion') {
      for (let i = 0; i < 8; i++) {
        const c = this.makeAnimal('carnivore', 40 + this.rng.range(0, 40), 40 + this.rng.range(0, 40));
        c.genes.speed = 2.4;
      }
    }
    // Species that belong to this world; immigration only ever brings these.
    this.native = new Set(this.animals.map((a) => a.species));
  }

  saveState() {
    return {
      grass: encodeTyped(this.grass),
      fertile: encodeTyped(this.fertile),
      births: this.births,
      deaths: this.deaths,
      native: [...this.native],
      animals: this.animals.map((a) => ({ ...pick(a, ['id', 'species', 'x', 'y', 'heading', 'energy', 'age', 'generation', 'rest', 'fleeing']), genes: { ...a.genes } })),
    };
  }

  loadState(st) {
    decodeInto(this.grass, st.grass);
    decodeInto(this.fertile, st.fertile);
    this.births = st.births || 0;
    this.deaths = st.deaths || 0;
    this.native = new Set((st.native ?? ['herbivore', 'carnivore']).filter((sp) => sp === 'herbivore' || sp === 'carnivore'));
    this.animals = st.animals.map((a) => {
      const genes = {};
      for (const [k, d] of Object.entries(GENES)) genes[k] = clamp(Number(a.genes?.[k]) || d.herb, d.min, d.max);
      return { ...a, genes, alive: true };
    });
    nextId = Math.max(nextId, ...this.animals.map((a) => a.id + 1));
  }

  grassAt(x, y) {
    const i = clamp(Math.floor(x / this.cell), 0, this.GX - 1), j = clamp(Math.floor(y / this.cell), 0, this.GY - 1);
    return j * this.GX + i;
  }

  reproThreshold(a) {
    return (150 * a.genes.size) / a.genes.fertility;
  }

  season() {
    return 1 + this.params.seasons * Math.sin((this.time / 365) * TAU);
  }

  metabolismFactor() {
    // Metabolism rises in heat and cold away from a comfortable 20 °C.
    return 1 + ((this.params.temperature - 20) / 25) ** 2;
  }

  tick(dt) {
    const P = this.params;
    const grow = P.growth * this.season() * (P.temperature < 0 ? 0.1 : P.temperature > 38 ? 0.4 : 1);
    for (let k = 0; k < this.grass.length; k++) {
      const g = this.grass[k], f = this.fertile[k];
      // Logistic regrowth with a seed bank so bare ground recovers.
      this.grass[k] = Math.min(f, g + grow * dt * (g + 0.15) * (1 - g / Math.max(f, 1e-3)));
    }
    this.hash.rebuild(this.animals);
    const meta = this.metabolismFactor();
    const babies = [];
    for (const a of this.animals) {
      if (!a.alive) continue;
      const g = a.genes;
      let tx = Math.cos(a.heading), ty = Math.sin(a.heading);
      let urgency = 0.5;
      if (a.species === 'herbivore') {
        // Stalking predators are only noticed at half the sensing range.
        const alert = g.sense * 0.5;
        let threat = null, td = alert * alert;
        this.hash.query(a.x, a.y, alert, (o) => {
          if (o.species !== 'carnivore' || !o.alive) return;
          const d = (o.x - a.x) ** 2 + (o.y - a.y) ** 2;
          if (d < td) { td = d; threat = o; }
        });
        // Prey react with a delay: each tick there is only a chance they notice the stalker.
        if (threat && (a.fleeing || this.rng.next() < 0.4)) {
          a.fleeing = true;
          tx = a.x - threat.x; ty = a.y - threat.y; urgency = 1.15; // adrenaline
        } else {
          if (!threat) a.fleeing = false;
          // Look in a few directions and head toward the lushest grass.
          let best = this.grass[this.grassAt(a.x, a.y)], bx = 0, by = 0;
          for (let s = 0; s < 6; s++) {
            const ang = a.heading + (s - 2.5) * 0.7;
            const px = a.x + Math.cos(ang) * g.sense * 0.5, py = a.y + Math.sin(ang) * g.sense * 0.5;
            const v = this.grass[this.grassAt(px, py)];
            if (v > best + 0.05) { best = v; bx = Math.cos(ang); by = Math.sin(ang); }
          }
          if (bx || by) { tx = bx; ty = by; }
          urgency = 0.4;
        }
        const k = this.grassAt(a.x, a.y);
        const eat = Math.max(0, Math.min(this.grass[k] - 0.03, 0.5 * dt * g.size)); // roots survive grazing
        this.grass[k] -= eat;
        a.energy += eat * P.plantEnergy;
      } else {
        // Well-fed predators stop hunting (satiation), which stabilises the cycle.
        // Handling time after a kill limits each predator's intake (Holling type II).
        a.rest = Math.max(0, (a.rest || 0) - dt);
        const hungry = a.rest === 0 && a.energy < 1.2 * this.reproThreshold(a);
        let prey = null, pd = hungry ? g.sense * g.sense : 0;
        this.hash.query(a.x, a.y, g.sense, (o) => {
          // Young prey stay hidden in cover: a refuge that keeps prey from being wiped out.
          if (o.species !== 'herbivore' || !o.alive || o.age < 30) return;
          const d = (o.x - a.x) ** 2 + (o.y - a.y) ** 2;
          if (d < pd) { pd = d; prey = o; }
        });
        if (prey) {
          const reach = 4 + 3 * (g.size + prey.genes.size);
          // Predators are sprinters: a burst of speed for the final pounce.
          tx = prey.x - a.x; ty = prey.y - a.y; urgency = pd < (2.5 * reach) ** 2 ? 1.9 : 1.3;
          if (pd < reach * reach) {
            // Bigger prey can fight back: success odds depend on size ratio. Other
            // predators nearby get in the way (interference), which damps the cycles.
            let rivals = 0;
            this.hash.query(a.x, a.y, 30, (o) => { if (o !== a && o.species === 'carnivore' && o.alive) rivals++; });
            const odds = (clamp(g.size / (prey.genes.size + 0.2), 0.1, 0.95) * dt * 0.8) / (1 + rivals);
            if (this.rng.next() < odds) {
              prey.alive = false;
              this.deaths++;
              a.energy += (prey.energy * 0.5 + 40 * prey.genes.size) * P.huntEfficiency;
              a.rest = 2.5 * prey.genes.size; // bigger prey take longer to eat
            }
          }
        } else urgency = 0.45;
      }
      // Steering with a little random wander.
      const desired = Math.atan2(ty, tx);
      let dh = ((desired - a.heading + Math.PI * 3) % TAU) - Math.PI;
      a.heading += clamp(dh, -0.4, 0.4) + this.rng.gaussian(0, 0.15);
      const v = g.speed * urgency * 8;
      a.x += Math.cos(a.heading) * v * dt;
      a.y += Math.sin(a.heading) * v * dt;
      if (a.x < 0 || a.x > this.W) { a.heading = Math.PI - a.heading; a.x = clamp(a.x, 0, this.W); }
      if (a.y < 0 || a.y > this.H) { a.heading = -a.heading; a.y = clamp(a.y, 0, this.H); }
      // Energy budget: basal metabolism (Kleiber, size^0.75; predators idle cheaply
      // between meals), upkeep of fast muscles and keen senses, plus moving.
      a.energy -= dt * meta * ((a.species === 'carnivore' ? 0.35 : 0.5) * Math.pow(g.size, 0.75) + 0.2 * g.speed ** 2 + 0.08 * g.size * (g.speed * urgency) ** 2 + 0.004 * g.sense);
      // Energy reserves (fat) scale with body size, so small animals can't ride out lean times.
      a.energy = Math.min(a.energy, Math.max(200 * g.size, 1.25 * this.reproThreshold(a)));
      a.age += dt;
      const lifespan = a.species === 'herbivore' ? 300 : 450;
      if (a.energy <= 0 || a.age > lifespan * g.size ** 0.25) { a.alive = false; this.deaths++; continue; }
      // Asexual reproduction with mutation.
      const threshold = this.reproThreshold(a);
      if (a.energy > threshold && a.age > (a.species === 'herbivore' ? 50 : 60) && this.animals.length + babies.length < P.maxPop) {
        a.energy *= 0.5;
        const genes = {};
        for (const [k, d] of Object.entries(GENES)) genes[k] = clamp(g[k] * (1 + this.rng.gaussian(0, P.mutation)), d.min, d.max);
        const child = { id: nextId++, species: a.species, x: a.x + this.rng.range(-3, 3), y: a.y + this.rng.range(-3, 3), heading: this.rng.range(0, TAU), genes, energy: a.energy, age: 0, alive: true, generation: a.generation + 1 };
        babies.push(child);
        this.births++;
      }
    }
    this.animals = this.animals.filter((a) => a.alive).concat(babies);
    // Open system: rare migrants arrive at the edge when a species is scarce.
    if (P.immigration) {
      for (const sp of this.native) {
        if (this.rng.next() > 0.03 * dt) continue;
        if (this.animals.filter((a) => a.species === sp).length >= 4) continue;
        const edge = this.rng.next() < 0.5;
        this.makeAnimal(sp, edge ? this.rng.range(0, this.W) : 0, edge ? 0 : this.rng.range(0, this.H));
      }
    }
    this.time += dt;
  }

  step() {
    for (let i = 0; i < this.params.speed; i++) this.tick(0.5);
  }

  pick(x, y, r) {
    let best = null, bd = Math.max(r, 6) ** 2;
    for (const a of this.animals) {
      const d = (a.x - x) ** 2 + (a.y - y) ** 2;
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  locate(a) {
    return a.alive ? { x: a.x, y: a.y, r: 3 + 2 * a.genes.size } : null;
  }

  add(kind, x, y) {
    if (kind === 'plants') {
      for (let j = 0; j < this.GY; j++) for (let i = 0; i < this.GX; i++) {
        const d2 = ((i + 0.5) * this.cell - x) ** 2 + ((j + 0.5) * this.cell - y) ** 2;
        if (d2 < 50 * 50) { const k = j * this.GX + i; this.fertile[k] = Math.max(this.fertile[k], 1.2); this.grass[k] = this.fertile[k]; }
      }
      return null;
    }
    if (kind === 'herd' || kind === 'pack') {
      const n = kind === 'herd' ? 10 : 4;
      this.native.add(kind === 'herd' ? 'herbivore' : 'carnivore');
      for (let i = 0; i < n; i++) this.makeAnimal(kind === 'herd' ? 'herbivore' : 'carnivore', x + this.rng.gaussian(0, 10), y + this.rng.gaussian(0, 10));
      return null;
    }
    if (kind === 'herbivore' || kind === 'carnivore') this.native.add(kind);
    return this.makeAnimal(kind, x, y);
  }

  remove(a) {
    a.alive = false;
    this.animals = this.animals.filter((o) => o !== a);
  }

  removeAt(x, y, r) {
    const a = this.pick(x, y, r);
    if (a) { this.remove(a); return a; }
    // No animal: clear vegetation instead.
    for (let j = 0; j < this.GY; j++) for (let i = 0; i < this.GX; i++) {
      if (((i + 0.5) * this.cell - x) ** 2 + ((j + 0.5) * this.cell - y) ** 2 < r * r) this.grass[j * this.GX + i] = 0;
    }
    return null;
  }

  move(a, x, y) {
    a.x = clamp(x, 0, this.W); a.y = clamp(y, 0, this.H);
  }

  impulse(a, x, y, dx, dy) {
    const targets = a ? [a] : this.animals.filter((o) => (o.x - x) ** 2 + (o.y - y) ** 2 < 900);
    for (const t of targets) {
      t.x = clamp(t.x + dx, 0, this.W); t.y = clamp(t.y + dy, 0, this.H);
      t.heading = Math.atan2(dy, dx);
    }
  }

  energy(x, y, r, amount) {
    for (const a of this.animals) if ((a.x - x) ** 2 + (a.y - y) ** 2 < r * r) a.energy = Math.max(0.1, a.energy + amount * 60);
    for (let j = 0; j < this.GY; j++) for (let i = 0; i < this.GX; i++) {
      if (((i + 0.5) * this.cell - x) ** 2 + ((j + 0.5) * this.cell - y) ** 2 > r * r) continue;
      const k = j * this.GX + i;
      if (amount > 0) { this.fertile[k] = Math.min(2, this.fertile[k] + amount * 0.5); this.grass[k] = Math.min(this.fertile[k], this.grass[k] + amount); }
      else { this.grass[k] = Math.max(0, this.grass[k] + amount * 2); this.fertile[k] = Math.max(0.02, this.fertile[k] + amount * 0.3); }
    }
  }

  describe(a) {
    return {
      title: `${a.species === 'herbivore' ? 'Herbivore' : 'Carnivore'} #${a.id}`,
      fields: [
        { key: 'species', label: 'Species', type: 'select', value: a.species, options: [{ value: 'herbivore', label: 'Herbivore' }, { value: 'carnivore', label: 'Carnivore' }] },
        { key: 'energy', label: 'Energy', type: 'number', value: a.energy, step: 5 },
        { key: 'age', label: 'Age (days)', type: 'number', value: a.age, step: 1 },
        { key: 'generation', label: 'Generation', type: 'readonly', value: a.generation },
        ...Object.entries(GENES).map(([k, d]) => ({ key: `gene.${k}`, label: `Gene: ${d.label}`, type: 'number', value: a.genes[k], step: 0.05, min: d.min, max: d.max })),
        { key: 'clone', label: 'Clone this animal', type: 'action' },
      ],
    };
  }

  setProperty(a, key, value) {
    if (key.startsWith('gene.')) {
      const g = key.slice(5);
      a.genes[g] = clamp(value, GENES[g].min, GENES[g].max);
    } else if (key === 'clone') {
      const c = this.makeAnimal(a.species, a.x + 8, a.y + 8, { ...a.genes });
      c.energy = a.energy;
      c.generation = a.generation;
    } else a[key] = value;
  }

  stats() {
    let h = 0, c = 0, hs = 0, cs = 0, hz = 0, cz = 0, gen = 0;
    for (const a of this.animals) {
      if (a.species === 'herbivore') { h++; hs += a.genes.speed; hz += a.genes.size; }
      else { c++; cs += a.genes.speed; cz += a.genes.size; }
      gen = Math.max(gen, a.generation);
    }
    let gsum = 0;
    for (let k = 0; k < this.grass.length; k++) gsum += this.grass[k];
    return [
      { key: 'herbivores', label: 'Herbivores', value: h },
      { key: 'carnivores', label: 'Carnivores', value: c },
      { key: 'plants', label: 'Plant cover (%)', value: (100 * gsum) / this.grass.length },
      { key: 'hSpeed', label: 'Avg herbivore speed', value: h ? hs / h : 0 },
      { key: 'cSpeed', label: 'Avg carnivore speed', value: c ? cs / c : 0 },
      { key: 'hSize', label: 'Avg herbivore size', value: h ? hz / h : 0 },
      { key: 'cSize', label: 'Avg carnivore size', value: c ? cz / c : 0 },
      { key: 'generation', label: 'Latest generation', value: gen },
      { key: 'season', label: 'Season', value: ['Spring', 'Summer', 'Autumn', 'Winter'][Math.floor(((this.time % 365) / 365) * 4)] },
    ];
  }

  formatTime() {
    return `Year ${Math.floor(this.time / 365) + 1}, day ${Math.floor(this.time % 365)}`;
  }

  render(ctx, view) {
    if (!this.img) {
      this.canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(this.GX, this.GY) : Object.assign(document.createElement('canvas'), { width: this.GX, height: this.GY });
      this.cctx = this.canvas.getContext('2d');
      this.img = this.cctx.createImageData(this.GX, this.GY);
    }
    const d = this.img.data;
    for (let k = 0; k < this.grass.length; k++) {
      const [r, g, b] = groundColor(this.grass[k], this.fertile[k]);
      d[k * 4] = r;
      d[k * 4 + 1] = g;
      d[k * 4 + 2] = b;
      d[k * 4 + 3] = 255;
    }
    this.cctx.putImageData(this.img, 0, 0);
    const [x0, y0] = view.toScreen(0, 0), [x1, y1] = view.toScreen(this.W, this.H);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.canvas, x0, y0, x1 - x0, y1 - y0);
    ctx.imageSmoothingEnabled = true;
    const mode = this.params.colorBy;
    for (const a of this.animals) {
      const [sx, sy] = view.toScreen(a.x, a.y);
      const r = Math.max(1.5, (2 + 1.6 * a.genes.size) * view.scale);
      ctx.fillStyle = animalColor(a, mode);
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = a.species === 'carnivore' ? '#400' : '#333';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a.heading) * r * 1.6, sy + Math.sin(a.heading) * r * 1.6); ctx.stroke();
    }
  }
}

/** Unclamped RGB (0…255) of a grid cell from its plant cover and fertility, as drawn in 2D and on the 3D terrain. */
export function groundColor(g, f) {
  return [60 + 70 * (1 - Math.min(f, 1)) - 30 * g, 45 + 120 * g, 25 + 10 * g];
}

/** CSS colour of an animal for a "Colour animals by" mode. */
export function animalColor(a, mode) {
  if (mode === 'speed') return `hsl(${240 - clamp((a.genes.speed - 0.3) / 3, 0, 1) * 240},90%,60%)`;
  if (mode === 'size') return `hsl(${280 - clamp((a.genes.size - 0.4) / 2.2, 0, 1) * 280},80%,60%)`;
  if (mode === 'energy') return `hsl(${clamp(a.energy / (100 * a.genes.size), 0, 1) * 120},90%,55%)`;
  return a.species === 'herbivore' ? '#f4f0dc' : '#ff6a3d';
}

export { GENES };
