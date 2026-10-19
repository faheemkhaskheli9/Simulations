// The Atlas: a searchable list of every place and site (WFR-6), usable with the
// keyboard alone (W-UA-1). Without WebGL2 it is the way into the world: each
// entry then opens its simulation in the 2D app (W-RR-1).
import { el } from './hud.js';

const $ = (sel) => document.querySelector(sel);

/** Places in tree order, each followed by its sites: [{ place, site?, depth, label, detail }]. */
export function atlasEntries(world) {
  const out = [];
  const visit = (place, depth) => {
    out.push({ place, site: null, depth, label: place.label, detail: `${place.description} (${place.unit.name})` });
    for (const site of place.sites) {
      out.push({ place, site, depth: depth + 1, label: site.label, detail: `${site.Sim.meta.title} · ${site.sim?.scenarios.find((s) => s.id === site.sim.scenarioId)?.label ?? site.scenario}` });
    }
    for (const c of place.children) visit(c, depth + 1);
  };
  visit(world.tree.root, 0);
  return out;
}

/** Entries whose label or detail contains every word of the query (case-insensitive). */
export function filterEntries(entries, query) {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return entries;
  return entries.filter((e) => words.every((w) => `${e.label} ${e.detail}`.toLowerCase().includes(w)));
}

export class Atlas {
  constructor(world, onPick, { fallback = false } = {}) {
    this.world = world;
    this.onPick = onPick;
    this.fallback = fallback;
    this.dialog = $('#atlas-dialog');
    this.dialog.addEventListener('click', (e) => { if (e.target === this.dialog) this.dialog.close(); });
  }

  open() {
    const entries = atlasEntries(this.world);
    const search = el('input', { type: 'search', placeholder: 'Search places and simulations…', className: 'atlas-search' });
    search.setAttribute('aria-label', 'Search the atlas');
    const list = el('ul', { className: 'atlas-list' });
    const show = () => {
      const items = filterEntries(entries, search.value).map((e) => {
        const b = el('button', { className: e.site ? 'atlas-site' : 'atlas-place' },
          el('b', { textContent: `${e.site ? '●' : '◎'} ${e.label}` }),
          el('span', { className: 'muted small', textContent: ` ${e.detail}` }));
        b.style.marginLeft = `${e.depth * 12}px`;
        b.addEventListener('click', () => {
          this.dialog.close();
          this.onPick(e);
        });
        return el('li', {}, b);
      });
      list.replaceChildren(...(items.length ? items : [el('li', { className: 'muted', textContent: 'Nothing matches.' })]));
    };
    search.addEventListener('input', show);
    // Arrow keys move between entries; Enter (on a button) opens it.
    this.dialog.onkeydown = (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const buttons = [...list.querySelectorAll('button')];
      const i = buttons.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown' ? Math.min(buttons.length - 1, i + 1) : i <= 0 ? -1 : i - 1;
      (next < 0 ? search : buttons[next])?.focus();
    };
    show();
    const intro = this.fallback
      ? 'This browser cannot show the 3D world (no WebGL2). Every place and simulation is listed here; each opens in the 2D view.'
      : 'Every place in the world, from deep space to a single atom, and the simulations in them.';
    $('#atlas-body').replaceChildren(el('p', { className: 'muted small', textContent: intro }), search, list);
    this.dialog.showModal();
    search.focus();
  }
}
