/**
 * Drives one guided lesson or challenge against a live simulation.
 *
 * A lesson is plain data plus small predicate functions:
 *
 *   { id, type: 'lesson' | 'challenge', title, summary, sim, scenario, params?,
 *     steps: [{ text, hint?, pause?, check?(ctx) }], fail?(ctx) }
 *
 * A step with `check` completes on its own once the predicate holds; a step
 * without one waits for the learner to press Next. `pause: true` pauses the
 * simulation when the step begins so the learner can act. `fail` (challenges only)
 * returns a reason string when the attempt is lost. Predicates receive:
 *
 *   ctx = { sim, params, stat(key), start: { time, stats, params }, elapsed, memo, selected }
 *
 * where `start` is captured when the step begins (for `fail`, when the lesson
 * begins) and `memo` is scratch space
 * that lives for one step (e.g. to remember a peak).
 */
export class LessonRunner {
  constructor(lesson, sim) {
    this.lesson = lesson;
    this.index = 0;
    this.state = 'active'; // 'active' | 'complete' | 'failed'
    this.failReason = '';
    this.lessonStart = snapshot(sim);
    this.begin(sim);
  }

  get step() {
    return this.lesson.steps[this.index];
  }

  get total() {
    return this.lesson.steps.length;
  }

  /** True when the learner may press Next (the step has no automatic check). */
  get manual() {
    return this.state === 'active' && !this.step.check;
  }

  begin(sim) {
    this.start = snapshot(sim);
    this.memo = {};
  }

  context(sim, selected = null, start = this.start) {
    const stats = statMap(sim);
    return {
      sim,
      params: sim.params,
      stat: (key) => stats[key],
      start,
      elapsed: sim.time - start.time,
      memo: this.memo,
      selected,
    };
  }

  /** Evaluate the current step; returns true if anything changed. */
  update(sim, selected = null) {
    if (this.state !== 'active') return false;
    const reason = this.lesson.fail?.(this.context(sim, selected, this.lessonStart));
    if (reason) {
      this.state = 'failed';
      this.failReason = reason;
      return true;
    }
    if (!this.step.check || !this.step.check(this.context(sim, selected))) return false;
    this.advance(sim);
    return true;
  }

  advance(sim) {
    if (this.state !== 'active') return;
    if (this.index + 1 >= this.total) {
      this.state = 'complete';
      return;
    }
    this.index++;
    this.begin(sim);
  }
}

function statMap(sim) {
  const out = {};
  for (const s of sim.stats()) out[s.key] = s.value;
  return out;
}

function snapshot(sim) {
  return { time: sim.time, stats: statMap(sim), params: { ...sim.params } };
}
