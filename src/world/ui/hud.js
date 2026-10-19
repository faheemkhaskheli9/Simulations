// Text overlays of the world: breadcrumb, scale bar, markers and labels. Markers
// are real buttons over the canvas, so they are focusable, labelled and
// clickable (review R7); colour is never the only cue (W-UA-5).
import { formatLength } from '../places.js';

export const el = (tag, props = {}, ...children) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const c of children) n.append(c);
  return n;
};

/** A "nice" length (1, 2 or 5 × 10ⁿ metres) at most `max` metres. */
export function niceLength(max) {
  if (!(max > 0) || !Number.isFinite(max)) return 0;
  const p = 10 ** Math.floor(Math.log10(max));
  for (const m of [5, 2, 1]) if (m * p <= max) return m * p;
  return p;
}

export class Hud {
  constructor(root) {
    this.root = root;
    this.crumbs = root.querySelector('#breadcrumb');
    this.scaleBar = root.querySelector('#scalebar .bar');
    this.scaleLabel = root.querySelector('#scalebar .label');
    this.markerBox = root.querySelector('#markers');
    this.labelBox = root.querySelector('#labels');
    this.markers = new Map(); // key -> button
    this.labelPool = [];
    this.crumbKey = '';
  }

  /** Breadcrumb of place buttons; clicking one flies up to it. Announced politely on change. */
  breadcrumb(place, onPick) {
    const path = place.path();
    const key = path.map((p) => p.id).join('/');
    if (key === this.crumbKey) return;
    this.crumbKey = key;
    const items = [];
    path.forEach((p, i) => {
      if (i) items.push(el('span', { className: 'sep', textContent: '›', ariaHidden: 'true' }));
      const b = el('button', { className: 'crumb', textContent: p.label, title: p.description });
      if (i === path.length - 1) b.setAttribute('aria-current', 'location');
      b.addEventListener('click', () => onPick(p));
      items.push(b);
    });
    this.crumbs.replaceChildren(...items);
  }

  /** Scale bar: `metresPerPx` at the focus distance; the bar is at most 140 px. */
  scale(metresPerPx) {
    const m = niceLength(metresPerPx * 140);
    const px = m / metresPerPx;
    this.scaleBar.style.width = `${Math.max(0, Math.round(px))}px`;
    this.scaleLabel.textContent = formatLength(m);
  }

  /**
   * Show markers: [{ key, label, kind, x, y, title, badge, onClick }]; others are hidden.
   * Buttons are reused across frames so focus and hover survive.
   */
  setMarkers(list) {
    const seen = new Set();
    for (const m of list) {
      seen.add(m.key);
      let b = this.markers.get(m.key);
      if (!b) {
        b = el('button', { className: `marker ${m.kind}` });
        b.addEventListener('click', (e) => { e.stopPropagation(); b.onPick?.(); });
        b.addEventListener('wheel', (e) => {
          if (!b.onWheelPick) return;
          e.preventDefault();
          b.onWheelPick(e);
        }, { passive: false });
        this.markers.set(m.key, b);
        this.markerBox.append(b);
      }
      b.onPick = m.onClick;
      b.onWheelPick = m.onWheel ?? null;
      const text = `${m.kind === 'place' ? '◎' : '●'} ${m.label}${m.badge ? ` ${m.badge}` : ''}`;
      if (b.textContent !== text) b.textContent = text;
      b.title = m.title ?? '';
      b.hidden = false;
      b.style.transform = `translate(${Math.round(m.x)}px, ${Math.round(m.y)}px)`;
    }
    for (const [key, b] of this.markers) if (!seen.has(key)) b.hidden = true;
  }

  /** Small text labels next to objects (planet names). */
  setLabels(list) {
    while (this.labelPool.length < list.length) {
      const s = el('span', { className: 'obj-label' });
      this.labelPool.push(s);
      this.labelBox.append(s);
    }
    this.labelPool.forEach((s, i) => {
      const l = list[i];
      if (!l) {
        s.hidden = true;
        return;
      }
      s.hidden = false;
      if (s.textContent !== l.text) s.textContent = l.text;
      s.style.transform = `translate(${Math.round(l.x)}px, ${Math.round(l.y)}px)`;
    });
  }
}
