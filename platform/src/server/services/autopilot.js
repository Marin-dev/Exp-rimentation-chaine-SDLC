import fs from "node:fs";
import path from "node:path";
import { loadConfig, saveConfig } from "../config/store.js";
import { createWorkspacePaths } from "../config/paths.js";
import { startRun, listRuns } from "./runs.js";
import { listGroups } from "./group-runner.js";
import { getSpend } from "./spend-store.js";
import { listDecisions, getDecision, answerDecision } from "./decisions-store.js";
import { resolveViaAgent, resumeRaisingRun } from "./resolve-via-agent.js";
import {
  executeOrchestratorAction,
  ingestOrchestratorActionsAsTasks,
  applyOrchestratorTaskOps
} from "./orchestrator-actions.js";
import { markActionTaskLaunched } from "./tasks-store.js";
import { buildOrchestratorSnapshot } from "./orchestrator-snapshot.js";
import { buildAutopilotPlanPrompt } from "./run-prompts.js";
import { readTextSafe } from "./fs-utils.js";

/**
 * Autopilot conductor ("gestion automatique").
 *
 * When enabled, this drives the SAME machinery the human drives by hand — it just
 * removes the clicks. On a timer tick it:
 *   1. respects the budget / iteration guard rails and bounded concurrency;
 *   2. delegates every pending decision to its domain-expert agent (resolveViaAgent),
 *      pausing to ask the HUMAN only when the expert is itself blocked;
 *   3. runs one orchestrator planning turn and auto-launches the bounded batch it proposes
 *      (production / review / remediation / dev — never external, hard-to-reverse actions);
 *   4. stops when the chain converges (all gates PASS) or a guard rail trips.
 *
 * It never opens a private execution path: every launch routes through
 * executeOrchestratorAction, exactly like the phase-screen buttons.
 */

// Only these action types may run autonomously. External, hard-to-reverse actions
// (git push, GitHub publish, launching the built product) have their own endpoints and
// are deliberately NOT in this vocabulary — they always stay on manual confirmation.
const AUTONOMOUS_ACTIONS = new Set([
  "launch_dev",
  "launch_phase",
  "launch_review",
  "remediate",
  "launch_dev_batches",
  "seed_risks"
]);

const TICK_MS = 6000;
// After this many consecutive planning turns that launch NOTHING (orchestrator has no move)
// while the objective still isn't met, stop and ask the human — we're stuck, not converging.
const MAX_EMPTY_PLANS = 2;

let session = null; // null = off. Otherwise the live session object (see startSession()).
let timer = null;

function now() {
  return new Date().toISOString();
}

function note(msg) {
  if (!session) return;
  session.activity.push({ at: now(), msg: String(msg || "").slice(0, 240) });
  if (session.activity.length > 200) session.activity = session.activity.slice(-200);
  persist();
}

function safeSpend(paths, pricing) {
  try {
    return getSpend(paths, pricing).summary.totalCost || 0;
  } catch {
    return 0;
  }
}

function persist() {
  if (!session) return;
  try {
    const config = loadConfig();
    const paths = createWorkspacePaths(config.workspaceRoot);
    fs.mkdirSync(path.dirname(paths.autopilotStateFile), { recursive: true });
    const snapshot = {
      startedAt: session.startedAt,
      status: session.status,
      iterations: session.iterations,
      baselineSpend: session.baselineSpend,
      delegated: [...session.delegated],
      escalations: session.escalations,
      emptyPlans: session.emptyPlans,
      stopReason: session.stopReason,
      stopMessage: session.stopMessage,
      lastError: session.lastError,
      activity: session.activity.slice(-60),
      endedAt: session.endedAt || null
    };
    fs.writeFileSync(paths.autopilotStateFile, JSON.stringify(snapshot, null, 2), "utf8");
  } catch {}
}

function clearTimer() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function schedule(ms) {
  clearTimer();
  if (!session || session.status !== "running") return;
  timer = setTimeout(() => {
    tick().catch((e) => {
      if (session) {
        session.lastError = e.message;
        note(`Erreur pendant un tour : ${e.message}`);
      }
      schedule(TICK_MS);
    });
  }, ms == null ? TICK_MS : ms);
}

/** All agent activity settled — no run and no parallel group is in flight. */
function isIdle() {
  const runningRuns = listRuns().filter((r) => r.status === "running").length;
  const runningGroups = listGroups().filter((g) => g.status === "running").length;
  return runningRuns === 0 && runningGroups === 0;
}

function runningCount() {
  return (
    listRuns().filter((r) => r.status === "running").length +
    listGroups().filter((g) => g.status === "running").length
  );
}

/** Terminal stop (budget / iterations / convergence / stuck / manual). Turns the flag off. */
function finish(reason, message) {
  if (!session) return;
  session.status = "stopped";
  session.stopReason = reason;
  session.stopMessage = message;
  session.endedAt = now();
  clearTimer();
  try {
    const config = loadConfig();
    saveConfig({ autopilot: { ...(config.autopilot || {}), enabled: false } });
  } catch {}
  note(`Autopilote arrêté (${reason}) : ${message}`);
}

/** Non-terminal pause: the expert is blocked, so the human is asked. Autopilot resumes on answer. */
function pauseForHuman(escalations) {
  if (!session) return;
  session.status = "waiting-human";
  session.escalations = escalations;
  session.waitingSince = now();
  clearTimer();
  note(`En attente de ta réponse (${escalations.length}) — l'agent expert n'a pas pu trancher seul.`);
}

/** Compact view of a decision surfaced to the human as an escalation card. */
function escalationView(d) {
  return {
    id: d.id,
    type: d.type,
    title: d.title,
    summary: d.summary || d.context || "",
    context: d.context || "",
    phaseId: d.phaseId || null,
    targetProfile: d.targetProfile,
    targetProfileLabel: d.targetProfileLabel || d.targetProfile,
    raisedBy: d.raisedBy || "",
    severity: d.severity || "normal",
    options: Array.isArray(d.options) ? d.options : []
  };
}

/** Heuristic: is this a structural / hard-to-reverse choice (for the "structural" escalation mode)? */
function isStructural(d) {
  if (String(d.severity) === "high") return true;
  const hay = `${d.title} ${d.summary || ""} ${d.context || ""}`.toLowerCase();
  return /archi|périmètre|perimetre|budget|irrévers|irrevers|sécur|secur|migration|contrat|licen/.test(hay);
}

/**
 * Launch every autonomously-allowed action the orchestrator just proposed. Runs inside the
 * planning run's onDone (synchronous), so no tick can interleave. Returns the launched count.
 */
function executeProposedActions(config, paths) {
  const raw = readTextSafe(paths.orchestratorActionsFile);
  try { fs.rmSync(paths.orchestratorActionsFile, { force: true }); } catch {}
  if (!raw) return 0;
  let actions = [];
  try {
    const parsed = JSON.parse(raw);
    actions = Array.isArray(parsed) ? parsed : Array.isArray(parsed.actions) ? parsed.actions : [];
  } catch {
    return 0;
  }
  let launched = 0;
  for (const action of actions) {
    const type = String(action?.type || "").trim();
    if (!AUTONOMOUS_ACTIONS.has(type)) {
      note(`Action « ${type} » ignorée (hors périmètre auto — reste manuelle).`);
      continue;
    }
    const result = executeOrchestratorAction(config, paths, action);
    if (result.ok) {
      launched += 1;
      try { markActionTaskLaunched(paths, action, result.runId || result.groupId || null, "@orchestrateur"); } catch {}
      note(`Lancé automatiquement : ${result.label || action.label || type}.`);
    } else {
      note(`Échec du lancement « ${action.label || type} » : ${result.error}`);
    }
  }
  return launched;
}

/** One orchestrator planning turn: propose a bounded batch, then auto-launch it. */
function planTurn(config, paths, snapshot) {
  try { fs.rmSync(paths.orchestratorActionsFile, { force: true }); } catch {}
  note("Planification du prochain lot…");
  startRun(config, {
    label: "Autopilote · Planification",
    kind: "chat",
    phaseId: null,
    agent: "@orchestrateur",
    prompt: buildAutopilotPlanPrompt({
      snapshot,
      actionsFileRel: "livrables/_governance/agent-io/orchestrator-actions.json"
    }),
    cwd: paths.workspaceRoot,
    onDone: () => {
      // Same coordination side-effects as the interactive chat: proposals become tracked
      // tasks and candidate triage is applied — THEN we auto-launch the batch.
      ingestOrchestratorActionsAsTasks(paths, { raisedBy: "@orchestrateur" });
      applyOrchestratorTaskOps(paths);
      const launched = executeProposedActions(config, paths);
      if (!session) return;
      session.emptyPlans = launched > 0 ? 0 : session.emptyPlans + 1;
      persist();
    }
  });
}

/** The core state machine — one pass. Never blocks; each pass either acts or waits. */
async function tick() {
  if (!session || session.status !== "running") return;
  const config = loadConfig();
  const ap = config.autopilot || {};
  if (!ap.enabled) {
    finish("manual", "Le mode a été désactivé.");
    return;
  }
  const paths = createWorkspacePaths(config.workspaceRoot);

  // 1. Guard rails.
  const spent = Math.max(0, safeSpend(paths, config.pricing) - session.baselineSpend);
  session.spentUsd = spent;
  if (ap.budgetUsd && spent >= ap.budgetUsd) {
    finish("budget", `Plafond de dépense atteint (${spent.toFixed(2)} $ sur ${ap.budgetUsd} $).`);
    return;
  }
  if (ap.maxIterations && session.iterations >= ap.maxIterations) {
    finish("iterations", `Nombre maximum de tours atteint (${ap.maxIterations}).`);
    return;
  }

  // 2. Bounded concurrency: let in-flight work finish before doing anything new.
  if (runningCount() >= Math.max(1, ap.maxConcurrent || 1) || !isIdle()) {
    schedule(TICK_MS);
    return;
  }

  // 3. Pending decisions → delegate to the expert; escalate to the human only if the
  //    expert couldn't decide (a decision still pending AFTER its resolver has run).
  const pending = listDecisions(paths).filter((d) => d.status === "pending");
  const mode = ap.escalation || "expert-blocked";
  const fresh = pending.filter((d) => !session.delegated.has(d.id));

  if (fresh.length) {
    let started = 0;
    const straightToHuman = [];
    for (const d of fresh) {
      session.delegated.add(d.id); // handled once — never re-delegated in a loop
      if (mode === "always-delegate" || mode === "expert-blocked" || (mode === "structural" && !isStructural(d))) {
        const r = resolveViaAgent(config, paths, { id: d.id, mode: "delegate" });
        if (r.ok) {
          started += 1;
          note(`Décision ${d.id} « ${d.title} » déléguée à ${r.targetAgent}.`);
        } else {
          straightToHuman.push(escalationView(d));
        }
      } else {
        // structural mode: this choice is structural → the human decides.
        straightToHuman.push(escalationView(d));
      }
    }
    if (started) {
      session.iterations += 1;
      persist();
      schedule(TICK_MS);
      return;
    }
    if (straightToHuman.length) {
      pauseForHuman(straightToHuman);
      return;
    }
  }

  // Idle + all fresh handled: any decision STILL pending was delegated but the expert
  // couldn't resolve it (or "always-delegate" left it) → ask the human.
  const stillPending = pending.filter((d) => session.delegated.has(d.id));
  if (stillPending.length) {
    pauseForHuman(stillPending.map(escalationView));
    return;
  }

  // 4. Nothing pending. Are we done, stuck, or is there a next batch to plan?
  const snap = await buildOrchestratorSnapshot(config, paths);
  if (snap.converged) {
    finish("converged", "Tous les gates sont passés — la chaîne a convergé.");
    return;
  }
  if (session.emptyPlans >= MAX_EMPTY_PLANS) {
    finish(
      "stuck",
      "L'orchestrateur ne propose plus d'action mais l'objectif n'est pas atteint — une intervention humaine est nécessaire."
    );
    return;
  }
  session.iterations += 1;
  planTurn(config, paths, snap.text);
  persist();
  schedule(TICK_MS);
}

function startSession(baselineSpend, restored) {
  session = {
    startedAt: (restored && restored.startedAt) || now(),
    status: "running",
    iterations: (restored && restored.iterations) || 0,
    baselineSpend: restored && typeof restored.baselineSpend === "number" ? restored.baselineSpend : baselineSpend,
    spentUsd: 0,
    delegated: new Set(restored && Array.isArray(restored.delegated) ? restored.delegated : []),
    escalations: (restored && restored.escalations) || [],
    emptyPlans: (restored && restored.emptyPlans) || 0,
    activity: (restored && restored.activity) || [],
    lastError: null,
    stopReason: null,
    stopMessage: null,
    endedAt: null
  };
}

/** Turn autopilot ON and kick the loop. */
export function startAutopilot() {
  const config = loadConfig();
  const paths = createWorkspacePaths(config.workspaceRoot);
  saveConfig({ autopilot: { ...(config.autopilot || {}), enabled: true } });
  startSession(safeSpend(paths, config.pricing));
  note("Gestion automatique activée — l'orchestrateur prend le pilotage.");
  schedule(1200);
  return getAutopilotStatus();
}

/** Turn autopilot OFF. In-flight runs finish on their own; no new work is started. */
export function stopAutopilot() {
  const config = loadConfig();
  saveConfig({ autopilot: { ...(config.autopilot || {}), enabled: false } });
  if (session && session.status !== "stopped") {
    session.status = "stopped";
    session.stopReason = "manual";
    session.stopMessage = "Arrêt manuel.";
    session.endedAt = now();
    note("Gestion automatique désactivée par l'utilisateur.");
  }
  clearTimer();
  return getAutopilotStatus();
}

/**
 * The human answers an escalation surfaced by the conductor. We record the answer, resume
 * the agent that was blocked, and — once no escalation remains — resume the loop. This is the
 * "it asks, you answer, it continues" flow, driven from the Orchestrator screen.
 */
export function answerEscalation(input) {
  const config = loadConfig();
  const paths = createWorkspacePaths(config.workspaceRoot);
  const id = String(input?.id || "").trim();
  const decision = getDecision(paths, id);
  const result = answerDecision(paths, { ...input, id });
  if (!result.ok) return result;

  // Resume the agent that raised this question, now that all its questions are answered.
  if (result.runFullyAnswered && result.runId) {
    try {
      resumeRaisingRun(config, paths, result.runId, decision ? decision.phaseId || null : null);
    } catch {}
  }

  if (session) {
    session.escalations = (session.escalations || []).filter((e) => e.id !== id);
    note(`Réponse enregistrée pour ${id}.`);
    if (session.status === "waiting-human" && session.escalations.length === 0) {
      session.status = "running";
      note("Reprise de la gestion automatique.");
      schedule(1500);
    } else {
      persist();
    }
  }
  return { ok: true, id, runFullyAnswered: result.runFullyAnswered, resumed: Boolean(result.runFullyAnswered && result.runId) };
}

/** Full status for the UI (polled by the Orchestrator screen). */
export function getAutopilotStatus() {
  const config = loadConfig();
  const ap = config.autopilot || {};
  return {
    enabled: Boolean(ap.enabled),
    settings: {
      maxConcurrent: ap.maxConcurrent ?? 1,
      maxIterations: ap.maxIterations ?? 30,
      budgetUsd: ap.budgetUsd ?? 0,
      escalation: ap.escalation || "expert-blocked"
    },
    session: session
      ? {
          status: session.status,
          iterations: session.iterations,
          spentUsd: session.spentUsd || 0,
          escalations: session.escalations || [],
          stopReason: session.stopReason || null,
          stopMessage: session.stopMessage || null,
          lastError: session.lastError || null,
          startedAt: session.startedAt,
          activity: (session.activity || []).slice(-40)
        }
      : null
  };
}

/**
 * On server startup, resume autopilot if it was left enabled (the flag survives a restart).
 * The conductor is stateless between ticks beyond its persisted snapshot, so it simply picks
 * the driving back up from the current on-disk project state.
 */
export function resumeAutopilotOnBoot() {
  const config = loadConfig();
  if (!config.autopilot || !config.autopilot.enabled) return { resumed: false };
  const paths = createWorkspacePaths(config.workspaceRoot);
  let restored = null;
  const raw = readTextSafe(paths.autopilotStateFile);
  if (raw) { try { restored = JSON.parse(raw); } catch {} }
  // A session that had paused for the human stays paused until they answer.
  const wasWaiting = restored && restored.status === "waiting-human" && (restored.escalations || []).length;
  startSession(safeSpend(paths, config.pricing), restored);
  if (wasWaiting) {
    session.status = "waiting-human";
    clearTimer();
    return { resumed: true, waiting: true };
  }
  note("Reprise de la gestion automatique après redémarrage du serveur.");
  schedule(2000);
  return { resumed: true, waiting: false };
}
