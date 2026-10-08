import { PROFILES } from "../domain/profiles.js";
import { contractBlock, riskRegisterProtocolText, taskProtocolText, acceptanceRulesText } from "./run-prompts.js";

/**
 * Prompts of the request desk (request-flow.js). Each step asks ONE agent for ONE thing and
 * a machine-readable output file: request-<REQ-id>-<step>.json under agent-io.
 */

export function requestOutputRel(id, step) {
  return `livrables/_governance/agent-io/request-${id}-${step}.json`;
}

function header(req) {
  const c = req.classification || {};
  const lines = [
    `DEMANDE ${req.id}${c.title ? ` — ${c.title}` : ""}`,
    `Émise par : ${req.byLabel || req.by || "un membre de l'équipe"}`,
    `Texte d'origine : « ${req.text} »`
  ];
  if (c.summary) lines.push(`Reformulation : ${c.summary}`);
  if (c.screen) lines.push(`Écran / zone concernée : ${c.screen}`);
  if (c.expected) lines.push(`Comportement attendu : ${c.expected}`);
  if (c.observed) lines.push(`Comportement observé : ${c.observed}`);
  if (Array.isArray(c.us) && c.us.length) lines.push(`User Stories liées : ${c.us.join(", ")}`);
  const comments = (req.comments || []).map((m) => `- ${m.byLabel || m.by || "?"} : ${m.text}`);
  if (comments.length) lines.push(`Compléments apportés depuis :\n${comments.join("\n")}`);
  return lines.join("\n");
}

const PROFILE_IDS = PROFILES.map((p) => `${p.id} (${p.label})`).join(", ");

export function buildClassifyPrompt(req, { openRequests, stories }) {
  const open = (openRequests || []).map((r) => `- ${r.id} [${r.type || "?"}] ${r.title}`).join("\n") || "- (aucune)";
  const us = (stories || []).map((u) => `- ${u.id} — ${u.title}`).join("\n") || "- (aucune)";
  return `Tu es l'ORCHESTRATEUR de la chaîne SDLC Studio. Un utilisateur vient de déposer une demande au guichet. Ton seul travail : la COMPRENDRE et la CLASSER. Tu ne la traites pas, tu ne modifies aucun fichier du projet.

${header(req)}

Types possibles :
- "question" : l'utilisateur veut une information (comment ça marche, où en est-on, pourquoi tel choix). Rien n'est cassé, rien n'est demandé en plus.
- "bug" : un comportement du produit livré ne correspond pas à ce qui est prévu (bouton qui ne marche pas, erreur, donnée fausse).
- "feature" : une fonctionnalité nouvelle ou un changement de comportement souhaité, qui n'était pas prévu.
- "spec-change" : un changement de cadrage, de règle métier ou de périmètre qui remet en cause des livrables déjà validés (vision, domaine, architecture) au-delà d'une seule fonctionnalité.
En cas de doute entre bug et feature : c'est un bug si une User Story ou un critère d'acceptation existant prévoit déjà le comportement attendu.

Demandes encore ouvertes (pour repérer un doublon) :
${open}

User Stories du projet :
${us}

Lis au besoin les User Stories citées (livrables/05-backlog/user-stories/) pour classer juste.

ÉCRIS ta réponse dans \`${requestOutputRel(req.id, "classification")}\` AU FORMAT EXACT :
{
  "type": "question" | "bug" | "feature" | "spec-change",
  "title": "intitulé court (moins de 80 caractères)",
  "summary": "reformulation claire et sans jargon de la demande",
  "us": ["US-NNN liées, s'il y en a"],
  "screen": "écran ou zone concernée, si identifiable",
  "expected": "comportement attendu (bug, feature)",
  "observed": "comportement observé (bug)",
  "urgency": "low" | "normal" | "high",
  "profile": "pour une question : le profil le mieux placé pour répondre, parmi ${PROFILE_IDS}",
  "duplicateOf": "REQ-NNN si c'est clairement la même demande qu'une demande ouverte, sinon null",
  "phaseId": "G1..G7, l'étape la plus concernée"
}
N'écris rien d'autre.`;
}

export function buildAnswerPrompt(req, agent) {
  return `Tu agis comme ${agent}, conformément à CLAUDE.md, .claude/rules/ et ton fichier d'agent.

Un membre de l'équipe pose une QUESTION. Réponds-lui à partir des livrables et du code du projet. Tu es en LECTURE SEULE : tu ne modifies aucun fichier, sauf le fichier de réponse ci-dessous.

${header(req)}

Si ta recherche révèle un manque réel (un comportement cassé, ou un besoin non couvert), signale-le dans "gap" : la plateforme proposera d'ouvrir une demande. N'invente pas de manque.

ÉCRIS ta réponse dans \`${requestOutputRel(req.id, "answer")}\` AU FORMAT EXACT :
{
  "answer": "réponse claire, sans jargon, adressée à la personne qui demande",
  "sources": ["chemins des livrables ou fichiers de code sur lesquels tu t'appuies"],
  "gap": null | { "type": "bug" | "feature", "summary": "ce qui manque ou ne marche pas" }
}`;
}

export function buildReproducePrompt(req) {
  return `Tu agis comme @qa, conformément à CLAUDE.md, .claude/rules/ et .claude/agents/qa.md.

Une ANOMALIE est signalée. Avant toute correction, tu la REPRODUIS par un test automatisé qui ÉCHOUE aujourd'hui et passera quand elle sera corrigée (test de non-régression). Tu ne corriges PAS le produit.

${header(req)}

Travail attendu :
1. Lis les User Stories et critères liés, et le code concerné, pour comprendre le comportement attendu.
2. Écris un test (unitaire, API ou e2e selon l'endroit du défaut) dans le dossier de tests du produit. Le NOM de chaque cas contient « ${req.id} » (et l'US si elle est connue), ex. « ${req.id} US-012 le total ignore la remise ».
3. Lance-le avec les commandes de \`livrables/07-tests/verification.json\` : il doit ÉCHOUER pour la bonne raison (le défaut), pas pour une erreur de syntaxe ou d'environnement.
4. Ajoute le test au manifeste \`livrables/07-tests/acceptance/manifest.json\`, dans un tableau "regressions" (crée-le s'il n'existe pas, garde le reste intact) : { "id": "${req.id}", "title": "…", "tests": ["chemin/relatif/du/test"] }.

Si tu ne parviens PAS à reproduire (comportement conforme, information manquante), ne fabrique pas de test : explique pourquoi et quelle information il faudrait.

ÉCRIS le résultat dans \`${requestOutputRel(req.id, "repro")}\` :
{ "reproduced": true | false, "tests": ["chemins des tests écrits"], "notes": "ce que tu as constaté ; si non reproduit : ce qu'il faudrait savoir" }
${contractBlock()}${riskRegisterProtocolText()}`;
}

export function buildFixPrompt(req, { attempt, failures }) {
  return `Tu agis comme @developpeur, conformément à CLAUDE.md, .claude/rules/ et .claude/agents/developpeur.md.

Corrige l'ANOMALIE ci-dessous. @qa l'a reproduite par un test de non-régression (nom contenant « ${req.id} », listé dans "regressions" du manifeste) qui échoue aujourd'hui.

${header(req)}
${attempt > 1 ? `\nTENTATIVE ${attempt}. La vérification ou la revue précédente a relevé :\n${failures || "(voir livrables/_governance/evidence/G5.md)"}\n` : ""}
Travail attendu :
- Trouve la cause et corrige-la dans le code produit, au plus juste (pas de refonte, pas de fonctionnalité en plus).
- Le test de ${req.id} doit PASSER, et les autres tests (acceptation, unitaires) doivent continuer à passer.
- Consigne la correction dans /livrables/06-dev/corrections/${req.id}.md : cause, correctif, fichiers modifiés.

ÉCRIS pour finir \`${requestOutputRel(req.id, "fix")}\` : { "summary": "cause et correctif en une ou deux phrases", "files": ["fichiers modifiés"] }
${acceptanceRulesText()}${contractBlock()}${riskRegisterProtocolText()}${taskProtocolText()}`;
}

export function buildRequestReviewPrompt(req, { kind, usIds }) {
  const scope = kind === "bug"
    ? `la correction de l'anomalie ${req.id} (note : /livrables/06-dev/corrections/${req.id}.md)`
    : `l'évolution ${req.id} (User Stories ${(usIds || []).join(", ") || "—"})`;
  return `Tu agis comme @code-quality-reviewer, conformément à .claude/rules/quality-gates.md et .claude/rules/judge-rubrics.md.

Tu REVOIS ${scope}. Tu es un évaluateur : tu ne modifies rien.

${header(req)}

La plateforme a déjà rejoué les tests : résultats dans \`livrables/_governance/evidence/G5.md\` (ils font foi). Juge ce qu'ils ne mesurent pas : la correction traite-t-elle la CAUSE (pas un contournement), le code est-il lisible et cohérent avec l'architecture, y a-t-il un risque de sécurité ou de régression non couvert ? Si un dépôt git existe, appuie-toi sur le diff (git diff, git log).

ÉCRIS ton verdict dans \`${requestOutputRel(req.id, "review")}\` :
{ "approved": true | false, "issues": ["problèmes BLOQUANTS seulement, précis et actionnables"], "notes": "remarques non bloquantes" }
${riskRegisterProtocolText()}`;
}

export function buildImpactPrompt(req) {
  return `Tu agis comme @po, en t'appuyant sur les livrables de @architecte-technique et @architecte-metier, conformément à CLAUDE.md, .claude/rules/ et ton fichier d'agent.

Une ÉVOLUTION est demandée. Avant toute réalisation, le chef de projet doit décider en connaissance de cause. Tu analyses son IMPACT ; tu ne modifies aucun livrable.

${header(req)}

Analyse : quelles User Stories existantes sont touchées, quelles nouvelles User Stories faudrait-il, quels Bounded Contexts et quelles parties de l'architecture sont concernés, faut-il rouvrir un gate, quelle charge (jours-homme, fourchette), quels risques, et ta recommandation (faire maintenant, plus tard, ou pas).

ÉCRIS l'analyse dans \`${requestOutputRel(req.id, "impact")}\` :
{
  "summary": "en 3 à 5 phrases, pour un décideur non technique",
  "affectedUs": ["US-NNN"],
  "newUs": [ { "title": "…", "summary": "…" } ],
  "boundedContexts": ["BC-NN"],
  "gatesToReopen": ["Gx"],
  "estimateDays": { "min": 0, "max": 0 },
  "risks": ["…"],
  "recommendation": "do-now" | "later" | "no",
  "rationale": "pourquoi"
}`;
}

export function buildSpecifyPrompt(req) {
  const impact = req.impact || {};
  return `Tu agis comme @po, conformément à CLAUDE.md, .claude/rules/ et .claude/agents/po.md.

Le chef de projet a VALIDÉ l'évolution ci-dessous. Spécifie-la dans le backlog.

${header(req)}

Analyse d'impact validée : ${impact.summary || "—"}
User Stories touchées : ${(impact.affectedUs || []).join(", ") || "aucune"} ; nouvelles User Stories envisagées : ${(impact.newUs || []).map((u) => u.title).join(" ; ") || "aucune"}.
${req.decisionNote ? `Note du chef de projet : ${req.decisionNote}\n` : ""}
Travail attendu :
- Crée les nouvelles User Stories (livrables/05-backlog/user-stories/US-[NNN]-[slug].md, numérotation à la suite) et mets à jour celles qui sont touchées, au format du projet : Bounded Context, critères d'acceptation testables, Definition of Ready. Mentionne « Origine : ${req.id} ».
- Mets à jour le backlog (epics / features) si nécessaire.

ÉCRIS dans \`${requestOutputRel(req.id, "spec")}\` : { "us": ["US-NNN créées ou modifiées"], "notes": "…" }
${contractBlock()}${taskProtocolText()}`;
}

export function buildScopedAcceptancePrompt(req, usIds) {
  return `Tu agis comme @qa, conformément à CLAUDE.md, .claude/rules/ et .claude/agents/qa.md.

L'évolution ${req.id} vient d'être spécifiée. Écris, AVANT le développement, les TESTS D'ACCEPTATION EXÉCUTABLES des User Stories ${usIds.join(", ")} : un cas par critère, avec l'US et le critère dans le NOM du cas (ex. « US-031 AC2 … »). Pour une US déjà testée et modifiée, mets ses tests à jour selon ses nouveaux critères.

Mets à jour le manifeste \`livrables/07-tests/acceptance/manifest.json\` (entrées "stories" de ces US, le reste intact) et, si une commande manque, \`livrables/07-tests/verification.json\`. Les tests échouent tant que l'évolution n'est pas développée : c'est attendu. Ne développe pas le produit.

ÉCRIS dans \`${requestOutputRel(req.id, "tests")}\` : { "tests": ["chemins des fichiers de tests"], "notes": "…" }
${contractBlock()}${riskRegisterProtocolText()}`;
}

export function buildDevelopPrompt(req, usIds, { attempt, failures }) {
  return `Tu agis comme @developpeur, conformément à CLAUDE.md, .claude/rules/ et .claude/agents/developpeur.md.

Développe l'évolution ${req.id} : User Stories ${usIds.join(", ")} (livrables/05-backlog/user-stories/), en tranche verticale avec tests.

${header(req)}
${attempt > 1 ? `\nTENTATIVE ${attempt}. La vérification ou la revue précédente a relevé :\n${failures || "(voir livrables/_governance/evidence/G5.md)"}\n` : ""}
Pour chaque US : implémentation, note /livrables/06-dev/vertical-slices/US-[NNN]-impl.md. Pour une US user-facing, l'écran est réellement monté et câblé (états Chargement / Vide / Erreur).

ÉCRIS pour finir \`${requestOutputRel(req.id, "dev")}\` : { "summary": "ce qui a été développé", "files": ["fichiers créés ou modifiés"] }
${acceptanceRulesText()}${contractBlock()}${riskRegisterProtocolText()}${taskProtocolText()}`;
}
