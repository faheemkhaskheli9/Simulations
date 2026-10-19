// Colour helpers shared by the renderer and the native views (no GL here).

const cache = new Map();

/** CSS colour ('#rgb', '#rrggbb' or 'rgb(r, g, b)') → [r, g, b, alpha] in 0…1. */
export function hexColor(css, alpha = 1) {
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
