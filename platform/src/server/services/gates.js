import path from "node:path";
import { listDirSafe, readTextSafe, statSafe, extractStatus } from "./fs-utils.js";

/**
 * Read gate reports from /livrables/_governance/gates/.
 * Returns a map keyed by gate id (G0..G7) with the parsed status.
 * A missing gate file means the phase has not been validated yet.
 */
export function readGates(paths) {
  const result = {};
  for (const entry of listDirSafe(paths.gatesDir)) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
    const idMatch = entry.name.match(/^(G\d)/i);
    if (!idMatch) continue;
    const id = idMatch[1].toUpperCase();
    const full = path.join(paths.gatesDir, entry.name);
    const content = readTextSafe(full);
    const stat = statSafe(full);
    result[id] = {
      id,
      file: entry.name,
      status: extractStatus(content) || "UNKNOWN",
      updatedAt: stat ? stat.mtime.toISOString() : null
    };
  }
  return result;
}
