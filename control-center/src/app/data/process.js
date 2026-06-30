export const processSteps = [
  {
    id: "G0",
    title: "Lancement projet",
    subtitle: "Initialisation du cahier des charges",
    owner: "@project-bootstrapper",
    human: "Valider que le besoin de départ est exploitable et que les questions ouvertes viennent bien de l'agent."
  },
  {
    id: "G1",
    title: "Vision",
    subtitle: "Objectifs, KPIs, MVP",
    owner: "@sponsor + @discovery-reviewer",
    human: "Contrôler vision, arbitrages et périmètre MVP."
  },
  {
    id: "G2",
    title: "Discovery",
    subtitle: "UX, UI, domaine",
    owner: "@ux + @ui-designer + @architecte-metier",
    human: "Relire parcours, maquettes, vocabulaire et règles métier."
  },
  {
    id: "G3",
    title: "Architecture",
    subtitle: "Tech + sécurité",
    owner: "@architecte-technique + @security-architect",
    human: "Valider choix structurants, NFR, threat model et ADR."
  },
  {
    id: "G4",
    title: "Backlog / US",
    subtitle: "User Stories prêtes",
    owner: "@po + @spec-reviewer",
    human: "Relire US, critères d'acceptation et priorités."
  },
  {
    id: "G5",
    title: "Développement",
    subtitle: "Réalisation des US",
    owner: "@developpeur + @code-quality-reviewer",
    human: "Suivre l'implémentation et les retours de revue."
  },
  {
    id: "G6",
    title: "Vérification",
    subtitle: "QA + AppSec",
    owner: "@qa + @test-reviewer + @appsec-reviewer",
    human: "Contrôler preuves de tests, anomalies et risques acceptés."
  },
  {
    id: "G7",
    title: "Release",
    subtitle: "Décision livraison",
    owner: "@devops + @release-judge",
    human: "Décider livraison, rollback, monitoring et feedback."
  }
];

export const actionTemplates = [
  {
    id: "bootstrap",
    phaseId: "G0",
    label: "Analyser le cahier des charges",
    agent: "@project-bootstrapper",
    instruction:
      "Analyse le dossier d'intake indiqué. Si des informations structurantes manquent, ne les invente pas: produis .claude/control-center/g0-open-questions.json avec les questions à poser à l'utilisateur. Si le contexte est suffisant, crée le profil projet actif, initialise /livrables et produis /livrables/_governance/gates/G0-project-context-ready.md."
  },
  {
    id: "sponsor",
    phaseId: "G1",
    label: "Produire la vision G1",
    agent: "@sponsor",
    instruction:
      "À partir du contexte projet actif, produis vision-produit.md, kpis.md et perimetre-mvp.md dans /livrables/01-vision/."
  },
  {
    id: "review-g1",
    phaseId: "G1",
    label: "Valider G1",
    agent: "@discovery-reviewer",
    instruction:
      "Valide G1 Vision Ready à partir des livrables de /livrables/01-vision/. Produis /livrables/_governance/gates/G1-vision-ready.md."
  },
  {
    id: "new-need",
    phaseId: "G1",
    label: "Qualifier un nouveau besoin",
    agent: "",
    instruction:
      "Analyse le nouveau besoin renseigné et ses sources. Requalifie l'impact sur vision, discovery, architecture, backlog et sécurité. Indique les phases à réouvrir et les livrables à mettre à jour."
  },
  {
    id: "discovery",
    phaseId: "G2",
    label: "Lancer UX + domaine + UI",
    agent: "",
    instruction:
      "Orchestre la discovery: @ux produit personas/journeys/wireframes, @architecte-metier produit ubiquitous language/bounded contexts/domain model/capability map, puis @ui-designer produit les specs UI et le handoff dev."
  },
  {
    id: "review-g2",
    phaseId: "G2",
    label: "Valider G2",
    agent: "@discovery-reviewer",
    instruction:
      "Valide G2 Domain, UX And UI Ready à partir des livrables UX, UI et architecture métier. Produis /livrables/_governance/gates/G2-domain-ux-ui-ready.md."
  },
  {
    id: "architecture",
    phaseId: "G3",
    label: "Produire architecture + sécurité",
    agent: "",
    instruction:
      "Orchestre @architecte-technique et @security-architect. Produis ADR, architecture cible, NFR, threat model et exigences sécurité dans /livrables/04-architecture-technique/ et /livrables/10-security/."
  },
  {
    id: "review-g3",
    phaseId: "G3",
    label: "Challenger G3",
    agent: "@architecture-reviewer",
    instruction:
      "Challenge les choix d'architecture et de sécurité. Vérifie cohérence, risques, NFR, ADR et threat model. Produis /livrables/_governance/gates/G3-architecture-and-security-ready.md."
  },
  {
    id: "stories",
    phaseId: "G4",
    label: "Préparer les User Stories",
    agent: "@po",
    instruction:
      "À partir des livrables vision, UX/UI, domaine et architecture, produis ou mets à jour les User Stories dans /livrables/05-backlog/ avec priorités, critères d'acceptation, dépendances et Definition of Ready."
  },
  {
    id: "review-g4",
    phaseId: "G4",
    label: "Valider Story Ready",
    agent: "@spec-reviewer",
    instruction:
      "Relis les User Stories, critères d'acceptation, dépendances et priorités. Bloque les US ambiguës. Produis /livrables/_governance/gates/G4-story-ready.md."
  },
  {
    id: "dev-us",
    phaseId: "G5",
    label: "Lancer le développement des US",
    agent: "@developpeur",
    instruction:
      "Implémente les User Stories prêtes du backlog. Commence par une vertical slice, respecte l'architecture validée, ajoute les tests pertinents et consigne les choix d'implémentation dans /livrables/06-dev/."
  },
  {
    id: "review-code",
    phaseId: "G5",
    label: "Demander revue qualité code",
    agent: "@code-quality-reviewer",
    instruction:
      "Relis l'implémentation produite pour les US. Priorise bugs, régressions, dette bloquante, cohérence architecture et tests manquants. Produis le rapport de revue et le gate G5 si applicable."
  },
  {
    id: "qa-appsec",
    phaseId: "G6",
    label: "Lancer QA + AppSec",
    agent: "",
    instruction:
      "Orchestre @qa, @test-reviewer, @appsec-reviewer et les judges IA. Exécute les vérifications fonctionnelles, techniques et sécurité. Produis les preuves dans /livrables/07-tests/, /livrables/10-security/ et /livrables/11-evaluations/."
  },
  {
    id: "review-g6",
    phaseId: "G6",
    label: "Valider vérification G6",
    agent: "@test-reviewer",
    instruction:
      "Contrôle les preuves de tests, anomalies, risques acceptés et résultats AppSec. Produis /livrables/_governance/gates/G6-verification-done.md."
  },
  {
    id: "release",
    phaseId: "G7",
    label: "Préparer la release",
    agent: "@devops",
    instruction:
      "Prépare release plan, rollback, configuration, monitoring et checklist de déploiement dans /livrables/08-devops/."
  },
  {
    id: "release-judge",
    phaseId: "G7",
    label: "Décider livraison",
    agent: "@release-judge",
    instruction:
      "Évalue les gates, risques résiduels, preuves QA/AppSec et readiness opérationnelle. Produis /livrables/_governance/gates/G7-release-decision.md."
  },
  {
    id: "custom",
    phaseId: "*",
    label: "Instruction libre",
    agent: "",
    instruction: ""
  }
];
