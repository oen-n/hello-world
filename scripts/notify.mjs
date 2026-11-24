// Notifications OneSignal, lancées par GitHub Actions.
//
//   node scripts/notify.mjs advice    -> après la mise à jour des données : quand le conseil
//                                        change dans un département, prévient les abonnés
//                                        (étiquette zone = "<dép>:<carburant>")
//   node scripts/notify.mjs stations  -> toutes les 2 h : quand le prix d'une station bouge
//                                        d'au moins 2 ct, prévient ceux qui l'ont en favori
//                                        (étiquette station = "<id>:<carburant>")
//   node scripts/notify.mjs test      -> notification de test à tous les abonnés
//
// Variables : ONESIGNAL_API_KEY (secret), ONESIGNAL_APP_ID, SITE_URL, DRY_RUN=1 (n'envoie rien).
import fs from "node:fs";
import { buildSeries, analyze, depToHist } from "../analysis.js";

const MODE = process.argv[2] || "advice";
const APP = process.env.ONESIGNAL_APP_ID || "2ef78266-b783-4baf-a83a-b5d53f9a85d6";
const KEY = process.env.ONESIGNAL_API_KEY || "";
const SITE = process.env.SITE_URL || "";
const DRY = !!process.env.DRY_RUN;
const FUELS = ["Gazole", "E10", "SP95", "SP98", "E85", "GPLc"];
const NOTIFY_ON = new Set(["BUY_NOW", "BUY_SOON", "RISING"]);
const STATION_DELTA = 20;       // 2 centimes
const MAX_STATION_SENDS = 300;  // garde-fou par passage
const DATA = new URL("../data/", import.meta.url);
const API_EXPORT = "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/exports/json";

const euro = (m) => (m / 1000).toFixed(3).replace(".", ",") + " €";
const cts = (m) => (Math.abs(m) / 10).toFixed(1).replace(".", ",") + " ct";
const cap = (s) => String(s || "").toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a, c) => a + c.toUpperCase());
const readJSON = (u, d) => { try { return JSON.parse(fs.readFileSync(u)); } catch { return d; } };

let authScheme = null;
async function send(title, body, filters, segments = null) {
  const payload = {
    app_id: APP, target_channel: "push",
    headings: { en: title, fr: title }, contents: { en: body, fr: body },
    ...(segments ? { included_segments: segments } : { filters }), ...(SITE ? { url: SITE } : {}),
  };
  if (DRY) { console.log("[DRY]", title, "|", body.replace(/\n/g, " / "), JSON.stringify(filters)); return true; }
  if (!KEY) { console.log("Pas de clé ONESIGNAL_API_KEY : rien n'est envoyé."); return false; }
  // Les nouvelles clés utilisent "Key", les anciennes "Basic" : on garde celle qui marche.
  for (const scheme of authScheme ? [authScheme] : ["Key", "Basic"]) {
    const res = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `${scheme} ${KEY}` },
      body: JSON.stringify(payload),
    });
    const txt = await res.text();
    if (res.status === 401 || res.status === 403) { console.log(`OneSignal (${scheme}) refusé :`, txt.slice(0, 200)); continue; }
    authScheme = scheme;
    let id = "";
    try { id = JSON.parse(txt).id || ""; } catch { /* ignore */ }
    console.log(`OneSignal ${res.status} : ${title} -> ${id ? "envoyée" : "personne d'abonné"} ${txt.slice(0, 160)}`);
    return res.ok && !!id;
  }
  return false;
}

// ---- conseil par département ----
async function advice() {
  const stateUrl = new URL("signal.json", DATA);
  const prev = readJSON(stateUrl, {});
  const next = {};
  // Pas plus d'une notification par département et carburant toutes les 20 h (évite les allers-retours).
  const lastUrl = new URL("notified.json", DATA);
  const last = readJSON(lastUrl, {});
  const now = Date.now();
  const index = readJSON(new URL("dep/index.json", DATA), { deps: {} });
  let sent = 0;
  for (const dep of Object.keys(index.deps)) {
    const raw = readJSON(new URL(`dep/${dep}.json`, DATA), null);
    if (!raw) continue;
    const hist = depToHist(raw);
    next[dep] = {};
    for (const fuel of FUELS) {
      const s = buildSeries(hist, fuel, null, raw.generated.slice(0, 10));
      const a = s && analyze(s);
      if (!a) continue;
      next[dep][fuel] = a.code;
      const before = prev[dep]?.[fuel];
      if (!before || before === a.code || !NOTIFY_ON.has(a.code)) continue; // 1er passage : on mémorise seulement
      const k = `${dep}:${fuel}`;
      if (last[k] && now - Date.parse(last[k]) < 20 * 3600e3) continue;
      const n = s.dates.length - 1;
      let best = null;
      for (const [sid, arr] of Object.entries(s.stations)) if (arr[n] != null && (!best || arr[n] < best.p)) best = { sid, p: arr[n] };
      const st = best && raw.stations[best.sid];
      const body = [a.why[0], st ? `Le moins cher du département : ${euro(best.p)} à ${cap(st.v)}.` : ""].filter(Boolean).join("\n");
      if (await send(`⛽ ${fuel} : ${a.label}`, body, [{ field: "tag", key: "zone", relation: "=", value: k }])) { sent++; last[k] = new Date(now).toISOString(); }
    }
  }
  fs.writeFileSync(stateUrl, JSON.stringify(next) + "\n");
  fs.writeFileSync(lastUrl, JSON.stringify(last) + "\n");
  console.log(`Conseils : ${sent} notification(s) envoyée(s).`);
}

// ---- station préférée ----
async function stations() {
  const statePath = process.env.STATION_STATE || "station-state.json";
  const prev = readJSON(statePath, null);
  const sel = "id,ville,adresse," + FUELS.map((f) => `${f.toLowerCase()}_prix`).join(",");
  const res = await fetch(`${API_EXPORT}?select=${encodeURIComponent(sel)}`);
  if (!res.ok) throw new Error("API prix " + res.status);
  const rows = await res.json();
  const next = {}, changes = [];
  for (const r of rows) {
    for (const f of FUELS) {
      const v = r[f.toLowerCase() + "_prix"];
      if (!v) continue;
      const k = `${r.id}:${f}`, p = Math.round(v * 1000);
      const old = prev?.[k];
      // on garde le dernier prix "notifié" tant que l'écart reste < 2 ct
      if (old != null && Math.abs(p - old) >= STATION_DELTA) { changes.push({ k, p, d: p - old, r, f }); next[k] = p; }
      else next[k] = old ?? p;
    }
  }
  fs.writeFileSync(statePath, JSON.stringify(next));
  if (!prev) { console.log(`Premier passage : ${Object.keys(next).length} prix mémorisés.`); return; }
  changes.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  console.log(`${changes.length} station(s) ont bougé d'au moins 2 ct.`);
  let sent = 0;
  for (const c of changes.slice(0, MAX_STATION_SENDS)) {
    const up = c.d > 0;
    const title = `${up ? "📈" : "📉"} Ta station : ${c.f} ${up ? "+" : "−"}${cts(c.d)}`;
    const body = `${cap(c.r.ville)} – ${c.r.adresse || ""}\nNouveau prix : ${euro(c.p)}${up ? "" : " 👍"}`;
    if (await send(title, body, [{ field: "tag", key: "station", relation: "=", value: c.k }])) sent++;
  }
  console.log(`Stations : ${sent} notification(s) envoyée(s).`);
}

async function test() {
  const title = "⛽ Plein Malin : test", body = "Les notifications fonctionnent ! Tu seras prévenu au bon moment.";
  // 1) abonnés qui ont choisi une alerte ; 2) sinon, tous les téléphones abonnés (pour vérifier l'abonnement lui-même).
  if (await send(title, body, [{ field: "tag", key: "zone", relation: "exists" }, { operator: "OR" }, { field: "tag", key: "station", relation: "exists" }])) return;
  console.log("Aucun abonné avec une alerte choisie : essai vers tous les téléphones abonnés…");
  for (const seg of ["Total Subscriptions", "Subscribed Users"]) {
    if (await send(title, body + " (sans alerte choisie)", null, [seg])) return;
  }
  console.log("Aucun téléphone abonné dans OneSignal pour l'instant.");
}

await ({ advice, stations, test }[MODE] || advice)();
