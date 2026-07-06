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
  // Grab everything after "**Status**:" on that line — the value may be wrapped in
  // markdown emphasis (**FAIL**), backticks, or trailed by a parenthetical note.
  const line = content.match(/\*\*Status\*\*\s*:\s*(.+)/i);
  if (!line) return null;
  // Strip emphasis markers, then keep only the head before any note delimiter.
  const cleaned = line[1].replace(/[*_`~]/g, " ");
  const head = cleaned.split(/[(\-—,;:]/)[0].toUpperCase();
  if (/PASS[_\s]*WITH[_\s]*RISK/.test(head)) return "PASS_WITH_RISK";
  if (/\bFAIL\b/.test(head)) return "FAIL";
  if (/\bPASS\b/.test(head)) return "PASS";
  const tok = head.trim().split(/\s+/)[0].replace(/[^A-Z_]/g, "");
  return tok || null;
}
