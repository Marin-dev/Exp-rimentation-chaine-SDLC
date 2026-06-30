import fs from "node:fs/promises";
import path from "node:path";
import { TEXT_EXTENSIONS } from "../config/runtime.js";
import { isInside, readMaybe, safeRelativePath } from "../utils/fs-utils.js";
import { isoStamp, slugify } from "../utils/text-utils.js";

export function createIntakeService(configService) {
  async function scanIntakeFolder(folderPath) {
    const config = await configService.getConfig();
    const resolved = path.resolve(folderPath);
    const stat = await fs.stat(resolved).catch(() => null);
    if (!stat || !stat.isDirectory()) {
      const error = new Error("Le dossier d'intake est introuvable ou inaccessible.");
      error.status = 400;
      throw error;
    }

    const files = [];
    async function walk(dir) {
      if (files.length >= config.maxIntakeFiles) return;
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (files.length >= config.maxIntakeFiles) break;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!["node_modules", ".git", ".claude", "dist", "build"].includes(entry.name)) {
            await walk(full);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          const rel = path.relative(resolved, full);
          const size = (await fs.stat(full)).size;
          const readable = TEXT_EXTENSIONS.has(ext);
          const preview = readable ? (await readMaybe(full)).slice(0, config.maxFilePreviewChars) : "";
          files.push({ path: rel, extension: ext || "(none)", size, readable, preview });
        }
      }
    }

    await walk(resolved);
    const byExtension = files.reduce((acc, file) => {
      acc[file.extension] = (acc[file.extension] || 0) + 1;
      return acc;
    }, {});
    return {
      folderPath: resolved,
      files,
      summary: {
        totalFiles: files.length,
        readableFiles: files.filter((file) => file.readable).length,
        byExtension
      }
    };
  }

  async function importIntakeFiles(body) {
    const { importedIntakeDir } = await configService.getWorkspacePaths();
    const files = Array.isArray(body.files) ? body.files.slice(0, 250) : [];
    if (!files.length) {
      const error = new Error("Aucun fichier fourni pour l'import.");
      error.status = 400;
      throw error;
    }
    const targetDir = path.join(importedIntakeDir, `${isoStamp()}-${slugify(body.name || "intake")}`);
    await fs.mkdir(targetDir, { recursive: true });
    let imported = 0;
    let skipped = 0;
    let totalChars = 0;
    for (const file of files) {
      if (typeof file.content !== "string") {
        skipped += 1;
        continue;
      }
      totalChars += file.content.length;
      if (totalChars > 5_000_000) {
        skipped += 1;
        continue;
      }
      const relative = safeRelativePath(file.path);
      const destination = path.join(targetDir, relative);
      if (!isInside(targetDir, destination)) {
        skipped += 1;
        continue;
      }
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, file.content, "utf8");
      imported += 1;
    }
    return { folderPath: targetDir, imported, skipped };
  }

  return { scanIntakeFolder, importIntakeFiles };
}
