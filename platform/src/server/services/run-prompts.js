import { PROFILES } from "../domain/profiles.js";

const PROFILE_IDS = PROFILES.map((p) => p.id).join(", ");

// Option B: encourage internal fan-out via Claude Code subagents (Task tool).
const PARALLEL_HINT = `\n--- ACCÉLÉRATION ---
Quand plusieurs sous-tâches sont INDÉPENDANTES (ex. plusieurs User Stories, plusieurs écrans, plusieurs documents distincts), traite-les EN PARALLÈLE en lançant des sous-agents (outil Task), puis synthétise leurs résultats. N'utilise le parallélisme que pour des tâches réellement indépendantes (pas de conflit sur les mêmes fichiers).
--- FIN ACCÉLÉRATION ---\n`;

/**
 * The platform protocol every agent run must follow.
 * It tells the agent how to hand questions/decisions back to humans
 * and how to read the answers so it can resume.
 */
function contractBlock(pendingFile = "livrables/_governance/agent-io/pending-input.json") {
  return `--- PROTOCOLE PLATEFORME SDLC STUDIO (obligatoire) ---
Tu travailles pour une plateforme qui montre ton avancement à des profils humains, souvent non techniques.

1) Quand tu as besoin d'une réponse humaine pour continuer — information manquante, imprécision, ou choix structurant — tu n'inventes PAS. Tu écris (ou écrases) le fichier \`${pendingFile}\` (crée le dossier si besoin) AU FORMAT EXACT :
{
  "summary": "ce que tu as compris et structuré, en langage simple",
  "items": [
    {
      "ref": "identifiant court et stable (ex: q1, d1)",
      "type": "question" | "decision",
      "profile": "un id parmi: ${PROFILE_IDS}",
      "title": "intitulé court",
      "context": "explication claire et sans jargon de ce qui est demandé",
      "severity": "normal" | "high",
      "options": [ { "label": "...", "detail": "conséquence" } ],
      "library": "uniquement pour une décision d'autorisation de librairie : le nom exact de la librairie"
    }
  ]
}
- "options" UNIQUEMENT pour type "decision".
- Choisis le "profile" le plus pertinent pour chaque item.
- Si tu n'as besoin de rien d'humain, écris {"summary":"...","items":[]}.

2) Les réponses humaines, quand elles existent, sont dans \`livrables/_governance/agent-io/answers.json\` (tableau de {id, ref, question, answer, note, documents}). Lis-le s'il existe et appuie-toi dessus pour continuer SANS reposer les mêmes questions. Si une réponse contient un tableau \`documents\` (chemins de fichiers uploadés par l'humain), OUVRE et LIS ces fichiers : ils contiennent l'information attendue. Extrais-en ce qui répond à la question et place-le au bon endroit dans les livrables. Si le document ne répond pas vraiment, repose une question précise via le protocole.
   IMPORTANT — décisions déléguées : si une réponse vaut "DÉLÉGUÉ — fais au mieux", tu prends la décision toi-même selon le contexte et les bonnes pratiques, tu l'appliques, ET tu REPORTES ton choix dans \`livrables/_governance/agent-io/resolutions.json\` au format [{"id":"<l'id fourni dans answers.json>","decision":"ce que tu as décidé","rationale":"pourquoi"}], pour que l'humain puisse le voir et le corriger.

3) Si le fichier \`livrables/_governance/agent-io/feedback.json\` existe, il contient des retours humains sur des documents précis ([{doc, comment, by}]). LIS-le et corrige les documents concernés en conséquence avant de conclure.

4) Tu produis tes livrables en Markdown dans /livrables/ comme défini par l'orchestrateur, et tu mets à jour le fichier de gate quand l'étape est validable.
--- FIN PROTOCOLE ---`;
}

/** Library-usage policy injected into agent prompts (human keeps control). */
export function libraryPolicyText(config) {
  const p = (config && config.policies && config.policies.libraries) || {};
  if (p.mode === "allow-all") {
    return `\n--- POLITIQUE LIBRAIRIES ---
Tu peux utiliser les librairies / dépendances que tu juges pertinentes, en restant raisonnable et en justifiant brièvement chaque ajout.
--- FIN POLITIQUE ---\n`;
  }
  const allowed = Array.isArray(p.allowed) ? p.allowed.filter(Boolean) : [];
  const allowedTxt = allowed.length ? ` Librairies déjà approuvées (utilisables librement) : ${allowed.join(", ")}.` : "";
  return `\n--- POLITIQUE LIBRAIRIES ---
Avant d'introduire une NOUVELLE librairie ou dépendance qui n'est pas déjà approuvée, tu DOIS demander l'autorisation humaine via le protocole : crée une décision (type "decision", profil "architecte-technique") avec un champ "library" = nom exact de la librairie, un titre "Utiliser la librairie X ?", et les options [{"label":"Autoriser"},{"label":"Refuser"}]. N'installe PAS la librairie tant qu'elle n'est pas approuvée dans answers.json.${allowedTxt}
--- FIN POLITIQUE ---\n`;
}

export function buildG0Prompt({ intakePath, hasAnswers }) {
  return `Tu agis comme @project-bootstrapper, en suivant CLAUDE.md, .claude/rules/ et .claude/agents/project-bootstrapper.md.

Objectif de l'étape G0 (Lancement) : à partir du besoin client fourni, STRUCTURER les besoins clés du projet et préparer le contexte projet.

Dossier d'intake (documents du besoin client) : ${intakePath || "(à confirmer)"}

Travail attendu :
1. Lis les documents d'intake disponibles.
2. Structure les besoins clés par dimension : besoin métier / valeur, utilisateurs et usages, processus, données, systèmes existants, contraintes, orientations d'architecture, et sécurité.
3. Produis une synthèse claire dans /livrables/00-contexte/intake-synthesis.md.
4. Pour CHAQUE imprécision ou information structurante manquante, pose une question via le protocole (pending-input.json), routée vers le bon profil. Ne devine pas les éléments structurants.
${hasAnswers ? "5. Des réponses humaines sont disponibles dans livrables/_governance/agent-io/answers.json : intègre-les, mets à jour la synthèse et le contexte projet, et si le contexte est suffisant, produis /livrables/_governance/gates/G0-project-context-ready.md en PASS. Sinon, repose uniquement les questions encore bloquantes." : "5. Ne déclare pas G0 PASS tant que des éléments structurants restent imprécis : liste-les comme questions."}

${contractBlock()}`;
}

/** Block listing human-provided input documents the agent must consume. */
function inputsBlock(inputs) {
  if (!inputs || !inputs.length) return "";
  const lines = inputs
    .map((i) => `- ${i.path}${i.description ? ` — ${i.description}` : ""}`)
    .join("\n");
  return `\nDOCUMENTS D'ENTRÉE fournis pour cette étape (à LIRE et à PRENDRE EN COMPTE impérativement) :\n${lines}\n`;
}

/** Generic prompt to advance any phase G1..G7 with its owner agents. */
export function buildPhasePrompt(phase, { hasAnswers, inputs } = {}) {
  const produces = (phase.produces || []).map((p) => `- ${p}`).join("\n");
  return `Tu fais avancer l'étape ${phase.id} (${phase.title}) de la chaîne de développement, en agissant comme ${phase.agents || "l'agent responsable de l'étape"}, conformément à CLAUDE.md, aux fichiers de .claude/rules/ et aux fichiers d'agents concernés dans .claude/agents/.

Objectif de l'étape : ${phase.goal || phase.plain}

Avant de produire :
1. Lis le profil projet actif (project/PROJECT.md et les fichiers project/<slug>/...).
2. Lis les livrables des étapes précédentes dans /livrables/ pour t'appuyer dessus.
${hasAnswers ? "3. Lis les réponses humaines dans livrables/_governance/agent-io/answers.json et intègre-les sans reposer les mêmes questions." : "3. Ne devine pas les éléments structurants manquants : pose-les en questions via le protocole."}

Livrables attendus pour cette étape :
${produces || "- (voir les fichiers d'agents et conventions-livrables.md)"}
${inputsBlock(inputs)}
Validation de l'étape :
- Quand l'étape est complète selon .claude/rules/quality-gates.md, écris ou mets à jour /livrables/_governance/gates/${phase.gateFile || phase.id}.md avec **Status**: PASS (ou FAIL si un élément structurant bloque, ou PASS_WITH_RISK si un risque est explicitement accepté et possédé).
- Pour toute imprécision, information manquante ou choix structurant qui dépasse les preuves disponibles, pose une question ou une décision via le protocole, routée vers le bon profil.
${PARALLEL_HINT}
${contractBlock()}`;
}

/**
 * Option A: prompt scoped to a SINGLE agent of a phase, for parallel execution.
 * Each parallel agent writes ONLY in its own folders and to its own pending file.
 */
export function buildAgentTaskPrompt(phase, task, { pendingFile, inputs }) {
  const produces = (task.produces || []).map((p) => `- ${p}`).join("\n");
  return `Tu fais avancer l'étape ${phase.id} (${phase.title}) en agissant UNIQUEMENT comme ${task.agent}, conformément à CLAUDE.md, .claude/rules/ et .claude/agents/.

Tu travailles EN PARALLÈLE avec d'autres agents de la même étape. Pour éviter tout conflit :
- tu n'écris QUE dans : ${(task.folders || []).map((f) => `/livrables/${f}/`).join(", ") || "tes dossiers"} ;
- tu ne modifies PAS les livrables des autres agents.

Objectif : ${task.goal || phase.goal}

Avant de produire : lis le profil projet (project/...) et les livrables des étapes précédentes utiles.

Livrables attendus (uniquement les tiens) :
${produces || "- (voir ton fichier d'agent et conventions-livrables.md)"}
${inputsBlock(inputs)}

Pour toute imprécision ou choix structurant, pose une question/décision via le protocole (dans TON fichier ci-dessous). N'écris PAS le fichier de gate (la revue de l'étape s'en charge après convergence).
${PARALLEL_HINT}
${contractBlock(pendingFile)}`;
}

/** The reviewer evaluates a phase's deliverables and owns the gate decision. */
export function buildReviewPrompt(phase, reviewer) {
  return `Tu agis comme ${reviewer || "le reviewer de l'étape"} pour la REVUE de l'étape ${phase.id} (${phase.title}), conformément à .claude/rules/quality-gates.md et .claude/rules/judge-rubrics.md.

Tu es un évaluateur, pas un producteur : tu ne réécris pas les livrables, tu les juges.

Travail attendu :
1. Lis le profil projet (project/...) et les livrables produits pour cette étape dans /livrables/.
2. Évalue-les avec la rubrique du judge appropriée : clarté, testabilité, complétude, traçabilité, cohérence, risques.
3. Écris un rapport de revue dans /livrables/11-evaluations/ (format du judge report).
4. Rends la décision de gate en écrivant /livrables/_governance/gates/${phase.gateFile || phase.id}.md avec **Status**: PASS / FAIL / PASS_WITH_RISK, les preuves, les problèmes bloquants et la prochaine action.
5. Pour chaque problème bloquant qui nécessite une décision ou une information humaine, pose-le via le protocole, routé vers le bon profil. Ne valide pas en PASS si des éléments obligatoires manquent (préfère FAIL).

${contractBlock()}`;
}

/** New business need: triggers the requalification mini-chain across phases. */
export function buildNewNeedPrompt(description, docPaths) {
  const docs = (docPaths || []).length
    ? `\nDocuments fournis (à lire) :\n${docPaths.map((p) => `- ${p}`).join("\n")}\n`
    : "";
  return `Un NOUVEAU BESOIN MÉTIER vient d'être soumis sur un projet déjà cadré. Tu orchestres sa prise en compte selon la boucle "nouveau besoin" de CLAUDE.md et des règles.

Besoin exprimé :
"""
${description}
"""${docs}

Procédure obligatoire (mini-chaîne de requalification) :
1. Enregistre le besoin avec la date dans /livrables/00-contexte/nouveaux-besoins.md (synthèse datée). Lis les documents fournis s'il y en a.
2. Évalue l'impact business. Si l'impact est majeur, c'est un choix qui revient à @sponsor (vision + périmètre MVP) : pose-le comme décision via le protocole, routée vers le profil "sponsor".
3. Impact UX : ce qui doit être mis à jour côté personas, user journeys, wireframes → décision/question routée vers "ux".
4. Impact domaine : domain-model, capability-map, modules-fonctionnels → routée vers "architecte-metier".
5. Impact technique : architecture-applicative, schemas-integration, design-decisions, exigences-non-fonctionnelles → routée vers "architecte-technique".
6. Impact backlog : Epics, Features, User Stories à créer/ajuster dans 05-backlog → routée vers "po".

Produis une SYNTHÈSE D'IMPACT claire (quelles étapes rouvrir, quels livrables mettre à jour) dans /livrables/00-contexte/nouveaux-besoins.md, et lève une question ou décision par profil concerné via le protocole, en expliquant simplement ce qui est demandé.

NE FAIS PAS le développement ni les tests dans ce passage : les étapes @developpeur (dev des US) et @qa (tests, avec reprise du @developpeur si erreurs) seront lancées séparément depuis la plateforme une fois le backlog mis à jour. Ne modifie jamais directement le code ou le backlog sans passer par cette mini-chaîne.

${contractBlock()}`;
}

/** Conversational turn with the phase's agent (ask, produce, or update docs). */
export function buildChatPrompt(phase, agent, profileLabel, message, history) {
  const hist = (history || [])
    .slice(-8)
    .map((m) => `${m.role === "user" ? "UTILISATEUR" : "AGENT"}: ${m.text}`)
    .join("\n");
  return `Tu agis comme ${agent || "l'agent responsable de l'étape"} sur l'étape ${phase.id} (${phase.title}) de la chaîne de développement, en suivant CLAUDE.md, .claude/rules/ et ton fichier d'agent.

Un utilisateur humain (profil : ${profileLabel || "membre de l'équipe"}) discute avec toi pour : te demander des informations, te faire produire un livrable, ou te donner de nouvelles informations pour mettre à jour tes documents.

Avant de répondre : lis le profil projet (project/...) et les livrables existants de l'étape dans /livrables/ si utile.

Selon la demande :
- Si c'est une question → réponds clairement et brièvement, sans jargon.
- Si l'utilisateur demande de produire ou mettre à jour un document → fais-le réellement dans /livrables/ (étape ${phase.id}), puis résume en une phrase ce que tu as écrit/modifié.
- Si l'utilisateur apporte une information → intègre-la dans les bons livrables et confirme.

${hist ? `Historique récent de la conversation :\n${hist}\n` : ""}
MESSAGE DE L'UTILISATEUR :
${message}

Réponds directement à l'utilisateur (ton conversationnel). ${contractBlock()}`;
}

export function buildResumePrompt({ phaseLabel, agent }) {
  return `Tu reprends le travail de l'étape ${phaseLabel || ""} en agissant comme ${agent || "l'agent responsable"}.

Des réponses humaines viennent d'être fournies dans \`.claude/control-center/answers.json\`. Lis-les, intègre-les à tes livrables, et continue l'étape :
- mets à jour les livrables Markdown concernés ;
- si de nouvelles imprécisions ou décisions apparaissent, pose-les via le protocole ;
- si l'étape est désormais complète, mets à jour le fichier de gate correspondant.

${contractBlock()}`;
}
