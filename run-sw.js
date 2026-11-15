// Run Light service worker: only touches its own files. Network first, saved copy offline.
const V = "run-light-v1";
const FILES = ["run.html", "run.webmanifest", "menu.js", "menu.css"];
self.addEventListener("install", e => e.waitUntil(caches.open(V).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {})))).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;
  if (!/\/(run\.html|run\.webmanifest|menu\.(js|css)|run-icon.*|run-favicon\.svg|run-apple-touch-icon\.png)$/.test(u.pathname)) return;
  e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(V).then(x => x.put(r, c)); return res; }).catch(() => caches.match(r, { ignoreSearch: true })));
});
