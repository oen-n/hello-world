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
  contactPartenaire: "",

  // Partenaires (sponsors) affichés sous la liste des stations.
  // Si tu en mets plusieurs, un partenaire différent s'affiche à chaque ouverture.
  partenaires: [
    // { nom: "Garage Exemple", texte: "Vidange -10 % sur présentation de l'appli", lien: "https://…", ville: "Cholet" },
  ],
};
