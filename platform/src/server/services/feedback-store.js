import fs from "node:fs";
import path from "node:path";
import { readTextSafe } from "./fs-utils.js";

/**
 * Human feedback on a deliverable. Stored in project-state.json (for display)
 * and mirrored to agent-io/feedback.json so the AI reads and addresses it
 * on the next phase/review run.
 */
function loadState(paths) {
  const content = readTextSafe(paths.projectStateFile);
  if (!content) return { decisions: [], seq: 0, feedback: [] };
  try {
    const p = JSON.parse(content);
    return { ...p, feedback: Array.isArray(p.feedback) ? p.feedback : [] };
  } catch {
    return { decisions: [], seq: 0, feedback: [] };
  }
}

function saveState(paths, data) {
  fs.mkdirSync(path.dirname(paths.projectStateFile), { recursive: true });
  fs.writeFileSync(paths.projectStateFile, JSON.stringify(data, null, 2), "utf8");
}

function mirrorOpenFeedback(paths, feedback) {
  const open = feedback
    .filter((f) => f.status === "open")
    .map((f) => ({ doc: f.path, comment: f.comment, by: f.by }));
  fs.mkdirSync(path.dirname(paths.feedbackFile), { recursive: true });
  if (open.length) {
    fs.writeFileSync(paths.feedbackFile, JSON.stringify(open, null, 2), "utf8");
  } else {
    try { fs.rmSync(paths.feedbackFile, { force: true }); } catch {}
  }
}

export function addFeedback(paths, { docPath, comment, phaseId, by }) {
  const text = String(comment || "").trim();
  if (!docPath || !text) return { ok: false, error: "Retour vide." };
  const data = loadState(paths);
  const entry = {
    id: `FB-${Date.now()}`,
    path: String(docPath),
    comment: text,
    phaseId: phaseId || null,
    by: by || null,
    status: "open",
    createdAt: new Date().toISOString()
  };
  data.feedback.push(entry);
  saveState(paths, data);
  mirrorOpenFeedback(paths, data.feedback);
  return { ok: true, id: entry.id };
}

export function listFeedback(paths) {
  return loadState(paths).feedback;
}
