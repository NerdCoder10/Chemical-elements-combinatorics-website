/* Service worker: caches the app so it opens instantly and works offline.
 * The 64 atlas chunks (js/atlas/bNN.js, ~49 MB) are not precached; each is cached the first time it is used. */
const CACHE = 'element-combinator-v3';
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/elements.js',
  'js/isotopes.js',
  'js/thermo.js',
  'js/dft.js',
  'js/theory.js',
  'js/engine.js',
  'js/model.js',
  'js/atlas-summary.js',
  'js/atlas.js',
  'js/app.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Serve from the cache straight away, and refresh the cached copy in the background.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(event.request, { ignoreSearch: true });
    const fresh = fetch(event.request).then((res) => {
      if (res.ok) cache.put(event.request, res.clone());
      return res;
    }).catch(() => cached);
    return cached || fresh;
  }));
});
