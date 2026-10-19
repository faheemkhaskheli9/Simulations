import { View } from './view.js';

const HIDE_KEY = 'simulations.hideWelcome';

const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, ...children) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const c of children) n.append(c);
  return n;
};

const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* private mode */ } },
};

/** Whether the welcome screen should open on page load (first visit, no deep link). */
export function shouldWelcome(hash, hidden) {
  return !hash.replace(/^#/, '') && !hidden;
}

/**
 * The welcome screen: a card for every simulation, with a live thumbnail made by
 * briefly running that simulation off-screen, plus a way into the lessons.
 */
export class HomeScreen {
  constructor(app) {
    this.app = app;
    this.dialog = $('#home-dialog');
    this.built = false;
    $('#home').addEventListener('click', () => this.open());
    this.dialog.addEventListener('click', (e) => { if (e.target === this.dialog) this.dialog.close(); });
  }

  openIfFirstVisit() {
    if (shouldWelcome(location.hash, storage.get(HIDE_KEY))) this.open();
  }

  open() {
    if (!this.built) this.build();
    this.dialog.showModal();
    this.renderThumbnails();
  }

  build() {
    this.built = true;
    this.cards = [];
    const grid = el('div', { className: 'home-grid' }, ...this.app.simulations.map((S) => {
      const canvas = el('canvas', { className: 'home-thumb', width: 280, height: 150 });
      canvas.setAttribute('aria-hidden', 'true');
      const card = el('button', { className: 'home-card', title: `Open ${S.meta.title}` },
        canvas,
        el('span', { className: 'home-tag', textContent: S.meta.category }),
        el('b', { textContent: S.meta.title }),
        el('span', { className: 'muted small', textContent: S.meta.description }));
      card.addEventListener('click', () => {
        this.dialog.close();
        location.hash = S.meta.id;
      });
      this.cards.push({ S, canvas, drawn: false });
      return card;
    }));

    const learn = el('button', { className: 'primary', textContent: '🎓 Start a guided lesson' });
    learn.addEventListener('click', () => { this.dialog.close(); this.app.lessons.showCatalogue(); });
    const world = el('button', { className: 'primary', textContent: '🌍 Enter the 3D world', title: 'Every simulation in one world you can fly through, from galaxies to atoms' });
    world.addEventListener('click', () => { this.dialog.close(); location.hash = '#world'; });
    const keep = el('input', { type: 'checkbox', checked: !storage.get(HIDE_KEY) });
    keep.addEventListener('change', () => (keep.checked ? storage.remove(HIDE_KEY) : storage.set(HIDE_KEY, '1')));

    $('#home-body').replaceChildren(
      el('p', { className: 'muted', textContent: 'Pick a simulation to explore. Every one uses the same six tools: inspect, move, add, remove, push and add energy. Change anything while it runs.' }),
      el('div', { className: 'home-actions' }, learn, world, el('label', { className: 'check small' }, keep, ' Show this screen at startup')),
      grid,
    );
  }

  /** Draw one thumbnail per animation frame so opening the dialog stays responsive. */
  renderThumbnails() {
    const next = this.cards.find((c) => !c.drawn);
    if (!next || !this.dialog.open) return;
    next.drawn = true;
    try {
      drawThumbnail(next.S, next.canvas);
    } catch (err) {
      console.warn(`Thumbnail for ${next.S.meta.id} failed`, err);
    }
    requestAnimationFrame(() => this.renderThumbnails());
  }
}

/** Run a fresh simulation for a moment, render it at screen size and shrink it into the card. */
export function drawThumbnail(S, canvas, seconds = 1.5) {
  const sim = new S();
  for (let t = 0; t < seconds; t += 1 / 30) sim.step(1 / 30);
  const scale = 4; // render as a normal-sized view so labels and overlays keep their proportions
  const big = Object.assign(document.createElement('canvas'), { width: canvas.width * scale, height: canvas.height * scale });
  const bctx = big.getContext('2d');
  const view = new View();
  view.yUp = !!S.meta.yUp;
  view.resize(big.width, big.height);
  view.fit(sim.bounds());
  bctx.fillStyle = sim.background;
  bctx.fillRect(0, 0, big.width, big.height);
  sim.render(bctx, view, { selected: null, width: big.width, height: big.height });
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(big, 0, 0, canvas.width, canvas.height);
}
