import fs from "node:fs";
import path from "node:path";

export function readTextSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

export function listDirSafe(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

export function statSafe(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

/** Recursively collect markdown files under a directory. */
export function walkMarkdown(dirPath, baseDir = dirPath, acc = []) {
  for (const entry of listDirSafe(dirPath)) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "archives") continue;
      walkMarkdown(full, baseDir, acc);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      acc.push(full);
    }
  }
  return acc;
}

/** First markdown heading (`# Title`) or null. */
export function extractTitle(content) {
  if (!content) return null;
  const match = content.match(/^\s*#\s+(.+?)\s*$/m);
  return match ? match[1].trim() : null;
}

/** Parse a `**Status**: VALUE` line, normalized. */
export function extractStatus(content) {
  if (!content) return null;
  const match = content.match(/\*\*Status\*\*\s*:\s*([A-Za-z_ ]+)/i);
  if (!match) return null;
  const raw = match[1].trim().toUpperCase().replace(/\s+/g, "_");
  if (raw.includes("PASS_WITH_RISK")) return "PASS_WITH_RISK";
  if (raw.includes("PASS")) return "PASS";
  if (raw.includes("FAIL")) return "FAIL";
  return raw || null;
}
