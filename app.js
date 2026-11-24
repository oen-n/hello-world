import { buildSeries, analyze, backtest } from "./analysis.js";

const API = "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records";
const FUELS = ["Gazole", "E10", "SP95", "SP98", "E85", "GPLc"];
const MAULEVRIER = { lat: 47.0100, lon: -0.7560, label: "Maulévrier" };
const NTFY_TOPIC = "plein-malin-cholet-maulevrier";
const TANK = 50; // litres, pour estimer l'économie sur un plein

const $ = (s) => document.querySelector(s);
const state = {
  fuel: localStorage.getItem("fuel") || "Gazole",
  days: 90,
  origin: MAULEVRIER,
  showAll: false,
  hist: null,
  live: null,     // { fuel: { sid: { prix, maj } } }
  meta: {},       // sid -> { adresse, ville, cp, lat, lon }
};

// ---------- utilitaires ----------
const euro = (m) => (m / 1000).toFixed(3).replace(".", ",") + " €";
const cts = (m) => (m >= 0 ? "+" : "−") + (Math.abs(m) / 10).toFixed(1).replace(".", ",") + " ct";
const cap = (s) => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a, c) => a + c.toUpperCase());
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function km(a, b) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function ago(iso) {
  const h = (Date.now() - Date.parse(iso)) / 3600000;
  if (h < 1) return "à l'instant";
  if (h < 24) return `il y a ${Math.round(h)} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "hier" : `il y a ${d} j`;
}
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2600);
}
const shortDate = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const longDate = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

// ---------- données ----------
async function loadHistory() {
  const r = await fetch("data/history.json", { cache: "no-cache" });
  if (!r.ok) throw new Error("historique indisponible");
  return r.json();
}

async function loadLive(h) {
  const [lat, lon] = h.center;
  const sel = ["id", "adresse", "ville", "cp", "geom", ...FUELS.flatMap((f) => [f.toLowerCase() + "_prix", f.toLowerCase() + "_maj"])].join(",");
  const where = `within_distance(geom, geom'POINT(${lon} ${lat})', ${h.radius_km}km)`;
  const url = `${API}?limit=100&select=${encodeURIComponent(sel)}&where=${encodeURIComponent(where)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("API " + r.status);
  const data = await r.json();
  const live = Object.fromEntries(FUELS.map((f) => [f, {}]));
  for (const s of data.results) {
    const sid = String(s.id);
    state.meta[sid] = { adresse: s.adresse, ville: s.ville, cp: s.cp, lat: s.geom?.lat, lon: s.geom?.lon };
    for (const f of FUELS) {
      const v = s[f.toLowerCase() + "_prix"], m = s[f.toLowerCase() + "_maj"];
      if (v && m) live[f][sid] = { prix: Math.round(v * 1000), maj: m };
    }
  }
  return live;
}

// ---------- rendu ----------
function renderFuels() {
  const avail = FUELS.filter((f) => state.hist.fuels[f]);
  if (!avail.includes(state.fuel)) state.fuel = avail[0];
  $("#fuels").innerHTML = avail.map((f) => `<button type="button" class="chip${f === state.fuel ? " on" : ""}" data-f="${f}" aria-pressed="${f === state.fuel}">${f}</button>`).join("");
}

function currentSeries() {
  return buildSeries(state.hist, state.fuel, state.live ? state.live[state.fuel] : null);
}

function renderSignal(series, a) {
  const el = $("#signal");
  if (!a) { el.className = "card signal neutral"; el.innerHTML = `<div class="loading">Pas assez de données pour ce carburant.</div>`; return; }
  const minNow = series.min[series.min.length - 1];
  el.className = `card signal ${a.level}`;
  el.innerHTML = `
    <div class="kicker">Conseil du ${longDate(a.date)} · ${state.fuel}</div>
    <div class="head"><span class="icon" aria-hidden="true">${a.icon}</span><span class="title">${a.label}</span></div>
    <ul>${a.why.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
    <div class="kpis">
      <div class="kpi"><b>${euro(minNow)}</b><span>le moins cher</span></div>
      <div class="kpi"><b>${euro(a.cur)}</b><span>prix moyen</span></div>
      <div class="kpi"><b>${cts(a.d7)}</b><span>sur 7 jours</span></div>
    </div>`;
  // Changement de conseil depuis la dernière visite
  const key = "sig-" + state.fuel, prev = localStorage.getItem(key);
  if (prev && prev !== a.code) toast(`Nouveau conseil pour le ${state.fuel} : ${a.label}`);
  localStorage.setItem(key, a.code);
}

function renderStations(series) {
  const n = series.dates.length - 1;
  const live = state.live ? state.live[state.fuel] : null;
  let rows = [];
  for (const [sid, arr] of Object.entries(series.stations)) {
    const p = arr[n];
    if (p == null) continue;
    const m = state.meta[sid] || state.hist.stations[sid];
    if (!m) continue;
    const week = arr[Math.max(0, n - 7)];
    rows.push({ sid, p, m, d7: week != null ? p - week : null, maj: live?.[sid]?.maj, dist: m.lat ? km(state.origin, m) : null });
  }
  rows.sort((x, y) => x.p - y.p || (x.dist ?? 99) - (y.dist ?? 99));
  const total = rows.length;
  const shown = state.showAll ? rows : rows.slice(0, 8);
  const best = rows[0]?.p, worst = rows[rows.length - 1]?.p;
  $("#stations").innerHTML = shown.map((r, i) => `
    <li class="st${r.p === best ? " best" : ""}">
      <span class="rk">${i + 1}</span>
      <div><div class="nm">${esc(cap(r.m.ville || ""))}</div><div class="ad">${esc(r.m.adresse)}</div></div>
      <div class="pr">${euro(r.p)}<small>${r.dist != null ? r.dist.toFixed(1).replace(".", ",") + " km" : ""}</small></div>
      <div class="act">
        ${r.d7 != null && Math.abs(r.d7) >= 3 ? `<span class="tag ${r.d7 > 0 ? "up" : "down"}">${r.d7 > 0 ? "▲" : "▼"} ${cts(r.d7)} en 7 j</span>` : ""}
        ${r.maj ? `<span>màj ${ago(r.maj)}</span>` : ""}
        ${r.m.lat ? `<a href="https://www.google.com/maps/dir/?api=1&destination=${r.m.lat},${r.m.lon}" target="_blank" rel="noopener">🗺️ Maps</a>
        <a href="https://waze.com/ul?ll=${r.m.lat},${r.m.lon}&navigate=yes" target="_blank" rel="noopener">🚗 Waze</a>` : ""}
      </div>
    </li>`).join("") +
    (total > 1 && worst > best ? `<li class="sub" style="padding-top:8px">💡 Écart entre la moins chère et la plus chère : <b>${cts(worst - best).slice(1)}/L</b>, soit <b>${((worst - best) * TANK / 1000).toFixed(2).replace(".", ",")} €</b> sur un plein de ${TANK} L.</li>` : "");
  const more = $("#moreBtn");
  more.hidden = total <= 8;
  more.textContent = state.showAll ? "Voir moins" : `Voir les ${total} stations`;
  $("#fromLabel").textContent = `Distances depuis ${state.origin.label} · ${total} stations dans un rayon de ${state.hist.radius_km} km`;
}

function renderChart(series) {
  const wrap = $("#chart");
  const N = series.dates.length;
  const from = Math.max(0, N - state.days);
  const idx = [];
  for (let i = from; i < N; i++) if (series.avg[i] != null) idx.push(i);
  if (idx.length < 2) { wrap.innerHTML = ""; return; }
  const W = Math.max(300, wrap.clientWidth || 600), H = 230;
  const m = { l: 44, r: 58, t: 12, b: 26 };
  const vals = idx.flatMap((i) => [series.avg[i], series.min[i]]).filter((v) => v != null);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = Math.max(10, (hi - lo) * 0.08); lo -= pad; hi += pad;
  const x = (i) => m.l + ((i - from) / Math.max(1, N - 1 - from)) * (W - m.l - m.r);
  const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
  const path = (arr) => idx.filter((i) => arr[i] != null).map((i, k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(arr[i]).toFixed(1)}`).join("");
  // graduations
  const step = [10, 20, 50, 100, 200].find((s) => (hi - lo) / s <= 5) || 500;
  const yt = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) yt.push(v);
  const xt = [], nT = W < 420 ? 4 : 6;
  for (let k = 0; k < nT; k++) xt.push(Math.round(from + (k / (nT - 1)) * (N - 1 - from)));
  const last = idx[idx.length - 1];
  const endLabels = [
    { v: series.avg[last], c: "var(--series-1)" },
    { v: series.min[last], c: "var(--series-2)" },
  ];
  if (Math.abs(y(endLabels[0].v) - y(endLabels[1].v)) < 14) {
    const mid = (y(endLabels[0].v) + y(endLabels[1].v)) / 2;
    endLabels[0].yy = mid - 8; endLabels[1].yy = mid + 8;
  }
  wrap.innerHTML = `
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution du prix du ${state.fuel} : moyenne du secteur et station la moins chère">
    <g class="grid">${yt.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`).join("")}</g>
    <g class="axis">
      ${yt.map((v) => `<text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${(v / 1000).toFixed(2).replace(".", ",")}</text>`).join("")}
      ${xt.map((i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${shortDate(series.dates[i])}</text>`).join("")}
    </g>
    <path d="${path(series.avg)}" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${path(series.min)}" fill="none" stroke="var(--series-2)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${endLabels.map((e) => `<circle cx="${x(last)}" cy="${y(e.v)}" r="4" fill="${e.c}" stroke="var(--surface-1)" stroke-width="2"/>
      <text x="${x(last) + 8}" y="${(e.yy ?? y(e.v)) + 4}" font-size="12" font-weight="700" fill="var(--text-primary)">${(e.v / 1000).toFixed(3).replace(".", ",")}</text>`).join("")}
    <g id="cross" visibility="hidden">
      <line id="cx" y1="${m.t}" y2="${H - m.b}" stroke="var(--text-muted)" stroke-dasharray="3 3"/>
      <circle id="c1" r="4" fill="var(--series-1)" stroke="var(--surface-1)" stroke-width="2"/>
      <circle id="c2" r="4" fill="var(--series-2)" stroke="var(--surface-1)" stroke-width="2"/>
    </g>
    <rect id="hit" x="${m.l}" y="0" width="${W - m.l - m.r}" height="${H}" fill="transparent"/>
  </svg><div class="tip" id="tip" hidden></div>`;
  const svg = wrap.querySelector("svg"), tip = $("#tip"), cross = $("#cross");
  const move = (ev) => {
    const rect = svg.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * W;
    let best = idx[0];
    for (const i of idx) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    const a = series.avg[best], b = series.min[best];
    cross.setAttribute("visibility", "visible");
    $("#cx").setAttribute("x1", x(best)); $("#cx").setAttribute("x2", x(best));
    $("#c1").setAttribute("cx", x(best)); $("#c1").setAttribute("cy", y(a));
    if (b != null) { $("#c2").setAttribute("cx", x(best)); $("#c2").setAttribute("cy", y(b)); }
    tip.hidden = false;
    tip.innerHTML = `${longDate(series.dates[best])}<br><span class="sw s1"></span>Moyenne <b>${euro(a)}</b><br><span class="sw s2"></span>Moins chère <b>${b != null ? euro(b) : "–"}</b>`;
    const left = (x(best) / W) * rect.width;
    tip.style.left = Math.min(rect.width - 90, Math.max(90, left)) + "px";
    tip.style.top = "-6px";
  };
  const hide = () => { cross.setAttribute("visibility", "hidden"); tip.hidden = true; };
  const hit = $("#hit");
  hit.addEventListener("pointermove", move);
  hit.addEventListener("pointerdown", move);
  hit.addEventListener("pointerleave", hide);
  $("#chartTitle").textContent = `Évolution du prix · ${state.fuel}`;
  // tableau
  const rowsT = idx.slice().reverse().map((i) => `<tr><td>${shortDate(series.dates[i])}</td><td>${euro(series.avg[i])}</td><td>${series.min[i] != null ? euro(series.min[i]) : "–"}</td></tr>`).join("");
  $("#table").innerHTML = `<table><thead><tr><th>Date</th><th>Moyenne</th><th>Moins chère</th></tr></thead><tbody>${rowsT}</tbody></table>`;
}

function renderTips(series, a) {
  const el = $("#tips");
  if (!a) { el.innerHTML = ""; return; }
  const dev = a.weekday;
  const order = [1, 2, 3, 4, 5, 6, 0];
  const mx = Math.max(...dev.map((d) => Math.abs(d.ecart))) || 1;
  const min = Math.min(...dev.map((d) => d.ecart));
  let bt = null;
  try { bt = backtest(series, 365, 7); } catch { /* ignore */ }
  el.innerHTML = `
    <h2>📊 Ce qu'on a appris de l'année passée</h2>
    <ul class="howto">
      ${a.typicalDecline ? `<li>Une <b>baisse</b> dure en général <b>${a.typicalDecline.days} jours</b> et fait gagner environ <b>${cts(a.typicalDecline.amount).slice(1)}/L</b> (${a.typicalDecline.count} baisses observées).</li>` : ""}
      ${a.typicalRise ? `<li>Une <b>hausse</b> dure en général <b>${a.typicalRise.days} jours</b> pour environ <b>${cts(a.typicalRise.amount)}/L</b>.</li>` : ""}
      <li>Sur 3 mois, le prix moyen a varié entre <b>${euro(a.lo90)}</b> et <b>${euro(a.hi90)}</b>.</li>
      ${bt && bt.perLitre > 0 ? `<li>En suivant les conseils de l'appli (un plein par semaine), tu aurais payé en moyenne <b>${(bt.perLitre / 10).toFixed(1).replace(".", ",")} ct/L de moins</b> qu'en faisant le plein au hasard dans la semaine.</li>` : ""}
      <li>Le plus gros gain reste de <b>choisir la bonne station</b> (voir l'écart ci-dessus).</li>
    </ul>
    <p class="sub">Prix selon le jour de la semaine (plus la barre est haute, plus c'est cher) :</p>
    <div class="week">
      ${order.map((d) => { const v = dev[d]; const h = 6 + ((v.ecart - min) / (2 * mx)) * 36; return `<div class="${v.ecart === min ? "best" : ""}"><div class="bar"><i style="height:${h.toFixed(0)}px"></i></div>${v.jour.slice(0, 3)}</div>`; }).join("")}
    </div>
    <p class="sub">Le <b>${a.bestDay}</b> est en moyenne le jour le moins cher, le <b>${a.worstDay}</b> le plus cher (petits écarts : quelques dixièmes de centime).</p>`;
}

function render() {
  renderFuels();
  const series = currentSeries();
  if (!series) return;
  const a = analyze(series);
  renderSignal(series, a);
  renderStations(series);
  renderChart(series);
  renderTips(series, a);
  $("#range").querySelectorAll("button").forEach((b) => b.classList.toggle("on", +b.dataset.d === state.days));
  const gen = new Date(state.hist.generated).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  $("#updated").textContent = `Historique mis à jour le ${gen}${state.live ? " · prix en direct ✔" : " · prix en direct indisponibles (hors ligne ?)"}`;
}

// ---------- partage, installation, notifications ----------
async function share() {
  const data = { title: "Plein Malin", text: "⛽ Les prix du carburant autour de Cholet et Maulévrier, la station la moins chère et le bon moment pour faire le plein :", url: location.origin + location.pathname };
  if (navigator.share) { try { await navigator.share(data); } catch { /* annulé */ } }
  else { await navigator.clipboard?.writeText(`${data.text} ${data.url}`); toast("Lien copié ! Colle-le dans WhatsApp, SMS…"); }
}

let installEvt = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; $("#installBtn").hidden = false; });
$("#installBtn").addEventListener("click", async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $("#installBtn").hidden = true; });
if (matchMedia("(display-mode: standalone)").matches) $("#installHelp").textContent = "✅ L'appli est installée. Partage-la à ton entourage :";

$("#shareBtn").addEventListener("click", share);
$("#shareBtn2").addEventListener("click", share);
$("#topicName").textContent = NTFY_TOPIC;
$("#ntfyLink").href = `https://ntfy.sh/${NTFY_TOPIC}`;
$("#copyTopic").addEventListener("click", async () => { await navigator.clipboard?.writeText(NTFY_TOPIC); toast("Sujet copié"); });

$("#fuels").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-f]"); if (!b) return;
  state.fuel = b.dataset.f; localStorage.setItem("fuel", state.fuel); state.showAll = false; render();
});
$("#range").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-d]"); if (!b) return;
  state.days = +b.dataset.d; render();
});
$("#moreBtn").addEventListener("click", () => { state.showAll = !state.showAll; render(); });
$("#geoBtn").addEventListener("click", () => {
  if (!navigator.geolocation) return toast("Localisation non disponible");
  navigator.geolocation.getCurrentPosition(
    (p) => { state.origin = { lat: p.coords.latitude, lon: p.coords.longitude, label: "ta position" }; render(); },
    () => toast("Impossible d'obtenir ta position"), { enableHighAccuracy: false, timeout: 10000 });
});
let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => state.hist && render(), 200); });

// ---------- démarrage ----------
async function start() {
  try { state.hist = await loadHistory(); }
  catch { $("#signal").innerHTML = `<div class="loading">Impossible de charger les données. Vérifie ta connexion.</div>`; return; }
  render();
  try { state.live = await loadLive(state.hist); render(); }
  catch (e) { console.warn("Prix en direct indisponibles", e); }
}
start();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && state.hist) {
    try { state.live = await loadLive(state.hist); render(); } catch { /* ignore */ }
  }
});
