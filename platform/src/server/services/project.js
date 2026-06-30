import { readTextSafe } from "./fs-utils.js";

/** Read the active project name from project/PROJECT.md. */
export function readProject(paths) {
  const content = readTextSafe(paths.projectFile);
  if (!content) {
    return { exists: false, name: null };
  }
  const nameMatch = content.match(/\*\*Project name\*\*\s*:\s*(.+)/i);
  const domainMatch = content.match(/\*\*Project domain\*\*\s*:\s*(.+)/i)
    || content.match(/PROJECT_DOMAIN.*?\|\s*(.+?)\s*\|/);
  return {
    exists: true,
    name: nameMatch ? nameMatch[1].trim() : null,
    domain: domainMatch ? domainMatch[1].trim() : null
  };
}
