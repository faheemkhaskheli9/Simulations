// "Connected science" in the right panel (WFR-40, WFR-43): each coupling with an
// on/off switch, what it does, and the value it is passing right now.
import { el } from './hud.js';
import { fmt } from '../../core/math.js';

const $ = (sel) => document.querySelector(sel);

export class CouplingPanel {
  constructor(stage) {
    this.stage = stage;
    this.box = $('#couplings');
    this.values = new Map();
  }

  render() {
    const { world, app } = this.stage;
    const set = world.couplings;
    this.values.clear();
    const rows = set.defs.map((d) => {
      const box = el('input', { type: 'checkbox', checked: set.enabled.has(d.id) });
      box.addEventListener('change', () => {
        if (!set.set(d.id, box.checked)) {
          box.checked = false;
          app.status(`"${d.label}" would make a loop of couplings`, true);
          return;
        }
        if (box.checked) set.tick();
        app.setDriven(set.driven(world.active.id));
        this.update();
      });
      const from = world.sites.get(d.from), to = world.sites.get(d.to);
      const value = el('span', { className: 'coupling-value' });
      this.values.set(d.id, value);
      return el('div', { className: 'coupling' },
        el('label', { className: 'check' }, box, el('b', { textContent: d.label })),
        el('div', { className: 'muted small', textContent: `${from.label} → ${to.label}: ${d.explain}` }),
        value);
    });
    this.box.replaceChildren(
      el('p', { className: 'muted small', textContent: 'Link the simulations: one site\'s state sets a parameter of another. All are off by default, so every site behaves exactly as in 2D.' }),
      ...rows,
    );
    this.update();
  }

  update() {
    const set = this.stage.world.couplings;
    for (const [id, span] of this.values) {
      const d = set.get(id), v = set.values[id];
      span.textContent = set.enabled.has(id) ? `${d.param} = ${Number.isFinite(v) ? fmt(v, 3) : '…'} ${d.unit}` : '';
    }
  }
}
