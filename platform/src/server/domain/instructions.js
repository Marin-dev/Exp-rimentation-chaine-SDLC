/**
 * Ready-made instruction templates per phase, addressed to that phase's agent.
 * Used as one-click "consignes types" sent to the phase agent (chat) — e.g. for
 * the developer: "implement the User Stories not yet developed".
 */
export const PHASE_INSTRUCTIONS = {
  G0: [
    { label: "Structurer le besoin", text: "Analyse les documents d'intake et structure les besoins clés (métier, utilisateurs, données, architecture, sécurité). Pose tes questions sur les imprécisions." },
    { label: "Simplifier la synthèse", text: "Reformule la synthèse d'intake de façon plus simple et lisible pour un non-technicien." }
  ],
  G1: [
    { label: "Produire la vision", text: "Produis la vision produit, les KPIs mesurables et le périmètre du MVP dans /livrables/01-vision/." },
    { label: "Réduire le MVP", text: "Réduis le périmètre du MVP aux fonctionnalités vraiment essentielles, et explique les arbitrages." },
    { label: "Quantifier les KPIs", text: "Rends les KPIs de succès chiffrés et mesurables." }
  ],
  G2: [
    { label: "Personas & parcours", text: "Produis les personas et les parcours utilisateurs principaux dans /livrables/02-ux/." },
    { label: "Wireframes", text: "Crée les wireframes des écrans clés des parcours principaux." },
    { label: "Modéliser le domaine", text: "Modélise le domaine : langage métier, bounded contexts, modèle de domaine, capability map, modules fonctionnels." },
    { label: "Designs & handoff", text: "Produis les designs d'écrans, le design system et le handoff dev à partir des wireframes et du modèle métier." }
  ],
  G3: [
    { label: "Architecture & ADRs", text: "Définis l'architecture applicative, les intégrations, les NFR et consigne les ADRs." },
    { label: "Sécurité & threat model", text: "Produis la classification des données, les exigences de sécurité et le threat model." }
  ],
  G4: [
    { label: "Découper en US", text: "Découpe les Features en User Stories prêtes (Definition of Ready) dans /livrables/05-backlog/user-stories/." },
    { label: "Epics & Features", text: "Crée ou ajuste les Epics et Features à partir de la vision, de l'UX et du domaine." },
    { label: "Prioriser le backlog", text: "Priorise le backlog pour le MVP et explique les choix de priorisation." }
  ],
  G5: [
    { label: "Développer les US restantes", text: "Implémente les User Stories prêtes qui ne sont pas encore développées (vertical slice + tests). Consigne les choix d'implémentation dans /livrables/06-dev/." },
    { label: "Corriger les anomalies QA", text: "Corrige les anomalies remontées par la QA, puis indique ce qui doit être retesté." },
    { label: "Appliquer la revue de code", text: "Applique les retours de la revue de qualité de code." }
  ],
  G6: [
    { label: "Tester les US non testées", text: "Teste les User Stories développées qui ne sont pas encore testées (niveaux L1/L2/L3) et produis les preuves d'exécution." },
    { label: "Rejouer après corrections", text: "Rejoue les tests sur les US corrigées par le développeur et mets à jour les rapports." },
    { label: "Scénarios & jeux de données", text: "Produis les scénarios de test et les jeux de données nécessaires." }
  ],
  G6R: [
    { label: "Recette de la feature", text: "Mets-toi à la place de l'utilisateur métier cible et évalue si les fonctionnalités livrées répondent au besoin réel (compréhension, vocabulaire, valeur, adéquation au workflow). Produis le rapport d'acceptation et rends le gate G6R." },
    { label: "Remonter les écarts bloquants", text: "Liste les écarts bloquants entre le produit livré et le besoin réel, et route-les vers le PO (backlog) et le développeur via le protocole." },
    { label: "Challenger le vocabulaire", text: "Repère les écarts entre le vocabulaire affiché et le langage réel des utilisateurs, et recommande des ajustements à l'UX et à l'architecte métier." }
  ],
  G7: [
    { label: "Préparer la release", text: "Prépare le pipeline CI/CD, la stratégie de déploiement, le monitoring et le rollback dans /livrables/08-devops/." },
    { label: "Décider la release", text: "Évalue la readiness opérationnelle et les risques résiduels, puis rends la décision de release." }
  ]
};
