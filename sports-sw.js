// Service worker for the Fixtures web app (sports.html only; registered with its own scope so it leaves the rest of the site alone). Bump V to force every device to refresh its cached files.
const V = "fixtures-v11";
const SHELL = ["sports.html", "menu.js?v=14", "menu.css?v=14", "sports.webmanifest", "sports-icons/icon-192.png", "sports-icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function put(req, res) {
  if (res && res.ok) (await caches.open(V)).put(req, res.clone());
  return res;
}
// Show the cached copy straight away, refresh it in the background.
async function swr(req) {
  const hit = await caches.match(req);
  const net = fetch(req).then(r => put(req, r)).catch(() => hit);
  return hit || net;
}
// Fixtures: always try the network first so data is fresh, fall back to the last copy offline.
async function netFirst(req) {
  try { return await put(req, await fetch(req)); }
  catch (e) { return (await caches.match(req)) || Response.error(); }
}

self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) {
    if (/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) e.respondWith(swr(r));
    return;
  }
  const p = u.pathname;
  if (p.endsWith("/fixtures.json")) { e.respondWith(netFirst(r)); return; }
  if (r.mode === "navigate") {
    if (p.endsWith("/sports.html")) e.respondWith(fetch(r).catch(() => caches.match("sports.html")));
    return;
  }
  // Only the files this app uses; anything else on the site is left alone.
  if (/\/(sports\.html|sports\.webmanifest|menu\.(js|css)|sports-icons\/.*|logos\/.*)$/.test(p)) e.respondWith(swr(r));
});
