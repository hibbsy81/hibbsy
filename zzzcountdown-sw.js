const CACHE = "zzzcountdown-v1";
const SHELL = ["zzzcountdown.html", "zzzcountdown.webmanifest", "zzzcountdown-icon.svg", "zzzcountdown-icon-192.png", "zzzcountdown-icon-512.png", "zzzcountdown-apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("zzzcountdown") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Serve from cache first so it opens offline, and refresh the cache in the background.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const net = fetch(e.request).then((res) => {
        if (res && (res.ok || res.type === "opaque")) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
