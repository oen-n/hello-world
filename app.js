import { buildSeries, analyze, backtest, depToHist } from "./analysis.js";
import { CONFIG } from "./config.js";
import { RESEAUX, lienInstagram, lienTiktok } from "./reseaux.js";

const API = "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records";
const GEO = "https://geo.api.gouv.fr/communes";
const FUELS = ["Gazole", "E10", "SP95", "SP98", "E85", "GPLc"];
const TANK = 50; // litres, pour estimer l'économie sur un plein

const $ = (s) => document.querySelector(s);
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } };

const state = {
  fuel: load("fuel2", null) || localStorage.getItem("fuel") || "Gazole",
  days: 90,
  radius: load("radius", 10),
  place: load("place", null),   // { lat, lon, label, dep }
  fav: load("fav", null),       // { sid, label, dep }
  showAll: false,
  depData: null,                // fichier du département (format brut)
  hist: null,                   // format buildSeries
  live: null,                   // { fuel: { sid: { prix, maj } } }
  meta: {},                     // sid -> { adresse, ville, cp, lat, lon }
  pos: null,                    // position GPS (pour les distances), sinon le lieu choisi
};
if (state.fuel && state.fuel.startsWith('"')) state.fuel = JSON.parse(state.fuel);

// ---------- utilitaires ----------
const euro = (m) => (m / 1000).toFixed(3).replace(".", ",") + " €";
const cts = (m) => (m >= 0 ? "+" : "−") + (Math.abs(m) / 10).toFixed(1).replace(".", ",") + " ct";
const cap = (s) => String(s || "").toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a, c) => a + c.toUpperCase());
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
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2800);
}
const shortDate = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const longDate = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
function depOfCp(cp) {
  cp = String(cp || "");
  if (!/^\d{5}$/.test(cp)) return null;
  if (cp.startsWith("97") || cp.startsWith("98")) return cp.slice(0, 3);
  if (cp.startsWith("20")) return +cp < 20200 ? "2A" : "2B";
  return cp.slice(0, 2);
}
const stationName = (m) => `${cap(m.ville || m.v || "")}${(m.adresse || m.a) ? " – " + (m.adresse || m.a) : ""}`;
const openDialog = (d) => (d.showModal ? d.showModal() : d.setAttribute("open", ""));
const closeDialog = (d) => (d.close ? d.close() : d.removeAttribute("open"));

// ---------- données ----------
async function loadDep(dep) {
  const r = await fetch(`data/dep/${dep}.json`, { cache: "no-cache" });
  if (!r.ok) throw new Error("département " + dep + " indisponible");
  return r.json();
}

function parseLive(results, live) {
  for (const s of results) {
    const sid = String(s.id);
    state.meta[sid] = { adresse: s.adresse, ville: s.ville, cp: s.cp, lat: s.geom?.lat, lon: s.geom?.lon };
    for (const f of FUELS) {
      const v = s[f.toLowerCase() + "_prix"], m = s[f.toLowerCase() + "_maj"];
      if (v && m && (Date.now() - Date.parse(m)) < 20 * 86400000) live[f][sid] = { prix: Math.round(v * 1000), maj: m };
    }
  }
}

async function loadLive() {
  const { lat, lon } = state.place;
  const sel = ["id", "adresse", "ville", "cp", "geom", ...FUELS.flatMap((f) => [f.toLowerCase() + "_prix", f.toLowerCase() + "_maj"])].join(",");
  const live = Object.fromEntries(FUELS.map((f) => [f, {}]));
  const where = `within_distance(geom, geom'POINT(${lon} ${lat})', ${state.radius}km)`;
  for (let offset = 0; offset < 300; offset += 100) {
    const url = `${API}?limit=100&offset=${offset}&select=${encodeURIComponent(sel)}&where=${encodeURIComponent(where)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error("API " + r.status);
    const data = await r.json();
    parseLive(data.results, live);
    if (offset + 100 >= data.total_count) break;
  }
  // La station préférée, même si elle est hors du rayon
  if (state.fav && !state.meta[state.fav.sid]) {
    try {
      const r = await fetch(`${API}?limit=1&select=${encodeURIComponent(sel)}&where=${encodeURIComponent("id=" + Number(state.fav.sid))}`);
      if (r.ok) parseLive((await r.json()).results, live);
    } catch { /* ignore */ }
  }
  return live;
}

async function geoSearch(q) {
  q = q.trim();
  const fields = "nom,centre,codesPostaux,codeDepartement,population";
  const url = /^\d{5}$/.test(q)
    ? `${GEO}?codePostal=${q}&fields=${fields}`
    : `${GEO}?nom=${encodeURIComponent(q)}&fields=${fields}&boost=population&limit=8`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("recherche indisponible");
  return (await r.json()).filter((c) => c.centre);
}

async function reverseGeo(lat, lon) {
  try {
    const r = await fetch(`${GEO}?lat=${lat}&lon=${lon}&fields=nom,codeDepartement`);
    const c = (await r.json())[0];
    if (c) return { label: c.nom, dep: c.codeDepartement };
  } catch { /* ignore */ }
  return { label: "ma position", dep: null };
}

// ---------- rendu ----------
function renderFuels() {
  const avail = FUELS.filter((f) => !state.hist || state.hist.fuels[f]);
  if (!avail.includes(state.fuel)) state.fuel = avail[0];
  $("#fuels").innerHTML = avail.map((f) => `<button type="button" class="chip${f === state.fuel ? " on" : ""}" data-f="${f}" aria-pressed="${f === state.fuel}">${f}</button>`).join("");
}

function currentSeries() {
  return state.hist ? buildSeries(state.hist, state.fuel, null) : null;
}

function renderSignal(series, a) {
  const el = $("#signal");
  if (!a) { el.className = "card signal neutral"; el.innerHTML = `<div class="loading">Pas assez de données pour le ${esc(state.fuel)} dans ce département.</div>`; return; }
  const minNow = series.min[series.min.length - 1];
  el.className = `card signal ${a.level}`;
  el.innerHTML = `
    <div class="kicker">Conseil du ${longDate(a.date)} · ${esc(state.fuel)} · département ${esc(state.place.dep)}</div>
    <div class="head"><span class="icon" aria-hidden="true">${a.icon}</span><span class="title">${a.label}</span></div>
    <ul>${a.why.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
    <div class="kpis">
      <div class="kpi"><b>${minNow != null ? euro(minNow) : "–"}</b><span>le moins cher du dép.</span></div>
      <div class="kpi"><b>${euro(a.cur)}</b><span>prix moyen</span></div>
      <div class="kpi"><b>${cts(a.d7)}</b><span>sur 7 jours</span></div>
    </div>`;
  const key = `sig-${state.place.dep}-${state.fuel}`, prev = localStorage.getItem(key);
  if (prev && prev !== a.code) toast(`Nouveau conseil pour le ${state.fuel} : ${a.label}`);
  try { localStorage.setItem(key, a.code); } catch { /* ignore */ }
}

function stationRows(series) {
  const live = state.live ? state.live[state.fuel] : {};
  const n = series ? series.dates.length - 1 : 0;
  const origin = state.pos || state.place;
  const rows = [];
  for (const [sid, v] of Object.entries(live)) {
    const m = state.meta[sid];
    if (!m) continue;
    const dist = m.lat ? km(origin, m) : null;
    const isFav = state.fav?.sid === sid;
    if (dist != null && dist > state.radius + 0.5 && !isFav) continue;
    const arr = series?.stations[sid];
    const week = arr ? arr[Math.max(0, n - 7)] : null;
    rows.push({ sid, p: v.prix, m, maj: v.maj, dist, isFav, d7: week != null ? v.prix - week : null, inRadius: dist == null || dist <= state.radius + 0.5 });
  }
  return rows;
}

function stationItem(r, i, best) {
  return `
    <li class="st${r.p === best ? " best" : ""}">
      <span class="rk">${i + 1}</span>
      <div><div class="nm">${esc(cap(r.m.ville))}</div><div class="ad">${esc(r.m.adresse)}</div></div>
      <div class="pr">${euro(r.p)}<small>${r.dist != null ? r.dist.toFixed(1).replace(".", ",") + " km" : ""}</small></div>
      <div class="act">
        <button type="button" class="star${r.isFav ? " on" : ""}" data-fav="${esc(r.sid)}" aria-pressed="${r.isFav}" aria-label="${r.isFav ? "Retirer de ma station préférée" : "Choisir comme station préférée"}">${r.isFav ? "★ Ma station" : "☆"}</button>
        ${r.d7 != null && Math.abs(r.d7) >= 3 ? `<span class="tag ${r.d7 > 0 ? "up" : "down"}">${r.d7 > 0 ? "▲" : "▼"} ${cts(r.d7)} en 7 j</span>` : ""}
        ${r.maj ? `<span>màj ${ago(r.maj)}</span>` : ""}
        ${r.m.lat ? `<a href="https://www.google.com/maps/dir/?api=1&destination=${r.m.lat},${r.m.lon}" target="_blank" rel="noopener">🗺️ Maps</a>
        <a href="https://waze.com/ul?ll=${r.m.lat},${r.m.lon}&navigate=yes" target="_blank" rel="noopener">🚗 Waze</a>` : ""}
      </div>
    </li>`;
}

function renderStations(series) {
  const all = stationRows(series);
  const rows = all.filter((r) => r.inRadius).sort((x, y) => x.p - y.p || (x.dist ?? 99) - (y.dist ?? 99));
  const total = rows.length;
  const shown = state.showAll ? rows : rows.slice(0, 8);
  const best = rows[0]?.p, worst = rows[rows.length - 1]?.p;
  $("#stations").innerHTML = !state.live ? `<li class="sub">Chargement des prix en direct…</li>`
    : !total ? `<li class="sub">Aucune station avec du ${esc(state.fuel)} dans un rayon de ${state.radius} km. Agrandis le rayon.</li>`
    : shown.map((r, i) => stationItem(r, i, best)).join("") +
      (total > 1 && worst > best ? `<li class="sub" style="padding-top:8px">💡 Écart entre la moins chère et la plus chère : <b>${cts(worst - best).slice(1)}/L</b>, soit <b>${((worst - best) * TANK / 1000).toFixed(2).replace(".", ",")} €</b> sur un plein de ${TANK} L.</li>` : "");
  const more = $("#moreBtn");
  more.hidden = total <= 8;
  more.textContent = state.showAll ? "Voir moins" : `Voir les ${total} stations`;
  $("#fromLabel").textContent = `Autour de ${state.pos ? "ta position" : state.place.label} · ${total} station${total > 1 ? "s" : ""} dans un rayon de ${state.radius} km`;
  $("#radius").querySelectorAll("button").forEach((b) => b.classList.toggle("on", +b.dataset.r === state.radius));
  renderFav(all, rows);
}

function renderFav(all, rows) {
  const el = $("#favCard");
  if (!state.fav) { el.hidden = true; return; }
  const r = all.find((x) => x.sid === state.fav.sid);
  const rank = rows.findIndex((x) => x.sid === state.fav.sid);
  const cheaper = rows[0] && r && rows[0].p < r.p ? rows[0] : null;
  el.hidden = false;
  el.innerHTML = `<div class="row-between"><h2>⭐ Ma station</h2><button type="button" class="chip" data-fav="${esc(state.fav.sid)}">Retirer</button></div>
    <p class="fav-name">${esc(state.fav.label)}</p>
    ${!state.live ? `<p class="sub">Chargement…</p>`
      : !r ? `<p class="sub">Pas de prix pour le ${esc(state.fuel)} dans cette station en ce moment.</p>`
      : `<div class="fav-row"><b class="fav-price">${euro(r.p)}</b>
          <span>${r.d7 != null && Math.abs(r.d7) >= 3 ? `<span class="tag ${r.d7 > 0 ? "up" : "down"}">${r.d7 > 0 ? "▲" : "▼"} ${cts(r.d7)} en 7 j</span>` : ""}
          ${r.maj ? `<span class="sub">màj ${ago(r.maj)}</span>` : ""}</span></div>
        <p class="sub">${rank >= 0 ? `${rank + 1}<sup>${rank ? "e" : "re"}</sup> moins chère sur ${rows.length} autour de toi.` : "Hors de ton rayon de recherche."}
        ${cheaper ? ` La moins chère (${esc(cap(cheaper.m.ville))}) est à <b>${cts(r.p - cheaper.p).slice(1)}</b> de moins, soit ${((r.p - cheaper.p) * TANK / 1000).toFixed(2).replace(".", ",")} € sur un plein.` : r && rows[0] ? " C'est la moins chère du coin 👍" : ""}</p>`}`;
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
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution du prix du ${state.fuel} : moyenne du département et station la moins chère">
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
    tip.innerHTML = `${longDate(series.dates[best])}<br><span class="sw s1"></span>Moyenne dép. <b>${euro(a)}</b><br><span class="sw s2"></span>Moins chère <b>${b != null ? euro(b) : "–"}</b>`;
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
  if (!state.place) return;
  $("#placeLabel").textContent = `${state.place.label}${state.place.dep ? ` (${state.place.dep})` : ""}`;
  const series = currentSeries();
  const a = series ? analyze(series) : null;
  if (state.hist) renderSignal(series, a);
  renderStations(series);
  if (series) { renderChart(series); renderTips(series, a); }
  $("#range").querySelectorAll("button").forEach((b) => b.classList.toggle("on", +b.dataset.d === state.days));
  const gen = state.depData ? new Date(state.depData.generated).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "–";
  $("#updated").textContent = `Historique du département mis à jour le ${gen}${state.live ? " · prix en direct ✔" : " · prix en direct indisponibles (hors ligne ?)"}`;
  renderMoney();
  renderNotifUI();
}

// ---------- choix du lieu ----------
function askPlace() {
  $("#placeMsg").textContent = "";
  openDialog($("#placeSheet"));
  setTimeout(() => $("#placeInput").focus(), 50);
}
async function setPlace(p, fromGps = false) {
  state.place = p; state.pos = fromGps ? { lat: p.lat, lon: p.lon } : null;
  save("place", p);
  closeDialog($("#placeSheet"));
  await refreshAll();
}
let searchT, lastResults = [];
$("#placeInput").addEventListener("input", (e) => {
  clearTimeout(searchT);
  const q = e.target.value;
  if (q.trim().length < 2) { $("#placeResults").innerHTML = ""; return; }
  searchT = setTimeout(async () => {
    try {
      lastResults = await geoSearch(q);
      $("#placeResults").innerHTML = lastResults.length
        ? lastResults.map((c, i) => `<li><button type="button" data-i="${i}"><b>${esc(c.nom)}</b> <span class="sub">${esc((c.codesPostaux || [])[0] || "")} · dép. ${esc(c.codeDepartement)}</span></button></li>`).join("")
        : `<li class="sub">Aucune commune trouvée.</li>`;
    } catch { $("#placeMsg").textContent = "Recherche indisponible, vérifie ta connexion."; }
  }, 250);
});
$("#placeResults").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-i]"); if (!b) return;
  const c = lastResults[+b.dataset.i];
  setPlace({ lat: c.centre.coordinates[1], lon: c.centre.coordinates[0], label: c.nom, dep: c.codeDepartement });
});
$("#gpsBtn").addEventListener("click", () => {
  if (!navigator.geolocation) { $("#placeMsg").textContent = "Localisation non disponible sur cet appareil."; return; }
  $("#placeMsg").textContent = "Recherche de ta position…";
  navigator.geolocation.getCurrentPosition(async (p) => {
    const lat = p.coords.latitude, lon = p.coords.longitude;
    const g = await reverseGeo(lat, lon);
    setPlace({ lat, lon, label: g.label, dep: g.dep }, true);
  }, () => { $("#placeMsg").textContent = "Impossible d'obtenir ta position. Autorise la localisation ou tape ta ville."; },
  { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
});
$("#placeBtn").addEventListener("click", askPlace);
$("#placeClose").addEventListener("click", () => closeDialog($("#placeSheet")));

// ---------- station préférée ----------
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-fav]"); if (!b) return;
  const sid = b.dataset.fav;
  if (state.fav?.sid === sid) { state.fav = null; toast("Station préférée retirée"); }
  else {
    const m = state.meta[sid] || {};
    state.fav = { sid, label: stationName(m), dep: depOfCp(m.cp) || state.place.dep };
    toast("⭐ C'est ta station préférée. Active les alertes plus bas pour être prévenu de ses changements de prix.");
  }
  save("fav", state.fav);
  render();
  if (subscribed()) syncTags();
});

// ---------- partage ----------
async function share() {
  const data = { title: "Carbu Malin", text: "⛽ Carbu Malin : la station la moins chère près de chez toi et le bon moment pour faire le plein, partout en France. Gratuit :", url: location.origin + location.pathname };
  if (navigator.share) { try { await navigator.share(data); } catch { /* annulé */ } }
  else { try { await navigator.clipboard.writeText(`${data.text} ${data.url}`); toast("Lien copié ! Colle-le dans WhatsApp, SMS…"); } catch { toast(data.url); } }
}

// Installation : Android/Chrome propose une vraie fenêtre d'installation ;
// sur iPhone, Apple ne le permet pas : on montre les étapes à suivre dans Safari.
let installEvt = null;
const UA = navigator.userAgent;
const isIOS = /iPhone|iPad|iPod/i.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const inAppBrowser = /FBAN|FBAV|Instagram|Line\/|WhatsApp|Snapchat|GSA\//i.test(UA);
const isStandalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; if (typeof maybeShowInstallBanner === "function") maybeShowInstallBanner(); });
window.addEventListener("appinstalled", () => { $("#installBtn").hidden = true; toast("✅ Appli installée !"); });
if (isStandalone) {
  $("#installBtn").hidden = true;
  $("#installHelp").textContent = "✅ L'appli est installée. Partage-la à ton entourage :";
}
function installSteps() {
  const url = location.origin + location.pathname;
  if (inAppBrowser) return `<p>Tu as ouvert le lien depuis une autre appli (WhatsApp, Facebook…). Pour installer, il faut l'ouvrir dans ${isIOS ? "<b>Safari</b>" : "<b>Chrome</b>"} :</p>
    <ol class="howto"><li>Appuie sur <b>⋯</b> ou sur l'icône de partage, puis <b>« Ouvrir dans ${isIOS ? "Safari" : "le navigateur"} »</b>.</li>
    <li>Ou copie cette adresse et colle-la dans ${isIOS ? "Safari" : "Chrome"} : <code>${esc(url)}</code></li></ol>`;
  if (isIOS) return `<p>Sur iPhone, Apple ne permet pas l'installation en un clic. Ça prend 10 secondes :</p>
    <ol class="howto">
      <li>Appuie sur le bouton <b>⋯</b> en bas à droite de Safari<br><small>(sur un iPhone plus ancien : le bouton Partager <b>⬆️</b> en bas au milieu)</small></li>
      <li>Appuie sur <b>Partager</b> <span aria-hidden="true">⬆️</span> (si tu ne l'as pas déjà fait)</li>
      <li>Descends et appuie sur <b>« Sur l'écran d'accueil »</b> <span aria-hidden="true">➕</span><br><small>Pas dans la liste ? Tout en bas, appuie sur <b>« Modifier les actions »</b>, puis sur le <b>+</b> vert à côté de « Sur l'écran d'accueil », puis <b>OK</b>.</small></li>
      <li>Appuie sur <b>Ajouter</b> en haut à droite. L'icône bleue apparaît sur ton écran 🎉</li>
    </ol>
    <p class="sub">Si tu n'es pas dans Safari (Chrome, Google…), ouvre d'abord <code>${esc(url)}</code> dans Safari.</p>`;
  return `<ol class="howto">
      <li>Appuie sur le menu <b>⋮</b> en haut à droite de Chrome</li>
      <li>Appuie sur <b>« Installer l'application »</b> ou <b>« Ajouter à l'écran d'accueil »</b></li>
      <li>Confirme : l'icône bleue apparaît sur ton écran 🎉</li>
    </ol>
    <p class="sub">Navigateur Samsung : menu ≡ → « Ajouter la page à » → « Écran d'accueil ».</p>`;
}
async function install() {
  hideInstallBanner();
  if (installEvt) {
    installEvt.prompt();
    const r = await installEvt.userChoice.catch(() => null);
    installEvt = null;
    if (r?.outcome === "accepted") return;
  }
  $("#sheetBody").innerHTML = installSteps();
  openDialog($("#installSheet"));
}
$("#installBtn").addEventListener("click", install);

// Bandeau « Installer l'appli » proposé automatiquement à l'ouverture (sauf si déjà installée,
// ou si la personne a dit « Plus tard » il y a moins de 3 jours).
const isMobile = isIOS || /Android/i.test(UA);
function hideInstallBanner() { $("#installBanner").hidden = true; document.body.classList.remove("has-ibanner"); }
function maybeShowInstallBanner() {
  if (isStandalone || !(isMobile || installEvt)) return;
  const later = Number(localStorage.getItem("installLater") || 0);
  if (Date.now() - later < 3 * 86400000) return;
  if (document.querySelector("dialog[open]")) { setTimeout(maybeShowInstallBanner, 1500); return; }
  $("#ibText").textContent = isIOS
    ? "Ajoute Carbu Malin à ton écran d'accueil : ouverture en 1 clic et alerte au meilleur moment pour faire le plein."
    : "Installe Carbu Malin sur ton téléphone : ouverture en 1 clic et alerte au meilleur moment pour faire le plein.";
  $("#installBanner").hidden = false;
  document.body.classList.add("has-ibanner");
}
$("#ibInstall").addEventListener("click", install);
$("#ibLater").addEventListener("click", () => { try { localStorage.setItem("installLater", String(Date.now())); } catch { /* ignore */ } hideInstallBanner(); });
window.addEventListener("appinstalled", hideInstallBanner);
setTimeout(maybeShowInstallBanner, 2500);
$("#sheetClose").addEventListener("click", () => { const d = $("#installSheet"); d.close ? d.close() : d.removeAttribute("open"); });

$("#shareBtn").addEventListener("click", share);
$("#shareBtn2").addEventListener("click", share);

$("#fuels").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-f]"); if (!b) return;
  state.fuel = b.dataset.f; save("fuel2", state.fuel); state.showAll = false; render();
});
$("#range").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-d]"); if (!b) return;
  state.days = +b.dataset.d; render();
});
$("#radius").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-r]"); if (!b) return;
  state.radius = +b.dataset.r; save("radius", state.radius); state.showAll = false;
  render();
  try { state.live = await loadLive(); } catch { /* ignore */ }
  render();
});
$("#moreBtn").addEventListener("click", () => { state.showAll = !state.showAll; render(); });
let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => state.place && render(), 200); });

// ---------- gagner de l'argent : partenaires, publicité, dons ----------
function safeUrl(u) {
  try { const x = new URL(u, location.href); return /^(https?|mailto):$/.test(x.protocol) ? x.href : null; } catch { return null; }
}
let moneyDone = "";
function renderMoney() {
  const dep = state.place?.dep || "";
  if (moneyDone === dep) return;
  moneyDone = dep;
  const sp = $("#sponsor");
  const list = (CONFIG.partenaires || []).filter((p) => p && p.nom && (!p.departements?.length || p.departements.includes(dep)));
  const contact = CONFIG.contactPartenaire || "";
  const contactUrl = contact ? safeUrl(contact.includes("@") && !contact.startsWith("mailto:") ? "mailto:" + contact : contact) : null;
  sp.hidden = true;
  if (list.length) {
    const p = list[Math.floor(Math.random() * list.length)];
    const link = p.lien ? safeUrl(p.lien) : null;
    sp.innerHTML = `<div class="kicker">Partenaire</div>
      <div class="sp-name">${esc(p.nom)}${p.ville ? ` <span class="sub">· ${esc(p.ville)}</span>` : ""}</div>
      ${p.texte ? `<p>${esc(p.texte)}</p>` : ""}
      ${link ? `<a class="ghost full btnlink" href="${esc(link)}" target="_blank" rel="noopener sponsored">Découvrir</a>` : ""}`;
    sp.hidden = false;
  } else if (contactUrl) {
    sp.innerHTML = `<div class="kicker">Partenaire</div>
      <div class="sp-name">Ton commerce ici ?</div>
      <p>Garage, lavage auto, commerce du ${esc(dep)} : fais-toi connaître auprès des automobilistes du coin.</p>
      <a class="ghost full btnlink" href="${esc(contactUrl)}" target="_blank" rel="noopener">Devenir partenaire</a>`;
    sp.hidden = false;
  }
  if (contactUrl) $("#partnerFoot").innerHTML = `Professionnel ? <a href="${esc(contactUrl)}" target="_blank" rel="noopener">Affiche ton commerce dans Carbu Malin</a>.`;
  const don = CONFIG.donUrl ? safeUrl(CONFIG.donUrl) : null;
  if (don) { $("#donBtn").href = don; $("#don").hidden = false; }
}

// Publicité Google AdSense (seulement si configurée dans config.js)
function setupAds() {
  const client = CONFIG.adsenseClient, slot = CONFIG.adsenseSlot;
  if (!client || !slot || !/^ca-pub-\d+$/.test(client)) return;
  const box = $("#adSlot");
  box.innerHTML = `<div class="kicker">Publicité</div><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(client)}" data-ad-slot="${esc(slot)}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
  box.hidden = false;
  const sc = document.createElement("script");
  sc.async = true; sc.crossOrigin = "anonymous";
  sc.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
  document.head.appendChild(sc);
  (window.adsbygoogle = window.adsbygoogle || []).push({});
}

// Statistiques privées (Cloudflare Web Analytics : sans cookie, toi seul vois le tableau de bord)
function setupStats() {
  const token = CONFIG.cloudflareAnalyticsToken;
  if (!token || !/^[a-f0-9]{32}$/i.test(token)) return;
  const sc = document.createElement("script");
  sc.defer = true;
  sc.src = "https://static.cloudflareinsights.com/beacon.min.js";
  sc.dataset.cfBeacon = JSON.stringify({ token });
  document.head.appendChild(sc);
}

// ---------- notifications (OneSignal) ----------
// Étiquettes envoyées à OneSignal (2 maximum) :
//   zone    = "<département>:<carburant>"  -> conseil du jour du département
//   station = "<id station>:<carburant>"   -> changements de prix de la station préférée
const NOTIF_FUELS = ["Gazole", "E10", "SP95", "SP98", "E85", "GPLc"];
let OS = null;
const notifPrefs = load("notifPrefs", { zone: true, station: true, fuel: null });

function notifStatus(t) { $("#notifStatus").textContent = t; }
function subscribed() { return !!(OS?.User?.PushSubscription?.optedIn && OS.Notifications.permission); }

function renderNotifUI() {
  const sel = $("#notifFuel");
  if (!sel.options.length) sel.innerHTML = NOTIF_FUELS.map((f) => `<option>${f}</option>`).join("");
  if (!sel.dataset.touched) sel.value = notifPrefs.fuel || state.fuel;
  $("#optZoneSub").textContent = state.place?.dep ? `Conseil du jour dans ton département (${state.place.dep})` : "dans ton département";
  const st = $("#optStation");
  st.disabled = !state.fav;
  if (!state.fav) st.checked = false; else if (!st.dataset.touched) st.checked = notifPrefs.station;
  $("#optStationSub").textContent = state.fav ? `${state.fav.label} (dès que le prix bouge d'au moins 2 ct)` : "Choisis d'abord ta station avec ☆ dans la liste";
  const sub = subscribed();
  $("#notifBtn").textContent = sub ? "✅ Enregistrer mes choix" : "🔔 Me prévenir";
  $("#notifOff").hidden = !sub;
}
$("#notifFuel").addEventListener("change", (e) => { e.target.dataset.touched = "1"; });
$("#optStation").addEventListener("change", (e) => { e.target.dataset.touched = "1"; });

async function syncTags() {
  const fuel = $("#notifFuel").value;
  const zone = $("#optZone").checked && state.place?.dep;
  const station = $("#optStation").checked && state.fav;
  Object.assign(notifPrefs, { zone: $("#optZone").checked, station: $("#optStation").checked, fuel });
  save("notifPrefs", notifPrefs);
  const add = {}, remove = ["fuel_Gazole", "fuel_E10", "fuel_SP95", "fuel_SP98"];
  if (zone) add.zone = `${state.place.dep}:${fuel}`; else remove.push("zone");
  if (station) add.station = `${state.fav.sid}:${fuel}`; else remove.push("station");
  try { await OS.User.removeTags(remove); } catch { /* ignore */ }
  if (Object.keys(add).length) await OS.User.addTags(add);
  const what = [zone && `le bon moment dans le ${state.place.dep}`, station && "ta station préférée"].filter(Boolean).join(" et ");
  notifStatus(what ? `✅ Tu seras prévenu pour le ${fuel} : ${what}.` : "Aucune alerte choisie.");
}

function setupNotifications() {
  renderNotifUI();
  if (!CONFIG.oneSignalAppId) { $("#notif").hidden = true; return; }
  const scope = location.pathname.replace(/[^/]*$/, "");
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OneSignal) => {
    try {
      await OneSignal.init({ appId: CONFIG.oneSignalAppId, serviceWorkerPath: scope.slice(1) + "sw.js", serviceWorkerParam: { scope }, allowLocalhostAsSecureOrigin: true });
      OS = OneSignal;
      OneSignal.User.PushSubscription.addEventListener("change", renderNotifUI);
      renderNotifUI();
      if (subscribed()) syncTags().catch(() => {});
    } catch (e) { console.warn("OneSignal", e); }
  });
  const sc = document.createElement("script");
  sc.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
  sc.defer = true;
  document.head.appendChild(sc);

  $("#notifBtn").addEventListener("click", async () => {
    if (!state.place) return askPlace();
    if (!$("#optZone").checked && !$("#optStation").checked) return notifStatus("Coche au moins une alerte.");
    if (isIOS && !isStandalone) return notifStatus("Sur iPhone, ajoute d'abord Carbu Malin à l'écran d'accueil (bouton « Installer l'application » plus bas), puis ouvre l'appli depuis son icône et appuie à nouveau ici.");
    if (!OS) return notifStatus("Chargement en cours… réessaie dans quelques secondes (vérifie ta connexion).");
    if (!OS.Notifications.isPushSupported()) return notifStatus("Ton téléphone ou ton navigateur ne permet pas les notifications. Essaie avec Chrome (Android) ou depuis l'icône de l'appli (iPhone).");
    try {
      if (!OS.Notifications.permission) await OS.Notifications.requestPermission();
      if (!OS.Notifications.permission) return notifStatus("Notifications refusées. Pour les autoriser : Réglages du téléphone → Notifications → Carbu Malin.");
      await OS.User.PushSubscription.optIn();
      await syncTags();
      renderNotifUI();
      toast("🔔 C'est noté, tu seras prévenu !");
    } catch (e) { console.warn(e); notifStatus("Oups, ça n'a pas marché. Réessaie dans un instant."); }
  });
  $("#notifOff").addEventListener("click", async () => {
    try { await OS?.User?.PushSubscription?.optOut(); } catch { /* ignore */ }
    notifStatus("Tu ne recevras plus de notifications.");
    renderNotifUI();
  });
}

// ---------- démarrage ----------
async function refreshAll() {
  state.live = null; state.meta = {}; state.showAll = false;
  render();
  const dep = state.place.dep;
  const tasks = [];
  if (!state.depData || state.depData.dep !== dep) {
    tasks.push(loadDep(dep).then((d) => { state.depData = d; state.hist = depToHist(d); render(); })
      .catch(() => { state.depData = null; state.hist = null; $("#signal").className = "card signal neutral"; $("#signal").innerHTML = `<div class="loading">Pas d'historique disponible pour ce département.</div>`; }));
  }
  tasks.push(loadLive().then((l) => { state.live = l; render(); }).catch((e) => console.warn("Prix en direct indisponibles", e)));
  await Promise.all(tasks);
}

async function start() {
  // Ancienne version (Cholet / Maulévrier) : on garde ce lieu par défaut pour les premiers utilisateurs.
  if (!state.place && localStorage.getItem("fuel")) {
    state.place = { lat: 47.0159, lon: -0.7662, label: "Maulévrier", dep: "49" }; save("place", state.place);
  }
  renderFuels();
  if (!state.place) {
    $("#signal").className = "card signal neutral";
    $("#signal").innerHTML = `<h2>Bienvenue 👋</h2><p>Dis-nous où tu fais le plein pour voir les stations les moins chères autour de toi, partout en France.</p><button type="button" class="primary full" id="startBtn">📍 Choisir mon lieu</button>`;
    $("#startBtn").addEventListener("click", askPlace);
    $("#stations").innerHTML = "";
    askPlace();
    return;
  }
  await refreshAll();
}
start();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
setupNotifications();
setupAds();
setupStats();
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && state.place) {
    try { state.live = await loadLive(); render(); } catch { /* ignore */ }
  }
});

// Réseaux sociaux (réglés dans reseaux.js) : boutons affichés seulement si les comptes sont renseignés.
{
  const ig = lienInstagram(RESEAUX.instagram), tt = lienTiktok(RESEAUX.tiktok);
  $("#suivreBtns").innerHTML = (ig ? `<a class="primary btnlink" href="${ig}" target="_blank" rel="noopener">📸 Instagram</a>` : "")
    + (tt ? `<a class="primary btnlink" href="${tt}" target="_blank" rel="noopener">🎵 TikTok</a>` : "");
  if (!ig && !tt) $("#suivre .sub").textContent = "D'autres applis gratuites arrivent bientôt.";
}
