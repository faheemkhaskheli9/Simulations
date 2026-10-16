export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
export const TAU = Math.PI * 2;

// Format a number compactly for display (engineering-ish).
export function fmt(v, digits = 3) {
  if (typeof v !== 'number') return String(v);
  if (!Number.isFinite(v)) return String(v);
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) return v.toExponential(digits - 1);
  return Number(v.toPrecision(digits)).toString();
}

// Approximate RGB color of a black body at temperature T (Kelvin).
export function blackbodyColor(T) {
  const t = clamp(T, 1000, 40000) / 100;
  let r, g, b;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  return [clamp(r, 0, 255) | 0, clamp(g, 0, 255) | 0, clamp(b, 0, 255) | 0];
}

export const rgb = ([r, g, b], a = 1) => (a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`);
