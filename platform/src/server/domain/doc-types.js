/**
 * Document typologies constituting each phase, derived from what each agent
 * actually declares producing (.claude/agents/*.md). Used to group deliverables
 * by type and show a phase's expected structure even before docs exist.
 *
 * Matching is rule-based: a deliverable matches a type if it lives in `folder`
 * (top folder under /livrables) and its path tail matches `re`. Shared folders
 * (10-security split between G3 and G6/reviews; 11-evaluations holds each phase's
 * review report) are routed by filename/subfolder. `catchAll` types absorb the
 * rest of a single-owner folder and are evaluated AFTER all specific rules.
 */
const PHASE_TYPE_DEFS = {
  G0: [
    { key: "synthese", label: "Synthèse d'intake", folder: "00-contexte", re: /intake-synth/i },
    { key: "inventaire", label: "Inventaire d'intake", folder: "00-contexte", re: /intake-invent/i },
    { key: "besoins", label: "Nouveaux besoins", folder: "00-contexte", re: /nouveaux-besoins/i },
    { key: "infra", label: "Infrastructure locale", folder: "00-contexte", re: /infrastructure/i },
    { key: "journaux", label: "Journaux", folder: "00-contexte", re: /journ/i },
    { key: "contexte", label: "Contexte", folder: "00-contexte", catchAll: true }
  ],
  G1: [
    { key: "vision", label: "Vision produit", folder: "01-vision", re: /vision/i },
    { key: "kpis", label: "KPIs", folder: "01-vision", re: /kpi/i },
    { key: "mvp", label: "Périmètre MVP", folder: "01-vision", re: /perimetre|mvp/i },
    { key: "vision-autres", label: "Autres (vision)", folder: "01-vision", catchAll: true }
  ],
  G2: [
    { key: "personas", label: "Personas", folder: "02-ux", re: /persona/i },
    { key: "journeys", label: "Parcours utilisateurs", folder: "02-ux", re: /journey|parcours/i },
    { key: "wireframes", label: "Wireframes", folder: "02-ux", re: /wireframe|maquette/i },
    { key: "ux-autres", label: "Autres (UX)", folder: "02-ux", catchAll: true },
    { key: "design-system", label: "Design system", folder: "02-ui", re: /design.?system/i },
    { key: "ecrans", label: "Écrans", folder: "02-ui", re: /ecran/i },
    { key: "flows", label: "Flows UI", folder: "02-ui", re: /flow/i },
    { key: "handoff", label: "Handoff dev", folder: "02-ui", re: /handoff/i },
    { key: "ui-autres", label: "Autres (UI)", folder: "02-ui", catchAll: true },
    { key: "langage", label: "Langage métier", folder: "03-architecture-metier", re: /ubiquitous|langage/i },
    { key: "bounded", label: "Bounded contexts", folder: "03-architecture-metier", re: /bounded/i },
    { key: "contextmap", label: "Context map", folder: "03-architecture-metier", re: /context-map/i },
    { key: "domaine", label: "Modèle de domaine", folder: "03-architecture-metier", re: /domain|modele/i },
    { key: "capability", label: "Capability map", folder: "03-architecture-metier", re: /capabilit/i },
    { key: "modules", label: "Modules fonctionnels", folder: "03-architecture-metier", re: /modules/i },
    { key: "metier-autres", label: "Autres (métier)", folder: "03-architecture-metier", catchAll: true },
    { key: "discovery-review", label: "Revue discovery", folder: "11-evaluations", re: /discovery-review/i }
  ],
  G3: [
    { key: "archi", label: "Architecture applicative", folder: "04-architecture-technique", re: /architecture/i },
    { key: "integrations", label: "Intégrations", folder: "04-architecture-technique", re: /integration|schema/i },
    { key: "designdec", label: "Décisions de conception", folder: "04-architecture-technique", re: /design-decision/i },
    { key: "nfr", label: "Exigences non-fonctionnelles", folder: "04-architecture-technique", re: /non.?fonctionnel|nfr|exigence/i },
    { key: "tech-autres", label: "Autres (technique)", folder: "04-architecture-technique", catchAll: true },
    { key: "dataclass", label: "Classification des données", folder: "10-security", re: /classification|data.?class/i },
    { key: "secreq", label: "Exigences de sécurité", folder: "10-security", re: /security-requirement|exigence/i },
    { key: "threat", label: "Threat model", folder: "10-security", re: /threat/i },
    { key: "sec-autres", label: "Autres (sécurité)", folder: "10-security", catchAll: true },
    { key: "adr", label: "ADRs", folder: "_governance", re: /decisions\/ADR-/i },
    { key: "archi-judge", label: "Revue architecture", folder: "11-evaluations", re: /architecture-judge/i }
  ],
  G4: [
    { key: "epics", label: "Epics", folder: "05-backlog", re: /epic/i },
    { key: "features", label: "Features", folder: "05-backlog", re: /feature/i },
    { key: "defmvp", label: "Définition MVP", folder: "05-backlog", re: /definition-mvp/i },
    { key: "planning", label: "Planning", folder: "05-backlog", re: /^planning/i },
    { key: "us", label: "User Stories", folder: "05-backlog", re: /user.?stor|\bus-/i },
    { key: "backlog-autres", label: "Autres (backlog)", folder: "05-backlog", catchAll: true },
    { key: "spec-review", label: "Revue de spec", folder: "11-evaluations", re: /spec/i }
  ],
  G5: [
    { key: "slices", label: "Vertical slices", folder: "06-dev", re: /vertical-slice|impl/i },
    { key: "testpost", label: "Poste de commande tests", folder: "06-dev", re: /poste-de-commande/i },
    { key: "dev-autres", label: "Notes de développement", folder: "06-dev", catchAll: true },
    { key: "cq-review", label: "Revue qualité code", folder: "11-evaluations", re: /code-quality/i }
  ],
  G6: [
    { key: "scenarios", label: "Scénarios de test", folder: "07-tests", re: /scenario/i },
    { key: "rapports", label: "Rapports de test", folder: "07-tests", re: /rapport|report/i },
    { key: "plan", label: "Plan de tests", folder: "07-tests", re: /plan-test/i },
    { key: "datasets", label: "Jeux de données", folder: "07-tests", re: /jeux-de-donnees|donnees/i },
    { key: "tests-autres", label: "Autres (tests)", folder: "07-tests", catchAll: true },
    { key: "appsec", label: "Revues AppSec", folder: "10-security", re: /reviews\//i },
    { key: "test-review", label: "Revue de tests", folder: "11-evaluations", re: /test-review/i }
  ],
  G7: [
    { key: "pipeline", label: "Pipeline CI/CD", folder: "08-devops", re: /pipeline|ci.?cd/i },
    { key: "deploiement", label: "Déploiement", folder: "08-devops", re: /deploi|deploy/i },
    { key: "monitoring", label: "Monitoring", folder: "08-devops", re: /monitor/i },
    { key: "rollback", label: "Rollback", folder: "08-devops", re: /rollback/i },
    { key: "devops-autres", label: "Autres (DevOps)", folder: "08-devops", catchAll: true },
    { key: "release-review", label: "Décision / revue de release", folder: "11-evaluations", re: /release/i }
  ]
};

// UI list of typologies per phase (preserves order).
export function phaseDocTypes(phaseId) {
  return (PHASE_TYPE_DEFS[phaseId] || []).map((t) => ({ key: t.key, label: t.label }));
}

// Specific rules first (across all phases), then catch-alls.
const SPECIFIC = [];
const CATCHALL = [];
for (const [phaseId, defs] of Object.entries(PHASE_TYPE_DEFS)) {
  for (const t of defs) {
    (t.catchAll ? CATCHALL : SPECIFIC).push({ phaseId, ...t });
  }
}

/**
 * Classify a deliverable by its workspace-relative path
 * (e.g. "livrables/05-backlog/user-stories/US-001.md").
 * Returns { phaseId, typeKey, typeLabel } or null (-> shown under "Governance & autres").
 */
export function classifyDoc(relPath) {
  const parts = String(relPath).split("/");
  const li = parts.indexOf("livrables");
  const rest = li >= 0 ? parts.slice(li + 1) : parts;
  const folder = rest[0];
  // Match the path AFTER the top folder, so folder names (e.g. "01-vision",
  // "04-architecture-technique") don't accidentally satisfy a pattern.
  const subtail = rest.slice(1).join("/");
  for (const r of SPECIFIC) {
    if (r.folder === folder && r.re.test(subtail)) {
      return { phaseId: r.phaseId, typeKey: r.key, typeLabel: r.label };
    }
  }
  for (const r of CATCHALL) {
    if (r.folder === folder) {
      return { phaseId: r.phaseId, typeKey: r.key, typeLabel: r.label };
    }
  }
  return null;
}
