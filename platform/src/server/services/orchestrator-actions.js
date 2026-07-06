import fs from "node:fs";
import path from "node:path";
import { startRun } from "./runs.js";
import { startPhaseGroup } from "./group-runner.js";
import { buildDevBatches } from "./dev-batches.js";
import {
  buildPhasePrompt,
  buildReviewPrompt,
  buildRemediationPrompt,
  buildRiskSeedPrompt,
  buildDirectedAgentPrompt,
  libraryPolicyText
} from "./run-prompts.js";
import { ingestPendingInput, ingestResolutions, ingestRisks, ingestTasks } from "./inbox-ingest.js";
import { pendingInputsForPhase, markPhaseInputsConsidered } from "./inputs-store.js";
import { readGates } from "./gates.js";
import { readTextSafe } from "./fs-utils.js";
import { createTask, listTasks, getTask, updateTaskStatus, actionSignature, OPEN_TASK_STATUSES } from "./tasks-store.js";
import { PHASE_BY_ID, PRODUCERS, REVIEWERS } from "../domain/phases.js";
import { PROFILE_BY_ID } from "../domain/profiles.js";

/**
 * Execute an action the orchestrator PROPOSED and the human CONFIRMED.
 * Every action routes through the same run/group machinery the phase-screen
 * buttons use — the orchestrator never gets a private, unaudited execution path.
 * Returns { ok, runId?, groupId?, label?, error? }.
 */
/** Short filesystem-safe token to give each run its OWN agent-io files (no collisions). */
function ioToken(label) {
  const base = String(label || "dev")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "dev";
  return `${base}-${Date.now().toString(36)}`;
}

export function executeOrchestratorAction(config, paths, action) {
  const type = String(action?.type || "").trim();
  const phaseId = String(action?.phaseId || "").trim();
  const phase = phaseId ? PHASE_BY_ID[phaseId] : null;
  const label = String(action?.label || "").trim();
  const hasAnswers = fs.existsSync(paths.answersFile);

  switch (type) {
    case "launch_dev": {
      const agent = String(action.agent || "@developpeur").trim() || "@developpeur";
      const instruction = String(action.instruction || "").trim();
      if (!instruction) return { ok: false, error: "Action launch_dev sans instruction." };
      const pid = phase ? phaseId : "G5";
      // Per-run agent-io files so parallel launch_dev runs never overwrite each other's
      // pending questions / risks (the shared default files collide under concurrency).
      const token = ioToken(label || agent);
      const pendingRel = `livrables/_governance/agent-io/pending-input-${token}.json`;
      const pendingAbs = path.join(paths.agentIoDir, `pending-input-${token}.json`);
      const risksRel = `livrables/_governance/agent-io/risks-${token}.json`;
      const risksAbs = path.join(paths.agentIoDir, `risks-${token}.json`);
      const tasksRel = `livrables/_governance/agent-io/tasks-${token}.json`;
      const tasksAbs = path.join(paths.agentIoDir, `tasks-${token}.json`);
      const runId = startRun(config, {
        label: label || `${agent} · ${pid}`,
        kind: "orchestrated",
        phaseId: pid,
        agent,
        prompt: buildDirectedAgentPrompt({ agent, instruction, phaseId: pid, pendingFileRel: pendingRel, risksFileRel: risksRel, tasksFileRel: tasksRel }) + libraryPolicyText(config),
        cwd: paths.workspaceRoot,
        // Recorded in the active-runs registry so a reconcile after a restart ingests
        // THESE files, not the shared defaults.
        pendingFile: pendingAbs,
        risksFile: risksAbs,
        onDone: (run) => {
          ingestResolutions(paths);
          ingestRisks(paths, { runId: run.id, phaseId: pid, raisedBy: agent }, risksAbs);
          ingestTasks(paths, { runId: run.id, phaseId: pid, raisedBy: agent }, tasksAbs);
          return ingestPendingInput(paths, { runId: run.id, phaseId: pid, raisedBy: agent }, pendingAbs);
        }
      });
      return { ok: true, runId, label: label || `${agent} · ${pid}` };
    }

    case "launch_phase": {
      if (!phase || phaseId === "G0") return { ok: false, error: "Étape invalide pour un lancement." };
      const agent = PRODUCERS[phaseId] || null;
      const runId = startRun(config, {
        label: `${phase.id} · ${phase.title}`,
        kind: "phase",
        phaseId,
        agent,
        prompt: buildPhasePrompt(phase, { hasAnswers, inputs: pendingInputsForPhase(paths, phaseId) }) + libraryPolicyText(config),
        cwd: paths.workspaceRoot,
        onDone: (run) => {
          ingestResolutions(paths);
          if (run.status === "done") markPhaseInputsConsidered(paths, phaseId);
          ingestRisks(paths, { runId: run.id, phaseId, raisedBy: agent });
          return ingestPendingInput(paths, { runId: run.id, phaseId, raisedBy: agent });
        }
      });
      return { ok: true, runId, label: `${phase.id} · ${phase.title}` };
    }

    case "launch_review": {
      const reviewer = REVIEWERS[phaseId];
      if (!phase || !reviewer) return { ok: false, error: "Pas de revue définie pour cette étape." };
      const runId = startRun(config, {
        label: `${phase.id} · Revue (${reviewer})`,
        kind: "review",
        phaseId,
        agent: reviewer,
        prompt: buildReviewPrompt(phase, reviewer),
        cwd: paths.workspaceRoot,
        onDone: (run) => {
          ingestRisks(paths, { runId: run.id, phaseId, raisedBy: reviewer });
          return ingestPendingInput(paths, { runId: run.id, phaseId, raisedBy: reviewer });
        }
      });
      return { ok: true, runId, label: `${phase.id} · Revue` };
    }

    case "remediate": {
      if (!phase) return { ok: false, error: "Étape inconnue." };
      const agent = PRODUCERS[phaseId] || null;
      const gate = readGates(paths)[phaseId];
      const gateStatus = gate ? gate.status : null;
      const runId = startRun(config, {
        label: `${phase.id} · Correction des risques`,
        kind: "remediation",
        phaseId,
        agent,
        prompt: buildRemediationPrompt(phase, agent, gateStatus) + libraryPolicyText(config),
        cwd: paths.workspaceRoot,
        onDone: (run) => {
          ingestResolutions(paths);
          ingestRisks(paths, { runId: run.id, phaseId, raisedBy: agent || "Correction" });
          return ingestPendingInput(paths, { runId: run.id, phaseId, raisedBy: agent || "Correction" });
        }
      });
      return { ok: true, runId, label: `${phase.id} · Correction des risques` };
    }

    case "launch_dev_batches": {
      const g5 = PHASE_BY_ID.G5;
      const { stages, meta } = buildDevBatches(paths);
      if (!stages.length) return { ok: false, error: "Aucune User Story à développer (toutes déjà développées ou backlog vide)." };
      const groupId = startPhaseGroup(config, paths, g5, stages);
      return { ok: true, groupId, meta, label: "G5 · Dev par batch (BC)" };
    }

    case "seed_risks": {
      try { fs.rmSync(paths.risksInboxFile, { force: true }); } catch {}
      const runId = startRun(config, {
        label: "Amorçage du registre des risques · @qa",
        kind: "risk-seed",
        agent: "@qa",
        prompt: buildRiskSeedPrompt() + libraryPolicyText(config),
        cwd: paths.workspaceRoot,
        onDone: () => ingestRisks(paths, { raisedBy: "@qa" })
      });
      return { ok: true, runId, label: "Amorçage du registre des risques" };
    }

    default:
      return { ok: false, error: `Type d'action inconnu : « ${type} ».` };
  }
}

/** Resolve an @agent to its owning human profile id (null if unknown). */
function profileForAgent(agent) {
  const v = String(agent || "").trim().replace(/^@/, "");
  if (!v) return null;
  for (const [id, prof] of Object.entries(PROFILE_BY_ID)) {
    if ((prof.agents || []).some((a) => a.replace(/^@/, "") === v)) return id;
  }
  return null;
}

/** Which profile "owns" a proposed action — the one it lands on in the task tray. */
function profileForAction(action) {
  const phaseId = String(action?.phaseId || "").trim();
  switch (String(action?.type || "").trim()) {
    case "launch_dev": return profileForAgent(action.agent || "@developpeur") || "developpeur";
    case "launch_phase":
    case "remediate": return profileForAgent(PRODUCERS[phaseId]) || "orchestrateur";
    case "launch_review": return profileForAgent(REVIEWERS[phaseId]) || "qa";
    case "launch_dev_batches": return "developpeur";
    case "seed_risks": return "qa";
    default: return "orchestrateur";
  }
}

/**
 * Mirror the actions the orchestrator PROPOSED into the task register as "todo" items,
 * so every next step it hands out is also a first-class, tracked task in the tray — not
 * just an ephemeral chat button. Each task carries the exact executable action, so
 * launching it from the tray runs the very same machinery. Skips actions already mirrored
 * by an open task (dedup by signature), so re-proposing the same step doesn't pile up.
 * Returns { created }.
 */
export function ingestOrchestratorActionsAsTasks(paths, meta = {}) {
  const raw = readTextSafe(paths.orchestratorActionsFile);
  if (!raw) return { created: 0 };
  let actions = [];
  try {
    const parsed = JSON.parse(raw);
    actions = Array.isArray(parsed) ? parsed : Array.isArray(parsed.actions) ? parsed.actions : [];
  } catch {
    return { created: 0 };
  }
  if (!actions.length) return { created: 0 };

  const openSigs = new Set(
    listTasks(paths)
      .filter((t) => t.action && OPEN_TASK_STATUSES.includes(t.status))
      .map((t) => actionSignature(t.action))
  );

  let created = 0;
  for (const action of actions) {
    const type = String(action?.type || "").trim();
    if (!type) continue;
    const sig = actionSignature(action);
    if (sig && openSigs.has(sig)) continue; // already an open task in the tray
    const label = String(action.label || "").trim() || type;
    const desc = [action.rationale, action.instruction]
      .map((s) => String(s || "").trim())
      .filter(Boolean)
      .join("\n\n");
    const r = createTask(paths, {
      title: label,
      description: desc,
      targetProfile: profileForAction(action),
      raisedBy: meta.raisedBy || "@orchestrateur",
      phaseId: action.phaseId || "",
      priority: "normal",
      action
    });
    if (r.ok) {
      created += 1;
      if (sig) openSigs.add(sig);
    }
  }
  return { created };
}

/**
 * Apply the orchestrator's triage decisions on candidate (proposed) tasks:
 *   promote → the candidate becomes an actionable "todo" (part of the plan)
 *   drop    → the candidate is cancelled (off the tray)
 * Only acts on tasks that are still `proposed`, so it can never disturb work already
 * launched or done. Returns { promoted, dropped }.
 */
export function applyOrchestratorTaskOps(paths) {
  const raw = readTextSafe(paths.orchestratorActionsFile);
  if (!raw) return { promoted: 0, dropped: 0 };
  let ops = [];
  try {
    const parsed = JSON.parse(raw);
    ops = Array.isArray(parsed.taskOps) ? parsed.taskOps : [];
  } catch {
    return { promoted: 0, dropped: 0 };
  }
  let promoted = 0;
  let dropped = 0;
  for (const op of ops) {
    const id = String(op?.id || "").trim();
    const kind = String(op?.op || "").trim().toLowerCase();
    if (!id) continue;
    const task = getTask(paths, id);
    if (!task || task.status !== "proposed") continue; // only triage live candidates
    const reason = String(op?.reason || "").trim();
    if (kind === "promote") {
      updateTaskStatus(paths, { id, status: "todo", by: "@orchestrateur", note: reason || "Promue par l'orchestrateur (utile à l'objectif courant)." });
      promoted += 1;
    } else if (kind === "drop") {
      updateTaskStatus(paths, { id, status: "cancelled", by: "@orchestrateur", note: reason || "Écartée par l'orchestrateur (hors objectif courant)." });
      dropped += 1;
    }
  }
  return { promoted, dropped };
}
