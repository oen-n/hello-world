// Service worker : l'appli s'ouvre même sans réseau (dernières données connues)
// et reçoit les notifications (OneSignal).
try { importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js"); } catch (e) { /* hors ligne */ }
const CACHE = "carbu-malin-v14";
const SHELL = ["./", "index.html", "style.css", "app.js", "analysis.js", "config.js", "malin/malin.css", "malin/fonts/plus-jakarta-sans.woff2", "reseaux.js", "manifest.webmanifest", "icons/icon-192.png", "icons/favicon-64.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => (k.startsWith("carbu-malin") || k.startsWith("plein-malin")) && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Réseau d'abord (prix frais), cache en secours.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const mine = url.origin === location.origin, prices = url.hostname === "data.economie.gouv.fr";
  // On ne s'occupe que de nos fichiers et des prix ; le reste (OneSignal, statistiques…) passe tel quel.
  if (e.request.method !== "GET" || !(mine || prices)) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(async () => {
      const hit = await caches.match(e.request);
      if (hit) return hit;
      if (e.request.mode === "navigate") return (await caches.match("index.html")) || (await caches.match("./"));
      return Response.error();
    })
  );
});
