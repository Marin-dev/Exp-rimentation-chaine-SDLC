import fs from "node:fs";
import path from "node:path";
import { startRun } from "./runs.js";
import { startPhaseGroup } from "./group-runner.js";
import { buildDevBatches } from "./dev-batches.js";
import { buildRiskSeedPrompt, buildDirectedAgentPrompt, libraryPolicyText } from "./run-prompts.js";
import { launchPhase, launchReview, launchRemediation, launchAcceptanceTests } from "./phase-runs.js";
import { startVerification } from "./verification.js";
import { readTextSafe } from "./fs-utils.js";
import { createTask, listTasks, getTask, updateTaskStatus, actionSignature, OPEN_TASK_STATUSES } from "./tasks-store.js";
import { PHASE_BY_ID, PRODUCERS, REVIEWERS } from "../domain/phases.js";
import { PROFILE_BY_ID } from "../domain/profiles.js";

/**
 * Execute an action the orchestrator PROPOSED and the human CONFIRMED (or the autopilot
 * launched).
 * Every action routes through the same run/group machinery the phase-screen
 * buttons use — the orchestrator never gets a private, unaudited execution path.
 * Returns { ok, runId?, groupId?, label?, error? }.
 */
export function executeOrchestratorAction(config, paths, action) {
  const type = String(action?.type || "").trim();
  const phaseId = String(action?.phaseId || "").trim();
  const phase = phaseId ? PHASE_BY_ID[phaseId] : null;
  const label = String(action?.label || "").trim();

  switch (type) {
    case "launch_dev": {
      const agent = String(action.agent || "@developpeur").trim() || "@developpeur";
      const instruction = String(action.instruction || "").trim();
      if (!instruction) return { ok: false, error: "Action launch_dev sans instruction." };
      const pid = phase ? phaseId : "G5";
      // The default agent-io names in the prompt are rewritten to this run's own files by
      // the run engine, and ingested by the run hooks — also after a server restart.
      const runId = startRun(config, {
        label: label || `${agent} · ${pid}`,
        kind: "orchestrated",
        phaseId: pid,
        agent,
        prompt: buildDirectedAgentPrompt({ agent, instruction, phaseId: pid }) + libraryPolicyText(config),
        cwd: paths.workspaceRoot
      });
      return { ok: true, runId, label: label || `${agent} · ${pid}` };
    }

    case "launch_phase":
      return launchPhase(config, paths, phaseId);

    case "launch_review": {
      const r = launchReview(config, paths, phaseId);
      return r.ok ? { ...r, label: `${phaseId} · Revue` } : r;
    }

    case "remediate":
      return launchRemediation(config, paths, phaseId);

    case "launch_dev_batches": {
      const g5 = PHASE_BY_ID.G5;
      const { stages, meta } = buildDevBatches(paths);
      if (!stages.length) return { ok: false, error: "Aucune User Story à développer (toutes déjà développées ou backlog vide)." };
      const groupId = startPhaseGroup(config, paths, g5, stages);
      return { ok: true, groupId, meta, label: "G5 · Dev par batch (BC)" };
    }

    case "write_acceptance_tests":
      return launchAcceptanceTests(config, paths);

    case "run_verification": {
      const gate = phaseId === "G6" ? "G6" : "G5";
      return startVerification(config, paths, gate);
    }

    case "seed_risks": {
      const runId = startRun(config, {
        label: "Amorçage du registre des risques · @qa",
        kind: "risk-seed",
        agent: "@qa",
        prompt: buildRiskSeedPrompt() + libraryPolicyText(config),
        cwd: paths.workspaceRoot
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
    case "write_acceptance_tests":
    case "run_verification": return "qa";
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
export function ingestOrchestratorActionsAsTasks(paths, meta = {}, file) {
  const raw = readTextSafe(file || paths.orchestratorActionsFile);
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
export function applyOrchestratorTaskOps(paths, file) {
  const raw = readTextSafe(file || paths.orchestratorActionsFile);
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
