
## 2026-06-25T15:50:25.127Z - Nouveau besoin

**Origine**: Utilisateur
**Urgence**: normal
**Impact pressenti**: À qualifier



## 2026-06-25T15:50:41.465Z - tes

**Origine**: Utilisateur
**Urgence**: normal
**Impact pressenti**: s

sssssssssssssss

---

## 2026-06-30 - Rôle administrateur "oublié" au cadrage initial

**Origine**: Utilisateur (plateforme SDLC Studio)
**Urgence**: normal
**Statut**: Requalification en cours (mini-chaîne nouveau besoin)
**Besoin verbatim**:

> TEST: ajout du role administrateur oublie dans le cadrage initial.

### 1. Lecture de l'existant (avant requalification)

Le cadrage initial **n'a pas totalement omis l'administration**. La vision et le périmètre MVP
prévoient déjà :

- un persona **« Administrateur (léger) »**, **porté par un superviseur à droits étendus**
  (`vision-produit.md`, ligne « Administrateur (léger) ») ;
- les parcours **P8 — Gérer comptes/rôles**, **P9 — Gérer les données de référence** et
  **P10 — Authentification et autorisation par rôle (livreur / superviseur / admin léger)**
  (`perimetre-mvp.md`) ;
- une **exclusion explicite** d'un **« back-office d'administration dédié »** (renvoyée à un
  incrément ultérieur, décision q3 / hypothèse A2).

Le nouveau besoin n'ajoute donc pas un rôle absent : il **remet en cause un choix de cadrage
délibéré** (admin mutualisé, sans back-office). C'est cette ambiguïté qui doit être tranchée
avant tout travail aval.

### 2. Question structurante (le vrai fork)

Trois lectures possibles, à arbitrer par le sponsor :

| Option | Description | Impact |
|---|---|---|
| **A — Formaliser l'admin léger** | L'« admin léger » existant devient un rôle de premier rang, toujours porté par le superviseur étendu, sans back-office. | Faible : clarification, MVP inchangé. |
| **B — Vrai rôle Administrateur dédié** | Persona distinct + back-office d'administration dédié. | **Majeur** : rouvre q3/A2 et la liste « hors périmètre », effort UX/archi/backlog significatif. |
| **C — Rôle distinct sans back-office** | Rôle Administrateur séparé (droits cloisonnés, audit), mais administré via des écrans superviseur étendus au MVP. | Moyen : sépare les privilèges sans construire un back-office. |

### 3. Synthèse d'impact — étapes à rouvrir et livrables à mettre à jour

> État du projet : **G1 PASS_WITH_RISK**. UX, UI, domaine, technique et backlog **pas encore produits**.
> L'impact se concentre sur la **réouverture de la vision/MVP**, puis se propage en **contrainte de cadrage** pour l'aval.

| Étape | À rouvrir ? | Livrables impactés | Nature de la mise à jour |
|---|---|---|---|
| **Vision / MVP** (@sponsor) | **Oui — bloquant** | `01-vision/vision-produit.md`, `01-vision/perimetre-mvp.md` | Trancher A/B/C ; ajuster persona admin, parcours P8/P10, et la ligne « back-office dédié » des exclusions. |
| **Sécurité** (@security-architect) | Oui (rôle/authz change) | `10-security/*` (à produire en G3) | Séparation des privilèges admin, journal d'audit des actions admin, moindre privilège. |
| **UX** (@ux) | À produire en tenant compte | `02-ux/*` | Persona + parcours d'administration distincts, ou actions admin intégrées aux écrans superviseur. |
| **Domaine** (@architecte-metier) | À produire en tenant compte | `03-architecture-metier/*` | IAM / « Gestion des identités & accès » comme capability/BC distincte, ou module Administration générique. |
| **Technique** (@architecte-technique) | À produire en tenant compte | `04-architecture-technique/*` | Modèle RBAC (3 rôles), point d'application des autorisations, admin online-only vs hors-ligne. |
| **Backlog** (@po) | À produire en tenant compte | `05-backlog/*` | Epic/Feature « Administration & rôles » et US dédiées ; priorité vs cœur MVP. |

**Hors de ce passage** : aucun développement ni test n'est lancé ici. Les étapes `@developpeur`
et `@qa` seront déclenchées séparément une fois le backlog mis à jour.

### 4. Routage des décisions/questions (protocole SDLC Studio)

| Réf | Profil | Type | Objet |
|---|---|---|---|
| `d1` | sponsor | décision | Périmètre du rôle administrateur (A / B / C) — **gating** |
| `q2` | securite | question | Contrôles attendus sur les actions admin (séparation des privilèges, audit) |
| `q3` | ux | question | Parcours/persona admin distincts ou intégrés au superviseur |
| `q4` | architecte-metier | question | IAM comme capability/BC dédiée ou module générique |
| `q5` | architecte-technique | question | Modèle d'autorisation, point d'application, admin et hors-ligne |
| `q6` | po | question | Découpage backlog (Epic/Feature dédié) et priorité vs cœur MVP |

Les items `q2`–`q6` se **préciseront après `d1`** ; ils sont posés dès maintenant pour cadrer
la réouverture des étapes concernées. Voir `livrables/_governance/agent-io/pending-input.json`.

### 5. Prochaine action

1. Attendre l'arbitrage `d1` du sponsor (bloquant).
2. Répercuter la décision dans `vision-produit.md` + `perimetre-mvp.md` (par `@sponsor`).
3. Re-déclencher la boucle nouveau besoin (UX → domaine → technique → PO) avec la décision intégrée.
4. Mettre à jour la matrice de traçabilité et le changelog à chaque étape.

## 2026-06-30 — Identifiant livreur au format NOM_LIVREUR_PRENOM_ADRESSE

**Origine**: Utilisateur (plateforme SDLC Studio)
**Urgence**: normal
**Statut**: Requalification en cours (mini-chaîne nouveau besoin)
**Besoin verbatim**:

> le livreur doit avoir un id du format NOM_LIVREUR_PRENOM_ADRESSE

### 1. Lecture de l'existant (avant requalification)

- Le projet est à **G1 (PASS_WITH_RISK)**. UX, UI, domaine, technique et backlog **ne sont pas encore produits**.
- Le `livreur` est un persona connu (`vision-produit.md`) ; sa gestion en tant que donnée de
  référence est prévue au parcours **P9 — Gérer les données de référence** (`perimetre-mvp.md`).
- Le **`security-context.md` du projet** classe explicitement :
  - **Identité du livreur** = *donnée personnelle* → **minimisation** + accès par rôle ;
  - **Adresse** = *donnée personnelle / opérationnelle sensible* → **ne pas exposer dans logs et captures**.
- La posture RGPD est déjà active dans le cadrage (géoloc ponctuelle, exclusion du tracking continu).

### 2. Constat structurant (le vrai fork)

Le format demandé **`NOM_PRENOM_ADRESSE` incorpore des données personnelles directement dans un
identifiant**. Or un identifiant se retrouve naturellement dans les URLs, journaux, exports, écrans
et captures. Cela **contredit les principes de sécurité que le projet s'est lui-même fixés** et
soulève des risques concrets, **indépendamment de la technique** :

| Risque | Description |
|---|---|
| **Exposition de PII** | Nom + adresse exposés partout où l'ID circule (logs, URLs, exports) → conflit minimisation / RGPD. |
| **Instabilité** | Changement de nom (mariage) ou d'adresse (déménagement) → l'ID change → casse les références et la traçabilité. |
| **Unicité / collisions** | Deux livreurs homonymes, voire même nom + même adresse → ambiguïté ; besoin d'un discriminant. |
| **Normalisation** | Accents, espaces, traits d'union, casse, caractères spéciaux dans noms/adresses → format fragile. |
| **Ambiguïté du besoin** | « adresse » = adresse **personnelle/domicile** du livreur (PII) ou **dépôt/opérationnelle** ? À quoi sert l'ID (login ? clé interne ? référence affichée) ? |

Ce besoin **n'est donc pas une simple tâche d'implémentation** : c'est un choix de
conception identité + confidentialité qui doit être arbitré (sponsor + sécurité) avant tout aval.

### 3. Synthèse d'impact — étapes à rouvrir et livrables à mettre à jour

> L'impact se concentre sur une **décision de cadrage identité/confidentialité**, puis se propage
> en **contrainte de conception** vers domaine, technique, UX et backlog (livrables à produire).

| Étape | À rouvrir ? | Livrables impactés | Nature de la mise à jour |
|---|---|---|---|
| **Vision / MVP** (@sponsor) | **Oui — décision gating** | `01-vision/perimetre-mvp.md` (P9) | Trancher l'arbitrage format vs confidentialité (option A/B/C) ; clarifier finalité de l'ID et quelle adresse. |
| **Sécurité** (@security-architect) | **Oui — bloquant si PII** | `10-security/*` (à produire en G3) | Statuer sur PII dans un identifiant, minimisation, RGPD, non-exposition (logs/URLs/exports). |
| **Domaine** (@architecte-metier) | À produire en tenant compte | `03-architecture-metier/*` | Modéliser l'identité `Livreur` : clé naturelle (déconseillée) vs identifiant surrogate stable + libellé lisible ; invariants d'unicité et de stabilité ; langage (« identifiant livreur » / « matricule »). |
| **Technique** (@architecte-technique) | À produire en tenant compte | `04-architecture-technique/*` | Stratégie de clé, normalisation, gestion des collisions, stabilité au changement, exposition dans URLs/logs/exports, *privacy by design*. |
| **UX** (@ux) | À produire en tenant compte | `02-ux/*` | Comment le livreur est identifié à l'écran ; qui saisit/lit l'ID ; impact éventuel sur le login. |
| **Backlog** (@po) | À produire en tenant compte | `05-backlog/*` | US « Identité / compte livreur » sous le domaine *Generic* Administration/Auth ; priorité vs cœur MVP. |

**Hors de ce passage** : aucun développement ni test n'est lancé ici. Les étapes `@developpeur`
et `@qa` seront déclenchées séparément depuis la plateforme une fois le backlog mis à jour.

### 4. Routage des décisions/questions (protocole SDLC Studio)

| Réf | Profil | Type | Objet |
|---|---|---|---|
| `id-d1` | sponsor | décision | Format de l'identifiant vs confidentialité (A surrogate / B littéral / C compromis) — **gating** |
| `id-q2` | sponsor | question | Finalité de l'ID (login / clé interne / référence affichée) et **quelle adresse** (perso vs dépôt) |
| `id-q3` | securite | question | PII dans un identifiant : minimisation, RGPD, non-exposition logs/URLs/exports |
| `id-q4` | architecte-metier | question | Modélisation de l'identité Livreur : clé naturelle vs surrogate + unicité/stabilité |
| `id-q5` | architecte-technique | question | Stratégie de clé, normalisation, collisions, stabilité, exposition |
| `id-q6` | ux | question | Identification du livreur à l'écran et impact login |
| `id-q7` | po | question | Découpage backlog (US identité/compte livreur) et priorité |

Les items `id-q3`–`id-q7` se **préciseront après `id-d1`** ; ils sont posés dès maintenant pour
cadrer l'aval. Voir `livrables/_governance/agent-io/pending-input.json`.

> Note d'orchestration : le `pending-input.json` du besoin précédent (rôle administrateur, item
> `d1` et `q2`–`q6`) **n'avait pas encore de réponse** ; ses items sont **conservés** dans le
> fichier et complétés par les items `id-*` ci-dessus, pour ne perdre aucune décision en attente.

### 5. Prochaine action

1. Attendre l'arbitrage `id-d1` du sponsor + l'avis sécurité `id-q3` (bloquants).
2. Clarifier `id-q2` (finalité + quelle adresse) — sans quoi le format reste ambigu.
3. Répercuter la décision dans `perimetre-mvp.md` (P9) puis propager en contrainte vers domaine/technique/UX/backlog.
4. Mettre à jour la matrice de traçabilité et le changelog à chaque étape.
