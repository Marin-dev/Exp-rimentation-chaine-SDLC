/**
 * Human-facing profiles. In local mode the user "switches" profile from the header;
 * this is the seam that becomes real accounts/roles in the multi-user version.
 * `agents` links each profile to the underlying AI agents it speaks through.
 */
export const PROFILES = [
  {
    id: "orchestrateur",
    label: "Chef de projet",
    short: "Pilote",
    color: "#1f2937",
    description: "Pilote la chaîne de bout en bout, voit toutes les décisions.",
    agents: ["@project-bootstrapper"],
    seesAll: true
  },
  {
    id: "sponsor",
    label: "Sponsor",
    short: "Sponsor",
    color: "#7c3aed",
    description: "Porte la vision, les objectifs et le périmètre.",
    agents: ["@sponsor"]
  },
  {
    id: "po",
    label: "Product Owner",
    short: "PO",
    color: "#0891b2",
    description: "Définit et priorise le backlog et les User Stories.",
    agents: ["@po"]
  },
  {
    id: "ux",
    label: "Designer UX/UI",
    short: "UX/UI",
    color: "#db2777",
    description: "Conçoit les parcours, les écrans et l'expérience.",
    agents: ["@ux", "@ui-designer"]
  },
  {
    id: "architecte-metier",
    label: "Architecte métier",
    short: "Métier",
    color: "#ca8a04",
    description: "Modélise le domaine, le vocabulaire et les règles.",
    agents: ["@architecte-metier"]
  },
  {
    id: "architecte-technique",
    label: "Architecte technique",
    short: "Archi",
    color: "#2563eb",
    description: "Choisit l'architecture, les intégrations et les NFR.",
    agents: ["@architecte-technique"]
  },
  {
    id: "securite",
    label: "Sécurité / DPO",
    short: "Sécu",
    color: "#dc2626",
    description: "Cadre la sécurité, la donnée et la conformité.",
    agents: ["@security-architect", "@appsec-reviewer"]
  },
  {
    id: "developpeur",
    label: "Développeur",
    short: "Dev",
    color: "#16a34a",
    description: "Implémente les User Stories en tranches verticales.",
    agents: ["@developpeur"]
  },
  {
    id: "qa",
    label: "QA",
    short: "QA",
    color: "#0d9488",
    description: "Conçoit et exécute les tests et les preuves.",
    agents: ["@qa", "@test-reviewer"]
  },
  {
    id: "devops",
    label: "DevOps",
    short: "DevOps",
    color: "#4f46e5",
    description: "Prépare le déploiement, le monitoring et le rollback.",
    agents: ["@devops", "@release-judge"]
  }
];

export const PROFILE_BY_ID = Object.fromEntries(PROFILES.map((p) => [p.id, p]));
