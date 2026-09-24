const CACHE = 'bake-grill-pwa-v4-20260924';
const APP_SHELL = [
  './', './index.html', './master.html', './track.html',
  './styles.css', './app.js', './master.js', './menu-data.js',
  './firebase-config.js', './firebase-init.js', './manifest.webmanifest', './pwa.js',
  './assets/logo.png', './assets/icon-192.png', './assets/icon-512.png',
  './assets/apple-touch-icon.png', './assets/favicon.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function(cache) { return cache.addAll(APP_SHELL); })
      .then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request).then(function(response) {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(function(cache) { cache.put(event.request, copy); });
      }
      return response;
    }).catch(function() {
      return caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        if (event.request.mode === 'navigate') return caches.match('./index.html');
        return new Response('', {status: 503, statusText: 'Offline'});
      });
    })
  );
});
