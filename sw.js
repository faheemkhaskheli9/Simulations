// Offline support. Network-first so a deploy is picked up on the next load; the cache is
// only a fallback, filled as the app fetches its files (every module loads at startup).
const CACHE = 'simulations-v7';
const SHELL = ['./', 'index.html', 'styles.css', 'src/main.js', 'manifest.webmanifest', 'icon.svg'];
// The 3D world loads on demand, so its files are cached up front to work offline (W-TC-8).
const WORLD = [
  'src/world/couplings.js',
  'src/world/engine/camera3d.js',
  'src/world/engine/colors.js',
  'src/world/engine/gl.js',
  'src/world/engine/materials.js',
  'src/world/engine/math3d.js',
  'src/world/engine/meshes.js',
  'src/world/engine/ray.js',
  'src/world/engine/renderer.js',
  'src/world/layout.js',
  'src/world/native/globe.js',
  'src/world/native/terrain.js',
  'src/world/native/gravity3d.js',
  'src/world/native/volume.js',
  'src/world/native/molecules.js',
  'src/world/native/membrane.js',
  'src/world/native/shells.js',
  'src/world/places.js',
  'src/world/routes.js',
  'src/world/scheduler.js',
  'src/world/site.js',
  'src/world/ui/atlas.js',
  'src/world/ui/coupling-panel.js',
  'src/world/ui/hud.js',
  'src/world/ui/tour.js',
  'src/world/ui/world-stage.js',
  'src/world/world.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([...SHELL, ...WORLD])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req)
    .then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    })
    .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit ?? caches.match('index.html'))));
});
