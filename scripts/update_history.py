#!/usr/bin/env python3
"""Construit data/history.json : historique quotidien des prix carburants
autour de Maulévrier / Cholet, à partir des données officielles
(donnees.roulez-eco.fr + data.economie.gouv.fr).

Usage : python3 scripts/update_history.py [--archive fichier.xml ...]
Sans --archive, télécharge les archives annuelles (année en cours + précédente).
"""
import argparse, datetime as dt, io, json, math, os, sys, urllib.request, zipfile
import xml.etree.ElementTree as ET

CENTER = (47.04, -0.82)        # entre Maulévrier et Cholet
RADIUS_KM = 22
DAYS_KEPT = 400
CARRY_MAX_DAYS = 20            # un prix non mis à jour depuis + longtemps est ignoré
FUELS = ["Gazole", "E10", "SP95", "SP98", "E85", "GPLc"]
API = ("https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/"
       "prix-des-carburants-en-france-flux-instantane-v2/records")
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "history.json")


def dist_km(lat1, lon1, lat2, lon2):
    r = 6371
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "prix-carburant-app"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()


def parse_archive(stream, stations, changes):
    """changes[(id, fuel)] = list of (datetime, price)"""
    for _, el in ET.iterparse(stream, events=("end",)):
        if el.tag != "pdv":
            continue
        try:
            lat = float(el.get("latitude")) / 100000
            lon = float(el.get("longitude")) / 100000
        except (TypeError, ValueError):
            el.clear(); continue
        if dist_km(lat, lon, *CENTER) <= RADIUS_KM:
            sid = el.get("id")
            stations.setdefault(sid, {
                "adresse": (el.findtext("adresse") or "").strip(),
                "ville": (el.findtext("ville") or "").strip(),
                "cp": el.get("cp"), "lat": round(lat, 5), "lon": round(lon, 5)})
            for p in el.findall("prix"):
                try:
                    t = dt.datetime.fromisoformat(p.get("maj")[:19])
                    v = float(p.get("valeur"))
                except (TypeError, ValueError):
                    continue
                if v > 10: v /= 1000  # anciens formats en millièmes
                changes.setdefault((sid, p.get("nom")), []).append((t, v))
        el.clear()


def fetch_live(stations, changes):
    where = f"within_distance(geom, geom'POINT({CENTER[1]} {CENTER[0]})', {RADIUS_KM}km)"
    url = API + "?" + urllib.parse.urlencode({"limit": 100, "where": where})
    data = json.loads(fetch(url))
    for r in data["results"]:
        sid = str(r["id"])
        g = r.get("geom") or {}
        stations[sid] = {"adresse": r.get("adresse") or "", "ville": r.get("ville") or "",
                         "cp": r.get("cp"), "lat": g.get("lat"), "lon": g.get("lon")}
        for f in FUELS:
            v, m = r.get(f.lower() + "_prix"), r.get(f.lower() + "_maj")
            if v and m:
                t = dt.datetime.fromisoformat(m[:19])
                changes.setdefault((sid, f), []).append((t, float(v)))


def build(stations, changes):
    today = dt.date.today()
    start = today - dt.timedelta(days=DAYS_KEPT - 1)
    days = [start + dt.timedelta(days=i) for i in range(DAYS_KEPT)]
    out_fuels = {}
    for fuel in FUELS:
        per_station = {}
        for sid in stations:
            ch = sorted(changes.get((sid, fuel), []))
            if not ch:
                continue
            series, j, last, last_t = [], 0, None, None
            for d in days:
                end = dt.datetime.combine(d, dt.time(23, 59, 59))
                while j < len(ch) and ch[j][0] <= end:
                    last_t, last = ch[j]; j += 1
                if last is not None and (d - last_t.date()).days <= CARRY_MAX_DAYS:
                    series.append(round(last * 1000))   # en millièmes d'euro
                else:
                    series.append(None)
            if any(v is not None for v in series[-60:]):
                per_station[sid] = series
        if not per_station:
            continue
        avg, mn = [], []
        for i in range(len(days)):
            vals = [s[i] for s in per_station.values() if s[i] is not None]
            avg.append(round(sum(vals) / len(vals)) if len(vals) >= 3 else None)
            mn.append(min(vals) if len(vals) >= 3 else None)
        out_fuels[fuel] = {"avg": avg, "min": mn, "stations": per_station}
    used = {sid for f in out_fuels.values() for sid in f["stations"]}
    return {
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "center": CENTER, "radius_km": RADIUS_KM,
        "start": start.isoformat(), "unit": "millièmes d'euro / litre",
        "stations": {k: v for k, v in stations.items() if k in used},
        "fuels": out_fuels,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--archive", nargs="*", help="fichiers XML annuels déjà téléchargés")
    ap.add_argument("--no-live", action="store_true")
    args = ap.parse_args()
    stations, changes = {}, {}
    if args.archive:
        for path in args.archive:
            with open(path, "rb") as f:
                parse_archive(f, stations, changes)
    else:
        year = dt.date.today().year
        for y in (year - 1, year):
            print(f"Téléchargement archive {y}…", file=sys.stderr)
            z = zipfile.ZipFile(io.BytesIO(fetch(f"https://donnees.roulez-eco.fr/opendata/annee/{y}")))
            with z.open(z.namelist()[0]) as f:
                parse_archive(f, stations, changes)
    if not args.no_live:
        try:
            fetch_live(stations, changes)
        except Exception as e:  # l'archive suffit si l'API est en panne
            print("API instantanée indisponible :", e, file=sys.stderr)
    data = build(stations, changes)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"OK : {len(data['stations'])} stations, carburants {list(data['fuels'])}", file=sys.stderr)


if __name__ == "__main__":
    import urllib.parse
    main()
