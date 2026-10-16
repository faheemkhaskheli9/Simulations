import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AtomSim, bindingEnergy, configString, decayMode, wavelengthNm } from '../src/sims/atom.js';

test('hydrogen spectral lines match Lyman-α and the Balmer series', () => {
  const sim = new AtomSim();
  const e = sim.electrons[0];
  const line = (hi, lo) => wavelengthNm(sim.levelEnergy(e, hi) - sim.levelEnergy(e, lo));
  assert.ok(Math.abs(line(2, 1) - 121.6) < 0.5, `Lyman-α ${line(2, 1)}`);
  assert.ok(Math.abs(line(3, 2) - 656.3) < 1.5, `H-α ${line(3, 2)}`);
  assert.ok(Math.abs(line(4, 2) - 486.1) < 1.5, `H-β ${line(4, 2)}`);
  assert.ok(Math.abs(sim.ionizationEnergy() - 13.6) < 0.01);
});

test('electron configurations follow the aufbau order', () => {
  assert.equal(configString(1), '1s¹');
  assert.equal(configString(10), '1s² 2s² 2p⁶');
  assert.equal(configString(19), '1s² 2s² 2p⁶ 3s² 3p⁶ 4s¹');
  assert.equal(configString(26), '1s² 2s² 2p⁶ 3s² 3p⁶ 4s² 3d⁶');
});

test('binding energy per nucleon peaks near iron', () => {
  const per = (Z, N) => bindingEnergy(Z, N) / (Z + N);
  assert.ok(Math.abs(per(26, 30) - 8.79) < 0.15, `Fe-56 ${per(26, 30)}`);
  assert.ok(per(26, 30) > per(92, 146) && per(26, 30) > per(8, 8));
});

test('stability and decay modes of familiar isotopes', () => {
  for (const [Z, N] of [[1, 0], [2, 2], [6, 6], [8, 8], [26, 30], [11, 12], [36, 48]]) assert.equal(decayMode(Z, N), null, `${Z},${N}`);
  assert.equal(decayMode(6, 8), 'beta-'); // carbon-14
  assert.equal(decayMode(92, 146), 'alpha'); // uranium-238
  assert.equal(decayMode(0, 1), 'beta-'); // free neutron
  assert.equal(decayMode(6, 4), 'beta+'); // carbon-10
});

test('shining light makes an excited atom emit photons', () => {
  const sim = new AtomSim();
  for (let i = 0; i < 400; i++) { if (i % 20 === 0) sim.shine(1); sim.step(0.05); }
  assert.ok(sim.photons > 5, `photons ${sim.photons}`);
  // Hydrogen only emits at hydrogen wavelengths (Lyman, Balmer, Paschen…).
  const allowed = [];
  for (let lo = 1; lo < 7; lo++) for (let hi = lo + 1; hi <= 7; hi++) allowed.push(911.5 / (1 / lo ** 2 - 1 / hi ** 2) / 10 * 1.0);
  for (const nm of sim.lines) assert.ok(allowed.some((a) => Math.abs(a - nm) / a < 0.01), `unexpected line ${nm}`);
});

test('removing electrons makes ions; carbon-14 decays to nitrogen-14', () => {
  const sim = new AtomSim();
  sim.loadScenario('carbon12');
  sim.remove(sim.outermost());
  assert.equal(sim.Z - sim.electrons.length, 1);
  sim.loadScenario('carbon14');
  sim.params.decaySpeed = 100;
  for (let i = 0; i < 200 && sim.Z === 6; i++) sim.step(0.1);
  assert.equal(sim.Z, 7);
  assert.equal(sim.N, 7);
});

test('ionising light strips electrons and ions recombine, emitting photons', () => {
  const sim = new AtomSim();
  sim.loadScenario('neon');
  sim.params.photonLevel = 8;
  for (let i = 0; i < 40; i++) sim.shine(1);
  assert.ok(sim.electrons.length < 10, 'ionised');
  sim.params.photonLevel = 6;
  const before = sim.photons;
  for (let i = 0; i < 600; i++) sim.step(0.05);
  assert.equal(sim.electrons.length, 10, 'neutral again');
  assert.ok(sim.photons > before);
});

test('non-ionising light never strips electrons, however long it shines', () => {
  const sim = new AtomSim();
  for (let i = 0; i < 500; i++) { sim.energy(0, 0, 1, 0.5); sim.step(0.02); }
  assert.equal(sim.electrons.length, 1);
});
