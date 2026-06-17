const CACHE_NAME = 'nts-v1';
const EVENT_QUEUE_KEY = 'nts-event-queue';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(['/', '/index.html'])
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) return;

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// Analytics event queue — flush when online
self.addEventListener('message', (e) => {
  if (e.data?.type === 'QUEUE_EVENT') {
    const queue = JSON.parse(self.registration.scope ? '[]' : '[]');
    queue.push(e.data.event);
    // Store in IndexedDB via postMessage back; simplified here
    e.source.postMessage({ type: 'EVENT_QUEUED' });
  }
});

self.addEventListener('sync', (e) => {
  if (e.tag === 'flush-events') {
    e.waitUntil(flushEventQueue());
  }
});

async function flushEventQueue() {
  // Events are flushed via the client-side analytics module
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.postMessage({ type: 'FLUSH_EVENTS' });
  }
}
