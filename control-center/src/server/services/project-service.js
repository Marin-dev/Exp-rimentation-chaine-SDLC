import path from "node:path";
import { fileExistsSync, readMaybe } from "../utils/fs-utils.js";

export function createProjectService(configService) {
  async function getProjectProfile() {
    const { workspaceRoot } = await configService.getWorkspacePaths();
    const filePath = path.join(workspaceRoot, ".claude", "project", "PROJECT.md");
    const content = await readMaybe(filePath);
    const variableMatches = [...content.matchAll(/\|\s*`([^`]+)`\s*\|\s*([^|]+)\|\s*([^|]+)\|/g)];
    const variables = Object.fromEntries(variableMatches.map((m) => [m[1], m[3].trim()]));
    const projectName =
      content.match(/\*\*Project name\*\*:\s*(.+)/)?.[1]?.trim() ||
      variables.PROJECT_NAME ||
      "Projet non défini";
    const contextFiles = [...content.matchAll(/\|\s*([^|]+)\|\s*`([^`]+)`\s*\|/g)].map((m) => ({
      topic: m[1].trim(),
      path: m[2].trim(),
      exists: fileExistsSync(path.join(workspaceRoot, m[2].trim()))
    }));
    return {
      projectName,
      variables,
      contextFiles,
      file: path.relative(workspaceRoot, filePath),
      exists: Boolean(content),
      preview: content.slice(0, 2600)
    };
  }

  return { getProjectProfile };
}
