import fs from "node:fs";
import { readTextSafe } from "./fs-utils.js";
import { createItems, applyResolutions } from "./decisions-store.js";
import { ingestRiskItems } from "./risks-store.js";
import { ingestTaskItems } from "./tasks-store.js";

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

/**
 * After an agent run, read the risks it registered/updated via the contract
 * (agent-io/risks.json), upsert them into the register, then clear the file.
 * Accepts an array, or { risks: [...] } / { items: [...] }.
 */
export function ingestRisks(paths, { runId, phaseId, raisedBy } = {}, fileOverride) {
  const file = fileOverride || paths.risksInboxFile;
  const content = readTextSafe(file);
  if (!content) return { created: 0, updated: 0 };
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { created: 0, updated: 0, error: "risks.json illisible." };
  }
  const items = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.risks)
      ? parsed.risks
      : Array.isArray(parsed.items)
        ? parsed.items
        : [];
  const res = ingestRiskItems(paths, items, { runId, phaseId, raisedBy });
  try { fs.rmSync(file, { force: true }); } catch {}
  return res;
}

/**
 * After an agent run, read the tasks it created/updated via the contract
 * (agent-io/tasks.json) and upsert them into the register, then clear the file.
 * This is how an agent's "next step for another profile" becomes a tracked task
 * instead of being lost in prose.
 */
export function ingestTasks(paths, { runId, phaseId, raisedBy } = {}, fileOverride) {
  const file = fileOverride || paths.tasksInboxFile;
  const content = readTextSafe(file);
  if (!content) return { created: 0, updated: 0 };
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { created: 0, updated: 0, error: "tasks.json illisible." };
  }
  const items = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.tasks)
      ? parsed.tasks
      : Array.isArray(parsed.items)
        ? parsed.items
        : [];
  // Handoffs an agent emits during a run land as CANDIDATES (proposed), routed through
  // triage — they don't auto-open in the actionable tray. This is what breaks the endless
  // "every run spawns more todo" cascade; the orchestrator/human promotes what's relevant.
  const res = ingestTaskItems(paths, items, { runId, phaseId, raisedBy, asProposed: true });
  try { fs.rmSync(file, { force: true }); } catch {}
  return res;
}
