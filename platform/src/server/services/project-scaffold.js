import fs from "node:fs";
import path from "node:path";
import { frameworkRoot } from "../config/paths.js";

// Reusable framework copied into every new project workspace, as [source, destination].
// The project prompt is stored as CLAUDE.template.md so Claude Code does not load it as
// nested instructions while we work on the platform repo; it becomes CLAUDE.md in the project.
const FRAMEWORK_ITEMS = [
  ["CLAUDE.template.md", "CLAUDE.md"],
  path.join(".claude", "agents"),
  path.join(".claude", "rules"),
  path.join(".claude", "skills"),
  path.join(".claude", "mcp.json"),
  path.join(".claude", "ORCHESTRATION.md"),
  path.join(".claude", "VERIFICATION.md")
].map((item) => (Array.isArray(item) ? item : [item, item]));

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
  // The bundled template is ours: a missing item is a packaging bug, not an option.
  // Refuse rather than silently scaffold a project without (e.g.) its CLAUDE.md.
  const missing = FRAMEWORK_ITEMS.map(([from]) => from).filter((from) => !fs.existsSync(path.join(sourceRoot, from)));
  if (missing.length) {
    return { ok: false, error: `Socle de l'app incomplet (platform/framework) : ${missing.join(", ")} introuvable(s).` };
  }

  try {
    fs.mkdirSync(resolved, { recursive: true });
    for (const [from, to] of FRAMEWORK_ITEMS) {
      const src = path.join(sourceRoot, from);
      const dest = path.join(resolved, to);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.cpSync(src, dest, { recursive: true });
    }
    // Empty deliverables tree.
    for (const d of LIVRABLES_DIRS) {
      fs.mkdirSync(path.join(resolved, "livrables", d), { recursive: true });
    }
    fs.mkdirSync(path.join(resolved, ".claude", "control-center"), { recursive: true });
    // New projects: G5 / G6 gates are capped by executable evidence from the start.
    fs.writeFileSync(
      path.join(resolved, ".claude", "control-center", "evidence-policy.json"),
      JSON.stringify({ enabled: true, enabledAt: new Date().toISOString() }, null, 2),
      "utf8"
    );
    fs.mkdirSync(path.join(resolved, "project"), { recursive: true });
  } catch (e) {
    return { ok: false, error: `Échec de création : ${e.message}` };
  }
  return { ok: true, path: resolved };
}
