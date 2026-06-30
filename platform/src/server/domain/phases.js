/**
 * Single source of truth for the G0-G7 pipeline.
 * `folders` maps each phase to the deliverable folders it owns, so the
 * platform can attribute documents and progress to a phase reliably.
 * `ownerProfiles` references profile ids from profiles.js (human-in-the-loop routing).
 */
export const PHASES = [
  {
    id: "G0",
    title: "Lancement",
    subtitle: "Cadrage du projet",
    plain: "On lit les documents du projet et on vérifie qu'on a de quoi démarrer.",
    folders: ["00-contexte"],
    ownerProfiles: ["orchestrateur"],
    human: "Valider que le besoin de départ est exploitable et répondre aux questions ouvertes."
  },
  {
    id: "G1",
    title: "Vision",
    subtitle: "Objectifs, KPIs, MVP",
    plain: "On définit où on veut aller : la valeur, les indicateurs, le périmètre du premier produit.",
    folders: ["01-vision"],
    ownerProfiles: ["sponsor"],
    human: "Arbitrer la vision, les priorités et le périmètre MVP.",
    agents: "@sponsor puis @discovery-reviewer",
    gateFile: "G1-vision-ready",
    goal: "Définir la vision produit, les KPIs mesurables et le périmètre du MVP, puis les faire valider.",
    produces: [
      "/livrables/01-vision/vision-produit.md",
      "/livrables/01-vision/kpis.md",
      "/livrables/01-vision/perimetre-mvp.md"
    ]
  },
  {
    id: "G2",
    title: "Discovery",
    subtitle: "UX, UI et métier",
    plain: "On décrit les parcours utilisateurs, les écrans et le vocabulaire métier.",
    folders: ["02-ux", "02-ui", "03-architecture-metier"],
    ownerProfiles: ["ux", "architecte-metier"],
    human: "Relire parcours, maquettes, vocabulaire et règles métier.",
    agents: "@ux, @architecte-metier et @ui-designer puis @discovery-reviewer",
    gateFile: "G2-domain-ux-ui-ready",
    goal: "Décrire personas, parcours, wireframes, langage métier, bounded contexts, modèle de domaine et designs d'écrans, en cohérence.",
    produces: [
      "/livrables/02-ux/personas.md, user-journeys.md, wireframes.md",
      "/livrables/03-architecture-metier/ubiquitous-language.md, bounded-contexts.md, domain-model.md",
      "/livrables/02-ui/design-system.md, ecrans/, handoff-dev.md"
    ]
  },
  {
    id: "G3",
    title: "Architecture",
    subtitle: "Technique et sécurité",
    plain: "On choisit comment c'est construit techniquement et comment c'est sécurisé.",
    folders: ["04-architecture-technique", "10-security"],
    ownerProfiles: ["architecte-technique", "securite"],
    human: "Valider les choix structurants, les exigences et le threat model.",
    agents: "@architecte-technique et @security-architect puis @architecture-reviewer",
    gateFile: "G3-architecture-and-security-ready",
    goal: "Définir l'architecture applicative, les intégrations, les NFR et les ADRs, ainsi que les exigences de sécurité, la classification des données et le threat model.",
    produces: [
      "/livrables/04-architecture-technique/architecture-applicative.md, exigences-non-fonctionnelles.md",
      "/livrables/_governance/decisions/ADR-*.md",
      "/livrables/10-security/security-requirements.md, threat-model.md, data-classification.md"
    ]
  },
  {
    id: "G4",
    title: "Backlog",
    subtitle: "User Stories prêtes",
    plain: "On découpe le travail en éléments clairs, testables et priorisés.",
    folders: ["05-backlog"],
    ownerProfiles: ["po"],
    human: "Relire les User Stories, les critères d'acceptation et les priorités.",
    agents: "@po puis @spec-reviewer",
    gateFile: "G4-story-ready",
    goal: "Produire Epics, Features et User Stories priorisées, testables et tracées, prêtes au développement (Definition of Ready).",
    produces: [
      "/livrables/05-backlog/epics.md, features.md",
      "/livrables/05-backlog/user-stories/US-[NNN]-[slug].md"
    ]
  },
  {
    id: "G5",
    title: "Développement",
    subtitle: "Réalisation",
    plain: "On construit le logiciel, élément par élément, avec ses tests.",
    folders: ["06-dev"],
    ownerProfiles: ["developpeur"],
    human: "Suivre l'implémentation et les retours de revue de code.",
    agents: "@developpeur puis @code-quality-reviewer",
    gateFile: "G5-implementation-done",
    goal: "Implémenter les User Stories prêtes en tranches verticales avec tests, puis faire revoir la qualité.",
    produces: [
      "/livrables/06-dev/vertical-slices/US-[NNN]-impl.md",
      "Code et tests dans le dépôt"
    ]
  },
  {
    id: "G6",
    title: "Vérification",
    subtitle: "Tests et sécurité",
    plain: "On vérifie que ça marche et que c'est sûr, avec des preuves.",
    folders: ["07-tests", "11-evaluations"],
    ownerProfiles: ["qa", "securite"],
    human: "Contrôler les preuves de tests, anomalies et risques acceptés.",
    agents: "@qa, @test-reviewer et @appsec-reviewer",
    gateFile: "G6-verification-done",
    goal: "Exécuter et prouver les tests (L1/L2/L3), la revue de tests et la revue AppSec.",
    produces: [
      "/livrables/07-tests/scenarios/US-[NNN]-scenarios.md, US-[NNN]-rapport-test.md",
      "/livrables/10-security/reviews/US-[NNN]-appsec-review.md",
      "/livrables/11-evaluations/US-[NNN]-*.md"
    ]
  },
  {
    id: "G7",
    title: "Release",
    subtitle: "Décision de livraison",
    plain: "On décide si on livre, et comment on revient en arrière si besoin.",
    folders: ["08-devops"],
    ownerProfiles: ["devops", "orchestrateur"],
    human: "Décider la livraison, le rollback et le monitoring.",
    agents: "@devops puis @release-judge",
    gateFile: "G7-release-decision",
    goal: "Préparer CI/CD, déploiement, monitoring et rollback, puis rendre la décision de release.",
    produces: [
      "/livrables/08-devops/pipeline-cicd.md, strategie-deploiement.md, monitoring.md",
      "/livrables/11-evaluations/release-judge-report.md"
    ]
  }
];

// Producers create the deliverables; reviewers evaluate them and own the gate decision.
export const PRODUCERS = {
  G0: "@project-bootstrapper",
  G1: "@sponsor",
  G2: "@ux, @architecte-metier, @ui-designer",
  G3: "@architecte-technique, @security-architect",
  G4: "@po",
  G5: "@developpeur",
  G6: "@qa",
  G7: "@devops"
};
export const REVIEWERS = {
  G0: null,
  G1: "@discovery-reviewer",
  G2: "@discovery-reviewer",
  G3: "@architecture-reviewer",
  G4: "@spec-reviewer",
  G5: "@code-quality-reviewer",
  G6: "@test-reviewer + @appsec-reviewer",
  G7: "@release-judge"
};

/**
 * Option A: intra-phase parallelism. Each phase that has independent producer
 * agents is split into stages; agents within a stage run as parallel Claude
 * processes, each scoped to its OWN folders (no write conflicts). Stages run
 * sequentially (e.g. G2: UX + métier in parallel, THEN UI consumes both).
 */
export const PHASE_PARALLEL = {
  G2: [
    [
      {
        agentKey: "ux",
        agent: "@ux",
        goal: "Personas, parcours utilisateurs, wireframes",
        folders: ["02-ux"],
        produces: ["/livrables/02-ux/personas.md", "user-journeys.md", "wireframes.md"]
      },
      {
        agentKey: "metier",
        agent: "@architecte-metier",
        goal: "Langage métier, bounded contexts, modèle de domaine, capability map, modules fonctionnels",
        folders: ["03-architecture-metier"],
        produces: [
          "/livrables/03-architecture-metier/ubiquitous-language.md",
          "bounded-contexts.md",
          "domain-model.md",
          "capability-map.md",
          "modules-fonctionnels.md"
        ]
      }
    ],
    [
      {
        agentKey: "ui",
        agent: "@ui-designer",
        goal: "Design system, écrans, flows, handoff dev (à partir de l'UX et du modèle métier déjà produits)",
        folders: ["02-ui"],
        produces: ["/livrables/02-ui/design-system.md", "ecrans/", "flows/", "handoff-dev.md"]
      }
    ]
  ],
  G3: [
    [
      {
        agentKey: "tech",
        agent: "@architecte-technique",
        goal: "Architecture applicative, intégrations, NFR, ADRs",
        folders: ["04-architecture-technique"],
        produces: [
          "/livrables/04-architecture-technique/architecture-applicative.md",
          "schemas-integration.md",
          "design-decisions.md",
          "exigences-non-fonctionnelles.md"
        ]
      },
      {
        agentKey: "secu",
        agent: "@security-architect",
        goal: "Classification des données, exigences de sécurité, threat model",
        folders: ["10-security"],
        produces: [
          "/livrables/10-security/data-classification.md",
          "security-requirements.md",
          "threat-model.md"
        ]
      }
    ]
  ]
};

export const PHASE_BY_ID = Object.fromEntries(PHASES.map((p) => [p.id, p]));

// Folders that exist outside the linear pipeline.
export const SIDE_FOLDERS = {
  "09-feedback": "Retours terrain",
  _governance: "Gouvernance"
};
