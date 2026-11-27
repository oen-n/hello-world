# ☀️ Vie Maline – Ton coach de vie

Une appli qu'on installe depuis le navigateur (Android et iPhone). On lui raconte sa vie, à l'écrit ou **à la voix**, et elle s'occupe du reste :

| Onglet | Ce qu'il fait |
|---|---|
| ☀️ **Aujourd'hui** | « Comment tu te sens ? » (fatigué, stressé, pas motivé…) avec des conseils simples ; les 3 priorités du jour ; le programme de la journée heure par heure, d'après ton profil : lever, repas, travail en séances avec pauses, sport, temps pour toi, écrans coupés 1 h avant le coucher. Habitudes à cocher (séries 🔥), bilan du soir (humeur, énergie, sommeil). 📅 met la journée dans l'agenda du téléphone, avec rappels. |
| 🗂️ **Organiser** | **Tâches** : on écrit ou dicte comme on parle (« appeler le dentiste demain à 10h »), date et heure comprises toutes seules ; ⭐ pour les priorités. **Objectifs** : sport, argent, travail, loisirs… découpés en petites étapes, avec du temps réservé chaque semaine dans le programme. **Vider ma tête** : on écrit ou dicte tout en vrac, l'appli range en tâches, objectifs et pensées. |
| 🎯 **Focus** | Mode travail plein écran : minuteur, écran allumé, compteur de chaque fois qu'on quitte l'appli pour aller sur son téléphone. Guide pour que le téléphone passe tout seul en Ne pas déranger pendant le travail et la nuit (avec tes horaires). |
| 💬 **Coach** | Sans IA : rappels et conseils simples. Avec le coach IA (Claude, d'Anthropic) : vraie conversation, il organise tes journées, ajoute tâches et habitudes, et retient ce qui compte pour toi. |
| 🙂 **Moi** | Mon temps des 7 prochains jours (travail, objectifs, sport, temps pour soi, sommeil), rappels de chaque soir dans l'agenda (écrans coupés, bilan, au lit), statistiques sur 14 jours, ce que le coach sait de toi, habitudes, profil, sauvegarde. |

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css`, `app.js` | L'appli (aucun serveur : tout reste dans le téléphone) |
| `core.js` | Programme du jour, lecture des phrases en français, habitudes, statistiques, fichier agenda |
| `coach.js` | Le coach IA |
| `vendor/anthropic.js` | Le SDK officiel d'Anthropic (`@anthropic-ai/sdk` 1.14.0) en un seul fichier |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installation sur l'écran d'accueil, fonctionnement hors ligne, rappels |

Le dossier est autonome : il peut être copié tel quel dans son propre dépôt ou hébergé seul (GitHub Pages, Netlify, Cloudflare Pages…).

## Coach IA

Pour l'instant chaque personne colle **sa propre clé API** Anthropic (Moi → Réglages). Elle reste sur son téléphone ; les messages partent directement vers Anthropic. Pour le grand public, il faudra un petit serveur qui garde **ta** clé, et un abonnement pour couvrir le coût.

## Limites

Une appli web ne peut pas activer elle-même le Ne pas déranger ni bloquer d'autres applis : il faudra une vraie appli Android / iPhone pour ça. Les notifications arrivent quand l'appli est ouverte ou en arrière-plan ; pour des rappels garantis, utiliser 📅 Agenda.
