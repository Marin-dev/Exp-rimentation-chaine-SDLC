import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const serverConfigDir = path.dirname(__filename);

// platform/ root (two levels up from src/server/config/)
export const platformRoot = path.resolve(serverConfigDir, "..", "..", "..");
export const distDir = path.join(platformRoot, "dist");
export const appStateDir = path.join(platformRoot, ".state");
export const configPath = path.join(appStateDir, "config.json");

// App-bundled framework template. Mirrors a workspace layout (CLAUDE.md + .claude/…)
// so createWorkspacePaths(frameworkRoot) yields its agents/skills/mcp paths directly.
// This is the "en dur" source copied into every new project.
export const frameworkRoot = path.join(platformRoot, "framework");

// By default the workspace is the repository that contains platform/.
export const defaultWorkspaceRoot = path.resolve(platformRoot, "..");

/**
 * Resolve all workspace-relative paths from a chosen workspace root.
 * This is the single place that knows the on-disk layout of a project,
 * so storage can later be abstracted (cloud) behind the same shape.
 */
export function createWorkspacePaths(workspaceRootInput = defaultWorkspaceRoot) {
  const workspaceRoot = path.resolve(workspaceRootInput || defaultWorkspaceRoot);
  const claudeDir = path.join(workspaceRoot, ".claude");
  const stateDir = path.join(claudeDir, "control-center");
  const livrablesDir = path.join(workspaceRoot, "livrables");
  return {
    workspaceRoot,
    claudeDir,
    stateDir,
    agentsDir: path.join(claudeDir, "agents"),
    skillsDir: path.join(claudeDir, "skills"),
    // Project profile lives OUTSIDE .claude/ so agents can write it (.claude is write-protected).
    projectFile: path.join(workspaceRoot, "project", "PROJECT.md"),
    projectDir: path.join(workspaceRoot, "project"),
    mcpClaudePath: path.join(claudeDir, "mcp.json"),
    mcpProjectPath: path.join(workspaceRoot, ".mcp.json"),
    livrablesDir,
    gatesDir: path.join(livrablesDir, "_governance", "gates"),
    decisionsDir: path.join(livrablesDir, "_governance", "decisions"),
    // structured app state lives next to deliverables but is machine-owned
    projectStateFile: path.join(stateDir, "project-state.json"),
    runsDir: path.join(stateDir, "runs"),
    spendFile: path.join(stateDir, "spend.json"),
    newNeedsFile: path.join(livrablesDir, "00-contexte", "nouveaux-besoins.md"),
    // Per-phase human-provided INPUT documents (sources the agents must consume).
    inputsDir: path.join(livrablesDir, "_inputs"),
    // AI agent I/O contract. These live UNDER /livrables (not .claude/) because
    // Claude Code protects the .claude/ directory from automated writes.
    agentIoDir: path.join(livrablesDir, "_governance", "agent-io"),
    pendingInputFile: path.join(livrablesDir, "_governance", "agent-io", "pending-input.json"),
    answersFile: path.join(livrablesDir, "_governance", "agent-io", "answers.json"),
    // AI reports back the actual choices it made for delegated items.
    resolutionsFile: path.join(livrablesDir, "_governance", "agent-io", "resolutions.json"),
    uploadsDir: path.join(livrablesDir, "_governance", "agent-io", "uploads"),
    feedbackFile: path.join(livrablesDir, "_governance", "agent-io", "feedback.json")
  };
}
