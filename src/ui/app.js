import { View } from './view.js';
import { Chart } from './chart.js';
import { fmt } from '../core/math.js';
import { History } from './history.js';
import { LessonPanel } from './lesson-panel.js';
import { LESSONS } from '../lessons/index.js';
import { buildHash, coerceParams, diffParams, download, parseHash, toCSV } from './persistence.js';

const MAX_SAMPLES = 20000;

const TOOLS = [
  { id: 'inspect', label: 'Inspect', key: '1', hint: 'Click an object to see and edit its properties.' },
  { id: 'move', label: 'Move', key: '2', hint: 'Drag an object to reposition it.' },
  { id: 'add', label: 'Add', key: '3', hint: 'Click to add the selected kind of object.' },
  { id: 'remove', label: 'Remove', key: '4', hint: 'Click or drag to remove things.' },
  { id: 'force', label: 'Force', key: '5', hint: 'Drag from an object (or empty space) to apply a push in that direction.' },
  { id: 'energy', label: 'Energy', key: '6', hint: 'Hold to add energy in the brush area; hold Shift (or tick Invert) to remove it.' },
];

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, props = {}, ...children) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const c of children) n.append(c);
  return n;
};

export class App {
  constructor(root, simulations) {
    this.root = root;
    this.simulations = simulations;
    this.view = new View();
    this.canvas = $('#world', root);
    this.ctx = this.canvas.getContext('2d');
    this.chart = new Chart($('#chart', root));
    this.running = true;
    this.speed = 1;
    this.tool = 'inspect';
    this.selected = null;
    this.pointer = { x: 0, y: 0, inside: false, down: false, button: 0, shift: false };
    this.lastFrame = performance.now();
    this.lastStats = 0;
    this.lastSample = 0;
    this.lastInspect = 0;
    this.frameMs = 0;
    this.history = new History();
    this.samples = [];
    this.touches = new Map();
    this.buildChrome();
    this.lessons = new LessonPanel(this, LESSONS);
    this.bindInput();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('hashchange', () => this.routeFromHash());
    this.resize();
    this.routeFromHash();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------- setup ----------

  buildChrome() {
    const simSelect = $('#sim-select');
    const groups = {};
    for (const S of this.simulations) (groups[S.meta.category] ??= []).push(S);
    for (const [cat, list] of Object.entries(groups)) {
      const og = el('optgroup', { label: cat });
      for (const S of list) og.append(el('option', { value: S.meta.id, textContent: S.meta.title }));
      simSelect.append(og);
    }
    simSelect.addEventListener('change', () => { location.hash = simSelect.value; });
    $('#scenario-select').addEventListener('change', (e) => this.loadScenario(e.target.value));
    $('#play').addEventListener('click', () => this.setRunning(!this.running));
    $('#step').addEventListener('click', () => this.stepOnce());
    $('#reset').addEventListener('click', () => this.loadScenario(this.sim.scenarioId));
    $('#fit').addEventListener('click', () => this.fitView());
    const speed = $('#speed');
    speed.addEventListener('input', () => {
      this.speed = Math.pow(2, Number(speed.value));
      $('#speed-label').textContent = `${+this.speed.toFixed(2)}×`;
    });

    const tools = $('#tools');
    for (const t of TOOLS) {
      const b = el('button', { className: 'tool', textContent: t.label, title: `${t.hint} [${t.key}]` });
      b.dataset.tool = t.id;
      b.addEventListener('click', () => this.setTool(t.id));
      tools.append(b);
    }
    $('#brush').addEventListener('input', (e) => { $('#brush-label').textContent = `${e.target.value}px`; });

    $('#undo').addEventListener('click', () => this.undo());
    $('#redo').addEventListener('click', () => this.redo());
    $('#save').addEventListener('click', () => this.saveWorld());
    $('#load').addEventListener('click', () => $('#load-file').click());
    $('#load-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) this.loadWorld(await file.text(), file.name);
    });
    $('#share').addEventListener('click', () => this.shareLink());
    $('#csv').addEventListener('click', () => this.exportCSV());
    $('#model-btn').addEventListener('click', () => this.showModel());
    $('#model-dialog').addEventListener('click', (e) => { if (e.target.id === 'model-dialog') e.target.close(); });
  }

  /** Open the "Model & assumptions" dialog for the current simulation. */
  showModel() {
    const { title, model } = this.sim.meta;
    $('#model-title').textContent = `${title}: model & assumptions`;
    const section = (heading, items, tag = 'ul') => items?.length
      ? [el('h3', { textContent: heading }), el(tag, {}, ...items.map((t) => el('li', { textContent: t })))]
      : [];
    $('#model-body').replaceChildren(
      el('p', { textContent: model?.summary ?? 'No model notes yet for this simulation.' }),
      ...section('Equations', model?.equations, 'ol'),
      ...section('Simplifications', model?.assumptions),
      ...section('Further reading', model?.references),
    );
    $('#model-body').querySelector('ol')?.classList.add('equations');
    $('#model-dialog').showModal();
  }

  bindInput() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => this.onUp(e));
    c.addEventListener('pointerleave', () => { this.pointer.inside = false; });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      this.view.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      this.pointer.shift = e.shiftKey;
      if (e.target.closest('input, select, textarea, dialog')) return;
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); }
        else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); this.redo(); }
        else if (k === 's') { e.preventDefault(); this.saveWorld(); }
        return;
      }
      if (e.code === 'Space') { e.preventDefault(); this.setRunning(!this.running); }
      else if (e.key === '.') this.stepOnce();
      else if (e.key === 'f') this.fitView();
      else if (e.key === 'Escape') this.select(null);
      else if (e.key === 'Delete' && this.selected) { this.checkpoint(); this.sim.remove(this.selected); this.select(null); }
      else {
        const t = TOOLS.find((x) => x.key === e.key);
        if (t) this.setTool(t.id);
      }
    });
    window.addEventListener('keyup', (e) => { this.pointer.shift = e.shiftKey; });
  }

  routeFromHash() {
    const { simId, scenarioId, params } = parseHash(location.hash);
    // #learn/<lesson-id> opens a lesson directly.
    if (simId === 'learn' && this.lessons.find(scenarioId)) {
      if (!this.sim) this.loadSim(this.simulations.find((s) => s.meta.id === this.lessons.find(scenarioId).sim));
      this.lessons.start(scenarioId);
      return;
    }
    const S = this.simulations.find((s) => s.meta.id === simId) ?? this.simulations[0];
    if (!this.sim || this.sim.constructor !== S) this.loadSim(S, scenarioId);
    else if (scenarioId && scenarioId !== this.sim.scenarioId) this.loadScenario(scenarioId);
    // Parameters from a shared link override the scenario defaults.
    const typed = coerceParams(this.sim.paramDefs, params);
    for (const [k, v] of Object.entries(typed)) this.sim.setParam(k, v);
    if (Object.keys(typed).length) this.syncParams();
  }

  loadSim(S, scenarioId) {
    this.sim = new S();
    if (scenarioId && this.sim.scenarios.some((s) => s.id === scenarioId)) this.sim.loadScenario(scenarioId);
    this.view.yUp = !!S.meta.yUp;
    this.selected = null;
    $('#sim-select').value = S.meta.id;
    $('#sim-title').textContent = S.meta.title;
    $('#sim-description').textContent = S.meta.description;
    const sc = $('#scenario-select');
    sc.replaceChildren(...this.sim.scenarios.map((s) => el('option', { value: s.id, textContent: s.label })));
    sc.value = this.sim.scenarioId;
    const kinds = $('#kind-select');
    kinds.replaceChildren(...this.sim.spawnKinds.map((k) => el('option', { value: k.id, textContent: k.label })));
    $('#energy-label').textContent = `${this.sim.energyTool.label} / ${this.sim.energyTool.negLabel}`;
    this.buildParams();
    this.resetRecording();
    this.fitView();
    this.renderInspector(true);
    this.setTool(this.tool);
    this.lessons.onSimChanged();
  }

  loadScenario(id) {
    this.sim.loadScenario(id);
    this.selected = null;
    $('#scenario-select').value = id;
    const hash = `${this.sim.meta.id}/${id}`;
    if (location.hash.slice(1) !== hash) history.replaceState(null, '', `#${hash}`);
    this.syncParams();
    this.resetRecording();
    this.fitView();
    this.renderInspector(true);
  }

  /** Clear chart, recorded samples and undo history (a new world starts). */
  resetRecording() {
    this.history.clear();
    this.samples = [];
    this.resetChart();
    this.updateHistoryButtons();
  }

  // ---------- undo / redo, save / load, sharing ----------

  checkpoint() {
    try {
      this.history.checkpoint(this.sim.serialize());
    } catch (err) {
      console.warn('Undo snapshot failed', err);
    }
    this.updateHistoryButtons();
  }

  restore(snapshot) {
    this.sim.deserialize(snapshot);
    this.selected = null;
    this.syncParams();
    this.renderInspector(true);
    this.updateHistoryButtons();
  }

  undo() {
    if (!this.history.canUndo) return;
    this.restore(this.history.undo(this.sim.serialize()));
    this.status('Undone');
  }

  redo() {
    if (!this.history.canRedo) return;
    this.restore(this.history.redo(this.sim.serialize()));
    this.status('Redone');
  }

  updateHistoryButtons() {
    $('#undo').disabled = !this.history.canUndo;
    $('#redo').disabled = !this.history.canRedo;
  }

  status(message, isError = false) {
    const s = $('#status');
    s.textContent = message;
    s.classList.toggle('error', isError);
    clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => { s.textContent = ''; }, isError ? 6000 : 2500);
  }

  saveWorld() {
    const data = this.sim.serialize();
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    download(`${data.sim}-${data.scenario}-${stamp}.json`, JSON.stringify(data));
    this.status('World saved');
  }

  loadWorld(text, name = 'file') {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      this.status(`${name} is not valid JSON`, true);
      return;
    }
    const S = this.simulations.find((s) => s.meta.id === data?.sim);
    if (!S) {
      this.status(`${name} is not a Simulations save file`, true);
      return;
    }
    const previous = this.sim;
    try {
      if (this.sim.constructor !== S) this.loadSim(S);
      this.sim.deserialize(data);
    } catch (err) {
      if (previous.constructor !== this.sim.constructor) this.loadSim(previous.constructor);
      this.status(`Could not load ${name}: ${err.message}`, true);
      return;
    }
    $('#scenario-select').value = this.sim.scenarioId;
    history.replaceState(null, '', buildHash(this.sim.meta.id, this.sim.scenarioId));
    this.selected = null;
    this.syncParams();
    this.resetRecording();
    this.fitView();
    this.renderInspector(true);
    this.status(`Loaded ${name}`);
  }

  async shareLink() {
    const S = this.sim.constructor;
    const reference = new S();
    reference.loadScenario(this.sim.scenarioId);
    const hash = buildHash(this.sim.meta.id, this.sim.scenarioId, diffParams(this.sim.params, reference.params));
    const url = `${location.href.split('#')[0]}${hash}`;
    history.replaceState(null, '', hash);
    try {
      await navigator.clipboard.writeText(url);
      this.status('Link copied to clipboard');
    } catch {
      this.status('Link is in the address bar');
    }
  }

  exportCSV() {
    if (!this.samples.length) {
      this.status('Nothing recorded yet. Let the simulation run first.', true);
      return;
    }
    const stats = this.sim.stats().filter((s) => typeof s.value === 'number');
    const columns = [{ key: 'time', label: `Time (${this.sim.timeUnit})` }, ...stats.map((s) => ({ key: s.key, label: s.label }))];
    download(`${this.sim.meta.id}-${this.sim.scenarioId}-stats.csv`, toCSV(this.samples, columns), 'text/csv');
    this.status(`Exported ${this.samples.length} rows`);
  }

  resetChart() {
    const stats = this.sim.stats();
    this.chart.reset(this.sim.chartKeys.map((k) => {
      const s = stats.find((x) => x.key === k);
      return { key: k, label: s?.label ?? k, color: s?.color };
    }));
  }

  fitView() {
    this.view.fit(this.sim.bounds());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    const first = this.view.width <= 1;
    this.view.resize(r.width, r.height);
    if (first && this.sim) this.fitView();
  }

  setRunning(on) {
    this.running = on;
    $('#play').textContent = on ? '❚❚ Pause' : '▶ Play';
  }

  stepOnce() {
    this.setRunning(false);
    this.sim.step(1 / 60);
  }

  setTool(id) {
    this.tool = id;
    for (const b of document.querySelectorAll('.tool')) b.classList.toggle('active', b.dataset.tool === id);
    const t = TOOLS.find((x) => x.id === id);
    $('#tool-hint').textContent = t.hint;
    $('#kind-row').hidden = id !== 'add';
    $('#brush-row').hidden = !['energy', 'remove', 'add'].includes(id);
    $('#energy-row').hidden = id !== 'energy';
    this.canvas.dataset.tool = id;
  }

  select(entity) {
    this.selected = entity;
    this.renderInspector(true);
  }

  // ---------- parameters ----------

  buildParams() {
    const box = $('#params');
    box.replaceChildren();
    this.paramInputs = {};
    for (const d of this.sim.paramDefs) {
      const row = el('label', { className: 'param' });
      const name = el('span', { className: 'param-name', textContent: d.label });
      const value = el('span', { className: 'param-value' });
      let input;
      if (d.type === 'checkbox') {
        input = el('input', { type: 'checkbox' });
        input.addEventListener('change', () => this.sim.setParam(d.key, input.checked));
        row.classList.add('check');
        row.append(input, name);
      } else if (d.type === 'select') {
        input = el('select');
        for (const o of d.options) input.append(el('option', { value: o.value, textContent: o.label }));
        input.addEventListener('change', () => this.sim.setParam(d.key, input.value));
        row.append(name, input);
      } else {
        input = el('input', { type: 'range', min: 0, max: 1000, step: 1 });
        const toValue = (pos) => {
          const t = pos / 1000;
          let v = d.log ? d.min * Math.pow(d.max / d.min, t) : d.min + (d.max - d.min) * t;
          if (d.step) v = Math.round(v / d.step) * d.step;
          return v;
        };
        input.addEventListener('input', () => {
          const v = toValue(Number(input.value));
          this.sim.setParam(d.key, v);
          value.textContent = fmt(v);
        });
        row.append(el('div', { className: 'param-head' }, name, value), input);
      }
      this.paramInputs[d.key] = { d, input, value };
      box.append(row);
    }
    this.syncParams();
  }

  syncParams() {
    for (const { d, input, value } of Object.values(this.paramInputs)) {
      const v = this.sim.params[d.key];
      if (d.type === 'checkbox') input.checked = !!v;
      else if (d.type === 'select') input.value = v;
      else {
        const t = d.log ? Math.log(v / d.min) / Math.log(d.max / d.min) : (v - d.min) / (d.max - d.min);
        input.value = Math.round(Math.min(1, Math.max(0, t)) * 1000);
        value.textContent = fmt(v);
      }
    }
  }

  // ---------- inspector ----------

  renderInspector(force = false) {
    const box = $('#inspector');
    const info = this.selected ? this.sim.describe(this.selected) : null;
    if (!info) {
      if (force || box.dataset.sig) {
        box.dataset.sig = '';
        box.replaceChildren(el('p', { className: 'muted', textContent: 'Nothing selected. Use the Inspect tool and click an object.' }));
      }
      return;
    }
    const sig = info.title.split(' — ')[0] + '|' + info.fields.map((f) => f.key + f.type).join(',');
    if (!force && box.dataset.sig === sig) {
      $('.inspector-title', box).textContent = info.title;
      for (const f of info.fields) {
        const input = box.querySelector(`[data-key="${CSS.escape(f.key)}"]`);
        if (!input || input === document.activeElement || f.type === 'action') continue;
        const shown = typeof f.value === 'number' && f.type !== 'select' ? +f.value.toPrecision(5) : f.value;
        if (input.tagName === 'SPAN') input.textContent = shown;
        else input.value = shown;
      }
      return;
    }
    box.dataset.sig = sig;
    const rows = info.fields.map((f) => {
      let input;
      if (f.type === 'readonly') input = el('span', { className: 'ro', textContent: f.value });
      else if (f.type === 'action') {
        input = el('button', { textContent: f.label });
        input.addEventListener('click', () => { this.checkpoint(); this.sim.setProperty(this.selected, f.key, true); this.renderInspector(true); });
        input.dataset.key = f.key;
        return el('div', { className: 'field action' }, input);
      } else if (f.type === 'select') {
        input = el('select');
        for (const o of f.options) input.append(el('option', { value: o.value, textContent: o.label }));
        input.value = f.value;
        input.addEventListener('change', () => { this.checkpoint(); this.sim.setProperty(this.selected, f.key, input.value); });
      } else {
        const isNum = f.type === 'number';
        input = el('input', { type: isNum ? 'number' : 'text', value: isNum ? +Number(f.value).toPrecision(5) : f.value, step: f.step ?? 'any' });
        input.addEventListener('change', () => {
          const v = isNum ? parseFloat(input.value) : input.value;
          if (isNum && !Number.isFinite(v)) return;
          this.checkpoint();
          this.sim.setProperty(this.selected, f.key, v);
        });
      }
      input.dataset.key = f.key;
      return el('label', { className: 'field' }, el('span', { textContent: f.label }), input);
    });
    const del = el('button', { className: 'danger', textContent: 'Remove object' });
    del.addEventListener('click', () => { this.checkpoint(); this.sim.remove(this.selected); this.select(null); });
    box.replaceChildren(el('h3', { className: 'inspector-title', textContent: info.title }), ...rows, del);
  }

  renderStats() {
    const stats = this.sim.stats();
    $('#stats').replaceChildren(...stats.map((s) => el('div', { className: 'stat' },
      el('span', { textContent: s.label, style: s.color ? `color:${s.color}` : '' }),
      el('b', { textContent: typeof s.value === 'number' ? fmt(s.value, 4) : s.value }))));
    $('#clock').textContent = this.sim.formatTime();
    $('#perf').textContent = `${this.frameMs.toFixed(1)} ms/frame`;
    return stats;
  }

  // ---------- pointer tools ----------

  localPos(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  brushWorld() {
    return Number($('#brush').value) / this.view.scale;
  }

  onDown(e) {
    this.canvas.setPointerCapture(e.pointerId);
    const [sx, sy] = this.localPos(e);
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: sx, y: sy });
      if (this.touches.size === 2) {
        // Second finger: switch from the current tool to pinch-zoom / two-finger pan.
        this.pointer.down = false;
        this.dragTarget = null;
        this.forceStart = null;
        return;
      }
    }
    const [wx, wy] = this.view.toWorld(sx, sy);
    Object.assign(this.pointer, { x: sx, y: sy, down: true, button: e.button, shift: e.shiftKey, startX: sx, startY: sy, inside: true });
    if (e.button !== 0) return; // right/middle drag pans
    const tol = 10 / this.view.scale;
    const sim = this.sim;
    if (['add', 'remove', 'force', 'energy'].includes(this.tool)) this.checkpoint();
    switch (this.tool) {
      case 'inspect':
        this.select(sim.pick(wx, wy, tol));
        break;
      case 'move': {
        const t = sim.pick(wx, wy, tol);
        if (t) this.checkpoint();
        this.dragTarget = t;
        if (t) this.select(t);
        break;
      }
      case 'add': {
        const made = sim.add($('#kind-select').value, wx, wy, this.brushWorld());
        if (made) this.select(made);
        break;
      }
      case 'remove': {
        const gone = sim.removeAt(wx, wy, this.brushWorld());
        if (gone && gone === this.selected) this.select(null);
        this.lastRemove = performance.now();
        break;
      }
      case 'force':
        this.forceStart = { target: sim.pick(wx, wy, tol), wx, wy };
        break;
    }
  }

  onMove(e) {
    const [sx, sy] = this.localPos(e);
    if (this.touches.has(e.pointerId) && this.touches.size === 2) {
      const [a, b] = [...this.touches.values()];
      const before = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      this.touches.set(e.pointerId, { x: sx, y: sy });
      const [c, d] = [...this.touches.values()];
      const mx = (c.x + d.x) / 2, my = (c.y + d.y) / 2;
      const dist = Math.hypot(c.x - d.x, c.y - d.y);
      if (before.d > 0 && dist > 0) this.view.zoomAt(mx, my, dist / before.d);
      this.view.pan(mx - before.mx, my - before.my);
      return;
    }
    if (this.touches.has(e.pointerId)) this.touches.set(e.pointerId, { x: sx, y: sy });
    const p = this.pointer;
    const dx = sx - p.x, dy = sy - p.y;
    Object.assign(p, { x: sx, y: sy, inside: true, shift: e.shiftKey });
    if (!p.down) return;
    if (p.button !== 0 || (this.tool === 'inspect' && Math.hypot(sx - p.startX, sy - p.startY) > 4)) {
      this.view.pan(dx, dy);
      return;
    }
    const [wx, wy] = this.view.toWorld(sx, sy);
    if (this.tool === 'move' && this.dragTarget) this.sim.move(this.dragTarget, wx, wy);
    if (this.tool === 'remove' && performance.now() - this.lastRemove > 60) {
      const gone = this.sim.removeAt(wx, wy, this.brushWorld());
      if (gone && gone === this.selected) this.select(null);
      this.lastRemove = performance.now();
    }
  }

  onUp(e) {
    this.touches.delete(e.pointerId);
    const p = this.pointer;
    if (p.down && p.button === 0 && this.tool === 'force' && this.forceStart) {
      const [sx, sy] = this.localPos(e);
      const [dx, dy] = this.view.deltaToWorld(sx - p.startX, sy - p.startY);
      const f = this.forceStart;
      if (f.target && f.target.alive === false) f.target = null;
      this.sim.impulse(f.target, f.wx, f.wy, dx, dy);
      if (f.target) this.select(f.target);
    }
    p.down = false;
    this.dragTarget = null;
    this.forceStart = null;
  }

  // ---------- main loop ----------

  frame(now) {
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const sim = this.sim;
    const t0 = performance.now();
    const p = this.pointer;
    if (p.down && p.button === 0 && this.tool === 'energy') {
      const [wx, wy] = this.view.toWorld(p.x, p.y);
      const sign = p.shift !== $('#invert').checked ? -1 : 1;
      sim.energy(wx, wy, this.brushWorld(), sign * Number($('#strength').value) * dt);
    }
    if (this.running) {
      try {
        sim.step(dt * this.speed);
      } catch (err) {
        console.error(err);
        this.setRunning(false);
      }
    }
    this.frameMs = this.frameMs * 0.9 + (performance.now() - t0) * 0.1;
    this.draw();
    if (now - this.lastStats > 250) {
      this.lastStats = now;
      const stats = this.renderStats();
      if (this.running) {
        const row = { time: +this.sim.time.toPrecision(8) };
        for (const s of stats) if (typeof s.value === 'number') row[s.key] = s.value;
        this.chart.push(row);
        this.samples.push(row);
        if (this.samples.length > MAX_SAMPLES) this.samples.shift();
      }
      this.chart.draw();
      this.lessons.tick();
    }
    if (now - this.lastInspect > 300) {
      this.lastInspect = now;
      if (this.selected && !this.sim.locate(this.selected)) this.select(null);
      else if (this.selected) this.renderInspector();
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  draw() {
    const { ctx, view, sim } = this;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = sim.background;
    ctx.fillRect(0, 0, view.width, view.height);
    sim.render(ctx, view, { selected: this.selected, width: view.width, height: view.height });
    // Selection highlight.
    const loc = this.selected && sim.locate(this.selected);
    if (loc) {
      const [sx, sy] = view.toScreen(loc.x, loc.y);
      const r = loc.px ?? Math.max(6, loc.r * view.scale + 4);
      ctx.strokeStyle = '#ffffff';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    const p = this.pointer;
    if (!p.inside) return;
    // Tool previews.
    if (['energy', 'remove', 'add'].includes(this.tool)) {
      const neg = this.tool === 'remove' || (this.tool === 'energy' && p.shift !== $('#invert').checked);
      ctx.strokeStyle = neg ? 'rgba(120,180,255,0.8)' : 'rgba(255,170,80,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, Number($('#brush').value), 0, Math.PI * 2); ctx.stroke();
    }
    if (this.tool === 'force' && p.down && this.forceStart) {
      const [sx, sy] = view.toScreen(this.forceStart.wx, this.forceStart.wy);
      ctx.strokeStyle = '#ffd34d';
      ctx.fillStyle = '#ffd34d';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(p.x, p.y); ctx.stroke();
      const a = Math.atan2(p.y - sy, p.x - sx);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - 10 * Math.cos(a - 0.4), p.y - 10 * Math.sin(a - 0.4));
      ctx.lineTo(p.x - 10 * Math.cos(a + 0.4), p.y - 10 * Math.sin(a + 0.4));
      ctx.fill();
    }
    const [wx, wy] = view.toWorld(p.x, p.y);
    ctx.fillStyle = 'rgba(200,210,235,0.6)';
    ctx.font = '11px system-ui';
    ctx.fillText(`(${fmt(wx)}, ${fmt(wy)})`, 8, view.height - 8);
  }
}
