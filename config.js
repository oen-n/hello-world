// ===== Réglages "gagner de l'argent" =====
// Remplis ces valeurs puis enregistre : l'appli affiche automatiquement les blocs.
// Laisse vide ("") pour masquer un bloc.

export const CONFIG = {
  // Notifications directement dans l'appli (OneSignal). App ID public (pas secret).
  oneSignalAppId: "2ef78266-b783-4baf-a83a-b5d53f9a85d6",

  // Bouton de dons : lien Buy Me a Coffee, Tipeee, PayPal.me, Lydia…
  // ex. "https://buymeacoffee.com/tonpseudo" ou "https://paypal.me/tonpseudo"
  donUrl: "",

  // Comment un commerce peut te contacter pour devenir partenaire
  // (adresse e-mail ou lien vers un formulaire). Vide = pas de bloc "Ton commerce ici".
  contactPartenaire: "pleinmalin.contact@gmail.com",

  // Partenaires (sponsors) affichés sous la liste des stations.
  // `departements` : n'afficher le partenaire qu'aux utilisateurs de ces départements
  // (laisser vide [] pour toute la France). Plusieurs partenaires = un au hasard.
  partenaires: [
    // { nom: "Garage Exemple", texte: "Vidange -10 % sur présentation de l'appli", lien: "https://…", ville: "Cholet", departements: ["49"] },
  ],

  // Publicité Google AdSense (nécessite ton propre nom de domaine, voir README).
  // ex. adsenseClient: "ca-pub-1234567890123456", adsenseSlot: "1234567890"
  adsenseClient: "",
  adsenseSlot: "",

  // Statistiques privées (Cloudflare Web Analytics) : colle ici le "token" (32 caractères).
  // Toi seul vois les chiffres, sur dash.cloudflare.com. Sans cookie, pas de bandeau à afficher.
  cloudflareAnalyticsToken: "4175e485db294ef5b901034e57cb1927",
};
