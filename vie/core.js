// ===== Vie Maline : le « cerveau » sans IA =====
// Fonctions pures : dates, lecture des phrases en français, programme du jour,
// habitudes et analyse des bilans. Aucune dépendance, aucune donnée envoyée.

// ---------- Heures et dates ----------
export const toMin = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  return m ? (+m[1]) * 60 + (+m[2]) : null;
};
export const toHHMM = (min) => {
  const x = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};
export const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const fromIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (iso, n) => { const d = fromIso(iso); d.setDate(d.getDate() + n); return isoDate(d); };
export const today = () => isoDate(new Date());
export const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

export const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
export const JOURS_COURTS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export function jourLong(iso) {
  const d = fromIso(iso), t = today();
  const base = `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
  if (iso === t) return `Aujourd'hui, ${base}`;
  if (iso === addDays(t, 1)) return `Demain, ${base}`;
  if (iso === addDays(t, -1)) return `Hier, ${base}`;
  return base.charAt(0).toUpperCase() + base.slice(1);
}
export function jourCourt(iso) {
  const t = today();
  if (iso === t) return "aujourd'hui";
  if (iso === addDays(t, 1)) return "demain";
  const d = fromIso(iso);
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
}
export const fmtH = (hhmm) => (hhmm ? hhmm.replace(":", "h").replace(/h00$/, "h") : "");

// ---------- Lire une tâche dite en français ----------
// « appeler maman demain à 18h » → { titre: "Appeler maman", date: <demain>, heure: "18:00" }
export function lireTache(texte, ref = new Date()) {
  let t = ` ${String(texte || "").trim()} `;
  let date = null, heure = null;
  const refIso = isoDate(ref);
  const cut = (re) => { t = t.replace(re, " "); };

  // heure : « à 18h », « 18h30 », « à 9 heures », « 14:15 », « midi », « minuit »
  let m = /\s(?:à|a|vers|pour)?\s*(\d{1,2})\s*(?:h|heures?|:)\s*(\d{2})?(?=\s|$|[,.!?])/i.exec(t);
  if (m && +m[1] < 24) { heure = toHHMM(+m[1] * 60 + (+(m[2] || 0))); cut(m[0]); }
  else if ((m = /\s(?:à|a|vers)?\s*midi(?=\s|$)/i.exec(t))) { heure = "12:00"; cut(m[0]); }
  else if ((m = /\s(?:à|a|vers)?\s*minuit(?=\s|$)/i.exec(t))) { heure = "00:00"; cut(m[0]); }

  // jour
  if ((m = /\s(aujourd'hui|aujourd’hui|ce matin|cet après-midi|cet aprem|ce soir)(?=\s|$|[,.!?])/i.exec(t))) {
    date = refIso;
    const w = m[1].toLowerCase();
    if (!heure && w === "ce soir") heure = "19:00";
    if (!heure && w === "ce matin") heure = "09:00";
    if (!heure && w.startsWith("cet")) heure = "14:00";
    cut(m[0]);
  } else if ((m = /\s(après-demain|apres-demain|après demain)(?=\s|$|[,.!?])/i.exec(t))) {
    date = addDays(refIso, 2); cut(m[0]);
  } else if ((m = /\s(demain)(?:\s+(matin|soir|midi|après-midi))?(?=\s|$|[,.!?])/i.exec(t))) {
    date = addDays(refIso, 1);
    if (!heure && m[2]) heure = { matin: "09:00", soir: "19:00", midi: "12:00", "après-midi": "14:00" }[m[2].toLowerCase()];
    cut(m[0]);
  } else if ((m = /\s(?:ce\s+|le\s+|la semaine prochaine\s+)?(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)(?:\s+prochain)?(?:\s+(matin|soir))?(?=\s|$|[,.!?])/i.exec(t))) {
    const target = JOURS.indexOf(m[1].toLowerCase());
    let diff = (target - ref.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    date = addDays(refIso, diff);
    if (!heure && m[2]) heure = m[2].toLowerCase() === "matin" ? "09:00" : "19:00";
    cut(m[0]);
  } else if ((m = /\s(?:le\s+)?(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?=\s|$|[,.!?])/i.exec(t))) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : ref.getFullYear();
    let d = new Date(y, +m[2] - 1, +m[1]);
    if (!m[3] && isoDate(d) < refIso) d = new Date(y + 1, +m[2] - 1, +m[1]);
    if (!isNaN(d)) { date = isoDate(d); cut(m[0]); }
  } else if ((m = /\s(?:le\s+)(\d{1,2})(?:er)?(?:\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre))?(?=\s|$|[,.!?])/i.exec(t))) {
    const jour = +m[1];
    if (jour >= 1 && jour <= 31) {
      const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      let mois = m[2] ? MOIS.findIndex((x) => norm(x) === norm(m[2].toLowerCase())) : ref.getMonth();
      let d = new Date(ref.getFullYear(), mois, jour);
      if (isoDate(d) < refIso) d = m[2] ? new Date(ref.getFullYear() + 1, mois, jour) : new Date(ref.getFullYear(), mois + 1, jour);
      date = isoDate(d); cut(m[0]);
    }
  } else if ((m = /\s(?:dans\s+)(\d+)\s+jours?(?=\s|$)/i.exec(t))) {
    date = addDays(refIso, +m[1]); cut(m[0]);
  }
  if (heure && !date) date = toMin(heure) < ref.getHours() * 60 + ref.getMinutes() ? addDays(refIso, 1) : refIso;

  // nettoyage : « penser à », « il faut que je », « rappelle-moi de »…
  let titre = t.replace(/\s+/g, " ").trim()
    .replace(/^(rappelle[- ]moi\s+(de|d'|qu'il faut)\s*|n'oublie pas\s+(de|d')\s*|penser\s+à\s*|pense\s+à\s*|il faut que je\s+|je dois\s+)/i, "")
    .replace(/[\s,.;:-]+$/, "");
  titre = titre.charAt(0).toUpperCase() + titre.slice(1);
  return { titre, date, heure };
}

// ---------- Objectifs et habitudes ----------
export const OBJECTIFS = [
  { id: "lever", ico: "⏰", nom: "Me lever tôt" },
  { id: "sommeil", ico: "😴", nom: "Mieux dormir" },
  { id: "manger", ico: "🥗", nom: "Bien manger" },
  { id: "telephone", ico: "📵", nom: "Moins de téléphone" },
  { id: "sport", ico: "🏃", nom: "Faire du sport" },
  { id: "organise", ico: "🗂️", nom: "Être organisé" },
  { id: "focus", ico: "🎯", nom: "Être concentré" },
  { id: "stress", ico: "🧘", nom: "Moins de stress" },
  { id: "lecture", ico: "📖", nom: "Lire plus" },
  { id: "argent", ico: "💶", nom: "Gérer mon argent" },
  { id: "social", ico: "🤝", nom: "Voir mes proches" },
];

export const HABITUDES_PAR_OBJECTIF = {
  lever: [{ id: "h-lever", ico: "⏰", nom: "Levé à l'heure" }],
  sommeil: [{ id: "h-coucher", ico: "🛏️", nom: "Couché à l'heure" }],
  manger: [{ id: "h-legumes", ico: "🥗", nom: "Fruits et légumes à chaque repas" }, { id: "h-eau", ico: "💧", nom: "1,5 L d'eau" }],
  telephone: [{ id: "h-tel-matin", ico: "📵", nom: "Pas de téléphone la 1re demi-heure" }, { id: "h-ecrans-soir", ico: "🌙", nom: "Écrans coupés 1 h avant de dormir" }],
  sport: [{ id: "h-bouger", ico: "🏃", nom: "Bouger 30 min" }],
  organise: [{ id: "h-planifier", ico: "🗒️", nom: "Préparer demain le soir" }],
  focus: [{ id: "h-focus", ico: "🎯", nom: "Une séance de travail sans distraction" }],
  stress: [{ id: "h-respirer", ico: "🧘", nom: "Respirer / méditer 5 min" }],
  lecture: [{ id: "h-lire", ico: "📖", nom: "Lire 15 min" }],
  argent: [{ id: "h-depenses", ico: "💶", nom: "Noter mes dépenses" }],
  social: [{ id: "h-proche", ico: "🤝", nom: "Prendre des nouvelles d'un proche" }],
};
export function habitudesDepuisObjectifs(objectifs) {
  const out = [];
  for (const o of objectifs) for (const h of HABITUDES_PAR_OBJECTIF[o] || []) if (!out.some((x) => x.id === h.id)) out.push({ ...h });
  if (!out.length) out.push({ id: "h-eau", ico: "💧", nom: "1,5 L d'eau" }, { id: "h-bouger", ico: "🏃", nom: "Bouger 30 min" });
  return out;
}

// Série de jours d'affilée où l'habitude est cochée (aujourd'hui compte s'il est coché, sinon on part d'hier)
export function serie(days, habId, fromIso = today()) {
  let n = 0, d = fromIso;
  if (!days[d]?.habits?.[habId]) d = addDays(d, -1);
  while (days[d]?.habits?.[habId]) { n++; d = addDays(d, -1); }
  return n;
}

// ---------- Le programme du jour ----------
// Construit la journée à partir du profil : sommeil, repas, travail découpé en
// séances de concentration, sport, temps pour soi, coupure des écrans.
export function genererPlan(p, iso, taches = []) {
  const d = fromIso(iso), jour = d.getDay();
  const obj = new Set(p.objectifs || []);
  const reveil = toMin(p.reveil) ?? 420;
  let coucher = toMin(p.coucher) ?? 1380;
  if (coucher <= reveil) coucher += 1440; // coucher après minuit
  const blocs = [];
  const add = (debut, fin, titre, ico, type, conseil = "") => {
    if (debut == null || fin == null || fin <= debut) return;
    blocs.push({ id: `${type}-${debut}`, debut: toHHMM(debut), fin: toHHMM(fin), _d: debut, _f: fin, titre, ico, type, conseil });
  };

  const travaille = (p.travailJours || []).includes(jour);
  const tDeb = toMin(p.travailDebut), tFin = toMin(p.travailFin);
  const sportDuJour = (p.sportJours || []).includes(jour);
  const sDeb = toMin(p.sportHeure), sDur = +p.sportDuree || 60;

  // Matin
  add(reveil, reveil + 15, "Réveil : verre d'eau et lumière du jour", "🌅", "matin",
    obj.has("telephone") ? "Ne regarde pas ton téléphone tout de suite : ouvre les volets, bois un grand verre d'eau." : "Ouvre les volets et bois un grand verre d'eau : ça réveille mieux qu'un café.");
  const routineFin = reveil + (obj.has("stress") || obj.has("sport") ? 35 : 25);
  add(reveil + 15, routineFin, obj.has("stress") ? "Respiration et étirements" : "Douche, habillage", obj.has("stress") ? "🧘" : "🚿", "matin",
    obj.has("stress") ? "5 minutes de respiration lente (inspire 4 s, expire 6 s), puis quelques étirements." : "");
  let pdj = toMin(p.petitDej) ?? routineFin;
  if (pdj < routineFin) pdj = routineFin;
  add(pdj, pdj + 20, "Petit-déjeuner", "🥣", "repas", obj.has("manger") ? "Des protéines (œuf, yaourt, fromage blanc) et un fruit tiennent plus longtemps que des céréales sucrées." : "");
  if (obj.has("organise") || travaille) add(pdj + 20, pdj + 30, "Je regarde mon programme du jour", "🗒️", "orga", "Repère ta tâche la plus importante et fais-la en premier.");

  // Repas
  const dej = toMin(p.dejeuner) ?? 750, din = toMin(p.diner) ?? 1170;

  // Travail : séances de 90 min max entrecoupées de pauses, coupées par le déjeuner
  if (travaille && tDeb != null && tFin != null && tFin > tDeb) {
    const segments = dej > tDeb && dej < tFin ? [[tDeb, dej], [dej + 60, tFin]] : [[tDeb, tFin]];
    let n = 0;
    for (const [a, b] of segments) {
      const len = b - a;
      if (len < 20) continue;
      const k = Math.ceil(len / 100); // séances de 90 min environ, pauses de 10 min
      const seance = (len - (k - 1) * 10) / k;
      for (let i = 0; i < k; i++) {
        const r5 = (x) => Math.round(x / 5) * 5;
        const deb = i === 0 ? a : r5(a + i * (seance + 10)), fin = i === k - 1 ? b : r5(a + i * (seance + 10) + seance);
        n++;
        add(deb, fin, n === 1 ? `${p.metier ? cap(p.metier) : "Travail"} : la tâche la plus importante` : `${p.metier ? cap(p.metier) : "Travail"} : séance ${n}`, "💼", "travail",
          n === 1 ? "Commence par le plus dur, téléphone en mode Ne pas déranger." : "");
        if (i < k - 1) add(fin, fin + 10, "Pause : lève-toi, bouge, bois de l'eau", "☕", "pause", "Pas de réseaux sociaux pendant la pause : ça fatigue le cerveau au lieu de le reposer.");
      }
    }
  }
  add(dej, dej + (travaille ? 45 : 60), "Déjeuner", "🍽️", "repas",
    obj.has("manger") ? "La moitié de l'assiette en légumes, un quart de protéines, un quart de féculents. Mange sans écran." : "Mange sans écran, et marche 10 minutes après si tu peux.");

  // Sport
  if (sportDuJour && sDeb != null) add(sDeb, sDeb + sDur, p.sport ? cap(p.sport) : "Sport", "🏃", "sport", "Prépare tes affaires à l'avance, c'est la moitié du chemin.");
  else if (obj.has("sport")) {
    const marche = travaille && tFin ? tFin + 15 : (dej + 120);
    add(marche, marche + 30, "Marche ou petite séance (30 min)", "🚶", "sport", "Même sans séance prévue, 30 minutes de marche comptent.");
  }

  // le dîner passe après le sport s'ils se chevauchent
  const sportBloc = blocs.find((b) => b.type === "sport");
  let dinR = din;
  if (sportBloc && din < sportBloc._f && din + 40 > sportBloc._d) dinR = sportBloc._f + 15;
  add(dinR, dinR + 40, "Dîner", "🍲", "repas", obj.has("manger") ? "Plus léger que le midi, et au moins 2 h avant de te coucher." : "");

  // Temps pour soi (hobbies) s'il reste de la place le soir
  if (p.hobbies) {
    const libre = trouverCreneau(blocs, dinR + 40, coucher - 75, 45);
    if (libre != null) add(libre, libre + 45, `Temps pour toi : ${p.hobbies}`, "🎸", "loisir", "C'est aussi important que le reste.");
  }
  if (!travaille) {
    const c = trouverCreneau(blocs, reveil + 60, dej, 60);
    if (c != null) add(c, c + 60, "Les choses à faire de la liste", "✅", "taches", "Avance tes tâches en attente : une à la fois.");
  }

  // Soir
  if (obj.has("organise")) add(coucher - 75, coucher - 65, "Je prépare demain", "🗒️", "orga", "Note les 3 choses importantes de demain. L'esprit se repose mieux quand c'est écrit.");
  add(coucher - 60, coucher - 15, obj.has("lecture") ? "Écrans coupés : lecture" : "Écrans coupés : détente", "🌙", "soir",
    "Mets le téléphone à charger loin du lit. La lumière des écrans retarde le sommeil.");
  add(coucher - 15, coucher, "Bilan de la journée (2 min)", "📝", "bilan", "Comment s'est passée ta journée ? Note-la plus bas.");
  add(coucher, coucher + 5, `Au lit (${dureeSommeil(p)} de sommeil)`, "😴", "dodo", "");

  // Tâches à heure fixe
  for (const t of taches) {
    if (t.date !== iso || !t.heure || t.fait) continue;
    const a = toMin(t.heure);
    blocs.push({ id: `tache-${t.id}`, debut: t.heure, fin: toHHMM(a + 15), _d: a, _f: a + 15, titre: t.titre, ico: "🔔", type: "tache", conseil: "", tacheId: t.id });
  }

  blocs.sort((a, b) => a._d - b._d || a._f - b._f);
  return blocs.map(({ _d, _f, ...b }) => b);
}

function trouverCreneau(blocs, de, a, duree) {
  const occ = blocs.map((b) => [b._d, b._f]).sort((x, y) => x[0] - y[0]);
  let c = de;
  for (const [s, f] of occ) {
    if (f <= c) continue;
    if (s - c >= duree && c + duree <= a) return c;
    c = Math.max(c, f);
  }
  return c + duree <= a ? c : null;
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function dureeSommeil(p) {
  const r = toMin(p.reveil) ?? 420, c = toMin(p.coucher) ?? 1380;
  const m = (r - c + 1440) % 1440 || 1440;
  return `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}`;
}
export const minutesSommeil = (p) => ((toMin(p.reveil) ?? 420) - (toMin(p.coucher) ?? 1380) + 1440) % 1440;

// ---------- Lire un récit pour pré-remplir le profil (sans IA) ----------
export function lireRecit(txt) {
  const t = ` ${(txt || "").toLowerCase()} `;
  const out = {};
  const h = (s, mn) => toHHMM(+s * 60 + (+(mn || 0)));
  let m;
  if ((m = /(?:me |je me )l[eè]ve?\s+(?:vers |à |a )?(\d{1,2})\s*h\s*(\d{2})?/.exec(t))) out.reveil = h(m[1], m[2]);
  if ((m = /(?:lever|réveiller|reveiller) (?:à|a|vers) (\d{1,2})\s*h\s*(\d{2})?/.exec(t))) out.reveil = h(m[1], m[2]);
  if ((m = /(?:couche|coucher|dors|dormir)\s+(?:vers |à |a )?(\d{1,2})\s*h\s*(\d{2})?/.exec(t))) {
    let hh = +m[1]; if (hh < 12 && hh > 4) hh += 12; out.coucher = h(hh % 24, m[2]);
  }
  if ((m = /de (\d{1,2})\s*h\s*(\d{2})?\s*(?:à|a|jusqu'à)\s*(\d{1,2})\s*h\s*(\d{2})?/.exec(t))) {
    out.travailDebut = h(m[1], m[2]); out.travailFin = h(m[3], m[4]);
  }
  const jours = (re) => {
    const mm = re.exec(t); if (!mm) return null;
    const seg = mm[0];
    if (/lundi au vendredi|semaine/.test(seg)) return [1, 2, 3, 4, 5];
    if (/lundi au samedi/.test(seg)) return [1, 2, 3, 4, 5, 6];
    const r = JOURS.map((j, i) => (seg.includes(j) ? i : -1)).filter((i) => i >= 0);
    return r.length ? r : null;
  };
  const tj = jours(/(?:travaille|bosse|boulot|cours|école|fac|taf)[^.]{0,60}/);
  if (tj) out.travailJours = tj;
  const sportMots = ["foot", "football", "basket", "course", "courir", "running", "salle", "muscu", "musculation", "natation", "piscine", "tennis", "boxe", "vélo", "yoga", "danse", "rugby", "handball", "judo", "marche"];
  for (const s of sportMots) {
    const re = new RegExp(`\\b${s}\\b`);
    const phrase = t.split(/[.!?\n]/).find((x) => re.test(x));
    if (phrase) {
      out.sport = s === "courir" ? "course" : s;
      const seg = phrase;
      const sj = JOURS.map((j, k) => (seg.includes(j) ? k : -1)).filter((k) => k >= 0);
      if (sj.length) out.sportJours = sj;
      const sh = /(\d{1,2})\s*h\s*(\d{2})?/.exec(seg);
      if (sh) out.sportHeure = h(sh[1], sh[2]);
      break;
    }
  }
  const objectifs = [];
  if (/lever (plus )?tôt|lever plus tot|me lever à/.test(t)) objectifs.push("lever");
  if (/dors mal|mal dormir|fatigu|sommeil|insomni/.test(t)) objectifs.push("sommeil");
  if (/manger|grignot|malbouffe|fast[- ]food|régime|kilos|poids/.test(t)) objectifs.push("manger");
  if (/téléphone|telephone|tiktok|insta|réseaux|reseaux|écran|ecran|scroll/.test(t)) objectifs.push("telephone");
  if (/sport|muscu|courir|bouger/.test(t)) objectifs.push("sport");
  if (/oubli|organis|bordel|procrastin/.test(t)) objectifs.push("organise");
  if (/concentr|distrait|focus/.test(t)) objectifs.push("focus");
  if (/stress|anxi|angoiss|pression/.test(t)) objectifs.push("stress");
  if (/lire|lecture|livre/.test(t)) objectifs.push("lecture");
  if (/argent|dépense|depense|budget|économ/.test(t)) objectifs.push("argent");
  if (objectifs.length) out.objectifs = objectifs;
  return out;
}

// ---------- Conseils du jour ----------
const CONSEILS = {
  lever: ["Pour te lever tôt, couche-toi tôt : avance ton coucher de 15 minutes par semaine, pas plus.", "Mets ton réveil loin du lit : tu devras te lever pour l'éteindre.", "Même heure de lever le week-end (à 1 h près) : c'est le secret des gens qui se lèvent facilement."],
  sommeil: ["Chambre fraîche (18-19 °C), noire et sans téléphone : trois réglages qui changent tout.", "Pas de café après 14 h : il agit encore 6 h plus tard.", "Si tu ne dors pas au bout de 20 minutes, lève-toi et lis un peu à la lumière douce."],
  manger: ["Bois un verre d'eau avant chaque repas : on confond souvent soif et faim.", "Prépare tes repas du midi le dimanche : moins de fast-food dans la semaine.", "Garde des fruits à portée de main et les gâteaux hors de vue."],
  telephone: ["Désactive toutes les notifications sauf les messages de tes proches.", "Mets tes applis de réseaux sociaux dans un dossier sur la 2e page de l'écran.", "Passe l'écran en noir et blanc le soir : il devient beaucoup moins attirant."],
  sport: ["Le meilleur sport est celui que tu fais vraiment : commence par 10 minutes.", "Prépare ton sac de sport la veille et pose-le devant la porte.", "Marche 10 minutes après le repas : ça aide la digestion et la glycémie."],
  organise: ["Règle des 2 minutes : si ça prend moins de 2 minutes, fais-le tout de suite.", "Chaque soir, choisis 3 tâches pour demain, pas plus.", "Tout ce qui te passe par la tête, mets-le dans « À faire » : ton cerveau est fait pour réfléchir, pas pour stocker."],
  focus: ["Une seule tâche à la fois : le multitâche fait perdre jusqu'à 40 % d'efficacité.", "Téléphone dans une autre pièce pendant le travail : même éteint, le voir distrait.", "Travaille par séances de 25 à 50 minutes avec une vraie pause entre deux."],
  stress: ["Inspire 4 secondes, expire 6 secondes, pendant 2 minutes : ton corps se calme tout seul.", "Écris ce qui t'inquiète sur papier : ça prend moins de place dans la tête.", "Une marche dehors de 20 minutes baisse nettement le stress."],
  lecture: ["10 pages par jour = environ 12 livres par an.", "Garde un livre sur ta table de nuit à la place du téléphone."],
  argent: ["Note chaque dépense pendant une semaine : tu verras où part ton argent.", "Avant un achat non prévu, attends 48 h : la moitié des envies disparaissent."],
  social: ["Envoie un message à quelqu'un que tu n'as pas vu depuis longtemps.", "Prévois un moment avec un proche cette semaine, même court."],
  base: ["Une journée réussie, ce n'est pas tout faire : c'est faire l'important.", "La lumière du jour le matin règle ton horloge interne : sors 10 minutes.", "Sois indulgent avec toi : une journée ratée n'efface pas les bonnes."],
};
export function conseilDuJour(objectifs, iso) {
  const pool = [...(objectifs || []).flatMap((o) => CONSEILS[o] || []), ...CONSEILS.base];
  let h = 0; for (const c of iso) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return pool[h % pool.length];
}

// ---------- Analyse des bilans ----------
export function analyser(days, habits, nbJours = 14) {
  const t = today();
  const liste = [];
  for (let i = 0; i < nbJours; i++) { const d = addDays(t, -i); if (days[d]) liste.push({ d, ...days[d] }); }
  const avecBilan = liste.filter((x) => x.bilan?.humeur);
  const moy = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const res = {
    jours: liste.length,
    bilans: avecBilan.length,
    humeur: moy(avecBilan.map((x) => x.bilan.humeur)),
    energie: moy(avecBilan.filter((x) => x.bilan.energie).map((x) => x.bilan.energie)),
    focusMin: liste.reduce((a, x) => a + (x.focusMin || 0), 0),
    habitudes: habits.map((h) => ({ ...h, fait: liste.filter((x) => x.habits?.[h.id]).length })),
    constats: [],
  };
  // Comparaison simple : humeur les jours où une habitude est faite vs non faite
  for (const h of habits) {
    const oui = avecBilan.filter((x) => x.habits?.[h.id]).map((x) => x.bilan.humeur);
    const non = avecBilan.filter((x) => !x.habits?.[h.id]).map((x) => x.bilan.humeur);
    if (oui.length >= 2 && non.length >= 2) {
      const diff = moy(oui) - moy(non);
      if (diff >= 0.5) res.constats.push(`Les jours où tu fais « ${h.nom} », ton humeur est meilleure (${moy(oui).toFixed(1)}/5 contre ${moy(non).toFixed(1)}/5).`);
    }
  }
  const sommeils = avecBilan.filter((x) => x.bilan.sommeil);
  if (sommeils.length >= 3) {
    const bien = sommeils.filter((x) => x.bilan.sommeil >= 7).map((x) => x.bilan.humeur);
    const mal = sommeils.filter((x) => x.bilan.sommeil < 7).map((x) => x.bilan.humeur);
    if (bien.length && mal.length && moy(bien) - moy(mal) >= 0.5) res.constats.push(`Quand tu dors 7 h ou plus, ta journée est notée ${moy(bien).toFixed(1)}/5, contre ${moy(mal).toFixed(1)}/5 sinon.`);
    const ms = moy(sommeils.map((x) => x.bilan.sommeil));
    if (ms < 7) res.constats.push(`Tu dors en moyenne ${ms.toFixed(1)} h : essaie de viser au moins 7 h.`);
  }
  return res;
}

// ---------- Fichier agenda (.ics) avec rappels ----------
export function ics(evenements) {
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = (iso, hhmm) => { const [y, m, d] = iso.split("-"); const [h, mi] = hhmm.split(":"); return `${y}${m}${d}T${h}${mi}00`; };
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const now = new Date();
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Vie Maline//FR", "CALSCALE:GREGORIAN"];
  for (const e of evenements) {
    const finIso = e.fin < e.debut ? addDays(e.date, 1) : e.date;
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@vie-maline`, `DTSTAMP:${dtstamp}`,
      `DTSTART:${stamp(e.date, e.debut)}`, `DTEND:${stamp(finIso, e.fin)}`, `SUMMARY:${esc(e.titre)}`);
    if (e.note) lines.push(`DESCRIPTION:${esc(e.note)}`);
    if (e.rappel !== false) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.titre)}`, `TRIGGER:-PT${e.avance ?? 5}M`, "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
