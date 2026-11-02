/* Countdown service worker.
   Only touches the countdown app's own files, so the rest of the site (index, para, sports, cards...) is never cached or intercepted.
   Network first, so updates show straight away when online; falls back to the saved copy offline.
   Bump CACHE to force every device to refresh its saved files. */
var CACHE = 'countdown-v1';
var FILES = ['countdown.html', 'menu.js', 'menu.css', 'countdown-manifest.webmanifest', 'countdown-icon-192.png', 'countdown-icon-512.png', 'countdown-icon-maskable-512.png', 'countdown-apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // one missing file (for example menu.css) must not stop the install
    return Promise.all(FILES.map(function (f) { return c.add(f).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;
  var file = url.pathname.split('/').pop();
  if (FILES.indexOf(file) === -1) return;            // not ours: leave it to the network
  e.respondWith(
    fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () { return caches.match(req, { ignoreSearch: true }); })
  );
});
