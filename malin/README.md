# ✦ Les Applis Malines : direction artistique commune

Toutes les applis utilisent **la même feuille de style** : `malin/malin.css` (+ la police `malin/fonts/`).

## Pour une nouvelle appli

```html
<link rel="preload" href="../malin/fonts/plus-jakarta-sans.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="style.css">          <!-- styles propres à l'appli -->
<link rel="stylesheet" href="../malin/malin.css"> <!-- toujours APRÈS -->
<meta name="theme-color" content="#0c1533">
...
<body data-app="monappli">
```

Puis ajouter sa couleur dans `malin.css` :
`body[data-app="monappli"] { --m-accent: …; --m-accent-2: …; --m-accent-soft: …; --m-accent-ink: …; }`
et une ligne dans `reseaux.js` (`APPLIS`).

## Les règles

| Élément | Règle |
|---|---|
| Ambiance | Haut d'écran **sombre « nuit aurore »** (bleu marine + lueurs de la couleur de l'appli), contenu **clair** en cartes blanches |
| Police | **Plus Jakarta Sans** (« Malin Sans »), titres en 800, lettres un peu serrées |
| Couleurs de marque | Nuit `#0c1533`, bleu `#2f6bff`, vert `#1fbf75`, étoile dorée `#ffc83d` |
| Couleur de chaque appli | Carbu Malin = bleu `#2f6bff` · Panier Malin = vert `#12a150` |
| Formes | Très arrondies : cartes 22 px, fenêtres 28 px, boutons et pastilles en pilule |
| Ombres | Douces, jamais de bordure dure sur les cartes |
| Boutons | Principal = pilule dégradée de la couleur de l'appli ; secondaire = pilule blanche bordée |
| Icône d'appli | Carré arrondi en **dégradé de la couleur de l'appli**, pictogramme **blanc épais et arrondi**, **petite étoile dorée ✦ en haut à droite** |
| Signature | « ✦ Les Applis Malines » en haut de l'écran, et la page `applis/` |
| Mode sombre | Automatique, mêmes couleurs sur fond nuit |
