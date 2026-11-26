// =====================================================================
// Carbu Malin · « Mon réservoir » et mode « Je prends la route »
//
// Mon réservoir : la voiture (réservoir, consommation), les km roulés par
// jour et la date du dernier plein permettent d'estimer ce qu'il reste.
// Combiné au conseil du jour (les prix baissent / remontent), l'appli dit
// QUAND faire le plein et OÙ (station la moins chère près de soi).
//
// Mode route : ouvert avec l'adresse …/#route (par ex. par un raccourci
// iPhone lancé quand la voiture se connecte à CarPlay ou en Bluetooth).
// Grand écran simple : niveau estimé, conseil, station la moins chère près
// de soi avec Waze, et compteur de km du trajet tant que l'écran est ouvert.
// =====================================================================

const API = "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records";
const DAY = 86400000;

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
const isoDay = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
function kmBetween(a, b) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}

// ---------- données ----------
export function car() {
  const t = load("trajet", {});
  return { tank: Number(t.tank) || 50, cons: Number(t.cons) || 6.5, car: t.car || "compacte" };
}
export function garage() { return load("garage", { anchor: null, liters: null, kmDay: 30, trips: [] }); }
function setGarage(g) { save("garage", g); window.dispatchEvent(new Event("carbu:garage")); }

// Estimation du niveau actuel
export function estimate(now = Date.now()) {
  const g = garage(), c = car();
  if (!g.anchor) return null;
  const days = Math.max(0, (now - g.anchor) / DAY);
  const tripsKm = (g.trips || []).filter((t) => t.t > g.anchor).reduce((s, t) => s + t.km, 0);
  const kmEst = Math.max(tripsKm, (g.kmDay || 0) * days);
  const liters = Math.max(0, Math.min(c.tank, g.liters - kmEst * c.cons / 100));
  const pct = liters / c.tank;
  const perDay = (g.kmDay || 0) * c.cons / 100;
  const reserve = 0.15 * c.tank;
  const daysToReserve = perDay > 0 ? Math.max(0, (liters - reserve) / perDay) : Infinity;
  const refill = Number.isFinite(daysToReserve) ? isoDay(now + Math.max(0, Math.floor(daysToReserve) - 1) * DAY) : null;
  return { liters, pct, kmLeft: liters / c.cons * 100, daysToReserve, refill, tank: c.tank };
}

// Conseil combiné : niveau du réservoir + tendance des prix
export function advice(est, signal) {
  if (!est) return { level: "neutral", icon: "⛽", title: "Active le suivi de ton réservoir", text: "Appuie sur « J'ai fait le plein » la prochaine fois (ou indique ton niveau actuel) : l'appli te dira quand et où faire le plein." };
  const d = Math.floor(est.daysToReserve);
  const jours = !Number.isFinite(est.daysToReserve) ? "" : d <= 0 ? "Tu es sur la réserve." : `Il te reste environ ${d} jour${d > 1 ? "s" : ""} avant la réserve.`;
  const code = signal?.code;
  if (est.pct <= 0.2) return { level: "critical", icon: "⛽", title: "Fais le plein maintenant", text: `Ton réservoir est presque vide (≈ ${Math.round(est.liters)} L). Va à la station la moins chère près de toi.` };
  if ((code === "BUY_NOW" || code === "RISING") && est.pct <= 0.6) return { level: "good", icon: "✅", title: "C'est le bon moment pour faire le plein", text: `${code === "RISING" ? "Les prix remontent" : "La baisse s'arrête, les prix vont remonter"} et ton réservoir est à ${Math.round(est.pct * 100)} %. ${jours}` };
  if ((code === "WAIT" || code === "BUY_SOON") && est.daysToReserve > 3) return { level: "warning", icon: "⏳", title: "Tu peux attendre", text: `Les prix baissent encore. ${jours} L'appli te préviendra au bon moment.` };
  if (code === "BUY_SOON" && est.daysToReserve <= 3) return { level: "good", icon: "✅", title: "Fais le plein dans les 1-2 jours", text: `On approche du prix le plus bas et ${jours.toLowerCase() || "ton réservoir baisse."}` };
  if (est.daysToReserve <= 2) return { level: "warning", icon: "⛽", title: "Pense au plein bientôt", text: `${jours} Choisis la station la moins chère près de toi.` };
  return { level: "neutral", icon: "👍", title: "Rien à faire pour l'instant", text: `Ton réservoir est à ${Math.round(est.pct * 100)} %. ${jours}` };
}

// ---------- interface ----------
export function initVoiture({ getFuel, getSignal, getBest, getPlace, esc, euro, toast, onSync }) {
  const $ = (s) => document.querySelector(s);

  // Mon réservoir
  function renderGarage() {
    const g = garage(), c = car(), est = estimate();
    const adv = advice(est, getSignal());
    const pct = est ? Math.round(est.pct * 100) : 0;
    $("#gaBar").style.width = `${pct}%`;
    $("#gaBar").className = `ga-fill ${pct <= 20 ? "low" : pct <= 40 ? "mid" : ""}`;
    $("#gaLevel").textContent = est ? `${pct} %` : "–";
    $("#gaDetail").textContent = est ? `≈ ${Math.round(est.liters)} L · environ ${Math.round(est.kmLeft)} km` : "Niveau inconnu";
    const best = getBest();
    $("#gaAdvice").className = `ga-advice ${adv.level}`;
    $("#gaAdvice").innerHTML = `<div class="ga-adv-t"><span aria-hidden="true">${adv.icon}</span> ${esc(adv.title)}</div><p>${esc(adv.text)}</p>`
      + (best && (adv.level === "good" || adv.level === "critical" || (est && est.daysToReserve <= 2))
        ? `<div class="ga-best"><span>La moins chère près de toi : <b>${esc(best.ville)}</b>, ${euro(best.p)}</span>
             <a class="primary btnlink" href="https://waze.com/ul?ll=${best.lat},${best.lon}&navigate=yes" target="_blank" rel="noopener">🚗 Y aller avec Waze</a></div>` : "");
    $("#gaKmDay").value = g.kmDay ?? 30;
    $("#gaTank").value = c.tank; $("#gaCons").value = c.cons;
    $("#gaFix").value = pct || 50; $("#gaFixTxt").textContent = `${$("#gaFix").value} %`;
    if (est?.refill) onSync?.(est.refill);
    if (!$("#drive").hidden) renderDrive();
  }
  $("#gaFull").addEventListener("click", () => {
    const g = garage(); g.anchor = Date.now(); g.liters = car().tank; g.trips = []; setGarage(g);
    toast("⛽ Plein noté ! L'appli suit ton réservoir.");
  });
  $("#gaFix").addEventListener("input", () => { $("#gaFixTxt").textContent = `${$("#gaFix").value} %`; });
  $("#gaFixBtn").addEventListener("click", () => {
    const g = garage(); g.anchor = Date.now(); g.liters = car().tank * $("#gaFix").value / 100; g.trips = []; setGarage(g);
    $("#gaFixBox").open = false; toast("Niveau mis à jour");
  });
  const saveSettings = () => {
    const g = garage(); g.kmDay = Math.max(0, Math.min(500, Number($("#gaKmDay").value) || 0)); setGarage(g);
    const t = load("trajet", {});
    t.tank = Math.max(20, Math.min(150, Number($("#gaTank").value) || 50));
    t.cons = Math.max(2, Math.min(25, Number(String($("#gaCons").value).replace(",", ".")) || 6.5));
    t.car = "perso"; save("trajet", t);
    if ($("#tjTank")) { $("#tjTank").value = t.tank; $("#tjCons").value = t.cons; $("#tjCar").value = "perso"; }
  };
  ["#gaKmDay", "#gaTank", "#gaCons"].forEach((id) => $(id).addEventListener("change", saveSettings));
  window.addEventListener("carbu:garage", renderGarage);
  window.addEventListener("carbu:render", renderGarage);

  // Raccourci iPhone : l'adresse à ouvrir
  const routeUrl = location.origin + location.pathname + "#route";
  $("#rtUrl").textContent = routeUrl;
  $("#rtCopy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(routeUrl); toast("Adresse copiée"); } catch { toast(routeUrl); }
  });
  $("#rtOpen").addEventListener("click", () => openDrive());

  // ---------- mode route ----------
  let watch = null, last = null, tripKm = 0, nearBest = null, wake = null;
  function renderDrive() {
    const est = estimate(), adv = advice(est, getSignal());
    $("#drLevel").textContent = est ? `${Math.round(est.pct * 100)} %` : "?";
    $("#drLevelTxt").textContent = est ? `≈ ${Math.round(est.liters)} L · ${Math.round(est.kmLeft)} km` : "niveau inconnu";
    $("#drAdvT").textContent = `${adv.icon} ${adv.title}`;
    $("#drAdvP").textContent = adv.text;
    $("#drTrip").textContent = tripKm >= 0.1 ? `Trajet en cours : ${tripKm.toFixed(1).replace(".", ",")} km` : "Le compteur de km démarre dès que tu roules.";
    const b = nearBest || getBest();
    $("#drBest").innerHTML = b
      ? `<div class="dr-st"><span>La moins chère autour de toi</span><b>${esc(b.ville)}</b><em>${euro(b.p)}${b.dist != null ? ` · ${b.dist.toFixed(1).replace(".", ",")} km` : ""}</em></div>
         <a class="dr-waze" href="https://waze.com/ul?ll=${b.lat},${b.lon}&navigate=yes" target="_blank" rel="noopener">🚗 Y aller avec Waze</a>`
      : `<p class="dr-wait">Recherche des stations autour de toi…</p>`;
  }
  async function findNear(pos) {
    const fuel = getFuel(), f = fuel.toLowerCase();
    const where = `within_distance(geom, geom'POINT(${pos.lon} ${pos.lat})', 10km) AND ${f}_prix IS NOT NULL`;
    try {
      const r = await fetch(`${API}?limit=50&select=${encodeURIComponent(`id,ville,adresse,geom,${f}_prix,${f}_maj`)}&where=${encodeURIComponent(where)}&order_by=${f}_prix`);
      const d = await r.json();
      const list = (d.results || []).filter((s) => s.geom && s[f + "_prix"] && Date.now() - Date.parse(s[f + "_maj"]) < 15 * DAY)
        .sort((x, y) => x[f + "_prix"] - y[f + "_prix"]);
      if (list.length) {
        const s = list[0];
        nearBest = { ville: s.ville, adresse: s.adresse, lat: s.geom.lat, lon: s.geom.lon, p: Math.round(s[f + "_prix"] * 1000), dist: kmBetween(pos, { lat: s.geom.lat, lon: s.geom.lon }) };
      }
    } catch { /* on garde la station de la liste principale */ }
    renderDrive();
  }
  function saveTrip() {
    if (tripKm >= 1) {
      const g = garage(); g.trips = [...(g.trips || []), { t: Date.now(), km: Math.round(tripKm * 10) / 10 }].slice(-200); save("garage", g);
    }
    tripKm = 0; last = null;
  }
  function openDrive() {
    $("#drive").hidden = false; document.body.classList.add("driving");
    renderDrive();
    if (navigator.wakeLock?.request) navigator.wakeLock.request("screen").then((w) => { wake = w; }).catch(() => {});
    if (navigator.geolocation && watch == null) {
      let first = true;
      watch = navigator.geolocation.watchPosition((p) => {
        const pos = { lat: p.coords.latitude, lon: p.coords.longitude };
        if (first) { first = false; findNear(pos); }
        if (p.coords.accuracy > 60) return;
        if (last) {
          const d = kmBetween(last, pos), dt = (p.timestamp - last.t) / 3600000;
          if (d > 0.02 && (dt <= 0 || d / dt < 200)) { tripKm += d; renderDrive(); }
        }
        last = { ...pos, t: p.timestamp };
      }, () => { renderDrive(); }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    }
  }
  function closeDrive(record) {
    if (record) saveTrip(); else { tripKm = 0; last = null; }
    if (watch != null) { navigator.geolocation.clearWatch(watch); watch = null; }
    wake?.release?.().catch(() => {}); wake = null;
    $("#drive").hidden = true; document.body.classList.remove("driving");
    if (location.hash === "#route") history.replaceState(null, "", location.pathname + location.search);
    window.dispatchEvent(new Event("carbu:garage"));
  }
  $("#drNo").addEventListener("click", () => { closeDrive(false); toast("Mode route fermé. Bonne journée !"); });
  $("#drEnd").addEventListener("click", () => { const k = tripKm; closeDrive(true); toast(k >= 1 ? `Trajet de ${k.toFixed(1).replace(".", ",")} km enregistré` : "Trajet terminé"); });
  $("#drFull").addEventListener("click", () => { $("#gaFull").click(); renderDrive(); });
  $("#drPlan").addEventListener("click", () => { closeDrive(true); document.querySelector("#trajet")?.scrollIntoView({ behavior: "smooth" }); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && !$("#drive").hidden && tripKm >= 1) {
      const g = garage(); g.trips = [...(g.trips || []), { t: Date.now(), km: Math.round(tripKm * 10) / 10 }].slice(-200); save("garage", g);
      tripKm = 0;
    }
  });
  const checkHash = () => { if (location.hash === "#route") openDrive(); };
  window.addEventListener("hashchange", checkHash);
  checkHash();
  renderGarage();
}
