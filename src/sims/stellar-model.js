// Simplified single-star evolution. Masses in M☉, ages in Myr; outputs in solar
// units (L☉, R☉) and Kelvin. Calibrated to be qualitatively right, not precise.

export const T_SUN = 5778;

export function mainSequenceLifetime(M) {
  return Math.max(3, 1e4 * Math.pow(M, -2.5));
}

export function zamsLuminosity(M) {
  if (M < 0.43) return 0.23 * Math.pow(M, 2.3);
  if (M < 2) return Math.pow(M, 4);
  if (M < 55) return 1.4 * Math.pow(M, 3.5);
  return 32000 * M;
}

export function zamsRadius(M) {
  return M < 1 ? Math.pow(M, 0.8) : Math.pow(M, 0.57);
}

export const effectiveTemperature = (L, R) => T_SUN * Math.pow(L / (R * R), 0.25);

export function spectralClass(T) {
  if (T > 30000) return 'O';
  if (T > 10000) return 'B';
  if (T > 7500) return 'A';
  if (T > 6000) return 'F';
  if (T > 5200) return 'G';
  if (T > 3700) return 'K';
  return 'M';
}

export function remnantFor(M) {
  if (M < 8) return { type: 'White dwarf', mass: Math.min(1.35, 0.5 + 0.1 * Math.max(0, M - 1)) };
  if (M < 25) return { type: 'Neutron star', mass: 1.4 };
  return { type: 'Black hole', mass: 0.3 * M };
}

/**
 * State of a star of initial mass M at age t:
 *   { phase, L, R, T, mass, spectral, done, remnantAge }
 */
export function evolve(M, t) {
  const tms = mainSequenceLifetime(M);
  const giantSpan = 0.12 * tms; // subgiant + giant + helium burning
  const L0 = zamsLuminosity(M), R0 = zamsRadius(M);
  const finish = (L, R, phase, mass = M) => {
    const T = effectiveTemperature(L, R);
    return { phase, L, R, T, mass, spectral: spectralClass(T) };
  };

  if (t < 0) return finish(L0 * 0.5, R0 * 3, 'Protostar');
  if (t < tms) {
    const f = t / tms;
    return finish(L0 * (1 + 0.6 * f), R0 * (1 + 0.4 * f), 'Main sequence');
  }
  if (t < tms + giantSpan) {
    const f = (t - tms) / giantSpan;
    const supergiant = M >= 8;
    const Rmax = supergiant ? 300 + 40 * M : 15 + 120 * Math.min(M, 4);
    const Lmax = supergiant ? L0 * 1.8 : Math.max(L0 * 50, 1000 * Math.min(M, 4));
    const ease = f * f * (3 - 2 * f);
    const R = R0 * 1.4 * Math.pow(Rmax / (R0 * 1.4), ease);
    const L = L0 * 1.6 * Math.pow(Lmax / (L0 * 1.6), ease);
    const phase = supergiant ? 'Red supergiant' : f < 0.25 ? 'Subgiant' : 'Red giant';
    return finish(L, R, phase, M * (1 - 0.3 * f * (supergiant ? 1 : 0.5)));
  }

  const rem = remnantFor(M);
  const age = t - tms - giantSpan;
  if (rem.type === 'White dwarf') {
    // Mestel cooling: L ∝ t^(-7/5); radius shrinks slightly with mass.
    const L = 0.05 * Math.pow(1 + age / 3, -1.4);
    const R = 0.0126 * Math.pow(rem.mass / 0.6, -1 / 3);
    return { ...finish(L, R, 'White dwarf', rem.mass), remnantAge: age };
  }
  if (rem.type === 'Neutron star') {
    const L = 1e-3 * Math.pow(1 + age / 0.5, -1.5);
    return { ...finish(L, 1.4e-5, 'Neutron star', rem.mass), remnantAge: age };
  }
  return { phase: 'Black hole', L: 0, R: 4.2e-6 * rem.mass, T: 0, mass: rem.mass, spectral: '—', remnantAge: age };
}

/** Sample a stellar mass from the Salpeter initial mass function (0.1–60 M☉). */
export function sampleSalpeter(rng, mMin = 0.1, mMax = 60) {
  const a = -1.35;
  const lo = Math.pow(mMin, a), hi = Math.pow(mMax, a);
  return Math.pow(lo + (hi - lo) * rng.next(), 1 / a);
}
