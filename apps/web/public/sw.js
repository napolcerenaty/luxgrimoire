// LuxGrimoire Service Worker — handles Web Push notifications + offline fallback

const OFFLINE_CACHE = 'lux-offline-v1';
const OFFLINE_URL = '/offline.html';
const OFFLINE_ASSETS = ['/logo-light-text.png', '/logo-dark-text.png'];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then(function (cache) {
      return cache.addAll([OFFLINE_URL].concat(OFFLINE_ASSETS));
    }),
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== OFFLINE_CACHE; }).map(function (k) { return caches.delete(k); }));
    }),
  );
});

// Navigations get the offline fallback page. The page's own logo images need their own
// fallback too — a failed <img> request isn't a navigation, so it would otherwise never
// hit the cached copy precached above and just show a broken image. Everything else
// (API calls, app assets) still passes through untouched — no broader caching strategy.
self.addEventListener('fetch', function (event) {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(function () {
        return caches.match(OFFLINE_URL);
      }),
    );
    return;
  }

  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && OFFLINE_ASSETS.indexOf(url.pathname) !== -1) {
    event.respondWith(
      fetch(event.request).catch(function () {
        return caches.match(event.request);
      }),
    );
  }
});

self.addEventListener('push', function (event) {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: event.data.text() };
  }

  const title = data.title || 'LuxGrimoire';
  const options = {
    body: data.body || '',
    icon: '/icon-192x192.png',
    badge: '/notification-badge.png',
    data: { link: data.link || '/' },
    tag: data.type || 'default',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const link = event.notification.data?.link || '/';
  const url = link.startsWith('http') ? link : self.location.origin + '/' + link.replace(/^\//, '');

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    }),
  );
});
