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
import { SAVE_FORMAT } from '../core/serialize.js';
import { v3 } from './engine/math3d.js';

export const WORLD_FORMAT = 'simulations-world3d';
export const WORLD_VERSION = 1;
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
      const awake = s === this.active || visible.has(s) || coupled.has(s.id);
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

  /** Advance by dt real seconds; couplings tick once per world second (W-FT-62). */
  step(dt, speed = 1) {
    this.scheduler.step(this.siteList, this.active, dt, speed);
    this.clock += dt;
    if (this.clock - this.lastTick >= 1) {
      this.lastTick = this.clock;
      this.couplings.tick();
    }
    this.updateFollow();
  }

  // ---------- persistence (W-FT-80…83) ----------

  serialize(camera = null) {
    const sites = {};
    for (const s of this.sites.values()) {
      if (!s.touched) continue;
      sites[s.id] = s.sim ? s.sim.serialize() : s.blob;
    }
    return {
      format: WORLD_FORMAT,
      version: WORLD_VERSION,
      camera: camera?.serialize() ?? null,
      active: this.active?.id ?? null,
      couplings: [...this.couplings.enabled],
      sites,
    };
  }

  /**
   * Load a world save: everything is validated first (format, version, ids and
   * every site with the 2D validation), then applied, so a bad file changes
   * nothing. Returns { active, camera } for the caller to apply.
   */
  load(data) {
    if (!data || data.format !== WORLD_FORMAT) throw new Error('Not a Simulations world file');
    if (!(data.version >= 1)) throw new Error('Unknown world file version');
    if (data.version > WORLD_VERSION) throw new Error('World file is from a newer version');
    const restored = [];
    for (const [id, blob] of Object.entries(data.sites ?? {})) {
      const site = this.sites.get(id);
      if (!site) throw new Error(`Unknown site "${id}"`);
      const sim = new site.Sim();
      sim.deserialize(blob);
      restored.push([site, sim]);
    }
    if (data.active && !this.sites.has(data.active)) throw new Error(`Unknown site "${data.active}"`);
    const couplings = Array.isArray(data.couplings) ? data.couplings : [];
    for (const id of couplings) if (!this.couplings.get(id)) throw new Error(`Unknown coupling "${id}"`);
    if (data.camera && !this.tree.get(data.camera.place)) throw new Error(`Unknown place "${data.camera.place}"`);

    for (const s of this.sites.values()) this.reset(s);
    for (const [site, sim] of restored) this.adopt(site, sim);
    for (const id of [...this.couplings.enabled]) this.couplings.set(id, false);
    for (const id of couplings) this.couplings.set(id, true);
    return { active: this.sites.get(data.active) ?? null, camera: data.camera ?? null };
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
    site.history.clear();
  }
}
