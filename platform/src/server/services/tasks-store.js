import fs from "node:fs";
import path from "node:path";
import { readTextSafe } from "./fs-utils.js";
import { PROFILE_BY_ID } from "../domain/profiles.js";

/**
 * Task register — actions to be done by a specific profile (e.g. "@po modified US-030,
 * the developer must take it into account"), as first-class, tracked, EXECUTABLE items.
 * Lives in the machine-owned project-state.json; each change dual-writes a human-readable
 * record under /livrables/_governance/tasks/. Mirrors the decisions & risks stores.
 *
 * Lifecycle: todo → in-progress → done  (or cancelled).
 */

// `proposed` = a candidate next-step an agent handed off; it is NOT yet actionable.
// It sits in a triage bucket until the orchestrator (or the human) promotes it to `todo`.
// This is the seam that stops agent handoffs from flooding the actionable tray.
export const TASK_STATUSES = ["proposed", "todo", "in-progress", "done", "cancelled"];
// "Open" = actionable/launchable. Candidates (`proposed`) are deliberately excluded.
export const OPEN_TASK_STATUSES = ["todo", "in-progress"];
// Anything not terminal — used when closing out a whole phase on a gate pass.
export const LIVE_TASK_STATUSES = ["proposed", "todo", "in-progress"];
const PRIORITIES = ["low", "normal", "high"];

function load(paths) {
  const content = readTextSafe(paths.projectStateFile);
  if (!content) return { tasks: [], taskSeq: 0 };
  try {
    const parsed = JSON.parse(content);
    return {
      ...parsed,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      taskSeq: Number.isInteger(parsed.taskSeq) ? parsed.taskSeq : 0
    };
  } catch {
    return { tasks: [], taskSeq: 0 };
  }
}

function save(paths, data) {
  fs.mkdirSync(path.dirname(paths.projectStateFile), { recursive: true });
  fs.writeFileSync(paths.projectStateFile, JSON.stringify(data, null, 2), "utf8");
}

function slug(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function normStatus(s) {
  const v = String(s || "").trim().toLowerCase();
  return TASK_STATUSES.includes(v) ? v : "todo";
}
function normPriority(p) {
  const v = String(p || "").trim().toLowerCase();
  return PRIORITIES.includes(v) ? v : "normal";
}
// Accept either a profile id ("po") or an @agent ("@po") and resolve to a known profile id.
function normProfile(p) {
  let v = String(p || "").trim().replace(/^@/, "");
  if (PROFILE_BY_ID[v]) return v;
  // Try matching an agent name to its owning profile.
  for (const [id, prof] of Object.entries(PROFILE_BY_ID)) {
    if ((prof.agents || []).some((a) => a.replace(/^@/, "") === v)) return id;
  }
  return "orchestrateur";
}

function buildTask(data, input) {
  const provided = String(input.id || "").trim();
  let id = provided;
  let seq = data.taskSeq;
  if (!id) {
    seq = data.taskSeq + 1;
    id = `T-${String(seq).padStart(3, "0")}`;
  }
  const status = normStatus(input.status || (input.asProposed ? "proposed" : "todo"));
  const now = new Date().toISOString();
  const task = {
    id,
    title: String(input.title || "").trim(),
    description: String(input.description || input.context || "").trim(),
    targetProfile: normProfile(input.targetProfile || input.profile),
    raisedBy: String(input.raisedBy || "").trim() || null,
    priority: normPriority(input.priority),
    phaseId: String(input.phaseId || "").trim() || null,
    status,
    // Executable orchestrator action this task mirrors (launch_dev / launch_phase / …).
    // When present, launching the task from the tray runs that exact action instead of
    // the generic profile-batch prompt — one execution path, no divergence.
    action: input.action && typeof input.action === "object" ? input.action : null,
    links: Array.isArray(input.links) ? input.links.map((l) => String(l)).filter(Boolean) : [],
    runId: null,
    createdAt: now,
    updatedAt: now,
    history: [{ at: now, by: String(input.raisedBy || input.by || "").trim() || "—", from: null, to: status, note: String(input.note || "Tâche créée.").trim() }]
  };
  return { task, seq };
}

export function createTask(paths, input) {
  const title = String(input.title || "").trim();
  if (!title) return { ok: false, error: "Titre requis." };
  const data = load(paths);
  if (input.id && data.tasks.some((t) => t.id === String(input.id).trim())) {
    return { ok: false, error: `La tâche « ${input.id} » existe déjà.` };
  }
  const { task, seq } = buildTask(data, input);
  data.tasks.push(task);
  data.taskSeq = seq;
  save(paths, data);
  writeTaskRecord(paths, task);
  return { ok: true, id: task.id };
}

export function listTasks(paths) {
  return load(paths).tasks;
}
export function getTask(paths, id) {
  const data = load(paths);
  return data.tasks.find((t) => t.id === String(id || "").trim()) || null;
}

export function updateTaskStatus(paths, input) {
  const id = String(input.id || "").trim();
  const data = load(paths);
  const task = data.tasks.find((t) => t.id === id);
  if (!task) return { ok: false, error: "Tâche introuvable." };
  const to = normStatus(input.status);
  const from = task.status;
  const by = String(input.by || "").trim() || "—";
  const note = String(input.note || "").trim();
  if (typeof input.runId === "string" && input.runId) task.runId = input.runId;
  task.status = to;
  task.updatedAt = new Date().toISOString();
  task.history = Array.isArray(task.history) ? task.history : [];
  task.history.push({ at: task.updatedAt, by, from, to, note: note || `Statut : ${from} → ${to}` });
  save(paths, data);
  writeTaskRecord(paths, task);
  return { ok: true, id, from, to };
}

/**
 * Stable signature of an executable orchestrator action, used to detect when a
 * proposal is already mirrored as an open task (avoid duplicate tray entries) and to
 * find the mirror task when the same action is launched from the chat.
 */
export function actionSignature(action) {
  if (!action || typeof action !== "object") return "";
  return [
    String(action.type || "").trim(),
    String(action.phaseId || "").trim(),
    String(action.agent || "").trim(),
    String(action.label || "").trim().toLowerCase()
  ].join("|");
}

/**
 * When an orchestrator action is launched from the CHAT, flip its mirror task(s) in the
 * tray to in-progress (assigned to the run) so the same step isn't left sitting as "todo".
 */
export function markActionTaskLaunched(paths, action, runId, by) {
  const sig = actionSignature(action);
  if (!sig) return { updated: 0 };
  const data = load(paths);
  let n = 0;
  const now = new Date().toISOString();
  for (const t of data.tasks) {
    if (t.action && actionSignature(t.action) === sig && OPEN_TASK_STATUSES.includes(t.status)) {
      if (runId) t.runId = runId;
      if (t.status !== "in-progress") {
        t.history = Array.isArray(t.history) ? t.history : [];
        t.history.push({ at: now, by: by || "—", from: t.status, to: "in-progress", note: "Lancée depuis l'orchestrateur." });
        t.status = "in-progress";
      }
      t.updatedAt = now;
      writeTaskRecord(paths, t);
      n += 1;
    }
  }
  if (n) save(paths, data);
  return { updated: n };
}

/** Bulk-set a status on many tasks (used when a batch run starts / a run is assigned). */
export function assignTasksToRun(paths, ids, runId, by) {
  const set = new Set((ids || []).map((x) => String(x)));
  const data = load(paths);
  let n = 0;
  const now = new Date().toISOString();
  for (const t of data.tasks) {
    if (set.has(t.id) && OPEN_TASK_STATUSES.includes(t.status)) {
      t.runId = runId || t.runId;
      if (t.status !== "in-progress") {
        t.history = Array.isArray(t.history) ? t.history : [];
        t.history.push({ at: now, by: by || "—", from: t.status, to: "in-progress", note: "Prise en charge par un agent." });
        t.status = "in-progress";
      }
      t.updatedAt = now;
      n += 1;
    }
  }
  if (n) save(paths, data);
  return { assigned: n };
}

/**
 * Convergence primitive: when a phase's gate passes, close out every still-live task
 * scoped to that phase (candidates, todo, in-progress) — a finished phase must not keep
 * dragging a backlog. Risks live in the risk register, not here. Returns { closed }.
 */
export function closePhaseTasks(paths, phaseId, { by, gateStatus } = {}) {
  const pid = String(phaseId || "").trim();
  if (!pid) return { closed: 0 };
  const data = load(paths);
  let n = 0;
  const now = new Date().toISOString();
  for (const t of data.tasks) {
    if (t.phaseId === pid && LIVE_TASK_STATUSES.includes(t.status)) {
      const from = t.status;
      t.status = "cancelled";
      t.updatedAt = now;
      t.history = Array.isArray(t.history) ? t.history : [];
      t.history.push({ at: now, by: by || "orchestrateur", from, to: "cancelled", note: `Étape close — gate ${pid} ${gateStatus || "passé"}.` });
      writeTaskRecord(paths, t);
      n += 1;
    }
  }
  if (n) save(paths, data);
  return { closed: n };
}

/**
 * Bulk-ingest tasks produced/updated by an AI agent (agent-io/tasks.json).
 * Known id → update (status/description); unknown or missing id → create a new task.
 */
export function ingestTaskItems(paths, items, meta = {}) {
  if (!Array.isArray(items) || items.length === 0) return { created: 0, updated: 0 };
  const data = load(paths);
  let created = 0;
  let updated = 0;
  for (const raw of items) {
    if (!raw || !String(raw.title || raw.id || "").trim()) continue;
    const rawId = String(raw.id || "").trim();
    const existing = rawId ? data.tasks.find((t) => t.id === rawId) : null;
    if (existing) {
      const to = raw.status ? normStatus(raw.status) : existing.status;
      const by = String(meta.raisedBy || raw.raisedBy || "").trim() || "—";
      if (typeof raw.description === "string" && raw.description.trim()) existing.description = raw.description.trim();
      if (to !== existing.status) {
        const from = existing.status;
        existing.status = to;
        existing.updatedAt = new Date().toISOString();
        existing.history = Array.isArray(existing.history) ? existing.history : [];
        existing.history.push({ at: existing.updatedAt, by, from, to, note: String(raw.note || `Mis à jour par ${by}`).trim() });
        updated += 1;
      }
      writeTaskRecord(paths, existing);
      continue;
    }
    // A next-step an agent handed off during its run lands as a CANDIDATE (`proposed`),
    // not a live "todo" — so it goes through triage instead of flooding the tray. An agent
    // that creates-and-completes in one go (status "done") keeps that.
    const asProposed = Boolean(meta.asProposed) && normStatus(raw.status) !== "done";
    const { task, seq } = buildTask(data, {
      ...raw,
      status: asProposed ? "proposed" : raw.status,
      asProposed,
      raisedBy: raw.raisedBy || meta.raisedBy || "",
      phaseId: raw.phaseId || meta.phaseId || ""
    });
    data.tasks.push(task);
    data.taskSeq = seq;
    writeTaskRecord(paths, task);
    created += 1;
  }
  save(paths, data);
  return { created, updated };
}

const STATUS_LABEL = { proposed: "Proposée", todo: "À faire", "in-progress": "En cours", done: "Faite", cancelled: "Annulée" };

function writeTaskRecord(paths, task) {
  const dir = paths.tasksDir;
  fs.mkdirSync(dir, { recursive: true });
  const profile = PROFILE_BY_ID[task.targetProfile];
  const file = path.join(dir, `${task.id}-${slug(task.title)}.md`);
  const lines = [
    `# ${task.id} : ${task.title}`,
    "",
    `**Statut**: ${STATUS_LABEL[task.status] || task.status}`,
    `**Pour le profil**: ${profile ? profile.label : task.targetProfile}`,
    task.raisedBy ? `**Demandé par**: ${task.raisedBy}` : null,
    task.phaseId ? `**Étape**: ${task.phaseId}` : null,
    `**Priorité**: ${task.priority}`,
    `**Créée le**: ${task.createdAt}`,
    `**Mise à jour le**: ${task.updatedAt}`,
    "",
    "## Description",
    "",
    task.description || "—",
    ""
  ];
  if (task.links && task.links.length) {
    lines.push("## Liens", "");
    for (const l of task.links) lines.push(`- ${l}`);
    lines.push("");
  }
  lines.push("## Historique", "");
  for (const h of task.history || []) {
    const transition = h.from ? `${STATUS_LABEL[h.from] || h.from} → ${STATUS_LABEL[h.to] || h.to}` : STATUS_LABEL[h.to] || h.to;
    lines.push(`- ${h.at} — **${transition}** (${h.by})${h.note ? ` : ${h.note}` : ""}`);
  }
  lines.push("");
  fs.writeFileSync(file, lines.filter((l) => l !== null).join("\n"), "utf8");
}
