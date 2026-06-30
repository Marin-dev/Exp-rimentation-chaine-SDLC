# KPIs - DocuPost

**Agent**: @sponsor
**Date**: 2026-06-30
**Project**: DocuPost
**Inputs used**:
- `livrables/01-vision/vision-produit.md`
- `livrables/00-contexte/intake-synthesis.md`
- `livrables/_governance/decisions/DEC-G0-decisions-deleguees.md` (q1, q2)
**Status**: Proposed

## Avertissement sur les chiffres

Aucune baseline ni cible chiffrée n'a été fournie dans l'intake. En G0, le sponsor a
**délégué explicitement** la quantification des KPIs à l'orchestrateur (« fais au mieux,
documente, ne repose pas la question »). Les **cibles** ci-dessous sont donc des
**hypothèses de travail assumées** ; les **baselines** du process papier/téléphone sont
**non instrumentées** et devront être mesurées sur les premières semaines du pilote.

Ce point constitue le risque résiduel **RB1** (propriétaire `@sponsor`), porté en G1.

## Tableau des KPIs

| KPI | Baseline | Cible MVP | Méthode de mesure | Source |
|---|---:|---:|---|---|
| **Adoption livreurs** — % de tournées exécutées via l'app (vs papier/téléphone) | 0 % (nouvel outil) | **≥ 80 %** à 3 mois post-déploiement pilote | Tournées clôturées dans l'app ÷ tournées totales du dépôt sur la période | App + registre dépôt |
| **Taux de preuve (POD)** — % de livraisons « Livré » avec preuve capturée | Non mesuré (papier) | **≥ 95 %** | Livraisons « Livré » avec POD ÷ total livraisons « Livré » | App |
| **Visibilité temps réel** — délai médian entre événement terrain et visibilité superviseur (en ligne) | Minutes→heures (appel tél.), non instrumenté | **< 2 min (p50)** en ligne | Δ entre horodatage de l'événement terrain et son affichage côté superviseur | Télémétrie app |
| **Qualité de livraison** — taux d'incidents non résolus / erreurs | Non mesuré (papier) | **−50 %** vs baseline mesurée au 1er mois | Incidents non résolus ÷ total livraisons sur la période | App |
| **Efficacité préparation superviseur** — temps moyen de préparation d'une tournée | À mesurer (papier) | **−30 %** vs baseline mesurée | Durée de préparation dans l'app vs observation terrain initiale | App + observation |

## Lien KPI ↔ objectif business

| Objectif business (vision) | KPI |
|---|---|
| Faire adopter l'outil à la place du papier | Adoption livreurs |
| Disposer d'une preuve de livraison | Taux de preuve (POD) |
| Donner de la visibilité temps réel | Visibilité temps réel |
| Réduire erreurs et incidents non résolus | Qualité de livraison |
| Alléger la préparation des tournées | Efficacité préparation superviseur |

## KPI « North Star » proposé

**Adoption livreurs** est l'indicateur phare : si les livreurs utilisent réellement
l'app à la place du papier, les autres KPIs (POD, visibilité, qualité) deviennent
mesurables et la boucle de valeur est enclenchée. À défaut d'adoption, les autres
KPIs n'ont pas de signal exploitable.

## Conditions de mesurabilité (pré-requis d'instrumentation)

Pour que ces KPIs soient mesurables, le produit doit, dès le MVP :

1. **Horodater** chaque événement terrain (livraison, incident) et sa synchronisation.
2. **Tracer** la capture POD (présence/absence) par livraison.
3. **Enregistrer** le canal d'exécution (app vs hors app) pour calculer l'adoption.
4. **Mesurer** la durée de préparation côté superviseur.
5. **Établir une baseline papier** par observation sur les premières semaines (incidents, durée de préparation).

> Exigence transmise à `@po` (critères d'acceptation orientés mesure) et à
> `@architecte-technique` (télémétrie/observabilité, G3).

## Hypothèses et risques

- **H1** — Les cibles sont des hypothèses, non des engagements client (voir RB1).
- **H2** — La mesure « temps réel » suppose une connexion en ligne ; en mode hors-ligne,
  le délai inclut le temps de reconnexion (à exclure ou qualifier dans le calcul p50).
- **H3** — Le calcul de l'adoption suppose de connaître le nombre total de tournées du dépôt
  (registre superviseur), donc une saisie fiable côté préparation.

## Traçabilité

- **Amont** : `vision-produit.md`, `DEC-G0-decisions-deleguees.md` (q1, q2).
- **Aval** : `@po` (critères d'acceptation mesurables), `@architecte-technique`
  (observabilité), `@qa` (vérification des conditions de mesure), `traceability-matrix.md`.
