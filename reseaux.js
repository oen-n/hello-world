// ===== Tes réseaux sociaux et la liste de tes applis =====
// Partagé par toutes les applis du site. Après avoir créé tes comptes, mets juste ton nom
// d'utilisateur (sans @) : les boutons « Suis-nous » apparaissent alors partout tout seuls.

export const RESEAUX = {
  marque: "Les Applis Malines",
  instagram: "applis.malines",
  tiktok: "applis.malines",
};

// Une nouvelle appli ? Ajoute une ligne ici : elle apparaît sur la page « Toutes nos applis »
// (le lien en bio Instagram / TikTok) et dans les autres applis.
export const APPLIS = [
  { id: "plein-malin", nom: "Plein Malin", ico: "⛽", url: "../", image: "icons/icon-192.png", couleur: "#2a78d6",
    texte: "La station la moins chère près de chez toi et le bon moment pour faire le plein." },
  { id: "panier-malin", nom: "Panier Malin", ico: "🛒", url: "../courses/", image: "courses/icons/icon-192.png", couleur: "#0f8a4c",
    texte: "Ta liste de courses ou tes menus de la semaine, et le magasin le moins cher près de chez toi." },
];

export const lienInstagram = (u) => (u ? `https://www.instagram.com/${encodeURIComponent(u)}/` : "");
export const lienTiktok = (u) => (u ? `https://www.tiktok.com/@${encodeURIComponent(u)}` : "");
