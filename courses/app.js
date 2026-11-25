import { RAYONS, PRODUITS, PRODUIT, POPULAIRES, ENSEIGNES } from "./catalog.js";

const GEO = "https://geo.api.gouv.fr/communes";
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const EUR_KM = 0.15;
const KEY = "panier-malin";
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
}, JSON.parse(localStorage.getItem(KEY) || "{}"));
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
const pas = (it) => (it.id && PRODUIT[it.id].unite === "kg" ? 0.5 : 1);

function renderListe() {
  const ul = $("#items");
  ul.innerHTML = state.liste.map((it) => `
    <li data-k="${it.key}">
      <span class="ico">${RAY[rayonDe(it)].ico}</span>
      <span class="nm">${esc(nomDe(it))}${it.id ? "" : ' <small class="muted">(prix non comparé)</small>'}</span>
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
  renderQuick();
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
    <p class="sub">Les sites des enseignes ne permettent pas à une autre appli de remplir le panier à ta place : Panier Malin te prépare tout pour que ça aille vite.</p>
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
const VUES = ["liste", "compare", "store", "drive", "shop"];
function go(v) {
  state.vue = v; save();
  for (const x of VUES) $("#v-" + x).hidden = x !== v;
  window.scrollTo(0, 0);
  if (v === "liste") renderListe();
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
  if (it.q <= 0) { state.liste = state.liste.filter((x) => x !== it); toast(`${nomDe(it)} retiré`); }
  save(); renderListe();
});
$("#clearBtn").addEventListener("click", () => { if (confirm("Effacer toute la liste ?")) { state.liste = []; save(); renderListe(); } });
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
  else state.liste = [];
  save(); go("liste");
});
$("#shareApp").addEventListener("click", async () => {
  const d = { title: "Panier Malin", text: "Trouve le magasin le moins cher pour tes courses 🛒", url: location.href.split("#")[0] };
  if (navigator.share) { try { await navigator.share(d); } catch { /* annulé */ } } else copier(d.url);
});

// ---------- Démarrage ----------
renderPlace();
history.replaceState({ v: state.vue }, "");
go(VUES.includes(state.vue) && (state.vue === "liste" || state.vue === "compare" || state.magasin) ? state.vue : "liste");
if (!state.place) setTimeout(() => $("#placeDlg").showModal(), 400);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
