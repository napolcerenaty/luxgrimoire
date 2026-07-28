// LuxGrimoire Service Worker — handles Web Push notifications + offline fallback

const OFFLINE_CACHE = 'lux-offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then(function (cache) {
      return cache.addAll([OFFLINE_URL, '/logo-light-text.png', '/logo-dark-text.png']);
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

// Only navigations get a fallback — everything else (API calls, assets) passes through
// untouched, since there's no cached data worth serving for a data-driven app like this.
self.addEventListener('fetch', function (event) {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(function () {
      return caches.match(OFFLINE_URL);
    }),
  );
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
