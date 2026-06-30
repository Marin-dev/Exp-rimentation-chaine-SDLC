import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const serverConfigDir = path.dirname(__filename);

export const controlCenterRoot = path.resolve(serverConfigDir, "..", "..", "..");
export const defaultWorkspaceRoot = path.resolve(controlCenterRoot, "..");
export const distDir = path.join(controlCenterRoot, "dist");
export const legacyPublicDir = path.join(controlCenterRoot, "public");
export const appStateDir = path.join(controlCenterRoot, ".state");
export const configPath = path.join(appStateDir, "config.json");

export function createWorkspacePaths(workspaceRootInput = defaultWorkspaceRoot) {
  const workspaceRoot = path.resolve(workspaceRootInput || defaultWorkspaceRoot);
  const stateDir = path.join(workspaceRoot, ".claude", "control-center");
  const claudeDir = path.join(workspaceRoot, ".claude");
  const livrablesDir = path.join(workspaceRoot, "livrables");
  const gatesDir = path.join(livrablesDir, "_governance", "gates");
  return {
    workspaceRoot,
    stateDir,
    actionsDir: path.join(stateDir, "actions"),
    runsDir: path.join(stateDir, "runs"),
    importedIntakeDir: path.join(stateDir, "imported-intake"),
    humanReviewsDir: path.join(stateDir, "human-reviews"),
    changeRequestsDir: path.join(stateDir, "change-requests"),
    changeRequestSourcesDir: path.join(stateDir, "change-request-sources"),
    g0ResponsesDir: path.join(stateDir, "g0-responses"),
    g0OpenQuestionsJsonPath: path.join(stateDir, "g0-open-questions.json"),
    g0OpenQuestionsMarkdownPath: path.join(stateDir, "g0-open-questions.md"),
    claudeDir,
    agentsDir: path.join(claudeDir, "agents"),
    skillsDir: path.join(claudeDir, "skills"),
    livrablesDir,
    gatesDir,
    mcpConfigPath: path.join(claudeDir, "mcp.json")
  };
}

export const defaultWorkspacePaths = createWorkspacePaths(defaultWorkspaceRoot);
