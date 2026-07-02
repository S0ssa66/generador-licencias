// Self-Destructing Service Worker to completely retire PWA caching
// This forces all user browsers to clear caches and unregister the service worker automatically.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => caches.delete(key)));
    }).then(() => {
      return self.clients.claim();
    }).then(() => {
      console.log('🗑️ Service Worker retired and caches cleared.');
      return self.registration.unregister();
    })
  );
});

// Pass-through all fetch requests directly to the network
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
