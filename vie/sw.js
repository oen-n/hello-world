// Service worker de Vie Maline : l'appli s'ouvre même sans réseau et affiche les rappels.
const CACHE = "vie-maline-v3";
const SHELL = ["./", "index.html", "style.css", "app.js", "core.js", "coach.js", "manifest.webmanifest",
  "icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("vie-maline") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Réseau d'abord, cache en secours. Les appels au coach IA (api.anthropic.com) ne passent pas par ici.
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
// Toucher un rappel ouvre (ou ramène) l'appli
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    const c = cs.find((x) => x.url.includes("/vie/"));
    return c ? c.focus() : self.clients.openWindow("./#jour");
  }));
});
