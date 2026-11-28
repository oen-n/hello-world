# Story quotidienne « La météo des prix » à partir des vraies données (data/dep/*.json, data/signal.json).
# python3 promo/stories/meteo.py  -> écrit promo/stories/meteo.html (puis capture avec capture.cjs)
import json, glob, os, datetime
R = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(R, '..', '..')
NOMS = {"01":"Ain","02":"Aisne","03":"Allier","04":"Alpes-de-Hte-Provence","05":"Hautes-Alpes","06":"Alpes-Maritimes","07":"Ardèche","08":"Ardennes","09":"Ariège","10":"Aube","11":"Aude","12":"Aveyron","13":"Bouches-du-Rhône","14":"Calvados","15":"Cantal","16":"Charente","17":"Charente-Maritime","18":"Cher","19":"Corrèze","2A":"Corse-du-Sud","2B":"Haute-Corse","21":"Côte-d'Or","22":"Côtes-d'Armor","23":"Creuse","24":"Dordogne","25":"Doubs","26":"Drôme","27":"Eure","28":"Eure-et-Loir","29":"Finistère","30":"Gard","31":"Haute-Garonne","32":"Gers","33":"Gironde","34":"Hérault","35":"Ille-et-Vilaine","36":"Indre","37":"Indre-et-Loire","38":"Isère","39":"Jura","40":"Landes","41":"Loir-et-Cher","42":"Loire","43":"Haute-Loire","44":"Loire-Atlantique","45":"Loiret","46":"Lot","47":"Lot-et-Garonne","48":"Lozère","49":"Maine-et-Loire","50":"Manche","51":"Marne","52":"Haute-Marne","53":"Mayenne","54":"Meurthe-et-Moselle","55":"Meuse","56":"Morbihan","57":"Moselle","58":"Nièvre","59":"Nord","60":"Oise","61":"Orne","62":"Pas-de-Calais","63":"Puy-de-Dôme","64":"Pyrénées-Atlantiques","65":"Hautes-Pyrénées","66":"Pyrénées-Orientales","67":"Bas-Rhin","68":"Haut-Rhin","69":"Rhône","70":"Haute-Saône","71":"Saône-et-Loire","72":"Sarthe","73":"Savoie","74":"Haute-Savoie","75":"Paris","76":"Seine-Maritime","77":"Seine-et-Marne","78":"Yvelines","79":"Deux-Sèvres","80":"Somme","81":"Tarn","82":"Tarn-et-Garonne","83":"Var","84":"Vaucluse","85":"Vendée","86":"Vienne","87":"Haute-Vienne","88":"Vosges","89":"Yonne","90":"Territoire de Belfort","91":"Essonne","92":"Hauts-de-Seine","93":"Seine-St-Denis","94":"Val-de-Marne","95":"Val-d'Oise"}
deps = {}
for f in glob.glob(os.path.join(ROOT, 'data/dep/[0-9]*.json')):
    d = json.load(open(f)); deps[os.path.basename(f)[:-5]] = d
sig = json.load(open(os.path.join(ROOT, 'data/signal.json')))
def last(a, back=0):
    v = [x for x in a if x is not None]; return v[-1-back] if len(v) > back else None
out = {}
for fuel in ['Gazole', 'E10']:
    now, wk, par = [], [], {}
    for k, d in deps.items():
        a = d['fuels'].get(fuel, {}).get('avg') or []
        n, w = last(a), last(a, 7)
        if n and w and k in NOMS: now.append(n); wk.append(w); par[k] = n
    m = sum(now)/len(now); mw = sum(wk)/len(wk)
    lo = min(par, key=par.get); hi = max(par, key=par.get)
    out[fuel] = dict(prix=m/1000, diff=(m-mw)/10, lo=(NOMS[lo], par[lo]/1000), hi=(NOMS[hi], par[hi]/1000))
codes = [v.get('Gazole') for v in sig.values() if v.get('Gazole')]
from collections import Counter
c = Counter(codes); top, nb = c.most_common(1)[0]
LAB = {"BUY_NOW":("✅","Fais le plein maintenant"),"BUY_SOON":("⏳","Bientôt le prix le plus bas"),"WAIT":("📉","Attends, ça baisse encore"),"RISING":("📈","Ça remonte"),"STABLE":("➖","Prix stables")}
gen = datetime.datetime.fromisoformat(max(d['generated'] for d in deps.values()))
JOURS = ["lundi","mardi","mercredi","jeudi","vendredi","samedi","dimanche"]; MOIS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"]
date = f"{JOURS[gen.weekday()].capitalize()} {gen.day} {MOIS[gen.month-1]}"
eur = lambda x: f"{x:.3f}".replace('.', ',') + " €"
def ligne(fuel, nom):
    o = out[fuel]; d = o['diff']; fl = "📉" if d < -0.2 else "📈" if d > 0.2 else "➖"; col = "#1fbf75" if d < -0.2 else "#ff7a59" if d > 0.2 else "#ccd"
    return f'<div class="row"><div><b>{nom}</b><small>moyenne France</small></div><div class="p">{eur(o["prix"])}<span style="color:{col}">{fl} {(f'{d:+.1f}').replace('.', ',')} ct en 7 j</span></div></div>'.replace('.', ',', 0)
g = out['Gazole']
html = open(os.path.join(R, 'meteo.tpl.html')).read()
html = html.replace('{{DATE}}', date).replace('{{GAZOLE}}', ligne('Gazole', '⛽ Gazole')).replace('{{E10}}', ligne('E10', '⛽ SP95-E10')) \
  .replace('{{LO}}', f'{g["lo"][0]} · {eur(g["lo"][1])}').replace('{{HI}}', f'{g["hi"][0]} · {eur(g["hi"][1])}') \
  .replace('{{ECART}}', f'{(g["hi"][1]-g["lo"][1])*100:.0f}'.replace('.', ',')) \
  .replace('{{SIG}}', f'{LAB[top][0]} {LAB[top][1]}').replace('{{SIGN}}', f'{nb} départements sur {len(codes)}')
open(os.path.join(R, 'meteo.html'), 'w').write(html)
print(date, json.dumps(out, ensure_ascii=False), top, nb, len(codes))
