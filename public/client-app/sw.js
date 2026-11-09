/* Enhanced Mutual client app - service worker.
   - Caches the app shell so the app opens instantly and works on weak data.
   - NEVER caches API responses (they hold personal data).
   - Receives push notifications. */
const VERSION = 'emi-app-v6';
const SHELL = [
  './', 'index.html', 'styles.css?v=6', 'core.js?v=6', 'ui.js?v=6', 'views-public.js?v=6', 'views-applicant.js?v=6',
  'views-client.js?v=6', 'main.js?v=6', 'manifest.webmanifest', 'img/logo-full.png', 'img/mark-square.png',
  'img/icon-192.png', 'img/badge-96.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // never cache API
  if (!url.pathname.startsWith('/app')) return;
  // Pages: network first (so updates arrive), fall back to the cached shell when offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put('index.html', copy)); return r; }).catch(() => caches.match('index.html')));
    return;
  }
  // Static files: cache first.
  e.respondWith(caches.match(req, { ignoreSearch: false }).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return r;
  })));
});

self.addEventListener('push', (e) => {
  let data = { title: 'Enhanced Mutual', body: '', url: '/app/' };
  try { data = Object.assign(data, e.data ? e.data.json() : {}); } catch (_) {}
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body, icon: 'img/icon-192.png', badge: 'img/badge-96.png', data: { url: data.url || '/app/' }, tag: 'emi-' + Date.now()
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '/app/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if (c.url.includes('/app') && 'focus' in c) return c.focus(); }
    return self.clients.openWindow(target);
  }));
});
