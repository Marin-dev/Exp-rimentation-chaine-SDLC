# Intake Synthesis - Application de suivi de tournées de livraison

**Agent**: @project-bootstrapper
**Date**: 2026-06-30
**Project**: DocuPost (profil existant réutilisé — voir DEC-0001)
**Inputs used**:
- `C:/Users/marin/AppData/Local/Temp/intake-test/00-brief/brief-client.md`
- `C:/Users/marin/AppData/Local/Temp/intake-test/02-users/utilisateurs.md`
- `livrables/_governance/agent-io/answers.json` (réponses humaines G0)
- `livrables/_governance/decisions/DEC-G0-decisions-deleguees.md`
**Status**: Accepted

## Executive Summary

Une société de livraison du dernier kilomètre veut remplacer un fonctionnement
actuel papier + téléphone par un outil numérique. L'outil doit aider le **livreur**
sur le terrain (voir sa tournée, signaler des incidents, fournir une preuve de
livraison) et donner au **superviseur** une visibilité temps réel sur l'avancement
des tournées. Contraintes fortes : mobilité, connexion intermittente, simplicité
d'usage pour des utilisateurs pressés.

Les points structurants initialement imprécis ont été **tranchés à l'arbitrage G0** :
le sponsor a imposé **Azure** comme cloud et **délégué** les autres décisions à
l'orchestrateur, qui les a prises selon les bonnes pratiques et le périmètre MVP
(voir `DEC-G0-decisions-deleguees.md`). **G0 est désormais PASS.**

## Business Objectives

- Réduire les erreurs et retards générés par le process papier/téléphone actuel.
- Donner de la visibilité temps réel aux superviseurs sur l'avancement des tournées.
- Outiller le livreur terrain pour exécuter sa tournée et remonter les incidents.
- Disposer d'une preuve de livraison.

> Note : aucun KPI chiffré n'était fourni. Une grille de KPIs proposée (adoption,
> qualité, temps réel, taux de preuve, efficacité superviseur) est documentée en q1 de
> `DEC-G0-decisions-deleguees.md`. Les cibles chiffrées restent à confirmer par `@sponsor` en G1.

## Users And Personas Seed

| Persona | Description | Contexte d'usage |
|---|---|---|
| Livreur | Utilisateur terrain, mobile, pressé, connexion intermittente | Smartphone, en déplacement, parfois sans réseau |
| Superviseur | Au dépôt, prépare et suit les tournées | Poste de supervision, suivi temps réel |
| Administrateur | Rôle léger défini en G0 (q3) : gestion des comptes/rôles et données de référence | Au MVP, porté par un superviseur à droits étendus |

## Current Process / Pain Points

- Tout se fait actuellement sur **papier et par téléphone**.
- Conséquences : erreurs et retards.
- Besoin implicite de digitaliser la préparation, l'exécution et le suivi de tournée.

## Domain Seed

Vocabulaire de départ (à confirmer par `@ux` et `@architecte-metier`) :

| Terme | Sens initial |
|---|---|
| Tournée | Ensemble d'arrêts de livraison assignés à un livreur pour une journée/période |
| Arrêt | Point de livraison dans la tournée, avec un ordre |
| Livreur | Utilisateur terrain qui exécute la tournée |
| Superviseur | Utilisateur qui prépare et suit les tournées |
| Incident | Événement empêchant la livraison normale (absent, refus, adresse fausse) |
| Preuve de livraison | Évidence que la livraison a été réalisée (forme à préciser) |

## Existing Systems And Integrations

- **Aucun système existant mentionné** dans l'intake.
- Aucune intégration (WMS, ERP, optimisation de tournée, cartographie) n'est citée.
- À confirmer : la préparation des tournées vient-elle d'un système amont ou est-elle
  saisie dans l'outil ?

## Data And Security Notes

- Données personnelles identifiées : adresses + noms de destinataires, photo de preuve de
  livraison, position GPS du livreur, identité du livreur.
- Posture RGPD arrêtée en G0 (q7) : **capture de position ponctuelle aux seuls événements
  métier** (livraison/incident), **pas de tracking continu**, minimisation, limitation de
  finalité, accès par rôle, transparence du livreur, rétention limitée — *privacy by design*.
- À transmettre à `@security-architect` (G3) pour `data-classification.md`, `threat-model.md`
  et fixation des durées de rétention.

## Stack And Technical Constraints

- Cible **mobile** pour le livreur (smartphone).
- **Connexion intermittente** → mode hors-ligne **offline-first ciblé (lite)** retenu en G0
  (q5/DEC-0007) : consultation + saisie + POD en file locale, synchronisation automatique.
- Interface superviseur probablement web (à confirmer en UX/archi).
- **Hébergement / cloud : Azure** (imposé sponsor, DEC-0004) ; services cibles à définir par
  `@architecte-technique` en G3.
- Aucune contrainte de langage ou framework imposée par le client.

## Delivery Constraints

- Exigence forte de **simplicité** (utilisateurs pressés, peu de temps).
- Volumétrie de lancement **inconnue** (nombre de livreurs non défini).
- Aucune contrainte de délai, budget ou jalon fournie.

## Assumptions

- A1 : L'outil couvre 3 moments — préparation (superviseur), exécution (livreur),
  suivi (superviseur). À valider.
- A2 : La preuve de livraison est un livrable attendu mais sa forme (signature,
  photo, code, statut) n'est pas définie.
- A3 : Le suivi « temps réel » suppose une remontée régulière de statut depuis le
  mobile, donc une stratégie de synchronisation compatible avec le hors-ligne.
- A4 : Le projet est un MVP livré en vertical slices (convention de la chaîne).

## Décisions structurantes (résolues en G0)

Tous les points initialement ouverts sont tranchés. Détail et justifications dans
`livrables/_governance/decisions/DEC-G0-decisions-deleguees.md`.

| Réf | Sujet | Décision G0 |
|---|---|---|
| d1 | Profil projet | Réutiliser le profil `DocuPost` existant |
| d2 | Hébergement / cloud | **Azure** (imposé sponsor) |
| q1 | KPIs | Grille proposée (adoption, qualité, temps réel, taux preuve, efficacité) — cibles à confirmer G1 |
| q2 | Volumétrie | Hypothèse pilote mono-dépôt : 10–30 livreurs, ≤ ~2 400 arrêts/jour |
| q3 | Rôle administrateur | Rôle léger (comptes/rôles + données de référence), porté par un superviseur étendu au MVP |
| q4 | Preuve de livraison | Statut + horodatage + position GPS + photo optionnelle ; POD minimale en hors-ligne |
| q5 | Mode hors-ligne | Offline-first ciblé (lite) : consultation + saisie + POD en file, sync auto |
| q6 | Origine des tournées | Saisie manuelle par le superviseur ; import (CSV/WMS) en incrément ultérieur |
| q7 | Géoloc / RGPD | Capture ponctuelle aux événements métier, pas de tracking continu ; privacy by design |

## Points à approfondir aux gates aval (non bloquants G0)

- `@sponsor` (G1) : quantifier KPIs (q1) et volumétrie (q2).
- `@security-architect` (G3) : classification des données, threat model, durées de rétention (q7, q4).
- `@architecte-technique` (G3) : services Azure cibles, point d'extension import tournées (q6).

## Recommended Next Step

**G0 = PASS.** Le profil projet `DocuPost` est confirmé, le contexte est complet et
exploitable, et toutes les décisions structurantes sont tranchées et documentées.
Handoff `@sponsor` pour démarrer **G1 (Vision Ready)** : confirmer la vision, quantifier
les KPIs et la volumétrie cible.
