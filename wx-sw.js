// Service worker for the Airfield Weather web app (wx.html only; registered with its own scope so it leaves the rest of the site alone).
// Bump V to force every device to refresh its cached files.
const V = "wx-v1";
const SHELL = ["wx.html", "wx.webmanifest", "wx-favicon.svg", "wx-icons/icon-192.png", "wx-icons/icon-512.png", "menu.js?v=17", "menu.css?v=17"];

self.addEventListener("install", e => {
  // one missing file must not stop the install
  e.waitUntil(caches.open(V).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => {})))).then(() => self.skipWaiting()));
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

self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) {
    if (/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) e.respondWith(swr(r));
    return;                                   // weather data (Worker, Open-Meteo) is always live
  }
  const p = u.pathname;
  if (r.mode === "navigate") {
    if (p.endsWith("/wx.html")) e.respondWith(fetch(r).then(res => put(r, res)).catch(() => caches.match("wx.html")));
    return;
  }
  if (/\/(wx\.html|wx\.webmanifest|wx-favicon\.svg|wx-icons\/.*|menu\.(js|css))$/.test(p)) e.respondWith(swr(r));
});
