// Service worker : l'appli s'ouvre même sans réseau (dernières données connues)
// et reçoit les notifications (OneSignal).
try { importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js"); } catch (e) { /* hors ligne */ }
const CACHE = "plein-malin-v4";
const SHELL = ["./", "index.html", "style.css", "app.js", "analysis.js", "config.js", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Réseau d'abord (prix frais), cache en secours.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || e.request.url.includes("onesignal")) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok && (new URL(e.request.url).origin === location.origin || e.request.url.includes("data.economie.gouv.fr"))) {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: false }).then((r) => r || caches.match("index.html")))
  );
});
