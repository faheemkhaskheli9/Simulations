import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AtomsSim, ELEMENTS } from '../src/sims/atoms.js';

test('thermostat drives the gas toward the target temperature', () => {
  const sim = new AtomsSim();
  sim.loadScenario('gas');
  sim.params.targetT = 600;
  for (let i = 0; i < 150; i++) sim.step();
  const T = sim.stats().find((s) => s.key === 'T').value;
  assert.ok(Math.abs(T - 600) < 90, `T=${T}`);
});

test('hydrogen and oxygen form molecules', () => {
  const sim = new AtomsSim();
  sim.loadScenario('water');
  for (let i = 0; i < 60; i++) sim.step();
  const census = sim.moleculeCensus();
  assert.ok(Object.keys(census).length > 0, 'no molecules formed');
  for (const a of sim.atoms) assert.ok(a.bonds.length <= ELEMENTS[a.el].valence);
});

test('formulae use Hill notation', () => {
  const atoms = ['O', 'H', 'H'].map((el) => ({ el }));
  assert.equal(AtomsSim.formula(atoms), 'H₂O');
  assert.equal(AtomsSim.formula(['H', 'C', 'H', 'H', 'H'].map((el) => ({ el }))), 'CH₄');
});

test('heating raises kinetic energy; removing an atom breaks its bonds', () => {
  const sim = new AtomsSim();
  sim.loadScenario('gas');
  sim.params.thermostat = false;
  const before = sim.temperatureUnits();
  sim.energy(30, 20, 100, 0.5);
  assert.ok(sim.temperatureUnits() > before * 1.5);
  const o = sim.add('H2O', 30, 20);
  const hs = [...o.bonds];
  sim.remove(o);
  assert.ok(hs.every((h) => h.bonds.length === 0));
});

test('transmuting an atom trims bonds to the new valence', () => {
  const sim = new AtomsSim();
  sim.loadScenario('gas');
  const c = sim.add('CH4', 30, 20);
  sim.setProperty(c, 'el', 'O');
  assert.equal(c.bonds.length, 2);
});
