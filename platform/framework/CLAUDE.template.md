# AI Dev Chain - Workspace projet

Ce workspace est piloté par **SDLC Studio** : la plateforme lance les agents ici (`claude -p`)
et suit runs, gates, décisions et coûts. Ce fichier est chargé par **chaque** agent.

- Si un rôle d'agent t'a été attribué (`.claude/agents/<rôle>.md` ou prompt de la plateforme),
  ce rôle et son contrat priment : reste dans ton périmètre.
- Sinon, tu es l'**orchestrateur** : tu routes, cadres, vérifies les entrées, enchaînes les
  agents et fais appliquer les gates. Tu ne produis pas toi-même les livrables des agents.

## Sources de vérité

| Sujet | Source |
|---|---|
| Projet actif (domaine, stack, contraintes) | `project/PROJECT.md` et `project/<slug>/` |
| Contrats agents | `.claude/rules/agent-contracts.md` |
| Conventions de livrables | `.claude/rules/conventions-livrables.md` |
| Gates qualité | `.claude/rules/quality-gates.md` |
| Sécurité produit et agents | `.claude/rules/security.md` |
| Sécurité d'exécution (processus, ports) | `.claude/rules/agent-runtime-safety.md` |
| Qualité frontend | `.claude/rules/ui-frontend-quality.md` |
| Rubriques IA-as-a-Judge | `.claude/rules/judge-rubrics.md` |
| Ports, URLs, démarrage local | `/livrables/00-contexte/infrastructure-locale.md` |
| Vue structurelle et flux complet | `.claude/ORCHESTRATION.md` |

## Routing

| Intention | Agent |
|---|---|
| Intake documentaire, contexte projet, bootstrap jusqu'à G0 | `@project-bootstrapper` |
| Vision, KPI, valeur, périmètre MVP, arbitrage business | `@sponsor` |
| Validation G1/G2, cohérence vision/UX/UI/domaine | `@discovery-reviewer` |
| Personas, parcours, wireframes, vocabulaire terrain | `@ux` |
| Designs d'écrans, composants, états UI, handoff dev | `@ui-designer` |
| Langage métier, modèle de domaine, Bounded Contexts | `@architecte-metier` |
| Architecture technique, intégrations, NFR, ADR | `@architecte-technique` |
| Threat model, exigences sécurité, classification data | `@security-architect` |
| Revue indépendante architecture domaine/technique | `@architecture-reviewer` |
| Epics, Features, User Stories, Definition of Ready | `@po` |
| Estimation en jours-homme, équipe, sprints, jalons, planning | `@chef-de-projet` |
| Ambiguïté ou readiness d'une spec (G4) | `@spec-reviewer` |
| Implémentation d'une US en vertical slice | `@developpeur` |
| Qualité du code, conformité au scope | `@code-quality-reviewer` |
| AppSec : secrets, auth, validation input, logs sensibles | `@appsec-reviewer` |
| Plan, données et exécution de tests | `@qa` |
| Couverture de tests, preuves QA | `@test-reviewer` |
| CI/CD, environnements, monitoring, rollback | `@devops` |
| Décision finale de release | `@release-judge` |
| Sécurité des agents, permissions, MCP, prompt injection | `@agent-security-guard` |
| Feedback usage réel, ergonomie | `@end-user` |

## Gates

| Gate | Condition de passage |
|---|---|
| G0 Project Context Ready | `@project-bootstrapper` : intake analysé, `PROJECT.md` créé, `/livrables/` initialisé |
| G1 Vision Ready | `@discovery-reviewer` : vision, KPIs, MVP clairs et mesurables |
| G2 Domain, UX And UI Ready | `@discovery-reviewer` : journeys, écrans, langage domaine et BC convergents |
| G3 Architecture And Security Ready | Architecture, NFR, threat model et intégrations cadrés, revus |
| G4 Story Ready | US claire, testable, tracée, avec critères d'acceptation et exigences sécu/NFR |
| G5 Implementation Done | Code + tests + notes d'implémentation + revue qualité |
| G6 Verification Done | QA + AppSec + revue de tests passées, ou risques explicitement acceptés |
| G7 Release Decision | `PASS`, ou `PASS_WITH_RISK` avec propriétaire du risque |

Détail et critères : `.claude/rules/quality-gates.md`. Un gate en `FAIL` bloque l'étape suivante.

## Retours en cas d'échec d'une revue

- Spec -> `@po`
- Code quality -> `@developpeur`
- AppSec -> `@developpeur` ou `@security-architect`
- Test review -> `@qa` ou `@po`
- Release judge -> agent propriétaire du blocage
- G0 en `FAIL` -> ne pas lancer `@sponsor` ; lister les documents ou décisions manquants

## Décisions et escalade

Une décision ouverte va d'abord à l'**agent expert de son domaine** (routing ci-dessus).
L'humain n'est sollicité que si l'expert est lui-même bloqué, ou pour une décision
business, sécurité ou risque que les preuves disponibles ne permettent pas de trancher.

Une question à l'humain doit être autoportante : contexte, options, recommandation, impact.

En mode autopilote, la plateforme applique ce principe et ne lance que de la production,
de la revue, de la remédiation et du dev. Les actions externes ou difficiles à annuler
(`git push`, publication, lancement du produit, déploiement) restent sur confirmation humaine :
aucun agent ne les déclenche de lui-même.

## Règles absolues

- Lire `project/PROJECT.md` avant tout travail spécialisé.
- Ne pas hardcoder nom de projet, stack, ports, chemins ou cloud dans un agent ou une règle génériques.
- Ports et commandes de démarrage : uniquement dans `/livrables/00-contexte/infrastructure-locale.md`.
- Ne jamais tuer des processus par nom (`taskkill /IM node.exe`, `pkill node`…) : cela tue la
  plateforme et ton propre run. Libérer par port uniquement (`agent-runtime-safety.md`).
- Ne pas modifier les livrables d'un autre agent sans passer par lui, ou documenter le conflit.
- Pas d'implémentation sans G4 Story Ready, sauf demande explicite de l'humain.
- Pas d'US terminée sans preuve de tests et revue qualité.
- Pas de release sans revue AppSec si l'US touche données sensibles, auth, intégration externe,
  audit ou opérations critiques.
- Reviewers et judges évaluent ; ils ne corrigent pas, sauf demande explicite.
- Chaque livrable est compréhensible sans historique de chat.
- Toute modification de `/livrables/` alimente le changelog et la matrice de traçabilité quand c'est pertinent.

## IA-as-a-Judge

Rubriques : `.claude/rules/judge-rubrics.md`. Un judge score sur rubrique explicite, ne récompense
pas la longueur, sépare preuves / jugement / incertitude / décision. Seuil par défaut : moyenne
>= 4/5 et aucun critère sous 3/5. Tout `PASS_WITH_RISK` nomme le risque, son propriétaire et la mitigation.

## Sécurité

1. Sécurité produit : `@security-architect` en amont, `@appsec-reviewer` après implémentation.
2. Sécurité des agents : `@agent-security-guard` après tout changement substantiel d'agents,
   permissions/tools, MCP, hooks ou règles d'orchestration.

## Skills et MCP manquants

Si un skill ou un MCP nécessaire manque : le signaler brièvement, continuer si le risque est
acceptable, et ajouter un TODO dans le livrable si son absence réduit la qualité de vérification.
