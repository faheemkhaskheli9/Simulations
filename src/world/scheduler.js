// Steps the world's sites within a frame budget (System Design §7): the active
// site every frame, ambient sites round-robin with whatever time is left, each
// catching up with one capped step. A site that throws is frozen, not the world.

export const DEFAULT_BUDGET_MS = 10;
const CATCH_UP = 4; // an ambient step covers at most 4 frames of time
const SLOW_FRAME_MS = 20;

export class Scheduler {
  constructor({ budgetMs = DEFAULT_BUDGET_MS, now = () => performance.now(), log = (...a) => console.error(...a) } = {}) {
    this.baseBudget = budgetMs;
    this.budget = budgetMs;
    this.now = now;
    this.log = log;
    this.cursor = 0;
    this.slowFor = 0;
  }

  /** Step one site; returns false (and freezes it) if its step throws. */
  run(site, dt) {
    const t0 = this.now();
    try {
      site.sim.step(dt);
    } catch (err) {
      site.error = err;
      site.tier = 'frozen';
      if (!site.logged) this.log(`Site ${site.id} stopped:`, err);
      site.logged = true;
      return false;
    }
    const ms = this.now() - t0;
    site.cost = site.cost ? site.cost * 0.8 + ms * 0.2 : ms;
    return true;
  }

  /**
   * One frame: the active site steps by dt × speed; ambient sites share the
   * remaining budget. Returns the ids of the ambient sites that stepped.
   */
  step(sites, active, dt, speed = 1) {
    if (active?.sim && !active.error) this.run(active, dt * speed);
    const ambient = sites.filter((s) => s !== active && s.tier === 'ambient' && s.sim && !s.error);
    for (const s of ambient) s.acc += dt;
    const start = this.now(), stepped = [];
    const n = ambient.length;
    for (let k = 0; k < n; k++) {
      const s = ambient[(this.cursor + k) % n];
      if (this.now() - start + (s.cost || 0) > this.budget && stepped.length > 0) break;
      if (this.now() - start > this.budget) break;
      const h = Math.min(s.acc, CATCH_UP * dt);
      s.acc = 0;
      if (h > 0 && this.run(s, h)) stepped.push(s.id);
    }
    this.cursor = n ? (this.cursor + Math.max(1, stepped.length)) % n : 0;
    return stepped;
  }

  /**
   * Adapt the budget to the frame time: down by 20 % after a second of slow
   * frames, then back up gradually (W-FT-42).
   */
  adapt(frameMs, dt) {
    if (frameMs > SLOW_FRAME_MS) {
      this.slowFor += dt;
      if (this.slowFor >= 1) {
        this.budget = Math.max(1, this.budget * 0.8);
        this.slowFor = 0;
      }
    } else {
      this.slowFor = 0;
      this.budget = Math.min(this.baseBudget, this.budget + 0.5 * dt);
    }
  }
}
