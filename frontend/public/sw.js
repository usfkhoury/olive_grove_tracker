// Offline reading at the grove. Page loads and API GETs: network first, the
// last good copy when there's no signal (tagged X-Olive-Offline so the app
// shows a banner). A filtered URL never opened online (one tree, one season)
// is worked out from the full lists (sw-offline.js), which the app asks us to
// save in the background ('warm') whenever it opens with signal.
// Hashed /assets/*: cache first. Writes are never cached or queued.
// Bump VERSION to drop old caches.
importScripts('/sw-offline.js');
const VERSION = 'v2';
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

// The app posts 'warm' when it opens with signal: save every page's data.
self.addEventListener('message', (e) => {
  if (e.data !== 'warm') return;
  e.waitUntil(caches.open(API).then((cache) => Promise.all(self.oliveOffline.WARM.map((u) =>
    fetch(u).then((res) => (res.ok ? cache.put(u, res) : null)).catch(() => null)))));
});

const json = (data) => new Response(JSON.stringify(data), {
  headers: { 'Content-Type': 'application/json', 'X-Olive-Offline': '1' },
});
async function derived(req) {
  const cache = await caches.open(API);
  const url = new URL(req.url);
  const get = (u) => cache.match(u).then((r) => (r ? r.json() : null));
  const data = await self.oliveOffline.derive(url.pathname, url.searchParams, get);
  return data == null ? null : json(data);
}

async function networkFirst(req, cacheName, key) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(key || req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(key || req);
    if (!hit) {
      const alt = cacheName === API ? await derived(req) : null;
      if (alt) return alt;
      throw err;
    }
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
