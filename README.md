# ⛽ Plein Malin – Carburant Cholet & Maulévrier

Application pour téléphone (s'installe depuis le navigateur, Android et iPhone) qui montre :

- **les stations les moins chères** autour de Maulévrier et Cholet (rayon 22 km), avec itinéraire Maps / Waze ;
- **le conseil du jour** : *Attends, ça baisse encore* / *Bientôt le prix le plus bas* / *Fais le plein maintenant* / *Ça remonte* ;
- l'évolution des prix (1 mois, 3 mois, 1 an), la durée et l'ampleur habituelles des baisses et des hausses, le jour de la semaine le moins cher ;
- des **notifications** sur le téléphone (via l'appli gratuite ntfy) quand le conseil change.

Données : prix officiels du Ministère de l'Économie (prix-carburants.gouv.fr / data.economie.gouv.fr).

## Comment ça marche

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css`, `app.js` | L'application (aucune installation, aucun serveur) |
| `analysis.js` | Détection des baisses / creux / hausses et conseil |
| `data/history.json` | Historique quotidien des prix de chaque station (≈ 13 mois) |
| `scripts/update_history.py` | Reconstruit l'historique depuis les archives officielles |
| `scripts/notify.mjs` | Envoie une notification ntfy quand le conseil change |
| `.github/workflows/update-prices.yml` | Lance les deux scripts toutes les 2 h et enregistre les données |

## Mise en ligne (une seule fois)

1. Fusionner cette branche dans `main`.
2. Sur GitHub : **Settings → Pages → Build and deployment → Source : Deploy from a branch → `main` / `/ (root)`** → Save.
3. Sur GitHub : **Actions** → autoriser les workflows si demandé → *Mise à jour des prix* → *Run workflow* (pour tester).
4. L'appli est en ligne à l'adresse `https://<utilisateur>.github.io/<dépôt>/` : c'est ce lien qu'on partage.

Le dépôt doit être **public** pour GitHub Pages gratuit.

## Notifications

Installer l'appli **ntfy** et s'abonner au sujet `plein-malin-cholet-maulevrier`
(modifiable via la variable de dépôt `NTFY_TOPIC` et la constante `NTFY_TOPIC` de `app.js`).

## Avertissement

Les conseils viennent de l'historique et des tendances du moment : personne ne peut prédire
les prix à coup sûr. Sur l'année passée, suivre les conseils aurait fait gagner environ
1 à 1,5 ct/L par plein ; choisir la station la moins chère fait gagner jusqu'à 30 ct/L.
