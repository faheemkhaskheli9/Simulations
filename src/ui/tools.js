// The six tools as calls on the Simulation contract, shared by the 2D app and the
// 3D world so both make exactly the same calls for the same module point
// (World TRD W-FT-24). Points are { x, y, upp }: module coordinates and module
// units per CSS pixel at that point (brush and pick sizes are given in pixels).

export const TOOLS = [
  { id: 'inspect', label: 'Inspect', key: '1', hint: 'Click an object to see and edit its properties.' },
  { id: 'move', label: 'Move', key: '2', hint: 'Drag an object to reposition it.' },
  { id: 'add', label: 'Add', key: '3', hint: 'Click to add the selected kind of object.' },
  { id: 'remove', label: 'Remove', key: '4', hint: 'Click or drag to remove things.' },
  { id: 'force', label: 'Force', key: '5', hint: 'Drag from an object (or empty space) to apply a push in that direction.' },
  { id: 'energy', label: 'Energy', key: '6', hint: 'Hold to add energy in the brush area; hold Shift (or tick Invert) to remove it.' },
];

export const PICK_PX = 10; // pick tolerance in CSS pixels
const REMOVE_EVERY_MS = 60;

/**
 * One pointer interaction with the current tool. The host supplies the live
 * simulation and settings: { sim, tool, selected, toolKind(), brushPx(),
 * checkpoint(), select(entity) }.
 */
export class ToolSession {
  constructor(host) {
    this.host = host;
    this.reset();
  }

  reset() {
    this.dragTarget = null;
    this.forceStart = null;
    this.lastRemove = 0;
  }

  down(pt, now = performance.now()) {
    const h = this.host, sim = h.sim;
    const tol = PICK_PX * pt.upp, brush = h.brushPx() * pt.upp;
    if (['add', 'remove', 'force', 'energy'].includes(h.tool)) h.checkpoint();
    switch (h.tool) {
      case 'inspect':
        h.select(sim.pick(pt.x, pt.y, tol));
        break;
      case 'move': {
        const t = sim.pick(pt.x, pt.y, tol);
        if (t) h.checkpoint();
        this.dragTarget = t;
        if (t) h.select(t);
        break;
      }
      case 'add': {
        const made = sim.add(h.toolKind(), pt.x, pt.y, brush);
        if (made) h.select(made);
        break;
      }
      case 'remove': {
        const gone = sim.removeAt(pt.x, pt.y, brush);
        if (gone && gone === h.selected) h.select(null);
        this.lastRemove = now;
        break;
      }
      case 'force':
        this.forceStart = { target: sim.pick(pt.x, pt.y, tol), x: pt.x, y: pt.y };
        break;
    }
  }

  move(pt, now = performance.now()) {
    const h = this.host;
    if (h.tool === 'move' && this.dragTarget) h.sim.move(this.dragTarget, pt.x, pt.y);
    if (h.tool === 'remove' && now - this.lastRemove > REMOVE_EVERY_MS) {
      const gone = h.sim.removeAt(pt.x, pt.y, h.brushPx() * pt.upp);
      if (gone && gone === h.selected) h.select(null);
      this.lastRemove = now;
    }
  }

  /** End of a drag: the Force tool pushes along the drag in module units. */
  up(pt) {
    const h = this.host, f = this.forceStart;
    if (h.tool === 'force' && f && pt) {
      if (f.target && f.target.alive === false) f.target = null;
      h.sim.impulse(f.target, f.x, f.y, pt.x - f.x, pt.y - f.y);
      if (f.target) h.select(f.target);
    }
    this.reset();
  }

  /** Energy brush, applied every frame while held; sign is +1 to add, -1 to remove. */
  energy(pt, dt, sign, strength) {
    this.host.sim.energy(pt.x, pt.y, this.host.brushPx() * pt.upp, sign * strength * dt);
  }
}
