import fs from "node:fs";
import path from "node:path";
import { frameworkRoot } from "../config/paths.js";

// Reusable framework copied into every new project workspace.
const FRAMEWORK_ITEMS = [
  "CLAUDE.md",
  path.join(".claude", "agents"),
  path.join(".claude", "rules"),
  path.join(".claude", "skills"),
  path.join(".claude", "mcp.json"),
  path.join(".claude", "ORCHESTRATION.md"),
  path.join(".claude", "VERIFICATION.md")
];

// Empty deliverable structure created in a fresh project.
const LIVRABLES_DIRS = [
  "00-contexte/journaux",
  "01-vision",
  "02-ux",
  "02-ui/ecrans",
  "02-ui/flows",
  "03-architecture-metier",
  "04-architecture-technique",
  "05-backlog/user-stories",
  "06-dev/vertical-slices",
  "07-tests/scenarios",
  "08-devops",
  "09-feedback",
  "10-security/reviews",
  "11-evaluations",
  "_governance/decisions",
  "_governance/gates",
  "_governance/agent-io",
  "_inputs"
];

/**
 * Scaffold a new project workspace at `targetPath` by copying the reusable
 * framework (agents, rules, skills, mcp) from the app-bundled template
 * (`frameworkRoot`) and creating an empty /livrables structure. Does NOT copy
 * any project's profile or deliverables. Refuses to overwrite an existing framework.
 */
export function scaffoldProject(targetPath) {
  const sourceRoot = frameworkRoot;
  const target = String(targetPath || "").trim();
  if (!target) return { ok: false, error: "Chemin du nouveau projet requis." };
  const resolved = path.resolve(target);

  if (fs.existsSync(path.join(resolved, ".claude", "agents"))) {
    return { ok: false, error: "Ce dossier contient déjà un projet (.claude/agents existe)." };
  }
  if (!fs.existsSync(path.join(sourceRoot, ".claude", "agents"))) {
    return { ok: false, error: "Socle de l'app introuvable (platform/framework/.claude/agents). Impossible de copier les agents." };
  }

  try {
    fs.mkdirSync(resolved, { recursive: true });
    // Copy framework items that exist in the source.
    for (const item of FRAMEWORK_ITEMS) {
      const src = path.join(sourceRoot, item);
      if (!fs.existsSync(src)) continue;
      const dest = path.join(resolved, item);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.cpSync(src, dest, { recursive: true });
    }
    // Empty deliverables tree.
    for (const d of LIVRABLES_DIRS) {
      fs.mkdirSync(path.join(resolved, "livrables", d), { recursive: true });
    }
    fs.mkdirSync(path.join(resolved, ".claude", "control-center"), { recursive: true });
    fs.mkdirSync(path.join(resolved, "project"), { recursive: true });
  } catch (e) {
    return { ok: false, error: `Échec de création : ${e.message}` };
  }
  return { ok: true, path: resolved };
}
