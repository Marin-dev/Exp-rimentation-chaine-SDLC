# G1 - Vision Ready

**Status**: PASS_WITH_RISK
**Reviewer**: @discovery-reviewer
**Owner**: @sponsor (production) / @discovery-reviewer (validation)
**Date**: 2026-06-30
**Average score**: 4.7 / 5

## Evidence

- `livrables/01-vision/vision-produit.md`
- `livrables/01-vision/kpis.md`
- `livrables/01-vision/perimetre-mvp.md`
- `livrables/00-contexte/intake-synthesis.md`
- `livrables/_governance/decisions/DEC-G0-decisions-deleguees.md`
- `livrables/_governance/decisions/DEC-0010-valider-ou-ajuster-les-cibles-chiffrees-.md`
- `livrables/_governance/gates/G0-project-context-ready.md`
- **Rapport de revue détaillé** : `livrables/11-evaluations/G1-vision-discovery-review.md`

## Synthèse des scores

| Critère | Score /5 |
|---|---:|
| Clarté business | 5 |
| Qualité / mesurabilité des KPIs | 4 |
| Focalisation MVP | 5 |
| Alignement stratégique | 5 |
| Traçabilité | 5 |
| Visibilité des risques | 4 |
| Exploitabilité aval | 5 |

Moyenne 4.7/5 — seuil par défaut respecté (moyenne ≥ 4, aucun critère < 3). Détail des
justifications dans le rapport de revue.

## Blocking Issues

Aucun. Tous les inputs obligatoires de G1 sont présents et exploitables. La seule question
humaine ouverte (quantification des cibles KPI) a été **tranchée par l'humain** : maintien des
cibles comme hypothèses de travail (voir `DEC-0010`). Aucune nouvelle entrée humaine n'est
requise pour ce gate (`pending-input.json` → items vides côté revue G1).

## Accepted Risks

- **RB1 (faible→moyen)** — Cibles KPI et baselines reposent sur des **hypothèses**, pas sur des
  chiffres client. **Propriétaire : @sponsor.** Risque **explicitement accepté par l'humain**
  (DEC-0010). Mitigation : instrumenter et mesurer les baselines papier en début de pilote,
  puis revoir/valider les cibles à la première revue.
- **RB4 (faible)** — Volumétrie pilote hypothétique (q2). **Propriétaire : @architecte-technique.**
  Mitigation : confirmer la volumétrie réelle et réviser les NFR de charge en G3.

Ces risques sont nommés, possédés et tracés, et ne portent pas sur des inputs obligatoires
manquants. Conformément à `quality-gates.md`, l'usage de `PASS_WITH_RISK` est justifié.

## Demandes de changement en cours (hors scope du gate, à suivre)

Deux « nouveaux besoins » sont en requalification (voir `00-contexte/nouveaux-besoins.md`) et
peuvent rouvrir la vision/MVP :

- **Rôle administrateur** (décision sponsor A/B/C, gating) ;
- **Format d'identifiant livreur `NOM_PRENOM_ADRESSE`** (décision sponsor + avis sécurité, gating).

Ils n'invalident pas le **baseline G1 actuel** (vision interne cohérente). Si arbitrés en
option « B/C », une **délta-revue G1** des sections vision/MVP impactées sera requise avant de
figer ces parties.

## Required Next Action

1. **Handoff G2** : lancer `@ux` (personas, parcours P1–P10, wireframes) et
   `@architecte-metier` (langage ubiquitaire, Bounded Contexts depuis Core/Supporting/Generic),
   en convergence (règle de convergence UX/Domaine de `quality-gates.md`).
2. Transmettre les exigences de mesurabilité KPI à `@po` (G4) et `@architecte-technique` (G3,
   télémétrie/observabilité).
3. Traiter les deux demandes de changement via leur mini-chaîne dédiée ; déclencher une
   délta-revue G1 si l'arbitrage modifie le périmètre.
