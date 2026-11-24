# ⛽ Plein Malin – Prix des carburants partout en France

Application pour téléphone (s'installe depuis le navigateur, Android et iPhone) :

- **Partout en France** : on choisit sa ville (ou sa position GPS) et un rayon de 5 à 30 km ;
- **les stations les moins chères** autour de soi, avec itinéraire Maps / Waze ;
- **⭐ sa station préférée** : son prix, son classement, l'économie possible ailleurs ;
- **le conseil du jour** pour son département : *Attends, ça baisse encore* / *Bientôt le prix le plus bas* / *Fais le plein maintenant* / *Ça remonte* ;
- l'évolution des prix (1 mois, 3 mois, 1 an), la durée habituelle des baisses et des hausses, le jour le moins cher ;
- **des notifications** sans autre appli (OneSignal) : le bon moment dans son département et/ou les changements de prix de sa station préférée (≥ 2 ct).

Données : prix officiels du Ministère de l'Économie (prix-carburants.gouv.fr / data.economie.gouv.fr, Licence Ouverte : réutilisation commerciale autorisée en citant la source).

## Comment ça marche

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css`, `app.js` | L'application (aucun serveur) |
| `analysis.js` | Détection des baisses / creux / hausses et conseil |
| `config.js` | **Tes réglages** : notifications, dons, partenaires, publicité, statistiques |
| `data/dep/<dép>.json` | Historique quotidien de chaque département (depuis le 1er janvier de l'année précédente) |
| `scripts/build_france.py` | Reconstruit ces fichiers depuis les archives officielles |
| `scripts/notify.mjs` | Envoie les notifications OneSignal |
| `.github/workflows/build-data.yml` | 3 fois par jour : données + notification « bon moment » |
| `.github/workflows/station-alerts.yml` | Toutes les 2 h : alertes « ma station préférée » |

Secret de dépôt nécessaire : `ONESIGNAL_API_KEY` (Settings → Secrets and variables → Actions).
Notification de test : Actions → *Mise à jour des prix (France)* → *Run workflow* → cocher « test ».

## Gagner de l'argent

Tout se règle dans **`config.js`** (sur GitHub : ouvrir le fichier → crayon ✏️ → modifier → *Commit changes*). Un réglage vide = rien n'apparaît.

| Moyen | Réglage | Remarque |
|---|---|---|
| Dons | `donUrl` | Lien Buy Me a Coffee, Tipeee, PayPal.me… |
| Partenaires locaux | `partenaires` (+ `departements` pour cibler) et `contactPartenaire` | Un garage, un lavage auto… paie pour être affiché aux automobilistes de son département. Marqué « Partenaire ». |
| Publicité Google | `adsenseClient`, `adsenseSlot` | Nécessite **ton propre nom de domaine** (Google refuse `github.io`) et le message de consentement de Google activé dans AdSense (obligatoire en Europe). |

Pense à déclarer les revenus. Si l'appli devient une vraie activité, GitHub Pages n'est pas fait pour un usage commercial : la même appli peut être hébergée gratuitement sur Cloudflare Pages ou Netlify.

## Statistiques (toi seul les vois)

- **Visites** : Cloudflare Web Analytics (gratuit, sans cookie, donc sans bandeau). Mets le *token* dans `cloudflareAnalyticsToken`. Les chiffres sont sur ton tableau de bord Cloudflare, accessible à toi seul.
- **Abonnés aux notifications** : tableau de bord OneSignal (Audience).

## Avertissement

Les conseils viennent de l'historique et des tendances du département : personne ne peut prédire
les prix à coup sûr. Choisir la station la moins chère reste le plus gros gain.
