importScripts('https://www.gstatic.com/firebasejs/12.2.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.2.1/firebase-messaging-compat.js');

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAX3i0deV9FUD3y-qW3X5PqmfgVSsFT5xY',
  authDomain: 'bake-grill.firebaseapp.com',
  projectId: 'bake-grill',
  storageBucket: 'bake-grill.firebasestorage.app',
  messagingSenderId: '862216497656',
  appId: '1:862216497656:web:407898417a86d7058f0e0d',
  measurementId: 'G-M2B7FN48S9'
};

try {
  if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage(payload => {
    const n = payload.notification || {};
    const data = payload.data || {};
    self.registration.showNotification(n.title || 'Bake & Grill', {
      body: n.body || 'Your order has been updated.',
      icon: './assets/icon-192.png',
      badge: './assets/icon-192.png',
      tag: 'bake-grill-order-' + (data.orderId || 'update'),
      data: {orderId: data.orderId || ''}
    });
  });
} catch (e) {
  console.warn('FCM background messaging unavailable:', e);
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const orderId = event.notification.data?.orderId || '';
  const url = './track.html' + (orderId ? '?order=' + encodeURIComponent(orderId) : '');
  event.waitUntil(clients.matchAll({type:'window', includeUncontrolled:true}).then(list => {
    for (const client of list) {
      if ('focus' in client) { client.navigate(url); return client.focus(); }
    }
    if (clients.openWindow) return clients.openWindow(url);
  }));
});

const CACHE = 'bake-grill-pwa-v9-push-vapid';
const APP_SHELL = [
  './','./index.html','./master.html','./track.html',
  './styles.css','./app.js','./master.js','./menu-data.js','./notifications.js','./pwa.js',
  './firebase-config.js','./firebase-init.js','./manifest.webmanifest',
  './assets/logo.png','./assets/icon-192.png','./assets/icon-512.png','./assets/apple-touch-icon.png','./assets/favicon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if(event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if(url.origin !== self.location.origin) return;

  // HTML/CSS/JS: network-first so GitHub updates are not trapped in an old cache.
  const isAppCode = /\.(html|js|css|json|webmanifest)$/i.test(url.pathname);
  if(isAppCode){
    event.respondWith(
      fetch(event.request, {cache:'no-store'}).then(response=>{
        if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));}
        return response;
      }).catch(()=>caches.match(event.request).then(r=>r || caches.match('./index.html')))
    );
    return;
  }

  // Images and other static assets: cache-first, then network.
  event.respondWith(
    caches.match(event.request).then(cached=>cached || fetch(event.request).then(response=>{
      if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));}
      return response;
    }))
  );
});
