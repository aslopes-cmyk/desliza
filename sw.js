// Cache offline simples (funciona quando servido via http/https).
const CACHE = 'desliza-v9';
const FILES = ['./', 'index.html', 'css/style.css', 'js/solver.js', 'js/levels.js', 'js/i18n.js', 'js/display.js', 'js/audio.js', 'js/game.js', 'icon.svg', 'manifest.webmanifest', 'img/icon-192.png', 'img/icon-512.png', 'img/icon-maskable-512.png', 'img/apple-touch-icon.png', 'img/favicon-32.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
