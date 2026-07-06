import { readTextSafe } from "./fs-utils.js";

/** First `**Label**: value` found for any of the given labels (case-insensitive). */
function labeledField(content, labels) {
  for (const label of labels) {
    const m = content.match(new RegExp(`\\*\\*${label}\\*\\*\\s*:\\s*(.+)`, "i"));
    if (m && m[1].trim()) return m[1].trim();
  }
  return null;
}

/**
 * Read the active project name from project/PROJECT.md.
 * The bootstrapper writes in French, so we accept both English and French labels.
 */
export function readProject(paths) {
  const content = readTextSafe(paths.projectFile);
  if (!content) {
    return { exists: false, name: null };
  }
  const name = labeledField(content, ["Project name", "Projet actif", "Nom du projet", "Projet"]);
  const domain =
    labeledField(content, ["Project domain", "Domaine", "Slug"]) ||
    (content.match(/PROJECT_DOMAIN.*?\|\s*(.+?)\s*\|/)?.[1]?.trim() ?? null);
  return { exists: true, name, domain };
}
