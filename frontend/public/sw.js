// Offline reading at the grove. Page loads and API GETs: network first, the
// last good copy when there's no signal (tagged X-Olive-Offline so the app
// shows a banner). Hashed /assets/*: cache first (their names change on every
// deploy). Writes (POST/PUT/DELETE) are never cached or queued.
// Bump VERSION to drop old caches.
const VERSION = 'v1';
const SHELL = 'olive-shell-' + VERSION;
const API = 'olive-api-' + VERSION;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/icon.svg'])));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL && k !== API).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/export/') || url.pathname.startsWith('/api/auth/')) return;
  if (url.pathname.startsWith('/api/')) return e.respondWith(networkFirst(req, API));
  if (req.mode === 'navigate') return e.respondWith(networkFirst(req, SHELL, '/'));
  if (url.pathname.startsWith('/assets/')) return e.respondWith(cacheFirst(req, SHELL));
});

async function networkFirst(req, cacheName, key) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(key || req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(key || req);
    if (!hit) throw err;
    const headers = new Headers(hit.headers);
    headers.set('X-Olive-Offline', '1');
    return new Response(await hit.blob(), { status: hit.status, headers });
  }
}
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}
