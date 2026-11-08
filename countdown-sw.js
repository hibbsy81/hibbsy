// Offline support for countdown.html (Numbers and Letters). Only the game's own files and its Google Fonts are handled;
// every other request in this folder (for example index.html) goes straight to the network.
var VERSION = 'countdown-v7';
var CORE = [
  'countdown.html',
  'countdown.css',
  'countdown.js',
  'countdown-letters.js',
  'countdown-words.txt',
  'countdown-favicon.svg',
  'countdown.webmanifest',
  'countdown-icon-192.png',
  'countdown-icon-512.png',
  'countdown-icon-maskable-512.png',
  'countdown-apple-touch-icon.png',
  'menu.js',
  'menu.css'
];
var FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
var BASE = new URL('./', self.location).href;
var CORE_URLS = CORE.map(function (p) { return new URL(p, BASE).href; });

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION)
      .then(function (c) {
        // one missing file (for example menu.css) must not stop the install
        return Promise.all(CORE.map(function (f) { return c.add(f).catch(function () {}); }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys
          .filter(function (k) { return k.indexOf('countdown-') === 0 && k !== VERSION; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var bare = url.origin + url.pathname;
  var isCore = url.origin === self.location.origin && CORE_URLS.indexOf(bare) !== -1;
  var isFont = FONT_HOSTS.indexOf(url.hostname) !== -1;
  if (!isCore && !isFont) return;

  e.respondWith((async function () {
    var cache = await caches.open(VERSION);
    var cached = await cache.match(req, { ignoreSearch: isCore });
    var refresh = fetch(req).then(function (res) {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(function () { return null; });
    if (cached) { e.waitUntil(refresh); return cached; }
    var res = await refresh;
    return res || new Response('Offline', { status: 503, statusText: 'Offline' });
  })());
});
