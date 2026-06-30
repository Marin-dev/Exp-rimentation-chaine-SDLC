# DEC-G0 : Décisions structurantes déléguées à l'IA (G0)

**Statut**: Décidé (délégation explicite du sponsor)
**Soulevé par**: @project-bootstrapper
**Décidé par**: @project-bootstrapper, par délégation du Sponsor
**Date**: 2026-06-30
**Phase**: G0
**Project**: DocuPost

## Contexte

Lors de l'arbitrage G0, le sponsor a tranché un seul point de façon explicite
(**hébergement = Azure imposé**, voir [DEC-0004](DEC-0004-hebergement-cloud.md)) et a
**délégué tous les autres points** à l'orchestrateur, avec consigne :

> « Fais au mieux : choisis l'option la plus pertinente selon le contexte, les bonnes
> pratiques et le périmètre MVP, applique-la et DOCUMENTE clairement ton choix et sa
> justification. Ne repose pas cette question. »

Ce document enregistre, pour traçabilité, chaque décision prise par délégation.
Les quantifications fines (cibles KPI chiffrées, durées de rétention légales) restent
à confirmer aux gates aval :
- KPIs et volumétrie → `@sponsor` en **G1**.
- Rétention, classification, threat model → `@security-architect` en **G3**.

Aucune de ces décisions ne bloque G0 : le contexte projet est exploitable.

---

## d1 — Profil projet à utiliser

**Décision** : **Réutiliser le profil projet existant `DocuPost`** plutôt que d'en créer
un nouveau. Voir aussi [DEC-0001](DEC-0001-profil-projet-a-utiliser.md).

**Justification** :
- Le profil `DocuPost` couvre exactement ce domaine (suivi de tournées de livraison du
  dernier kilomètre) et est déjà complet : `context.md`, `stack.md`, `security-context.md`.
- Créer un second profil pour le même domaine fragmenterait le contexte et les livrables
  sans valeur ajoutée.
- `PROJECT_NAME = DocuPost` est confirmé.

---

## q1 — Indicateurs de succès (KPIs) — *proposés, à quantifier par @sponsor en G1*

**Décision** : proposer une grille de KPIs MVP. Aucun chiffre n'étant fourni dans l'intake,
les cibles ci-dessous sont des **hypothèses de travail** à valider/quantifier par `@sponsor`.

| KPI | Définition | Cible hypothèse (à confirmer G1) |
|---|---|---|
| Adoption livreurs | % de tournées exécutées via l'app (vs papier/téléphone) | ≥ 80 % à 3 mois |
| Qualité de livraison | Réduction des erreurs/incidents non résolus vs baseline papier | −50 % |
| Visibilité temps réel | Délai médian entre événement terrain et visibilité superviseur (en ligne) | < 2 min |
| Taux de preuve | % de livraisons avec preuve de livraison (POD) capturée | ≥ 95 % |
| Efficacité superviseur | Temps de préparation d'une tournée | −30 % |

**Justification** : ces KPIs couvrent les 4 objectifs business (réduire erreurs/retards,
visibilité temps réel, outiller le livreur, preuve de livraison) et sont mesurables.

---

## q2 — Volumétrie de lancement — *hypothèse MVP*

**Décision** : dimensionner le MVP pour un **pilote mono-dépôt** :
- 10 à 30 livreurs actifs ;
- 30 à 80 arrêts par livreur et par jour ;
- soit ≤ ~2 400 arrêts/jour et ≤ ~30 tournées simultanées.

**Justification** : aucune volumétrie n'est fournie. Cette hypothèse basse permet une
**architecture simple, mono-région**, sans contrainte de scale extrême. À confirmer par
`@sponsor` ; en cas de volumétrie réelle très supérieure, `@architecte-technique` devra
réviser les NFR de charge (G3).

---

## q3 — Rôle administrateur

**Décision** : introduire au MVP un **rôle Administrateur léger**, responsable de :
- la gestion des comptes utilisateurs et des rôles (création / désactivation / réinitialisation) ;
- la gestion des données de référence (livreurs, dépôt, zones).

Pour le MVP, ce rôle peut être **porté par un superviseur disposant de droits étendus**
(pas d'application back-office dédiée).

**Justification** : un outil multi-utilisateurs a besoin d'un minimum d'administration
(onboarding/offboarding, rôles). Le mutualiser avec le superviseur évite la complexité d'un
back-office complet tout en couvrant le besoin réel. À affiner par `@architecte-metier` et
`@security-architect` (séparation des privilèges).

---

## q4 — Nature de la preuve de livraison (POD)

**Décision** : la preuve de livraison MVP se compose de :
- **statut "Livré"** + **horodatage** ;
- **position GPS** au moment de la confirmation ;
- **photo optionnelle** (preuve visuelle : colis déposé / lieu).

Reportés à des incréments ultérieurs : signature électronique du destinataire, saisie
nom/identité du destinataire, code de confirmation.
En **hors-ligne**, la POD minimale (statut + horodatage + position si disponible) est
capturée immédiatement ; la photo est mise en file et synchronisée au retour réseau.

**Justification** : ce format équilibre valeur (preuve fiable, horodatée, localisée) et
complexité (compatible mobile et hors-ligne), sans imposer la signature qui ajoute friction
et complexité juridique au MVP. Voir impacts RGPD en q7.

---

## q5 — Niveau attendu du mode hors-ligne

**Décision** : **offline-first ciblé ("lite")**. Voir aussi
[DEC-0007](DEC-0007-niveau-attendu-du-mode-hors-ligne.md).
- Hors-ligne supporté : **consultation de la tournée du jour** + **saisie des résultats de
  livraison et des incidents** + **capture POD**, mis en **file locale** et **synchronisés
  automatiquement** au retour du réseau.
- Hors du périmètre hors-ligne : préparation/réaffectation de tournée hors-ligne, résolution
  de conflits complexe. Le superviseur reste la source d'affectation (en ligne) ; au niveau
  d'un arrêt, la stratégie de fusion par défaut est « dernier statut terrain gagne ».

**Justification** : couvre le cas réel (perte de réseau ponctuelle pendant l'exécution) sans
payer le coût d'un offline complet (édition collaborative hors-ligne, CRDT). Impact technique
maîtrisé pour le MVP.

---

## q6 — Origine des tournées

**Décision** : au MVP, les tournées sont **créées et préparées manuellement par le
superviseur dans l'outil**. Aucun système amont n'est intégré.
Un **import (CSV / API WMS)** est prévu comme **point d'extension** pour un incrément ultérieur.

**Justification** : l'intake ne mentionne aucun système amont (WMS/ERP/optimiseur). La saisie
manuelle est le chemin le plus court vers la valeur et permet de valider le produit avant
d'investir dans une intégration. `@architecte-technique` documentera le point d'extension.

---

## q7 — Géolocalisation et données personnelles (RGPD)

**Décision (posture, à approfondir par @security-architect en G3)** :
- **Données personnelles identifiées** : identité du livreur, adresses + noms des destinataires,
  photos de POD, position GPS.
- **Pas de tracking continu / temps réel en arrière-plan au MVP.** La géolocalisation est
  capturée **ponctuellement**, **uniquement au moment d'un événement métier** (confirmation de
  livraison ou signalement d'incident), pour la preuve et la fiabilité.
- Principes appliqués : **minimisation**, **limitation de finalité**, **accès basé sur les
  rôles**, **transparence du livreur** (information sur la collecte), **rétention limitée**
  (durées exactes à fixer en G3), **pas de données sensibles superflues dans logs/captures**.

**Justification** : la valeur métier (preuve, suivi temps réel) est atteignable sans pistage
continu, qui serait disproportionné et plus risqué juridiquement. Cette posture respecte les
principes RGPD dès la conception (privacy by design). Handoff `@security-architect` pour
`data-classification.md`, `threat-model.md` et durées de rétention.

---

## d2 — Hébergement / cloud (rappel)

**Décision** : **Azure** (fournisseur cloud imposé par le sponsor). Voir
[DEC-0004](DEC-0004-hebergement-cloud.md). Répercuté dans `stack.md`.

---

## Agents impactés

- `@sponsor` : confirmer/quantifier KPIs (q1) et volumétrie (q2) en G1.
- `@architecte-metier` : rôle admin (q3), POD (q4), origine tournées (q6).
- `@architecte-technique` : cloud Azure (d2), offline-lite (q5), point d'extension import (q6).
- `@security-architect` : RGPD/géoloc (q7), POD comme donnée personnelle (q4), rôle admin (q3).
