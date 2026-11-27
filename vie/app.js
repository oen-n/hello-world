// ===== Vie Maline : l'application =====
import {
  today, addDays, isoDate, toMin, toHHMM, nowMin, jourLong, jourCourt, fmtH, JOURS_COURTS,
  lireTache, OBJECTIFS, habitudesDepuisObjectifs, serie, genererPlan, dureeSommeil, minutesSommeil,
  lireRecit, conseilDuJour, analyser, ics,
} from "./core.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// ---------- Données (tout reste dans le navigateur) ----------
const KEY = "vie-maline-v1";
const VIDE = { profile: null, tasks: [], days: {}, habits: [], chat: [], chatApi: [], settings: { apiKey: "", raccourcis: false } };
let S = charger();
function charger() {
  try { return { ...structuredClone(VIDE), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return structuredClone(VIDE); }
}
function sauver() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast("⚠️ Mémoire du téléphone pleine : sauvegarde impossible."); } }
const jourData = (iso) => (S.days[iso] ||= { blocs: {}, habits: {}, bilan: {}, focusMin: 0 });

// ---------- Petits outils d'interface ----------
let toastT;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3200);
}
function telecharger(nom, contenu, type) {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nom });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
// mini-mise en forme sûre pour les réponses du coach : **gras**, listes, retours à la ligne
function md(txt) {
  return esc(txt)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/^#{1,3}\s*(.+)$/gm, "<b>$1</b>")
    .replace(/^\s*[-•*]\s+(.+)$/gm, "<span class=\"li\">• $1</span>")
    .replace(/<\/span>\n/g, "</span>")
    .replace(/\n/g, "<br>");
}

// ---------- Navigation ----------
const ONGLETS = ["jour", "taches", "focus", "coach", "moi"];
function montrer(vue) {
  $$(".view").forEach((v) => (v.hidden = v.id !== `v-${vue}`));
  $$("#tabbar button").forEach((b) => b.classList.toggle("on", b.dataset.tab === vue));
  $("#tabbar").hidden = !S.profile || vue === "bienvenue" || (vue === "profil" && !S.profile);
  window.scrollTo(0, 0);
  ({ jour: rendreJour, taches: rendreTaches, focus: rendreFocus, coach: rendreCoach, moi: rendreMoi, profil: remplirProfil }[vue] || (() => {}))();
}
function router() {
  const h = location.hash.slice(1);
  if (!S.profile) return montrer(h === "profil" ? "profil" : "bienvenue");
  montrer(ONGLETS.includes(h) || h === "profil" ? h : "jour");
}
$$("#tabbar button").forEach((b) => b.addEventListener("click", () => { location.hash = b.dataset.tab; }));
window.addEventListener("hashchange", router);

function rendreBonjour() {
  const h = new Date().getHours();
  const salut = h < 5 ? "Bonne nuit" : h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir";
  const ico = h < 5 ? "🌙" : h < 12 ? "☀️" : h < 18 ? "🌤️" : "🌙";
  $("#hello").innerHTML = S.profile ? `${salut}${S.profile.prenom ? ` <b>${esc(S.profile.prenom)}</b>` : ""} ${ico}` : "Ton coach de vie, dans ta poche.";
}

// ---------- Dictée vocale ----------
const Reco = window.SpeechRecognition || window.webkitSpeechRecognition;
let recoActive = null;
function brancherMicros(root = document) {
  $$(".mic", root).forEach((btn) => {
    if (btn.dataset.ok) return; btn.dataset.ok = "1";
    btn.addEventListener("click", () => dicter(btn));
  });
}
function dicter(btn) {
  const champ = document.querySelector(`[name="${btn.dataset.mic}"], #${btn.dataset.mic}`);
  if (!Reco) { toast("🎙️ Utilise le micro de ton clavier pour dicter (la dictée directe n'est pas disponible ici)."); champ?.focus(); return; }
  if (recoActive) { recoActive.stop(); return; }
  const r = new Reco();
  r.lang = "fr-FR"; r.interimResults = true; r.continuous = true;
  const base = champ.value ? champ.value.replace(/\s*$/, " ") : "";
  let final = "";
  r.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript + " ";
      else interim += e.results[i][0].transcript;
    }
    champ.value = base + final + interim;
    champ.dispatchEvent(new Event("input", { bubbles: true }));
  };
  r.onend = () => { btn.classList.remove("on"); recoActive = null; champ.value = champ.value.trim(); champ.dispatchEvent(new Event("input", { bubbles: true })); };
  r.onerror = (e) => { if (e.error === "not-allowed") toast("🎙️ Autorise le micro dans les réglages du navigateur."); };
  recoActive = r; btn.classList.add("on"); r.start();
  toast("🎙️ Je t'écoute… touche encore le micro pour arrêter.");
}

// ---------- Bienvenue et profil ----------
$("#startOnboarding").addEventListener("click", () => { location.hash = "profil"; });

function joursPicker(el, choisis) {
  el.innerHTML = [1, 2, 3, 4, 5, 6, 0].map((j) => `<button type="button" class="chip${choisis.includes(j) ? " on" : ""}" data-j="${j}" aria-pressed="${choisis.includes(j)}">${JOURS_COURTS[j]}</button>`).join("");
  el.onclick = (e) => { const b = e.target.closest("[data-j]"); if (!b) return; b.classList.toggle("on"); b.setAttribute("aria-pressed", b.classList.contains("on")); };
}
const joursChoisis = (el) => $$("[data-j].on", el).map((b) => +b.dataset.j);

function remplirProfil(p = S.profile || {}) {
  const f = $("#profilForm");
  $("#profilTitre").textContent = S.profile ? "Mon profil" : "Faisons connaissance";
  $("#profilSubmit").textContent = S.profile ? "Enregistrer" : "Créer mon programme";
  for (const [k, v] of Object.entries(p)) if (f.elements[k] && typeof v !== "object") f.elements[k].value = v;
  const objs = p.objectifs || [];
  $("#objectifsChips").innerHTML = OBJECTIFS.map((o) => `<button type="button" class="chip${objs.includes(o.id) ? " on" : ""}" data-o="${o.id}" aria-pressed="${objs.includes(o.id)}">${o.ico} ${o.nom}</button>`).join("");
  $("#objectifsChips").onclick = (e) => { const b = e.target.closest("[data-o]"); if (b) { b.classList.toggle("on"); b.setAttribute("aria-pressed", b.classList.contains("on")); } };
  joursPicker($("#travailJours"), p.travailJours || [1, 2, 3, 4, 5]);
  joursPicker($("#sportJours"), p.sportJours || []);
  brancherMicros($("#profilForm"));
}
function lireFormulaire() {
  const f = $("#profilForm").elements;
  const v = (k) => f[k].value.trim();
  return {
    prenom: v("prenom"), recit: v("recit"), metier: v("metier"), hobbies: v("hobbies"), sport: v("sport"),
    reveil: v("reveil") || "07:00", coucher: v("coucher") || "23:00",
    travailDebut: v("travailDebut"), travailFin: v("travailFin"),
    petitDej: v("petitDej"), dejeuner: v("dejeuner"), diner: v("diner"),
    sportHeure: v("sportHeure"), sportDuree: +v("sportDuree") || 60,
    travailJours: joursChoisis($("#travailJours")), sportJours: joursChoisis($("#sportJours")),
    objectifs: $$("#objectifsChips .on").map((b) => b.dataset.o),
  };
}
$("#profilForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const nouveau = !S.profile;
  const p = { ...(S.profile || {}), ...lireFormulaire() };
  p.memoire ||= [];
  S.profile = p;
  if (nouveau || !S.habits.length) S.habits = habitudesDepuisObjectifs(p.objectifs);
  else for (const h of habitudesDepuisObjectifs(p.objectifs)) if (!S.habits.some((x) => x.id === h.id)) S.habits.push(h);
  sauver();
  const sommeil = minutesSommeil(p);
  toast(sommeil < 420 ? `⚠️ Seulement ${dureeSommeil(p)} de sommeil prévues : vise au moins 7 h.` : nouveau ? "✨ Ton programme est prêt !" : "✅ Profil enregistré");
  rendreBonjour();
  location.hash = "jour";
  if (nouveau) router();
});
$("#analyserRecit").addEventListener("click", async () => {
  const recit = $("#profilForm").elements.recit.value.trim();
  const info = $("#analyseInfo");
  if (recit.length < 20) { info.textContent = "Écris ou dicte au moins quelques phrases sur ta vie d'abord."; return; }
  const appliquer = (d) => {
    const actuel = lireFormulaire();
    const fusion = { ...actuel };
    for (const [k, v] of Object.entries(d)) {
      if (v == null || v === "" || (Array.isArray(v) && !v.length) || k === "faits") continue;
      fusion[k] = k === "objectifs" ? [...new Set([...actuel.objectifs, ...v])] : v;
    }
    remplirProfil({ ...fusion, recit });
    return Object.keys(d).filter((k) => k !== "faits" && d[k] != null && d[k] !== "" && !(Array.isArray(d[k]) && !d[k].length)).length;
  };
  if (S.settings.apiKey) {
    info.textContent = "✨ Le coach lit ton texte…";
    try {
      const coach = await import("./coach.js");
      const d = await coach.lireProfil({ apiKey: S.settings.apiKey, recit, actuel: lireFormulaire() });
      const n = appliquer(d);
      if (d.faits?.length) window.__faits = d.faits;
      info.textContent = `✅ J'ai rempli ${n} réponse${n > 1 ? "s" : ""} et retenu ${d.faits?.length || 0} chose${(d.faits?.length || 0) > 1 ? "s" : ""} sur toi. Vérifie et corrige si besoin.`;
      return;
    } catch (err) { info.textContent = `Le coach IA n'a pas répondu (${err.message}). J'essaie sans lui…`; }
  }
  const n = appliquer(lireRecit(recit));
  info.textContent = n ? `✅ J'ai repéré ${n} information${n > 1 ? "s" : ""} dans ton texte. Vérifie et complète la suite.` : "Je n'ai rien repéré de précis : remplis les cases ci-dessous (ou branche le coach IA, il comprend tout).";
});
// les faits trouvés par l'IA dans le récit rejoignent la mémoire quand on enregistre
$("#profilForm").addEventListener("submit", () => {
  if (window.__faits?.length && S.profile) {
    for (const f of window.__faits) if (!S.profile.memoire.includes(f)) S.profile.memoire.push(f);
    window.__faits = null; sauver();
  }
});

// ---------- Aujourd'hui ----------
let jourVu = today();
$("#jourPrev").addEventListener("click", () => { jourVu = addDays(jourVu, -1); rendreJour(); });
$("#jourNext").addEventListener("click", () => { jourVu = addDays(jourVu, 1); rendreJour(); });

function planDu(iso) {
  const d = S.days[iso];
  if (d?.planIA?.length) {
    const taches = S.tasks.filter((t) => t.date === iso && t.heure && !t.fait && !d.planIA.some((b) => b.tacheId === t.id))
      .map((t) => ({ id: `tache-${t.id}`, debut: t.heure, fin: toHHMM(toMin(t.heure) + 15), titre: t.titre, ico: "🔔", type: "tache", tacheId: t.id }));
    return [...d.planIA.map((b, i) => ({ id: `ia-${i}`, ico: "•", ...b })), ...taches].sort((a, b) => toMin(a.debut) - toMin(b.debut));
  }
  return genererPlan(S.profile, iso, S.tasks);
}
function tachesDu(iso) {
  const t = today();
  return S.tasks.filter((x) => !x.fait && (x.date === iso || (iso === t && x.date && x.date < t)));
}

function rendreJour() {
  const iso = jourVu, t = today(), estAuj = iso === t;
  $("#jourTitre").textContent = jourLong(iso);
  const p = S.profile, plan = planDu(iso), dj = jourData(iso);
  const maintenant = nowMin();
  const enCours = estAuj ? plan.find((b) => toMin(b.debut) <= maintenant && maintenant < (toMin(b.fin) < toMin(b.debut) ? 1440 : toMin(b.fin))) : null;
  const prochain = estAuj ? plan.find((b) => toMin(b.debut) > maintenant) : null;
  const nbT = tachesDu(iso).length;

  // Le brief
  $("#brief").innerHTML = `
    ${estAuj && enCours ? `<p class="now"><span class="pill">Maintenant</span> ${esc(enCours.ico)} <b>${esc(enCours.titre)}</b> <span class="muted">jusqu'à ${fmtH(enCours.fin)}</span></p>` : ""}
    ${estAuj && prochain ? `<p class="next">Ensuite à ${fmtH(prochain.debut)} : ${esc(prochain.ico)} ${esc(prochain.titre)}</p>` : ""}
    <div class="kpis">
      <div><b>${fmtH(p.reveil)}</b><span>lever</span></div>
      <div><b>${fmtH(p.coucher)}</b><span>coucher</span></div>
      <div><b>${dureeSommeil(p)}</b><span>de sommeil</span></div>
      <div><b>${nbT}</b><span>tâche${nbT > 1 ? "s" : ""}</span></div>
    </div>
    <p class="tip">💡 ${esc(conseilDuJour(p.objectifs, iso))}</p>`;

  // Les tâches du jour
  const tj = tachesDu(iso).sort((a, b) => (a.heure || "99").localeCompare(b.heure || "99"));
  $("#tachesJour").innerHTML = `<div class="row-between"><h2>✅ À faire ${estAuj ? "aujourd'hui" : "ce jour-là"}</h2><a class="link" href="#taches">+ Ajouter</a></div>` +
    (tj.length ? `<ul class="tasks">${tj.map(ligneTache).join("")}</ul>` : `<p class="empty">Rien de prévu. ${estAuj ? "Profites-en, ou ajoute ce qui te trotte dans la tête." : ""}</p>`);

  // Le programme
  $("#planSource").innerHTML = dj.planIA?.length
    ? `Programme préparé par ton coach. <button class="link" type="button" id="planAuto">Revenir au programme automatique</button>`
    : `Fait automatiquement d'après ton profil. Demande au coach de l'adapter si besoin.`;
  $("#planAuto")?.addEventListener("click", () => { delete dj.planIA; sauver(); rendreJour(); });
  $("#timeline").innerHTML = plan.map((b) => {
    const fait = b.tacheId ? S.tasks.find((x) => x.id === b.tacheId)?.fait : dj.blocs[b.id];
    const passe = estAuj && toMin(b.fin) <= maintenant && toMin(b.fin) > toMin(b.debut) || iso < t;
    const cls = [b === enCours ? "now" : "", passe ? "past" : "", fait ? "done" : "", `t-${b.type}`].join(" ");
    return `<li class="${cls}">
      <span class="time">${fmtH(b.debut)}</span>
      <span class="dot">${esc(b.ico || "•")}</span>
      <div class="body">
        <b>${esc(b.titre)}</b>
        ${b.conseil ? `<small>${esc(b.conseil)}</small>` : ""}
        ${b.type === "travail" && estAuj && !passe ? `<button class="ghost small" type="button" data-focus="${esc(b.id)}">🎯 Mode travail</button>` : ""}
      </div>
      <button class="check" type="button" data-bloc="${esc(b.id)}" ${b.tacheId ? `data-tache="${esc(b.tacheId)}"` : ""} aria-pressed="${!!fait}" aria-label="Fait">${fait ? "✓" : ""}</button>
    </li>`;
  }).join("");

  // Habitudes
  $("#habitudesJour").innerHTML = `<h2>🌱 Mes habitudes</h2><p class="sub">Coche ce que tu as fait. Les 🔥 comptent les jours d'affilée.</p>
    <div class="habits">${S.habits.map((h) => {
      const ok = !!dj.habits[h.id], n = serie(S.days, h.id, iso);
      return `<button type="button" class="habit${ok ? " on" : ""}" data-h="${esc(h.id)}" aria-pressed="${ok}"><span class="hi">${esc(h.ico)}</span><span>${esc(h.nom)}</span>${n ? `<span class="streak">🔥 ${n}</span>` : ""}</button>`;
    }).join("")}</div>`;

  // Bilan du soir
  const b = dj.bilan || {};
  const futur = iso > t;
  $("#bilanJour").hidden = futur;
  if (!futur) $("#bilanJour").innerHTML = `<h2>📝 Bilan de la journée</h2>
    <p class="sub">30 secondes chaque soir : je m'en sers pour t'aider à voir ce qui te fait du bien.</p>
    <p class="lbl">Ma journée</p>
    <div class="scale" data-k="humeur">${["😫", "😕", "😐", "🙂", "😄"].map((e, i) => `<button type="button" data-v="${i + 1}" class="${b.humeur === i + 1 ? "on" : ""}" aria-label="${i + 1} sur 5">${e}</button>`).join("")}</div>
    <p class="lbl">Mon énergie</p>
    <div class="scale" data-k="energie">${["🪫", "😴", "⚡", "⚡⚡", "🚀"].map((e, i) => `<button type="button" data-v="${i + 1}" class="${b.energie === i + 1 ? "on" : ""}" aria-label="${i + 1} sur 5">${e}</button>`).join("")}</div>
    <label class="lbl">J'ai dormi (heures)<input type="number" class="input" id="bilanSommeil" min="0" max="16" step="0.5" value="${b.sommeil ?? ""}" placeholder="Ex. : 7.5"></label>
    <label class="lbl">Ce qui s'est bien passé, ce qui m'a pesé
      <div class="voice-field"><textarea class="input" id="bilanNote" rows="2" placeholder="Ex. : bonne séance de sport, mais trop de TikTok le soir">${esc(b.note || "")}</textarea><button type="button" class="mic" data-mic="bilanNote" aria-label="Dicter">🎙️</button></div>
    </label>`;
  brancherMicros($("#bilanJour"));
}

function ligneTache(t) {
  const retard = t.date && t.date < today();
  return `<li class="task${t.fait ? " done" : ""}">
    <button class="check" type="button" data-tache="${esc(t.id)}" aria-pressed="${!!t.fait}" aria-label="Fait">${t.fait ? "✓" : ""}</button>
    <span class="tt">${esc(t.titre)}<small class="${retard && !t.fait ? "late" : ""}">${t.date ? (retard && !t.fait ? "⚠️ en retard · " : "") + jourCourt(t.date) : "sans date"}${t.heure ? ` · 🔔 ${fmtH(t.heure)}` : ""}</small></span>
    ${t.date && t.heure && !t.fait ? `<button class="icon" type="button" data-agenda="${esc(t.id)}" aria-label="Ajouter à l'agenda" title="Ajouter à l'agenda">📅</button>` : ""}
    <button class="icon" type="button" data-suppr="${esc(t.id)}" aria-label="Supprimer" title="Supprimer">🗑️</button>
  </li>`;
}

// Un seul écouteur pour les clics de toute l'appli
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-tache],[data-bloc],[data-h],[data-suppr],[data-agenda],[data-focus],.scale button");
  if (!el) return;
  if (el.matches(".scale button")) {
    const k = el.parentElement.dataset.k, dj = jourData(jourVu);
    dj.bilan ||= {}; dj.bilan[k] = dj.bilan[k] === +el.dataset.v ? undefined : +el.dataset.v;
    sauver(); $$("button", el.parentElement).forEach((b) => b.classList.toggle("on", +b.dataset.v === dj.bilan[k]));
    if (k === "humeur" && dj.bilan.humeur) toast(dj.bilan.humeur >= 4 ? "Top ! Garde ce qui a marché aujourd'hui 💪" : dj.bilan.humeur <= 2 ? "Courage, demain est une nouvelle journée 💛" : "Merci, c'est noté 👍");
    return;
  }
  if (el.dataset.tache) {
    const t = S.tasks.find((x) => x.id === el.dataset.tache);
    if (t) { t.fait = !t.fait; t.faitLe = t.fait ? Date.now() : null; sauver(); if (t.fait) toast("✅ Bien joué !"); }
    rafraichir(); planifierRappels(); return;
  }
  if (el.dataset.bloc) {
    const dj = jourData(jourVu);
    dj.blocs[el.dataset.bloc] = !dj.blocs[el.dataset.bloc]; sauver(); rendreJour(); return;
  }
  if (el.dataset.h) {
    const dj = jourData(jourVu);
    dj.habits[el.dataset.h] = !dj.habits[el.dataset.h]; sauver(); rendreJour();
    if (dj.habits[el.dataset.h]) { const n = serie(S.days, el.dataset.h, jourVu); if (n >= 3) toast(`🔥 ${n} jours d'affilée !`); }
    return;
  }
  if (el.dataset.suppr) {
    S.tasks = S.tasks.filter((x) => x.id !== el.dataset.suppr); sauver(); rafraichir(); planifierRappels(); return;
  }
  if (el.dataset.agenda) {
    const t = S.tasks.find((x) => x.id === el.dataset.agenda);
    if (t) telecharger(`${t.titre.slice(0, 40).replace(/[^\p{L}\p{N} -]/gu, "")}.ics`, ics([{ uid: t.id, date: t.date, debut: t.heure, fin: toHHMM(toMin(t.heure) + 30), titre: t.titre, avance: 15 }]), "text/calendar");
    return;
  }
  if (el.dataset.focus) {
    const b = planDu(today()).find((x) => x.id === el.dataset.focus);
    if (b) { const reste = Math.max(10, toMin(b.fin) - Math.max(nowMin(), toMin(b.debut))); demarrerFocus(Math.min(reste, 90), b.titre); }
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "bilanSommeil") { const dj = jourData(jourVu); dj.bilan ||= {}; dj.bilan.sommeil = e.target.value === "" ? undefined : +e.target.value; sauver(); }
  if (e.target.id === "bilanNote") { const dj = jourData(jourVu); dj.bilan ||= {}; dj.bilan.note = e.target.value; sauver(); }
});
function rafraichir() {
  const v = $$(".view").find((x) => !x.hidden)?.id;
  if (v === "v-jour") rendreJour(); else if (v === "v-taches") rendreTaches();
}

$("#planAgenda").addEventListener("click", () => {
  const evts = planDu(jourVu).filter((b) => !["pause", "tache"].includes(b.type))
    .map((b) => ({ uid: `${jourVu}-${b.id}`, date: jourVu, debut: b.debut, fin: b.fin, titre: `${b.ico || ""} ${b.titre}`.trim(), note: b.conseil, avance: 5 }));
  telecharger(`programme-${jourVu}.ics`, ics(evts), "text/calendar");
  toast("📅 Ouvre le fichier pour ajouter ta journée à ton agenda, avec les rappels.");
});

// ---------- À faire ----------
function ajouterTache({ titre, date = null, heure = null }) {
  const t = { id: uid(), titre: titre.trim(), date: date || (heure ? today() : null), heure: heure || null, fait: false, cree: Date.now() };
  S.tasks.push(t); sauver(); planifierRappels();
  return t;
}
$("#tacheInput").addEventListener("input", (e) => {
  const r = lireTache(e.target.value);
  $("#tacheApercu").textContent = e.target.value.trim()
    ? `→ « ${r.titre || "…"} »${r.date ? ` · 📅 ${jourCourt(r.date)}` : " · sans date"}${r.heure ? ` · 🔔 ${fmtH(r.heure)}` : ""}` : "";
});
$("#tacheForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("#tacheInput").value.trim(); if (!v) return;
  const r = lireTache(v);
  if (!r.titre) return;
  ajouterTache(r);
  $("#tacheInput").value = ""; $("#tacheApercu").textContent = "";
  toast(r.heure ? `🔔 Je te le rappelle ${jourCourt(r.date)} à ${fmtH(r.heure)}` : "✅ C'est noté, tu ne l'oublieras pas.");
  rendreTaches();
});
function rendreTaches() {
  brancherMicros($("#v-taches"));
  const t = today(), dem = addDays(t, 1);
  const ouvertes = S.tasks.filter((x) => !x.fait);
  const tri = (a, b) => (a.date || "9").localeCompare(b.date || "9") || (a.heure || "99").localeCompare(b.heure || "99");
  const groupes = [
    ["⚠️ En retard", ouvertes.filter((x) => x.date && x.date < t)],
    ["☀️ Aujourd'hui", ouvertes.filter((x) => x.date === t)],
    ["🌤️ Demain", ouvertes.filter((x) => x.date === dem)],
    ["🗓️ Plus tard", ouvertes.filter((x) => x.date && x.date > dem)],
    ["📥 Sans date", ouvertes.filter((x) => !x.date)],
    ["✔️ Fait récemment", S.tasks.filter((x) => x.fait).sort((a, b) => (b.faitLe || 0) - (a.faitLe || 0)).slice(0, 8)],
  ];
  const html = groupes.filter(([, l]) => l.length).map(([titre, l]) => `<div class="card"><h2>${titre} <span class="muted">${l.length}</span></h2><ul class="tasks">${l.sort(tri).map(ligneTache).join("")}</ul></div>`).join("");
  $("#tachesListe").innerHTML = html || `<p class="empty">Ta liste est vide. Tout ce qui te passe par la tête, mets-le ici : ton cerveau est fait pour réfléchir, pas pour stocker. 🧠</p>`;
  $("#tachesListe").insertAdjacentHTML("beforeend", notifEtat() === "granted" ? "" : `<p class="note center">🔔 <button class="link" type="button" id="notifInline">Active les rappels</button> pour être prévenu à l'heure, ou touche 📅 pour ajouter une tâche à l'agenda du téléphone.</p>`);
  $("#notifInline")?.addEventListener("click", demanderNotifs);
}

// ---------- Rappels ----------
const notifEtat = () => ("Notification" in window ? Notification.permission : "unsupported");
async function demanderNotifs() {
  if (!("Notification" in window)) { toast("Ton navigateur ne gère pas les rappels : installe l'appli sur l'écran d'accueil, ou utilise 📅 Agenda."); return; }
  const r = await Notification.requestPermission();
  toast(r === "granted" ? "🔔 Rappels activés (quand l'appli est ouverte ou en arrière-plan). Pour des rappels garantis, ajoute aussi à l'agenda 📅." : "Rappels refusés. Tu peux les autoriser dans les réglages du navigateur.");
  planifierRappels(); rendreMoi();
}
async function notifier(titre, corps) {
  if (notifEtat() !== "granted") { toast(`🔔 ${titre}`); return; }
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(titre, { body: corps, icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: titre });
    else new Notification(titre, { body: corps, icon: "icons/icon-192.png" });
  } catch { toast(`🔔 ${titre}`); }
}
let rappels = [];
function planifierRappels() {
  rappels.forEach(clearTimeout); rappels = [];
  if (!S.profile) return;
  const now = Date.now(), t = today();
  const programmer = (iso, hhmm, titre, corps) => {
    const [y, m, d] = iso.split("-").map(Number); const [h, mi] = hhmm.split(":").map(Number);
    const ms = new Date(y, m - 1, d, h, mi).getTime() - now;
    if (ms > 0 && ms < 864e5) rappels.push(setTimeout(() => notifier(titre, corps), ms));
  };
  for (const x of S.tasks) if (!x.fait && x.date && x.heure) programmer(x.date, x.heure, `🔔 ${x.titre}`, "C'est l'heure ! Touche pour le cocher dans Vie Maline.");
  for (const iso of [t, addDays(t, 1)]) {
    for (const b of planDu(iso)) {
      if (["soir", "dodo", "sport", "bilan"].includes(b.type) || (b.type === "travail" && /importante|séance 1$/.test(b.titre)))
        programmer(iso, b.debut, `${b.ico} ${b.titre}`, b.conseil || "C'est le moment.");
    }
  }
}

// ---------- Mode travail (focus) ----------
const DUREES = [15, 25, 50, 90];
let dureeChoisie = 25, focus = null, wakeLock = null;
function rendreFocus() {
  $("#focusDurees").innerHTML = DUREES.map((d) => `<button type="button" class="chip${d === dureeChoisie ? " on" : ""}" data-d="${d}">${d} min</button>`).join("");
  const dj = jourData(today());
  const semaine = Array.from({ length: 7 }, (_, i) => S.days[addDays(today(), -i)]?.focusMin || 0).reduce((a, b) => a + b, 0);
  $("#focusStats").textContent = `Aujourd'hui : ${dj.focusMin || 0} min de concentration · 7 derniers jours : ${Math.floor(semaine / 60)} h ${semaine % 60} min`;
  rendreAideDnd();
}
$("#focusDurees").addEventListener("click", (e) => { const b = e.target.closest("[data-d]"); if (b) { dureeChoisie = +b.dataset.d; rendreFocus(); } });
$("#focusStart").addEventListener("click", () => demarrerFocus(dureeChoisie, $("#focusSujet").value.trim()));

const ASTUCES_FOCUS = ["📵 Ton téléphone reste posé. Tu peux le faire.", "🧠 Une seule chose à la fois.", "💧 Un verre d'eau à côté de toi ?", "✍️ Une idée parasite ? Note-la et reviens à ta tâche.", "🌬️ Bloqué ? Respire 3 fois lentement et attaque la plus petite étape."];
const URL_RACCOURCI = (n) => `shortcuts://run-shortcut?name=${encodeURIComponent(n)}`;
async function demarrerFocus(min, sujet = "") {
  focus = { fin: Date.now() + min * 60e3, total: min * 60e3, pause: null, sorties: 0, sujet, ignorerSortie: false };
  $("#focusLabel").textContent = sujet ? `🎯 ${sujet}` : "Mode travail";
  $("#focusScreen").hidden = false; document.body.classList.add("focus-on");
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { /* pas grave */ }
  tickFocus();
  focus.timer = setInterval(tickFocus, 1000);
  if (S.settings.raccourcis && /iPhone|iPad/.test(navigator.userAgent)) { focus.ignorerSortie = true; location.href = URL_RACCOURCI("Vie Maline travail"); }
}
function tickFocus() {
  if (!focus) return;
  const reste = focus.pause ? focus.fin - focus.pause : focus.fin - Date.now();
  if (reste <= 0) return finirFocus(true);
  const s = Math.ceil(reste / 1000);
  $("#focusTime").textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  $("#focusBar").style.width = `${100 - (reste / focus.total) * 100}%`;
  if (s % 60 === 0) $("#focusTip").textContent = ASTUCES_FOCUS[(s / 60) % ASTUCES_FOCUS.length];
  document.title = `${$("#focusTime").textContent} · Mode travail`;
}
function finirFocus(complet) {
  if (!focus) return;
  clearInterval(focus.timer);
  const reste = focus.pause ? focus.fin - focus.pause : focus.fin - Date.now();
  const faitMin = Math.round((focus.total - Math.max(0, reste)) / 60e3);
  const dj = jourData(today());
  dj.focusMin = (dj.focusMin || 0) + Math.max(0, faitMin);
  if (complet && S.habits.some((h) => h.id === "h-focus")) dj.habits["h-focus"] = true;
  sauver();
  const sorties = focus.sorties;
  focus = null;
  wakeLock?.release?.().catch(() => {}); wakeLock = null;
  $("#focusScreen").hidden = true; document.body.classList.remove("focus-on");
  document.title = "Vie Maline";
  if (complet) {
    bip(); navigator.vibrate?.([200, 100, 200]);
    notifier("🎉 Séance terminée !", "Bravo. Fais une vraie pause de 5 à 10 minutes, loin des écrans.");
    toast(sorties ? `🎉 Séance finie ! Tu as quitté l'appli ${sorties} fois : la prochaine fois, essaie zéro 😉` : "🎉 Séance finie sans toucher ton téléphone, bravo !");
  } else toast(`Séance arrêtée : ${faitMin} min, c'est déjà ça 👍`);
  if (S.settings.raccourcis && /iPhone|iPad/.test(navigator.userAgent)) location.href = URL_RACCOURCI("Vie Maline fin travail");
  rendreFocus();
}
$("#focusStop").addEventListener("click", () => { if (confirm("Arrêter la séance maintenant ?")) finirFocus(false); });
$("#focusPause").addEventListener("click", () => {
  if (!focus) return;
  if (focus.pause) { focus.fin += Date.now() - focus.pause; focus.pause = null; $("#focusPause").textContent = "⏸ Pause"; }
  else { focus.pause = Date.now(); $("#focusPause").textContent = "▶️ Reprendre"; }
  tickFocus();
});
// Si on quitte l'appli pendant la séance, c'est qu'on a pris son téléphone : on le compte.
document.addEventListener("visibilitychange", async () => {
  if (!focus) return;
  if (document.hidden) {
    if (focus.ignorerSortie) { focus.ignorerSortie = false; return; }
    if (!focus.pause) focus.sorties++;
  } else {
    if (focus.sorties && !focus.pause) toast(`📵 Hé ! Tu as quitté le mode travail (${focus.sorties}). On repose le téléphone ?`);
    try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { /* */ }
    tickFocus();
  }
});
function bip() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach((t, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = [660, 880, 990][i]; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.2, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.22);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.24);
    });
  } catch { /* */ }
}

function rendreAideDnd() {
  const p = S.profile || {};
  const jours = (p.travailJours || []).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((j) => JOURS_COURTS[j]).join(", ") || "tes jours de travail";
  const plage = p.travailDebut && p.travailFin ? `${fmtH(p.travailDebut)} → ${fmtH(p.travailFin)}` : "tes heures de travail";
  const nuit = `${fmtH(toHHMM((toMin(p.coucher) ?? 1380) - 60))} → ${fmtH(toHHMM((toMin(p.reveil) ?? 420) + 30))}`;
  const ios = /iPhone|iPad|Macintosh/.test(navigator.userAgent) && "ontouchend" in document;
  const android = /Android/.test(navigator.userAgent);
  const blocIos = `
    <h3>📱 Sur iPhone</h3>
    <ol class="steps">
      <li><b>Réglages → Concentration → Travail</b> (ou « + » pour en créer un).</li>
      <li>Choisis qui et quelles applis peuvent te déranger (garde juste Téléphone et tes proches).</li>
      <li><b>Ajouter un horaire</b> → <b>${esc(jours)}</b>, <b>${esc(plage)}</b>.</li>
      <li>Refais pareil avec <b>Sommeil</b> : <b>${esc(nuit)}</b>, pour couper les notifications 1 h avant de dormir.</li>
    </ol>
    <details><summary>Bonus : lancer le Ne pas déranger depuis le bouton « Mode travail »</summary>
      <ol class="steps">
        <li>Ouvre l'appli <b>Raccourcis</b> → « + » → action <b>Définir Concentration</b> → Travail, <b>Activé</b>. Nomme-le exactement <b>Vie Maline travail</b>.</li>
        <li>Crée un 2e raccourci <b>Vie Maline fin travail</b> avec Travail <b>Désactivé</b>.</li>
        <li>Coche ci-dessous. Le bouton « Mode travail » lancera alors le raccourci, puis reviens dans l'appli.</li>
      </ol>
      <label class="toggle"><input type="checkbox" id="raccourcisOk" ${S.settings.raccourcis ? "checked" : ""}> J'ai créé les 2 raccourcis</label>
    </details>`;
  const blocAndroid = `
    <h3>🤖 Sur Android</h3>
    <ol class="steps">
      <li><b>Paramètres → Bien-être numérique → Mode Concentration</b> : choisis les applis qui te distraient (réseaux sociaux, jeux…).</li>
      <li>Touche <b>Définir un programme</b> → <b>${esc(jours)}</b>, <b>${esc(plage)}</b>.</li>
      <li>Dans <b>Ne pas déranger → Programmes</b>, ajoute <b>${esc(nuit)}</b> pour la nuit.</li>
    </ol>
    <p class="sub">Les menus changent un peu selon la marque (Samsung : « Modes et routines »).</p>`;
  $("#dndAide").innerHTML = `<h2>🔕 Couper les distractions automatiquement</h2>
    <p class="sub">Ton téléphone peut passer tout seul en « Ne pas déranger » pendant tes heures de travail et la nuit. Réglage à faire une seule fois, avec tes horaires :</p>
    ${ios ? blocIos : android ? blocAndroid : blocIos + blocAndroid}
    <p class="sub">Pendant une séance, Vie Maline garde l'écran allumé et compte chaque fois que tu quittes l'appli pour aller sur ton téléphone.</p>`;
  $("#raccourcisOk")?.addEventListener("change", (e) => { S.settings.raccourcis = e.target.checked; sauver(); });
}

// ---------- Coach ----------
const SUGGESTIONS = ["Organise ma journée de demain", "J'ai du mal à me lever le matin", "Je passe trop de temps sur mon téléphone", "Rappelle-moi d'appeler le médecin lundi à 9h", "Qu'est-ce que je mange ce soir ?", "Je procrastine, aide-moi"];
let enCoursCoach = null;
function rendreCoach() {
  brancherMicros($("#v-coach"));
  const setup = $("#coachSetup");
  setup.hidden = !!S.settings.apiKey;
  if (!S.settings.apiKey) setup.innerHTML = `<h2>🤖 Ton coach</h2>
    <p class="sub">Sans IA, je comprends les rappels (« rappelle-moi de… ») et je te donne des conseils simples. Avec le <b>coach IA</b>, je comprends tout ce que tu me racontes, j'organise tes journées à ta place et je retiens ce qui compte pour toi.</p>
    <button class="primary full" type="button" id="brancherIA">Brancher le coach IA</button>`;
  $("#brancherIA")?.addEventListener("click", ouvrirCle);
  const chat = $("#chat");
  chat.innerHTML = (S.chat.length ? "" : `<div class="msg coach"><div class="bubble">Salut${S.profile?.prenom ? ` ${esc(S.profile.prenom)}` : ""} ! 👋 Dis-moi comment tu te sens, ce qui t'embête ou ce que tu veux organiser. Tu peux aussi me parler avec le micro 🎙️.</div></div>`) +
    S.chat.map((m) => `<div class="msg ${m.role}"><div class="bubble">${m.role === "coach" ? md(m.text) : esc(m.text).replace(/\n/g, "<br>")}${m.outils?.length ? `<div class="tools">${m.outils.map((o) => `<span>${esc(o)}</span>`).join("")}</div>` : ""}</div></div>`).join("") +
    (S.chat.length ? `<p class="center"><button class="link" type="button" id="nouvelleConv">Nouvelle conversation</button></p>` : "");
  $("#nouvelleConv")?.addEventListener("click", () => { if (confirm("Effacer la conversation ? (Ce que le coach a retenu sur toi est gardé.)")) { S.chat = []; S.chatApi = []; sauver(); rendreCoach(); } });
  $("#coachSugg").innerHTML = S.chat.length > 2 ? "" : SUGGESTIONS.map((s) => `<button type="button" class="chip">${esc(s)}</button>`).join("");
  chat.lastElementChild?.scrollIntoView({ block: "end" });
}
$("#coachSugg").addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (b) { $("#coachInput").value = b.textContent; envoyerCoach(); } });
$("#coachInput").addEventListener("input", (e) => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px"; });
$("#coachInput").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !matchMedia("(pointer: coarse)").matches) { e.preventDefault(); envoyerCoach(); } });
$("#coachForm").addEventListener("submit", (e) => { e.preventDefault(); envoyerCoach(); });

function contexte() {
  const t = today(), p = S.profile;
  const { recit, memoire, ...profil } = p;
  const bilans = Array.from({ length: 7 }, (_, i) => addDays(t, -i)).filter((d) => S.days[d]?.bilan?.humeur || S.days[d]?.bilan?.note)
    .map((d) => ({ jour: d, ...S.days[d].bilan, habitudes: S.habits.filter((h) => S.days[d].habits?.[h.id]).map((h) => h.nom) }));
  const d = new Date();
  return JSON.stringify({
    maintenant: `${["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"][d.getDay()]} ${t} ${toHHMM(nowMin())}`,
    profil: { ...profil, travailJours_0dimanche: profil.travailJours },
    ce_quelle_a_raconte: recit || undefined,
    memoire: memoire || [],
    programme_aujourdhui: planDu(t).map((b) => `${b.debut}-${b.fin} ${b.titre}`),
    programme_demain_est_du_coach: !!S.days[addDays(t, 1)]?.planIA?.length,
    taches_a_faire: S.tasks.filter((x) => !x.fait).slice(0, 40).map((x) => `${x.titre}${x.date ? ` (${x.date}${x.heure ? " " + x.heure : ""})` : ""}`),
    habitudes_aujourdhui: S.habits.map((h) => `${h.nom} : ${S.days[t]?.habits?.[h.id] ? "fait" : "pas encore"} (série ${serie(S.days, h.id, t)} j)`),
    bilans_7_jours: bilans,
    minutes_concentration_aujourdhui: S.days[t]?.focusMin || 0,
  });
}

function executerOutil(nom, i) {
  if (nom === "ajouter_tache") {
    const t = ajouterTache(i);
    return { resume: `✅ Tâche : ${t.titre}${t.date ? ` (${jourCourt(t.date)}${t.heure ? " " + fmtH(t.heure) : ""})` : ""}`, retour: "Tâche ajoutée." };
  }
  if (nom === "planifier_journee") {
    const dj = jourData(i.date);
    dj.planIA = i.blocs.map((b) => ({ debut: b.debut, fin: b.fin, titre: b.titre, ico: b.ico || "•", type: b.type || "autre", conseil: b.conseil || "" }));
    sauver(); planifierRappels();
    return { resume: `🗓️ Programme de ${jourCourt(i.date)} mis à jour`, retour: "Programme enregistré, visible dans l'onglet Aujourd'hui." };
  }
  if (nom === "ajouter_habitude") {
    if (!S.habits.some((h) => h.nom.toLowerCase() === i.nom.toLowerCase())) S.habits.push({ id: `h-${uid()}`, nom: i.nom, ico: i.ico || "🌱" });
    sauver();
    return { resume: `🌱 Habitude : ${i.nom}`, retour: "Habitude ajoutée." };
  }
  if (nom === "memoriser") {
    S.profile.memoire ||= [];
    if (!S.profile.memoire.includes(i.fait)) S.profile.memoire.push(i.fait);
    sauver();
    return { resume: `🧠 Retenu : ${i.fait}`, retour: "Mémorisé." };
  }
  throw new Error("Outil inconnu");
}

async function envoyerCoach() {
  const champ = $("#coachInput");
  const texte = champ.value.trim();
  if (!texte || enCoursCoach) return;
  recoActive?.stop();
  champ.value = ""; champ.style.height = "auto";
  S.chat.push({ role: "user", text: texte });
  const rep = { role: "coach", text: "", outils: [] };
  S.chat.push(rep);
  sauver(); rendreCoach();
  const bulle = $$("#chat .msg.coach .bubble").pop();
  bulle.innerHTML = `<span class="typing"><i></i><i></i><i></i></span>`;

  if (!S.settings.apiKey) {
    rep.text = coachSansIA(texte, rep);
    sauver(); rendreCoach(); return;
  }
  $("#coachSend").disabled = true;
  enCoursCoach = new AbortController();
  // Conversation trop longue : on repart d'un historique neuf (la mémoire, elle, reste)
  if (S.chatApi.length > 80) S.chatApi = [];
  const historique = structuredClone(S.chatApi);
  try {
    const coach = await import("./coach.js");
    await coach.parler({
      apiKey: S.settings.apiKey, history: historique, texte, contexte: contexte(), signal: enCoursCoach.signal,
      onText: (d) => { rep.text += d; bulle.innerHTML = md(rep.text.trim()) || `<span class="typing"><i></i><i></i><i></i></span>`; bulle.scrollIntoView({ block: "end" }); },
      onTool: (nom, input) => { const r = executerOutil(nom, input); rep.outils.push(r.resume); return r.retour; },
    });
    S.chatApi = historique;
  } catch (err) {
    const E = (await import("./coach.js")).Erreurs();
    rep.text += (rep.text ? "\n\n" : "") + (
      E && err instanceof E.AuthenticationError ? "⚠️ Ta clé n'est pas acceptée. Vérifie-la dans Moi → Brancher le coach IA."
      : E && err instanceof E.PermissionDeniedError ? "⚠️ Ta clé n'a pas accès à ce modèle."
      : E && err instanceof E.RateLimitError ? "⚠️ Trop de demandes d'un coup, réessaie dans une minute."
      : E && err instanceof E.APIError && err.status === 402 ? "⚠️ Plus de crédit sur ton compte Anthropic."
      : E && err instanceof E.APIConnectionError ? "⚠️ Pas de connexion internet. Réessaie quand tu as du réseau."
      : `⚠️ Le coach n'a pas pu répondre (${err?.message || err}).`);
    // l'historique ne fait que s'allonger : on le garde tel quel, même incomplet
    S.chatApi = historique;
  } finally {
    enCoursCoach = null; $("#coachSend").disabled = false;
    if (!rep.text.trim()) rep.text = rep.outils.length ? "C'est fait 👍" : "…";
    sauver(); rendreCoach();
  }
}

// Le coach de secours, sans IA : rappels + conseils simples
function coachSansIA(texte, rep) {
  const t = texte.toLowerCase();
  const r = lireTache(texte);
  if (/rappel|oublie|n'oublie|penser à|pense à|note/.test(t) || (r.date && r.titre.split(" ").length <= 8)) {
    const x = ajouterTache(r);
    rep.outils.push(`✅ Tâche : ${x.titre}${x.date ? ` (${jourCourt(x.date)}${x.heure ? " " + fmtH(x.heure) : ""})` : ""}`);
    return `C'est noté 👍 Je l'ai mis dans ta liste${x.heure ? ` avec un rappel à ${fmtH(x.heure)}` : ""}.`;
  }
  if (/organis|programme|planning|journée|journee|demain/.test(t)) {
    const iso = /demain/.test(t) ? addDays(today(), 1) : today();
    const plan = planDu(iso).filter((b) => b.type !== "pause");
    return `Voici ton programme de **${jourCourt(iso)}** :\n${plan.map((b) => `- ${fmtH(b.debut)} ${b.ico} ${b.titre}`).join("\n")}\n\nTu peux changer tes horaires dans Moi → Modifier mon profil.`;
  }
  const themes = [
    [/lever|réveil|reveil|matin/, "lever"], [/dor|sommeil|fatigu|nuit/, "sommeil"], [/mang|faim|repas|grignot|dîner|diner|cuisine/, "manger"],
    [/téléphone|telephone|tiktok|insta|écran|ecran|réseaux|scroll/, "telephone"], [/sport|bouger|muscu|courir/, "sport"],
    [/procrastin|concentr|travail|distrait/, "focus"], [/stress|angoiss|anxi|pression|énervé/, "stress"], [/organis|oubli/, "organise"],
  ];
  const th = themes.find(([re]) => re.test(t));
  const conseils = {
    lever: "Pour te lever plus tôt :\n- avance ton coucher de 15 min par semaine ;\n- réveil loin du lit ;\n- ouvre les volets et bois un verre d'eau tout de suite ;\n- même heure le week-end (à 1 h près).",
    sommeil: "Pour mieux dormir :\n- écrans coupés 1 h avant (téléphone à charger hors de la chambre) ;\n- chambre fraîche et noire ;\n- pas de café après 14 h ;\n- même heure de coucher chaque soir.",
    manger: "Idée simple pour ce soir : une poêlée de légumes (surgelés, c'est très bien) + un œuf ou du poulet + un peu de riz ou de pâtes. Moitié légumes, un quart protéines, un quart féculents 🥗",
    telephone: "Contre le téléphone :\n- coupe toutes les notifications sauf tes proches ;\n- range les réseaux sociaux en 2e page ;\n- active le Mode travail (onglet 🎯) et programme le Ne pas déranger ;\n- le soir, téléphone hors de la chambre.",
    sport: "Le plus dur, c'est de commencer : vise 10 minutes aujourd'hui (marche rapide, pompes, gainage). Prépare tes affaires la veille.",
    focus: "Contre la procrastination :\n- choisis UNE tâche ;\n- découpe-la jusqu'à une première étape de 2 minutes ;\n- lance une séance de 25 min dans l'onglet 🎯, téléphone dans une autre pièce. Go !",
    stress: "Essaie maintenant : inspire 4 secondes, expire 6 secondes, pendant 2 minutes. Puis écris ce qui te stresse : ça prend moins de place dans la tête 💛",
    organise: "Tout ce qui te passe par la tête, mets-le dans « À faire » (tu peux le dicter). Chaque soir, choisis 3 tâches pour demain, pas plus.",
  };
  if (th) return `${conseils[th[1]]}\n\nPour des conseils vraiment adaptés à ta vie, branche le coach IA (Moi → Réglages).`;
  return "Merci de me le dire 🙏 Sans le coach IA, je ne comprends que les rappels (« rappelle-moi de… ») et les grandes questions (sommeil, téléphone, sport, alimentation, stress, organisation). Branche le coach IA dans Moi → Réglages pour une vraie conversation.";
}

// ---------- Clé du coach IA ----------
function ouvrirCle() {
  $("#cleInput").value = S.settings.apiKey || "";
  $("#cleInfo").textContent = S.settings.apiKey ? "✅ Un coach IA est branché." : "";
  $("#cleRemove").hidden = !S.settings.apiKey;
  $("#cleDlg").showModal();
}
$("#cleBtn").addEventListener("click", ouvrirCle);
$("#cleDlg").addEventListener("close", async () => {
  const v = $("#cleDlg").returnValue;
  if (v === "remove") { S.settings.apiKey = ""; sauver(); toast("Coach IA débranché."); rendreCoach(); rendreMoi(); return; }
  if (v !== "ok") return;
  const k = $("#cleInput").value.trim();
  if (!k) return;
  toast("⏳ Je vérifie la clé…");
  try {
    const coach = await import("./coach.js");
    await coach.testerCle(k);
    S.settings.apiKey = k; sauver();
    toast("✅ Coach IA branché ! Va lui parler dans l'onglet 💬");
  } catch (err) {
    const E = (await import("./coach.js")).Erreurs();
    if (E && err instanceof E.APIConnectionError) { S.settings.apiKey = k; sauver(); toast("Clé enregistrée (pas de réseau pour la vérifier)."); }
    else toast("⚠️ Clé refusée. Vérifie que tu l'as copiée en entier.");
  }
  rendreCoach(); rendreMoi();
});

// ---------- Moi ----------
function rendreMoi() {
  if (!S.profile) return;
  const a = analyser(S.days, S.habits, 14);
  $("#statsCard").innerHTML = `<h2>📈 Mes 14 derniers jours</h2>
    <div class="kpis">
      <div><b>${a.humeur ? a.humeur.toFixed(1) + "/5" : "–"}</b><span>humeur</span></div>
      <div><b>${a.energie ? a.energie.toFixed(1) + "/5" : "–"}</b><span>énergie</span></div>
      <div><b>${Math.floor(a.focusMin / 60)}h${String(a.focusMin % 60).padStart(2, "0")}</b><span>concentré</span></div>
      <div><b>${a.bilans}</b><span>bilan${a.bilans > 1 ? "s" : ""}</span></div>
    </div>
    <div class="bars">${a.habitudes.map((h) => `<div class="bar"><span>${esc(h.ico)} ${esc(h.nom)}</span><i style="--p:${Math.round((h.fait / 14) * 100)}%"></i><small>${h.fait}/14</small></div>`).join("")}</div>
    ${a.constats.length ? `<h3>🔎 Ce que je remarque</h3><ul class="bullets">${a.constats.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : `<p class="sub">Remplis ton bilan quelques soirs de suite : je te montrerai ce qui te fait vraiment du bien.</p>`}`;

  const mem = S.profile.memoire || [];
  $("#memoireCard").innerHTML = `<h2>🧠 Ce que ton coach sait de toi</h2>
    <p class="sub">Il s'en sert pour t'aider. Tu peux ajouter ou retirer ce que tu veux.</p>
    ${mem.length ? `<ul class="mem">${mem.map((m, i) => `<li><span>${esc(m)}</span><button class="icon" type="button" data-mem="${i}" aria-label="Oublier">✕</button></li>`).join("")}</ul>` : `<p class="empty">Rien pour l'instant. Parle au coach, ou ajoute une info :</p>`}
    <form id="memForm" class="inline"><input class="input" id="memInput" placeholder="Ex. : J'ai deux enfants, je dépose les petits à 8h15" maxlength="200"><button class="ghost" type="submit">Ajouter</button></form>`;
  $("#memoireCard").onclick = (e) => { const b = e.target.closest("[data-mem]"); if (b) { S.profile.memoire.splice(+b.dataset.mem, 1); sauver(); rendreMoi(); } };
  $("#memForm").onsubmit = (e) => { e.preventDefault(); const v = $("#memInput").value.trim(); if (v) { S.profile.memoire.push(v); sauver(); rendreMoi(); } };

  $("#habitudesGerer").innerHTML = `<h2>🌱 Mes habitudes à suivre</h2>
    <ul class="mem">${S.habits.map((h) => `<li><span>${esc(h.ico)} ${esc(h.nom)}</span><button class="icon" type="button" data-hdel="${esc(h.id)}" aria-label="Retirer">✕</button></li>`).join("")}</ul>
    <form id="habForm" class="inline"><input class="input" id="habInput" placeholder="Nouvelle habitude, ex. : 10 pompes" maxlength="80"><button class="ghost" type="submit">Ajouter</button></form>`;
  $("#habitudesGerer").onclick = (e) => { const b = e.target.closest("[data-hdel]"); if (b) { S.habits = S.habits.filter((h) => h.id !== b.dataset.hdel); sauver(); rendreMoi(); } };
  $("#habForm").onsubmit = (e) => { e.preventDefault(); const v = $("#habInput").value.trim(); if (v) { S.habits.push({ id: `h-${uid()}`, nom: v, ico: "🌱" }); sauver(); rendreMoi(); } };

  const n = notifEtat();
  $("#notifBtn").textContent = n === "granted" ? "🔔 Rappels activés" : "🔔 Activer les rappels";
  $("#notifBtn").disabled = n === "granted";
  $("#cleBtn").textContent = S.settings.apiKey ? "🤖 Coach IA branché (modifier)" : "🤖 Brancher le coach IA";
}
$("#editProfil").addEventListener("click", () => { location.hash = "profil"; });
$("#notifBtn").addEventListener("click", demanderNotifs);
$("#exportBtn").addEventListener("click", () => {
  const { settings, ...data } = S;
  telecharger(`vie-maline-sauvegarde-${today()}.json`, JSON.stringify({ app: "vie-maline", version: 1, ...data }, null, 1), "application/json");
  toast("💾 Sauvegarde téléchargée (sans ta clé IA).");
});
$("#importInput").addEventListener("change", async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (d.app !== "vie-maline") throw new Error();
    if (!confirm("Remplacer tes données actuelles par cette sauvegarde ?")) return;
    S = { ...structuredClone(VIDE), ...d, settings: S.settings };
    delete S.app; delete S.version;
    sauver(); rendreBonjour(); planifierRappels(); toast("✅ Sauvegarde restaurée"); location.hash = "jour"; router();
  } catch { toast("⚠️ Ce fichier n'est pas une sauvegarde Vie Maline."); }
  e.target.value = "";
});
$("#resetBtn").addEventListener("click", () => {
  if (!confirm("Tout effacer (profil, tâches, habitudes, conversations) ? C'est définitif.")) return;
  localStorage.removeItem(KEY); S = structuredClone(VIDE); location.hash = ""; rendreBonjour(); router();
});

// ---------- Démarrage ----------
rendreBonjour();
router();
planifierRappels();
// on recalcule l'écran « Aujourd'hui » chaque minute (bloc en cours) et au retour dans l'appli
setInterval(() => { if (!focus && !$("#v-jour").hidden && jourVu === today()) rendreJour(); rendreBonjour(); }, 60e3);
document.addEventListener("visibilitychange", () => { if (!document.hidden && !focus) { if (jourVu < today() && !$("#v-jour").hidden) jourVu = today(); rafraichir(); planifierRappels(); } });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
