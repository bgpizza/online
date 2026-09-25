importScripts('https://www.gstatic.com/firebasejs/12.2.1/firebase-app-compat.js','https://www.gstatic.com/firebasejs/12.2.1/firebase-messaging-compat.js','./firebase-config.js');
try { if (self.FIREBASE_CONFIG && !firebase.apps.length) firebase.initializeApp(self.FIREBASE_CONFIG); } catch(e) { console.warn('Firebase SW init failed',e); }

const CACHE = 'bake-grill-pwa-v5';
const APP_SHELL = [
  './', './index.html', './master.html', './track.html',
  './styles.css', './app.js', './master.js', './master-push.js', './menu-data.js',
  './firebase-config.js', './firebase-init.js',
  './manifest.webmanifest', './pwa.js', './assets/logo.png',
  './assets/icon-192.png', './assets/icon-512.png', './assets/favicon.png', './assets/apple-touch-icon.png', './assets/favicon.png', './assets/sounds/new-order-bell.mp3'
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


if (typeof firebase !== 'undefined' && firebase.messaging) {
  try {
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage(payload => {
      const data = payload.data || {};
      const n = payload.notification || {};
      if (data.type === 'NEW_ORDER') {
        const orderId = data.orderId || '';
        self.registration.showNotification(data.title || n.title || `🚨 NEW ORDER #${orderId}`, {
          body: data.body || n.body || 'A new Bake & Grill order has arrived. Open Master to accept it.',
          icon: n.icon || './assets/icon-192.png',
          badge: n.badge || './assets/icon-192.png',
          requireInteraction: true,
          vibrate: [500,200,500,200,1000],
          tag: `bake-grill-new-order-${orderId}`,
          data: {url:'./master.html', orderId}
        });
      }
    });
  } catch(e) { console.warn('Firebase messaging SW unavailable',e); }
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || './master.html', self.location.origin).href;
  event.waitUntil(clients.matchAll({type:'window', includeUncontrolled:true}).then(list => {
    for (const client of list) { if ('focus' in client) { client.navigate(url); return client.focus(); } }
    return clients.openWindow(url);
  }));
});
