import path from "node:path";
import { walkMarkdown, readTextSafe, statSafe, extractTitle } from "./fs-utils.js";

const FOLDER_LABELS = {
  "00-contexte": "Contexte",
  "01-vision": "Vision",
  "02-ux": "UX",
  "02-ui": "UI",
  "03-architecture-metier": "Architecture métier",
  "04-architecture-technique": "Architecture technique",
  "05-backlog": "Backlog",
  "06-dev": "Développement",
  "07-tests": "Tests",
  "08-devops": "DevOps",
  "09-feedback": "Feedback",
  "10-security": "Sécurité",
  "11-evaluations": "Évaluations",
  _governance: "Gouvernance",
  _sources: "Sources client",
  _inputs: "Documents d'entrée"
};

/**
 * List every markdown deliverable, grouped by its top-level folder under /livrables.
 * Paths returned are workspace-relative (portable, safe to send to the client).
 */
export function listDeliverables(paths) {
  const files = walkMarkdown(paths.livrablesDir);
  const groups = new Map();

  for (const full of files) {
    const rel = path.relative(paths.workspaceRoot, full).split(path.sep).join("/");
    const fromLivrables = path.relative(paths.livrablesDir, full).split(path.sep);
    const folder = fromLivrables[0];
    const content = readTextSafe(full);
    const stat = statSafe(full);
    const item = {
      path: rel,
      name: path.basename(full),
      title: extractTitle(content) || path.basename(full).replace(/\.md$/i, ""),
      folder,
      size: stat ? stat.size : 0,
      updatedAt: stat ? stat.mtime.toISOString() : null
    };
    if (!groups.has(folder)) {
      groups.set(folder, { folder, label: FOLDER_LABELS[folder] || folder, items: [] });
    }
    groups.get(folder).items.push(item);
  }

  const result = [...groups.values()];
  for (const g of result) {
    g.items.sort((a, b) => a.path.localeCompare(b.path));
  }
  result.sort((a, b) => a.folder.localeCompare(b.folder));
  return result;
}

export function countDocsByFolders(deliverables, folders) {
  let count = 0;
  for (const group of deliverables) {
    if (folders.includes(group.folder)) count += group.items.length;
  }
  return count;
}
