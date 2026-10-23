/* Pitch Plan service worker: lets the app open offline.
   It only handles Pitch Plan's own files, so other pages in the same folder are not affected. */
const V = 'footy-v3';
const CORE = ['./footy.html', './footy-manifest.webmanifest', './footy-icon-192.png', './footy-icon-512.png', './footy-apple-180.png'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.indexOf('footy-') === 0 && k !== V && k !== 'footy-fonts').map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function staleWhileRevalidate(req, cacheName) {
  return caches.open(cacheName).then(cache =>
    cache.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (FONT_HOSTS.indexOf(url.hostname) >= 0) {
    e.respondWith(staleWhileRevalidate(req, 'footy-fonts'));
    return;
  }
  if (url.origin !== self.location.origin) return;
  const name = url.pathname.split('/').pop();
  const ours = name === 'footy.html' || name === 'footy-manifest.webmanifest' || name.indexOf('footy-icon-') === 0 || name === 'footy-apple-180.png';
  if (ours) e.respondWith(staleWhileRevalidate(req, V));
});
