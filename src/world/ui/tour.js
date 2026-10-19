// The guided tour (WFR-7): from colliding galaxies down to one atom, with a short
// caption at each stop. It can be paused, skipped or left at any stop.
import { el } from './hud.js';

const STOP_SECONDS = 12;
const $ = (sel) => document.querySelector(sel);

export class Tour {
  constructor(stage, stops) {
    this.stage = stage;
    this.stops = stops;
    this.running = false;
    this.paused = false;
    this.index = 0;
    this.wait = 0;
    this.card = $('#tour-card');
  }

  toggle() {
    if (this.running) this.stop();
    else this.start();
  }

  start(index = 0) {
    this.running = true;
    this.paused = false;
    this.go(index);
  }

  go(index) {
    this.index = Math.max(0, Math.min(this.stops.length - 1, index));
    this.wait = 0;
    const site = this.stage.world.sites.get(this.stops[this.index].site);
    if (site) this.stage.activate(site, { duration: 3.5 });
    this.render();
  }

  next() {
    if (this.index + 1 < this.stops.length) this.go(this.index + 1);
    else this.stop();
  }

  prev() {
    this.go(this.index - 1);
  }

  stop() {
    this.running = false;
    this.render();
  }

  /** Advance on its own after a while at each stop, unless paused. */
  tick(dt) {
    if (!this.running || this.paused || this.stage.camera.flying) return;
    this.wait += dt;
    if (this.wait > STOP_SECONDS) this.next();
  }

  render() {
    this.card.hidden = !this.running;
    if (!this.running) return;
    const stop = this.stops[this.index];
    const site = this.stage.world.sites.get(stop.site);
    const button = (text, title, run) => {
      const b = el('button', { textContent: text, title });
      b.addEventListener('click', run);
      return b;
    };
    this.card.replaceChildren(
      el('div', { className: 'tour-head' },
        el('b', { textContent: `Tour · ${site?.place.label ?? ''}` }),
        el('span', { className: 'muted small', textContent: `${this.index + 1} / ${this.stops.length}` })),
      el('p', { textContent: stop.text }),
      el('div', { className: 'tour-buttons' },
        button('◀', 'Previous stop', () => this.prev()),
        button(this.paused ? '▶ Resume' : '❚❚ Stay here', this.paused ? 'Continue the tour' : 'Stay at this stop', () => { this.paused = !this.paused; this.render(); }),
        button('Next ▶', 'Next stop', () => this.next()),
        button('✕', 'Leave the tour [Esc]', () => this.stop())),
    );
  }
}
