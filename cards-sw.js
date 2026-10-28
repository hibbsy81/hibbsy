/* Hearts Scorepad service worker.
   Only touches the scorepad's own files, so the rest of the site (index, para, sports...) is never cached or intercepted.
   Network first, so updates show straight away when online; falls back to the saved copy offline. */
var CACHE = 'hearts-scorepad-v1';
var FILES = ['cards.html', 'menu.js', 'menu.css', 'cards-manifest.webmanifest', 'cards-icon-192.png', 'cards-icon-512.png', 'cards-apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
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
