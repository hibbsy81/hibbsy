// Service worker for DZ Wind Forecasts: lets the app open offline and load fast.
// The page itself is fetched from the network first (so updates appear straight away) and
// the saved copy is only used when there is no connection. Forecast data is never cached here.
const CACHE = 'dz-winds-shell-v3';
const SHELL = ['./para.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // one failure (for example a library host being down) must not stop the install
    await Promise.all([...SHELL, ...LIBS].map(url => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);

  // forecasts must always be live
  if(url.hostname === 'api.open-meteo.com') return;

  const sameOrigin = url.origin === self.location.origin;
  const isLib = url.hostname === 'cdnjs.cloudflare.com';
  if(!sameOrigin && !isLib) return;   // map tiles and anything else: leave to the browser

  // the page: network first, saved copy when offline
  if(req.mode === 'navigate' || (sameOrigin && url.pathname.endsWith('.html'))){
    event.respondWith((async () => {
      try{
        const fresh = await fetch(req);
        if(fresh.ok){ const copy = fresh.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return fresh;
      }catch(err){
        return (await caches.match(req, { ignoreSearch: true })) ||
               (await caches.match('./para.html')) ||
               Response.error();
      }
    })());
    return;
  }

  // icons, manifest and libraries: saved copy first, then the network
  event.respondWith((async () => {
    const hit = await caches.match(req);
    if(hit) return hit;
    const res = await fetch(req);
    if(res.ok || res.type === 'opaque'){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })());
});
