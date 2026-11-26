// =====================================================================
// Carbu Malin · « Mon trajet » : où s'arrêter pour payer le carburant
// le moins cher sur un long trajet, selon sa voiture et son réservoir.
//
//  1. Itinéraire : service officiel de l'IGN (data.geopf.fr), gratuit.
//  2. Stations à moins de X km de la route : prix officiels en direct.
//  3. Calcul des arrêts : on cherche la combinaison d'arrêts (et de litres
//     à mettre à chaque arrêt) qui coûte le moins cher, sans jamais
//     descendre sous la réserve, en comptant le petit détour pour aller
//     à la station et en évitant les arrêts inutiles.
// =====================================================================

const GEOCODE = "https://data.geopf.fr/geocodage/search";
const ROUTE = "https://data.geopf.fr/navigation/itineraire";
const PRICES = "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/exports/json";
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

export const VEHICULES = [
  { id: "citadine", nom: "Citadine", reservoir: 40, conso: 5.5 },
  { id: "compacte", nom: "Compacte / berline", reservoir: 50, conso: 6.5 },
  { id: "suv", nom: "Familiale / SUV", reservoir: 60, conso: 7.5 },
  { id: "utilitaire", nom: "Utilitaire / camping-car", reservoir: 80, conso: 10 },
];

// ---------- géographie ----------
const R = 6371;
export function km(a, b) {
  const r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Ramène l'itinéraire à un point tous les `step` km, avec la distance parcourue.
export function resample(coords, step = 0.5) {
  const out = [{ p: coords[0], s: 0 }];
  let s = 0, since = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = km(coords[i - 1], coords[i]);
    s += d; since += d;
    if (since >= step || i === coords.length - 1) { out.push({ p: coords[i], s }); since = 0; }
  }
  return out;
}

// Position d'une station sur la route : kilomètre le plus proche et écart à la route.
export function project(line, pt) {
  let best = { s: 0, off: Infinity };
  for (const v of line) {
    const d = km(v.p, pt);
    if (d < best.off) best = { s: v.s, off: d };
  }
  return best;
}

// ---------- services ----------
export async function geocode(q, limit = 6) {
  const r = await fetch(`${GEOCODE}?q=${encodeURIComponent(q)}&limit=${limit}&autocomplete=1`);
  if (!r.ok) throw new Error("recherche d'adresse indisponible");
  const d = await r.json();
  return (d.features || []).map((f) => ({
    label: f.properties.label, city: f.properties.city, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1],
  }));
}

export async function route(a, b) {
  const url = `${ROUTE}?resource=bdtopo-osrm&profile=car&optimization=fastest&geometryFormat=geojson&getSteps=false`
    + `&distanceUnit=kilometer&timeUnit=minute&start=${a.lon},${a.lat}&end=${b.lon},${b.lat}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("itinéraire introuvable");
  const d = await r.json();
  if (!d.geometry?.coordinates?.length) throw new Error("itinéraire introuvable");
  return { coords: d.geometry.coordinates, km: d.distance, min: d.duration };
}

// Stations près de la route : des cercles tous les 6 km, par paquets de 40.
export async function stationsAlong(line, corridor, fuel) {
  const pts = [];
  let last = -Infinity;
  for (const v of line) if (v.s - last >= 6) { pts.push(v.p); last = v.s; }
  pts.push(line[line.length - 1].p);
  const radius = Math.max(corridor, 2) + 3.2;
  const f = fuel.toLowerCase();
  const sel = `id,adresse,ville,cp,geom,${f}_prix,${f}_maj`;
  const chunks = [];
  for (let i = 0; i < pts.length; i += 40) chunks.push(pts.slice(i, i + 40));
  const results = await Promise.all(chunks.map(async (c) => {
    const where = `(${c.map(([x, y]) => `within_distance(geom, geom'POINT(${x.toFixed(4)} ${y.toFixed(4)})', ${radius}km)`).join(" OR ")}) AND ${f}_prix IS NOT NULL`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(`${PRICES}?select=${encodeURIComponent(sel)}&where=${encodeURIComponent(where)}`);
        if (r.ok) return r.json();
      } catch { /* on réessaie */ }
    }
    throw new Error("prix des stations indisponibles");
  }));
  const seen = new Map();
  for (const list of results) for (const s of list) {
    const prix = s[f + "_prix"], maj = s[f + "_maj"];
    if (!prix || !s.geom || (maj && Date.now() - Date.parse(maj) > 15 * 86400000)) continue;
    const pr = project(line, [s.geom.lon, s.geom.lat]);
    if (pr.off > corridor) continue;
    seen.set(String(s.id), { id: String(s.id), ville: s.ville, adresse: s.adresse, cp: s.cp, lat: s.geom.lat, lon: s.geom.lon,
      prix: Math.round(prix * 1000) / 1000, maj, s: pr.s, off: pr.off });
  }
  return [...seen.values()].sort((a, b) => a.s - b.s);
}

// ---------- calcul des arrêts ----------
// Garde, tous les 10 km de route, les 3 stations les moins chères (détour compris).
function prune(stations, conso) {
  const buckets = new Map();
  for (const st of stations) {
    const k = Math.floor(st.s / 10);
    const eff = st.prix * (1 + (2 * st.off * conso) / 40); // ~ coût du détour sur un plein moyen
    (buckets.get(k) || buckets.set(k, []).get(k)).push({ st, eff });
  }
  const keep = [];
  for (const arr of buckets.values()) arr.sort((a, b) => a.eff - b.eff).slice(0, 3).forEach((x) => keep.push(x.st));
  return keep.sort((a, b) => a.s - b.s);
}

/**
 * opts : { totalKm, stations, reservoir (L), conso (L/100 km), depart (L dans le réservoir),
 *          reserve (L mini à tout moment), arrivee (L voulus à l'arrivée), penalite (€ par arrêt), achatMin (L) }
 * Renvoie { possible, arrets: [{ station, litres, cout, plein }], cout, litres, arriveeLitres } ou { possible: false, raison }.
 */
export function plan(opts) {
  const C = opts.reservoir, c = opts.conso / 100, reserve = opts.reserve, penalite = opts.penalite ?? 1.5, achatMin = opts.achatMin ?? 5;
  const target = Math.min(C, Math.max(opts.arrivee ?? reserve, reserve));
  const st = prune(opts.stations, c);
  // nœuds : départ, stations, arrivée
  const nodes = [{ s: 0, off: 0, prix: null }, ...st, { s: opts.totalKm, off: 0, prix: null, dest: true }];
  const N = nodes.length;
  const dist = (i, j) => (nodes[j].s - nodes[i].s) + nodes[i].off + nodes[j].off;
  const q = (x) => Math.round(x * 2) / 2;
  // pour chaque nœud : liste d'états { f (litres à l'arrivée), cost, prev, buy }
  const states = Array.from({ length: N }, () => []);
  const push = (j, s) => {
    const L = states[j];
    for (const o of L) if (o.f >= s.f && o.cost <= s.cost) return; // dominé
    for (let k = L.length - 1; k >= 0; k--) if (L[k].f <= s.f && L[k].cost >= s.cost) L.splice(k, 1);
    L.push(s);
  };
  push(0, { f: q(opts.depart), cost: 0, prev: null, buy: 0 });
  for (let i = 0; i < N - 1; i++) {
    for (const s of states[i]) {
      // niveaux de réservoir possibles en repartant de i
      const levels = new Set([s.f]);
      if (i > 0) {
        levels.add(C);
        for (let j = i + 1; j < N; j++) {
          const need = dist(i, j) * c + (nodes[j].dest ? target : reserve);
          if (need > C + 1e-9) break;
          if (need > s.f) levels.add(Math.min(C, Math.max(q(need + 0.49), s.f + achatMin)));
        }
      }
      for (const g of levels) {
        const buy = g - s.f;
        if (buy < 0 || (buy > 0 && buy < achatMin - 1e-9 && g < C)) continue;
        const cost = s.cost + (buy > 0 ? buy * nodes[i].prix + penalite : 0);
        for (let j = i + 1; j < N; j++) {
          const used = dist(i, j) * c;
          const arrive = g - used;
          if (arrive < (nodes[j].dest ? target : reserve) - 1e-9) { if (g - (nodes[j].s - nodes[i].s) * c < reserve) break; continue; }
          if (!nodes[j].dest && buy === 0 && i > 0) continue; // s'arrêter sans rien acheter n'a pas de sens
          push(j, { f: q(arrive), cost, prev: s, buy, at: i, g });
        }
      }
    }
  }
  const fin = states[N - 1];
  if (!fin.length) {
    const firstReach = st.find((x) => x.s * c + x.off * c <= opts.depart - reserve);
    return { possible: false, raison: firstReach ? "Impossible de faire ce trajet avec ces réglages (réservoir trop petit ou stations trop éloignées)." : "Pas assez de carburant pour atteindre la première station du trajet : fais le plein avant de partir." };
  }
  const best = fin.reduce((a, b) => (b.cost < a.cost ? b : a));
  const arrets = [];
  for (let s = best; s && s.prev; s = s.prev) {
    if (s.at > 0 && s.buy > 0) arrets.push({ station: nodes[s.at], litres: Math.round(s.buy), cout: s.buy * nodes[s.at].prix, plein: Math.abs(s.g - C) < 0.6 });
  }
  arrets.reverse();
  const litres = arrets.reduce((t, a) => t + a.litres, 0);
  const cout = arrets.reduce((t, a) => t + a.cout, 0);
  return { possible: true, arrets, litres, cout, arriveeLitres: best.f };
}

// ---------- carte (Leaflet, chargée seulement quand on en a besoin) ----------
let leafletReady = null;
export function loadLeaflet() {
  if (leafletReady) return leafletReady;
  leafletReady = new Promise((ok, ko) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = LEAFLET_CSS; css.crossOrigin = "";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = LEAFLET_JS; js.crossOrigin = ""; js.onload = () => ok(window.L); js.onerror = () => { leafletReady = null; ko(new Error("carte indisponible")); };
    document.head.appendChild(js);
  });
  return leafletReady;
}
