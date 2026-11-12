// The world: the place tree, the sites in it, the scheduler that steps them and
// the couplings between them. No DOM or GL here, so all of it runs in Node
// (W-TC-4) and is covered by the world unit tests.
import { PlaceTree } from './places.js';
import { PLACES } from './layout.js';
import { SurfaceSite } from './site.js';
import { GravitySite } from './native/gravity3d.js';
import { GlobeSite } from './native/globe.js';
import { TerrainSite } from './native/terrain.js';
import { VolumeSite } from './native/volume.js';
import { MoleculesSite } from './native/molecules.js';
import { MembraneSite } from './native/membrane.js';
import { ShellsSite } from './native/shells.js';
import { CouplingSet } from './couplings.js';
import { Scheduler } from './scheduler.js';
import { experimentSettings } from './execution.js';
import { saveRuntime, readRuntime } from './checkpoint.js';
import { hasCycle } from './couplings.js';
import { SAVE_FORMAT } from '../core/serialize.js';
import { v3 } from './engine/math3d.js';

export const WORLD_FORMAT = 'simulations-world3d';
export const WORLD_VERSION = 2;
export const SITE_TYPES = { surface: SurfaceSite, gravity: GravitySite, globe: GlobeSite, terrain: TerrainSite, volume: VolumeSite, molecules: MoleculesSite, membrane: MembraneSite, shells: ShellsSite };
const UNLOAD_AFTER_S = 120;

export class World {
  constructor(simulations, places = PLACES, { scheduler } = {}) {
    this.simulations = simulations;
    this.tree = new PlaceTree(places);
    this.sites = new Map();
    for (const place of this.tree.all) {
      place.sites = [];
      for (const spec of place.siteSpecs) {
        if (this.sites.has(spec.id) || this.tree.get(spec.id)) throw new Error(`Site id "${spec.id}" is not unique`);
        const Sim = simulations.find((S) => S.meta.id === spec.sim);
        if (!Sim) throw new Error(`Site ${spec.id}: unknown simulation "${spec.sim}"`);
        const Type = SITE_TYPES[spec.type ?? 'surface'];
        if (!Type) throw new Error(`Site ${spec.id}: unknown type "${spec.type}"`);
        const site = new Type(spec, place, Sim);
        place.sites.push(site);
        this.sites.set(spec.id, site);
      }
    }
    this.couplings = new CouplingSet(this.sites);
    this.scheduler = new Scheduler(scheduler);
    this.active = null;
    this.clock = 0;
    this.lastTick = 0;
    this.experiment = null; // null: interactive preview (see execution.js)
  }

  /** 'preview' or 'experiment' (W-FT-90). */
  get mode() {
    return this.experiment ? 'experiment' : 'preview';
  }

  get siteList() {
    return [...this.sites.values()];
  }

  /** The site a place opens on, or its first site. */
  primaryOf(place) {
    return this.sites.get(place.primary) ?? place.sites[0] ?? null;
  }

  setActive(site) {
    site.ensure();
    this.active = site;
    site.tier = 'active';
  }

  /** Move places that ride on a body, e.g. the Earth along its orbit in the Solar System. */
  updateFollow() {
    for (const p of this.tree.all) {
      if (!p.follow) continue;
      const s = this.sites.get(p.follow.site);
      const b = s?.sim?.bodies?.find((x) => x.name === p.follow.body);
      if (b && Number.isFinite(b.x) && Number.isFinite(b.y)) p.position = s.toPlace(b.x, b.y);
    }
  }

  /**
   * Direction (unit, in the place's units) from a place that rides on a body to
   * the Sun of the same site, e.g. from the Earth to the Sun; null otherwise.
   */
  sunDirection(place) {
    const site = place.follow && this.sites.get(place.follow.site);
    const sun = site?.sim?.bodies?.find((b) => b.name === 'Sun');
    if (!sun) return null;
    const p = this.tree.convert(site.toPlace(sun.x, sun.y), site.place, place);
    return v3.len(p) > 0 ? v3.norm(p) : null;
  }

  /**
   * Tiers for this frame (System Design §5.1): `visible` is the set of sites that
   * should keep moving. Sites used by couplings stay ambient (W-FT-64). Sites are
   * created lazily and unloaded after a while out of view.
   */
  assignTiers(visible, now) {
    const coupled = this.couplings.involved();
    for (const s of this.sites.values()) {
      const awake = s === this.active || visible.has(s) || coupled.has(s.id) || !!this.experiment?.ids.has(s.id);
      if (awake) {
        s.ensure();
        s.tier = s.error ? 'frozen' : s === this.active ? 'active' : 'ambient';
        s.idleSince = now;
      } else if (s.sim) {
        s.tier = 'frozen';
        if (now - s.idleSince > UNLOAD_AFTER_S) s.unload();
      } else {
        s.tier = 'unloaded';
      }
    }
  }

  /**
   * Advance by dt real seconds at a speed. In preview, couplings tick once per
   * world second (W-FT-62); in experiment mode the time goes into the backlog
   * and whole ticks run (W-FT-93).
   */
  step(dt, speed = 1) {
    const elapsed = dt * speed;
    if (!Number.isFinite(dt) || dt < 0 || !Number.isFinite(speed) || speed <= 0 || !Number.isFinite(elapsed)) return 0;
    // A zero-dt experiment call may drain queued ticks; zero-dt preview changes nothing.
    if (this.experiment) return this.advance(elapsed);
    if (dt === 0) return 0;
    this.scheduler.step(this.siteList, this.active, dt, speed);
    this.clock += elapsed;
    // Preview is approximate, but its coupling cadence still follows scaled world time.
    while (this.clock - this.lastTick >= 1) {
      this.lastTick += 1;
      this.couplings.tick();
    }
    this.updateFollow();
  }

  // ---------- experiment mode (Roadmap F1.1, W-FT-90…95) ----------

  /**
   * Switch to experiment mode from the current state. `sites` lists the
   * participating site ids; by default the active site and every site an
   * enabled coupling uses. Tick count, clock and backlog start at zero.
   */
  startExperiment({ sites, ...settings } = {}) {
    const opts = experimentSettings(settings);
    const ids = new Set(sites ?? [this.active?.id, ...this.couplings.involved()].filter(Boolean));
    for (const id of ids) if (!this.sites.has(id)) throw new Error(`Unknown site "${id}"`);
    if (!ids.size) throw new Error('An experiment needs at least one site');
    this.experiment = { ...opts, ids, ticks: 0, pending: 0, deferred: 0, lagging: false };
    for (const id of ids) this.sites.get(id).ensure();
    this.clock = 0;
    this.lastTick = 0;
    return this.experiment;
  }

  /** Back to interactive preview; the sites keep their state. */
  stopExperiment() {
    this.experiment = null;
    this.lastTick = this.clock;
  }

  /**
   * Sites stepped by the next tick, in layout order: the chosen ones plus the
   * sites of every enabled coupling (W-FT-91). Stopped sites are left out.
   */
  participants() {
    const e = this.experiment;
    if (!e) return [];
    const coupled = this.couplings.involved();
    return this.siteList.filter((s) => (e.ids.has(s.id) || coupled.has(s.id)) && !s.error);
  }

  /** Run n whole experiment ticks now, whatever the frame budget. */
  runTicks(n) {
    const e = this.experiment;
    if (!e) throw new Error('Not in experiment mode');
    for (let i = 0; i < n; i++) this.tickOnce();
    this.updateFollow();
  }

  tickOnce() {
    const e = this.experiment;
    for (const s of this.participants()) {
      s.ensure();
      s.tier = s === this.active ? 'active' : 'ambient';
      this.scheduler.run(s, e.tick);
    }
    e.ticks++;
    this.clock = e.ticks * e.tick;
    if (e.ticks % e.couplingEvery === 0) {
      this.lastTick = this.clock;
      this.couplings.tick();
    }
  }

  /**
   * Take `real` world seconds of intake (dt × speed) and run as many whole ticks
   * as the frame budget allows; the rest waits (W-FT-93). Returns the ticks run.
   */
  advance(real) {
    const e = this.experiment;
    if (!e) throw new Error('Not in experiment mode');
    if (!Number.isFinite(real) || real < 0) throw new RangeError('Experiment intake must be finite and non-negative');
    // Keep runnable time bounded, but never discard owed simulation time.
    // Excess intake is represented by a scalar deferred duration, not an event queue.
    const total = e.deferred + real;
    if (!Number.isFinite(total)) throw new RangeError('Experiment backlog overflow');
    const admitted = Math.min(total, Math.max(0, e.maxBacklog - e.pending));
    e.pending += admitted;
    e.deferred = total - admitted;
    const now = this.scheduler.now, start = now();
    let ran = 0;
    while (e.pending >= e.tick * (1 - 1e-9)) {
      if (ran > 0 && now() - start > e.budgetMs) break;
      this.tickOnce();
      e.pending = Math.max(0, e.pending - e.tick);
      const transfer = Math.min(e.deferred, Math.max(0, e.maxBacklog - e.pending));
      e.pending += transfer;
      e.deferred = Math.max(0, e.deferred - transfer);
      ran++;
    }
    e.lagging = e.deferred > 0;
    this.updateFollow();
    return ran;
  }

  /** All world seconds still owed, including time held outside the runnable queue. */
  get backlog() {
    return this.experiment ? this.experiment.pending + this.experiment.deferred : 0;
  }

  // ---------- persistence (W-FT-80…83) ----------

  serialize(camera = null) {
    // Newly enabled couplings can introduce a participant before its first tick.
    // Materialize these default states so the checkpoint is self-contained.
    if (this.experiment) for (const site of this.participants()) site.ensure();
    const sites = {};
    // Include every initialized simulation: physics advances without marking a
    // site 'touched'. Otherwise saving an experiment loses those evolved states.
    for (const s of this.sites.values()) {
      if (!s.sim && !s.touched) continue;
      sites[s.id] = s.sim ? s.sim.serialize() : s.blob;
    }
    return {
      format: WORLD_FORMAT,
      version: WORLD_VERSION,
      camera: camera?.serialize() ?? null,
      active: this.active?.id ?? null,
      couplings: [...this.couplings.enabled],
      sites,
      runtime: saveRuntime(this),
    };
  }

  /**
   * Load a world save: everything is validated first (format, version, ids and
   * every site with the 2D validation), then applied, so a bad file changes
   * nothing. Returns { active, camera } for the caller to apply.
   */
  load(data) {
    if (!data || data.format !== WORLD_FORMAT) throw new Error('Not a Simulations world file');
    if (!Number.isInteger(data.version) || data.version < 1) throw new Error('Unknown world file version');
    if (data.version > WORLD_VERSION) throw new Error('World file is from a newer version');
    if (!data.sites || typeof data.sites !== 'object' || Array.isArray(data.sites)) {
      throw new Error('Invalid world site states');
    }
    const restored = [];
    for (const [id, blob] of Object.entries(data.sites)) {
      const site = this.sites.get(id);
      if (!site) throw new Error(`Unknown site "${id}"`);
      const sim = new site.Sim();
      sim.deserialize(blob);
      restored.push([site, sim]);
    }
    if (data.active && !this.sites.has(data.active)) throw new Error(`Unknown site "${data.active}"`);
    const couplings = Array.isArray(data.couplings) ? data.couplings : [];
    if (data.version === 2 && !Array.isArray(data.couplings)) throw new Error('Invalid checkpoint couplings');
    const uniqueCouplings = new Set(couplings);
    if (uniqueCouplings.size !== couplings.length) throw new Error('Duplicate checkpoint couplings');
    for (const id of couplings) if (!this.couplings.get(id)) throw new Error(`Unknown coupling "${id}"`);
    if (hasCycle(couplings.map((id) => {
      const d = this.couplings.get(id);
      return [d.from, d.to];
    }))) throw new Error('Checkpoint couplings contain a cycle');
    if (data.camera && !this.tree.get(data.camera.place)) throw new Error(`Unknown place "${data.camera.place}"`);
    const runtime = readRuntime(data, this, couplings); // all validation precedes mutations

    for (const s of this.sites.values()) this.reset(s);
    for (const [site, sim] of restored) this.adopt(site, sim);
    for (const id of [...this.couplings.enabled]) this.couplings.set(id, false);
    for (const id of couplings) this.couplings.set(id, true);
    this.couplings.values = runtime?.couplingValues ?? {};
    this.couplings.memo = runtime?.couplingMemo ?? {};
    this.clock = runtime?.clock ?? 0;
    this.lastTick = runtime?.lastTick ?? 0;
    this.experiment = runtime?.experiment ?? null;
    this.scheduler.cursor = runtime?.scheduler.cursor ?? 0;
    this.scheduler.budget = runtime?.scheduler.budget ?? this.scheduler.baseBudget;
    this.scheduler.slowFor = runtime?.scheduler.slowFor ?? 0;
    for (const [id, amount] of Object.entries(runtime?.scheduler.ambientPending ?? {})) this.sites.get(id).acc = amount;
    this.active = this.sites.get(data.active) ?? null;
    if (this.active) this.setActive(this.active);
    this.updateFollow();
    return { active: this.active, camera: data.camera ?? null };
  }

  /** Open a 2D save file at the matching site (W-FT-83). Returns that site. */
  loadSiteSave(data) {
    if (data?.format !== SAVE_FORMAT) throw new Error('Not a Simulations save file');
    const candidates = this.siteList.filter((s) => s.Sim.meta.id === data.sim);
    if (!candidates.length) throw new Error(`No site runs "${data.sim}"`);
    const site = candidates.find((s) => s.scenario === data.scenario) ?? candidates[0];
    const sim = new site.Sim();
    sim.deserialize(data);
    this.adopt(site, sim);
    return site;
  }

  /** Put a (validated) simulation into a site as user-changed state. */
  adopt(site, sim) {
    site.sim = sim;
    site.blob = null;
    site.touched = true;
    site.error = null;
    site.drawn = false;
    site.history.clear();
    site.setup();
  }

  /** Back to the layout's fresh state. */
  reset(site) {
    site.sim = null;
    site.blob = null;
    site.touched = false;
    site.error = null;
    site.drawn = false;
    site.tier = 'unloaded';
    site.acc = 0;
    site.cost = 0;
    site.logged = false;
    site.history.clear();
  }
}
