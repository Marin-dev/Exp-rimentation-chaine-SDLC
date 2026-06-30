# Vision Produit - DocuPost

**Agent**: @sponsor
**Date**: 2026-06-30
**Project**: DocuPost
**Inputs used**:
- `project/PROJECT.md`
- `project/docupost/context.md`
- `project/docupost/security-context.md`
- `livrables/00-contexte/intake-synthesis.md`
- `livrables/_governance/decisions/DEC-G0-decisions-deleguees.md`
- `livrables/_governance/decisions/DEC-0004-hebergement-cloud.md`
- `livrables/_governance/decisions/DEC-0007-niveau-attendu-du-mode-hors-ligne.md`
**Status**: Proposed

## Problématique métier

Une société de livraison du dernier kilomètre pilote aujourd'hui ses tournées
**sur papier et par téléphone**. Ce fonctionnement génère :

- des **erreurs** (mauvaise affectation, arrêt oublié, statut incertain) ;
- des **retards** et une **résolution lente des incidents** (absent, refus, adresse fausse) ;
- une **absence de visibilité temps réel** pour le superviseur, qui doit appeler le
  livreur pour connaître l'avancement ;
- l'**absence de preuve de livraison** fiable et horodatée.

Le besoin central est de **digitaliser la chaîne préparation → exécution → suivi**
d'une tournée, sans alourdir le quotidien d'utilisateurs **pressés et mobiles**,
y compris **en connexion intermittente**.

## Opportunité business

Remplacer papier + téléphone par un outil simple, mobile et fiable permet de :

- **réduire les erreurs et retards** en fiabilisant l'exécution terrain ;
- **donner au superviseur une visibilité temps réel** sans appels téléphoniques ;
- **produire une preuve de livraison** horodatée et localisée, exploitable en cas de litige ;
- **capturer le feedback terrain** assez vite pour ajuster le backlog (boucle d'amélioration).

La valeur différenciante n'est pas une fonctionnalité isolée mais une **boucle** :
exécution terrain fiable **même hors-ligne** ↔ **visibilité temps réel** côté superviseur.
C'est cette boucle qui remplace réellement le papier et le téléphone.

## Vision cible

> DocuPost est l'outil de référence du dépôt pour **préparer, exécuter et suivre**
> les tournées de livraison. Le livreur dispose sur son smartphone d'une vue claire
> de sa tournée du jour, exécutable **même sans réseau**, et confirme chaque livraison
> avec une preuve fiable. Le superviseur suit l'avancement **en temps réel** et réagit
> aux incidents sans téléphoner. L'outil est **simple, rapide et robuste** avant d'être riche.

Principes directeurs :

- **Simplicité d'abord** : utilisateurs pressés, peu de formation, peu de friction.
- **Fiabilité terrain** : l'app reste utilisable hors-ligne ; rien ne se perd.
- **Temps réel utile** : le superviseur voit l'essentiel sans interroger le livreur.
- **Privacy by design** : géolocalisation ponctuelle aux seuls événements métier,
  minimisation des données (voir `security-context.md`, q7 de DEC-G0).
- **Livraison incrémentale** : un MVP en vertical slices, puis extension.

## Utilisateurs cibles

| Persona | Objectif principal | Contexte / contraintes |
|---|---|---|
| **Livreur** | Exécuter sa tournée, confirmer les livraisons, signaler les incidents | Smartphone, en déplacement, pressé, **connexion intermittente** |
| **Superviseur** | Préparer/affecter les tournées, suivre l'avancement temps réel, traiter les incidents | Poste au dépôt, besoin de visibilité et de priorisation |
| **Administrateur (léger)** | Gérer comptes/rôles et données de référence | Au MVP, **porté par un superviseur à droits étendus** (pas de back-office dédié) — voir q3 DEC-G0 |

## Objectifs mesurables

Les objectifs business se déclinent en KPIs détaillés dans
[`kpis.md`](kpis.md). En synthèse :

| Objectif business | KPI associé |
|---|---|
| Faire adopter l'outil à la place du papier | Adoption livreurs |
| Réduire erreurs et incidents non résolus | Qualité de livraison |
| Donner de la visibilité temps réel | Délai de visibilité superviseur |
| Disposer d'une preuve de livraison | Taux de preuve (POD) |
| Alléger la préparation des tournées | Efficacité préparation superviseur |

> **Note de transparence** : aucun chiffre (baseline ni cible) n'a été fourni dans
> l'intake. Les cibles ont été fixées **par délégation explicite du sponsor en G0**
> (« fais au mieux, documente, ne repose pas la question ») comme **hypothèses de travail**.
> Les baselines du process papier sont **non instrumentées** et devront être mesurées
> en début de pilote. Risque résiduel porté en G1 (voir gate et `kpis.md`).

## Périmètre MVP

Le périmètre détaillé est dans [`perimetre-mvp.md`](perimetre-mvp.md). En résumé, le MVP couvre :

- **Superviseur** : créer/préparer une tournée (saisie manuelle), l'affecter à un livreur,
  suivre l'avancement temps réel, consulter les incidents.
- **Livreur** : consulter sa tournée du jour (**hors-ligne**), confirmer une livraison avec
  POD (statut + horodatage + position GPS + photo optionnelle), signaler un incident,
  **synchronisation automatique** au retour réseau.
- **Administration légère** : gestion des comptes/rôles et des données de référence,
  portée par un superviseur étendu.
- **Authentification et autorisation par rôle.**

Dimensionnement MVP : **pilote mono-dépôt**, 10–30 livreurs, ≤ ~2 400 arrêts/jour (q2 DEC-G0).

## Hors périmètre MVP

- Import des tournées depuis CSV / WMS / ERP (prévu comme **point d'extension**, q6).
- Optimisation d'itinéraire et cartographie avancée.
- Signature électronique du destinataire, code de confirmation, saisie de l'identité du destinataire.
- **Tracking GPS continu / en arrière-plan** (exclu par posture RGPD, q7).
- Édition collaborative hors-ligne et résolution de conflits complexe (offline « full »).
- Back-office d'administration dédié.
- Multi-dépôt / multi-région à grande échelle, reporting analytique / BI avancé.

## Hypothèses

- **A1** — L'outil couvre les 3 moments : préparation (superviseur), exécution (livreur), suivi (superviseur).
- **A2** — La preuve de livraison MVP = statut + horodatage + position GPS + photo optionnelle (q4).
- **A3** — Le « temps réel » repose sur une synchronisation régulière compatible avec le hors-ligne (q5).
- **A4** — Volumétrie pilote mono-dépôt (q2) ; au-delà, NFR de charge à revoir par `@architecte-technique` (G3).
- **A5** — Cloud **Azure** (imposé sponsor, DEC-0004) ; services cibles définis en G3.
- **A6** — Aucune contrainte de délai/budget fournie ; livraison en vertical slices.
- **A7** — Les cibles KPI sont des hypothèses ; les baselines papier seront mesurées en début de pilote.

## Risques business

| Réf | Risque | Impact | Propriétaire | Mitigation |
|---|---|---|---|---|
| RB1 | Cibles KPI et baselines non validées par des chiffres client | Pilotage de la valeur biaisé | @sponsor | Instrumenter les baselines en début de pilote ; revoir les cibles à la 1re revue |
| RB2 | Faible adoption si l'app est perçue comme plus lente que le papier | MVP sans valeur perçue | @sponsor / @ux | Exigence de simplicité ; tests terrain `@end-user` ; mesurer l'adoption |
| RB3 | Hors-ligne sous-dimensionné face au terrain réel | Perte de confiance livreur | @architecte-technique | Offline-first ciblé (q5) ; scénarios QA de perte réseau |
| RB4 | Volumétrie réelle >> hypothèse pilote | NFR de charge insuffisants | @architecte-technique | Confirmer la volumétrie ; réviser les NFR en G3 |
| RB5 | Conformité RGPD (géoloc/POD) mal cadrée | Risque juridique | @security-architect | Posture privacy by design (q7) ; classification + rétention en G3 |

## Traçabilité

- **Amont** : `intake-synthesis.md`, `DEC-G0-decisions-deleguees.md`, `G0-project-context-ready.md`.
- **Aval** : `kpis.md`, `perimetre-mvp.md` ; cadre `@ux` (parcours), `@architecte-metier`
  (langage/Bounded Contexts), `@po` (Epics/Features/US).
