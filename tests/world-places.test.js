// Places, frames and the multi-scale camera (World TRD W-FT-1…3, W-FT-6, W-AR-7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlaceTree, formatLength } from '../src/world/places.js';
import { PLACES } from '../src/world/layout.js';
import { Camera3D } from '../src/world/engine/camera3d.js';
import { v3 } from '../src/world/engine/math3d.js';

const tree = () => new PlaceTree(PLACES);

test('converting a point into a child place and back returns it within 1e-9 (W-FT-3)', () => {
  const t = tree();
  for (const p of t.all) {
    if (!p.parent) continue;
    const point = v3.add(p.position, [p.size * p.scale * 0.3, -p.size * p.scale * 0.2, p.size * p.scale * 0.5]);
    const back = t.convert(t.convert(point, p.parent, p), p, p.parent);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(back[i] - point[i]) <= 1e-9 * Math.max(1, v3.len(point)), `${p.id}: ${back} vs ${point}`);
  }
  // Across the whole ladder: an atom-scale offset survives the trip to deep space units and back.
  const atom = t.get('atom'), chamber = t.get('chamber');
  const local = [12, -7, 3];
  const inChamber = t.convert(local, atom, chamber);
  const again = t.convert(inChamber, chamber, atom);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(again[i] - local[i]) < 1e-9);
});

test('directions and distances convert with the unit ratio', () => {
  const t = tree();
  const earth = t.get('earth'), solar = t.get('solar');
  const v = t.convertVec([1, 0, 0], solar, earth); // 1 AU in km
  assert.ok(Math.abs(v3.len(v) - 1.495978707e8) < 1);
});

test('zoom is logarithmic: one wheel notch is the same factor at every scale (W-FT-1)', () => {
  const t = tree();
  for (const place of [t.get('deep'), t.get('valley'), t.get('atom')]) {
    const c = new Camera3D(t, place);
    const d0 = c.distance;
    c.zoom(0.8);
    assert.ok(Math.abs(c.distance / d0 - 0.8) < 1e-12, place.id);
  }
});

test('hand-over has hysteresis: ±1 % around a boundary never toggles the place (W-FT-2)', () => {
  const t = tree();
  for (const child of t.all.filter((p) => p.parent)) {
    const parent = child.parent;
    const c = new Camera3D(t, parent);
    const r = child.size * child.scale;
    // Just outside the enter distance, looking at the child: stays in the parent.
    c.jumpTo(parent, child.position, [0, 0, child.enterAt * r * 1.01]);
    assert.equal(c.handOver(), false, `${child.id}: should not enter at +1 %`);
    c.zoom(0.99 / 1.01);
    assert.equal(c.handOver(), true, `${child.id}: enters at -1 %`);
    assert.equal(c.place, child);
    // Zooming back out by 1 % stays inside: exitAt is far beyond enterAt.
    c.zoom(1.02);
    assert.equal(c.handOver(), false, `${child.id}: must not leave at +1 %`);
    assert.equal(c.place, child);
    assert.ok(child.enterAt < child.exitAt, `${child.id}: enterAt < exitAt`);
    // The camera can get close enough to enter.
    assert.ok(parent.minDistance < child.enterAt * r, `${child.id}: reachable`);
  }
});

test('hand-over keeps the eye fixed in space', () => {
  const t = tree();
  const c = new Camera3D(t, t.get('solar'));
  const earth = t.get('earth');
  c.jumpTo(c.place, earth.position, [0, 0.0005, 0.001]);
  const eyeBefore = c.eye();
  assert.ok(c.handOver());
  assert.equal(c.place, earth);
  const eyeAfter = t.convert(c.eye(), earth, t.get('solar'));
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(eyeAfter[i] - eyeBefore[i]) < 1e-12);
});

test('fly-to reaches any place from any place within its duration (W-FT-6)', () => {
  const t = tree();
  const c = new Camera3D(t, t.get('deep'));
  const atom = t.get('atom');
  c.flyTo(atom, atom.view.target, atom.view.offset, 3);
  let time = 0;
  while (c.flying && time < 4) {
    c.update(1 / 60);
    time += 1 / 60;
    assert.ok(v3.finite(c.target) && v3.finite(c.offset));
  }
  assert.equal(c.flying, false);
  assert.ok(time <= 3.05);
  assert.equal(c.place, atom);
  assert.deepEqual(c.target, atom.view.target);
  assert.deepEqual(c.offset, atom.view.offset);
  // Back up the ladder.
  const deep = t.get('deep');
  c.flyTo(deep, deep.view.target, deep.view.offset, 2);
  for (let i = 0; i < 200 && c.flying; i++) c.update(1 / 60);
  assert.equal(c.place, deep);
});

test('a flight works in a place whose scale fits the current distance', () => {
  const t = tree();
  const c = new Camera3D(t, t.get('deep'));
  const atom = t.get('atom');
  c.flyTo(atom, atom.view.target, atom.view.offset, 3);
  for (let i = 0; i < 175; i++) c.update(1 / 60);
  // Near the end of the dive the camera is already in a small place, so coordinates stay small.
  assert.ok(['chamber', 'atom', 'microscope'].includes(c.place.id), c.place.id);
  assert.ok(v3.len(c.eye()) < 1e6);
});

test('reduced motion: jumps arrive at once', () => {
  const t = tree();
  const c = new Camera3D(t, t.get('deep'));
  const v = t.get('valley');
  c.jumpTo(v, v.view.target, v.view.offset);
  assert.equal(c.place, v);
  assert.equal(c.flying, false);
});

test('camera state round-trips and rejects bad data', () => {
  const t = tree();
  const c = new Camera3D(t, t.get('earth'));
  c.orbit(40, 10);
  const saved = c.serialize();
  const d = new Camera3D(t);
  assert.ok(d.restore(saved));
  assert.equal(d.place.id, 'earth');
  assert.deepEqual(d.offset, c.offset);
  assert.equal(d.restore({ place: 'nowhere', target: [0, 0, 0], offset: [0, 0, 1] }), false);
  assert.equal(d.restore({ place: 'earth', target: [0, NaN, 0], offset: [0, 0, 1] }), false);
  assert.equal(d.restore({ place: 'earth', target: [0, 0, 0], offset: [0, 0, 0] }), false);
});

test('no coordinate sent to the GPU exceeds 1e6 in any default scene (W-AR-7)', () => {
  const t = tree();
  for (const cur of t.all) {
    const eye = v3.add(cur.view.target, cur.view.offset);
    const layers = [];
    for (let a = cur.parent, n = cur.ancestors; a && n > 0; n--, a = a.parent) layers.push(a);
    // Children are drawn once they cover at least 1.5 px (as WorldStage.layerPlaces does).
    const px = (d) => (2 * d * Math.tan((50 * Math.PI) / 360)) / 1080;
    layers.push(cur, ...cur.children.filter((ch) => (ch.size * ch.scale) / px(v3.dist(ch.position, eye)) >= 1.5));
    for (const L of layers) {
      const eyeL = t.convert(eye, cur, L);
      const decor = Math.max(0, ...L.decor.map((d) => d.radius ?? 0));
      const reach = v3.len(eyeL) + Math.max(L.extent, decor);
      assert.ok(reach < 1e6, `${cur.id} → layer ${L.id}: ${reach.toExponential(2)}`);
    }
  }
});

test('lengths are shown in a sensible unit', () => {
  assert.equal(formatLength(9.4607e15 * 21140), '21,140 ly');
  assert.equal(formatLength(1.5e11 * 1.3), '1.3 AU');
  assert.equal(formatLength(5000), '5 km');
  assert.equal(formatLength(50e-12), '50 pm');
  assert.equal(formatLength(-1), '—');
});
