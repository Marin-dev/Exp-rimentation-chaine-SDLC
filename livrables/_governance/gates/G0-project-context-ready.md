# G0 - Project Context Ready

**Status**: PASS
**Owner**: @project-bootstrapper
**Date**: 2026-06-30

## Evidence

- Intake lu : `00-brief/brief-client.md`, `02-users/utilisateurs.md`
- Réponses humaines intégrées : `livrables/_governance/agent-io/answers.json`
- Synthèse à jour : `/livrables/00-contexte/intake-synthesis.md` (Status: Accepted)
- Inventaire : `/livrables/00-contexte/intake-inventory.md`
- Profil projet actif confirmé : `.claude/project/PROJECT.md` → **DocuPost**
  (réutilisé, DEC-0001), contexte/stack/sécurité dans `.claude/project/docupost/`
- Décisions structurantes tranchées et documentées :
  - `DEC-0001` profil projet (réutiliser DocuPost)
  - `DEC-0004` hébergement = **Azure** (imposé)
  - `DEC-0007` mode hors-ligne = offline-first ciblé (lite)
  - `DEC-G0-decisions-deleguees.md` : q1 KPIs, q2 volumétrie, q3 admin, q4 POD,
    q6 origine tournées, q7 géoloc/RGPD
- Protocole plateforme clôturé : `livrables/_governance/agent-io/pending-input.json`
  (aucune question humaine en attente — items vides)

## Resolution Of Prior Blocking Issues

Les 9 points structurants du précédent FAIL sont résolus : 1 tranché par le sponsor
(cloud = Azure) et 8 délégués à l'orchestrateur, qui les a décidés selon les bonnes
pratiques et le périmètre MVP, avec justification (voir `DEC-G0-decisions-deleguees.md`).

## Accepted Risks

- **R1 (faible)** — KPIs et volumétrie reposent sur des hypothèses, pas sur des chiffres
  client. Propriétaire : `@sponsor`. Mitigation : confirmation/quantification en G1.
- **R2 (faible)** — Posture RGPD/géolocalisation définie au niveau principe.
  Propriétaire : `@security-architect`. Mitigation : classification + rétention en G3.

Ces risques sont résiduels et explicitement portés ; ils ne portent pas sur des inputs
obligatoires manquants, donc G0 = PASS est valide (cf. `quality-gates.md`).

## Known Follow-ups (non bloquants)

- Édition des fichiers `.claude/project/PROJECT.md` (variable `CLOUD_PROVIDER=Azure`)
  et `.claude/project/docupost/stack.md` (Cloud GCP → Azure) **bloquée par les
  permissions** (fichiers sensibles). La décision fait foi via `DEC-0004` ; ces deux
  fichiers doivent être alignés sur Azure dès qu'une permission d'édition est accordée,
  pour lever la contradiction « GCP possible » encore présente dans `stack.md`.

## Required Next Action

1. **Handoff `@sponsor`** pour démarrer **G1 (Vision Ready)** : confirmer la vision,
   quantifier les KPIs (q1) et la volumétrie cible (q2).
2. Aligner les deux fichiers `.claude/project/` sur Azure (voir follow-up ci-dessus).
