// ===== PLAYER: AWAKENED service worker — offline support =====
// Strategy: cache-first for the app shell. Instant launches, works fully
// offline, and network problems (captive portals, 404s) can never overwrite
// good cached files. App updates ship by bumping CACHE below — the new
// version precaches fully during install before the old cache is deleted.
// DEPLOY RULE: any change to the app's files must come with a CACHE bump.

const CACHE = 'awakened-v3';
const PRECACHE = [
  'index.html',
  'style.css',
  'app.js',
  'manifest.json',
  'fonts.css',
  'rajdhani-500.woff2',
  'rajdhani-600.woff2',
  'rajdhani-700.woff2',
  'sharetechmono-400.woff2',
  'icon-192.png',
  'icon-512.png',
  'icon-180.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      // only touch OUR caches — CacheStorage is shared by every app on this
      // origin (all GitHub Pages project sites), so never delete other names
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('awakened-') && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// local development: always hit the dev server so edits show up immediately
const DEV = self.location.hostname === 'localhost';

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || DEV) return;

  // navigations always get the cached shell (falling back to network)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match('index.html').then((hit) => hit || fetch(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit ||
      fetch(e.request).then((res) => {
        // only cache healthy responses; never let an error page poison the cache
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
    )
  );
});
