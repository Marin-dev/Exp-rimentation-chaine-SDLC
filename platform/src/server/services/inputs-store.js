import fs from "node:fs";
import path from "node:path";
import { readTextSafe } from "./fs-utils.js";

/**
 * Per-phase INPUT documents: human-provided source files an agent must consume
 * for a phase (e.g. the existing IS architecture schema for G3). Each carries a
 * status: "pending" (pas encore pris en compte) | "considered" (pris en compte).
 * Stored under /livrables/_inputs/<phaseId>/; tracked in project-state.json.
 */
function load(paths) {
  const content = readTextSafe(paths.projectStateFile);
  if (!content) return { decisions: [], seq: 0, inputs: [] };
  try {
    const p = JSON.parse(content);
    return { ...p, inputs: Array.isArray(p.inputs) ? p.inputs : [] };
  } catch {
    return { decisions: [], seq: 0, inputs: [] };
  }
}

function save(paths, data) {
  fs.mkdirSync(path.dirname(paths.projectStateFile), { recursive: true });
  fs.writeFileSync(paths.projectStateFile, JSON.stringify(data, null, 2), "utf8");
}

function safeName(name) {
  return (
    String(name || "fichier")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "fichier"
  );
}

export function addInput(paths, { phaseId, filename, contentBase64, description }) {
  if (!phaseId) return { ok: false, error: "Étape requise." };
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

  const dir = path.join(paths.inputsDir, phaseId);
  fs.mkdirSync(dir, { recursive: true });
  const name = safeName(filename);
  const full = path.join(dir, name);
  fs.writeFileSync(full, buffer);
  const rel = path.relative(paths.workspaceRoot, full).split(path.sep).join("/");

  const data = load(paths);
  const entry = {
    id: `IN-${Date.now()}-${data.inputs.length + 1}`,
    phaseId,
    name,
    path: rel,
    description: String(description || "").trim(),
    status: "pending",
    addedAt: new Date().toISOString(),
    consideredAt: null
  };
  data.inputs.push(entry);
  save(paths, data);
  return { ok: true, id: entry.id };
}

export function setInputStatus(paths, id, status) {
  const data = load(paths);
  const item = data.inputs.find((i) => i.id === id);
  if (!item) return { ok: false, error: "Document introuvable." };
  item.status = status === "considered" ? "considered" : "pending";
  item.consideredAt = item.status === "considered" ? new Date().toISOString() : null;
  save(paths, data);
  return { ok: true };
}

export function removeInput(paths, id) {
  const data = load(paths);
  const item = data.inputs.find((i) => i.id === id);
  if (!item) return { ok: false, error: "Document introuvable." };
  try {
    fs.rmSync(path.resolve(paths.workspaceRoot, item.path), { force: true });
  } catch {}
  data.inputs = data.inputs.filter((i) => i.id !== id);
  save(paths, data);
  return { ok: true };
}

/** Pending input records for a phase (used to feed the agent prompt). */
export function pendingInputsForPhase(paths, phaseId) {
  return load(paths).inputs.filter((i) => i.phaseId === phaseId && i.status === "pending");
}

/** Mark a phase's pending inputs as considered (after a run consumed them). */
export function markPhaseInputsConsidered(paths, phaseId) {
  const data = load(paths);
  let changed = 0;
  for (const i of data.inputs) {
    if (i.phaseId === phaseId && i.status === "pending") {
      i.status = "considered";
      i.consideredAt = new Date().toISOString();
      changed += 1;
    }
  }
  if (changed) save(paths, data);
  return { changed };
}
