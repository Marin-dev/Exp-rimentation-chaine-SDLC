import path from "node:path";
import { createWorkspacePaths } from "../config/paths.js";
import { readTextSafe } from "./fs-utils.js";

/**
 * Read a single deliverable by its workspace-relative path.
 * Guards against path traversal: the resolved file must stay inside /livrables.
 */
export function readDeliverableContent(config, relPath) {
  if (!relPath || typeof relPath !== "string") {
    return { ok: false, error: "Chemin manquant." };
  }
  const paths = createWorkspacePaths(config.workspaceRoot);
  const resolved = path.resolve(paths.workspaceRoot, relPath);
  const livrablesResolved = path.resolve(paths.livrablesDir);
  if (resolved !== livrablesResolved && !resolved.startsWith(livrablesResolved + path.sep)) {
    return { ok: false, error: "Chemin hors périmètre." };
  }
  if (!resolved.toLowerCase().endsWith(".md")) {
    return { ok: false, error: "Type de fichier non supporté." };
  }
  const content = readTextSafe(resolved);
  if (content === null) {
    return { ok: false, error: "Fichier introuvable." };
  }
  return { ok: true, path: relPath, content };
}
