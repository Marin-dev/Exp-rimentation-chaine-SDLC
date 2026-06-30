# DEC-0001 : Profil projet a utiliser

**Statut**: Décidé
**Soulevé par**: @project-bootstrapper
**Décidé par**: Sponsor
**Date**: 2026-06-30T11:17:30.444Z
**Phase**: G0

## Contexte

Un profil projet 'DocuPost' existe deja et couvre exactement ce domaine (suivi de tournees de livraison). Faut-il reutiliser ce profil existant ou creer un nouveau profil projet dedie a ce nouveau besoin ? Ce choix conditionne ou sont ranges tout le contexte et les livrables.

## Décision

**Réutiliser le profil projet existant `DocuPost`** (décision prise par délégation du sponsor).

## Justification

Le profil `DocuPost` couvre exactement ce domaine (suivi de tournées de livraison du dernier
kilomètre) et est déjà complet (`context.md`, `stack.md`, `security-context.md`). Créer un
nouveau profil pour le même domaine fragmenterait le contexte sans valeur ajoutée.
`PROJECT_NAME = DocuPost` confirmé. Détail consolidé : voir
[DEC-G0-decisions-deleguees.md](DEC-G0-decisions-deleguees.md).
