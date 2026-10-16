import { View } from './view.js';
import { Chart } from './chart.js';
import { fmt } from '../core/math.js';

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
    this.buildChrome();
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
      if (e.target.closest('input, select, textarea')) return;
      if (e.code === 'Space') { e.preventDefault(); this.setRunning(!this.running); }
      else if (e.key === '.') this.stepOnce();
      else if (e.key === 'f') this.fitView();
      else if (e.key === 'Escape') this.select(null);
      else if (e.key === 'Delete' && this.selected) { this.sim.remove(this.selected); this.select(null); }
      else {
        const t = TOOLS.find((x) => x.key === e.key);
        if (t) this.setTool(t.id);
      }
    });
    window.addEventListener('keyup', (e) => { this.pointer.shift = e.shiftKey; });
  }

  routeFromHash() {
    const [simId, scenarioId] = location.hash.replace(/^#/, '').split('/');
    const S = this.simulations.find((s) => s.meta.id === simId) ?? this.simulations[0];
    if (!this.sim || this.sim.constructor !== S) this.loadSim(S, scenarioId);
    else if (scenarioId && scenarioId !== this.sim.scenarioId) this.loadScenario(scenarioId);
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
    this.resetChart();
    this.fitView();
    this.renderInspector(true);
    this.setTool(this.tool);
  }

  loadScenario(id) {
    this.sim.loadScenario(id);
    this.selected = null;
    $('#scenario-select').value = id;
    const hash = `${this.sim.meta.id}/${id}`;
    if (location.hash.slice(1) !== hash) history.replaceState(null, '', `#${hash}`);
    this.syncParams();
    this.resetChart();
    this.fitView();
    this.renderInspector(true);
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
        input.addEventListener('click', () => { this.sim.setProperty(this.selected, f.key, true); this.renderInspector(true); });
        input.dataset.key = f.key;
        return el('div', { className: 'field action' }, input);
      } else if (f.type === 'select') {
        input = el('select');
        for (const o of f.options) input.append(el('option', { value: o.value, textContent: o.label }));
        input.value = f.value;
        input.addEventListener('change', () => this.sim.setProperty(this.selected, f.key, input.value));
      } else {
        const isNum = f.type === 'number';
        input = el('input', { type: isNum ? 'number' : 'text', value: isNum ? +Number(f.value).toPrecision(5) : f.value, step: f.step ?? 'any' });
        input.addEventListener('change', () => {
          const v = isNum ? parseFloat(input.value) : input.value;
          if (isNum && !Number.isFinite(v)) return;
          this.sim.setProperty(this.selected, f.key, v);
        });
      }
      input.dataset.key = f.key;
      return el('label', { className: 'field' }, el('span', { textContent: f.label }), input);
    });
    const del = el('button', { className: 'danger', textContent: 'Remove object' });
    del.addEventListener('click', () => { this.sim.remove(this.selected); this.select(null); });
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
    const [wx, wy] = this.view.toWorld(sx, sy);
    Object.assign(this.pointer, { x: sx, y: sy, down: true, button: e.button, shift: e.shiftKey, startX: sx, startY: sy, inside: true });
    if (e.button !== 0) return; // right/middle drag pans
    const tol = 10 / this.view.scale;
    const sim = this.sim;
    switch (this.tool) {
      case 'inspect':
        this.select(sim.pick(wx, wy, tol));
        break;
      case 'move': {
        const t = sim.pick(wx, wy, tol);
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
        this.chart.push(Object.fromEntries(stats.map((s) => [s.key, s.value])));
      }
      this.chart.draw();
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
