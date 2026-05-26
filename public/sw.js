const CACHE = 'memo-v2';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => {
      return cache.addAll(['/', '/manifest.json', '/icon.svg']);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // 只缓存静态资源，API 请求全部走网络
  if (e.request.url.includes('/api/')) return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetched = fetch(e.request).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(e.request, clone));
        }
        return res;
      });
      return cached || fetched;
    })
  );
});
