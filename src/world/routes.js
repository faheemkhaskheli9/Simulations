// World links: #world/<place…>/<site>?<params>&view=<distance>,<yaw>,<pitch>&lock=…
// (System Design §9.2). Place and site ids are unique, so a route resolves by its
// last valid segment and the rest of the path is kept only for readability (R13).

const RESERVED = new Set(['view', 'lock']);

/** Parse a world hash into { segments, params, view, lock }. Values stay strings except view. */
export function parseWorldHash(hash) {
  const [path, query = ''] = String(hash).replace(/^#/, '').split('?');
  const segments = path.split('/').filter(Boolean).map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
  if (segments[0] === 'world') segments.shift();
  const all = Object.fromEntries(new URLSearchParams(query));
  const params = Object.fromEntries(Object.entries(all).filter(([k]) => !RESERVED.has(k)));
  return { segments, params, view: parseView(all.view), lock: all.lock ?? null };
}

/** "30,0.6,0.4" → { distance, yaw, pitch } with finite values and a positive distance, else null (W-RR-3). */
export function parseView(text) {
  if (!text) return null;
  const [distance, yaw, pitch] = String(text).split(',').map(Number);
  if (![distance, yaw, pitch].every(Number.isFinite) || distance <= 0) return null;
  return { distance, yaw, pitch: Math.max(-1.55, Math.min(1.55, pitch)) };
}

export const formatView = ({ distance, yaw, pitch }) => [distance, yaw, pitch].map((v) => +v.toPrecision(6)).join(',');

/** Build a world hash from a path of ids, parameters, a view and a lock list. */
export function formatWorldHash(path, { params = {}, view = null, lock = null } = {}) {
  const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  if (lock) q.set('lock', lock);
  if (view) q.set('view', formatView(view));
  const qs = q.toString();
  return `#world${path.map((s) => `/${encodeURIComponent(s)}`).join('')}${qs ? `?${qs}` : ''}`;
}

/**
 * Resolve route segments against a world: the last segment naming a site or a
 * place wins. Returns { place, site, unknown } where unknown lists segments that
 * named nothing (shown to the user as a notice).
 */
export function resolveRoute(world, segments) {
  const unknown = segments.filter((s) => !world.sites.has(s) && !world.tree.get(s));
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i];
    if (world.sites.has(s)) {
      const site = world.sites.get(s);
      return { place: site.place, site, unknown };
    }
    const place = world.tree.get(s);
    if (place) return { place, site: null, unknown };
  }
  return { place: world.tree.root, site: null, unknown };
}

/** Readable path for a site: its place's path of ids, then the site id. */
export function sitePath(site) {
  return [...site.place.path().map((p) => p.id), site.id];
}
