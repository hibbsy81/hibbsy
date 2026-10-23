const CACHE = "lipids-v3";
const PAGES = ["/lipids", "/lipids.html"];
const FILES = ["/lipids.webmanifest", "/lipids-favicon.svg", "/lipids-apple-touch-icon.png", "/lipids-icon-192.png", "/lipids-icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        PAGES.concat(FILES).map((url) =>
          fetch(url, { cache: "reload" })
            .then((res) => (res.ok && !res.redirected ? cache.put(url, res) : null))
            .catch(() => null)
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req)
        .then((res) => {
          if (res && res.ok && !res.redirected) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (hit) {
        event.waitUntil(net);
        return hit;
      }
      return (await net) || (await cache.match("/lipids")) || (await cache.match("/lipids.html")) || Response.error();
    })
  );
});
