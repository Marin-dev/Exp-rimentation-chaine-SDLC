import { PROFILES } from "../domain/profiles.js";
import { REVIEWERS } from "../domain/phases.js";
import { repriseHint, g0SourcesBlock } from "./source-prompts.js";

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
export function contractBlock(pendingFile = "livrables/_governance/agent-io/pending-input.json", { answersFile } = {}) {
  // Answers are handed to ONE run through its own file (answers-<runId>.json): a shared
  // answers.json leaked one agent's answers into every other concurrent run.
  const answersLine = answersFile
    ? `2) Les réponses humaines à tes questions sont dans \`${answersFile}\` (tableau de {id, ref, question, answer, note, documents}). Lis-le et appuie-toi dessus pour continuer SANS reposer les mêmes questions.`
    : `2) Si des réponses humaines te sont destinées, le fichier exact t'est indiqué dans la consigne. N'en lis aucun autre : les fichiers \`answers-*.json\` du dossier agent-io appartiennent à d'autres agents.`;
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

${answersLine} Si une réponse contient un tableau \`documents\` (chemins de fichiers uploadés par l'humain), OUVRE et LIS ces fichiers : ils contiennent l'information attendue. Extrais-en ce qui répond à la question et place-le au bon endroit dans les livrables. Si le document ne répond pas vraiment, repose une question précise via le protocole.
   IMPORTANT — décisions déléguées : si une réponse vaut "DÉLÉGUÉ — fais au mieux", tu prends la décision toi-même selon le contexte et les bonnes pratiques, tu l'appliques, ET tu REPORTES ton choix dans \`livrables/_governance/agent-io/resolutions.json\` au format [{"id":"<l'id fourni dans le fichier de réponses>","decision":"ce que tu as décidé","rationale":"pourquoi"}], pour que l'humain puisse le voir et le corriger.

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
Avant d'introduire une NOUVELLE librairie ou dépendance qui n'est pas déjà approuvée, tu DOIS demander l'autorisation humaine via le protocole : crée une décision (type "decision", profil "architecte-technique") avec un champ "library" = nom exact de la librairie, un titre "Utiliser la librairie X ?", et les options [{"label":"Autoriser"},{"label":"Refuser"}]. N'installe PAS la librairie tant qu'elle n'est pas approuvée dans une réponse humaine.${allowedTxt}
--- FIN POLITIQUE ---\n`;
}

export function buildG0Prompt({ intakePath, hasSources }) {
  return `Tu agis comme @project-bootstrapper, en suivant CLAUDE.md, .claude/rules/ et .claude/agents/project-bootstrapper.md.

Objectif de l'étape G0 (Lancement) : à partir du besoin client fourni, STRUCTURER les besoins clés du projet et préparer le contexte projet.

Dossier d'intake (documents du besoin client) : ${intakePath || "(à confirmer)"}
${hasSources ? g0SourcesBlock() : ""}
Travail attendu :
1. Lis les documents d'intake disponibles.
2. Structure les besoins clés par dimension : besoin métier / valeur, utilisateurs et usages, processus, données, systèmes existants, contraintes, orientations d'architecture, et sécurité.
3. Produis une synthèse claire dans /livrables/00-contexte/intake-synthesis.md.
4. Pour CHAQUE imprécision ou information structurante manquante, pose une question via le protocole (pending-input.json), routée vers le bon profil. Ne devine pas les éléments structurants.
5. Ne déclare pas G0 PASS tant que des éléments structurants restent imprécis : liste-les comme questions. Si le contexte est suffisant, produis /livrables/_governance/gates/G0-project-context-ready.md en PASS.

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
export function buildPhasePrompt(phase, { inputs } = {}) {
  const produces = (phase.produces || []).map((p) => `- ${p}`).join("\n");
  return `Tu fais avancer l'étape ${phase.id} (${phase.title}) de la chaîne de développement, en agissant comme ${phase.agents || "l'agent responsable de l'étape"}, conformément à CLAUDE.md, aux fichiers de .claude/rules/ et aux fichiers d'agents concernés dans .claude/agents/.

Objectif de l'étape : ${phase.goal || phase.plain}

Avant de produire :
1. Lis le profil projet actif (project/PROJECT.md et les fichiers project/<slug>/...).
2. Lis les livrables des étapes précédentes dans /livrables/ pour t'appuyer dessus.
3. Ne devine pas les éléments structurants manquants : pose-les en questions via le protocole.

Livrables attendus pour cette étape :
${produces || "- (voir les fichiers d'agents et conventions-livrables.md)"}
${inputsBlock(inputs)}${repriseHint(phase.id)}${phase.id === "G5" ? acceptanceRulesText() : ""}
Validation de l'étape :
${gateInstruction(phase)}
- Pour toute imprécision, information manquante ou choix structurant qui dépasse les preuves disponibles, pose une question ou une décision via le protocole, routée vers le bon profil.
${PARALLEL_HINT}
${contractBlock()}${taskProtocolText()}`;
}

/**
 * Tests-first rule for every agent that touches product code: @qa's acceptance tests are
 * the contract. They are locked (sha256) by the platform; a change is detected and fails
 * the gate. A test that looks wrong goes back to @qa through a decision.
 */
export function acceptanceRulesText() {
  return `
--- TESTS D'ACCEPTATION (contrat, écrits par @qa avant le développement) ---
- Le manifeste \`livrables/07-tests/acceptance/manifest.json\` liste, pour chaque User Story, ses critères et les fichiers de tests d'acceptation qui les vérifient. Lis-le avant de coder.
- Ton travail est FINI quand les tests d'acceptation de tes User Stories PASSENT (lance-les avec les commandes de \`livrables/07-tests/verification.json\`), en plus de tes propres tests unitaires.
- Tu NE MODIFIES PAS, ne supprimes pas et ne désactives pas (skip, only, assertions affaiblies) ces fichiers : ils sont verrouillés par la plateforme, toute modification est détectée et fait échouer le gate.
- Si un test d'acceptation te paraît faux ou contradictoire avec la User Story, NE le contourne pas : pose une décision au profil "qa" via le protocole, en citant le test et le critère.
- La plateforme rejoue elle-même ces commandes : seuls les résultats réels comptent, pas ce que tu en écris.
--- FIN TESTS D'ACCEPTATION ---
`;
}

/** Tests-first at G4: @qa turns every User Story's acceptance criteria into executable tests. */
export function buildAcceptanceTestsPrompt() {
  return `Tu agis comme @qa pour l'étape G4 (Backlog), conformément à CLAUDE.md, .claude/rules/ et .claude/agents/qa.md.

OBJECTIF : écrire, AVANT le développement, les TESTS D'ACCEPTATION EXÉCUTABLES de chaque User Story. Ils deviendront le contrat du développeur : il devra les faire passer sans les modifier. Ils échoueront tant que le produit n'est pas développé, c'est attendu.

Avant d'écrire : lis project/PROJECT.md et project/<slug>/stack.md, l'architecture technique (04-architecture-technique : stack, organisation du code, conventions de test), les écrans et flows (02-ui) et les User Stories (05-backlog/user-stories/).

Travail attendu :
1. Pour CHAQUE User Story qui n'a pas encore de tests dans le manifeste : un fichier de tests d'acceptation (un fichier par US), un cas de test par critère d'acceptation. Le NOM de chaque cas contient l'identifiant de l'US et du critère (ex. « US-012 AC2 refuse un montant négatif ») : la plateforme relie les résultats aux US par ce nom.
   - Teste le COMPORTEMENT observable (API, écran, données), pas l'implémentation interne : le développeur doit rester libre de sa conception.
   - User Story avec écran : un test de bout en bout de son parcours (outil e2e de la stack, ex. Playwright) en plus des tests d'API si utile.
   - Place les tests dans le dossier de tests du produit prévu par l'architecture (ex. tests/acceptance/). Si le harnais de test n'existe pas encore, crée le MINIMUM nécessaire (configuration du runner, dépendances de test), sans écrire de code produit.
2. Écris le manifeste \`livrables/07-tests/acceptance/manifest.json\` :
{
  "stories": [
    { "us": "US-012", "title": "…", "criteria": [ { "id": "AC1", "text": "…" } ], "tests": ["chemin/relatif/au/workspace/du/fichier-de-test"] }
  ]
}
3. Écris (ou complète) \`livrables/07-tests/verification.json\` : les commandes que la PLATEFORME exécutera elle-même pour prouver les gates G5 et G6. Un humain les approuvera avant la première exécution.
{
  "steps": [
    { "id": "install", "label": "Installation", "kind": "install", "command": "npm ci", "cwd": "chemin/relatif", "required": true, "timeoutMinutes": 15 },
    { "id": "build", "label": "Build", "kind": "build", "command": "npm run build", "cwd": "…", "required": true },
    { "id": "unit", "label": "Tests unitaires", "kind": "unit", "command": "…", "cwd": "…", "junit": "chemin/relatif/rapport-unit.xml", "required": true },
    { "id": "acceptance", "label": "Tests d'acceptation", "kind": "acceptance", "command": "…", "cwd": "…", "junit": "chemin/relatif/rapport-acceptance.xml", "required": true },
    { "id": "e2e", "label": "Parcours de bout en bout", "kind": "e2e", "command": "…", "cwd": "…", "junit": "…", "required": true, "gates": ["G6"] }
  ]
}
   - Commandes NON interactives, qui se terminent seules (pas de mode watch), et qui ÉCRIVENT un rapport JUnit XML à l'emplacement "junit" (active le reporter JUnit du runner).
   - "kind" parmi install, build, lint, unit, acceptance, e2e, other. "cwd" et "junit" sont relatifs au workspace et y restent.
   - Si l'e2e a besoin du produit lancé, la commande le démarre elle-même (ex. option webServer de Playwright) ; pas de serveur laissé tournant.
   - N'invente pas de commande dont la stack ne dispose pas : si un élément manque (pas encore de projet de code), écris ce qui sera vrai une fois le squelette créé et signale-le dans le résumé.
4. Vérifie la couverture : chaque critère d'acceptation de chaque US a au moins un cas de test. Un critère non testable tel qu'écrit → pose une question au profil "po" via le protocole, au lieu d'écrire un test vague.

N'écris PAS le fichier de gate. Ne développe PAS le produit.
${contractBlock()}${riskRegisterProtocolText()}${taskProtocolText()}`;
}

/**
 * Who writes the gate status. A phase with a reviewer: the producer never judges its own
 * work — the reviewer decides (and is chained automatically after the producer).
 * Without a reviewer (G0, G6R), the producer writes it, as before.
 */
function gateInstruction(phase) {
  const gateRel = `/livrables/_governance/gates/${phase.gateFile || phase.id}.md`;
  if (REVIEWERS[phase.id]) {
    return `- N'écris PAS la ligne **Status** du gate \`${gateRel}\` : c'est ${REVIEWERS[phase.id]} qui décide, lors de la revue lancée après toi. Termine en résumant ce qui est prêt pour la revue et ce qui reste ouvert.`;
  }
  return `- Quand l'étape est complète selon .claude/rules/quality-gates.md, écris ou mets à jour \`${gateRel}\` avec **Status**: PASS (ou FAIL si un élément structurant bloque, ou PASS_WITH_RISK si un risque est explicitement accepté et possédé).`;
}

/**
 * Option A: prompt scoped to a SINGLE agent of a phase, for parallel execution.
 * Each parallel agent writes ONLY in its own folders and to its own pending file.
 */
export function buildAgentTaskPrompt(phase, task, { pendingFile, risksFile, tasksFile, inputs }) {
  const produces = (task.produces || []).map((p) => `- ${p}`).join("\n");
  return `Tu fais avancer l'étape ${phase.id} (${phase.title}) en agissant UNIQUEMENT comme ${task.agent}, conformément à CLAUDE.md, .claude/rules/ et .claude/agents/.

Tu travailles EN PARALLÈLE avec d'autres agents de la même étape. Pour éviter tout conflit :
- tu n'écris QUE dans : ${(task.folders || []).map((f) => `/livrables/${f}/`).join(", ") || "tes dossiers"} ;
- tu ne modifies PAS les livrables des autres agents.

Objectif : ${task.goal || phase.goal}

Avant de produire : lis le profil projet (project/...) et les livrables des étapes précédentes utiles.

Livrables attendus (uniquement les tiens) :
${produces || "- (voir ton fichier d'agent et conventions-livrables.md)"}
${inputsBlock(inputs)}${repriseHint(phase.id)}

Pour toute imprécision ou choix structurant, pose une question/décision via le protocole (dans TON fichier ci-dessous). N'écris PAS le fichier de gate (la revue de l'étape s'en charge après convergence).
${PARALLEL_HINT}
${contractBlock(pendingFile)}${riskRegisterProtocolText(risksFile)}${taskProtocolText(tasksFile)}`;
}

/**
 * G5 dev lane: one @developpeur scoped to a SINGLE Bounded Context's User Stories,
 * running in parallel with other BC lanes of the same wave. Anti-collision is by
 * BC file-ownership + per-US deliverables + deferred governance consolidation.
 */
export function buildDevLanePrompt(task, { pendingFile, risksFile, tasksFile } = {}) {
  const list = (task.usList || [])
    .map((u) => `- ${u.id} — ${u.title}${u.integration ? ` [INTÉGRATION inter-BC : ${(u.integrationBCs || []).join(", ")}]` : ""}`)
    .join("\n");
  return `Tu agis comme @developpeur pour l'étape G5 (Développement), conformément à CLAUDE.md, .claude/rules/ et .claude/agents/developpeur.md.

Tu es la LANE du Bounded Context ${task.bc} (${task.bcName}). Tu travailles EN PARALLÈLE avec d'autres lanes (d'autres Bounded Contexts) de la même vague. RÈGLES ANTI-COLLISION STRICTES :
- Tu implémentes UNIQUEMENT les User Stories listées ci-dessous, dans l'ordre.
- Tu ne modifies QUE les fichiers de code du Bounded Context ${task.bc}. Tu ne touches PAS au code d'un autre Bounded Context.
- Tu ne modifies PAS les contrats transverses partagés (garde d'accès, journal d'audit, centre de notifications, AppShell/shell). Si une US en a besoin, APPUIE-TOI dessus (lecture/appel) sans les réécrire ; si un changement transverse est vraiment nécessaire, NE le fais pas toi-même : signale-le comme dépendance/point d'intégration via le protocole (type "decision", profil "architecte-technique").
- Une US marquée [INTÉGRATION inter-BC] touche un contrat partagé avec un autre BC : sois particulièrement prudent, respecte le contrat existant, et documente l'interaction.

User Stories de ta lane (à développer en tranche verticale + tests) :
${list || "- (aucune)"}
${acceptanceRulesText()}
Avant de coder : lis project/PROJECT.md, le design-system et les écrans (02-ui), le modèle de domaine (03-architecture-metier) et les US ci-dessus (05-backlog/user-stories/).

Pour CHAQUE US développée :
- implémente la tranche verticale (code + tests au bon niveau L1/L2/L3) ;
- écris la note d'implémentation dans /livrables/06-dev/vertical-slices/US-[NNN]-impl.md (un fichier par US, propre à toi — pas de conflit) ;
- N'ÉCRIS PAS dans les fichiers de gouvernance partagés (CHANGELOG-actions-agents.md, traceability-matrix.md, journaux) : une étape de CONSOLIDATION s'en chargera après la vague. À la place, dépose un fragment de journal propre à ta lane dans /livrables/06-dev/_journal-fragments/${task.agentKey}.md (créé le dossier si besoin) résumant ce que tu as fait par US.

N'écris PAS le fichier de gate (la revue s'en charge après convergence).
${contractBlock(pendingFile)}${riskRegisterProtocolText(risksFile)}${taskProtocolText(tasksFile)}`;
}

/**
 * G5 integration check, run once after a wave of PARALLEL lanes: build + tests of the
 * whole product, fixing only integration breaks between lanes (no new features).
 */
export function buildDevIntegrationPrompt(task, { pendingFile, risksFile, tasksFile } = {}) {
  const lanes = (task.lanes || []).map((l) => `- ${l.bc} (${l.bcName}) : ${l.us.join(", ")}`).join("\n");
  return `Tu agis comme @developpeur pour le CONTRÔLE D'INTÉGRATION de la vague ${task.wave} de l'étape G5, conformément à CLAUDE.md, .claude/rules/ et .claude/agents/developpeur.md.

Ces lanes viennent de livrer EN PARALLÈLE, chacune sans voir le travail des autres :
${lanes || "- (aucune)"}

Ton travail :
1. Installe les dépendances, BUILDE et lance la suite de tests du produit (commandes de /livrables/00-contexte/infrastructure-locale.md, sinon celles du code : package.json, Makefile…).
2. Corrige UNIQUEMENT les cassures d'INTÉGRATION entre lanes : imports ou routes en double, contrats d'API divergents, migrations en conflit, dépendances incompatibles, tests cassés par une autre lane. N'ajoute AUCUNE fonctionnalité et ne réécris pas le travail d'une lane au-delà du nécessaire. Les tests d'acceptation de @qa (manifeste livrables/07-tests/acceptance/manifest.json) ne se modifient pas : un test qui te paraît faux → décision au profil "qa".
3. Écris le compte rendu dans /livrables/06-dev/_integration/vague-${task.wave}.md : commandes lancées, build OK/KO, tests passés/échoués (nombre), cassures trouvées et correctifs appliqués.
4. Toute cassure qui relève d'un choix d'architecture (contrat transverse à arbitrer) : NE tranche PAS, pose une décision via le protocole (profil "architecte-technique") et inscris le risque au registre.

N'écris PAS le fichier de gate.
${contractBlock(pendingFile)}${riskRegisterProtocolText(risksFile)}${taskProtocolText(tasksFile)}`;
}

/**
 * G5 consolidation: single lane, AFTER all dev waves, merges the per-lane journal
 * fragments and per-US impl notes into the shared governance files exactly once.
 */
export function buildDevConsolidationPrompt({ pendingFile, risksFile, tasksFile } = {}) {
  return `Tu agis comme @developpeur pour la CONSOLIDATION de gouvernance de l'étape G5, après les vagues de développement par Bounded Context.

Les lanes de dev ont écrit :
- des notes d'implémentation par US dans /livrables/06-dev/vertical-slices/US-*-impl.md ;
- des fragments de journal par lane dans /livrables/06-dev/_journal-fragments/*.md.

Ton travail (écriture des fichiers PARTAGÉS, faite une seule fois pour éviter les conflits) :
1. Consolide toutes les entrées dans /livrables/CHANGELOG-actions-agents.md (une ligne par action, format des conventions).
2. Mets à jour la matrice de traçabilité /livrables/_governance/traceability-matrix.md : relie chaque US développée à son code, ses tests et sa note d'impl.
3. Mets à jour le journal /livrables/00-contexte/journaux/journal-developpeur.md à partir des fragments, puis tu peux vider/archiver le dossier _journal-fragments.
4. Ne réécris PAS le code. Signale toute incohérence entre lanes (contrats transverses divergents, doublons) via le protocole.

${contractBlock(pendingFile)}${riskRegisterProtocolText(risksFile)}${taskProtocolText(tasksFile)}`;
}

/**
 * Agent-to-agent resolution: the profile the item was ROUTED to (e.g. @architecte-technique)
 * answers a question/decision raised by another agent (e.g. @developpeur). It grounds the
 * answer in its own deliverables, may update them, and writes a machine-readable resolution
 * file whose `answer` is fed back to the raising agent.
 */
export function buildResolutionAgentPrompt(decision, { mode, humanAnswer, note, resolutionFileRel, targetAgent, pendingFileRel }) {
  const opts = (decision.options || [])
    .map((o) => `- ${o.label}${o.detail ? ` — ${o.detail}` : ""}`)
    .join("\n");
  const kind = decision.type === "question" ? "une question" : "une décision";
  const validate = mode === "validate";
  const roleBlock = validate
    ? `Un humain propose cette réponse : « ${String(humanAnswer || "").trim()} »${note ? ` (note : ${String(note).trim()})` : ""}.
Ton rôle : VALIDER ou CORRIGER/ENRICHIR cette réponse à la lumière de TES livrables (architecture, NFR, ADR, contraintes projet). Si elle est juste, approuve-la ; sinon ajuste-la et explique brièvement.`
    : `Ton rôle : TRANCHER toi-même, en t'appuyant sur TES livrables (architecture, NFR, ADR, contraintes projet) et le périmètre MVP. Choisis la réponse/option la plus pertinente.`;
  return `Tu agis comme ${targetAgent} (profil « ${decision.targetProfile} »), conformément à CLAUDE.md, .claude/rules/ et ton fichier d'agent.

Un autre agent (${decision.raisedBy || "un agent de la chaîne"}) a soulevé ${kind} qui relève de TON domaine ; elle t'est routée pour que TU la traites et aides le demandeur.

TITRE : ${decision.title}
CONTEXTE : ${decision.context || decision.summary || "—"}${opts ? `\nOPTIONS :\n${opts}` : ""}

${roleBlock}

Avant de répondre : lis project/PROJECT.md et TES livrables pertinents (ex. 04-architecture-technique, décisions ADR). Si la résolution change ta doctrine, METS À JOUR tes livrables concernés (et, pour un choix structurant, ajoute/actualise un ADR sous /livrables/_governance/decisions/).

Puis ÉCRIS ta réponse finale destinée à l'agent demandeur dans \`${resolutionFileRel}\` (crée le dossier si besoin) AU FORMAT EXACT :
{
  "answer": "réponse claire et actionnable que l'agent demandeur doit appliquer",
  "rationale": "justification brève, avec renvoi aux livrables si pertinent",
  "deliverablesUpdated": ["chemins des livrables mis à jour, s'il y en a"]
}

Ta SEULE sortie machine est ce fichier JSON. Si (et seulement si) il te manque une information humaine indispensable pour trancher, tu peux la demander via le protocole ci-dessous ; sinon, tranche et écris le fichier.
${contractBlock(pendingFileRel)}`;
}

/**
 * Coherence-control audit. The agent reviews a set of ALREADY-ANSWERED decisions and
 * (a) checks they are mutually coherent, (b) verifies each is actually reflected/applied
 * in the relevant deliverables (not just recorded), so the same questions don't recur.
 * It writes machine-readable findings; the server reopens the flagged decisions.
 * scope "profile": TES propres décisions. scope "global": cohérence CROISÉE entre profils.
 */
export function buildAuditAgentPrompt({ scope, auditor, profileLabel, decisions, reportFileRel, pendingFileRel }) {
  const list = (decisions || [])
    .map((d) => {
      const ans = d.answer || {};
      const answer = ans.delegated ? `${ans.choiceLabel || "(délégué)"} [DÉLÉGUÉ À L'IA]` : (ans.choiceLabel || "—");
      return `- ${d.id} — « ${d.title} »\n    Phase: ${d.phaseId || "—"} · Profil cible: ${d.targetProfile} · Décidé par: ${ans.decidedBy || "—"}\n    Réponse retenue: ${answer}${ans.note ? `\n    Note: ${ans.note}` : ""}`;
    })
    .join("\n");
  const global = scope === "global";
  const roleBlock = global
    ? `Tu agis comme ORCHESTRATEUR GLOBAL (${auditor}), garant de la cohérence d'ensemble, conformément à CLAUDE.md et .claude/ORCHESTRATION.md.
Tu CONTRÔLES la cohérence CROISÉE entre les décisions de TOUS les profils : repère les contradictions entre domaines (ex. un choix technique qui contredit une contrainte sécurité, une décision produit incompatible avec le périmètre MVP, deux décisions qui s'excluent).`
    : `Tu agis comme ${auditor} (profil « ${profileLabel} »), conformément à CLAUDE.md, .claude/rules/ et ton fichier d'agent.
Tu CONTRÔLES les décisions qui relèvent de TON domaine : vérifie qu'elles sont mutuellement cohérentes et alignées avec TES livrables et le périmètre MVP.`;
  return `${roleBlock}

Objectif : un contrôle qualité des décisions DÉJÀ TRANCHÉES (dont certaines ont pu être déléguées à l'IA en masse). Tu ne réponds pas à de nouvelles questions ; tu AUDITES l'existant.

DÉCISIONS À CONTRÔLER :
${list || "- (aucune)"}

Pour CHAQUE décision, effectue DEUX vérifications :
1. COHÉRENCE — la décision est-elle compatible avec les autres décisions ci-dessus et avec les livrables/contraintes du projet ? Signale toute contradiction.
2. DOCUMENTATION — la décision est-elle réellement REFLÉTÉE et APPLIQUÉE dans les livrables concernés (pas seulement enregistrée dans /livrables/_governance/decisions/) ? Ouvre et LIS les livrables pertinents (project/PROJECT.md, la phase concernée dans /livrables/, ADR). Si la décision n'est pas documentée là où elle devrait l'être, la question risque de revenir : signale-la comme "undocumented".

Quand une décision est SAINE (cohérente ET documentée), n'émets PAS de constat pour elle.

Écris ton rapport dans \`${reportFileRel}\` (crée le dossier si besoin) AU FORMAT EXACT :
{
  "summary": "synthèse claire et sans jargon de l'état des décisions contrôlées",
  "findings": [
    {
      "decisionId": "l'id exact ci-dessus (ex: DEC-0003)",
      "kind": "incoherence" | "undocumented",
      "severity": "normal" | "high",
      "rationale": "explication précise du problème",
      "reopen": true | false,
      "reopenNote": "si reopen=true : consigne claire à afficher au profil pour corriger/documenter"
    }
  ]
}
- "reopen": true UNIQUEMENT quand le problème exige que le profil retranche ou complète la décision (elle sera renvoyée en attente à ce profil).
- Pour un "undocumented" que TU peux corriger toi-même en écrivant dans le bon livrable, fais-le MAINTENANT (mets à jour le livrable) et mets "reopen": false en l'expliquant dans "rationale".
- Si tout est cohérent et documenté, écris {"summary":"...","findings":[]}.

Ta SEULE sortie machine est ce fichier JSON.
${contractBlock(pendingFileRel)}`;
}

/** The reviewer evaluates a phase's deliverables and owns the gate decision. */
function reviewEvidenceBlock(phase) {
  if (phase.id === "G4") {
    return `
--- TESTS D'ACCEPTATION ---
@qa a écrit, avant le développement, les tests d'acceptation de chaque User Story (manifeste \`livrables/07-tests/acceptance/manifest.json\`) et les commandes de vérification (\`livrables/07-tests/verification.json\`). Vérifie que CHAQUE critère d'acceptation de chaque US est couvert par au moins un test, que les tests vérifient un comportement observable (pas l'implémentation), et que les commandes sont non interactives et produisent des rapports JUnit. Une US sans test, ou un critère non couvert, est un point bloquant de G4.
--- FIN ---
`;
  }
  if (phase.id === "G5" || phase.id === "G6") {
    return `
--- PREUVES EXÉCUTABLES (font foi) ---
La plateforme a rejoué elle-même le build et les tests du produit : résultats dans \`livrables/_governance/evidence/${phase.id}.md\` (verdict, étapes, acceptation par User Story, verrou des tests d'acceptation).
- Tu ne peux PAS conclure PASS ou PASS_WITH_RISK si ces preuves sont en échec, absentes ou périmées : la plateforme ramènerait le gate à FAIL. Reprends leurs points bloquants dans ton rapport.
- Ton jugement porte sur ce que les tests ne mesurent pas : qualité et lisibilité du code, sécurité, dette, pertinence des tests unitaires, écarts entre le code et les User Stories / l'architecture.
--- FIN PREUVES ---
`;
  }
  return "";
}

export function buildReviewPrompt(phase, reviewer) {
  return `Tu agis comme ${reviewer || "le reviewer de l'étape"} pour la REVUE de l'étape ${phase.id} (${phase.title}), conformément à .claude/rules/quality-gates.md et .claude/rules/judge-rubrics.md.

Tu es un évaluateur, pas un producteur : tu ne réécris pas les livrables, tu les juges.

Travail attendu :
1. Lis le profil projet (project/...) et les livrables produits pour cette étape dans /livrables/.
2. Évalue-les avec la rubrique du judge appropriée : clarté, testabilité, complétude, traçabilité, cohérence, risques.
3. Écris un rapport de revue dans /livrables/11-evaluations/ (format du judge report).
4. Rends la décision de gate en écrivant /livrables/_governance/gates/${phase.gateFile || phase.id}.md avec **Status**: PASS / FAIL / PASS_WITH_RISK, les preuves, les problèmes bloquants et la prochaine action.
5. Pour chaque problème bloquant qui nécessite une décision ou une information humaine, pose-le via le protocole, routé vers le bon profil. Ne valide pas en PASS si des éléments obligatoires manquent (préfère FAIL).
${reviewEvidenceBlock(phase)}
${contractBlock()}${riskRegisterProtocolText()}${taskProtocolText()}`;
}

/**
 * Remediation pass: the phase's PRODUCER agent tries to FIX what a gate flagged —
 * the accepted risks of a PASS_WITH_RISK, or the blocking issues of a FAIL — updating
 * the deliverables and then re-evaluating the gate. Points owned by another profile
 * are escalated via the protocol instead of guessed.
 */
export function buildRemediationPrompt(phase, agent, gateStatus) {
  const reviewer = REVIEWERS[phase.id];
  const gateRel = `livrables/_governance/gates/${phase.gateFile || phase.id}.md`;
  const isFail = gateStatus === "FAIL";
  const fixLine = phase.id === "G5"
    ? "corrige le code et les tests des tranches verticales concernées (défauts signalés, tests manquants, dette technique)"
    : "complète et renforce les livrables concernés";
  const intro = isFail
    ? "La revue a REFUSÉ cette étape (Status: FAIL) : des POINTS BLOQUANTS doivent être levés avant validation. Ton objectif est de les traiter, pas seulement de les re-documenter."
    : "La revue a validé cette étape AVEC RISQUE (Status: PASS_WITH_RISK). Ton objectif est de RÉDUIRE ces risques autant que possible, pas seulement de les re-documenter.";
  const target = isFail ? "points bloquants (section « Blocking Issues »)" : "risques acceptés / points PASS_WITH_RISK";
  const reeval = isFail
    ? `   - **Status**: PASS si tous les points bloquants sont levés ;
   - **Status**: PASS_WITH_RISK si seuls subsistent des risques mineurs explicitement acceptables (liste-les) ;
   - sinon garde **Status**: FAIL en listant précisément les points bloquants RESTANTS, ce qui a été traité, et ce qui est en attente (escaladé à qui).`
    : `   - **Status**: PASS si les risques bloquants sont résolus ;
   - sinon garde **Status**: PASS_WITH_RISK en listant les risques RÉSIDUELS : ce qui a été corrigé, ce qui reste, et pourquoi.`;
  return `Tu agis comme ${agent || "l'agent responsable de l'étape"} pour l'étape ${phase.id} (${phase.title}), conformément à CLAUDE.md, .claude/rules/ et ton fichier d'agent.

${intro}

1. Lis le rapport de gate \`${gateRel}\` et identifie précisément les ${target}, leur OWNER indiqué, et la prochaine action recommandée.
2. Lis les livrables de l'étape dans /livrables/ et le profil projet (project/...).
3. Pour CHAQUE point qui relève de TON périmètre, CORRIGE-le : ${fixLine}. Mets à jour les livrables Markdown impactés.
4. Pour un point dont l'OWNER est un AUTRE profil (ex. @developpeur, @architecte-technique, @security-architect), ou qui exige une décision/information humaine, NE devine PAS : pose une décision/question via le protocole, routée vers ce profil, en décrivant précisément ce qui est attendu.
${reviewer
    ? `5. NE MODIFIE PAS la ligne **Status** du gate : tu as produit les livrables, tu ne les juges pas. Ajoute à la fin de \`${gateRel}\` une section « ## Remédiation » datée : points traités (et comment), points restants, points escaladés (à qui). ${reviewer} ré-évaluera le gate lors de la revue lancée après toi.`
    : `5. Réévalue et METS À JOUR le gate \`${gateRel}\` :
${reeval}`}
6. Consigne les corrections dans les livrables de l'étape (et le changelog des actions agents si pertinent).
${repriseHint(phase.id)}${phase.id === "G5" ? acceptanceRulesText() : ""}${phase.id === "G5" || phase.id === "G6" ? `
Les preuves exécutables de la dernière vérification (résultats réels du build et des tests, rejoués par la plateforme) sont dans \`livrables/_governance/evidence/${phase.id}.md\` : pars des échecs qu'elles listent.
` : ""}
${contractBlock()}${riskRegisterProtocolText()}${taskProtocolText()}`;
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

/**
 * Global orchestrator chat: an advisory assistant that answers the human's
 * questions about project progress, global vision, and what the agents are doing.
 * It is READ-ONLY: it explains, it does not modify deliverables or launch runs.
 * A live state snapshot is injected so it can answer "what's happening now".
 */
export function buildOrchestratorChatPrompt({ message, history, snapshot, actionsFileRel }) {
  const hist = (history || [])
    .slice(-8)
    .map((m) => `${m.role === "user" ? "UTILISATEUR" : "ORCHESTRATEUR"}: ${m.text}`)
    .join("\n");
  return `Tu es l'ORCHESTRATEUR GLOBAL de la chaîne de développement multi-agents SDLC Studio, conformément à CLAUDE.md et .claude/ORCHESTRATION.md.

Un humain (souvent non technique) te parle pour comprendre l'AVANCEMENT et faire AVANCER le projet. Tu es le PILOTE qui coordonne la chaîne : tu expliques, tu PLANIFIES vers un objectif, et tu proposes un lot d'actions borné que l'humain n'a plus qu'à confirmer.

PRINCIPE DE PILOTAGE (le plus important) :
La chaîne avance par GATES (G0→G7). À tout instant il y a UN SEUL objectif : faire passer le PROCHAIN gate non validé (voir « OBJECTIF COURANT » dans l'instantané). Tu pilotes vers CE gate, et rien d'autre.
- Ne propose QUE le travail nécessaire pour atteindre l'objectif courant. N'ouvre PAS de fronts sur des étapes ultérieures « pour prendre de l'avance » — c'est exactement ce qui fait diverger le projet.
- Un lot BORNÉ : idéalement 1 à 3 actions qui, une fois faites, rapprochent concrètement le gate du PASS. Si une seule action suffit, n'en propose qu'une.
- Quand l'objectif est ATTEINT (le gate passe), la plateforme clôture automatiquement les tâches de cette étape ; l'objectif devient le gate suivant. Si TOUS les gates sont passés, déclare la convergence et ne propose AUCUN travail (sauf demande explicite de l'humain).

RÈGLES :
- Réponds de façon claire, synthétique, sans jargon, en français.
- Tu ne modifies PAS les livrables et tu ne lances PAS directement les agents. Tu PROPOSES ; l'humain confirme d'un clic ; la plateforme exécute.
- Pour cadrer juste, lis si utile : project/PROJECT.md, les livrables (00-contexte, 01-vision, le backlog 05-backlog, les gates dans /livrables/_governance/gates/) et les décisions.
- Appuie-toi sur l'INSTANTANÉ ci-dessous pour l'état temps réel.

TRIER LES CANDIDATS (ta responsabilité de coordination) :
Les agents, en travaillant, déposent des « candidats » (handoffs) listés dans l'instantané. Ils n'ouvrent PAS automatiquement de travail : c'est TOI qui décides. Pour chaque candidat pertinent pour l'OBJECTIF COURANT → PROMEUS-le (il devient une tâche à faire). Pour un candidat hors-objectif, prématuré ou redondant → ÉCARTE-le (il ne pollue plus la bannette). Ne laisse pas les candidats s'accumuler.

PLANIFIER (écris tes décisions dans \`${actionsFileRel}\`, crée le dossier si besoin) :
{
  "actions": [
    {
      "type": "launch_dev | launch_phase | launch_review | remediate | launch_dev_batches | write_acceptance_tests | run_verification | seed_risks",
      "label": "libellé court et clair (ex. « Revue G2 — UX/UI/domaine »)",
      "rationale": "en quoi ça rapproche l'OBJECTIF COURANT, en 1 phrase",
      "phaseId": "G0..G7 (l'étape concernée)",
      "agent": "@developpeur (pour launch_dev ; sinon omets)",
      "instruction": "SEULEMENT pour launch_dev : la consigne précise (quoi construire, à partir de quel plan/US, la Definition of Done attendue)"
    }
  ],
  "taskOps": [
    { "id": "T-012", "op": "promote", "reason": "nécessaire pour l'objectif courant" },
    { "id": "T-018", "op": "drop", "reason": "concerne une étape ultérieure, prématuré" }
  ]
}
Types d'action :
- \`launch_dev\` : lancer un agent sur une tâche précise décrite dans \`instruction\` (ex. une vague de construction front depuis un plan). Découpe un gros chantier en plusieurs launch_dev seulement si le parallélisme sert l'objectif courant.
- \`launch_phase\` : (re)lancer l'agent producteur d'une étape Gx.
- \`launch_review\` : lancer la revue/gate d'une étape — souvent LE geste qui fait passer l'objectif.
- \`remediate\` : corriger les points bloquants d'un gate (PASS_WITH_RISK / FAIL).
- \`launch_dev_batches\` : développement G5 par Bounded Context (US non encore développées).
- \`seed_risks\` : amorcer le registre des risques.
Ne propose une action que si elle sert l'objectif MAINTENANT. N'invente pas d'étape déjà faite. Si rien n'est utile (objectif atteint / travail déjà en cours), n'écris pas d'actions — écris au besoin seulement les \`taskOps\`. Fichier vide accepté si vraiment rien à faire.

Dans ta réponse à l'humain : rappelle l'OBJECTIF COURANT en une ligne, explique où on en est vis-à-vis de ce gate, puis annonce le lot proposé (« Pour faire passer Gx, je propose de… — à confirmer »). Dis aussi ce que tu promeus/écartes parmi les candidats et pourquoi. Ne prétends jamais avoir lancé quoi que ce soit.

--- INSTANTANÉ ÉTAT PROJET (au moment de la question) ---
${snapshot || "(indisponible)"}
--- FIN INSTANTANÉ ---

${hist ? `Historique récent de la conversation :\n${hist}\n` : ""}
QUESTION DE L'UTILISATEUR :
${message}

Réponds directement à l'utilisateur, ton conversationnel et concret.`;
}

/**
 * AUTOPILOT planning turn — COPILOT mode. The human gave ONE demand and the orchestrator
 * must carry it out end to end by piloting the agents. Headless: no human reads a reply, so
 * the ONLY output that matters is the actions JSON. The platform launches the batch it
 * proposes and delegates the decisions agents raise to the domain experts. Each turn the
 * orchestrator either advances the demand with a bounded batch, or declares it DONE with a
 * final report — that report is what the human gets back.
 */
export function buildAutopilotPlanPrompt({ request, snapshot, actionsFileRel, alreadyDone }) {
  const done = Array.isArray(alreadyDone) ? alreadyDone.filter(Boolean) : [];
  const doneBlock = done.length
    ? `\n--- DÉJÀ LANCÉ PAR TOI DANS CETTE SESSION (NE LE RELANCE PAS) ---\n${done.map((d) => `- ${d}`).join("\n")}\n--- FIN ---\nCes travaux ont DÉJÀ été confiés à un agent. Si la demande est couverte par ce qui précède, ne relance rien : soit tu enchaînes l'ÉTAPE SUIVANTE (ex. une revue/validation), soit — si tout est fait — tu déclares \`"done": true\` avec le compte-rendu.\n`
    : "";
  return `Tu es l'ORCHESTRATEUR GLOBAL de la chaîne SDLC Studio, en MODE COPILOTE (gestion automatique), conformément à CLAUDE.md et .claude/ORCHESTRATION.md.

L'UTILISATEUR t'a confié CETTE DEMANDE, et rien d'autre :
« ${request || "(demande manquante)"} »
${doneBlock}

Ta mission : ACCOMPLIR CETTE DEMANDE de bout en bout, en pilotant les agents. Aucun humain ne lit de réponse : ta SEULE sortie utile est le fichier d'actions. La plateforme lance automatiquement le lot que tu proposes et délègue aux agents experts les décisions qu'ils soulèvent — l'humain n'est sollicité que si un expert reste bloqué.

PRINCIPE DE PILOTAGE :
- Reste STRICTEMENT dans le périmètre de la demande. NE pilote PAS toute la chaîne vers les gates ; ne fais QUE ce que la demande requiert. N'ouvre pas de fronts hors-sujet.
- Sers-toi de l'instantané comme CONTEXTE (état du projet, agents en cours, décisions/risques/tâches remontés) — pas comme objectif.
- À chaque tour, propose un lot BORNÉ (1 à 3 actions) qui fait AVANCER la demande. Ne relance pas un travail déjà en cours. Ne réinvente pas ce qui est déjà fait.
- Quand la demande est ENTIÈREMENT accomplie, ne propose PLUS d'action : mets \`"done": true\` et rédige un \`"summary"\` (compte-rendu : ce qui a été fait, le résultat concret, les limites/points d'attention). C'est ce compte-rendu que l'utilisateur recevra.

EXPLOITE LES RETOURS DES AGENTS (crucial) :
Un agent que tu as lancé ne te renvoie PAS de texte : il DÉPOSE ses conclusions sous forme de LIVRABLES, de RISQUES OUVERTS et de TÂCHES (visibles dans l'instantané). C'est TA responsabilité de les lire et d'en tirer les conséquences.
- Si un agent a remonté des RISQUES/lacunes qui sont la CAUSE du problème de l'utilisateur (ou qui empêchent la demande d'être réellement satisfaite), ne t'arrête PAS en livrant juste un document : PILOTE leur correction — lance l'agent compétent (ex. \`launch_dev\` pour un défaut UI, \`remediate\` pour un gate) pour appliquer les correctifs, puis fais vérifier.
- Ne déclare \`"done": true\` QUE lorsque la demande est réellement résolue, correctifs des lacunes bloquantes compris — pas seulement le premier livrable produit.

TRIER LES CANDIDATS : promeus (\`promote\`) les handoffs d'agents utiles à LA DEMANDE, écarte (\`drop\`) ceux hors-sujet / prématurés / redondants.

ÉCRIS TA RÉPONSE dans \`${actionsFileRel}\` (crée le dossier si besoin), et RIEN d'autre :
{
  "actions": [
    {
      "type": "launch_dev | launch_phase | launch_review | remediate | launch_dev_batches | write_acceptance_tests | run_verification | seed_risks",
      "label": "libellé court et clair",
      "rationale": "en quoi ça fait avancer LA DEMANDE, en 1 phrase",
      "phaseId": "G0..G7 (si pertinent)",
      "agent": "@developpeur (pour launch_dev uniquement ; sinon omets)",
      "instruction": "SEULEMENT pour launch_dev : la consigne précise (quoi faire, depuis quel plan/US, la Definition of Done attendue)"
    }
  ],
  "taskOps": [
    { "id": "T-012", "op": "promote", "reason": "nécessaire à la demande" }
  ],
  "done": false,
  "summary": ""
}
- Tant que la demande n'est pas finie : \`"done": false\` avec le prochain lot d'actions.
- Si tu ne peux rien avancer ce tour parce que du travail utile est déjà en cours : \`{"actions": [], "taskOps": [], "done": false}\`.
- Quand c'est fini : \`{"actions": [], "taskOps": [], "done": true, "summary": "…"}\`.
Ne propose jamais d'action pour « meubler ». Ne prétends pas avoir lancé quoi que ce soit — la plateforme s'en charge.

--- INSTANTANÉ ÉTAT PROJET (contexte) ---
${snapshot || "(indisponible)"}
--- FIN INSTANTANÉ ---`;
}

/**
 * A task the orchestrator (confirmed by the human) hands to a specific agent — the
 * generic "launch an agent on a precise instruction" primitive (e.g. build a front wave).
 */
export function buildDirectedAgentPrompt({ agent, instruction, phaseId, pendingFileRel, risksFileRel, tasksFileRel }) {
  return `Tu agis comme ${agent || "l'agent désigné"} pour l'étape ${phaseId || "en cours"}, conformément à CLAUDE.md, .claude/rules/ et ton fichier d'agent.

L'orchestrateur — sur confirmation explicite de l'humain — te confie cette tâche :
${instruction || "(voir la conversation)"}

Avant d'agir : lis project/PROJECT.md, les règles (.claude/rules/, notamment quality-gates.md et ui-frontend-quality.md), et les livrables utiles (le plan et les User Stories concernées, le design-system et les écrans sous 02-ui/, l'état d'infrastructure locale).
${repriseHint(phaseId)}${acceptanceRulesText()}Respecte la Definition of Done applicable : pour une User Story user-facing, l'écran doit être RÉELLEMENT monté et câblé (états Chargement / Vide / Erreur), avec une preuve L3/UI exécutée contre le back local. Ne réduis pas le périmètre demandé sans arbitrage humain.
${contractBlock(pendingFileRel)}${riskRegisterProtocolText(risksFileRel)}${taskProtocolText(tasksFileRel)}`;
}

/**
 * Ask a technical agent (@devops or @developpeur) to inspect the DELIVERED product
 * in the workspace and figure out how to launch it locally (back-end + front-end),
 * then write a machine-readable launch config the platform ingests into config.app.
 * The `cwd` fields MUST be absolute paths (the app runner resolves them relative to
 * the server process, not the workspace).
 */
export function buildAppDetectPrompt({ agent, configFileRel, workspaceRoot }) {
  return `Tu agis comme ${agent}, conformément à CLAUDE.md, .claude/rules/ et ton fichier d'agent.

OBJECTIF : déterminer comment LANCER EN LOCAL le produit développé par la chaîne (back-end + front-end), pour qu'un utilisateur non technique puisse le démarrer d'un clic depuis l'onglet Application.

La racine du workspace est : ${workspaceRoot}

Étapes :
1. Inspecte le code livré (package.json, scripts npm, Makefile, Dockerfile, README, requirements.txt, dossiers du produit). Le code du produit se trouve typiquement sous /livrables/06-dev/ ou dans un dossier de code applicatif du workspace — repère où vit réellement l'application exécutable (pas les livrables Markdown).
2. Identifie la commande de démarrage du BACK-END (ex. \`npm run start\`, \`npm run dev\`, \`uvicorn app:app\`) et son dossier de travail.
3. Identifie la commande de démarrage du FRONT-END (ex. \`npm run dev\`), son dossier de travail, et l'URL locale d'ouverture (ex. http://localhost:5173).
4. Si l'installation des dépendances est nécessaire au préalable, intègre-la à la commande (ex. \`npm install && npm run dev\`) pour que le démarrage fonctionne du premier coup.
5. Le produit peut avoir DEUX parties (front + back), ou UNE SEULE. Cas fréquents :
   - front-end seul (ex. app statique / SPA \`npm run dev\`) → renseigne uniquement \`frontend\` (avec son URL), laisse \`backend\` vide ;
   - back-end seul, ou UNE app Node unique qui sert aussi son interface (ex. \`npm start\` d'un serveur Express/Next) → renseigne uniquement \`backend\`, ET donne son URL locale dans \`backend.url\` pour qu'on puisse ouvrir l'app ; laisse \`frontend\` vide ;
   - les deux → renseigne les deux, l'URL d'ouverture étant celle du front-end.
   Ne remplis JAMAIS une partie inexistante avec une commande inventée : laisse ses champs vides.

Puis ÉCRIS le résultat dans \`${configFileRel}\` (crée le dossier si besoin) AU FORMAT EXACT :
{
  "backend": { "command": "commande de démarrage back-end, ou vide", "cwd": "CHEMIN ABSOLU du dossier de travail back-end, ou vide", "url": "URL locale SI le back-end sert aussi l'UI, sinon vide" },
  "frontend": { "command": "commande de démarrage front-end, ou vide", "cwd": "CHEMIN ABSOLU du dossier de travail front-end, ou vide", "url": "URL locale d'ouverture, ou vide" },
  "notes": "brève explication de ce que tu as trouvé et de tout prérequis restant"
}

RÈGLES IMPORTANTES :
- Les chemins \`cwd\` DOIVENT être ABSOLUS (commence par la racine du workspace ci-dessus).
- N'invente rien : base-toi sur ce qui existe réellement dans le code. Si tu ne trouves aucune application exécutable, écris des commandes vides et explique-le dans \`notes\`.
- N'écris QUE ce fichier JSON. Ne modifie pas le code du produit.`;
}

export function buildResumePrompt({ phaseLabel, agent, answersFileRel, originalPrompt, sessionResumed, pendingFileRel }) {
  const answers = answersFileRel || "livrables/_governance/agent-io/answers.json";
  const head = sessionResumed
    ? `Tu reprends TA session de travail sur ${phaseLabel || "la tâche"} (tu agis toujours comme ${agent || "l'agent responsable"}). Tu avais posé des questions ; les réponses sont arrivées.`
    : originalPrompt
      ? `Tu reprends une tâche interrompue en attendant des réponses humaines. Voici la CONSIGNE D'ORIGINE de cette tâche — elle reste ton cadre (périmètre, fichiers autorisés, livrables) :

--- CONSIGNE D'ORIGINE ---
${originalPrompt}
--- FIN CONSIGNE D'ORIGINE ---

Le travail déjà fait est dans les livrables : relis-les avant de continuer, ne recommence pas de zéro.`
      : `Tu reprends le travail de l'étape ${phaseLabel || ""} en agissant comme ${agent || "l'agent responsable"}.`;
  return `${head}

Les réponses sont dans \`${answers}\`. Lis-les, intègre-les à tes livrables, et continue :
- mets à jour les livrables concernés ;
- si de nouvelles imprécisions ou décisions apparaissent, pose-les via le protocole (fichier indiqué ci-dessous — il remplace tout fichier de questions précédent) ;
- respecte la règle de gate de ta consigne (si une revue est prévue, n'écris pas le Status toi-même).

${contractBlock(pendingFileRel || undefined, { answersFile: answers })}`;
}

/**
 * Reusable protocol appended to reviewer / remediation prompts: any risk raised
 * (a PASS_WITH_RISK, or a residual risk of a FAIL) must be REGISTERED in the risk
 * register, not just named in prose. Mirrors the pending-input contract but for risks.
 */
export function riskRegisterProtocolText(risksFileRel = "livrables/_governance/agent-io/risks.json") {
  return `

## Registre des risques (obligatoire)
Tout risque que tu identifies ou fais évoluer (notamment quand tu poses un gate en \`PASS_WITH_RISK\`, ou un risque résiduel d'un \`FAIL\`) doit être INSCRIT dans le registre, pas seulement mentionné en prose. Écris/complète le tableau JSON dans \`${risksFileRel}\` (crée le fichier si besoin), au format :
[
  {
    "id": "R-<GATE>-NN (réutilise l'id existant si le risque existe déjà, ex. R-G5-05)",
    "title": "intitulé court du risque",
    "description": "en quoi consiste le risque et son impact",
    "severity": "low | medium | high | critical",
    "phaseId": "G0..G7", "gate": "ex. G6",
    "owner": "@profil responsable",
    "status": "open | mitigating | resolved | accepted | closed",
    "mitigation": "prochaine action pour le réduire/lever",
    "note": "ce qui a changé (si tu mets à jour un risque existant)"
  }
]
Règles : un risque déjà présent au registre → réutilise son \`id\` et ne change que ce qui évolue (\`status\`, \`mitigation\`). Un \`PASS_WITH_RISK\` ne doit JAMAIS masquer une couche produit entière absente : ça, c'est un \`FAIL\` ou une décision de périmètre, pas un risque accepté.`;
}

/**
 * Reusable protocol appended to producer/reviewer/dev prompts: when an agent finishes
 * and identifies a NEXT-STEP action owned by another profile, it must register it as a
 * TASK (routed to that profile) instead of only mentioning it in prose — so it is never lost.
 */
export function taskProtocolText(tasksFileRel = "livrables/_governance/agent-io/tasks.json") {
  return `

## Tâches de suivi (obligatoire)
Si, en terminant, tu identifies une ACTION qui doit être faite par UN AUTRE PROFIL (ex. « le développeur doit reprendre US-030 modifiée », « le PO doit reprioriser »), ne la laisse PAS seulement en prose : ENREGISTRE-la comme tâche dans \`${tasksFileRel}\` (crée le fichier si besoin), un tableau JSON, chaque élément :
[
  {
    "id": "réutilise l'id d'une tâche existante si tu la fais avancer, sinon OMETS-le (créé automatiquement)",
    "title": "action courte et actionnable",
    "description": "quoi faire précisément, et à partir de quels livrables",
    "targetProfile": "profil qui doit la faire : po | developpeur | ux | architecte-metier | architecte-technique | securite | qa | devops | end-user | sponsor",
    "priority": "low | normal | high",
    "phaseId": "G0..G7 (étape concernée, si pertinent)",
    "status": "todo (ou 'done' si tu marques une tâche que TU viens de terminer)"
  }
]
Marque \`done\` toute tâche qui t'était assignée et que tu viens d'accomplir. Ne crée pas de doublon d'une tâche déjà ouverte.`;
}

/**
 * Batch execution: one profile's agent is handed SEVERAL tasks at once (e.g. the 3 things
 * the PO queued for the developer) and must do them all, updating each task's status.
 */
export function buildTaskBatchPrompt({ agent, profileLabel, tasks, tasksFileRel, pendingFileRel, risksFileRel }) {
  const list = (tasks || [])
    .map((t) => `- ${t.id} — ${t.title}${t.description ? `\n    ${t.description.replace(/\n/g, " ")}` : ""}`)
    .join("\n");
  return `Tu agis comme ${agent} (profil « ${profileLabel || ""} »), conformément à CLAUDE.md, .claude/rules/ et ton fichier d'agent.

On te confie ${(tasks || []).length} TÂCHE(S) à réaliser, dans l'ordre :
${list || "- (aucune)"}

Pour CHAQUE tâche :
1. Lis les livrables et le contexte nécessaires (project/PROJECT.md, les User Stories/écrans/architecture concernés, l'infrastructure locale).
2. Réalise le travail demandé et METS À JOUR les livrables (et le code si tu es développeur), en respectant la Definition of Done applicable (.claude/rules/quality-gates.md) — pour une US user-facing, l'écran doit être réellement livré (états + preuve L3/UI).
3. MARQUE la tâche \`done\` dans \`${tasksFileRel}\` (réutilise son \`id\`), avec une brève note de ce que tu as fait. Si tu ne peux pas la finir, laisse-la \`in-progress\` et explique le blocage.
4. Si une tâche exige une décision/information d'un autre profil, pose-la via le protocole (ci-dessous), routée vers ce profil — ne devine pas.

${contractBlock(pendingFileRel)}${riskRegisterProtocolText(risksFileRel)}${taskProtocolText(tasksFileRel)}`;
}

/**
 * A specialist agent (the risk's owner) is asked to TREAT a specific risk: mitigate it
 * in its own deliverables, update the risk's status, and — when it needs input from the
 * raiser or another profile — open a dialogue via the decision protocol (pending-input).
 */
export function buildRiskResolutionPrompt(risk, { agent, risksFileRel, pendingFileRel }) {
  return `Tu agis comme ${agent} (profil propriétaire de ce risque), conformément à CLAUDE.md, .claude/rules/ et ton fichier d'agent.

Un risque de TON domaine t'est confié pour TRAITEMENT.

RISQUE ${risk.id} — ${risk.title}
Sévérité : ${risk.severity}. Origine : ${risk.gate || risk.phaseId || "—"}. Soulevé par : ${risk.raisedBy || "—"}.
Description : ${risk.description || "—"}
${risk.mitigation ? `Piste de mitigation déjà notée : ${risk.mitigation}` : ""}

Ton travail :
1. Lis project/PROJECT.md et TES livrables pertinents pour ce risque (architecture, sécurité, NFR, ADR, tests…).
2. APPLIQUE une mitigation concrète dans tes livrables (mets-les à jour ; ajoute/actualise un ADR sous /livrables/_governance/decisions/ si c'est un choix structurant). Ne te contente pas de re-décrire le risque.
3. METS À JOUR le risque \`${risk.id}\` (voir protocole registre ci-dessous) : \`status\` = \`resolved\` UNIQUEMENT si le risque est réellement levé avec une PREUVE (test exécuté, livrable à jour) ; sinon \`mitigating\` avec la \`mitigation\` = prochaine action précise, ou \`accepted\` si tu recommandes de l'assumer (en justifiant).
4. DIALOGUE : si lever ce risque exige une décision ou une information du DEMANDEUR (${risk.raisedBy || "l'agent qui l'a soulevé"}) ou d'un autre profil, NE devine pas — pose une décision/question via le protocole (pending-input ci-dessous), routée vers le bon profil, en référençant ${risk.id}. C'est ainsi que le spécialiste et le demandeur se répondent.
5. Ne clos jamais un risque sans preuve, et ne masque pas une couche produit manquante en « risque accepté ».
${contractBlock(pendingFileRel)}${riskRegisterProtocolText(risksFileRel)}`;
}

/**
 * Batch risk treatment: one owner agent (the expert) is handed SEVERAL risks of its
 * domain at once. It mitigates each, then LOOPS BACK to the risk's requester for
 * validation that the risk is controlled (a decision routed to the requester's profile).
 */
export function buildRiskBatchPrompt({ agent, profileLabel, risks, risksFileRel, pendingFileRel, tasksFileRel }) {
  const list = (risks || [])
    .map((r) => `- ${r.id} — ${r.title} (sévérité ${r.severity}, soulevé par ${r.raisedBy || "?"})${r.description ? `\n    ${r.description.replace(/\n/g, " ")}` : ""}${r.mitigation ? `\n    Piste : ${r.mitigation}` : ""}`)
    .join("\n");
  return `Tu agis comme ${agent} (profil « ${profileLabel || ""} », expert propriétaire), conformément à CLAUDE.md, .claude/rules/ et ton fichier d'agent.

On te confie ${(risks || []).length} RISQUE(S) de ton domaine à TRAITER :
${list || "- (aucun)"}

Pour CHAQUE risque, dans l'ordre :
1. Lis tes livrables pertinents (architecture, sécurité, NFR, ADR, tests).
2. APPLIQUE une mitigation concrète : mets à jour tes livrables (et un ADR sous /livrables/_governance/decisions/ si c'est structurant). Ne te contente pas de re-décrire le risque.
3. METS À JOUR le risque (protocole registre ci-dessous) : passe-le \`mitigating\` avec la mitigation appliquée.
4. **BOUCLE DE VALIDATION** : demande au DEMANDEUR du risque (${"celui indiqué dans « soulevé par »"}) de VALIDER que le risque est désormais maîtrisé — pose une DÉCISION via le protocole (pending-input), routée vers le profil du demandeur, du type « Confirmez-vous que ${'<R-XXX>'} est maîtrisé par la mitigation appliquée ? » avec les preuves. **Ne passe PAS le risque \`resolved\` toi-même** : il reste \`mitigating\` tant que le demandeur n'a pas validé.
5. Si une tâche de suivi pour un autre profil en découle, enregistre-la (protocole tâches ci-dessous).

${contractBlock(pendingFileRel)}${riskRegisterProtocolText(risksFileRel)}${taskProtocolText(tasksFileRel)}`;
}

/**
 * Integrate answered decisions: hand the RAISING agent the human answers so it applies
 * them to the deliverables/code. Works even when the original raising run is gone (the
 * answers are passed inline), unlike a plain resume.
 */
export function buildDecisionIntegrationPrompt({ agent, decisions, pendingFileRel, risksFileRel, tasksFileRel }) {
  const list = (decisions || [])
    .map((d) => {
      const ans = d.answer || {};
      const a = ans.delegated ? "DÉLÉGUÉ — fais au mieux selon le contexte et les bonnes pratiques" : (ans.choiceLabel || "—");
      return `- ${d.id} — ${d.title}\n    CONTEXTE : ${(d.context || d.summary || "—").replace(/\n/g, " ")}\n    RÉPONSE HUMAINE : ${a}${ans.note ? ` (note : ${String(ans.note).replace(/\n/g, " ")})` : ""}`;
    })
    .join("\n");
  return `Tu agis comme ${agent} (l'agent qui avait soulevé ces décisions), conformément à CLAUDE.md, .claude/rules/ et ton fichier d'agent.

${(decisions || []).length} DÉCISION(S) que tu avais soulevée(s) ont reçu une RÉPONSE HUMAINE. PRENDS-LES EN COMPTE et METS À JOUR les livrables (et le code si tu es développeur) en conséquence :
${list || "- (aucune)"}

Pour chaque décision : applique la réponse concrètement (mets à jour le livrable/code concerné, ajoute/actualise un ADR si structurant), en respectant la Definition of Done. Si une réponse est « DÉLÉGUÉ », tranche toi-même au mieux et documente ton choix. Ne repose pas une question déjà répondue. Si l'application révèle une nouvelle imprécision, pose-la via le protocole.

${contractBlock(pendingFileRel)}${riskRegisterProtocolText(risksFileRel)}${taskProtocolText(tasksFileRel)}`;
}

/**
 * One-off seeding pass: an agent reads the gate reports, the verification report,
 * and the journals, extracts every named risk (R-XXX) and writes them as a structured
 * array to agent-io/risks.json so the platform can ingest them into the register.
 */
export function buildRiskSeedPrompt() {
  return `Tu agis comme @qa pour AMORCER le registre des risques du projet : recenser les risques DÉJÀ identifiés dans les livrables et les rendre traçables.

Travail :
1. Lis les rapports de gate dans \`livrables/_governance/gates/*.md\` (cherche les statuts \`PASS_WITH_RISK\` / \`FAIL\` et leurs sections « Accepted Risks » / « Blocking Issues »).
2. Lis le rapport de vérification \`livrables/07-tests/G6-*.md\` et les journaux \`livrables/00-contexte/journaux/*.md\`.
3. Repère TOUTE référence de risque nommée (motif \`R-...\`, ex. R-G5-05, R-ACC-03) avec son intitulé, sa sévérité implicite, la phase/gate d'origine, son propriétaire et son état réel (un risque décrit comme « LEVÉ / RÉSOLU » → \`resolved\` ; un risque résiduel encore ouvert → \`open\`).
4. N'INVENTE aucun risque : uniquement ceux réellement écrits dans les livrables. Ne duplique pas un id.

Puis ÉCRIS le résultat dans \`livrables/_governance/agent-io/risks.json\` (crée le dossier si besoin) — un tableau JSON, chaque élément :
{
  "id": "R-... (id exact tel qu'écrit dans les livrables)",
  "title": "intitulé court",
  "description": "description + impact, tirés du livrable",
  "severity": "low | medium | high | critical",
  "phaseId": "G0..G7", "gate": "ex. G6",
  "owner": "@profil (tel qu'indiqué comme owner)",
  "status": "open | mitigating | resolved | accepted | closed",
  "mitigation": "prochaine action indiquée, si présente"
}
N'écris QUE ce fichier JSON. Ne modifie aucun livrable.`;
}
