importScripts('https://www.gstatic.com/firebasejs/12.2.1/firebase-app-compat.js','https://www.gstatic.com/firebasejs/12.2.1/firebase-messaging-compat.js','./firebase-config.js');
try { if (self.FIREBASE_CONFIG && !firebase.apps.length) firebase.initializeApp(self.FIREBASE_CONFIG); } catch(e) { console.warn('Firebase SW init failed',e); }

const CACHE = 'bake-grill-pwa-v130-social-buttons';
const APP_SHELL = [
  './', './index.html', './master.html', './track.html',
  './styles.css', './app.js', './master.js?v=20261121-google-review-link-v1', './master-push.js?v=20261120-unified-push-worker-v1', './menu-data.js?v=20261121-combo-details-v1', './master-ui.js?v=20261121-menu-photos-fix-v1', './master-enhancements.js?v=20261121-menu-photos-fix-v1',
  './customer-reviews.js?v=20261121-google-review-link-v1', './customer-account.js', './customer-status-popup.js', './notifications.js', './master-pwa.js?v=20261120-unified-pwa-worker-v1',
  './firebase-config.js', './firebase-init.js',
  './styles.css?v=20261120-track-master-push-sync-v1',
  './p0-ordering-overrides.css?v=20261121-social-buttons-v1',
  './pizza-image-overrides.js?v=20261121-toppings-v1',
  './app.js?v=20261121-location-summary-v1',
  './customer-account.js?v=20261121-fullscreen-otp-v1',
  './pwa.js?v=20261120-phase4-app-polish-v1',
  './notifications.js?v=20261120-track-master-push-sync-v3',
  './hero-carousel.js?v=20261121-pizza-hero-v4',
  './hero-images/tandoori-chicken.webp',
  './manifest.webmanifest', './pwa.js', './master-pwa.js?v=20261120-unified-pwa-worker-v1', './assets/logo.webp',
  './assets/icon-192.png', './assets/icon-512.png', './assets/favicon.png', './assets/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  // Pre-cache independently: a single unavailable optional file must not prevent push from activating.
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    const uniqueShell=[...new Set(APP_SHELL)];
    await Promise.all(uniqueShell.map(async path=>{
      try{
        const response=await fetch(path,{cache:'reload'});
        if(response.ok && response.type!=='opaque') await cache.put(path,response);
      }catch(error){
        console.warn('Bake & Grill cache skipped:',path,error);
      }
    }));
    await self.skipWaiting();
  })());
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
        if(r.ok && r.type!=='opaque'){
          // Clone synchronously before returning the response to the page.
          // Cloning inside the asynchronous caches.open() callback can fail
          // after the browser has already consumed the original response body.
          const cacheCopy=r.clone();
          caches.open(CACHE).then(c=>c.put(req,cacheCopy)).catch(error=>{
            console.warn('Bake & Grill static cache refresh skipped:',path,error);
          });
        }
        return r;
      }).catch(()=>null);
      return cached || refresh.then(r=>r || caches.match('./index.html'));
    }));
    return;
  }
  // HTML/data documents: network first so deployments become visible quickly, offline fallback to cache.
  event.respondWith(fetch(req).then(response=>{
    if(response.ok && response.type!=='opaque'){
      // Clone before yielding the response to the document/navigation loader.
      const cacheCopy=response.clone();
      caches.open(CACHE).then(c=>c.put(req,cacheCopy)).catch(error=>{
        console.warn('Bake & Grill document cache refresh skipped:',path,error);
      });
    }
    return response;
  }).catch(()=>caches.match(req).then(r=>r || caches.match('./index.html'))));
});

if (typeof firebase !== 'undefined' && firebase.messaging) {
  try {
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage(payload => {
      const data = payload.data || {};
      const n = payload.notification || {};
      const orderId = data.orderId || '';
      if (data.type === 'TEST_PUSH') {
        return self.registration.showNotification(data.title || 'Bake & Grill — Test Notification', {
          body: data.body || 'Push notifications are connected on this Master device.',
          icon: './assets/icon-192.png', badge: './assets/icon-192.png',
          tag: 'bake-grill-push-test', data: {url:'./master.html'}
        });
      } else if (data.type === 'NEW_ORDER') {
        return self.registration.showNotification(data.title || n.title || `🚨 NEW ORDER #${orderId}`, {
          body: data.body || n.body || 'A new Bake & Grill order has arrived. Open Master to accept it.',
          icon: n.icon || './assets/icon-192.png', badge: n.badge || './assets/icon-192.png',
          requireInteraction: true, vibrate: [500,200,500,200,1000],
          tag: `bake-grill-new-order-${orderId}`, data: {url:'./master.html', orderId}
        });
      } else if (data.status || n.title || n.body) {
        return self.registration.showNotification(data.title || n.title || 'Bake & Grill order update', {
          body: data.body || n.body || `Your order status is now ${data.status || 'updated'}.`,
          icon: n.icon || './assets/icon-192.png', badge: n.badge || './assets/icon-192.png',
          tag: `bake-grill-order-${orderId || 'update'}`, renotify:true,
          data: {url: orderId ? `./track.html?order=${encodeURIComponent(orderId)}` : './track.html', orderId}
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
