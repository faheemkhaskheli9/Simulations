import { Simulation } from '../core/simulation.js';
import { clamp, fmt, TAU } from '../core/math.js';
import { pick } from '../core/serialize.js';

let nextId = 1;

const KINDS = {
  ball: { label: 'Ball (1 kg)', m: 1, r: 0.25, e: 0.8, color: '#6aa8ff' },
  heavy: { label: 'Heavy ball (10 kg)', m: 10, r: 0.5, e: 0.5, color: '#c28b5a' },
  bouncy: { label: 'Bouncy ball', m: 0.3, r: 0.18, e: 0.95, color: '#ff6a8a' },
  anchor: { label: 'Fixed anchor', m: 1, r: 0.12, e: 0.5, color: '#9aa7c7', fixed: true },
  pendulum: { label: 'Pendulum (anchor + rod + ball)' },
  springBall: { label: 'Ball on a spring to nearest' },
  rodBall: { label: 'Ball on a rod to nearest' },
  rope: { label: 'Rope (chain of 10 links)' },
};

/**
 * Classical mechanics sandbox: balls with mass and restitution, fixed anchors,
 * rigid rods and Hookean springs under gravity. Position-based dynamics keeps
 * rods rigid; collisions use impulses, conserving momentum.
 */
export class MechanicsSim extends Simulation {
  static meta = {
    id: 'mechanics',
    title: 'Mechanics Lab',
    category: 'Classical',
    description:
      'Newtonian mechanics: balls, pendulums, springs, ropes and collisions under gravity. Build contraptions, change masses and bounciness, fling things, and watch momentum and energy being exchanged.',
  };

  constructor(opts) {
    super(opts);
    this.timeUnit = 's';
    this.background = '#070b14';
    this.W = 20;
    this.H = 12;
    this.balls = [];
    this.links = [];
    this.defineParams([
      { key: 'gravity', label: 'Gravity (m/s²)', type: 'range', min: 0, max: 30, step: 0.01, value: 9.81 },
      { key: 'drag', label: 'Air drag (1/s)', type: 'range', min: 0, max: 2, step: 0.01, value: 0 },
      { key: 'substeps', label: 'Substeps per frame', type: 'range', min: 4, max: 80, step: 1, value: 24 },
      { key: 'slowmo', label: 'Time scale', type: 'range', min: 0.05, max: 2, value: 1, log: true },
      { key: 'walls', label: 'Walls and floor', type: 'checkbox', value: true },
      { key: 'vectors', label: 'Show velocity vectors', type: 'checkbox', value: false },
      { key: 'trails', label: 'Show trails', type: 'checkbox', value: true },
    ]);
    this.spawnKinds = Object.entries(KINDS).map(([id, k]) => ({ id, label: k.label }));
    this.scenarios = [
      { id: 'cradle', label: "Newton's cradle" },
      { id: 'doublePendulum', label: 'Double pendulum (chaos)' },
      { id: 'projectiles', label: 'Projectiles at different angles' },
      { id: 'springs', label: 'Mass–spring oscillators' },
      { id: 'bridge', label: 'Rope bridge' },
      { id: 'billiards', label: 'Billiards break (no gravity)' },
      { id: 'empty', label: 'Empty lab' },
    ];
    this.energyTool = { label: 'Shake (add kinetic energy)', negLabel: 'Brake (remove energy)' };
    this.chartKeys = ['ke', 'pe'];
    this.loadScenario('cradle');
  }

  bounds() {
    return { x: 0, y: 0, w: this.W, h: this.H };
  }

  makeBall(kind, x, y, extra = {}) {
    const k = KINDS[kind] ?? KINDS.ball;
    const b = {
      id: nextId++, kind, x, y, vx: 0, vy: 0, px: x, py: y,
      m: k.m, r: k.r, e: k.e, color: k.color, fixed: !!k.fixed, alive: true, trail: [],
      ...extra,
    };
    this.balls.push(b);
    return b;
  }

  link(type, a, b, extra = {}) {
    const len = Math.hypot(a.x - b.x, a.y - b.y);
    const l = { id: nextId++, type, a, b, len, k: 200, damping: 0.5, ...extra };
    this.links.push(l);
    return l;
  }

  loadScenario(id) {
    super.loadScenario(id);
    this.rng.seed(9);
    this.balls = [];
    this.links = [];
    const P = this.params;
    P.gravity = 9.81;
    P.drag = 0;
    if (id === 'cradle') {
      const n = 5, r = 0.4, L = 4;
      for (let i = 0; i < n; i++) {
        const x = 8 + i * 2 * r;
        const a = this.makeBall('anchor', x, 2);
        const b = this.makeBall('ball', x, 2 + L, { r, m: 1, e: 1, color: '#c9d4e8' });
        this.link('rod', a, b);
      }
      // Pull the first ball out sideways.
      const first = this.balls[1];
      const ang = -0.7;
      first.x = 8 + Math.sin(ang) * L;
      first.y = 2 + Math.cos(ang) * L;
    } else if (id === 'doublePendulum') {
      const a = this.makeBall('anchor', 10, 4);
      const b = this.makeBall('ball', 12.4, 2.6, { color: '#ffb36a' });
      const c = this.makeBall('ball', 14.8, 2.2, { color: '#ff6a8a' });
      this.link('rod', a, b);
      this.link('rod', b, c);
    } else if (id === 'projectiles') {
      for (const [i, deg] of [15, 30, 45, 60, 75].entries()) {
        const th = (deg * Math.PI) / 180, v = 12;
        this.makeBall('ball', 1, this.H - 0.3, { vx: v * Math.cos(th), vy: -v * Math.sin(th), e: 0.3, color: `hsl(${i * 60},80%,65%)`, label: `${deg}°` });
      }
    } else if (id === 'springs') {
      for (const [i, m] of [0.5, 1, 2, 4].entries()) {
        const x = 4 + i * 4;
        const a = this.makeBall('anchor', x, 1);
        const b = this.makeBall(m >= 4 ? 'heavy' : 'ball', x, 4.5, { m, r: 0.2 + 0.08 * m, label: `${m} kg` });
        this.link('spring', a, b, { len: 2.5, k: 60, damping: 0 });
      }
    } else if (id === 'bridge') {
      const n = 14;
      let prev = this.makeBall('anchor', 3, 5);
      // Start on a gentle sag so the planks have slack, like a real rope bridge.
      for (let i = 1; i < n; i++) {
        const b = this.makeBall('ball', 3 + i * 0.95, 5 + 1.2 * Math.sin((Math.PI * i) / n), { r: 0.15, m: 0.5, color: '#c8a46a' });
        this.link('rod', prev, b);
        prev = b;
      }
      const end = this.makeBall('anchor', 3 + n * 0.95, 5);
      this.link('rod', prev, end);
      this.makeBall('heavy', 9.6, 1);
    } else if (id === 'billiards') {
      P.gravity = 0;
      const r = 0.28;
      let k = 0;
      for (let row = 0; row < 5; row++) for (let j = 0; j <= row; j++) {
        this.makeBall('ball', 13 + row * r * 1.75, 6 - row * r + j * 2 * r + 0.001 * j, { r, m: 0.17, e: 0.95, color: `hsl(${k++ * 24},75%,60%)` });
      }
      this.makeBall('ball', 4, 6, { r, m: 0.17, e: 0.95, vx: 14, vy: 0.05, color: '#ffffff', label: 'cue' });
    }
    for (const b of this.balls) { b.px = b.x; b.py = b.y; }
  }

  invMass(b) {
    return b.fixed ? 0 : 1 / b.m;
  }

  substep(h) {
    const P = this.params, balls = this.balls;
    // Springs (explicit forces) and gravity.
    for (const l of this.links) {
      if (l.type !== 'spring') continue;
      const { a, b } = l;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-9;
      const nx = dx / d, ny = dy / d;
      const relV = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      const f = l.k * (d - l.len) + l.damping * relV;
      const ia = this.invMass(a), ib = this.invMass(b);
      a.vx += f * nx * ia * h; a.vy += f * ny * ia * h;
      b.vx -= f * nx * ib * h; b.vy -= f * ny * ib * h;
    }
    const damp = Math.exp(-P.drag * h);
    for (const b of balls) {
      if (b.fixed) { b.vx = b.vy = 0; b.px = b.x; b.py = b.y; continue; }
      b.vy += P.gravity * h;
      b.vx *= damp; b.vy *= damp;
      b.px = b.x; b.py = b.y;
      b.x += b.vx * h; b.y += b.vy * h;
    }
    // Rigid rods: project positions onto the constraint.
    for (let it = 0; it < 4; it++) {
      for (const l of this.links) {
        if (l.type !== 'rod') continue;
        const { a, b } = l;
        const ia = this.invMass(a), ib = this.invMass(b), w = ia + ib;
        if (!w) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-9;
        const c = (d - l.len) / d / w;
        a.x += dx * c * ia; a.y += dy * c * ia;
        b.x -= dx * c * ib; b.y -= dy * c * ib;
      }
    }
    for (const b of balls) {
      if (b.fixed) continue;
      b.vx = (b.x - b.px) / h;
      b.vy = (b.y - b.py) / h;
    }
    this.collide();
  }

  collide() {
    const balls = this.balls, P = this.params;
    for (let it = 0; it < 3; it++) {
      for (let i = 0; i < balls.length; i++) {
        const a = balls[i];
        for (let j = i + 1; j < balls.length; j++) {
          const b = balls[j];
          if (a.fixed && b.fixed) continue;
          const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr || d2 === 0) continue;
          if (a.kind === 'anchor' || b.kind === 'anchor') continue; // anchors are pivots, not obstacles
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
          const ia = this.invMass(a), ib = this.invMass(b), w = ia + ib;
          const overlap = (rr - d) / w;
          a.x -= nx * overlap * ia; a.y -= ny * overlap * ia;
          b.x += nx * overlap * ib; b.y += ny * overlap * ib;
          const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (vn >= 0) continue;
          const e = Math.min(a.e, b.e);
          const imp = (-(1 + e) * vn) / w;
          a.vx -= imp * nx * ia; a.vy -= imp * ny * ia;
          b.vx += imp * nx * ib; b.vy += imp * ny * ib;
        }
      }
    }
    if (!P.walls) return;
    for (const b of balls) {
      if (b.fixed) continue;
      if (b.y > this.H - b.r) {
        b.y = this.H - b.r;
        if (b.vy > 0) { b.vy = -b.vy * b.e; b.vx *= 0.98; } // bounce with a little rolling friction
      }
      if (b.y < b.r) { b.y = b.r; if (b.vy < 0) b.vy = -b.vy * b.e; }
      if (b.x < b.r) { b.x = b.r; if (b.vx < 0) b.vx = -b.vx * b.e; }
      if (b.x > this.W - b.r) { b.x = this.W - b.r; if (b.vx > 0) b.vx = -b.vx * b.e; }
    }
  }

  advance(seconds, substeps = this.params.substeps) {
    if (seconds <= 0) return;
    const n = Math.max(1, Math.ceil(substeps * Math.max(1, seconds * 60)));
    const h = seconds / n;
    for (let s = 0; s < n; s++) this.substep(h);
    this.time += seconds;
  }

  step(dt) {
    this.advance(dt * this.params.slowmo);
    if (this.params.trails) {
      for (const b of this.balls) {
        if (b.fixed) continue;
        b.trail.push(b.x, b.y);
        if (b.trail.length > 240) b.trail.splice(0, 2);
      }
    }
  }

  energies() {
    const g = this.params.gravity;
    let ke = 0, pe = 0, px = 0, py = 0;
    for (const b of this.balls) {
      if (b.fixed) continue;
      ke += 0.5 * b.m * (b.vx * b.vx + b.vy * b.vy);
      pe += b.m * g * (this.H - b.y); // height above the floor
      px += b.m * b.vx; py += b.m * b.vy;
    }
    for (const l of this.links) {
      if (l.type === 'spring') pe += 0.5 * l.k * (Math.hypot(l.a.x - l.b.x, l.a.y - l.b.y) - l.len) ** 2;
    }
    return { ke, pe, p: Math.hypot(px, py) };
  }

  // ---------- interaction ----------

  pick(x, y, r) {
    let best = null, bd = Infinity;
    for (const b of this.balls) {
      const d = Math.hypot(b.x - x, b.y - y) - b.r;
      if (d < Math.max(r, 0.1) && d < bd) { bd = d; best = b; }
    }
    return best;
  }

  locate(b) {
    return b.alive ? { x: b.x, y: b.y, r: b.r + 0.08 } : null;
  }

  nearest(x, y, exclude) {
    let best = null, bd = Infinity;
    for (const b of this.balls) {
      if (b === exclude) continue;
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  add(kind, x, y) {
    if (kind === 'pendulum') {
      const a = this.makeBall('anchor', x, y);
      const b = this.makeBall('ball', x + 2, y + 1);
      this.link('rod', a, b);
      return b;
    }
    if (kind === 'springBall' || kind === 'rodBall') {
      const target = this.nearest(x, y);
      const b = this.makeBall('ball', x, y);
      if (target) this.link(kind === 'springBall' ? 'spring' : 'rod', target, b, kind === 'springBall' ? { k: 40, damping: 0.2 } : {});
      return b;
    }
    if (kind === 'rope') {
      let prev = this.makeBall('anchor', x, y);
      for (let i = 1; i <= 10; i++) {
        const b = this.makeBall('ball', x + i * 0.4, y, { r: 0.1, m: 0.2, color: '#c8a46a' });
        this.link('rod', prev, b);
        prev = b;
      }
      return prev;
    }
    return this.makeBall(kind, x, y);
  }

  remove(b) {
    b.alive = false;
    this.balls = this.balls.filter((o) => o !== b);
    this.links = this.links.filter((l) => l.a !== b && l.b !== b);
  }

  move(b, x, y) {
    b.x = b.px = clamp(x, b.r, this.W - b.r);
    b.y = b.py = clamp(y, b.r, this.H - b.r);
    b.vx = b.vy = 0;
    b.trail = [];
    // Keep rods attached to a moved anchor satisfied by dragging partners along.
    if (b.fixed) for (const l of this.links) if (l.type === 'rod' && (l.a === b || l.b === b)) l.len = Math.hypot(l.a.x - l.b.x, l.a.y - l.b.y);
  }

  impulse(b, x, y, dx, dy) {
    const k = 3; // a 1 m drag gives 3 m/s
    const targets = b ? [b] : this.balls.filter((o) => Math.hypot(o.x - x, o.y - y) < 1.5);
    for (const t of targets) if (!t.fixed) { t.vx += dx * k; t.vy += dy * k; }
  }

  energy(x, y, r, amount) {
    for (const b of this.balls) {
      if (b.fixed || Math.hypot(b.x - x, b.y - y) > r) continue;
      if (amount > 0) {
        b.vx += this.rng.gaussian(0, 6 * amount);
        b.vy += this.rng.gaussian(0, 6 * amount);
      } else {
        const f = Math.exp(amount * 3);
        b.vx *= f; b.vy *= f;
      }
    }
  }

  describe(b) {
    const links = this.links.filter((l) => l.a === b || l.b === b);
    return {
      title: `${b.label ?? (KINDS[b.kind]?.label.split(' (')[0] ?? 'Ball')} #${b.id}`,
      fields: [
        { key: 'm', label: 'Mass (kg)', type: 'number', value: b.m, step: 0.1 },
        { key: 'r', label: 'Radius (m)', type: 'number', value: b.r, step: 0.05 },
        { key: 'e', label: 'Restitution (bounciness 0–1)', type: 'number', value: b.e, step: 0.05 },
        { key: 'fixed', label: 'Pinned in place', type: 'select', value: b.fixed ? 'yes' : 'no', options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }] },
        { key: 'vx', label: 'vx (m/s)', type: 'number', value: b.vx, step: 0.5 },
        { key: 'vy', label: 'vy (m/s, down +)', type: 'number', value: b.vy, step: 0.5 },
        { key: 'speed', label: 'Speed (m/s)', type: 'readonly', value: fmt(Math.hypot(b.vx, b.vy)) },
        { key: 'ke', label: 'Kinetic energy (J)', type: 'readonly', value: fmt(0.5 * b.m * (b.vx ** 2 + b.vy ** 2)) },
        { key: 'height', label: 'Height above floor (m)', type: 'readonly', value: fmt(this.H - b.y - b.r) },
        { key: 'links', label: 'Rods / springs', type: 'readonly', value: links.length },
        { key: 'stiffness', label: 'Spring stiffness (N/m)', type: links.some((l) => l.type === 'spring') ? 'number' : 'readonly', value: links.find((l) => l.type === 'spring')?.k ?? '—' },
        { key: 'detach', label: 'Detach rods and springs', type: 'action' },
      ],
    };
  }

  setProperty(b, key, value) {
    if (key === 'm') b.m = clamp(value, 0.01, 1000);
    else if (key === 'r') b.r = clamp(value, 0.05, 3);
    else if (key === 'e') b.e = clamp(value, 0, 1);
    else if (key === 'fixed') b.fixed = value === 'yes';
    else if (key === 'vx' || key === 'vy') b[key] = clamp(value, -200, 200);
    else if (key === 'stiffness') { for (const l of this.links) if (l.type === 'spring' && (l.a === b || l.b === b)) l.k = clamp(value, 0, 10000); }
    else if (key === 'detach') this.links = this.links.filter((l) => l.a !== b && l.b !== b);
  }

  saveState() {
    return {
      balls: this.balls.map((b) => pick(b, ['id', 'kind', 'x', 'y', 'vx', 'vy', 'm', 'r', 'e', 'color', 'fixed', 'label'])),
      links: this.links.map((l) => ({ ...pick(l, ['id', 'type', 'len', 'k', 'damping']), a: l.a.id, b: l.b.id })),
    };
  }

  loadState(st) {
    const byId = new Map();
    this.balls = st.balls.map((b) => {
      const ball = { ...b, px: b.x, py: b.y, alive: true, trail: [] };
      byId.set(ball.id, ball);
      return ball;
    });
    this.links = st.links
      .filter((l) => (l.type === 'rod' || l.type === 'spring') && byId.has(l.a) && byId.has(l.b))
      .map((l) => ({ ...l, a: byId.get(l.a), b: byId.get(l.b) }));
    nextId = Math.max(nextId, ...this.balls.map((b) => b.id + 1), ...this.links.map((l) => l.id + 1));
  }

  stats() {
    const { ke, pe, p } = this.energies();
    return [
      { key: 'bodies', label: 'Bodies', value: this.balls.length },
      { key: 'ke', label: 'Kinetic energy (J)', value: ke },
      { key: 'pe', label: 'Potential energy (J)', value: pe },
      { key: 'total', label: 'Total mechanical energy (J)', value: ke + pe },
      { key: 'momentum', label: 'Total momentum (kg·m/s)', value: p },
    ];
  }

  render(ctx, view) {
    const [x0, y0] = view.toScreen(0, 0), [x1, y1] = view.toScreen(this.W, this.H);
    if (this.params.walls) {
      ctx.strokeStyle = '#2b3550';
      ctx.lineWidth = 2;
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      ctx.fillStyle = '#141b2e';
      ctx.fillRect(x0, y1, x1 - x0, 8);
    }
    // Grid every metre for scale.
    ctx.strokeStyle = 'rgba(80,100,140,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = 1; gx < this.W; gx++) { const [sx] = view.toScreen(gx, 0); ctx.moveTo(sx, y0); ctx.lineTo(sx, y1); }
    for (let gy = 1; gy < this.H; gy++) { const [, sy] = view.toScreen(0, gy); ctx.moveTo(x0, sy); ctx.lineTo(x1, sy); }
    ctx.stroke();
    if (this.params.trails) {
      for (const b of this.balls) {
        if (b.trail.length < 4) continue;
        ctx.strokeStyle = b.color;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        for (let i = 0; i < b.trail.length; i += 2) {
          const [sx, sy] = view.toScreen(b.trail[i], b.trail[i + 1]);
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    for (const l of this.links) {
      const [ax, ay] = view.toScreen(l.a.x, l.a.y), [bx, by] = view.toScreen(l.b.x, l.b.y);
      if (l.type === 'rod') {
        ctx.strokeStyle = '#8b97b5';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      } else {
        // Zig-zag spring.
        const n = 12, dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len, amp = 6;
        ctx.strokeStyle = '#ffd34d';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(ax, ay);
        for (let i = 1; i < n; i++) {
          const t = i / n, s = i % 2 ? amp : -amp;
          ctx.lineTo(ax + dx * t + nx * s, ay + dy * t + ny * s);
        }
        ctx.lineTo(bx, by); ctx.stroke();
      }
    }
    ctx.font = '11px system-ui';
    for (const b of this.balls) {
      const [sx, sy] = view.toScreen(b.x, b.y);
      const r = Math.max(2, b.r * view.scale);
      if (b.kind === 'anchor') {
        ctx.fillStyle = b.color;
        ctx.fillRect(sx - r, sy - r, 2 * r, 2 * r);
        continue;
      }
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
      if (b.fixed) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); }
      if (b.label) { ctx.fillStyle = 'rgba(220,230,255,0.8)'; ctx.fillText(b.label, sx + r + 3, sy - r); }
      if (this.params.vectors) {
        const vx = b.vx * 0.1 * view.scale, vy = b.vy * 0.1 * view.scale;
        ctx.strokeStyle = '#5ed37a';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + vx, sy + vy); ctx.stroke();
      }
    }
  }
}
