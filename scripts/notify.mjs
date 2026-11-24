// Envoie une notification (ntfy.sh) quand le conseil change pour un carburant.
// Lancé par GitHub Actions après la mise à jour de data/history.json.
import fs from "node:fs";
import { buildSeries, analyze } from "../analysis.js";

const TOPIC = process.env.NTFY_TOPIC || "plein-malin-cholet-maulevrier";
const SITE = process.env.SITE_URL || "";
const FUELS = (process.env.NOTIFY_FUELS || "Gazole,E10,SP95,SP98").split(",");
const NOTIFY_ON = new Set(["BUY_NOW", "BUY_SOON", "RISING"]);
const STATE = new URL("../data/signal.json", import.meta.url);

const hist = JSON.parse(fs.readFileSync(new URL("../data/history.json", import.meta.url)));
const prev = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE)) : {};
const next = {};
const euro = (m) => (m / 1000).toFixed(3).replace(".", ",") + " €";
const cap = (s) => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a, c) => a + c.toUpperCase());

for (const fuel of FUELS) {
  const s = buildSeries(hist, fuel, null, hist.generated.slice(0, 10));
  if (!s) continue;
  const a = analyze(s);
  if (!a) continue;
  next[fuel] = { code: a.code, date: a.date, cur: a.cur };
  const before = prev[fuel]?.code;
  if (before === a.code || !NOTIFY_ON.has(a.code)) continue;
  // Station la moins chère aujourd'hui
  const n = s.dates.length - 1;
  let best = null;
  for (const [sid, arr] of Object.entries(s.stations)) if (arr[n] != null && (!best || arr[n] < best.p)) best = { sid, p: arr[n] };
  const st = best && hist.stations[best.sid];
  const body = [a.why[0], best && st ? `Moins cher : ${euro(best.p)} à ${cap(st.ville)} (${st.adresse}).` : ""].filter(Boolean).join("\n");
  console.log(`[${fuel}] ${before ?? "—"} -> ${a.code}`);
  if (process.env.DRY_RUN) { console.log(body); continue; }
  const res = await fetch("https://ntfy.sh/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: TOPIC,
      title: `⛽ ${fuel} : ${a.label}`,
      message: body,
      tags: [a.code === "RISING" ? "chart_with_upwards_trend" : "white_check_mark"],
      priority: a.code === "BUY_NOW" ? 4 : 3,
      ...(SITE ? { click: SITE } : {}),
    }),
  });
  console.log("ntfy:", res.status);
}
fs.writeFileSync(STATE, JSON.stringify(next, null, 1) + "\n");
