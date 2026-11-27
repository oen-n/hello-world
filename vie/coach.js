// ===== Vie Maline : le coach IA (Claude) =====
// Facultatif : il ne marche que si la personne a collé sa propre clé API dans les réglages.
// La clé et les conversations restent sur le téléphone ; les messages partent
// directement du téléphone vers l'API d'Anthropic, sans passer par un serveur à nous.

const MODEL = "claude-opus-5-5";
// En cas de refus par les filtres de sécurité, l'API relance d'elle-même la demande sur un autre modèle.
const BETAS = ["server-side-fallback-2026-07-01"];

let sdk = null;
async function client(apiKey) {
  if (!sdk) sdk = (await import("./vendor/anthropic.js")).default;
  return new sdk({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
}
export const Erreurs = () => sdk;

const SYSTEM = `Tu es le coach de vie de l'application « Vie Maline ». Tu parles français, tu tutoies, tu es chaleureux, direct et concret, comme un grand frère ou une grande sœur bienveillante qui s'y connaît.

Ta mission : aider la personne à avoir une meilleure vie au quotidien. Organiser ses journées, ne rien oublier, faire les bons choix, prendre soin d'elle : sommeil, lever, alimentation, sport, moins de téléphone, concentration au travail, temps pour ses proches et ses passions.

Comment tu travailles :
- Tu t'appuies sur ce que tu sais d'elle (profil, mémoire, programme, tâches, bilans) fourni dans le bloc « Contexte du moment » de chaque message. Ce bloc vient de l'application, pas de la personne.
- Quand elle t'apprend quelque chose de durable sur elle (horaires, travail, famille, goûts, difficultés, objectifs), enregistre-le avec l'outil « memoriser », en une phrase courte. Ne mémorise pas ce qui est déjà dans la mémoire.
- Quand elle te demande de ne pas oublier quelque chose, ou qu'une action datée ressort de la conversation, crée la tâche avec « ajouter_tache ».
- Quand elle te demande d'organiser ou de réorganiser une journée, utilise « planifier_journee » avec un programme complet et réaliste de son lever à son coucher (repas, travail par séances avec pauses, sport, temps pour soi, coupure des écrans 1 h avant le coucher). Respecte ses contraintes.
- Aide-la à prioriser : marque « important » les tâches qui comptent vraiment (3 par jour au plus) et rappelle-lui de commencer par la plus importante.
- Quand elle veut réaliser quelque chose (sport, investissement, travail, études, loisirs, projet), aide-la à en faire un objectif clair avec « ajouter_objectif » : un titre concret, pourquoi c'est important pour elle, le temps par semaine qu'elle peut y consacrer de façon réaliste, et 3 à 5 premières étapes très petites. L'application réserve ce temps dans son programme.
- Quand elle a trop de choses en tête, aide-la à vider sa tête : reformule clairement ce qu'elle dit, sépare ce qui est à faire (tâches), ce qu'elle veut réaliser (objectifs) et ce qui n'est qu'une inquiétude, puis propose une seule prochaine action.
- Quand une nouvelle habitude à suivre chaque jour l'aiderait et qu'elle est d'accord, utilise « ajouter_habitude ».
- Après avoir utilisé un outil, dis-lui en une phrase ce que tu as fait.

Ton style : réponses courtes (3 à 8 lignes la plupart du temps), lisibles sur un téléphone, avec des listes quand c'est utile et un emoji de temps en temps. Donne des conseils précis et faisables aujourd'hui, pas des généralités. Une ou deux idées à la fois. Pose une question si tu as besoin d'une information importante. Ne culpabilise jamais : encourage les progrès, même petits.

Santé : tu donnes des conseils de bien-être général, pas de diagnostic ni de traitement. Si elle parle de symptômes inquiétants, de troubles alimentaires, de détresse ou d'idées noires, réponds avec douceur et oriente-la vers un médecin ou, en France, le 3114 (prévention du suicide, 24 h/24) ou le 15 en cas d'urgence.`;

const HHMM = { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" };
const DATE = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
const TOOLS = [
  {
    name: "ajouter_tache",
    description: "Ajoute une tâche à la liste « À faire » de la personne, avec un rappel si une heure est donnée. À utiliser pour tout ce qu'elle ne doit pas oublier.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        titre: { type: "string", description: "Ce qu'il faut faire, court, commençant par un verbe. Ex. : « Appeler le dentiste »" },
        date: { ...DATE, description: "Jour (AAAA-MM-JJ), si connu" },
        heure: { ...HHMM, description: "Heure (HH:MM), si connue" },
        important: { type: "boolean", description: "Vrai si c'est une priorité" },
      },
      required: ["titre"],
      additionalProperties: false,
    },
  },
  {
    name: "planifier_journee",
    description: "Remplace le programme d'une journée par celui que tu proposes. Donne la journée entière, du lever au coucher, dans l'ordre.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        date: { ...DATE, description: "Jour concerné (AAAA-MM-JJ)" },
        blocs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              debut: HHMM,
              fin: HHMM,
              titre: { type: "string" },
              ico: { type: "string", description: "Un seul emoji" },
              type: { type: "string", enum: ["matin", "repas", "travail", "pause", "sport", "loisir", "taches", "orga", "soir", "bilan", "dodo", "autre"] },
              conseil: { type: "string", description: "Un conseil court (facultatif)" },
            },
            required: ["debut", "fin", "titre", "type"],
            additionalProperties: false,
          },
        },
      },
      required: ["date", "blocs"],
      additionalProperties: false,
    },
  },
  {
    name: "ajouter_objectif",
    description: "Ajoute un objectif à réaliser (sport, argent, travail, loisirs…) découpé en petites étapes. L'application réserve du temps chaque semaine pour lui dans le programme.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        titre: { type: "string", description: "Objectif concret. Ex. : « Courir 10 km en mars »" },
        domaine: { type: "string", enum: ["sport", "argent", "travail", "loisirs", "apprendre", "proches", "perso"] },
        pourquoi: { type: "string", description: "Pourquoi c'est important pour elle, en une phrase" },
        heures_par_semaine: { type: "number", description: "Temps réaliste à y consacrer par semaine, en heures (0 à 10)" },
        etapes: { type: "array", items: { type: "string" }, description: "3 à 5 premières étapes, très petites et concrètes" },
      },
      required: ["titre", "domaine"],
      additionalProperties: false,
    },
  },
  {
    name: "ajouter_habitude",
    description: "Ajoute une habitude à cocher chaque jour dans l'application.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { nom: { type: "string", description: "Ex. : « Pas de téléphone au lit »" }, ico: { type: "string", description: "Un seul emoji" } },
      required: ["nom"],
      additionalProperties: false,
    },
  },
  {
    name: "memoriser",
    description: "Retient durablement un fait important sur la personne (vie, travail, goûts, contraintes, objectifs) pour mieux l'aider les prochaines fois.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { fait: { type: "string", description: "Une phrase courte à la 3e personne. Ex. : « Travaille de nuit le week-end »" } },
      required: ["fait"],
      additionalProperties: false,
    },
  },
];

// Validation des entrées d'outils (le flux « eager » ne les valide pas côté serveur)
const isStr = (v, max = 400) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const okH = (v) => v === undefined || (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v));
const okD = (v) => v === undefined || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v));
const VALIDE = {
  ajouter_tache: (i) => isStr(i.titre, 200) && okD(i.date) && okH(i.heure) && (i.important === undefined || typeof i.important === "boolean"),
  ajouter_objectif: (i) => isStr(i.titre, 160) && ["sport", "argent", "travail", "loisirs", "apprendre", "proches", "perso"].includes(i.domaine)
    && (i.heures_par_semaine === undefined || (typeof i.heures_par_semaine === "number" && i.heures_par_semaine >= 0 && i.heures_par_semaine <= 20))
    && (i.etapes === undefined || (Array.isArray(i.etapes) && i.etapes.length <= 12 && i.etapes.every((e) => isStr(e, 160))))
    && (i.pourquoi === undefined || typeof i.pourquoi === "string"),
  planifier_journee: (i) => okD(i.date) && i.date && Array.isArray(i.blocs) && i.blocs.length > 0 && i.blocs.length <= 60
    && i.blocs.every((b) => b && okH(b.debut) && okH(b.fin) && b.debut && b.fin && isStr(b.titre, 160)),
  ajouter_habitude: (i) => isStr(i.nom, 80),
  memoriser: (i) => isStr(i.fait, 300),
};

/**
 * Envoie un message au coach et déroule la boucle d'outils.
 * @param {object} o
 * @param {string} o.apiKey
 * @param {Array} o.history   messages déjà échangés (format API, modifié en place : on ne fait qu'ajouter)
 * @param {string} o.texte    message de la personne
 * @param {string} o.contexte état de l'appli (profil, programme, tâches…)
 * @param {(t:string)=>void} o.onText  texte reçu au fil de l'eau
 * @param {(nom:string, input:object)=>string} o.onTool  exécute un outil, renvoie un court compte rendu
 */
export async function parler({ apiKey, history, texte, contexte, onText, onTool, signal }) {
  const c = await client(apiKey);
  history.push({ role: "user", content: [{ type: "text", text: `<contexte_du_moment>\n${contexte}\n</contexte_du_moment>\n\n${texte}` }] });
  let reessais = 0;
  for (let tour = 0; tour < 6; tour++) {
    const stream = c.beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      betas: BETAS,
      fallbacks: "default",
      system: SYSTEM,
      tools: TOOLS,
      messages: history,
    }, { signal });
    stream.on("text", (d) => onText(d));
    let msg;
    try {
      msg = await stream.finalMessage();
      reessais = 0;
    } catch (e) {
      // Une entrée d'outil illisible ou une connexion coupée : on relance ce tour (2 fois max).
      if (e instanceof sdk.APIError || e?.name === "AbortError" || signal?.aborted || reessais++ >= 2) throw e;
      onText("\n");
      continue;
    }
    if (msg.stop_reason === "refusal") {
      onText("\n\nJe ne peux pas t'aider sur ce point. Reformule ta demande, ou parle-en à un professionnel si c'est important.");
      // on garde la réponse refusée dans l'historique, sans la modifier
      history.push({ role: "assistant", content: msg.content });
      return;
    }
    history.push({ role: "assistant", content: msg.content });
    const outils = msg.content.filter((b) => b.type === "tool_use");
    if (msg.stop_reason === "pause_turn") continue;
    if (!outils.length || msg.stop_reason !== "tool_use") return;

    const resultats = outils.map((b) => {
      const ok = VALIDE[b.name]?.(b.input || {});
      if (!ok) return { type: "tool_result", tool_use_id: b.id, is_error: true, content: `Entrée invalide : ${JSON.stringify(b.input).slice(0, 300)}` };
      try { return { type: "tool_result", tool_use_id: b.id, content: onTool(b.name, b.input) || "Fait." }; }
      catch (err) { return { type: "tool_result", tool_use_id: b.id, is_error: true, content: String(err?.message || err) }; }
    });
    history.push({ role: "user", content: resultats });
    onText("\n\n");
  }
}

// Lit le récit de la personne et en tire son profil (réponse JSON garantie par un schéma)
const PROFIL_SCHEMA = {
  type: "object",
  properties: {
    prenom: { type: "string" },
    metier: { type: "string" },
    reveil: { type: "string", description: "Heure de lever SOUHAITÉE, HH:MM" },
    coucher: { type: "string", description: "Heure de coucher conseillée pour dormir assez et se lever à l'heure souhaitée, HH:MM" },
    travailJours: { type: "array", items: { type: "integer" }, description: "Jours travaillés : 0 = dimanche … 6 = samedi" },
    travailDebut: { type: "string" },
    travailFin: { type: "string" },
    petitDej: { type: "string" },
    dejeuner: { type: "string" },
    diner: { type: "string" },
    sport: { type: "string" },
    sportJours: { type: "array", items: { type: "integer" } },
    sportHeure: { type: "string" },
    sportDuree: { type: "integer" },
    hobbies: { type: "string" },
    objectifs: { type: "array", items: { type: "string", enum: ["lever", "sommeil", "manger", "telephone", "sport", "organise", "focus", "stress", "lecture", "argent", "social"] } },
    faits: { type: "array", items: { type: "string" }, description: "Faits importants à retenir sur la personne, une phrase courte chacun" },
  },
  required: ["objectifs", "faits"],
  additionalProperties: false,
};

export async function lireProfil({ apiKey, recit, actuel }) {
  const c = await client(apiKey);
  const r = await c.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: BETAS,
    fallbacks: "default",
    system: "Tu lis ce qu'une personne raconte de sa vie et tu remplis son profil pour une application d'organisation et de bien-être. Ne remplis que les champs que le texte permet de déduire ; laisse les autres absents. Les heures sont au format HH:MM sur 24 h. Les objectifs sont ceux qu'elle exprime ou qui ressortent clairement de ses difficultés.",
    output_config: { format: { type: "json_schema", schema: PROFIL_SCHEMA } },
    messages: [{ role: "user", content: `Profil actuel (à compléter, pas à effacer) :\n${JSON.stringify(actuel)}\n\nCe qu'elle raconte :\n${recit}` }],
  });
  if (r.stop_reason === "refusal") throw new Error("Le coach n'a pas pu lire ce texte.");
  const txt = r.content.find((b) => b.type === "text")?.text;
  return JSON.parse(txt);
}

// « Vider ma tête » : range un texte en vrac en tâches, objectifs et pensées
const TRI_SCHEMA = {
  type: "object",
  properties: {
    resume: { type: "string", description: "2 phrases chaleureuses qui clarifient ce qu'elle vit et proposent la prochaine action la plus utile" },
    elements: {
      type: "array",
      items: {
        type: "object",
        properties: {
          texte: { type: "string", description: "Reformulé court et clair ; pour une tâche, commence par un verbe" },
          type: { type: "string", enum: ["tache", "objectif", "pensee"] },
          date: { type: "string", description: "AAAA-MM-JJ si une date ressort, sinon chaîne vide" },
          heure: { type: "string", description: "HH:MM si une heure ressort, sinon chaîne vide" },
          important: { type: "boolean" },
          domaine: { type: "string", enum: ["sport", "argent", "travail", "loisirs", "apprendre", "proches", "perso"] },
        },
        required: ["texte", "type", "date", "heure", "important", "domaine"],
        additionalProperties: false,
      },
    },
  },
  required: ["resume", "elements"],
  additionalProperties: false,
};
export async function trierPensees({ apiKey, texte, aujourdhui }) {
  const c = await client(apiKey);
  const r = await c.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: BETAS,
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: TRI_SCHEMA } },
    system: "Tu aides une personne à vider sa tête. Elle a écrit ou dicté en vrac tout ce qu'elle a en tête. Sépare chaque idée : « tache » = une action à faire, « objectif » = quelque chose qu'elle veut réaliser sur la durée, « pensee » = une inquiétude, une émotion ou une réflexion. Marque important au plus 3 tâches, les plus urgentes ou qui comptent le plus. Dates relatives à calculer depuis la date du jour donnée. Tutoie, en français.",
    messages: [{ role: "user", content: `Nous sommes le ${aujourdhui}.\n\nCe que j'ai en tête :\n${texte}` }],
  });
  if (r.stop_reason === "refusal") throw new Error("refus");
  const d = JSON.parse(r.content.find((b) => b.type === "text")?.text || "{}");
  const okD = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || ""), okH = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v || "");
  return {
    resume: d.resume || "",
    elements: (d.elements || []).filter((x) => x && x.texte).map((x) => ({ ...x, date: okD(x.date) ? x.date : null, heure: okH(x.heure) ? x.heure : null })),
  };
}

// Petit test de la clé
export async function testerCle(apiKey) {
  const c = await client(apiKey);
  await c.models.retrieve(MODEL);
}
