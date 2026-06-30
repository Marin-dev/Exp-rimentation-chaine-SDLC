# DEC-0007 : Niveau attendu du mode hors-ligne

**Statut**: Décidé
**Soulevé par**: @project-bootstrapper
**Décidé par**: Sponsor
**Date**: 2026-06-30T11:17:30.418Z
**Phase**: G0

## Contexte

Les livreurs sont parfois sans reseau. Quel niveau de fonctionnement hors-ligne est attendu ? Ce choix a un impact technique majeur sur le cout et la complexite du MVP.

## Décision

**Offline-first ciblé ("lite")** (décision prise par délégation du sponsor) :
consultation de la tournée du jour + saisie des résultats de livraison/incidents + capture
POD en hors-ligne, mis en file locale et synchronisés automatiquement au retour réseau.
Hors périmètre : préparation/réaffectation de tournée hors-ligne et résolution de conflits
complexe (le superviseur reste source d'affectation en ligne).

## Justification

Couvre le cas réel (perte de réseau ponctuelle pendant l'exécution) sans le coût d'un offline
complet (édition collaborative hors-ligne / CRDT). Impact technique maîtrisé pour le MVP.
Détail consolidé : voir [DEC-G0-decisions-deleguees.md](DEC-G0-decisions-deleguees.md).
