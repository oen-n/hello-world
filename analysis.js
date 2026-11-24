// Analyse des prix : tendance, creux, conseil "faire le plein maintenant ou attendre".
// Module partagé par l'application (navigateur) et le script de notification (Node).
// Les prix sont en millièmes d'euro par litre (1999 = 1,999 €).

const DAY = 86400000;

export function isoDay(d) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  return new Date(d.getTime() + n * DAY).toISOString().slice(0, 10);
}

function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Construit les séries quotidiennes d'un carburant, en ajoutant les prix "en direct"
// (live = { idStation: { prix: 1999, maj: "2026-11-24T..." } }) pour aujourd'hui.
export function buildSeries(hist, fuel, live = null, today = isoDay(new Date())) {
  const f = hist.fuels[fuel];
  if (!f) return null;
  const n0 = f.avg.length;
  const dates = Array.from({ length: n0 }, (_, i) => addDays(hist.start, i));
  const stations = {};
  for (const [sid, arr] of Object.entries(f.stations)) stations[sid] = arr.slice();
  // Prolonge jusqu'à aujourd'hui si l'historique a quelques jours de retard.
  while (dates[dates.length - 1] < today) {
    dates.push(addDays(dates[dates.length - 1], 1));
    for (const arr of Object.values(stations)) arr.push(arr[arr.length - 1] ?? null);
  }
  const last = dates.length - 1;
  if (live) {
    for (const [sid, v] of Object.entries(live)) {
      if (!v || !v.prix) continue;
      if (!stations[sid]) stations[sid] = new Array(dates.length).fill(null);
      const ageDays = (Date.parse(today) - Date.parse(String(v.maj).slice(0, 10))) / DAY;
      stations[sid][last] = ageDays <= 20 ? v.prix : null;
    }
  }
  const avg = [], min = [];
  for (let i = 0; i < dates.length; i++) {
    if (i < n0 - 1 || (i === n0 - 1 && !live && dates.length === n0)) {
      avg.push(f.avg[i]); min.push(f.min[i]); continue;
    }
    const vals = Object.values(stations).map((a) => a[i]).filter((v) => v != null);
    avg.push(vals.length >= 3 ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null);
    min.push(vals.length >= 3 ? Math.min(...vals) : null);
  }
  return { fuel, dates, avg, min, stations };
}

// Remplit les trous (valeur précédente) pour avoir une série continue.
function filled(a) {
  const out = [];
  let prev = a.find((v) => v != null) ?? null;
  for (const v of a) { if (v != null) prev = v; out.push(prev); }
  return out;
}

// Zigzag : repère les sommets et les creux, en ignorant les mouvements < seuil.
export function pivots(a, threshold) {
  const pts = [];
  let dir = 0, extI = 0, hiI = 0, loI = 0;
  for (let i = 1; i < a.length; i++) {
    const v = a[i];
    if (dir === 0) {
      if (v > a[hiI]) hiI = i;
      if (v < a[loI]) loI = i;
      if (v - a[loI] >= threshold) { pts.push({ i: loI, type: "creux" }); dir = 1; extI = i; }
      else if (a[hiI] - v >= threshold) { pts.push({ i: hiI, type: "sommet" }); dir = -1; extI = i; }
    } else if (dir === 1) {
      if (v >= a[extI]) extI = i;
      else if (a[extI] - v >= threshold) { pts.push({ i: extI, type: "sommet" }); dir = -1; extI = i; }
    } else {
      if (v <= a[extI]) extI = i;
      else if (v - a[extI] >= threshold) { pts.push({ i: extI, type: "creux" }); dir = 1; extI = i; }
    }
  }
  return { pts, dir, extI };
}

export const SIGNALS = {
  BUY_NOW: { label: "Fais le plein maintenant", icon: "✅", level: "good" },
  BUY_SOON: { label: "Bientôt le prix le plus bas", icon: "⏳", level: "warning" },
  WAIT: { label: "Attends, ça baisse encore", icon: "📉", level: "warning" },
  RISING: { label: "Ça remonte", icon: "📈", level: "critical" },
  STABLE: { label: "Prix stables", icon: "➖", level: "neutral" },
};

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

// Analyse complète. `upTo` permet de rejouer l'analyse à une date passée (test).
export function analyze(series, upTo = series.dates.length - 1) {
  const avgAll = filled(series.avg.slice(0, upTo + 1));
  const n = avgAll.length - 1;
  if (n < 14 || avgAll[n] == null) return null;
  const cur = avgAll[n];
  const at = (k) => avgAll[Math.max(0, n - k)];
  const d1 = cur - at(1), d3 = cur - at(3), d7 = cur - at(7);

  // Combien de stations ont monté / baissé leur prix depuis 2 jours.
  let ups = 0, downs = 0;
  for (const arr of Object.values(series.stations)) {
    const now = arr[n], before = arr[Math.max(0, n - 2)];
    if (now == null || before == null) continue;
    if (now - before >= 3) ups++;
    else if (before - now >= 3) downs++;
  }

  // Lissage sur 3 jours puis zigzag (seuil 2 centimes).
  const sm = avgAll.map((v, i) => {
    const w = avgAll.slice(Math.max(0, i - 2), i + 1);
    return w.reduce((s, x) => s + x, 0) / w.length;
  });
  const T = 20;
  const { pts, dir, extI } = pivots(sm, T);
  const lookback = Math.max(0, n - 365);
  const declines = [], rises = [];
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    if (b.i < lookback) continue;
    const leg = { days: b.i - a.i, amount: Math.round(sm[b.i] - sm[a.i]), from: a.i, to: b.i };
    (b.type === "creux" ? declines : rises).push(leg);
  }
  const typicalDecline = declines.length
    ? { days: Math.round(median(declines.map((l) => l.days))), amount: Math.round(median(declines.map((l) => -l.amount))), count: declines.length }
    : null;
  const typicalRise = rises.length
    ? { days: Math.round(median(rises.map((l) => l.days))), amount: Math.round(median(rises.map((l) => l.amount))), count: rises.length }
    : null;

  // Phase actuelle : depuis le dernier sommet (baisse) ou le dernier creux (hausse).
  const lastPivot = pts.length ? pts[pts.length - 1] : { i: 0, type: "creux" };
  const phase = dir === -1 ? "baisse" : dir === 1 ? "hausse" : "stable";
  const legStart = lastPivot.i;
  const legDays = n - legStart;
  const legAmount = Math.round(cur - avgAll[legStart]);
  const fromExtreme = Math.round(cur - avgAll[extI]); // >0 : on remonte depuis le plus bas récent

  // Fourchette des 90 derniers jours.
  const w90 = avgAll.slice(Math.max(0, n - 90));
  const lo90 = Math.min(...w90), hi90 = Math.max(...w90);
  const pos90 = hi90 > lo90 ? (cur - lo90) / (hi90 - lo90) : 0.5;

  // Jour de la semaine en moyenne le moins cher (écart à la moyenne glissante 7 j).
  const dev = Array.from({ length: 7 }, () => []);
  for (let i = Math.max(3, n - 365); i <= n - 3; i++) {
    const w = avgAll.slice(i - 3, i + 4);
    const m = w.reduce((s, x) => s + x, 0) / 7;
    dev[new Date(series.dates[i] + "T12:00:00Z").getUTCDay()].push(avgAll[i] - m);
  }
  const devMean = dev.map((v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0));
  const bestDay = devMean.indexOf(Math.min(...devMean));
  const worstDay = devMean.indexOf(Math.max(...devMean));

  // ---- Décision ----
  let code, why = [];
  const risingNow = d1 >= 4 || (ups >= 2 && ups >= 2 * Math.max(1, downs)) || fromExtreme >= 8;
  const fallingNow = d3 <= -6 || (downs >= 2 && downs >= 2 * Math.max(1, ups));
  const cts = (m) => (Math.abs(m) / 10).toFixed(1).replace(".", ",") + " ct";

  if (phase === "baisse") {
    if (risingNow && !fallingNow) {
      code = "BUY_NOW";
      why.push(`Après ${legDays} jours de baisse (${cts(legAmount)}), les prix commencent à remonter : c'est le bon moment, juste avant la hausse.`);
    } else if (fallingNow) {
      const nearEnd = typicalDecline && (-legAmount >= 0.8 * typicalDecline.amount || legDays >= typicalDecline.days);
      code = nearEnd ? "BUY_SOON" : "WAIT";
      why.push(`Ça baisse depuis ${legDays} jours (${cts(legAmount)} de moins).`);
      if (typicalDecline) {
        why.push(`D'habitude, une baisse dure environ ${typicalDecline.days} jours et fait ${cts(typicalDecline.amount)}.`);
        const left = typicalDecline.amount + legAmount;
        if (!nearEnd && left > 0) why.push(`Il pourrait rester environ ${cts(left)} de baisse : si ton réservoir le permet, attends un peu.`);
        if (nearEnd && -legAmount > 1.5 * typicalDecline.amount) why.push("Cette baisse est plus forte que d'habitude. Tant que les stations continuent de baisser, tu peux attendre ; dès que des stations remontent, l'appli te dira d'y aller.");
        else if (nearEnd) why.push("On approche du creux : fais le plein dans les 1-2 jours, ou dès que les prix arrêtent de baisser.");
      }
    } else {
      code = "BUY_NOW";
      why.push(`La baisse s'essouffle (${cts(legAmount)} en ${legDays} jours) : on est proche du point bas.`);
    }
  } else if (phase === "hausse") {
    if (fallingNow) {
      code = "WAIT";
      why.push("Après une hausse, les prix commencent à redescendre : attends quelques jours si tu peux.");
    } else if (d3 >= 5 || risingNow) {
      code = "RISING";
      why.push(`Ça monte depuis ${legDays} jours (+${cts(legAmount)}).`);
      why.push("Si tu dois faire le plein, fais-le maintenant : ça risque d'être encore plus cher demain. Sinon, mets juste ce qu'il faut et attends la prochaine baisse.");
    } else {
      code = "STABLE";
      why.push(`Les prix se sont calmés après une hausse de ${cts(legAmount)}.`);
    }
  } else {
    code = "STABLE";
  }
  if (code === "STABLE") why.push(`Pas de gros mouvement en ce moment. Astuce : le ${JOURS[bestDay]} est en moyenne le jour le moins cher, le ${JOURS[worstDay]} le plus cher.`);

  return {
    code, ...SIGNALS[code], why,
    date: series.dates[n], cur, d1, d3, d7, ups, downs,
    phase, legDays, legAmount, typicalDecline, typicalRise,
    lo90, hi90, pos90, bestDay: JOURS[bestDay], worstDay: JOURS[worstDay],
    weekday: devMean.map((v, i) => ({ jour: JOURS[i], ecart: v })),
  };
}

// Rejoue le conseil sur l'historique : prix payé en suivant l'appli vs. sans.
// Scénario : un plein tous les `every` jours. Sans l'appli, on le fait un jour au
// hasard de la période ; avec, dès qu'elle dit "Fais le plein" / "Ça remonte"
// (ou le dernier jour au plus tard).
export function backtest(series, days = 365, every = 7) {
  const avgAll = filled(series.avg);
  const n = avgAll.length - 1;
  const start = Math.max(30, n - days);
  let naive = 0, smart = 0, count = 0;
  for (let s = start; s + every <= n; s += every) {
    // Sans l'appli : un jour quelconque de la période (moyenne des jours).
    naive += avgAll.slice(s, s + every).reduce((x, y) => x + y, 0) / every;
    let paid = null;
    for (let i = s; i < s + every; i++) {
      const a = analyze(series, i);
      if (a && (a.code === "BUY_NOW" || a.code === "RISING")) { paid = avgAll[i]; break; }
    }
    smart += paid ?? avgAll[s + every - 1];
    count++;
  }
  return count ? { perLitre: (naive - smart) / count, count } : null;
}
