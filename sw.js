// GRIFASI Inventario — Service Worker
// Estrategia: network-first para todo lo del propio sitio.
//   • Con internet  → siempre sirve la versión más nueva (no se "pega" código viejo).
//   • Sin internet   → cae al caché (shell de la app) para que abra igual.
//   • Supabase y CDNs (otro origen) → no se interceptan: van directo a la red.
//
// Para forzar refresco total tras un deploy grande, subí el número de CACHE.
const CACHE = 'grifasi-v23';

const SHELL = [
  './', './index.html', './manifest.json',
  './css/fonts.css', './fonts/geist.woff2', './fonts/jetbrains-mono.woff2',
  './css/dashboard.css', './css/pin.css', './css/inventory.css',
  './css/detail.css', './css/scan-modal.css', './css/create.css',
  './css/scanner.css', './css/low-stock.css', './css/config.css',
  './css/guide.css', './css/desktop.css',
  './css/ventas.css', './css/metrics.css',
  './js/toast.js',
  './js/config.js', './js/auth.js', './js/db.js', './js/lookup.js',
  './js/router.js', './js/desktop-shell.js', './js/pin-app.js', './js/scanner.js', './js/dashboard.js',
  './js/products.js', './js/movements.js', './js/lowstock.js',
  './js/settings.js', './js/ventas.js', './js/metrics.js',
  './lib/html5-qrcode.min.js',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png', './icons/icon.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(SHELL.map((u) => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Permite a la UI consultar la versión actual del cache (= versión de la app).
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'GET_VERSION') {
    const reply = { type: 'VERSION', cache: CACHE };
    if (e.ports && e.ports[0]) e.ports[0].postMessage(reply);
    else if (e.source) e.source.postMessage(reply);
  }
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Otro origen (Supabase REST, CDN de supabase-js, fuentes) → red directa, sin caché.
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    } catch {
      const cached = await caches.match(req);
      return cached || caches.match('./index.html');
    }
  })());
});
