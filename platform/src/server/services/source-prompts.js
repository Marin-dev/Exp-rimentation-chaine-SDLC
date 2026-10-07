import { contractBlock } from "./run-prompts.js";
import { PHASES } from "../domain/phases.js";
import { SOURCE_LEVELS } from "./source-map.js";

/**
 * Prompts of the "bootstrap from a rich client folder" feature: cartography of the
 * client sources, coverage analysis, and the reprise-mode instructions injected into
 * every phase prompt when the client already provided material for that phase.
 */

const PHASE_LIST = PHASES.filter((p) => p.id !== "G0")
  .map((p) => `${p.id} (${p.title} : ${p.subtitle})`)
  .join(", ");

/**
 * Reprise mode. The brief file only exists when the human validated client sources for
 * this phase, so the agent checks for it: no plumbing needed in every caller.
 */
export function repriseHint(phaseId) {
  if (!phaseId) return "";
  return `
--- MODE REPRISE (si applicable) ---
Si le fichier \`livrables/_sources/par-etape/${phaseId}.md\` existe, le client a DÉJÀ fourni de la matière pour cette étape (specs, maquettes, schémas…). Lis-le, puis lis chaque document qu'il référence (chemins « normalisé » ; les PDF et images se lisent directement). Dans ce cas :
1. Ton travail n'est pas de partir de zéro mais de REPRENDRE l'existant : transforme cette matière au format des livrables attendus, en conservant le fond. Ne réinvente pas ce que le client a décidé.
2. Cite la source de chaque élément repris, sous la forme « (source : SRC-012, §4.2) ». Termine chaque livrable par une section « Traçabilité des sources » : élément → document(s) source.
3. Ce qui manque pour atteindre le niveau attendu par les règles de gate : ne le complète pas par supposition. Pose une question via le protocole, routée vers le bon profil. Une déduction raisonnable est permise si tu la marques explicitement « [Hypothèse] ».
4. Deux sources qui se contredisent : pose une décision via le protocole, avec une option par version trouvée dans les sources (en citant les documents).
5. Un document « de référence » prime sur les autres en cas de doute ; un brouillon ou un document ancien compte moins qu'un document validé ou récent.
--- FIN MODE REPRISE ---
`;
}

/** Cartography: classify every ingested client document. */
export function buildSourceMapPrompt() {
  return `Tu agis comme @project-bootstrapper, en suivant CLAUDE.md, .claude/rules/ et .claude/agents/project-bootstrapper.md.

Le client a fourni un dossier de documents riche (specs fonctionnelles et techniques, maquettes, présentations, tableaux…). La plateforme l'a copié et converti. Ta mission : CARTOGRAPHIER ces documents pour que chacun alimente la bonne étape de la chaîne.

Entrées :
- \`livrables/_sources/sources.json\` : la liste des documents (id SRC-NNN, chemin d'origine, chemin « normalized » à lire, type de conversion, note éventuelle). Ignore ceux dont le statut est « removed » ou dont « normalized » est null (format non lisible : signale-les simplement dans la synthèse).
- Les documents eux-mêmes : lis le fichier « normalized » de chacun (Markdown converti, ou PDF / image lus directement). Les images extraites sont référencées dans le Markdown.

Pour CHAQUE document lisible, détermine :
- "title" : un titre court et parlant ;
- "level" : un parmi ${SOURCE_LEVELS.join(", ")} ;
- "phases" : la ou les étapes qu'il alimente, parmi ${PHASE_LIST}. Un document peut en alimenter plusieurs (ex. une spec fonctionnelle → G2 et G4). Liste uniquement les étapes où il apporte vraiment de la matière ;
- "docType" : le livrable de l'étape qu'il alimente (ex. « parcours utilisateurs », « architecture applicative », « backlog / user stories », « écrans ») ;
- "reliability" : {"version": "...", "date": "...", "status": "validé | brouillon | inconnu"} d'après le contenu et le nom du fichier ;
- "summary" : 1 à 2 phrases sur ce qu'il contient d'utile ;
- "reference" : true seulement si c'est manifestement le document qui fait foi sur son sujet ;
- "relations" : [{"with": "SRC-...", "type": "chevauchement | contradiction | complément | version", "topic": "sur quoi"}] avec les autres documents. Cherche activement les CONTRADICTIONS (deux règles, chiffres ou choix incompatibles) et les VERSIONS successives d'un même document.

Écris :
1. \`livrables/_governance/agent-io/source-map.json\` AU FORMAT EXACT : {"documents": [{"id": "SRC-001", "title": "...", "level": "...", "phases": ["G2"], "docType": "...", "reliability": {...}, "summary": "...", "reference": false, "relations": []}]}
2. \`livrables/00-contexte/cartographie-sources.md\` : la version lisible pour l'humain — un tableau document → niveau → étapes → fiabilité, puis les contradictions et chevauchements repérés, puis les documents illisibles ou partiellement lisibles (ex. fichier Figma dont seule la miniature est exploitable) avec ce qu'il faudrait demander au client.

Ne produis AUCUN autre livrable : l'humain valide d'abord cette affectation dans la plateforme.
Si un document est ambigu au point de ne pas pouvoir être affecté, pose une question via le protocole (profil "orchestrateur").

${contractBlock()}`;
}

/** Coverage: what the client sources cover vs. what each gate expects. */
export function buildCoveragePrompt() {
  const expected = PHASES.filter((p) => ["G1", "G2", "G3", "G4"].includes(p.id))
    .map((p) => `- ${p.id} ${p.title} : ${(p.produces || []).join(" ; ")}`)
    .join("\n");
  return `Tu agis comme @project-bootstrapper, en suivant CLAUDE.md, .claude/rules/ et .claude/agents/project-bootstrapper.md.

Les documents du client ont été cartographiés et l'affectation a été validée par l'humain. Ta mission : mesurer ce qu'ils COUVRENT par rapport à ce que la chaîne doit produire jusqu'au backlog, et préparer les questions à poser au client.

Entrées :
- \`livrables/00-contexte/cartographie-sources.md\` et \`livrables/_sources/sources.json\` ;
- les briefs par étape \`livrables/_sources/par-etape/*.md\` et les documents qu'ils référencent ;
- les exigences des gates dans \`.claude/rules/quality-gates.md\` (Definition of Ready notamment).

Livrables attendus par étape :
${expected}
- G4 : planning (charge en jours-homme, équipe, sprints, jalons)

Pour chaque exigence de chaque étape, détermine son statut : "covered" (les sources suffisent), "partial" (matière présente mais incomplète), "missing" (rien dans les sources), "conflict" (sources contradictoires).

Écris :
1. \`livrables/_governance/agent-io/coverage.json\` AU FORMAT EXACT : {"items": [{"phaseId": "G2", "requirement": "parcours utilisateurs", "status": "partial", "sources": ["SRC-004"], "note": "ce qui manque ou ce qui se contredit"}]}
2. \`livrables/00-contexte/couverture-sources.md\` : la matrice lisible (étape → exigence → statut → sources → commentaire) avec une synthèse en tête : ce qui est solide, ce qui manque le plus, ce qui se contredit.
3. \`livrables/00-contexte/questionnaire-client.md\` : un questionnaire PRÊT À ENVOYER au client, rédigé pour lui (pas de jargon interne de la chaîne), regroupé par thème, chaque question précisant pourquoi on la pose et, si utile, les options possibles. Inclus les demandes de documents manquants (ex. export PDF des écrans Figma). Numérote les questions.

Les contradictions qui demandent un arbitrage interne (pas une information du client) : pose-les en décisions via le protocole, routées vers le bon profil. Les manques d'information vont dans le questionnaire, pas dans le protocole.

${contractBlock()}`;
}

/** Extra paragraph for G0 when client sources were ingested and mapped. */
export function g0SourcesBlock() {
  return `
SOURCES CLIENT : le dossier du client a été ingéré et cartographié. Appuie-toi sur \`livrables/00-contexte/cartographie-sources.md\`, \`livrables/_sources/sources.json\` et les briefs \`livrables/_sources/par-etape/*.md\` plutôt que de relire le dossier brut. Le contexte projet (project/<slug>/) doit refléter la matière déjà fournie par le client ; ne pose pas de question dont la réponse figure dans les sources.
`;
}
