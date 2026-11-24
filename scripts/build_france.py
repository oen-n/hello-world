#!/usr/bin/env python3
"""Construit l'historique quotidien des prix carburants pour TOUTE la France,
un fichier par département : data/dep/<code>.json (+ data/dep/index.json).

Sources officielles :
  - archives annuelles  https://donnees.roulez-eco.fr/opendata/annee/<année>
  - prix en direct      data.economie.gouv.fr (flux instantané v2)

Chaque fichier contient, par carburant :
  avg / min : prix moyen et plus bas du département, un nombre par jour depuis le
              1er janvier de l'année précédente (date fixe => petits diffs git) ;
  st        : prix de chaque station sur les dernières semaines (depuis stStart),
              pour repérer les stations qui montent ou baissent.
Prix en millièmes d'euro / litre (1999 = 1,999 €).

Usage : python3 scripts/build_france.py [--archive A.xml B.xml] [--no-live] [--only 49,85]
"""
import argparse, datetime as dt, io, json, os, sys, urllib.parse, urllib.request, zipfile
import xml.etree.ElementTree as ET
from array import array

FUELS = ["Gazole", "E10", "SP95", "SP98", "E85", "GPLc"]
CARRY_MAX_DAYS = 20
MIN_STATIONS = 3
API_EXPORT = ("https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/"
              "prix-des-carburants-en-france-flux-instantane-v2/exports/json")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "dep")


def dep_of(cp):
    cp = (cp or "").strip()
    if len(cp) != 5 or not cp.isdigit():
        return None
    if cp.startswith("97") or cp.startswith("98"):
        return cp[:3]
    if cp.startswith("20"):
        return "2A" if int(cp) < 20200 else "2B"
    return cp[:2]


def fetch(url, timeout=300):
    req = urllib.request.Request(url, headers={"User-Agent": "plein-malin"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


class Store:
    def __init__(self, anchor, ndays):
        self.anchor, self.ndays = anchor, ndays
        self.meta = {}       # sid -> dict
        self.ch = {}         # (sid, fuel) -> array('i') [day, price, day, price, ...]

    def add(self, sid, fuel, when, price):
        if fuel not in FUELS or price <= 0:
            return
        day = (when.date() - self.anchor).days
        if day < -60 or day >= self.ndays:
            return
        day = max(day, -1)  # tout ce qui précède l'ancre compte comme "veille de l'ancre"
        a = self.ch.get((sid, fuel))
        if a is None:
            a = self.ch[(sid, fuel)] = array("i")
        p = int(round(price * 1000)) if price < 10 else int(round(price))
        if len(a) >= 2 and a[-2] == day:
            a[-1] = p
        elif len(a) >= 2 and a[-2] > day:   # désordre (rare) : on insère au bon endroit
            pairs = sorted(list(zip(a[0::2], a[1::2])) + [(day, p)], key=lambda x: x[0])
            dedup = {}
            for d, v in pairs:
                dedup[d] = v
            a[:] = array("i", [x for d in sorted(dedup) for x in (d, dedup[d])])
        else:
            a.append(day); a.append(p)


def parse_archive(stream, store):
    for _, el in ET.iterparse(stream, events=("end",)):
        if el.tag != "pdv":
            continue
        sid = el.get("id")
        try:
            lat = float(el.get("latitude")) / 100000
            lon = float(el.get("longitude")) / 100000
        except (TypeError, ValueError):
            lat = lon = None
        store.meta[sid] = {"a": (el.findtext("adresse") or "").strip(),
                           "v": (el.findtext("ville") or "").strip(),
                           "cp": el.get("cp"),
                           "lat": round(lat, 5) if lat else None,
                           "lon": round(lon, 5) if lon else None}
        for p in el.findall("prix"):
            try:
                t = dt.datetime.fromisoformat(p.get("maj")[:19])
                v = float(p.get("valeur"))
            except (TypeError, ValueError):
                continue
            store.add(sid, p.get("nom"), t, v)
        el.clear()


def add_live(store):
    sel = "id,adresse,ville,cp,geom," + ",".join(f"{f.lower()}_prix,{f.lower()}_maj" for f in FUELS)
    data = json.loads(fetch(API_EXPORT + "?" + urllib.parse.urlencode({"select": sel})))
    for r in data:
        sid = str(r["id"])
        g = r.get("geom") or {}
        m = store.meta.setdefault(sid, {})
        m.update({"a": r.get("adresse") or m.get("a", ""), "v": r.get("ville") or m.get("v", ""),
                  "cp": r.get("cp") or m.get("cp"), "lat": g.get("lat", m.get("lat")), "lon": g.get("lon", m.get("lon"))})
        for f in FUELS:
            v, t = r.get(f.lower() + "_prix"), r.get(f.lower() + "_maj")
            if v and t:
                store.add(sid, f, dt.datetime.fromisoformat(t[:19]), float(v))
    return len(data)


def build(store, today, only=None):
    n = store.ndays
    st_start_date = (today.replace(day=1) - dt.timedelta(days=14))
    st_start = (st_start_date - store.anchor).days
    deps = {}
    for (sid, fuel), a in store.ch.items():
        m = store.meta.get(sid) or {}
        dep = dep_of(m.get("cp"))
        if not dep or (only and dep not in only):
            continue
        # série quotidienne de la station (prix reporté au plus CARRY_MAX_DAYS jours)
        series = [None] * n
        k, last, last_day = 0, None, None
        npairs = len(a) // 2
        for d in range(n):
            while k < npairs and a[2 * k] <= d:
                last_day, last = a[2 * k], a[2 * k + 1]; k += 1
            if last is not None and d - last_day <= CARRY_MAX_DAYS:
                series[d] = last
        if all(v is None for v in series[-45:]):
            continue  # station fermée / plus mise à jour
        D = deps.setdefault(dep, {"fuels": {}, "stations": set()})
        F = D["fuels"].setdefault(fuel, {"sum": [0] * n, "cnt": [0] * n, "min": [None] * n, "st": {}})
        for d, v in enumerate(series):
            if v is None:
                continue
            F["sum"][d] += v; F["cnt"][d] += 1
            if F["min"][d] is None or v < F["min"][d]:
                F["min"][d] = v
        F["st"][sid] = series[st_start:]
        D["stations"].add(sid)

    os.makedirs(OUT, exist_ok=True)
    generated = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    index = {}
    for dep, D in sorted(deps.items()):
        fuels = {}
        for fuel in FUELS:
            F = D["fuels"].get(fuel)
            if not F:
                continue
            avg = [round(s / c) if c >= MIN_STATIONS else None for s, c in zip(F["sum"], F["cnt"])]
            mn = [m if c >= MIN_STATIONS else None for m, c in zip(F["min"], F["cnt"])]
            if all(v is None for v in avg[-30:]):
                continue
            fuels[fuel] = {"avg": avg, "min": mn, "st": F["st"]}
        if not fuels:
            continue
        used = {sid for f in fuels.values() for sid in f["st"]}
        out = {"v": 2, "dep": dep, "generated": generated, "start": store.anchor.isoformat(),
               "stStart": st_start_date.isoformat(), "unit": "millièmes d'euro / litre",
               "stations": {sid: store.meta[sid] for sid in sorted(used)}, "fuels": fuels}
        with open(os.path.join(OUT, f"{dep}.json"), "w", encoding="utf-8") as fh:
            json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
        index[dep] = {"stations": len(used), "fuels": list(fuels)}
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as fh:
        json.dump({"generated": generated, "deps": index}, fh, ensure_ascii=False, separators=(",", ":"))
    return index


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--archive", nargs="*")
    ap.add_argument("--no-live", action="store_true")
    ap.add_argument("--only", help="codes département séparés par des virgules (test)")
    ap.add_argument("--today")
    args = ap.parse_args()
    today = dt.date.fromisoformat(args.today) if args.today else dt.date.today()
    anchor = dt.date(today.year - 1, 1, 1)
    store = Store(anchor, (today - anchor).days + 1)
    if args.archive:
        for path in args.archive:
            print("Lecture", path, file=sys.stderr)
            with open(path, "rb") as fh:
                parse_archive(fh, store)
    else:
        for y in (today.year - 1, today.year):
            print(f"Téléchargement archive {y}…", file=sys.stderr)
            z = zipfile.ZipFile(io.BytesIO(fetch(f"https://donnees.roulez-eco.fr/opendata/annee/{y}")))
            with z.open(z.namelist()[0]) as fh:
                parse_archive(fh, store)
    if not args.no_live:
        try:
            print("Prix en direct :", add_live(store), "stations", file=sys.stderr)
        except Exception as e:
            print("Prix en direct indisponibles :", e, file=sys.stderr)
    only = set(args.only.split(",")) if args.only else None
    index = build(store, today, only)
    print(f"OK : {len(index)} départements, {sum(d['stations'] for d in index.values())} stations", file=sys.stderr)


if __name__ == "__main__":
    main()
