// Carbu Malin · écran « Mon trajet »
import { VEHICULES, geocode, route, resample, stationsAlong, plan, loadLeaflet } from "./trajet.js";

export function initTrajet({ getFuel, getPlace, esc, euro, toast }) {
  const $ = (s) => document.querySelector(s);
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
  const prefs = load("trajet", { car: "compacte", tank: 50, cons: 6.5, gauge: 50, arrive: "reserve", corr: 5, from: null, to: null });
  let from = prefs.from, to = prefs.to, map = null;

  // ---------- formulaire ----------
  $("#tjCar").innerHTML = VEHICULES.map((v) => `<option value="${v.id}">${v.nom} (${v.reservoir} L, ${String(v.conso).replace(".", ",")} L/100)</option>`).join("") + `<option value="perso">Ma voiture (réglages perso)</option>`;
  $("#tjCar").value = prefs.car; $("#tjTank").value = prefs.tank; $("#tjCons").value = prefs.cons;
  $("#tjGauge").value = prefs.gauge; $("#tjArrive").value = prefs.arrive; $("#tjCorr").value = String(prefs.corr);
  if (from) $("#tjFrom").value = from.label;
  if (to) $("#tjTo").value = to.label;

  const tank = () => Math.max(20, Math.min(150, Number($("#tjTank").value) || 50));
  const cons = () => Math.max(2, Math.min(25, Number(String($("#tjCons").value).replace(",", ".")) || 6.5));
  function gaugeText() {
    const l = tank() * $("#tjGauge").value / 100;
    $("#tjGaugeTxt").textContent = `${Math.round(l)} L · environ ${Math.round(l / cons() * 100)} km`;
    $("#tjFuelTxt").textContent = `Carburant : ${getFuel()} (change-le en haut de l'appli).`;
  }
  $("#tjCar").addEventListener("change", () => {
    const v = VEHICULES.find((x) => x.id === $("#tjCar").value);
    if (v) { $("#tjTank").value = v.reservoir; $("#tjCons").value = v.conso; }
    gaugeText();
  });
  ["#tjTank", "#tjCons"].forEach((id) => $(id).addEventListener("input", () => { $("#tjCar").value = "perso"; gaugeText(); }));
  $("#tjGauge").addEventListener("input", gaugeText);
  $("#fuels")?.addEventListener("click", () => setTimeout(gaugeText, 0));
  gaugeText();

  // suggestions d'adresses
  function suggest(input, list, set) {
    let t, res = [];
    input.addEventListener("input", () => {
      set(null); clearTimeout(t);
      const q = input.value.trim();
      if (q.length < 3) { list.hidden = true; return; }
      t = setTimeout(async () => {
        try { res = await geocode(q); } catch { res = []; }
        list.innerHTML = res.map((r, i) => `<li><button type="button" data-i="${i}">${esc(r.label)}</button></li>`).join("");
        list.hidden = !res.length;
      }, 250);
    });
    list.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-i]"); if (!b) return;
      const r = res[+b.dataset.i]; set(r); input.value = r.label; list.hidden = true;
    });
  }
  suggest($("#tjFrom"), $("#tjFromSugg"), (v) => { from = v; });
  suggest($("#tjTo"), $("#tjToSugg"), (v) => { to = v; });
  $("#tjGps").addEventListener("click", () => {
    if (!navigator.geolocation) return toast("Localisation non disponible");
    navigator.geolocation.getCurrentPosition((p) => {
      from = { label: "Ma position", lat: p.coords.latitude, lon: p.coords.longitude };
      $("#tjFrom").value = from.label; $("#tjFromSugg").hidden = true;
    }, () => toast("Impossible d'obtenir ta position"), { timeout: 10000, maximumAge: 300000 });
  });
  if (!from && getPlace()) {
    const p = getPlace();
    $("#tjFrom").placeholder = `${p.label} (ton lieu)`;
  }

  async function resolve(input, current) {
    if (current) return current;
    const q = input.value.trim();
    if (!q) return null;
    const r = await geocode(q, 1);
    return r[0] || null;
  }

  // ---------- calcul ----------
  const status = (t) => { $("#tjStatus").textContent = t; };
  $("#tjForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#tjResult").hidden = true;
    $("#tjGo").disabled = true;
    try {
      status("Recherche des adresses…");
      let a = await resolve($("#tjFrom"), from);
      if (!a && getPlace()) { const p = getPlace(); a = { label: p.label, lat: p.lat, lon: p.lon }; }
      const b = await resolve($("#tjTo"), to);
      if (!a) return status("Indique ton point de départ.");
      if (!b) return status("Indique où tu vas.");
      from = a; to = b;
      const C = tank(), c = cons(), fuel = getFuel();
      const gauge = Number($("#tjGauge").value), corr = Number($("#tjCorr").value);
      save("trajet", { car: $("#tjCar").value, tank: C, cons: c, gauge, arrive: $("#tjArrive").value, corr, from: a, to: b });

      status("Calcul de l'itinéraire…");
      const r = await route(a, b);
      const line = resample(r.coords, 0.5);
      status(`Recherche des stations sur ${Math.round(r.km)} km de route…`);
      const stations = await stationsAlong(line, corr, fuel);
      if (!stations.length) return status(`Aucune station avec du ${fuel} trouvée près de cette route.`);

      const reserve = Math.max(4, Math.round(C * 0.08));
      const arrivee = { reserve, half: C / 2, full: C * 0.8 }[$("#tjArrive").value] ?? reserve;
      const res = plan({ totalKm: r.km, stations, reservoir: C, conso: c, depart: C * gauge / 100, reserve, arrivee });
      status("");
      show({ a, b, r, line, stations, res, fuel, C });
    } catch (err) {
      console.warn(err);
      status(`Oups : ${err.message || err}. Vérifie ta connexion et réessaie.`);
    } finally { $("#tjGo").disabled = false; }
  });

  // ---------- affichage ----------
  const fmtTime = (min) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")}` : `${Math.round(min)} min`);
  const money = (v) => v.toFixed(2).replace(".", ",") + " €";

  async function show({ a, b, r, line, stations, res, fuel, C }) {
    $("#tjResult").hidden = false;
    const moy = stations.reduce((t, s) => t + s.prix, 0) / stations.length;
    const cheapest = stations.reduce((m, s) => (s.prix < m.prix ? s : m));
    let kpis = `<div class="kpi2"><b>${Math.round(r.km)} km</b><span>${fmtTime(r.min)} de route</span></div>`;
    if (!res.possible) {
      $("#tjKpis").innerHTML = kpis;
      $("#tjStops").innerHTML = `<li class="tj-warn">⚠️ ${esc(res.raison)}</li>`;
    } else {
      const eco = res.litres * moy - res.cout;
      kpis += `<div class="kpi2"><b>${res.arrets.length ? res.arrets.length + " arrêt" + (res.arrets.length > 1 ? "s" : "") : "Aucun arrêt"}</b><span>${res.litres ? res.litres + " L à mettre" : "tu as assez"}</span></div>`;
      kpis += res.litres ? `<div class="kpi2"><b>${money(res.cout)}</b><span>${eco > 0.5 ? `≈ ${money(eco)} de moins qu'au prix moyen` : "au meilleur prix"}</span></div>`
        : `<div class="kpi2"><b>≈ ${Math.round(res.arriveeLitres)} L</b><span>à l'arrivée</span></div>`;
      $("#tjKpis").innerHTML = kpis;
      const items = res.arrets.map((st, i) => {
        const s = st.station, when = r.min * (s.s / r.km);
        return `<li class="tj-stop">
          <span class="tj-num">${i + 1}</span>
          <div class="tj-body">
            <div class="tj-when">Au km ${Math.round(s.s)} · environ ${fmtTime(when)} après le départ</div>
            <div class="tj-name">${esc(s.ville)} <span class="sub">${esc(s.adresse || "")}</span></div>
            <div class="tj-buy"><b>${st.plein ? "Fais le plein" : `Mets ${st.litres} L`}</b> · ${euro(Math.round(s.prix * 1000))}/L · ≈ ${money(st.cout)}</div>
            <div class="tj-act"><span class="sub">${s.off < 0.3 ? "sur ta route" : `à ${s.off.toFixed(1).replace(".", ",")} km de la route`}</span>
              <a href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}" target="_blank" rel="noopener">🗺️ Maps</a>
              <a href="https://waze.com/ul?ll=${s.lat},${s.lon}&navigate=yes" target="_blank" rel="noopener">🚗 Waze</a></div>
          </div></li>`;
      });
      if (!res.arrets.length) items.push(`<li class="tj-ok">✅ Pas besoin de t'arrêter : tu arrives avec environ ${Math.round(res.arriveeLitres)} L. Si tu veux quand même faire le plein en route, la moins chère est à <b>${esc(cheapest.ville)}</b> (km ${Math.round(cheapest.s)}, ${euro(Math.round(cheapest.prix * 1000))}).</li>`);
      $("#tjStops").innerHTML = items.join("");
    }
    const wp = res.possible ? res.arrets.map((x) => `${x.station.lat},${x.station.lon}`).join("|") : "";
    $("#tjGmaps").href = `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lon}&destination=${b.lat},${b.lon}&travelmode=driving${wp ? "&waypoints=" + encodeURIComponent(wp) : ""}`;
    $("#trajet").scrollIntoView({ behavior: "smooth", block: "start" });
    try { await drawMap({ a, b, r, stations, res, cheapest }); } catch { $("#tjMap").hidden = true; }
  }

  async function drawMap({ a, b, r, stations, res, cheapest }) {
    const L = await loadLeaflet();
    const el = $("#tjMap"); el.hidden = false;
    if (map) { map.remove(); map = null; }
    map = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(map);
    const latlngs = r.coords.filter((_, i) => i % 3 === 0 || i === r.coords.length - 1).map(([x, y]) => [y, x]);
    const accent = getComputedStyle(document.body).getPropertyValue("--m-accent").trim() || "#2f6bff";
    const poly = L.polyline(latlngs, { color: accent, weight: 5, opacity: .85 }).addTo(map);
    const pin = (html, cls) => L.divIcon({ className: "tj-pin " + cls, html, iconSize: [30, 30], iconAnchor: [15, 15] });
    for (const s of stations) L.circleMarker([s.lat, s.lon], { radius: 4, color: "#8a93ad", weight: 1, fillOpacity: .6 }).addTo(map)
      .bindPopup(`${esc(s.ville)} · ${euro(Math.round(s.prix * 1000))}`);
    L.marker([a.lat, a.lon], { icon: pin("A", "start") }).addTo(map).bindPopup("Départ");
    L.marker([b.lat, b.lon], { icon: pin("B", "end") }).addTo(map).bindPopup("Arrivée");
    if (res.possible) res.arrets.forEach((x, i) => L.marker([x.station.lat, x.station.lon], { icon: pin(String(i + 1), "stop") }).addTo(map)
      .bindPopup(`<b>Arrêt ${i + 1}</b><br>${esc(x.station.ville)} · ${euro(Math.round(x.station.prix * 1000))}<br>${x.plein ? "Plein" : x.litres + " L"}`));
    else L.marker([cheapest.lat, cheapest.lon], { icon: pin("€", "stop") }).addTo(map);
    map.fitBounds(poly.getBounds(), { padding: [20, 20] });
  }
}
