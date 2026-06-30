# Périmètre MVP - DocuPost

**Agent**: @sponsor
**Date**: 2026-06-30
**Project**: DocuPost
**Inputs used**:
- `livrables/01-vision/vision-produit.md`
- `livrables/01-vision/kpis.md`
- `livrables/00-contexte/intake-synthesis.md`
- `livrables/_governance/decisions/DEC-G0-decisions-deleguees.md`
**Status**: Proposed

## Objectif du MVP

Prouver, sur un **pilote mono-dépôt**, que DocuPost remplace avantageusement le couple
papier + téléphone sur la boucle **préparation → exécution terrain (hors-ligne) → suivi temps réel**,
avec une preuve de livraison fiable, et ce **sans friction** pour des utilisateurs pressés.

## Parcours inclus

### Superviseur
- **P1 — Préparer une tournée** : créer une tournée, y ajouter des arrêts (saisie manuelle),
  ordonner les arrêts, l'affecter à un livreur (q6 : pas d'import amont au MVP).
- **P2 — Suivre l'avancement temps réel** : voir l'état des tournées et des arrêts au fil de l'eau (en ligne).
- **P3 — Traiter les incidents** : consulter les incidents remontés par les livreurs et leur statut.

### Livreur
- **P4 — Consulter sa tournée du jour** : liste ordonnée des arrêts, **disponible hors-ligne**.
- **P5 — Confirmer une livraison avec POD** : statut « Livré » + horodatage + position GPS +
  **photo optionnelle** (q4) ; **POD minimale capturée même hors-ligne**.
- **P6 — Signaler un incident** : type d'incident (absent, refus, adresse fausse, autre),
  saisissable hors-ligne.
- **P7 — Synchronisation automatique** : mise en file locale puis sync auto au retour réseau (q5).

### Administration légère (superviseur étendu)
- **P8 — Gérer comptes/rôles** : créer/désactiver/réinitialiser des utilisateurs et leurs rôles.
- **P9 — Gérer les données de référence** : livreurs, dépôt, zones (q3).

### Transverse
- **P10 — Authentification et autorisation par rôle** (livreur / superviseur / admin léger).

## Parcours exclus

| Exclu du MVP | Raison | Renvoi |
|---|---|---|
| Import des tournées (CSV / WMS / ERP) | Aucun système amont à l'intake ; chemin le plus court vers la valeur | Point d'extension (q6), `@architecte-technique` |
| Optimisation d'itinéraire / cartographie avancée | Hors cœur de valeur MVP | Incrément ultérieur |
| Signature destinataire, code de confirmation, identité destinataire | Friction + complexité juridique | Incrément ultérieur (q4) |
| Tracking GPS continu / arrière-plan | Posture RGPD : capture ponctuelle uniquement | Exclu par principe (q7) |
| Offline « full » (édition collaborative, résolution de conflits complexe) | Coût technique disproportionné | Offline-first ciblé retenu (q5, DEC-0007) |
| Back-office d'administration dédié | Admin léger mutualisé suffit au MVP | Incrément ultérieur (q3) |
| Multi-dépôt / multi-région à grande échelle | Pilote mono-dépôt | Réviser NFR si volumétrie réelle ↑ (q2) |
| Reporting analytique / BI avancé | Hors cœur MVP ; KPIs suffisent au pilotage | Incrément ultérieur |

## Contraintes de planning

- **Aucune contrainte de délai, budget ou jalon** fournie à l'intake.
- Livraison en **vertical slices par User Story** (convention de la chaîne).
- Pilote **mono-dépôt** : 10–30 livreurs, 30–80 arrêts/livreur/jour, ≤ ~2 400 arrêts/jour (q2).

## Hypothèses

- **A1** — La préparation de tournée est saisie dans l'outil (pas d'amont) au MVP.
- **A2** — Le superviseur étendu assure l'administration légère (pas de back-office).
- **A3** — Le hors-ligne couvre consultation + saisie résultats/incidents + POD ; l'affectation reste en ligne.
- **A4** — Stratégie de fusion par défaut au niveau d'un arrêt : « dernier statut terrain gagne » (q5).
- **A5** — Web pour le superviseur, mobile pour le livreur (à confirmer en UX/archi).

## Classification stratégique des domaines

| Domaine / capacité | Type | Justification business |
|---|---|---|
| **Exécution terrain de tournée + POD (hors-ligne)** | **Core** | Cœur du différenciateur : fiabilité terrain en connexion intermittente ; c'est ce qui remplace le papier |
| **Suivi / supervision temps réel** | **Core** | Valeur clé superviseur ; ferme la boucle exécution ↔ visibilité (remplace le téléphone) |
| **Gestion des incidents** | **Supporting** | Indispensable à l'exécution, mais s'appuie sur le cœur exécution/suivi |
| **Préparation / affectation de tournée** | **Supporting** | Alimente le cœur ; valeur réelle mais non différenciante en soi |
| **Administration (comptes/rôles, données de référence)** | **Generic** | Besoin standard de tout outil multi-utilisateurs ; mutualisé au MVP |
| **Authentification / autorisation** | **Generic** | Capacité standard, non différenciante mais obligatoire |

> Le **différenciateur stratégique** de DocuPost est la **boucle « exécution terrain fiable
> hors-ligne ↔ visibilité temps réel superviseur »**. L'effort d'ingénierie et de design doit
> se concentrer sur les domaines **Core**.

## Risques et points à confirmer en aval

- Volumétrie réelle vs hypothèse pilote → `@architecte-technique` (G3).
- Forme exacte du « temps réel » (fréquence de sync) → `@architecte-technique` (G3).
- Rétention/classification des données POD et géoloc → `@security-architect` (G3).
- Découpage Epics/Features/US et critères mesurables → `@po` (G4).

## Traçabilité

- **Amont** : `vision-produit.md`, `kpis.md`, `DEC-G0-decisions-deleguees.md`.
- **Aval** : `@ux` (parcours P1–P10), `@architecte-metier` (Bounded Contexts à partir des domaines Core/Supporting/Generic),
  `@po` (backlog), `traceability-matrix.md`.
