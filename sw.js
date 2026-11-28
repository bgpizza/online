importScripts('https://www.gstatic.com/firebasejs/12.2.1/firebase-app-compat.js','https://www.gstatic.com/firebasejs/12.2.1/firebase-messaging-compat.js','./firebase-config.js');
try { if (self.FIREBASE_CONFIG && !firebase.apps.length) firebase.initializeApp(self.FIREBASE_CONFIG); } catch(e) { console.warn('Firebase SW init failed',e); }

const CACHE = 'bake-grill-cart-selection-v1';
const APP_SHELL = [
  './manifest.webmanifest',
  './styles.css?v=20261125-delivery-result-v1',
  './order-fulfilment.css?v=20261126-tracking-eta',
  './p0-ordering-overrides.css?v=20261122-checkout-v1',
  './poulomi.css?v=20261126-pwa-ordering',
  './shop-hours.css?v=20261122-premium-v1',
  './promotions.css?v=20261124-kitchen-stock-v1',
  './customer-finish.css?v=8',
  './firebase-config.js?v=20261119-appcheck-enterprise-diag-v2',
  './firebase-init.js?v=20261119-appcheck-enterprise-diag-v2',
  './hero-carousel.js?v=20261128-audit-fixes',
  './customer-reviews.js?v=20261121-google-review-link-v1',
  './menu-data.js?v=20261121-combo-details-v1',
  './pizza-image-overrides.js?v=20261124-classic-paneer-v1',
  './delivery-schedule.js?v=1',
  './order-reference.js?v=1',
  './functions/pickup-slots.js?v=5',
  './order-tracking.js?v=1',
  './app.js?v=20261128-cart-selection',
  './app-installations.js?v=20261124-app-coupons-v1',
  './storefront.js?v=20261128-order-reliability',
  './poulomi.js?v=20261122-poulomi-v1',
  './customer-account.js?v=20261126-pwa-ordering',
  './notifications.js?v=20261127-offer-push',
  './customer-status-popup.js?v=20261118-v1',
  './pwa.js?v=20261128-install-cta',
  './promotions.css?v=20261124-coupon-stats-v1',
  './master-promotions.js?v=20261127-customer-push',
  './master.js?v=20261128-order-reliability',
  './master-ui.js?v=20261128-audit-fixes',
  './master-workspace.css?v=20261128-readable-text',
  './master-insights.js?v=20261128',
  './',
  './index.html',
  './master.html',
  './master-analytics.js?v=20261128-audit-fixes',
  './track.html',
  './styles.css',
  './master-orders.css?v=1',
  './app.js',
  './master.js?v=20261128-order-reliability',
  './master-push.js?v=20261120-unified-push-worker-v1',
  './master-ui.js?v=20261128-audit-fixes',
  './master-enhancements.js?v=20261127-order-board',
  './customer-account.js',
  './customer-status-popup.js',
  './notifications.js',
  './master-pwa.js?v=20261120-unified-pwa-worker-v1',
  './firebase-config.js',
  './firebase-init.js',
  './master-orders.css?v=20261127-order-board',
  './hero-images/tandoori-chicken.webp',
  './pwa.js',
  './assets/logo.webp',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/favicon.png',
  './assets/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  // Pre-cache independently: a single unavailable optional file must not prevent push from activating.
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.all(APP_SHELL.map(async path=>{
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
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('bake-grill-pwa-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
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
    const refresh=fetch(req).then(async response=>{
      if(response.ok && response.type!=='opaque'){
        const cacheCopy=response.clone();
        try{
          const cache=await caches.open(CACHE);
          await cache.put(req,cacheCopy);
        }catch(error){
          console.warn('Bake & Grill static cache refresh skipped:',path,error);
        }
      }
      return response;
    }).catch(()=>null);
    event.waitUntil(refresh);
    event.respondWith(caches.match(req).then(cached=>cached || refresh.then(response=>response || Response.error())));
    return;
  }
  if(req.mode!=='navigate' && !path.endsWith('.webmanifest'))return;
  // Network-first for HTML documents and manifests.
  event.respondWith(fetch(req).then(response=>{
    if(response.ok && response.type!=='opaque'){
      // Clone before yielding the response to the document/navigation loader.
      const cacheCopy=response.clone();
      caches.open(CACHE).then(c=>c.put(req,cacheCopy)).catch(error=>{
        console.warn('Bake & Grill document cache refresh skipped:',path,error);
      });
    }
    return response;
  }).catch(()=>caches.match(req,{ignoreSearch:req.mode==='navigate'}).then(r=>r || Response.error())));
});

if (typeof firebase !== 'undefined' && firebase.messaging) {
  try {
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage(payload => {
      const data = payload.data || {};
      const n = payload.notification || {};
      const orderId = data.orderId || '';
      if (data.type === 'OFFER_PUSH' && data.offerId && data.title) {
        return self.registration.showNotification(data.title, {
          body: data.body || '', icon:'./assets/icon-192.png', badge:'./assets/icon-192.png',
          tag:'bake-grill-offer-' + data.offerId, data:{url:'./#categories'}
        });
      }
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
  event.waitUntil((async()=>{
    const targetPath=new URL(url).pathname;
    const targetIsMaster=targetPath==='/master.html';
    const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
    const client=windows.find(item=>item.url===url) ||
      windows.find(item=>{
        const path=new URL(item.url).pathname;
        return targetIsMaster ? path==='/master.html' : ['/', '/index.html', '/track.html'].includes(path);
      });
    if(client && 'focus' in client){
      try{
        const destination=client.url===url ? client : await client.navigate(url);
        if(destination){await destination.focus();return;}
      }catch(error){
        console.warn('Bake & Grill notification navigation:',error);
      }
    }
    await clients.openWindow(url);
  })());
});
