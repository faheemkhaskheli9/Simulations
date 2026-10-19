import { LessonRunner } from '../lessons/runner.js';

const STORE = 'simulations.completedLessons';

const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, ...children) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const c of children) n.append(c);
  return n;
};

function loadCompleted() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORE) ?? '[]'));
  } catch {
    return new Set();
  }
}

/** The "Learn" catalogue dialog and the active-lesson card in the right panel. */
export class LessonPanel {
  constructor(app, lessons) {
    this.app = app;
    this.lessons = lessons;
    this.runner = null;
    this.completed = loadCompleted();
    $('#learn').addEventListener('click', () => this.showCatalogue());
    $('#learn-dialog').addEventListener('click', (e) => { if (e.target.id === 'learn-dialog') e.target.close(); });
  }

  find(id) {
    return this.lessons.find((l) => l.id === id);
  }

  showCatalogue() {
    const group = (type, heading) => {
      const items = this.lessons.filter((l) => l.type === type).map((l) => {
        const S = this.app.simulations.find((s) => s.meta.id === l.sim);
        const start = el('button', { textContent: this.completed.has(l.id) ? 'Again' : 'Start' });
        start.addEventListener('click', () => { $('#learn-dialog').close(); this.start(l.id); });
        return el('li', { className: 'lesson-item' },
          el('div', {},
            el('b', { textContent: `${this.completed.has(l.id) ? '✓ ' : ''}${l.title}` }),
            el('span', { className: 'muted small', textContent: ` · ${S?.meta.title ?? l.sim}` }),
            el('div', { className: 'muted small', textContent: l.summary })),
          start);
      });
      return [el('h3', { textContent: heading }), el('ul', { className: 'lesson-list' }, ...items)];
    };
    $('#learn-body').replaceChildren(
      el('p', { className: 'muted', textContent: 'Lessons walk you through an idea step by step; challenges set a goal and let you find the way.' }),
      ...group('lesson', 'Lessons'),
      ...group('challenge', 'Challenges'),
    );
    $('#learn-dialog').showModal();
  }

  start(id) {
    const lesson = this.find(id);
    if (!lesson) return;
    const app = this.app;
    const S = app.simulations.find((s) => s.meta.id === lesson.sim);
    this.runner = null; // so the sim switch below does not count as leaving
    app.startingLesson = true;
    // In the 3D world a lesson flies to its site (lesson.site, or any site running its module).
    if (app.stage) app.stage.focusSim(lesson.sim, lesson.scenario, lesson.site);
    else if (app.sim.constructor !== S) app.loadSim(S, lesson.scenario);
    app.loadScenario(lesson.scenario);
    app.startingLesson = false;
    for (const [k, v] of Object.entries(lesson.params ?? {})) app.sim.setParam(k, v);
    app.syncParams();
    app.setRunning(true);
    this.runner = new LessonRunner(lesson, app.sim);
    this.render();
  }

  exit() {
    this.runner = null;
    this.render();
  }

  /** Called by the app when the learner switches to another simulation. */
  onSimChanged() {
    if (this.runner && !this.app.startingLesson && this.app.sim.meta.id !== this.runner.lesson.sim) this.exit();
  }

  /** Called a few times a second from the main loop. */
  tick() {
    if (this.runner?.update(this.app.sim, this.app.selected)) this.render();
  }

  markComplete(id) {
    this.completed.add(id);
    try {
      localStorage.setItem(STORE, JSON.stringify([...this.completed]));
    } catch {
      // Storage may be unavailable (private mode); completion is then per session.
    }
  }

  render() {
    const box = $('#lesson');
    const r = this.runner;
    box.hidden = !r;
    if (!r) return;
    if (r.state === 'active' && this.shownStep !== r.step && r.step.pause) this.app.setRunning(false);
    this.shownStep = r.state === 'active' ? r.step : null;
    const { lesson } = r;
    const kind = lesson.type === 'challenge' ? 'Challenge' : 'Lesson';
    const head = el('div', { className: 'lesson-head' },
      el('h2', { textContent: `${kind}: ${lesson.title}` }),
      el('span', { className: 'muted small', textContent: r.state === 'active' ? `Step ${r.index + 1} of ${r.total}` : '' }));
    const exit = el('button', { textContent: r.state === 'active' ? 'Exit' : 'Close' });
    exit.addEventListener('click', () => this.exit());
    const buttons = el('div', { className: 'lesson-buttons' });
    let body;
    if (r.state === 'complete') {
      this.markComplete(lesson.id);
      body = [el('p', { className: 'lesson-done', textContent: lesson.type === 'challenge' ? '🏆 Challenge complete!' : '🎉 Lesson complete!' })];
      const more = el('button', { textContent: 'More lessons…' });
      more.addEventListener('click', () => this.showCatalogue());
      buttons.append(more);
    } else if (r.state === 'failed') {
      body = [el('p', { className: 'lesson-failed', textContent: `✗ ${r.failReason}` })];
      const retry = el('button', { textContent: 'Try again' });
      retry.addEventListener('click', () => this.start(lesson.id));
      buttons.append(retry);
    } else {
      body = [el('p', { className: 'lesson-text', textContent: r.step.text })];
      if (r.step.hint) {
        body.push(el('details', { className: 'small' }, el('summary', { textContent: 'Hint' }), el('p', { className: 'muted', textContent: r.step.hint })));
      }
      if (r.manual) {
        const next = el('button', { className: 'primary', textContent: r.index + 1 < r.total ? 'Next' : 'Finish' });
        next.addEventListener('click', () => { r.advance(this.app.sim); this.render(); });
        buttons.append(next);
      } else {
        body.push(el('p', { className: 'muted small', textContent: '⏳ Continues automatically when you have done it.' }));
      }
    }
    buttons.append(exit);
    box.replaceChildren(head, ...body, buttons);
  }
}
