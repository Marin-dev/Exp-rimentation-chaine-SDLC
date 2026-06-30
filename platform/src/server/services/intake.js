import fs from "node:fs";
import path from "node:path";

const SKIP = new Set(["node_modules", ".git", ".claude", "dist", "build", "livrables", "platform", "control-center"]);
const TEXT_EXT = new Set([".md", ".txt", ".csv", ".json", ".yaml", ".yml", ".xml", ".html", ".pdf", ".docx", ".xlsx", ".pptx"]);

/** Scan a folder for intake documents (the client need). Returns a flat file list. */
export function scanIntake(folderPath) {
  if (!folderPath || !fs.existsSync(folderPath)) {
    return { ok: false, error: "Dossier introuvable." };
  }
  const stat = fs.statSync(folderPath);
  if (!stat.isDirectory()) {
    return { ok: false, error: "Le chemin n'est pas un dossier." };
  }

  const files = [];
  const walk = (dir, depth) => {
    if (depth > 5 || files.length > 500) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP.has(entry.name.toLowerCase())) continue;
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        let size = 0;
        try { size = fs.statSync(full).size; } catch {}
        files.push({
          name: entry.name,
          rel: path.relative(folderPath, full).split(path.sep).join("/"),
          ext,
          size,
          known: TEXT_EXT.has(ext)
        });
      }
    }
  };
  walk(folderPath, 0);
  files.sort((a, b) => a.rel.localeCompare(b.rel));
  return { ok: true, path: folderPath, files, count: files.length };
}
