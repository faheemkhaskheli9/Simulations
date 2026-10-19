// The 3D world as a stage of the app (review R1): it owns the WebGL canvas, the
// camera, the world and its sites, and hands the active site's simulation to the
// app's existing panels with App.bindSim. Pointer input becomes the same tool
// calls the 2D app makes (src/ui/tools.js).
import { World } from '../world.js';
import { TOUR } from '../layout.js';
import { Renderer } from '../engine/renderer.js';
import { Camera3D, FOVY } from '../engine/camera3d.js';
import { v3, mat4, yawPitch, offsetFromYawPitch, IDENTITY_BASIS } from '../engine/math3d.js';
import { screenRay, rayAt, raySphere } from '../engine/ray.js';
import { circlePoints } from '../engine/meshes.js';
import { hexColor } from '../engine/colors.js';
import { Random } from '../../core/random.js';
import { facingRing } from '../site.js';
import { parseWorldHash, formatWorldHash, resolveRoute, sitePath } from '../routes.js';
import { buildHash, coerceParams, diffParams, download, parseLock } from '../../ui/persistence.js';
import { SAVE_FORMAT } from '../../core/serialize.js';
import { Hud, el } from './hud.js';
import { Atlas } from './atlas.js';
import { Tour } from './tour.js';
import { CouplingPanel } from './coupling-panel.js';

const $ = (sel) => document.querySelector(sel);
const QUALITY = {
  low: { dpr: 1, texturePx: 512, ambientHz: 5 },
  medium: { dpr: 1.5, texturePx: 1024, ambientHz: 10 },
  high: { dpr: 2, texturePx: 1024, ambientHz: 15 },
};
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

export class WorldStage {
  constructor(app) {
    this.app = app;
    this.canvas = $('#world-gl');
    this.hudRoot = $('#world-hud');
    this.world = new World(app.simulations);
    this.camera = new Camera3D(this.world.tree);
    this.camera.onPlaceChange = (place) => this.onPlaceChange(place);
    this.renderer = new Renderer(this.canvas);
    this.hud = new Hud(this.hudRoot);
    this.atlas = new Atlas(this.world, (item) => this.goTo(item));
    this.tour = new Tour(this, TOUR);
    this.couplingPanel = new CouplingPanel(this);
    this.quality = QUALITY[store.get('world.quality')] ? store.get('world.quality') : 'medium';
    this.reducedMotion = store.get('world.reducedMotion') === '1' || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.time = 0;
    this.frameMs = 0;
    this.fpsLow = 0;
    this.drag = null;
    this.hover = null;
    this.touches = new Map();
    this.canvases = new Map();
    this.decor = new Map();
    this.labels = [];
    this.layersDrawn = [];
    this.lastPanel = 0;
    this.shown = false;
    this.bindDom();
  }

  // ---------- DOM, visibility ----------

  bindDom() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => this.onUp(e));
    c.addEventListener('pointerleave', () => { this.hover = null; });
    c.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    this.keyHandler = (e) => this.onKey(e);
    $('#atlas-btn').addEventListener('click', () => this.atlas.open());
    $('#tour-btn').addEventListener('click', () => this.tour.toggle());
    $('#world-up').addEventListener('click', () => this.goUp());
    $('#world-home').addEventListener('click', () => this.goHome());
    const q = $('#quality');
    q.value = this.quality;
    q.addEventListener('change', () => this.setQuality(q.value));
    const rm = $('#reduced-motion');
    rm.checked = this.reducedMotion;
    rm.addEventListener('change', () => {
      this.reducedMotion = rm.checked;
      store.set('world.reducedMotion', rm.checked ? '1' : '0');
    });
    window.addEventListener('resize', () => this.resize());
  }

  show() {
    if (this.shown) return;
    this.shown = true;
    document.body.classList.add('world-mode');
    $('#world').hidden = true;
    this.canvas.hidden = false;
    this.hudRoot.hidden = false;
    $('#world-panel').hidden = false;
    $('#world-btn').textContent = '▦ Open in 2D';
    $('#world-btn').title = 'Open the active site in the classic 2D view, with its current state';
    window.addEventListener('keydown', this.keyHandler);
    this.resize();
    if (!this.world.active) {
      this.activate(this.world.primaryOf(this.camera.place), { fly: false });
      if (!store.get('world.welcomed')) {
        store.set('world.welcomed', '1');
        this.notice('This is one world: every simulation is a place in it. Click a marker to fly there, scroll to zoom, drag to look around, or press T for the guided tour.');
      }
    } else {
      this.bindActive();
    }
  }

  hide() {
    this.shown = false;
    this.tour.stop();
    document.body.classList.remove('world-mode');
    $('#world').hidden = false;
    this.canvas.hidden = true;
    this.hudRoot.hidden = true;
    $('#world-panel').hidden = true;
    $('#world-btn').textContent = '🌍 World';
    $('#world-btn').title = 'Enter the 3D world: every simulation in one place, from galaxies to atoms';
    window.removeEventListener('keydown', this.keyHandler);
  }

  exit() {
    this.hide();
  }

  resize() {
    if (!this.shown) return;
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, QUALITY[this.quality].dpr);
    this.renderer.resize(r.width, r.height, dpr);
  }

  setQuality(q) {
    if (!QUALITY[q]) return;
    this.quality = q;
    $('#quality').value = q;
    store.set('world.quality', q);
    this.resize();
  }

  notice(text, actions = []) {
    const box = $('#world-notice');
    const close = el('button', { textContent: 'OK' });
    close.addEventListener('click', () => { box.hidden = true; });
    const buttons = actions.map(({ label, run }) => {
      const b = el('button', { textContent: label });
      b.addEventListener('click', () => { box.hidden = true; run(); });
      return b;
    });
    box.replaceChildren(el('p', { textContent: text }), el('div', { className: 'notice-buttons' }, ...buttons, close));
    box.hidden = false;
  }

  // ---------- sites, panels and routes ----------

  /** Make a site active: its simulation goes into the panels; optionally fly to it. */
  activate(site, { fly = true, duration } = {}) {
    if (!site) return;
    this.world.setActive(site);
    this.bindActive();
    if (fly) this.flyToSite(site, duration);
    this.updateRoute();
  }

  bindActive() {
    const site = this.world.active;
    this.app.bindSim(site.sim, { history: site.history, driven: this.world.couplings.driven(site.id) });
    this.app.setRunning(this.app.running);
    this.couplingPanel.render();
  }

  /** Called by the app when the learner picks a simulation (or a lesson starts): go to its site. */
  focusSim(simId, scenarioId, siteId) {
    const sites = this.world.siteList.filter((s) => s.Sim.meta.id === simId);
    if (!sites.length) return;
    const site = sites.find((s) => s.id === siteId) ?? sites.find((s) => s.scenario === scenarioId) ?? sites.find((s) => s.place === this.camera.place) ?? sites[0];
    if (site !== this.world.active) this.activate(site);
    if (scenarioId && site.sim.scenarioId !== scenarioId && site.sim.scenarios.some((s) => s.id === scenarioId)) this.app.loadScenario(scenarioId);
  }

  focusActive() {
    if (this.world.active) this.flyToSite(this.world.active, 1.2);
  }

  onScenarioLoaded() {
    this.touch();
    const site = this.world.active;
    site.drawn = false;
    site.setup();
    this.updateRoute();
  }

  /** The user changed the active site (tool, parameter, inspector): keep it in saves. */
  touch() {
    if (this.world.active) this.world.active.touched = true;
  }

  stepOnce(dt) {
    this.world.active?.sim.step(dt);
  }

  updateRoute() {
    const site = this.world.active;
    if (!site || !this.shown) return;
    const lock = this.app.lockQuery().lock;
    const hash = formatWorldHash(sitePath(site), { lock });
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }

  /** Apply a #world route: place or site, parameters, camera view and teacher locks (W-FT-84). */
  route(hash) {
    this.show();
    const r = parseWorldHash(hash);
    const { place, site, unknown } = resolveRoute(this.world, r.segments);
    if (unknown.length) this.app.status(`Unknown place or site "${unknown.join('/')}", showing ${(site ?? place).label}`, true);
    const target = site ?? this.world.primaryOf(place);
    if (target !== this.world.active) this.activate(target, { fly: false });
    const sim = target.sim;
    const typed = coerceParams(sim.paramDefs, r.params);
    for (const [k, v] of Object.entries(typed)) sim.setParam(k, v);
    if (Object.keys(typed).length) this.touch();
    const locked = parseLock(sim.paramDefs, r.lock);
    if (locked.length) {
      this.app.locks = Object.fromEntries(locked.map((k) => [k, sim.params[k]]));
      this.app.status(`Teacher mode: ${locked.length} parameter${locked.length > 1 ? 's' : ''} locked`);
    }
    this.app.applyLocks();
    const focus = site ? site.view : place.view;
    const offset = r.view ? offsetFromYawPitch(r.view.distance, r.view.yaw, r.view.pitch) : focus.offset;
    if (this.firstRouted) this.flyTo(target.place === place ? place : target.place, focus.target, offset);
    else this.camera.jumpTo(site ? site.place : place, focus.target, offset);
    this.firstRouted = true;
    this.updateRoute();
  }

  /** Link to the active site, its changed parameters, locks and the current camera view (W-FT-84). */
  shareHash() {
    const site = this.world.active, sim = site.sim;
    const reference = site.fresh(sim.scenarioId);
    const params = diffParams(sim.params, reference.params);
    for (const k of Object.keys(this.world.couplings.driven(site.id))) delete params[k];
    let view = null;
    if (this.camera.place === site.place && !this.camera.flying) {
      const off = v3.sub(this.camera.eye(), site.view.target);
      const yp = yawPitch(off);
      if (yp.distance > 0) view = yp;
    }
    return formatWorldHash(sitePath(site), { params, view, lock: this.app.lockQuery().lock });
  }

  save() {
    const data = this.world.serialize(this.camera);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    download(`world-${stamp}.json`, JSON.stringify(data));
    this.app.status(`World saved (${Object.keys(data.sites).length} changed site${Object.keys(data.sites).length === 1 ? '' : 's'})`);
  }

  /** Load a world file, or a 2D save into its site (W-FT-81, W-FT-83). */
  load(data, name) {
    try {
      if (data?.format === SAVE_FORMAT) {
        const site = this.world.loadSiteSave(data);
        this.activate(site);
        this.app.resetRecording();
        this.app.status(`Opened ${name} at ${site.label}`);
        return;
      }
      const { active, camera } = this.world.load(data);
      this.activate(active ?? this.world.primaryOf(this.camera.place), { fly: !camera });
      if (camera) this.camera.restore(camera);
      this.app.resetRecording();
      this.couplingPanel.render();
      this.app.status(`Loaded ${name}`);
    } catch (err) {
      this.app.status(`Could not load ${name}: ${err.message}`, true);
    }
  }

  /** "Open in 2D": the classic app takes over the active site's current state (W-FT-29). */
  openIn2D() {
    const site = this.world.active;
    this.app.pendingState = site.sim.serialize();
    location.hash = buildHash(site.Sim.meta.id, site.sim.scenarioId);
  }

  // ---------- navigation ----------

  flyTo(place, target, offset, duration = 2.5) {
    if (this.reducedMotion) this.camera.jumpTo(place, target, offset);
    else this.camera.flyTo(place, target, offset, duration);
  }

  flyToSite(site, duration) {
    const v = site.view;
    this.flyTo(site.place, v.target, v.offset, duration);
  }

  flyToPlace(place) {
    const site = this.world.primaryOf(place);
    if (site) this.activate(site);
    else this.flyTo(place, place.view.target, place.view.offset);
  }

  goTo(item) {
    if (item.site) this.activate(item.site);
    else this.flyToPlace(item.place);
  }

  goUp() {
    const p = this.camera.place.parent;
    if (p) this.flyToPlace(p);
  }

  goHome() {
    this.flyToPlace(this.world.tree.root);
  }

  /** The camera crossed into another place by zooming: its main site becomes active. */
  onPlaceChange(place) {
    if (this.camera.flying || !this.world.active) return;
    if (this.world.active.place !== place) this.activate(this.world.primaryOf(place), { fly: false });
  }

  // ---------- picking and tools ----------

  rayAt(sx, sy) {
    const c = this.camera, r = this.renderer;
    return screenRay(c.eye(), c.forward(), c.up, FOVY, r.width, r.height, sx, sy);
  }

  /** Ray in the current place → ray in another place. */
  rayIn(ray, place) {
    const from = this.camera.place;
    if (place === from) return ray;
    return { o: this.world.tree.convert(ray.o, from, place), d: v3.norm(this.world.tree.convertVec(ray.d, from, place)) };
  }

  /** Hit test a site under the screen point; adds `point` (site place units). */
  hitSite(site, sx, sy) {
    if (!site?.sim) return null;
    const ray = this.rayIn(this.rayAt(sx, sy), site.place);
    const h = site.hit(ray);
    if (h) h.point = rayAt(ray, h.t);
    return h;
  }

  /** Tool point: module coordinates and module units per CSS pixel there. */
  toolPoint(h) {
    const pxPlace = (2 * h.t * Math.tan(FOVY / 2)) / this.renderer.height;
    return { x: h.x, y: h.y, upp: pxPlace * h.mpp };
  }

  pixelSize(dist) {
    return (2 * dist * Math.tan(FOVY / 2)) / this.renderer.height;
  }

  localPos(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  onDown(e) {
    this.canvas.setPointerCapture(e.pointerId);
    const [sx, sy] = this.localPos(e);
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: sx, y: sy });
      if (this.touches.size === 2) {
        if (this.drag?.mode === 'tool') this.app.tools.reset();
        this.drag = { mode: 'pinch', moved: true };
        this.app.pointer.down = false;
        return;
      }
    }
    const app = this.app;
    app.pointer.shift = e.shiftKey;
    this.drag = { x: sx, y: sy, sx, sy, button: e.button, moved: false, mode: e.button === 0 ? 'orbit' : 'pan' };
    if (e.button !== 0) return;
    const site = this.world.active;
    const h = this.hitSite(site, sx, sy);
    if (!h?.inside || this.camera.flying) return;
    if (app.tool === 'inspect') {
      app.tools.down(this.toolPoint(h));
      return;
    }
    this.drag.mode = 'tool';
    this.hover = { site, ...h };
    Object.assign(app.pointer, { down: true, button: 0 });
    app.tools.down(this.toolPoint(h));
  }

  onMove(e) {
    const [sx, sy] = this.localPos(e);
    if (this.touches.has(e.pointerId) && this.touches.size === 2) {
      const [a, b] = [...this.touches.values()];
      const before = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      this.touches.set(e.pointerId, { x: sx, y: sy });
      const [c, d] = [...this.touches.values()];
      const dist = Math.hypot(c.x - d.x, c.y - d.y);
      if (before.d > 0 && dist > 0) this.camera.zoom(before.d / dist);
      this.camera.pan((c.x + d.x) / 2 - before.mx, (c.y + d.y) / 2 - before.my, this.renderer.height);
      return;
    }
    if (this.touches.has(e.pointerId)) this.touches.set(e.pointerId, { x: sx, y: sy });
    const site = this.world.active;
    const tool = this.app.tool;
    const h = ['add', 'remove', 'energy', 'force', 'move'].includes(tool) ? this.hitSite(site, sx, sy) : null;
    this.hover = h ? { site, ...h, sx, sy } : null;
    const d = this.drag;
    if (!d || d.mode === 'pinch') return;
    const dx = sx - d.x, dy = sy - d.y;
    d.x = sx;
    d.y = sy;
    if (Math.hypot(sx - d.sx, sy - d.sy) > 4) d.moved = true;
    if (d.mode === 'tool') {
      if (h) this.app.tools.move(this.toolPoint(h));
    } else if (d.moved) {
      this.camera.flight = null;
      if (d.mode === 'orbit') this.camera.orbit(dx, dy);
      else {
        this.track = null;
        this.camera.pan(dx, dy, this.renderer.height);
      }
    }
  }

  onUp(e) {
    this.touches.delete(e.pointerId);
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    const [sx, sy] = this.localPos(e);
    if (d.mode === 'tool') {
      const h = this.hitSite(this.world.active, sx, sy);
      this.app.tools.up(h ? this.toolPoint(h) : null);
      this.app.pointer.down = false;
      return;
    }
    if (!d.moved && d.button === 0) this.click(sx, sy);
  }

  /** A click on another site (its surface or globe) makes it active. */
  click(sx, sy) {
    const active = this.world.active;
    let best = null;
    for (const site of this.camera.place.sites) {
      if (site === active || !site.sim) continue;
      const h = this.hitSite(site, sx, sy);
      if (!h?.inside) continue;
      if (site.spec.type !== 'globe' && v3.dist(h.point, site.center) > site.radius) continue;
      if (!best || h.t < best.t) best = { site, t: h.t };
    }
    if (best) this.activate(best.site);
  }

  onWheel(e) {
    e.preventDefault();
    const [sx, sy] = this.localPos(e);
    this.zoomAt(sx, sy, Math.exp(e.deltaY * 0.0015));
  }

  /**
   * Zoom towards what is under the pointer: a child place whose marker is near
   * the pointer (the camera then rides along with it, so a moving planet can be
   * entered), else the active site if hit, else along the ray.
   */
  zoomAt(sx, sy, factor) {
    const c = this.camera;
    c.flight = null;
    if (this.track?.parent === c.place && factor < 1) {
      c.zoom(factor);
      return;
    }
    const near = this.markerNear(sx, sy);
    if (near) {
      this.zoomOnto(near, factor);
      return;
    }
    this.track = null;
    const ray = this.rayAt(sx, sy);
    let point = rayAt(ray, c.distance);
    for (const site of [this.world.active, ...c.place.sites]) {
      if (site?.place !== c.place) continue;
      const h = this.hitSite(site, sx, sy);
      if (h && (h.inside || site === this.world.active) && h.t < c.distance * 4) { point = h.point; break; }
    }
    if (c.place.occluder) {
      const t = raySphere(ray, [0, 0, 0], c.place.occluder);
      if (t !== null) point = rayAt(ray, t);
    }
    c.zoom(factor, point);
  }

  /** Child place whose marker is within 28 px of a screen point. */
  markerNear(sx, sy) {
    let best = null, bestD = 28;
    for (const [place, [x, y]] of this.placeMarkers ?? []) {
      const d = Math.hypot(x - sx, y - sy);
      if (d < bestD) { best = place; bestD = d; }
    }
    return best;
  }

  /** Centre on a child place and zoom; the camera then follows it as it moves. */
  zoomOnto(place, factor) {
    const c = this.camera;
    if (place.parent !== c.place) return;
    c.flight = null;
    if (this.track !== place) {
      this.track = place;
      const eye = c.eye();
      c.target = [...place.position];
      c.offset = v3.sub(eye, c.target);
    }
    c.zoom(factor);
  }

  onKey(e) {
    if (e.target.closest?.('input, select, textarea, dialog') || e.ctrlKey || e.metaKey || e.altKey) return;
    const c = this.camera, k = e.key;
    const orbit = { ArrowLeft: [-30, 0], a: [-30, 0], ArrowRight: [30, 0], d: [30, 0], ArrowUp: [0, -20], w: [0, -20], ArrowDown: [0, 20], s: [0, 20] }[k];
    if (orbit) {
      e.preventDefault();
      c.flight = null;
      c.orbit(...orbit);
    } else if (k === '+' || k === '=') c.zoom(0.8);
    else if (k === '-' || k === '_') c.zoom(1.25);
    else if (k === 'Backspace') { e.preventDefault(); this.goUp(); }
    else if (k === 'h' || k === 'H') this.goHome();
    else if (k === 't' || k === 'T') this.tour.toggle();
    else if (k === 'Escape') this.tour.stop();
  }

  // ---------- main loop ----------

  frame(now, dt) {
    const t0 = performance.now();
    this.time += dt;
    // Flights run on wall-clock time (capped), so they end on time even when frames are slow.
    const wall = Math.min(0.25, this.lastNow === undefined ? dt : Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;
    const c = this.camera;
    if (this.track && (c.place !== this.track.parent || c.flying)) this.track = null;
    if (this.track) c.target = [...this.track.position];
    if (!c.update(wall)) {
      c.handOver();
      c.settleUp(dt);
    }
    this.keepOutside();
    const layers = this.layerPlaces();
    const visible = new Set();
    for (const p of layers) if (p === c.place || p.parent === c.place) for (const s of p.sites) visible.add(s);
    this.world.assignTiers(visible, this.time);
    const app = this.app;
    if (app.running) {
      if (this.drag?.mode === 'tool' && app.tool === 'energy' && this.hover) {
        const h = this.hitSite(this.world.active, this.hover.sx ?? this.drag.x, this.hover.sy ?? this.drag.y);
        if (h) app.tools.energy(this.toolPoint(h), dt, app.energySign(), app.energyStrength());
      }
      this.world.step(dt, app.speed);
    } else {
      this.world.updateFollow();
    }
    if (this.track && this.track.parent !== c.place) this.track = null; // entered it, or left
    if (this.track) c.target = [...this.track.position]; // ride along with a moving planet
    if (!this.renderer.lost) this.render(layers);
    this.updateHud(layers);
    this.tour.tick(dt);
    if (this.time - this.lastPanel > 0.5) {
      this.lastPanel = this.time;
      this.couplingPanel.update();
      const driven = this.world.couplings.driven(this.world.active.id);
      app.setDriven(driven);
      if (Object.keys(driven).length) app.syncParams();
    }
    const ms = performance.now() - t0;
    this.frameMs = this.frameMs * 0.9 + ms * 0.1;
    this.world.scheduler.adapt(1000 * dt, dt);
    this.watchFps(dt);
  }

  /** Never let the eye sink into a planet. */
  keepOutside() {
    const c = this.camera, occ = c.place.occluder;
    if (!occ) return;
    const eye = c.eye(), min = occ * 1.0008;
    if (v3.len(eye) < min) c.offset = v3.sub(v3.scale(v3.norm(eye), min), c.target);
  }

  /** Offer a lower quality, then 2D, after five seconds below 20 fps (W-RR-2). */
  watchFps(dt) {
    this.fpsLow = dt > 0.05 - 1e-9 || 1 / Math.max(dt, 1e-3) < 20 ? this.fpsLow + dt : 0;
    if (this.fpsLow < 5 || this.fpsOffered) return;
    this.fpsOffered = true;
    const actions = this.quality !== 'low' ? [{ label: 'Lower quality', run: () => this.setQuality('low') }] : [];
    actions.push({ label: 'Open in 2D', run: () => this.openIn2D() });
    this.notice('The world is running slowly on this device.', actions);
  }

  /** Places drawn this frame: ancestors (far), the current place, and visible children. */
  layerPlaces() {
    const c = this.camera, cur = c.place, eye = c.eye();
    const out = [];
    let a = cur.parent;
    for (let n = cur.ancestors; a && n > 0; n--, a = a.parent) out.unshift(a);
    out.push(cur);
    for (const ch of cur.children) {
      const d = v3.dist(ch.position, eye);
      const r = ch.size * ch.scale;
      if (r / this.pixelSize(Math.max(d, 1e-30)) < 1.5) continue;
      if (this.occluded(ch.position, eye, cur)) continue;
      out.push(ch);
    }
    return out;
  }

  /** True when a planet (the place's occluder sphere) hides point p from the eye. */
  occluded(p, eye, place) {
    if (!place.occluder) return false;
    const d = v3.sub(p, eye), len = v3.len(d);
    const t = raySphere({ o: eye, d: v3.scale(d, 1 / len) }, [0, 0, 0], place.occluder);
    return t !== null && t < len * 0.999 && v3.len(p) > place.occluder * 0.999;
  }

  // ---------- rendering ----------

  render(layers) {
    const r = this.renderer, c = this.camera, tree = this.world.tree, cur = c.place;
    r.begin(hexColor(cur.sky));
    this.labels = [];
    const eye = c.eye(), fwd = c.forward(), up = c.up;
    this.layersDrawn = [];
    for (const place of layers) {
      const eyeL = tree.convert(eye, cur, place);
      const fwdL = v3.norm(tree.convertVec(fwd, cur, place));
      const upL = v3.norm(tree.convertVec(up, cur, place));
      const view = mat4.lookDir(fwdL, upL);
      const [near, far] = this.depthRange(place, eyeL);
      const light = place.light ?? this.world.sunDirection(place) ?? [0.35, 0.85, 0.4];
      r.layer(view, near, far, light);
      const pv = mat4.multiply(mat4.perspective(FOVY, r.width / r.height, near, far), view);
      const fc = this.frameContext(place, eyeL, upL, pv, light);
      this.layersDrawn.push({ place, eyeL, pv });
      this.drawDecor(place, fc);
      for (const site of place.sites) {
        if (!site.sim || !this.inFront(site, eyeL, fwdL)) continue;
        fc.active = site === this.world.active;
        fc.selected = fc.active ? this.app.selected : null;
        try {
          site.render(fc);
          if (fc.active && this.app.selected) site.drawSelection(fc, this.app.selected);
        } catch (err) {
          if (!site.error) console.error(`Site ${site.id} could not draw:`, err);
          site.error = err;
        }
      }
      if (this.world.active?.place === place) this.drawGizmos(fc);
    }
  }

  /** Near and far planes for one layer from the camera distance and the place's extent. */
  depthRange(place, eyeL) {
    const c = this.camera;
    const D = v3.len(eyeL), E = place.extent * 1.5;
    if (place === c.place) {
      const far = Math.max(D + E, c.distance * 20);
      return [Math.max(c.distance * 0.01, far * 1e-7), far];
    }
    const far = D + E;
    return [Math.max(far * 1e-6, (D - E) * 0.5), far];
  }

  inFront(site, eyeL, fwdL) {
    const d = v3.sub(site.center, eyeL);
    return v3.dot(d, fwdL) > -site.radius * 1.5 || v3.len(d) < site.radius * 2;
  }

  frameContext(place, eyeL, upL, pv, light) {
    const q = QUALITY[this.quality];
    const rel = (p) => [p[0] - eyeL[0], p[1] - eyeL[1], p[2] - eyeL[2]];
    const project = (p) => {
      const [x, y, , w] = mat4.transform(pv, rel(p));
      if (w <= 0) return null;
      return [((x / w + 1) / 2) * this.renderer.width, ((1 - y / w) / 2) * this.renderer.height];
    };
    return {
      renderer: this.renderer, eye: eyeL, time: this.time, light,
      ambientHz: q.ambientHz, texturePx: q.texturePx, active: false, selected: null,
      pixelSize: (dist) => this.pixelSize(dist),
      inside: (id) => this.camera.place.path().some((p) => p.id === id),
      rel, project,
      canvas: (site, w, h) => this.canvasFor(site, w, h),
      label: (text, p, offsetPx = 6) => {
        const s = project(p);
        if (s) this.labels.push({ text, x: s[0] + offsetPx, y: s[1] - offsetPx - 12 });
      },
      ring: (center, radius, color) => this.renderer.lines(facingRing(center, radius, eyeL, upL), color),
    };
  }

  canvasFor(site, w, h) {
    let cv = this.canvases.get(site.id);
    if (!cv) {
      cv = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
      this.canvases.set(site.id, cv);
    }
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
    }
    return cv;
  }

  /** Brush ring and force arrow on the active site, at the pointer. */
  drawGizmos(fc) {
    const app = this.app, h = this.hover, r = this.renderer;
    if (!h || h.site !== this.world.active || !h.point) return;
    const tool = app.tool;
    if (['add', 'remove', 'energy'].includes(tool) && h.inside) {
      const n = h.normal ?? [0, 1, 0];
      let a = v3.cross(n, [0, 1, 0]);
      if (v3.len(a) < 1e-6) a = [1, 0, 0];
      a = v3.norm(a);
      const b = v3.cross(n, a);
      const radius = app.brushPx() * fc.pixelSize(h.t);
      const neg = tool === 'remove' || (tool === 'energy' && app.energySign() < 0);
      const lift = v3.scale(n, radius * 0.01);
      r.lines(Float32Array.from(circlePoints(fc.rel(v3.add(h.point, lift)), a, b, radius, 48)), neg ? [0.47, 0.7, 1, 0.9] : [1, 0.67, 0.31, 0.9], true, false);
    }
    const f = app.tools.forceStart;
    if (tool === 'force' && f && this.drag?.mode === 'tool') {
      const s = fc.rel(h.site.toPlace(f.x, f.y)), e = fc.rel(h.point);
      const dir = v3.sub(e, s), len = v3.len(dir);
      if (len > 0) {
        const back = v3.scale(dir, -0.15), side = v3.scale(v3.norm(v3.cross(dir, h.normal ?? [0, 1, 0])), len * 0.07);
        r.lines(Float32Array.from([...s, ...e, ...e, ...v3.add(v3.add(e, back), side), ...e, ...v3.add(v3.sub(e, side), back)]), [1, 0.83, 0.3, 1], false, false);
      }
    }
  }

  // ---------- decor: galaxies, star fields, ground ----------

  drawDecor(place, fc) {
    let items = this.decor.get(place.id);
    if (!items) {
      items = place.decor.map((d, i) => makeDecor(d, i));
      this.decor.set(place.id, items);
    }
    const r = this.renderer;
    for (const d of items) {
      if (d.points) {
        const n = d.count, buf = d.buf;
        for (let i = 0; i < n; i++) {
          buf[i * 8] = d.points[i * 3] - fc.eye[0];
          buf[i * 8 + 1] = d.points[i * 3 + 1] - fc.eye[1];
          buf[i * 8 + 2] = d.points[i * 3 + 2] - fc.eye[2];
        }
        r.points(buf, n, true);
      } else if (d.kind === 'ground') {
        r.mesh('disc', mat4.model(IDENTITY_BASIS, fc.rel([0, -0.001 * d.radius, 0]), d.radius), { color: hexColor(d.color), lit: 0.5, night: 0.6 });
      } else if (d.kind === 'box') {
        r.mesh('box', mat4.model(IDENTITY_BASIS, fc.rel(d.center), d.size), { color: hexColor(d.color), lit: 0.8, night: 0.5 });
      }
    }
  }

  // ---------- HUD ----------

  updateHud() {
    const c = this.camera, cur = c.place;
    this.hud.breadcrumb(cur, (p) => this.flyToPlace(p));
    this.hud.scale(this.pixelSize(c.distance) * cur.unit.metres);
    const layer = this.layersDrawn.find((l) => l.place === cur);
    const markers = [];
    this.placeMarkers = [];
    if (layer) {
      const eye = c.eye();
      const project = (p) => {
        const [x, y, , w] = mat4.transform(layer.pv, v3.sub(p, eye));
        if (w <= 0) return null;
        const sx = ((x / w + 1) / 2) * this.renderer.width, sy = ((1 - y / w) / 2) * this.renderer.height;
        return sx < -50 || sy < -20 || sx > this.renderer.width + 50 || sy > this.renderer.height + 20 ? null : [sx, sy];
      };
      for (const ch of cur.children) {
        if (this.occluded(ch.position, eye, cur)) continue;
        const s = project(ch.position);
        if (!s) continue;
        this.placeMarkers.push([ch, s]);
        markers.push({
          key: `p:${ch.id}`, kind: 'place', label: ch.label, title: `${ch.description} Click to fly there, or scroll to zoom in.`, x: s[0], y: s[1],
          onClick: () => this.flyToPlace(ch), onWheel: (e) => this.zoomOnto(ch, Math.exp(e.deltaY * 0.0015)),
        });
      }
      for (const site of cur.sites) {
        if (site === this.world.active) continue;
        const s = project(site.anchor);
        if (s) markers.push({ key: `s:${site.id}`, kind: 'site', label: site.label, badge: site.error ? '⚠ stopped' : '', title: `${site.Sim.meta.title}. Click to make it active.`, x: s[0], y: s[1], onClick: () => this.activate(site), onWheel: (e) => this.onWheel(e) });
      }
    }
    this.hud.setMarkers(markers);
    this.hud.setLabels(this.labels.slice(0, 40));
  }
}

/** Seeded point clouds and simple shapes for a place's scenery. */
export function makeDecor(d, index) {
  const rng = new Random(1000 + index * 7919);
  if (d.kind === 'milkyway' || d.kind === 'stars' || d.kind === 'starfield') {
    const n = d.count, points = new Float64Array(n * 3), buf = new Float32Array(n * 8);
    for (let i = 0; i < n; i++) {
      let x, y, z, col, size;
      if (d.kind === 'milkyway') {
        // Two logarithmic spiral arms plus a bulge, in the x–z plane.
        const bulge = i < n * 0.18;
        const rr = bulge ? Math.abs(rng.gaussian()) * d.radius * 0.12 : d.radius * (0.08 + 0.92 * Math.sqrt(rng.next()));
        const arm = (i % 2) * Math.PI;
        const th = bulge ? rng.range(0, Math.PI * 2) : arm + Math.log(rr / (d.radius * 0.05)) * 2.2 + rng.gaussian() * 0.35;
        x = rr * Math.cos(th);
        z = rr * Math.sin(th);
        y = rng.gaussian() * d.radius * (bulge ? 0.05 : 0.012);
        col = bulge ? [1, 0.86, 0.62] : rng.next() < 0.3 ? [0.62, 0.75, 1] : [0.92, 0.92, 1];
        size = bulge ? 2.2 : 1.6;
      } else if (d.kind === 'starfield') {
        // Distant stars on a big sphere.
        const u = rng.range(-1, 1), th = rng.range(0, Math.PI * 2), s = Math.sqrt(1 - u * u);
        x = d.radius * s * Math.cos(th);
        y = d.radius * u;
        z = d.radius * s * Math.sin(th);
        col = [0.85, 0.88, 1];
        size = rng.next() < 0.1 ? 2 : 1.2;
      } else {
        x = rng.range(-1, 1) * d.radius;
        y = rng.gaussian() * d.radius * 0.15;
        z = rng.range(-1, 1) * d.radius;
        col = rng.next() < 0.2 ? [1, 0.8, 0.6] : [0.9, 0.93, 1];
        size = rng.next() < 0.05 ? 3 : 1.5;
      }
      points.set([x, y, z], i * 3);
      buf.set([0, 0, 0, size, col[0], col[1], col[2], 0.75], i * 8);
    }
    return { kind: d.kind, points, buf, count: n };
  }
  return { ...d };
}
