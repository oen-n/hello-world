// Service worker : l'appli (et ta liste) s'ouvre même sans réseau, pratique au fond du magasin.
const CACHE = "panier-malin-v2";
const SHELL = ["./", "index.html", "style.css", "app.js", "catalog.js", "recettes.js", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("panier-malin") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(async () => (await caches.match(e.request)) || (e.request.mode === "navigate" ? caches.match("index.html") : Response.error()))
  );
});
