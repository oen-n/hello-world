import { RAYONS, PRODUITS, PRODUIT, POPULAIRES, ENSEIGNES } from "./catalog.js";
import { RECETTES, RECETTE, FILTRES } from "./recettes.js";
import { RESEAUX, lienInstagram, lienTiktok } from "../reseaux.js";

const GEO = "https://geo.api.gouv.fr/communes";
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const EUR_KM = 0.15;
const KEY = "panier-malin"; // ancien nom de l'appli : clé gardée pour ne pas perdre les listes déjà enregistrées
const $ = (s) => document.querySelector(s);
const ENS = Object.fromEntries(ENSEIGNES.map((e) => [e.id, e]));
const RAY = Object.fromEntries(RAYONS.map((r, i) => [r.id, { ...r, ordre: i }]));

// ---------- État (gardé sur le téléphone) ----------
const state = Object.assign({
  place: null,        // { nom, lat, lon }
  rayon: 10,          // km
  trajet: true,
  liste: [],          // { key, id?, nom?, q, coche }
  prixPerso: {},      // "enseigne|produit" -> prix
  magasin: null,      // magasin choisi
  vue: "liste",
  menu: null,
}, JSON.parse(localStorage.getItem(KEY) || "{}"));
state.menu = Object.assign({ pers: 4, midi: false, soir: true, placard: true, slots: {}, sig: null }, state.menu);
const save = () => localStorage.setItem(KEY, JSON.stringify(state));
let magasins = null;  // magasins trouvés autour (non sauvegardés : cache à part)
let nbAffiches = 8;

// ---------- Outils ----------
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const eur = (n) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const qtyTxt = (it) => {
  const p = PRODUIT[it.id];
  const q = String(it.q).replace(".", ",");
  if (p && p.unite === "kg") return `${q} kg`;
  return `${q}`;
};
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2600);
}
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }
function distKm(a, b, c, d) {
  const R = 6371, r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r;
  const h = Math.sin(x / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------- Prix ----------
// Estimation : prix moyen × niveau de prix de l'enseigne × petite variation propre à chaque produit
// (aucune enseigne n'est la moins chère sur tout). Un prix saisi par l'utilisateur remplace l'estimation.
function prix(prodId, ensId) {
  const perso = state.prixPerso[`${ensId}|${prodId}`];
  if (perso != null) return { v: perso, perso: true };
  const p = PRODUIT[prodId], e = ENS[ensId];
  const varia = 0.94 + hash(prodId + ensId) * 0.12;
  return { v: Math.round(p.prix * (e.indice / 100) * varia * 100) / 100, perso: false };
}
function panier(ensId) {
  let total = 0, connus = 0, perso = 0;
  const lignes = state.liste.map((it) => {
    if (!it.id) return { it, pu: null, tot: null };
    const p = prix(it.id, ensId); const tot = p.v * it.q;
    total += tot; connus++; if (p.perso) perso++;
    return { it, pu: p.v, perso: p.perso, tot };
  });
  return { total, lignes, connus, perso };
}

// ---------- Recherche d'articles ----------
const POP = new Set(POPULAIRES);
const INDEX = PRODUITS.map((p) => ({ p, n: norm(p.nom), m: norm(p.mots) }));
function chercher(q, max = 7) {
  const n = norm(q); if (!n) return [];
  const mots = n.split(" ");
  const res = [];
  for (const x of INDEX) {
    let s = 0;
    if (x.n.startsWith(n)) s = 100;
    else if (x.n.split(" ").some((w) => w.startsWith(n))) s = 80;
    else if (x.n.includes(n)) s = 60;
    else if (x.m.split(" ").some((w) => w.startsWith(n))) s = 50;
    else if (mots.every((w) => x.n.includes(w) || x.m.includes(w))) s = 40;
    else if (mots.length > 1 && mots.some((w) => w.length > 2 && (x.n.split(" ").some((v) => v.startsWith(w)) || x.m.split(" ").some((v) => v.startsWith(w))))) s = 20;
    if (s) res.push({ p: x.p, s: s + (POP.has(x.p.id) ? 15 : 0) - x.n.length / 100 });
  }
  return res.sort((a, b) => b.s - a.s).slice(0, max).map((r) => r.p);
}
// "2 kg pommes", "pâtes x3", "500 g de carottes", "lait"
function lireLigne(l) {
  let t = l.trim().replace(/^[-*•·]\s*/, ""); if (!t) return null;
  let q = null, unite = null;
  let m = t.match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|l|x)?\b\.?\s*(?:de |d'|d’)?(.+)$/i);
  if (m) { q = parseFloat(m[1].replace(",", ".")); unite = (m[2] || "").toLowerCase(); t = m[3]; }
  else if ((m = t.match(/^(.+?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)$/i))) { t = m[1]; q = parseFloat(m[2].replace(",", ".")); }
  if (unite === "g") q = q / 1000;
  return { texte: t.trim(), q };
}

// ---------- La liste ----------
function ajouter(id, q, nomLibre) {
  const p = id ? PRODUIT[id] : null;
  const def = p ? (p.unite === "kg" ? 1 : 1) : 1;
  const ex = state.liste.find((it) => (id ? it.id === id : !it.id && norm(it.nom) === norm(nomLibre)));
  if (ex) ex.q = Math.round((ex.q + (q || def)) * 100) / 100;
  else state.liste.push({ key: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), id: id || null, nom: id ? null : nomLibre, q: q || def, coche: false });
  save(); renderListe();
}
const nomDe = (it) => (it.id ? PRODUIT[it.id].nom : it.nom);
const rayonDe = (it) => (it.id ? PRODUIT[it.id].rayon : "autre");
const pas = (it) => (it.id && PRODUIT[it.id].unite === "kg" ? (it.q < 1 ? 0.1 : 0.5) : 1);

function renderListe() {
  const ul = $("#items");
  ul.innerHTML = state.liste.map((it) => `
    <li data-k="${it.key}">
      <span class="ico">${RAY[rayonDe(it)].ico}</span>
      <span class="nm">${esc(nomDe(it))}${it.qa ? ' <small class="tagm" title="Pour tes menus">🍽️</small>' : ""}${it.id ? "" : ' <small class="muted">(prix non comparé)</small>'}</span>
      <span class="qty">
        <button type="button" class="qb" data-a="moins" aria-label="Moins">−</button>
        <b>${qtyTxt(it)}</b>
        <button type="button" class="qb" data-a="plus" aria-label="Plus">+</button>
      </span>
    </li>`).join("");
  const n = state.liste.length;
  $("#emptyList").hidden = n > 0;
  $("#clearBtn").hidden = n === 0;
  $("#listCount").textContent = n ? `${n} article${n > 1 ? "s" : ""}` : "";
  $("#goCompare").disabled = !state.liste.some((it) => it.id);
  renderQuick(); renderMenuHint();
}
function renderQuick() {
  const dans = new Set(state.liste.map((it) => it.id));
  $("#quick").innerHTML = POPULAIRES.filter((id) => !dans.has(id)).slice(0, 10)
    .map((id) => `<button type="button" class="chip" data-id="${id}">+ ${esc(PRODUIT[id].nom.replace(/ \(.*\)/, ""))}</button>`).join("");
}

function renderSugg() {
  const v = $("#q").value; const l = lireLigne(v);
  const ul = $("#sugg");
  if (!l || !l.texte) { ul.hidden = true; return; }
  const r = chercher(l.texte);
  ul.innerHTML = r.map((p) => `<li role="option"><button type="button" data-id="${p.id}"><span>${RAY[p.rayon].ico} ${esc(p.nom)}</span><small>${l.q ? (p.unite === "kg" ? l.q + " kg" : "× " + l.q) : (p.unite === "kg" ? "au kg" : "")}</small></button></li>`).join("")
    + `<li role="option"><button type="button" data-libre="1"><span>➕ Ajouter « ${esc(l.texte)} »</span><small>tel quel</small></button></li>`;
  ul.hidden = false;
}
function choisirSugg(btn) {
  const l = lireLigne($("#q").value);
  if (btn.dataset.id) ajouter(btn.dataset.id, l.q);
  else ajouter(null, l.q, l.texte.charAt(0).toUpperCase() + l.texte.slice(1));
  $("#q").value = ""; $("#sugg").hidden = true; $("#q").focus();
}

// ---------- Lieu ----------
function renderPlace() { $("#placeLabel").textContent = state.place ? state.place.nom : "Choisir ma ville"; }
let cityTimer;
async function chercherVille(q) {
  const ul = $("#cities"); const msg = $("#placeMsg");
  if (q.trim().length < 2) { ul.innerHTML = ""; return; }
  const champ = /^\d{5}$/.test(q.trim()) ? `codePostal=${q.trim()}` : `nom=${encodeURIComponent(q)}`;
  try {
    const r = await fetch(`${GEO}?${champ}&fields=nom,centre,codesPostaux,codeDepartement&boost=population&limit=8`);
    const villes = await r.json();
    msg.textContent = villes.length ? "" : "Aucune ville trouvée.";
    ul.innerHTML = villes.filter((v) => v.centre).map((v) => `<li><button type="button" data-nom="${esc(v.nom)}" data-lat="${v.centre.coordinates[1]}" data-lon="${v.centre.coordinates[0]}">${esc(v.nom)} <small>${esc((v.codesPostaux || [])[0] || v.codeDepartement || "")}</small></button></li>`).join("");
  } catch { msg.textContent = "Pas de connexion pour chercher la ville."; }
}
function setPlace(p) {
  state.place = p; magasins = null; save(); renderPlace(); $("#placeDlg").close();
  if (state.vue === "compare") renderCompare();
}

// ---------- Magasins autour ----------
function enseigneDe(tags) {
  const txt = norm([tags.brand, tags.name, tags.operator].filter(Boolean).join(" "));
  let best = null, len = 0;
  for (const e of ENSEIGNES) for (const m of e.motifs) {
    if (m.length > len && (" " + txt + " ").includes(" " + m + " ")) { best = e; len = m.length; }
  }
  return best;
}
async function chargerMagasins() {
  const { lat, lon } = state.place; const R = 20000;
  const ck = `pm-stores-${lat.toFixed(3)},${lon.toFixed(3)}`;
  const c = JSON.parse(localStorage.getItem(ck) || "null");
  if (c && Date.now() - c.t < 7 * 864e5) return c.list;
  const q = `[out:json][timeout:25];nwr["shop"~"^(supermarket|discount|convenience)$"](around:${R},${lat},${lon});out center tags;`;
  let data = null, err;
  for (const url of OVERPASS) {
    try {
      const r = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
      if (!r.ok) throw new Error(r.status);
      data = await r.json(); break;
    } catch (e) { err = e; }
  }
  if (!data) throw err || new Error("indisponible");
  const list = [];
  for (const el of data.elements) {
    const t = el.tags || {}; const e = enseigneDe(t); if (!e) continue;
    const la = el.lat ?? el.center?.lat, lo = el.lon ?? el.center?.lon; if (la == null) continue;
    const rue = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
    list.push({ id: `${el.type[0]}${el.id}`, ens: e.id, nom: t.name || e.nom, adresse: [rue, t["addr:city"]].filter(Boolean).join(", "),
      lat: la, lon: lo, d: Math.round(distKm(lat, lon, la, lo) * 10) / 10 });
  }
  list.sort((a, b) => a.d - b.d);
  try { localStorage.setItem(ck, JSON.stringify({ t: Date.now(), list })); } catch { /* plein */ }
  return list;
}

// ---------- Comparaison ----------
function classement() {
  const tot = {}; for (const e of ENSEIGNES) tot[e.id] = panier(e.id).total;
  let lignes;
  if (magasins && magasins.length) {
    lignes = magasins.filter((m) => m.d <= state.rayon).map((m) => {
      const t = tot[m.ens], tr = state.trajet ? m.d * 2 * EUR_KM : 0;
      return { ...m, panier: t, trajet: tr, total: t + tr };
    });
  } else {
    lignes = ENSEIGNES.map((e) => ({ id: "ens-" + e.id, ens: e.id, nom: e.nom, adresse: "", d: null, panier: tot[e.id], trajet: 0, total: tot[e.id] }));
  }
  return lignes.sort((a, b) => a.total - b.total || (a.d ?? 0) - (b.d ?? 0));
}
const dist = (m) => (m.d == null ? "" : `${String(m.d).replace(".", ",")} km`);
function badgeDrive(e) { return e.drive ? '<span class="tag drive">🚗 Drive</span>' : ""; }

async function renderCompare() {
  document.querySelectorAll("#radius button").forEach((b) => b.classList.toggle("on", +b.dataset.r === state.rayon));
  $("#trajet").checked = state.trajet;
  const msg = $("#storesMsg");
  if (state.place && magasins === null) {
    msg.textContent = "Recherche des magasins autour de chez toi…";
    $("#winner").innerHTML = '<div class="loading">Analyse de ton panier…</div>'; $("#stores").innerHTML = "";
    try { magasins = await chargerMagasins(); }
    catch { magasins = []; toast("Magasins introuvables pour l'instant : comparaison par enseigne."); }
  }
  const rows = classement();
  const nonCompares = state.liste.filter((it) => !it.id).length;
  if (!state.place) msg.innerHTML = '📍 <button class="link" type="button" data-open="place">Indique ta ville</button> pour voir les magasins près de chez toi. En attendant, comparaison par enseigne.';
  else if (!magasins.length) msg.textContent = "Comparaison par enseigne (magasins autour indisponibles pour l'instant).";
  else if (!rows.length) msg.textContent = `Aucun magasin connu à moins de ${state.rayon} km : agrandis la distance.`;
  else msg.textContent = `${rows.length} magasin${rows.length > 1 ? "s" : ""} à moins de ${state.rayon} km de ${state.place.nom}.`
    + (nonCompares ? ` ${nonCompares} article${nonCompares > 1 ? "s" : ""} hors catalogue non compté${nonCompares > 1 ? "s" : ""}.` : "");

  if (!rows.length) { $("#winner").innerHTML = '<p class="empty">Aucun magasin à comparer.</p>'; $("#stores").innerHTML = ""; $("#moreStores").hidden = true; return; }
  const best = rows[0], pire = rows[rows.length - 1];
  const be = ENS[best.ens];
  const bestDrive = rows.find((r) => ENS[r.ens].drive);
  $("#winner").innerHTML = `
    <div class="kicker">Le moins cher pour ton panier</div>
    <div class="win">
      <span class="logo" style="background:${be.couleur}">${esc(be.sigle || be.nom.charAt(0))}</span>
      <div><div class="title">${esc(best.nom)}</div><div class="sub">${esc([best.adresse, dist(best)].filter(Boolean).join(" · "))}</div></div>
    </div>
    <div class="bigprice">${eur(best.panier)}</div>
    ${rows.length > 1 && pire.total - best.total >= 0.5 ? `<p class="save">Tu économises jusqu'à <b>${eur(pire.total - best.total)}</b> par rapport au plus cher (${esc(pire.nom)}).</p>` : ""}
    ${best.trajet ? `<p class="sub">+ trajet ≈ ${eur(best.trajet)} (déjà compté dans le classement)</p>` : ""}
    <button class="primary full big" type="button" data-pick="${best.id}">Choisir ce magasin →</button>
    ${bestDrive && bestDrive !== best ? `<p class="sub center">🚗 Tu préfères le drive ? Le moins cher : <button class="link" type="button" data-pick="${bestDrive.id}">${esc(bestDrive.nom)}</button> (+${eur(bestDrive.total - best.total)})</p>` : ""}`;
  $("#stores").innerHTML = rows.slice(0, nbAffiches).map((m, i) => {
    const e = ENS[m.ens]; const ecart = m.total - best.total;
    return `<li><button type="button" data-pick="${m.id}" class="store">
      <span class="rank">${i + 1}</span>
      <span class="logo" style="background:${e.couleur}">${esc(e.sigle || e.nom.charAt(0))}</span>
      <span class="info"><b>${esc(m.nom)}</b><small>${esc([dist(m), m.adresse].filter(Boolean).join(" · "))}</small>${badgeDrive(e)}</span>
      <span class="amt"><b>${eur(m.panier)}</b><small>${i === 0 ? "le moins cher" : "+" + eur(ecart) + (state.trajet ? " trajet compris" : "")}</small>${m.trajet ? `<small>trajet ${eur(m.trajet)}</small>` : ""}</span>
    </button></li>`;
  }).join("");
  $("#moreStores").hidden = rows.length <= nbAffiches;
  window._rows = rows;
}

// ---------- Magasin choisi ----------
function renderStore() {
  const m = state.magasin; if (!m) return go("compare");
  const e = ENS[m.ens]; const pa = panier(m.ens);
  $("#storeHead").innerHTML = `
    <div class="win"><span class="logo" style="background:${e.couleur}">${esc(e.sigle || e.nom.charAt(0))}</span>
    <div><div class="title">${esc(m.nom)}</div><div class="sub">${esc([m.adresse, dist(m)].filter(Boolean).join(" · "))}</div></div></div>
    <div class="bigprice">${eur(pa.total)}</div>
    <p class="sub">${pa.connus} article${pa.connus > 1 ? "s" : ""}${pa.perso ? ` · dont ${pa.perso} à ton prix` : " · prix estimés"}</p>
    ${m.lat ? `<div class="nav"><a class="ghost" href="https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lon}" target="_blank" rel="noopener">🗺️ Maps</a><a class="ghost" href="https://waze.com/ul?ll=${m.lat},${m.lon}&navigate=yes" target="_blank" rel="noopener">🚗 Waze</a></div>` : ""}`;
  $("#choices").innerHTML = `
    <button type="button" class="choice" data-go="drive">
      <span class="cico">🚗</span><b>Faire un drive</b>
      <small>${e.drive ? "Ta liste prête à mettre dans ton panier en ligne" : `Pas de drive chez ${esc(e.nom)}`}</small>
    </button>
    <button type="button" class="choice main" data-go="shop">
      <span class="cico">📝</span><b>Aller en magasin</b>
      <small>Ta liste dans l'ordre des rayons, à cocher</small>
    </button>`;
  $("#detail").innerHTML = pa.lignes.map((l) => `
    <li><span class="nm">${esc(nomDe(l.it))} <small class="muted">× ${qtyTxt(l.it)}</small></span>
    ${l.pu == null ? '<span class="muted">—</span>' : `<button type="button" class="price ${l.perso ? "perso" : ""}" data-edit="${l.it.id}">${eur(l.tot)}${l.perso ? " ✓" : ""}</button>`}</li>`).join("");
}

// ---------- Drive ----------
function lienRecherche(e, it) {
  const terme = nomDe(it).replace(/\s*\(.*?\)/g, "");
  if (e.recherche) return e.recherche + encodeURIComponent(terme);
  return null;
}
function renderDrive() {
  const m = state.magasin; let e = ENS[m.ens];
  let alt = "";
  if (!e.drive) {
    const rows = (window._rows || classement()).filter((r) => ENS[r.ens].drive);
    const d = rows[0];
    $("#driveHead").innerHTML = `<h2>Pas de drive chez ${esc(e.nom)}</h2>
      <p>${d ? `Le drive le moins cher pour ton panier près de chez toi est <b>${esc(d.nom)}</b> : <b>${eur(d.panier)}</b> (+${eur(d.panier - panier(m.ens).total)}).` : "Aucun drive trouvé autour de toi."}</p>
      ${d ? `<button class="primary full" type="button" data-pick="${d.id}" data-then="drive">Faire mon drive chez ${esc(ENS[d.ens].nom)}</button>` : ""}
      <button class="ghost full" type="button" data-go="shop">📝 Aller plutôt chez ${esc(e.nom)} avec ma liste</button>`;
    $("#driveItems").innerHTML = ""; return;
  }
  const items = state.liste;
  const faits = items.filter((it) => it.drive).length;
  $("#driveHead").innerHTML = `<h2>🚗 Ton drive ${esc(e.nom)}</h2>
    <ol class="steps">
      <li><a class="primary btnlink" href="${e.drive}" target="_blank" rel="noopener">Ouvrir le site ${esc(e.nom)}</a><br><small>Connecte-toi et choisis ton magasin de retrait${m.adresse ? ` (${esc(m.adresse)})` : ""}.</small></li>
      <li>Pour chaque article, touche <b>🔎 Trouver</b> : la recherche s'ouvre directement, ajoute-le au panier puis coche-le ici.</li>
      <li>Valide ta commande sur le site et choisis ton créneau.</li>
    </ol>
    <p class="sub">Les sites des enseignes ne permettent pas à une autre appli de remplir le panier à ta place : Caddie Malin te prépare tout pour que ça aille vite.</p>
    <div class="progress"><span style="width:${items.length ? (faits / items.length) * 100 : 0}%"></span></div>
    <p class="sub">${faits} / ${items.length} dans le panier</p>
    <button class="ghost full" type="button" data-copy="1">📋 Copier ma liste</button>`;
  $("#driveItems").innerHTML = items.map((it) => {
    const l = lienRecherche(e, it);
    return `<li class="${it.drive ? "done" : ""}" data-k="${it.key}">
      <label><input type="checkbox" data-drive="${it.key}" ${it.drive ? "checked" : ""}><span>${esc(nomDe(it))} <b>× ${qtyTxt(it)}</b></span></label>
      ${l ? `<a class="ghost small" href="${l}" target="_blank" rel="noopener">🔎 Trouver</a>` : ""}
    </li>`;
  }).join("");
}

// ---------- En magasin ----------
let wake = null;
async function garderEcran() { try { wake = await navigator.wakeLock?.request("screen"); } catch { /* pas grave */ } }
function groupes() {
  const g = {};
  for (const it of state.liste) (g[rayonDe(it)] ||= []).push(it);
  return RAYONS.filter((r) => g[r.id]).map((r) => ({ r, items: g[r.id] }));
}
function renderShop() {
  const m = state.magasin; const e = ENS[m.ens];
  const n = state.liste.length, faits = state.liste.filter((it) => it.coche).length;
  const reste = state.liste.filter((it) => !it.coche && it.id).reduce((s, it) => s + prix(it.id, e.id).v * it.q, 0);
  $("#shopHead").innerHTML = `
    <div class="row-between"><div><h2>📝 ${esc(m.nom)}</h2><p class="sub">Dans l'ordre des rayons · le frais et le surgelé à la fin</p></div>
    <button class="ghost" type="button" data-share="1">📤 Envoyer</button></div>
    <div class="progress"><span style="width:${n ? (faits / n) * 100 : 0}%"></span></div>
    <div class="row-between"><span class="sub">${faits} / ${n} pris</span><span class="sub">Reste ≈ <b>${eur(reste)}</b></span></div>`;
  $("#shopList").innerHTML = groupes().map(({ r, items }) => {
    const ok = items.every((it) => it.coche);
    return `<section class="card rayon ${ok ? "done" : ""}"><h3>${r.ico} ${esc(r.nom)} ${ok ? "✓" : ""}</h3><ul class="checklist">
      ${items.map((it) => `<li class="${it.coche ? "done" : ""}"><label><input type="checkbox" data-coche="${it.key}" ${it.coche ? "checked" : ""}>
        <span>${esc(nomDe(it))} <b>× ${qtyTxt(it)}</b></span></label>
        ${it.id ? `<button type="button" class="price small ${state.prixPerso[e.id + "|" + it.id] != null ? "perso" : ""}" data-edit="${it.id}">${eur(prix(it.id, e.id).v)}</button>` : ""}</li>`).join("")}
    </ul></section>`;
  }).join("");
}
function texteListe(titre) {
  const lignes = [titre, ""];
  for (const { r, items } of groupes()) {
    lignes.push(`${r.ico} ${r.nom.toUpperCase()}`);
    for (const it of items) lignes.push(`☐ ${nomDe(it)} × ${qtyTxt(it)}`);
    lignes.push("");
  }
  return lignes.join("\n").trim();
}
async function partagerListe() {
  const m = state.magasin;
  const txt = texteListe(`🛒 Mes courses${m ? " – " + m.nom : ""}`);
  if (navigator.share) { try { await navigator.share({ title: "Ma liste de courses", text: txt }); return; } catch (e) { if (e.name === "AbortError") return; } }
  await copier(txt);
}
async function copier(txt) {
  try { await navigator.clipboard.writeText(txt); toast("Liste copiée ✓"); }
  catch { prompt("Copie ta liste :", txt); }
}

// ---------- Prix perso ----------
let prixEdite = null;
function ouvrirPrix(prodId) {
  const e = ENS[state.magasin.ens]; const p = PRODUIT[prodId];
  prixEdite = prodId;
  $("#priceTitle").textContent = p.nom;
  $("#priceSub").textContent = `Prix ${p.unite === "kg" ? "au kg" : "à l'unité"} chez ${e.nom}. Actuellement : ${eur(prix(prodId, e.id).v)}${prix(prodId, e.id).perso ? " (ton prix)" : " (estimé)"}.`;
  $("#priceIn").value = "";
  $("#priceReset").hidden = !prix(prodId, e.id).perso;
  $("#priceDlg").showModal(); $("#priceIn").focus();
}

// ---------- Navigation ----------
const VUES = ["liste", "menus", "compare", "store", "drive", "shop"];
function go(v) {
  state.vue = v; save();
  for (const x of VUES) $("#v-" + x).hidden = x !== v;
  $("#tabs").hidden = !["liste", "menus"].includes(v);
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.go === v));
  window.scrollTo(0, 0);
  if (v === "liste") renderListe();
  if (v === "menus") renderMenus();
  if (v === "compare") renderCompare();
  if (v === "store") renderStore();
  if (v === "drive") renderDrive();
  if (v === "shop") { renderShop(); garderEcran(); }
  else if (wake) { wake.release().catch(() => {}); wake = null; }
  if (history.state?.v !== v) history.pushState({ v }, "");
}
window.addEventListener("popstate", (e) => { if (e.state?.v) { state.vue = e.state.v; go(e.state.v); } });
function choisirMagasin(id, puis) {
  const m = (window._rows || classement()).find((r) => r.id === id); if (!m) return;
  state.magasin = { id: m.id, ens: m.ens, nom: m.nom, adresse: m.adresse, d: m.d, lat: m.lat, lon: m.lon };
  save(); go(puis || "store");
}

// ---------- Événements ----------
$("#q").addEventListener("input", renderSugg);
$("#q").addEventListener("keydown", (ev) => {
  if (ev.key === "Enter") { ev.preventDefault(); const b = $("#sugg button"); if (b && !$("#sugg").hidden) choisirSugg(b); }
  if (ev.key === "Escape") $("#sugg").hidden = true;
});
$("#sugg").addEventListener("click", (ev) => { const b = ev.target.closest("button"); if (b) choisirSugg(b); });
$("#quick").addEventListener("click", (ev) => { const b = ev.target.closest("[data-id]"); if (b) { ajouter(b.dataset.id); toast(`${PRODUIT[b.dataset.id].nom} ajouté`); } });
$("#items").addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-a]"); if (!b) return;
  const it = state.liste.find((x) => x.key === b.closest("li").dataset.k);
  const s = pas(it);
  it.q = Math.round((it.q + (b.dataset.a === "plus" ? s : -s)) * 100) / 100;
  if (it.qa) it.qa = Math.min(it.qa, Math.max(it.q, 0));
  if (it.q <= 0) { state.liste = state.liste.filter((x) => x !== it); toast(`${nomDe(it)} retiré`); }
  save(); renderListe();
});
$("#clearBtn").addEventListener("click", () => { if (confirm("Effacer toute la liste ?")) { state.liste = []; state.menu.sig = null; save(); renderListe(); } });
$("#pasteBtn").addEventListener("click", () => { $("#pasteTxt").value = ""; $("#pasteDlg").showModal(); });
$("#pasteOk").addEventListener("click", () => {
  let n = 0;
  for (const ligne of $("#pasteTxt").value.split(/\n|;/)) {
    const l = lireLigne(ligne); if (!l || !l.texte) continue;
    const p = chercher(l.texte, 1)[0];
    ajouter(p ? p.id : null, l.q, p ? null : l.texte.charAt(0).toUpperCase() + l.texte.slice(1)); n++;
  }
  $("#pasteDlg").close(); if (n) toast(`${n} article${n > 1 ? "s" : ""} ajouté${n > 1 ? "s" : ""} – vérifie la liste`);
});
$("#goCompare").addEventListener("click", () => { nbAffiches = 8; go("compare"); });
$("#placeBtn").addEventListener("click", () => { $("#placeMsg").textContent = ""; $("#placeDlg").showModal(); });
$("#cityQ").addEventListener("input", (ev) => { clearTimeout(cityTimer); cityTimer = setTimeout(() => chercherVille(ev.target.value), 250); });
$("#cities").addEventListener("click", (ev) => {
  const b = ev.target.closest("button"); if (!b) return;
  setPlace({ nom: b.dataset.nom, lat: +b.dataset.lat, lon: +b.dataset.lon });
});
$("#gps").addEventListener("click", () => {
  if (!navigator.geolocation) { $("#placeMsg").textContent = "Localisation non disponible sur cet appareil."; return; }
  $("#placeMsg").textContent = "Localisation en cours…";
  navigator.geolocation.getCurrentPosition(async (p) => {
    const lat = p.coords.latitude, lon = p.coords.longitude; let nom = "Ma position";
    try { const r = await fetch(`${GEO}?lat=${lat}&lon=${lon}&fields=nom`); const v = await r.json(); if (v[0]) nom = v[0].nom; } catch { /* garde « Ma position » */ }
    setPlace({ nom, lat, lon });
  }, () => { $("#placeMsg").textContent = "Position refusée : tape ta ville."; }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
});
$("#radius").addEventListener("click", (ev) => { const b = ev.target.closest("button"); if (!b) return; state.rayon = +b.dataset.r; save(); renderCompare(); });
$("#trajet").addEventListener("change", (ev) => { state.trajet = ev.target.checked; save(); renderCompare(); });
$("#moreStores").addEventListener("click", () => { nbAffiches += 10; renderCompare(); });

document.addEventListener("click", (ev) => {
  const t = ev.target.closest("[data-pick],[data-go],[data-edit],[data-copy],[data-share],[data-open]"); if (!t) return;
  if (t.dataset.pick) choisirMagasin(t.dataset.pick, t.dataset.then);
  else if (t.dataset.go) go(t.dataset.go);
  else if (t.dataset.edit) ouvrirPrix(t.dataset.edit);
  else if (t.dataset.copy) copier(texteListe(`🛒 Mes courses – ${state.magasin.nom}`));
  else if (t.dataset.share) partagerListe();
  else if (t.dataset.open === "place") $("#placeBtn").click();
});
document.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t.dataset.coche) {
    const it = state.liste.find((x) => x.key === t.dataset.coche); it.coche = t.checked; save(); renderShop();
    if (state.liste.every((x) => x.coche)) toast("Tout est dans le caddie 🎉");
  }
  if (t.dataset.drive) { const it = state.liste.find((x) => x.key === t.dataset.drive); it.drive = t.checked; save(); renderDrive(); }
});
$("#priceOk").addEventListener("click", () => {
  const v = parseFloat($("#priceIn").value.replace(",", ".").replace(/[^\d.]/g, ""));
  if (!(v > 0 && v < 1000)) { $("#priceIn").focus(); return; }
  state.prixPerso[`${state.magasin.ens}|${prixEdite}`] = Math.round(v * 100) / 100; save();
  $("#priceDlg").close(); toast("Prix enregistré ✓"); go(state.vue);
});
$("#priceReset").addEventListener("click", () => {
  delete state.prixPerso[`${state.magasin.ens}|${prixEdite}`]; save(); $("#priceDlg").close(); go(state.vue);
});
$("#finish").addEventListener("click", () => {
  const faits = state.liste.filter((it) => it.coche).length;
  const restants = state.liste.length - faits;
  if (restants && !confirm(`Il reste ${restants} article${restants > 1 ? "s" : ""} non coché${restants > 1 ? "s" : ""}. Terminer quand même ?`)) return;
  const garder = confirm("Courses terminées 👍\n\nGarder ta liste pour la prochaine fois ?\n(OK = garder · Annuler = repartir d'une liste vide)");
  if (garder) state.liste.forEach((it) => { it.coche = false; it.drive = false; });
  else { state.liste = []; state.menu.sig = null; }
  save(); go("liste");
});
async function partagerAppli() {
  const d = { title: "Caddie Malin", text: "🛒 Caddie Malin : tu mets ta liste de courses, l'appli te dit quel magasin près de chez toi est le moins cher. Avec les menus de la semaine. Gratuit :", url: location.origin + location.pathname };
  if (navigator.share) { try { await navigator.share(d); } catch { /* annulé */ } } else copier(`${d.text} ${d.url}`);
}
$("#shareApp").addEventListener("click", partagerAppli);
$("#shareApp2").addEventListener("click", partagerAppli);

// ---------- Installation ----------
// Android/Chrome : vraie fenêtre d'installation. iPhone : Apple ne le permet pas, on montre les étapes Safari.
let installEvt = null;
const UA = navigator.userAgent;
const isIOS = /iPhone|iPad|iPod/i.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const inAppBrowser = /FBAN|FBAV|Instagram|Line\/|WhatsApp|Snapchat|GSA\//i.test(UA);
const isStandalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isMobile = isIOS || /Android/i.test(UA);
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; maybeShowInstallBanner(); });
window.addEventListener("appinstalled", () => { hideInstallBanner(); installe(); toast("✅ Appli installée !"); });
function installe() {
  $("#installBtn").hidden = true;
  $("#installHelp").textContent = "✅ L'appli est installée. Fais-en profiter tes proches :";
}
if (isStandalone) installe();
function installSteps() {
  const url = location.origin + location.pathname;
  if (inAppBrowser) return `<p>Tu as ouvert le lien depuis une autre appli (WhatsApp, Facebook…). Pour installer, il faut l'ouvrir dans ${isIOS ? "<b>Safari</b>" : "<b>Chrome</b>"} :</p>
    <ol class="steps"><li>Appuie sur <b>⋯</b> ou sur l'icône de partage, puis <b>« Ouvrir dans ${isIOS ? "Safari" : "le navigateur"} »</b>.</li>
    <li>Ou copie cette adresse et colle-la dans ${isIOS ? "Safari" : "Chrome"} : <code>${esc(url)}</code></li></ol>`;
  if (isIOS) return `<p>Sur iPhone, Apple ne permet pas l'installation en un clic. Ça prend 10 secondes :</p>
    <ol class="steps">
      <li>Appuie sur le bouton <b>⋯</b> en bas à droite de Safari<br><small>(sur un iPhone plus ancien : le bouton Partager <b>⬆️</b> en bas au milieu)</small></li>
      <li>Appuie sur <b>Partager</b> ⬆️ (si tu ne l'as pas déjà fait)</li>
      <li>Descends et appuie sur <b>« Sur l'écran d'accueil »</b> ➕<br><small>Pas dans la liste ? Tout en bas, « Modifier les actions », puis le <b>+</b> vert à côté de « Sur l'écran d'accueil ».</small></li>
      <li>Appuie sur <b>Ajouter</b> en haut à droite. L'icône verte apparaît sur ton écran 🎉</li>
    </ol>
    <p class="sub">Si tu n'es pas dans Safari, ouvre d'abord <code>${esc(url)}</code> dans Safari.</p>`;
  return `<ol class="steps">
      <li>Appuie sur le menu <b>⋮</b> en haut à droite de Chrome</li>
      <li>Appuie sur <b>« Installer l'application »</b> ou <b>« Ajouter à l'écran d'accueil »</b></li>
      <li>Confirme : l'icône verte apparaît sur ton écran 🎉</li>
    </ol>
    <p class="sub">Navigateur Samsung : menu ≡ → « Ajouter la page à » → « Écran d'accueil ».</p>`;
}
async function installer() {
  hideInstallBanner();
  if (installEvt) {
    installEvt.prompt();
    const r = await installEvt.userChoice.catch(() => null);
    installEvt = null;
    if (r?.outcome === "accepted") return;
  }
  $("#sheetBody").innerHTML = installSteps();
  $("#installSheet").showModal();
}
function hideInstallBanner() { $("#installBanner").hidden = true; document.body.classList.remove("has-ibanner"); }
// Proposé automatiquement à l'ouverture (sauf si déjà installée ou « Plus tard » il y a moins de 3 jours).
function maybeShowInstallBanner() {
  if (isStandalone || !(isMobile || installEvt)) return;
  if (Date.now() - Number(localStorage.getItem("pm-installLater") || 0) < 3 * 864e5) return;
  if (document.querySelector("dialog[open]") || state.vue === "shop") { setTimeout(maybeShowInstallBanner, 2000); return; }
  $("#ibText").textContent = isIOS
    ? "Ajoute Caddie Malin à ton écran d'accueil : ta liste en 1 clic, même sans réseau au fond du magasin."
    : "Installe Caddie Malin sur ton téléphone : ta liste en 1 clic, même sans réseau au fond du magasin.";
  $("#installBanner").hidden = false;
  document.body.classList.add("has-ibanner");
}
$("#installBtn").addEventListener("click", installer);
$("#ibInstall").addEventListener("click", installer);
$("#ibLater").addEventListener("click", () => { try { localStorage.setItem("pm-installLater", String(Date.now())); } catch { /* ignore */ } hideInstallBanner(); });
$("#sheetClose").addEventListener("click", () => $("#installSheet").close());
setTimeout(maybeShowInstallBanner, 2500);

// ---------- Menus de la semaine ----------
const JOURS = [["lun", "Lundi"], ["mar", "Mardi"], ["mer", "Mercredi"], ["jeu", "Jeudi"], ["ven", "Vendredi"], ["sam", "Samedi"], ["dim", "Dimanche"]];
const REPAS = [["midi", "☀️ Midi"], ["soir", "🌙 Soir"]];
const RESTES = "restes";
const M = () => state.menu;
const slotsActifs = () => JOURS.flatMap(([j]) => REPAS.filter(([r]) => M()[r]).map(([r]) => `${j}-${r}`));
const persDe = (slot) => (slot && slot.p) || M().pers;
const nombre = (n) => String(Math.round(n * 10) / 10).replace(".", ",");

// Coût estimé d'une recette (prix moyen, sans le placard)
function coutRecette(r, pers) {
  return r.ing.reduce((s, i) => s + (i.placard ? 0 : PRODUIT[i.id].prix * (i.qte / i.parArticle)), 0) * pers / 4;
}
// Quantité lisible d'un ingrédient pour N personnes
function quantiteTxt(i, pers) {
  let v = i.qte * pers / 4, u = i.unite;
  if (u === "g" && v >= 1000) { v = Math.round(v / 100) / 10; u = "kg"; }
  else if (u === "g" || u === "cl") v = v >= 50 ? Math.round(v / 10) * 10 : Math.max(5, Math.round(v / 5) * 5);
  else v = Math.max(0.5, Math.round(v * 2) / 2);
  return `${nombre(v)}${u ? " " + u : ""}`;
}
// Ce qu'il faut acheter pour toute la semaine : on additionne d'abord, on arrondit ensuite
// (3 recettes avec un peu de beurre = 1 seule plaquette).
function besoinsMenu() {
  const brut = {}, pour = {};
  for (const k of slotsActifs()) {
    const s = M().slots[k]; if (!s || s.r === RESTES) continue;
    const r = RECETTE[s.r]; if (!r) continue;
    for (const i of r.ing) {
      if (i.placard && M().placard) continue;
      brut[i.id] = (brut[i.id] || 0) + (i.qte / i.parArticle) * persDe(s) / 4;
      (pour[i.id] ||= new Set()).add(r.nom);
    }
  }
  const besoins = {};
  for (const [id, x] of Object.entries(brut)) {
    besoins[id] = PRODUIT[id].unite === "kg" ? Math.max(0.1, Math.ceil(x * 10 - 0.01) / 10) : Math.max(1, Math.ceil(x - 0.05));
  }
  return { besoins, pour };
}
const signature = (b) => JSON.stringify(Object.entries(b).sort());

function syncMenu() {
  const { besoins } = besoinsMenu();
  // retire d'abord ce que le menu avait ajouté la dernière fois…
  for (const it of state.liste) if (it.qa) { it.q = Math.round((it.q - it.qa) * 100) / 100; it.qa = 0; }
  state.liste = state.liste.filter((it) => it.q > 0);
  // …puis ajoute les quantités du menu actuel (fusionnées avec ce qui est déjà dans la liste)
  let n = 0;
  for (const [id, q] of Object.entries(besoins)) {
    const ex = state.liste.find((it) => it.id === id);
    if (ex) { ex.q = Math.round((ex.q + q) * 100) / 100; ex.qa = q; }
    else state.liste.push({ key: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), id, q, qa: q, coche: false });
    n++;
  }
  M().sig = signature(besoins); save();
  toast(n ? `${n} ingrédient${n > 1 ? "s" : ""} dans ta liste ✓` : "Liste mise à jour");
  go("liste");
}
function renderMenuHint() {
  const nb = slotsActifs().filter((k) => M().slots[k]).length;
  const h = $("#menuHint");
  const aJour = signature(besoinsMenu().besoins) === M().sig;
  if (!nb) { h.innerHTML = "🍽️ <b>Pas d'idée ?</b> Choisis tes plats de la semaine : les ingrédients s'ajoutent tout seuls. →"; h.hidden = false; h.classList.remove("warn"); }
  else if (!aJour) { h.innerHTML = "🍽️ <b>Ton menu a changé</b> : mets à jour ta liste →"; h.hidden = false; h.classList.add("warn"); }
  else h.hidden = true;
}

function renderMenus() {
  const m = M();
  $("#persN").textContent = m.pers;
  document.querySelectorAll("[data-meal]").forEach((b) => b.classList.toggle("on", !!m[b.dataset.meal]));
  $("#placard").checked = m.placard;
  $("#week").innerHTML = JOURS.map(([j, nom]) => `
    <section class="card day"><h3>${nom}</h3>
      ${REPAS.filter(([r]) => m[r]).map(([r, lab]) => {
        const k = `${j}-${r}`, s = m.slots[k];
        if (!s) return `<button type="button" class="slot empty" data-slot="${k}"><span class="when">${lab}</span><span class="what">+ Choisir un plat</span></button>`;
        if (s.r === RESTES) return `<button type="button" class="slot" data-slot="${k}"><span class="when">${lab}</span><span class="what">🥡 Restes / déjà prévu</span></button>`;
        const rc = RECETTE[s.r]; if (!rc) return "";
        return `<button type="button" class="slot full" data-slot="${k}"><span class="when">${lab}</span>
          <span class="what">${rc.ico} ${esc(rc.nom)}<small>${persDe(s)} pers. · ⏱ ${rc.min} min · ≈ ${eur(coutRecette(rc, persDe(s)))}</small></span><span class="chev">›</span></button>`;
      }).join("")}
    </section>`).join("") || "";
  if (!m.midi && !m.soir) $("#week").innerHTML = '<p class="empty">Choisis au moins un repas (midi ou soir).</p>';
  const plats = slotsActifs().map((k) => m.slots[k]).filter((s) => s && s.r !== RESTES && RECETTE[s.r]);
  const cout = plats.reduce((t, s) => t + coutRecette(RECETTE[s.r], persDe(s)), 0);
  const { besoins } = besoinsMenu(); const nb = Object.keys(besoins).length;
  const aJour = signature(besoins) === m.sig;
  $("#menuSum").innerHTML = plats.length ? `
    <div class="row-between"><b>${plats.length} plat${plats.length > 1 ? "s" : ""} · ${nb} ingrédient${nb > 1 ? "s" : ""}</b><span class="sub">≈ ${eur(cout)} · ${eur(cout / Math.max(1, plats.reduce((t, s) => t + persDe(s), 0)))}/repas</span></div>
    <button type="button" class="primary full" id="syncMenu" ${aJour ? "disabled" : ""}>${aJour ? "✓ Ta liste est à jour" : "🛒 Mettre les ingrédients dans ma liste"}</button>`
    : '<p class="empty">Touche « + Choisir un plat » ou « 🎲 Compléter la semaine ».</p>';
  $("#shareMenu").hidden = !plats.length;
}

// Choix d'une recette
let slotEdite = null, filtre = "";
function ouvrirChoix(k) {
  slotEdite = k; filtre = ""; $("#recQ").value = "";
  const [j, r] = k.split("-");
  $("#recDlgTitle").textContent = `${JOURS.find((x) => x[0] === j)[1]} ${r === "midi" ? "midi" : "soir"}`;
  renderChoix(); $("#recDlg").showModal();
}
function renderChoix() {
  const q = norm($("#recQ").value);
  $("#recFilters").innerHTML = FILTRES.map((f) => `<button type="button" class="chip ${f.id === filtre ? "on" : ""}" data-filtre="${f.id}">${f.nom}</button>`).join("");
  const dejaPris = new Set(Object.values(M().slots).map((s) => s.r));
  const liste = RECETTES.filter((r) => (!filtre || r.tags.includes(filtre)) && (!q || norm(r.nom).includes(q) || r.ing.some((i) => norm(PRODUIT[i.id].nom).includes(q))));
  $("#recList").innerHTML = (q || filtre ? "" : `<li><button type="button" data-rec="${RESTES}"><span class="ri">🥡</span><span class="rn">Restes / déjà prévu<small>rien à acheter</small></span></button></li>`)
    + liste.map((r) => `<li><button type="button" data-rec="${r.id}"><span class="ri">${r.ico}</span>
      <span class="rn">${esc(r.nom)}${dejaPris.has(r.id) ? ' <span class="tag">déjà au menu</span>' : ""}<small>⏱ ${r.min} min · ≈ ${eur(coutRecette(r, 1))}/pers.</small></span></button></li>`).join("")
    + (liste.length ? "" : '<li class="empty">Aucune recette trouvée.</li>');
}
function choisirRecette(id) {
  const ancien = M().slots[slotEdite];
  M().slots[slotEdite] = { r: id, p: ancien && ancien.p || null };
  save(); $("#recDlg").close(); renderMenus();
}

// Fiche recette
function ouvrirFiche(k) {
  const s = M().slots[k]; if (!s) return ouvrirChoix(k);
  slotEdite = k;
  if (s.r === RESTES) return ouvrirChoix(k);
  const r = RECETTE[s.r], p = persDe(s);
  $("#recInfoBody").innerHTML = `
    <h2>${r.ico} ${esc(r.nom)}</h2>
    <p class="sub">⏱ ${r.min} min · ≈ ${eur(coutRecette(r, p))} pour ${p} pers.</p>
    <div class="row-between setting"><span>👥 Pour ce repas</span>
      <span class="qty"><button type="button" class="qb" data-sp="-1" aria-label="Moins">−</button><b>${p} pers.</b><button type="button" class="qb" data-sp="1" aria-label="Plus">+</button></span></div>
    <h3>Ingrédients</h3>
    <ul class="ing">${r.ing.map((i) => `<li><b>${quantiteTxt(i, p)}</b> ${esc(PRODUIT[i.id].nom.replace(/\s*\(.*?\)/g, ""))}${i.placard ? ' <small class="muted">(placard)</small>' : ""}</li>`).join("")}</ul>
    <h3>Préparation</h3>
    <ol class="etapes">${r.etapes.map((e) => `<li>${esc(e)}</li>`).join("")}</ol>
    <div class="row2"><button type="button" class="ghost" data-fiche="changer">🔄 Changer</button><button type="button" class="ghost" data-fiche="retirer">🗑️ Retirer</button></div>
    <button class="primary full" value="cancel">OK</button>`;
  if (!$("#recInfo").open) $("#recInfo").showModal();
}

function completerSemaine() {
  const m = M(), pris = new Set(Object.values(m.slots).map((s) => s.r));
  const melange = (a) => a.map((x) => [Math.random(), x]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
  let n = 0;
  for (const k of slotsActifs()) {
    if (m.slots[k]) continue;
    const semaine = !k.startsWith("sam") && !k.startsWith("dim") && k.endsWith("midi");
    let choix = melange(RECETTES.filter((r) => !pris.has(r.id)));
    if (semaine) choix = [...choix.filter((r) => r.tags.includes("rapide")), ...choix.filter((r) => !r.tags.includes("rapide"))];
    // un peu de variété : au moins un poisson et un plat végé dans la semaine
    const a = (t) => [...pris].some((id) => RECETTE[id]?.tags.includes(t));
    if (!a("poisson")) choix = [...choix.filter((r) => r.tags.includes("poisson")), ...choix.filter((r) => !r.tags.includes("poisson"))];
    else if (!a("vege")) choix = [...choix.filter((r) => r.tags.includes("vege")), ...choix.filter((r) => !r.tags.includes("vege"))];
    const r = choix[0] || melange(RECETTES)[0];
    m.slots[k] = { r: r.id, p: null }; pris.add(r.id); n++;
  }
  save(); renderMenus();
  toast(n ? `${n} plat${n > 1 ? "s" : ""} ajouté${n > 1 ? "s" : ""} : touche un plat pour le changer` : "Ta semaine est déjà complète");
}
function texteMenu() {
  const m = M(), l = [`🍽️ Menus de la semaine (${m.pers} pers.)`, ""];
  for (const [j, nom] of JOURS) {
    const rs = REPAS.filter(([r]) => m[r]).map(([r, lab]) => {
      const s = m.slots[`${j}-${r}`]; if (!s) return null;
      return `${lab} : ${s.r === RESTES ? "restes" : RECETTE[s.r]?.nom}`;
    }).filter(Boolean);
    if (rs.length) l.push(`${nom}`, ...rs.map((x) => "  " + x), "");
  }
  return l.join("\n").trim();
}

document.addEventListener("click", (ev) => {
  const t = ev.target.closest("[data-slot],[data-pers],[data-meal],[data-filtre],[data-rec],[data-sp],[data-fiche],#syncMenu,#shareMenu,#autoFill,#clearMenu");
  if (!t) return;
  const m = M();
  if (t.dataset.slot) ouvrirFiche(t.dataset.slot);
  else if (t.dataset.pers) { m.pers = Math.min(20, Math.max(1, m.pers + +t.dataset.pers)); save(); renderMenus(); }
  else if (t.dataset.meal) {
    const r = t.dataset.meal; m[r] = !m[r]; save(); renderMenus();
  }
  else if (t.dataset.filtre !== undefined) { filtre = t.dataset.filtre; renderChoix(); }
  else if (t.dataset.rec) choisirRecette(t.dataset.rec);
  else if (t.dataset.sp) {
    const s = m.slots[slotEdite]; s.p = Math.min(30, Math.max(1, persDe(s) + +t.dataset.sp)); if (s.p === m.pers) s.p = null;
    save(); ouvrirFiche(slotEdite); renderMenus();
  }
  else if (t.dataset.fiche === "changer") { ev.preventDefault(); $("#recInfo").close(); ouvrirChoix(slotEdite); }
  else if (t.dataset.fiche === "retirer") { ev.preventDefault(); delete m.slots[slotEdite]; save(); $("#recInfo").close(); renderMenus(); }
  else if (t.id === "syncMenu") syncMenu();
  else if (t.id === "shareMenu") {
    const txt = texteMenu();
    if (navigator.share) navigator.share({ title: "Menus de la semaine", text: txt }).catch(() => {}); else copier(txt);
  }
  else if (t.id === "autoFill") completerSemaine();
  else if (t.id === "clearMenu") { if (confirm("Vider tous les plats de la semaine ?")) { m.slots = {}; save(); renderMenus(); } }
});
$("#recQ").addEventListener("input", renderChoix);
$("#placard").addEventListener("change", (ev) => { M().placard = ev.target.checked; save(); renderMenus(); });

// ---------- Réseaux sociaux (réglés dans ../reseaux.js) ----------
{
  const ig = lienInstagram(RESEAUX.instagram), tt = lienTiktok(RESEAUX.tiktok);
  $("#suivreBtns").innerHTML = (ig ? `<a class="primary" href="${ig}" target="_blank" rel="noopener">📸 Instagram</a>` : "")
    + (tt ? `<a class="primary" href="${tt}" target="_blank" rel="noopener">🎵 TikTok</a>` : "");
  if (ig || tt) $("#suivreTxt").textContent = "D'autres applis gratuites arrivent. Suis-nous pour être prévenu :";
}

// ---------- Démarrage ----------
renderPlace();
history.replaceState({ v: state.vue }, "");
go(VUES.includes(state.vue) && (["liste", "menus", "compare"].includes(state.vue) || state.magasin) ? state.vue : "liste");
if (!state.place) setTimeout(() => $("#placeDlg").showModal(), 400);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
