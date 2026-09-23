const CACHE = 'bake-grill-pwa-v3';
const APP_SHELL = [
  './', './index.html', './master.html', './track.html',
  './styles.css', './app.js', './master.js', './menu-data.js',
  './firebase-config.js', './firebase-init.js',
  './manifest.webmanifest', './assets/logo.png',
  './assets/icon-192.png', './assets/icon-512.png', './assets/apple-touch-icon.png', './assets/favicon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request).then(response => {
      if (response.ok && event.request.method === 'GET') {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match(event.request).then(r => r || caches.match('./index.html')))
  );
});
