import fs from "node:fs";
import path from "node:path";

function safeName(name) {
  return String(name || "fichier")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "fichier";
}

/**
 * Save a base64-encoded file as an answer attachment for an inbox item.
 * Stored under livrables/_governance/agent-io/uploads/<itemId>/ so the AI
 * can read it on the next run. Returns the workspace-relative path.
 */
export function saveUpload(paths, { itemId, filename, contentBase64 }) {
  const id = safeName(itemId || "divers");
  const name = safeName(filename);
  if (!contentBase64) return { ok: false, error: "Fichier vide." };

  let buffer;
  try {
    const comma = contentBase64.indexOf(",");
    const raw = contentBase64.startsWith("data:") && comma !== -1 ? contentBase64.slice(comma + 1) : contentBase64;
    buffer = Buffer.from(raw, "base64");
  } catch {
    return { ok: false, error: "Contenu illisible." };
  }
  if (buffer.length > 25 * 1024 * 1024) return { ok: false, error: "Fichier trop volumineux (max 25 Mo)." };

  const dir = path.join(paths.uploadsDir, id);
  fs.mkdirSync(dir, { recursive: true });
  const full = path.join(dir, name);
  fs.writeFileSync(full, buffer);
  const rel = path.relative(paths.workspaceRoot, full).split(path.sep).join("/");
  return { ok: true, path: rel, name };
}
