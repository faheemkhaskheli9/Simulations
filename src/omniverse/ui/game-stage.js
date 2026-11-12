// G0.02/G0.09: a separate, deliberately non-playable rule inspector.
import { GameSession } from '../session.js';
import { listUniverses } from '../universes.js';
import { download } from '../../ui/persistence.js';

function node(tag, text, attrs = {}) {
  const element = document.createElement(tag);
  if (text !== null) element.textContent = text;
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  return element;
}

export class GameStage {
  constructor(app) {
    this.app = app;
    this.session = new GameSession();
    this.visible = false;
    this.root = node('section', null, { id: 'game-inspector', role: 'region', 'aria-label': 'OMNIVERSE rule inspector' });
    this.root.hidden = true;
    const card = node('div', null, { class: 'game-card' });
    card.append(
      node('h1', 'OMNIVERSE · Rule Inspector'),
      node('p', 'Game mode prototype. Prime, Drift, and Flux use science-inspired but fictional rules. This is an inspector, not a playable world. Science simulations are not modified.'),
    );
    const controls = node('div', null, { class: 'game-controls' });
    const label = node('label', 'Universe ');
    this.select = node('select', null, { id: 'game-universe', 'aria-label': 'Universe' });
    for (const entry of listUniverses()) this.select.append(node('option', entry.displayName, { value: entry.id }));
    label.append(this.select);
    this.select.addEventListener('change', () => { location.hash = '#game/' + this.select.value; });
    const step = node('button', 'Advance logical tick', { id: 'game-step' });
    step.addEventListener('click', () => { this.session.advanceTicks(); this.render(); });
    const reset = node('button', 'Reset session', { id: 'game-reset' });
    reset.addEventListener('click', () => { this.session = new GameSession(this.session.selectedUniverseId); this.render(); });
    const save = node('button', 'Export session', { id: 'game-save' });
    save.addEventListener('click', () => download('omniverse-session.json', JSON.stringify(this.session.serialize())));
    const load = node('button', 'Import session', { id: 'game-load' });
    this.file = node('input', null, { id: 'game-file', type: 'file', accept: '.json,application/json' });
    this.file.hidden = true;
    load.addEventListener('click', () => this.file.click());
    this.file.addEventListener('change', async () => {
      const file = this.file.files[0];
      this.file.value = '';
      if (!file) return;
      try {
        if (file.size > 65536) throw new RangeError('Session exceeds 64 KB');
        this.session.load(JSON.parse(await file.text()));
        location.hash = '#game/' + this.session.selectedUniverseId;
        this.render();
      } catch (err) {
        this.message.textContent = 'Could not import: ' + err.message;
      }
    });
    controls.append(label, step, reset, save, load, this.file);
    const coordinates = node('div', null, { class: 'game-coordinates' });
    this.position = [0, 1, 2].map((axis) => {
      const wrapper = node('label', ['X (m)', 'Y (m)', 'Z (m)'][axis]);
      const input = node('input', null, {
        type: 'number', min: '-1000000', max: '1000000', step: '0.5',
        value: '0', 'aria-label': ['X position', 'Y position', 'Z position'][axis],
      });
      input.addEventListener('input', () => this.render());
      wrapper.append(input);
      coordinates.append(wrapper);
      return input;
    });
    this.message = node('p', '', { id: 'game-message', role: 'status', class: 'game-warning' });
    this.output = node('pre', '', { id: 'game-output', class: 'game-output', 'aria-live': 'polite' });
    const links = node('p', null, { class: 'game-links' });
    const science = node('a', 'Science Sandbox', { href: '#gravity', id: 'game-science' });
    const world = node('a', '3D World', { href: '#world', id: 'game-world' });
    links.append(science, world);
    card.append(controls, node('h2', 'Inspect local rules'), coordinates, this.message, this.output, links);
    this.root.append(card);
    document.body.append(this.root);
  }

  show(hash) {
    const match = /^#game(?:\/([^?#]*))?/.exec(hash);
    let universeId = 'prime';
    try { universeId = match?.[1] ? decodeURIComponent(match[1]) : 'prime'; }
    catch { this.message.textContent = 'Invalid universe link'; }
    const valid = listUniverses().some((entry) => entry.id === universeId);
    if (valid) this.session.selectUniverse(universeId);
    else this.message.textContent = 'Unknown universe: ' + universeId;
    this.select.value = this.session.selectedUniverseId;
    this.visible = true;
    this.root.hidden = false;
    // Initial navigation to a game link should not be hidden by the first-visit dialog.
    const welcome = document.querySelector('#home-dialog');
    if (welcome?.open) welcome.close();
    this.render();
  }

  hide() {
    this.visible = false;
    this.root.hidden = true;
    this.message.textContent = '';
  }

  render() {
    try {
      const position = this.position.map((input) => {
        if (!input.value.trim()) throw new RangeError('Enter a coordinate');
        const n = Number(input.value);
        if (!Number.isFinite(n)) throw new RangeError('Invalid coordinate');
        return n;
      });
      const rules = this.session.evaluate(position);
      this.output.textContent = [
        'Universe: ' + this.session.selectedUniverseId,
        'Tick: ' + this.session.logicalTick,
        'Gravity (m/s²): ' + rules.gravity.map((n) => n.toFixed(3)).join(', '),
        'Local time rate: ' + rules.timeRate.toFixed(3) + '×',
        'Contributing fields: ' + (rules.contributingFields.join(', ') || 'none'),
        'Rulepack: ' + rules.provenance.rulePackId + ' v' + rules.provenance.rulePackVersion,
      ].join('\n');
      if (!this.message.textContent.startsWith('Unknown universe') && !this.message.textContent.startsWith('Invalid universe link')) {
        this.message.textContent = '';
      }
    } catch (err) {
      this.output.textContent = '';
      this.message.textContent = err.message;
    }
  }
}
