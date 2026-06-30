import fs from "node:fs";
import { readTextSafe } from "./fs-utils.js";
import { createItems, applyResolutions } from "./decisions-store.js";

/** Ingest the AI's reported choices for delegated items, then clear the file. */
export function ingestResolutions(paths) {
  const content = readTextSafe(paths.resolutionsFile);
  if (!content) return { applied: 0 };
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { applied: 0 };
  }
  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.resolutions) ? parsed.resolutions : [];
  const res = applyResolutions(paths, list);
  try { fs.rmSync(paths.resolutionsFile, { force: true }); } catch {}
  return res;
}

/**
 * After an agent run, read the questions/decisions it produced via the contract
 * (.claude/control-center/pending-input.json), turn them into inbox items,
 * then clear the file so the next run starts clean.
 */
export function ingestPendingInput(paths, { runId, phaseId, raisedBy }, fileOverride) {
  const file = fileOverride || paths.pendingInputFile;
  const content = readTextSafe(file);
  if (!content) return { summary: null, created: 0 };
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { summary: null, created: 0, error: "pending-input illisible." };
  }
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const res = createItems(paths, items, { runId, phaseId, raisedBy });
  try {
    fs.rmSync(file, { force: true });
  } catch {}
  return { summary: parsed.summary || null, created: res.ids.length };
}
