// Colour helpers shared by the renderer and the native views (no GL here).

const cache = new Map();

/** CSS colour ('#rgb', '#rrggbb', 'rgb(r, g, b)' or 'hsl(h, s%, l%)') → [r, g, b, alpha] in 0…1. */
export function hexColor(css, alpha = 1) {
  // hsl() strings come from continuous values (e.g. an energy scale), so they are not cached.
  const hsl = typeof css === 'string' && css.startsWith('hsl') && css.match(/hsla?\(([^)]+)\)/);
  if (hsl) {
    const [h, s, l] = hsl[1].split(',').map((v) => parseFloat(v));
    return [...hslToRgb(h, s / 100, l / 100), alpha];
  }
  let rgb = cache.get(css);
  if (!rgb) {
    rgb = [1, 1, 1];
    const s = String(css).trim();
    if (s[0] === '#') {
      const h = s.length === 4 ? s.slice(1).split('').map((c) => c + c).join('') : s.slice(1, 7);
      const n = parseInt(h, 16);
      if (Number.isFinite(n)) rgb = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    } else {
      const m = s.match(/rgba?\(([^)]+)\)/);
      if (m) rgb = m[1].split(',').slice(0, 3).map((v) => Number(v) / 255);
    }
    cache.set(css, rgb);
  }
  return [rgb[0], rgb[1], rgb[2], alpha];
}

/** HSL (hue in degrees, saturation and lightness in 0…1) → [r, g, b] in 0…1. */
export function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}
