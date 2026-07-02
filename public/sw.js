const CACHE_NAME = 'beatss-pwa-cache-v5';
const AUDIO_CACHE_NAME = 'beatss-audio-cache-v1';
const ALLOWED_CACHES = [CACHE_NAME, AUDIO_CACHE_NAME];

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/clearance.html',
  '/styles.css',
  '/logo-sossa.png',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📥 Pre-cacheando recursos básicos...');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!ALLOWED_CACHES.includes(cacheName)) {
            console.log('🗑️ Eliminando caché antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

async function rangeResponse(request, cachedResponse) {
  const rangeHeader = request.headers.get('range');
  if (!rangeHeader) {
    return cachedResponse;
  }

  // Parsear el rango solicitado, ej: "bytes=0-100" o "bytes=100-"
  const match = rangeHeader.match(/^bytes=(\d+)-(\d+)?$/);
  if (!match) {
    return cachedResponse;
  }

  const buf = await cachedResponse.arrayBuffer();
  const fileLength = buf.byteLength;
  
  let start = parseInt(match[1], 10);
  let end = match[2] ? parseInt(match[2], 10) : fileLength - 1;

  // Asegurar límites correctos
  if (start >= fileLength) {
    return new Response('', {
      status: 416,
      statusText: 'Range Not Satisfiable',
      headers: { 'Content-Range': `bytes */${fileLength}` }
    });
  }

  start = Math.max(0, start);
  end = Math.min(fileLength - 1, end);

  const chunk = buf.slice(start, end + 1);
  const responseHeaders = new Headers(cachedResponse.headers);
  responseHeaders.set('Content-Range', `bytes ${start}-${end}/${fileLength}`);
  responseHeaders.set('Content-Length', chunk.byteLength.toString());
  responseHeaders.set('Accept-Ranges', 'bytes');

  return new Response(chunk, {
    status: 206,
    statusText: 'Partial Content',
    headers: responseHeaders
  });
}

self.addEventListener('fetch', (event) => {
  // Solo interceptar peticiones GET
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Evitar interceptar recursos de otros dominios (APIs externas, Firebase, Google Drive)
  if (url.origin !== self.location.origin) {
    return;
  }

  // Evitar interceptar endpoints de nuestra API local
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Comprobar si es una petición de audio
  const isAudio = url.pathname.endsWith('.mp3') || 
                  url.pathname.endsWith('.wav') || 
                  event.request.destination === 'audio';

  if (isAudio) {
    event.respondWith(
      caches.open(AUDIO_CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          // Si está en caché, generamos la respuesta de rango parcial sintética
          return rangeResponse(event.request, cachedResponse);
        }

        // Si no está en caché, descargarlo completo y guardarlo en la caché de audio
        try {
          const headers = new Headers(event.request.headers);
          headers.delete('range'); // Eliminar rango para asegurar descarga completa

          const networkRequest = new Request(event.request, { headers });
          const networkResponse = await fetch(networkRequest);

          if (networkResponse && networkResponse.status === 200) {
            const cacheCopy = networkResponse.clone();
            await cache.put(event.request, cacheCopy);
            
            // Si la petición original tenía rango, servimos la parte correspondiente
            if (event.request.headers.has('range')) {
              return rangeResponse(event.request, networkResponse);
            }
            return networkResponse;
          }
          
          return networkResponse;
        } catch (err) {
          console.warn('Fallo de red al descargar audio offline:', err);
          return new Response('', { status: 408, statusText: 'Request Timeout' });
        }
      })
    );
    return;
  }

  // Estrategia estándar: Stale-While-Revalidate para el resto de recursos locales
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const cacheCopy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, cacheCopy);
          });
        }
        return networkResponse;
      }).catch((err) => {
        console.warn('Fallo de red para:', event.request.url, err);
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });

      return cachedResponse || fetchPromise;
    })
  );
});
