import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MechanicsSim } from '../src/sims/mechanics.js';

const empty = () => { const s = new MechanicsSim(); s.loadScenario('empty'); return s; };

test('elastic head-on collision of equal masses swaps velocities, conserving momentum and energy', () => {
  const s = empty();
  s.params.gravity = 0;
  const a = s.makeBall('ball', 5, 6, { e: 1, vx: 3 });
  const b = s.makeBall('ball', 8, 6, { e: 1, vx: 0 });
  const p0 = a.m * a.vx + b.m * b.vx;
  s.advance(2);
  assert.ok(Math.abs(a.vx) < 0.05 && Math.abs(b.vx - 3) < 0.05, `${a.vx}, ${b.vx}`);
  assert.ok(Math.abs(a.m * a.vx + b.m * b.vx - p0) < 1e-9);
});

test('a free-falling ball follows h = ½gt²', () => {
  const s = empty();
  const b = s.makeBall('ball', 10, 1);
  s.advance(1);
  assert.ok(Math.abs(b.y - 1 - 0.5 * 9.81) < 0.02, `fell ${b.y - 1}`);
});

test('small-angle pendulum period is 2π√(L/g)', () => {
  const s = empty();
  const L = 3;
  const a = s.makeBall('anchor', 10, 2);
  const b = s.makeBall('ball', 10 + L * Math.sin(0.1), 2 + L * Math.cos(0.1));
  s.link('rod', a, b);
  // Time between two successive crossings of the vertical moving the same way.
  const crossings = [];
  let prev = b.x - 10;
  for (let t = 0; t < 12 && crossings.length < 3; t += 1 / 600) {
    s.advance(1 / 600, 1);
    const cur = b.x - 10;
    if (prev > 0 && cur <= 0) crossings.push(s.time);
    prev = cur;
  }
  const T = crossings[2] - crossings[1];
  const expected = 2 * Math.PI * Math.sqrt(L / 9.81);
  assert.ok(Math.abs(T - expected) / expected < 0.02, `T=${T} expected ${expected}`);
});

test('spring oscillator period is 2π√(m/k)', () => {
  const s = empty();
  s.params.gravity = 0;
  const a = s.makeBall('anchor', 5, 6);
  const b = s.makeBall('ball', 8, 6, { m: 2 });
  s.link('spring', a, b, { len: 2, k: 50, damping: 0 });
  let last = null, period = null, prevV = b.vx;
  for (let i = 0; i < 6000 && period === null; i++) {
    s.advance(1 / 1000, 1);
    if (prevV < 0 && b.vx >= 0) { if (last !== null) period = s.time - last; last = s.time; }
    prevV = b.vx;
  }
  const expected = 2 * Math.PI * Math.sqrt(2 / 50);
  assert.ok(Math.abs(period - expected) / expected < 0.02, `T=${period} expected ${expected}`);
});

test('rods stay rigid and the cradle conserves most of its energy', () => {
  const s = new MechanicsSim();
  const e0 = s.energies();
  for (let i = 0; i < 120; i++) s.step(1 / 60);
  for (const l of s.links) assert.ok(Math.abs(Math.hypot(l.a.x - l.b.x, l.a.y - l.b.y) - l.len) < 0.01);
  const e1 = s.energies();
  assert.ok(e1.ke + e1.pe > 0.8 * (e0.ke + e0.pe));
});

test('removing a ball removes its links', () => {
  const s = empty();
  const b = s.add('pendulum', 5, 3);
  assert.equal(s.links.length, 1);
  s.remove(b);
  assert.equal(s.links.length, 0);
});
