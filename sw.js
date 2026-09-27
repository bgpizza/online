importScripts('https://www.gstatic.com/firebasejs/12.2.1/firebase-app-compat.js','https://www.gstatic.com/firebasejs/12.2.1/firebase-messaging-compat.js','./firebase-config.js');
try { if (self.FIREBASE_CONFIG && !firebase.apps.length) firebase.initializeApp(self.FIREBASE_CONFIG); } catch(e) { console.warn('Firebase SW init failed',e); }

const CACHE = 'bake-grill-pwa-v6-ultra-fast';
const APP_SHELL = [
  './', './index.html', './master.html', './track.html',
  './styles.css', './app.js', './master.js', './master-push.js', './menu-data.js',
  './firebase-config.js', './firebase-init.js',
  './manifest.webmanifest', './pwa.js', './assets/logo.webp', './assets/logo.png',
  './assets/icon-192.png', './assets/icon-512.png', './assets/favicon.png', './assets/apple-touch-icon.png', './assets/favicon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin) return;
  const path=url.pathname;
  const isStatic=/\.(?:js|css|png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(path);
  if(isStatic){
    // Instant repeat visits: serve cache immediately, refresh quietly in background.
    event.respondWith(caches.match(req).then(cached=>{
      const refresh=fetch(req).then(r=>{
        if(r.ok) caches.open(CACHE).then(c=>c.put(req,r.clone()));
        return r;
      }).catch(()=>null);
      return cached || refresh.then(r=>r || caches.match('./index.html'));
    }));
    return;
  }
  // HTML/data documents: network first so deployments become visible quickly, offline fallback to cache.
  event.respondWith(fetch(req).then(response=>{
    if(response.ok) caches.open(CACHE).then(c=>c.put(req,response.clone()));
    return response;
  }).catch(()=>caches.match(req).then(r=>r || caches.match('./index.html'))));
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
