// ===== Recettes =====
// Quantités pour 4 personnes. Chaque ingrédient :
//   [produit du catalogue, quantité, unité affichée, combien de cette unité dans 1 article du catalogue, placard?]
// ex. ["pates", 400, "g", 500] = 400 g de pâtes, le paquet du catalogue fait 500 g.
// « placard » = ce qu'on a presque toujours chez soi (sel, huile…) : non ajouté si on le coche.
// tags : rapide (≤ 25 min), vege, poisson, enfants, four

const R = [
  { id: "bolo", nom: "Spaghetti bolognaise", ico: "🍝", min: 30, tags: ["enfants"], ing: [
    ["pates", 400, "g", 500], ["viande-hachee", 400, "g", 500], ["sauce-tomate", 500, "g", 500], ["oignons", 1, "", 8],
    ["carottes", 150, "g", 1000], ["emmental", 60, "g", 200], ["huile-olive", 1, "c. à soupe", 66, true], ["sel", 1, "pincée", 500, true]],
    etapes: ["Faire revenir l'oignon et la carotte hachés dans l'huile.", "Ajouter la viande, faire dorer, puis la sauce tomate. Laisser mijoter 20 min.", "Cuire les pâtes, servir avec la sauce et le fromage râpé."] },
  { id: "carbo", nom: "Pâtes carbonara", ico: "🍝", min: 20, tags: ["rapide", "enfants"], ing: [
    ["pates", 400, "g", 500], ["lardons", 200, "g", 200], ["oeufs", 4, "", 12], ["parmesan", 60, "g", 100], ["poivre", 1, "pincée", 100, true]],
    etapes: ["Cuire les pâtes.", "Faire dorer les lardons à sec.", "Mélanger œufs et parmesan, verser sur les pâtes égouttées hors du feu avec les lardons, poivrer."] },
  { id: "lasagnes", nom: "Lasagnes", ico: "🫕", min: 60, tags: ["four", "enfants"], ing: [
    ["lasagnes", 250, "g", 500], ["viande-hachee", 500, "g", 500], ["sauce-tomate", 500, "g", 500], ["oignons", 1, "", 8],
    ["lait", 50, "cl", 100], ["beurre", 40, "g", 250], ["farine", 40, "g", 1000, true], ["emmental", 100, "g", 200]],
    etapes: ["Préparer la bolognaise (oignon, viande, sauce tomate).", "Faire une béchamel : beurre fondu + farine, puis le lait en fouettant.", "Alterner pâtes, bolognaise, béchamel ; finir par le fromage. 35 min à 180 °C."] },
  { id: "parmentier", nom: "Hachis parmentier", ico: "🥔", min: 50, tags: ["four", "enfants"], ing: [
    ["pdt", 1000, "g", 2500], ["viande-hachee", 500, "g", 500], ["oignons", 1, "", 8], ["lait", 20, "cl", 100],
    ["beurre", 40, "g", 250], ["emmental", 60, "g", 200], ["sel", 1, "pincée", 500, true]],
    etapes: ["Cuire les pommes de terre 20 min à l'eau, écraser avec beurre et lait.", "Faire revenir l'oignon et la viande.", "Viande dessous, purée dessus, fromage : 20 min à 200 °C."] },
  { id: "poulet-roti", nom: "Poulet rôti & pommes de terre", ico: "🍗", min: 75, tags: ["four", "enfants"], ing: [
    ["poulet-entier", 1500, "g", 1000], ["pdt", 1000, "g", 2500], ["ail", 4, "gousses", 30], ["herbes", 1, "bouquet", 1],
    ["huile-olive", 2, "c. à soupe", 66, true], ["sel", 1, "pincée", 500, true]],
    etapes: ["Huiler, saler le poulet, glisser ail et herbes.", "Entourer de pommes de terre en morceaux.", "1 h 15 à 200 °C en arrosant de temps en temps."] },
  { id: "curry", nom: "Poulet au curry & riz", ico: "🍛", min: 30, tags: [], ing: [
    ["poulet-filet", 600, "g", 1000], ["lait-coco", 40, "cl", 40], ["oignons", 1, "", 8], ["epices", 2, "c. à café", 20],
    ["riz", 300, "g", 1000], ["huile-tournesol", 1, "c. à soupe", 66, true]],
    etapes: ["Faire revenir l'oignon et le poulet en morceaux.", "Ajouter le curry puis le lait de coco, mijoter 15 min.", "Servir avec le riz."] },
  { id: "quiche", nom: "Quiche lorraine & salade", ico: "🥧", min: 45, tags: ["four"], ing: [
    ["pate-feuilletee", 1, "pâte", 1], ["lardons", 200, "g", 200], ["oeufs", 3, "", 12], ["creme", 20, "cl", 20],
    ["lait", 20, "cl", 100], ["emmental", 60, "g", 200], ["salade", 1, "", 1]],
    etapes: ["Étaler la pâte dans un moule.", "Battre œufs, crème, lait ; ajouter lardons et fromage.", "35 min à 180 °C. Servir avec la salade."] },
  { id: "croque", nom: "Croque-monsieur & salade", ico: "🥪", min: 20, tags: ["rapide", "enfants", "four"], ing: [
    ["pain-mie", 8, "tranches", 20], ["jambon", 4, "tranches", 4], ["emmental", 100, "g", 200], ["beurre", 30, "g", 250], ["salade", 1, "", 1]],
    etapes: ["Beurrer le pain, garnir de jambon et fromage.", "10 min au four à 200 °C (ou à la poêle).", "Servir avec la salade."] },
  { id: "omelette", nom: "Omelette & salade", ico: "🍳", min: 15, tags: ["rapide", "vege"], ing: [
    ["oeufs", 8, "", 12], ["champignons", 250, "g", 250], ["emmental", 50, "g", 200], ["salade", 1, "", 1], ["beurre", 20, "g", 250]],
    etapes: ["Faire sauter les champignons au beurre.", "Verser les œufs battus, ajouter le fromage.", "Plier et servir avec la salade."] },
  { id: "gratin-pates", nom: "Gratin de coquillettes au jambon", ico: "🧀", min: 30, tags: ["four", "enfants"], ing: [
    ["pates", 400, "g", 500], ["jambon", 4, "tranches", 4], ["creme", 20, "cl", 20], ["emmental", 100, "g", 200]],
    etapes: ["Cuire les pâtes.", "Mélanger avec le jambon en dés et la crème.", "Couvrir de fromage, 15 min à 200 °C."] },
  { id: "saumon-riz", nom: "Saumon, riz & haricots verts", ico: "🐟", min: 25, tags: ["poisson", "rapide"], ing: [
    ["saumon", 4, "pavés", 2], ["riz", 300, "g", 1000], ["haricots-verts", 500, "g", 1000], ["citrons", 1, "", 4], ["beurre", 20, "g", 250]],
    etapes: ["Cuire le riz et les haricots verts.", "Poêler les pavés 4 min de chaque côté.", "Servir avec un filet de citron."] },
  { id: "poisson-pane", nom: "Poisson pané & purée", ico: "🐠", min: 25, tags: ["poisson", "rapide", "enfants"], ing: [
    ["poisson-pane", 8, "pièces", 10], ["pdt", 1000, "g", 2500], ["lait", 20, "cl", 100], ["beurre", 40, "g", 250], ["citrons", 1, "", 4]],
    etapes: ["Cuire les pommes de terre et les écraser avec lait et beurre.", "Cuire le poisson pané à la poêle ou au four.", "Servir avec du citron."] },
  { id: "steak-frites", nom: "Steak haché frites", ico: "🍟", min: 25, tags: ["rapide", "enfants"], ing: [
    ["steak-hache", 4, "steaks", 4], ["frites", 800, "g", 1000], ["salade", 1, "", 1], ["ketchup", 1, "", 10]],
    etapes: ["Frites au four (ou friteuse sans huile) selon le paquet.", "Cuire les steaks à la poêle.", "Servir avec la salade."] },
  { id: "burgers", nom: "Burgers maison", ico: "🍔", min: 30, tags: ["enfants"], ing: [
    ["pains-burger", 4, "pains", 4], ["steak-hache", 4, "steaks", 4], ["fromage-tranches", 4, "tranches", 10], ["tomates", 200, "g", 1000],
    ["salade", 0.5, "", 1], ["oignons", 1, "", 8], ["frites", 800, "g", 1000], ["ketchup", 1, "", 10]],
    etapes: ["Frites au four.", "Cuire les steaks, poser le fromage dessus en fin de cuisson.", "Monter : pain, salade, steak, tomate, oignon, sauce."] },
  { id: "wraps", nom: "Wraps au poulet", ico: "🌯", min: 25, tags: ["rapide"], ing: [
    ["tortillas", 8, "galettes", 8], ["poulet-filet", 500, "g", 1000], ["poivrons", 400, "g", 1000], ["oignons", 1, "", 8],
    ["salade", 0.5, "", 1], ["fromage-tranches", 4, "tranches", 10], ["epices", 1, "c. à café", 20]],
    etapes: ["Faire sauter poulet en lanières, poivrons et oignon avec les épices.", "Garnir les galettes chaudes avec salade et fromage.", "Rouler et servir."] },
  { id: "chili", nom: "Chili con carne", ico: "🌶️", min: 40, tags: [], ing: [
    ["viande-hachee", 500, "g", 500], ["haricots-boite", 2, "boîtes", 1], ["tomates-pelees", 1, "boîte", 1], ["oignons", 1, "", 8],
    ["poivrons", 200, "g", 1000], ["epices", 2, "c. à café", 20], ["riz", 300, "g", 1000]],
    etapes: ["Faire revenir oignon, poivron et viande.", "Ajouter épices, tomates et haricots égouttés : 25 min à feu doux.", "Servir avec le riz."] },
  { id: "ratatouille", nom: "Ratatouille & riz", ico: "🍆", min: 50, tags: ["vege"], ing: [
    ["courgettes", 500, "g", 1000], ["aubergines", 400, "g", 1000], ["poivrons", 400, "g", 1000], ["tomates", 500, "g", 1000],
    ["oignons", 1, "", 8], ["ail", 2, "gousses", 30], ["riz", 300, "g", 1000], ["huile-olive", 3, "c. à soupe", 66, true]],
    etapes: ["Couper tous les légumes en dés.", "Les faire revenir dans l'huile puis mijoter 40 min à couvert.", "Servir avec le riz."] },
  { id: "soupe", nom: "Soupe de légumes & tartines", ico: "🥣", min: 35, tags: ["vege"], ing: [
    ["carottes", 500, "g", 1000], ["poireaux", 400, "g", 1000], ["pdt", 500, "g", 2500], ["bouillon", 2, "cubes", 10, true],
    ["baguette", 1, "", 1], ["chevre", 1, "bûche", 1]],
    etapes: ["Couper les légumes, couvrir d'eau avec le bouillon : 25 min.", "Mixer.", "Servir avec des tartines au chèvre gratinées."] },
  { id: "risotto", nom: "Risotto aux champignons", ico: "🍄", min: 35, tags: ["vege"], ing: [
    ["riz", 320, "g", 1000], ["champignons", 500, "g", 250], ["oignons", 1, "", 8], ["parmesan", 60, "g", 100],
    ["bouillon", 2, "cubes", 10, true], ["beurre", 30, "g", 250]],
    etapes: ["Faire revenir l'oignon et le riz au beurre.", "Ajouter le bouillon chaud louche par louche pendant 18 min, avec les champignons poêlés.", "Finir avec le parmesan."] },
  { id: "gratin-dauph", nom: "Gratin dauphinois & salade", ico: "🥔", min: 75, tags: ["four", "vege"], ing: [
    ["pdt", 1200, "g", 2500], ["creme", 40, "cl", 20], ["lait", 40, "cl", 100], ["ail", 1, "gousse", 30], ["salade", 1, "", 1]],
    etapes: ["Couper les pommes de terre en fines rondelles.", "Les mettre dans un plat frotté à l'ail, couvrir de lait + crème.", "1 h à 180 °C. Servir avec la salade."] },
  { id: "pizza", nom: "Pizza maison", ico: "🍕", min: 30, tags: ["four", "enfants"], ing: [
    ["pate-pizza", 2, "pâtes", 1], ["sauce-tomate", 250, "g", 500], ["mozzarella", 2, "boules", 1], ["jambon", 4, "tranches", 4],
    ["champignons", 250, "g", 250]],
    etapes: ["Étaler les pâtes, napper de sauce tomate.", "Garnir de jambon, champignons et mozzarella.", "15 min à 240 °C."] },
  { id: "salade-riz", nom: "Salade de riz au thon", ico: "🥗", min: 20, tags: ["rapide", "poisson"], ing: [
    ["riz", 250, "g", 1000], ["thon", 2, "boîtes", 1], ["mais", 1, "boîte", 1], ["tomates", 400, "g", 1000], ["oeufs", 4, "", 12],
    ["vinaigre", 2, "c. à soupe", 50, true], ["huile-tournesol", 4, "c. à soupe", 66, true]],
    etapes: ["Cuire le riz et les œufs (10 min), refroidir.", "Mélanger riz, thon, maïs, tomates et œufs en morceaux.", "Assaisonner de vinaigrette."] },
  { id: "tartiflette", nom: "Tartiflette", ico: "🧀", min: 60, tags: ["four"], ing: [
    ["pdt", 1200, "g", 2500], ["reblochon", 1, "", 1], ["lardons", 200, "g", 200], ["oignons", 2, "", 8], ["creme", 10, "cl", 20], ["salade", 1, "", 1]],
    etapes: ["Cuire les pommes de terre 15 min, les couper en rondelles.", "Faire revenir oignons et lardons, mélanger avec les pommes de terre et la crème.", "Couvrir du reblochon coupé en deux : 25 min à 200 °C."] },
  { id: "couscous", nom: "Couscous poulet merguez", ico: "🍲", min: 60, tags: [], ing: [
    ["semoule", 400, "g", 500], ["poulet-filet", 500, "g", 1000], ["saucisses", 4, "merguez", 6], ["carottes", 400, "g", 1000],
    ["courgettes", 400, "g", 1000], ["pois-chiches", 1, "boîte", 1], ["tomates-pelees", 1, "boîte", 1], ["epices", 2, "c. à café", 20]],
    etapes: ["Faire dorer le poulet, ajouter légumes, tomates, épices, couvrir d'eau : 40 min.", "Ajouter les pois chiches 10 min avant la fin. Griller les merguez.", "Préparer la semoule et servir."] },
  { id: "dinde-creme", nom: "Escalopes de dinde à la crème & riz", ico: "🍽️", min: 25, tags: ["rapide", "enfants"], ing: [
    ["dinde", 500, "g", 1000], ["creme", 20, "cl", 20], ["champignons", 250, "g", 250], ["riz", 300, "g", 1000]],
    etapes: ["Cuire le riz.", "Dorer les escalopes, ajouter les champignons.", "Verser la crème, laisser réduire 5 min."] },
  { id: "roti-porc", nom: "Rôti de porc & haricots verts", ico: "🥩", min: 60, tags: ["four"], ing: [
    ["porc", 900, "g", 1000], ["haricots-verts", 600, "g", 1000], ["moutarde", 1, "c. à soupe", 25, true], ["beurre", 20, "g", 250]],
    etapes: ["Badigeonner le rôti de moutarde, 50 min à 180 °C.", "Cuire les haricots verts, les poêler au beurre.", "Trancher et servir."] },
  { id: "lentilles", nom: "Lentilles saucisses", ico: "🥘", min: 40, tags: [], ing: [
    ["lentilles", 300, "g", 500], ["saucisses", 4, "saucisses", 6], ["carottes", 200, "g", 1000], ["oignons", 1, "", 8], ["lardons", 100, "g", 200]],
    etapes: ["Faire revenir oignon, carottes et lardons.", "Ajouter les lentilles, couvrir d'eau : 25 min.", "Ajouter les saucisses 10 min avant la fin."] },
  { id: "gnocchis", nom: "Gnocchis tomate mozzarella", ico: "🍅", min: 20, tags: ["rapide", "vege", "four"], ing: [
    ["pates-fraiches", 2, "paquets", 1], ["sauce-tomate", 500, "g", 500], ["mozzarella", 1, "boule", 1], ["herbes", 1, "bouquet", 1]],
    etapes: ["Faire dorer les gnocchis à la poêle.", "Ajouter la sauce tomate, couvrir de mozzarella.", "5 min sous le gril, basilic frais."] },
  { id: "wok", nom: "Wok de nouilles au poulet", ico: "🥢", min: 25, tags: ["rapide"], ing: [
    ["nouilles", 250, "g", 250], ["poulet-filet", 400, "g", 1000], ["legumes-surgeles", 600, "g", 1000], ["sauce-soja", 3, "c. à soupe", 15],
    ["huile-tournesol", 2, "c. à soupe", 66, true]],
    etapes: ["Cuire les nouilles.", "Faire sauter le poulet puis les légumes à feu vif.", "Ajouter nouilles et sauce soja, mélanger 2 min."] },
  { id: "crepes", nom: "Crêpes (salées & sucrées)", ico: "🥞", min: 40, tags: ["enfants"], ing: [
    ["farine", 250, "g", 1000, true], ["oeufs", 4, "", 12], ["lait", 50, "cl", 100], ["beurre", 50, "g", 250], ["jambon", 4, "tranches", 4],
    ["emmental", 100, "g", 200], ["pate-tartiner", 0.25, "pot", 1]],
    etapes: ["Mélanger farine, œufs, puis le lait petit à petit et le beurre fondu.", "Cuire les crêpes à la poêle.", "Garnir jambon-fromage, puis pâte à tartiner pour le dessert."] },
  { id: "papillote", nom: "Cabillaud en papillote & riz", ico: "🐟", min: 30, tags: ["poisson", "four"], ing: [
    ["cabillaud", 600, "g", 1000], ["courgettes", 400, "g", 1000], ["citrons", 1, "", 4], ["riz", 300, "g", 1000], ["huile-olive", 2, "c. à soupe", 66, true]],
    etapes: ["Déposer le poisson sur des rondelles de courgette dans du papier cuisson.", "Citron, filet d'huile, fermer : 20 min à 200 °C.", "Servir avec le riz."] },
  { id: "curry-vege", nom: "Curry de pois chiches", ico: "🍛", min: 25, tags: ["vege", "rapide"], ing: [
    ["pois-chiches", 2, "boîtes", 1], ["lait-coco", 40, "cl", 40], ["tomates-pelees", 1, "boîte", 1], ["oignons", 1, "", 8],
    ["epices", 2, "c. à café", 20], ["riz", 300, "g", 1000]],
    etapes: ["Faire revenir l'oignon avec le curry.", "Ajouter tomates, lait de coco et pois chiches : 15 min.", "Servir avec le riz."] },
  { id: "pates-saumon", nom: "Pâtes au saumon", ico: "🍝", min: 20, tags: ["rapide", "poisson"], ing: [
    ["pates", 400, "g", 500], ["saumon-fume", 4, "tranches", 4], ["creme", 20, "cl", 20], ["citrons", 1, "", 4]],
    etapes: ["Cuire les pâtes.", "Chauffer la crème avec le saumon en lanières et un peu de citron.", "Mélanger avec les pâtes."] },
  { id: "tomates-farcies", nom: "Tomates farcies & riz", ico: "🍅", min: 60, tags: ["four", "enfants"], ing: [
    ["tomates", 1200, "g", 1000], ["viande-hachee", 500, "g", 500], ["oignons", 1, "", 8], ["riz", 250, "g", 1000]],
    etapes: ["Évider les tomates.", "Remplir de viande mélangée à l'oignon haché.", "45 min à 180 °C, avec le riz cuit dans le jus."] },
  { id: "gratin-courgettes", nom: "Gratin de courgettes", ico: "🥒", min: 45, tags: ["vege", "four"], ing: [
    ["courgettes", 1000, "g", 1000], ["oeufs", 3, "", 12], ["creme", 20, "cl", 20], ["emmental", 100, "g", 200], ["baguette", 1, "", 1]],
    etapes: ["Couper et faire revenir les courgettes 10 min.", "Mélanger œufs, crème, fromage, verser dessus.", "30 min à 180 °C. Servir avec du pain."] },
];

export const RECETTES = R.map((r) => ({ ...r, ing: r.ing.map(([id, qte, unite, parArticle, placard]) => ({ id, qte, unite, parArticle, placard: !!placard })) }));
export const RECETTE = Object.fromEntries(RECETTES.map((r) => [r.id, r]));
export const FILTRES = [
  { id: "", nom: "Toutes" }, { id: "rapide", nom: "⚡ Rapide" }, { id: "enfants", nom: "🧒 Enfants" },
  { id: "vege", nom: "🌱 Végé" }, { id: "poisson", nom: "🐟 Poisson" }, { id: "four", nom: "🔥 Au four" },
];
