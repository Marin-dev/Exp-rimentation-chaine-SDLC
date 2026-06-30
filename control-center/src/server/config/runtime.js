export const TEXT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".csv",
  ".json",
  ".yaml",
  ".yml",
  ".xml",
  ".drawio",
  ".html",
  ".css",
  ".js",
  ".ts",
  ".tsx",
  ".jsx"
]);

export const DEFAULT_CONFIG = {
  workspaceRoot: "",
  claudeCommand: process.env.CLAUDE_CODE_COMMAND || "claude",
  claudeArgs: ["-p", "{prompt}"],
  maxIntakeFiles: 500,
  maxFilePreviewChars: 1600
};

export const DELIVERABLE_FOLDERS = [
  "00-contexte",
  "01-vision",
  "02-ux",
  "02-ui",
  "03-architecture-metier",
  "04-architecture-technique",
  "05-backlog",
  "06-dev",
  "07-tests",
  "08-devops",
  "09-feedback",
  "10-security",
  "11-evaluations",
  "_governance"
];

export const PHASE_DEFINITIONS = [
  {
    id: "G0",
    title: "Lancement projet",
    subtitle: "Initialisation du cahier des charges",
    owner: "@project-bootstrapper",
    folders: ["00-contexte", "_governance"],
    expectedOutputs: ["Contexte projet", "Questions ouvertes", "Gate G0"],
    humanControl: "Confirmer que le cahier des charges de départ est exploitable."
  },
  {
    id: "G1",
    title: "Vision",
    subtitle: "Objectifs, KPIs, MVP",
    owner: "@sponsor + @discovery-reviewer",
    folders: ["01-vision", "_governance"],
    expectedOutputs: ["Vision produit", "KPIs", "Périmètre MVP", "Gate G1"],
    humanControl: "Valider les arbitrages produit et le périmètre."
  },
  {
    id: "G2",
    title: "Discovery",
    subtitle: "UX, UI, domaine",
    owner: "@ux + @ui-designer + @architecte-metier",
    folders: ["02-ux", "02-ui", "03-architecture-metier", "_governance"],
    expectedOutputs: ["Parcours UX", "Maquettes UI", "Modèle métier", "Gate G2"],
    humanControl: "Relire les parcours, maquettes, vocabulaire et règles métier."
  },
  {
    id: "G3",
    title: "Architecture",
    subtitle: "Technique + sécurité",
    owner: "@architecte-technique + @security-architect",
    folders: ["04-architecture-technique", "10-security", "_governance"],
    expectedOutputs: ["ADR", "NFR", "Threat model", "Gate G3"],
    humanControl: "Challenger les choix d'architecture et de sécurité."
  },
  {
    id: "G4",
    title: "Backlog",
    subtitle: "User Stories prêtes",
    owner: "@po + @spec-reviewer",
    folders: ["05-backlog", "_governance"],
    expectedOutputs: ["User Stories", "Critères d'acceptation", "Gate G4"],
    humanControl: "Relire les US, les priorités et les critères d'acceptation."
  },
  {
    id: "G5",
    title: "Développement",
    subtitle: "Vertical slice",
    owner: "@developpeur + @code-quality-reviewer",
    folders: ["06-dev", "_governance"],
    expectedOutputs: ["Plan dev", "Revue qualité", "Gate G5"],
    humanControl: "Suivre les choix d'implémentation et les retours de revue."
  },
  {
    id: "G6",
    title: "Vérification",
    subtitle: "QA + AppSec",
    owner: "@qa + @test-reviewer + @appsec-reviewer",
    folders: ["07-tests", "10-security", "11-evaluations", "_governance"],
    expectedOutputs: ["Preuves QA", "AppSec review", "AI judge", "Gate G6"],
    humanControl: "Contrôler les preuves, anomalies et risques acceptés."
  },
  {
    id: "G7",
    title: "Release",
    subtitle: "Décision livraison",
    owner: "@devops + @release-judge",
    folders: ["08-devops", "09-feedback", "_governance"],
    expectedOutputs: ["Plan release", "Rollback", "Monitoring", "Gate G7"],
    humanControl: "Décider livraison, rollback et suivi post-release."
  }
];

export const GATE_DEFINITIONS = [
  {
    id: "G0",
    name: "Project Context Ready",
    owner: "@project-bootstrapper + orchestrateur",
    phase: "Lancement projet",
    requiredHumanReview: true
  },
  {
    id: "G1",
    name: "Vision Ready",
    owner: "@discovery-reviewer",
    phase: "Vision",
    requiredHumanReview: true
  },
  {
    id: "G2",
    name: "Domain, UX And UI Ready",
    owner: "@discovery-reviewer",
    phase: "Discovery",
    requiredHumanReview: true
  },
  {
    id: "G3",
    name: "Architecture And Security Ready",
    owner: "@architecture-reviewer",
    phase: "Architecture",
    requiredHumanReview: true
  },
  {
    id: "G4",
    name: "Story Ready",
    owner: "@spec-reviewer",
    phase: "Backlog",
    requiredHumanReview: true
  },
  {
    id: "G5",
    name: "Implementation Done",
    owner: "@code-quality-reviewer",
    phase: "Développement",
    requiredHumanReview: false
  },
  {
    id: "G6",
    name: "Verification Done",
    owner: "@test-reviewer + @appsec-reviewer",
    phase: "Vérification",
    requiredHumanReview: true
  },
  {
    id: "G7",
    name: "Release Decision",
    owner: "@release-judge",
    phase: "Release",
    requiredHumanReview: true
  }
];
