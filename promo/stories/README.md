# Stories et Reels automatiques (Instagram @applis.malines)

Préparer : `cd` à la racine du dépôt, `python3 -m http.server 8765 &` (les pages sont capturées depuis localhost).

## Story du midi : « La météo des prix » (vraies données)
1. Données fraîches : `git fetch origin main && git checkout origin/main -- data`
2. `python3 promo/stories/meteo.py` (écrit `meteo.html`, affiche les chiffres)
3. `node promo/stories/capture.cjs http://localhost:8765/promo/stories/meteo.html promo/stories/jour/meteo-AAAA-MM-JJ.jpg`
4. Commit + push sur la branche de travail, puis publier en story via
   `https://raw.githubusercontent.com/oen-n/hello-world/<sha>/promo/stories/jour/meteo-AAAA-MM-JJ.jpg`

## Story du soir : astuces
Images prêtes dans `astuces/astuce-NN.jpg` (14, textes dans `astuce.html`). L'index suivant est dans `etat.json` : publier, puis incrémenter (modulo 14), commit + push.

## Reels
Pages animées dans `../reels/` (`engine.js`), rendu image par image avec `../reels/rendu.cjs`,
musique originale avec `../reels/musique.py`, assemblage ffmpeg (voir l'historique git).
URL vidéo : `https://cdn.jsdelivr.net/gh/oen-n/hello-world@<sha>/promo/instagram/<fichier>.mp4`
