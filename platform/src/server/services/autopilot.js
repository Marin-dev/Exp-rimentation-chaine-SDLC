import fs from "node:fs";
import path from "node:path";
import { loadConfig, saveConfig } from "../config/store.js";
import { createWorkspacePaths } from "../config/paths.js";
import { startRun, listRuns, getRun } from "./runs.js";
import { listGroups } from "./group-runner.js";
import { getSpend } from "./spend-store.js";
import { listDecisions, getDecision, answerDecision } from "./decisions-store.js";
import { resolveViaAgent, resumeRaisingRun } from "./resolve-via-agent.js";
import {
  executeOrchestratorAction,
  ingestOrchestratorActionsAsTasks,
  applyOrchestratorTaskOps
} from "./orchestrator-actions.js";
import { markActionTaskLaunched, actionSignature } from "./tasks-store.js";
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
      request: session.request,
      startedAt: session.startedAt,
      status: session.status,
      iterations: session.iterations,
      baselineSpend: session.baselineSpend,
      delegated: [...session.delegated],
      launched: session.launched.slice(-40),
      launchedSignatures: [...session.launchedSignatures],
      notedDoneRunIds: [...session.notedDoneRunIds],
      escalations: session.escalations,
      emptyPlans: session.emptyPlans,
      doneSummary: session.doneSummary || null,
      result: session.result || null,
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

/** Count files an agent wrote, parsed from its run log ("Écriture · <path>" lines). */
function filesWrittenInRun(run) {
  const log = run && run.log ? run.log : "";
  const set = new Set();
  const re = /(?:Écriture|Modification) · ([^\n]+)/g;
  let m;
  while ((m = re.exec(log))) set.add(m[1].trim());
  return set.size;
}

/** Report completion of launched agents once they finish, with a short outcome. */
function noteFinishedRuns() {
  if (!session) return;
  for (const l of session.launched) {
    if (!l.runId || session.notedDoneRunIds.has(l.runId)) continue;
    const run = getRun(l.runId);
    if (!run || run.status === "running") continue; // group ids or still-running: skip for now
    session.notedDoneRunIds.add(l.runId);
    const who = l.agent || "L'agent";
    if (run.status === "done") {
      const n = filesWrittenInRun(run);
      note(`✓ ${who} a terminé : ${l.label}${n ? ` — ${n} fichier(s) écrit(s)/modifié(s)` : ""}.`);
    } else {
      note(`✗ ${who} n'a pas abouti : ${l.label} (${run.status}).`);
    }
  }
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
 * Read the orchestrator's turn output: launch every autonomously-allowed action it proposed
 * and surface whether it declared the demand DONE (with its final report). Runs inside the
 * planning run's onDone (synchronous), so no tick can interleave. Returns
 * { launched, done, summary }.
 */
function consumePlanOutput(config, paths) {
  const raw = readTextSafe(paths.orchestratorActionsFile);
  try { fs.rmSync(paths.orchestratorActionsFile, { force: true }); } catch {}
  if (!raw) return { launched: 0, done: false, summary: "" };
  let parsed = {};
  try { parsed = JSON.parse(raw); } catch { return { launched: 0, done: false, summary: "" }; }
  const actions = Array.isArray(parsed) ? parsed : Array.isArray(parsed.actions) ? parsed.actions : [];
  const done = Boolean(parsed && !Array.isArray(parsed) && parsed.done);
  const summary = String((parsed && !Array.isArray(parsed) && parsed.summary) || "").trim();
  let launched = 0;
  for (const action of actions) {
    const type = String(action?.type || "").trim();
    if (!AUTONOMOUS_ACTIONS.has(type)) {
      note(`Action « ${type} » ignorée (hors périmètre auto — reste manuelle).`);
      continue;
    }
    // Backstop de-dup: never launch the exact same action twice in one session.
    const sig = actionSignature(action);
    if (sig && session && session.launchedSignatures.has(sig)) {
      note(`Ignoré (déjà lancé dans cette session) : ${action.label || type}.`);
      continue;
    }
    const result = executeOrchestratorAction(config, paths, action);
    if (result.ok) {
      launched += 1;
      const agent = String(action.agent || "").trim();
      const instr = String(action.instruction || action.rationale || "").replace(/\s+/g, " ").trim();
      if (session) {
        if (sig) session.launchedSignatures.add(sig);
        session.launched.push({
          at: now(),
          label: result.label || action.label || type,
          agent: agent || null,
          phaseId: action.phaseId || null,
          runId: result.runId || result.groupId || null
        });
      }
      try { markActionTaskLaunched(paths, action, result.runId || result.groupId || null, "@orchestrateur"); } catch {}
      // Rich, legible note: which agent, which phase, and what it was asked to do.
      const who = agent ? `${agent}` : "un agent";
      const where = action.phaseId ? ` [${action.phaseId}]` : "";
      note(`▶ ${who}${where} lancé : ${result.label || action.label || type}${instr ? ` — ${instr.slice(0, 160)}` : ""}`);
    } else {
      note(`Échec du lancement « ${action.label || type} » : ${result.error}`);
    }
  }
  return { launched, done, summary };
}

/** One orchestrator planning turn toward the demand: propose a bounded batch, then auto-launch it. */
function planTurn(config, paths, snapshot) {
  try { fs.rmSync(paths.orchestratorActionsFile, { force: true }); } catch {}
  note("Analyse de la demande et planification du prochain lot…");
  startRun(config, {
    label: "Copilote · Planification",
    kind: "chat",
    phaseId: null,
    agent: "@orchestrateur",
    prompt: buildAutopilotPlanPrompt({
      request: session ? session.request : "",
      snapshot,
      actionsFileRel: "livrables/_governance/agent-io/orchestrator-actions.json",
      alreadyDone: session ? session.launched.map((l) => `${l.label}${l.agent ? ` (${l.agent}${l.phaseId ? `, ${l.phaseId}` : ""})` : ""}`) : []
    }),
    cwd: paths.workspaceRoot,
    onDone: () => {
      // Same coordination side-effects as the interactive chat: proposals become tracked
      // tasks and candidate triage is applied — THEN we auto-launch the batch.
      ingestOrchestratorActionsAsTasks(paths, { raisedBy: "@orchestrateur" });
      applyOrchestratorTaskOps(paths);
      const out = consumePlanOutput(config, paths);
      if (!session) return;
      // The demand is finished only when the orchestrator says so AND it launched nothing
      // this turn (no work still pending). Otherwise let the launched batch run first.
      if (out.done && out.launched === 0) {
        session.doneSummary = out.summary || "Demande accomplie.";
      } else {
        session.doneSummary = null;
      }
      session.emptyPlans = out.launched > 0 ? 0 : session.emptyPlans + 1;
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

  // Idle now: report the completion of any launched agent we haven't noted yet, so the
  // journal shows "✓ terminé" (and files produced) — not just "lancé".
  noteFinishedRuns();

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

  // 4. Nothing pending. Did the orchestrator declare the demand accomplished?
  if (session.doneSummary) {
    session.result = session.doneSummary;
    finish("done", session.doneSummary);
    return;
  }
  // Stuck: it proposes nothing and doesn't declare the demand done — ask the human.
  if (session.emptyPlans >= MAX_EMPTY_PLANS) {
    finish(
      "stuck",
      "L'orchestrateur ne parvient plus à faire avancer la demande sans intervention. Précise ou reformule ta demande."
    );
    return;
  }
  // Otherwise: plan the next batch toward the demand (gates are context, not the objective).
  const snap = await buildOrchestratorSnapshot(config, paths, { contextOnly: true });
  session.iterations += 1;
  planTurn(config, paths, snap.text);
  persist();
  schedule(TICK_MS);
}

function startSession(request, baselineSpend, restored) {
  session = {
    request: (restored && restored.request) || request || "",
    startedAt: (restored && restored.startedAt) || now(),
    status: "running",
    iterations: (restored && restored.iterations) || 0,
    baselineSpend: restored && typeof restored.baselineSpend === "number" ? restored.baselineSpend : baselineSpend,
    spentUsd: 0,
    delegated: new Set(restored && Array.isArray(restored.delegated) ? restored.delegated : []),
    launched: (restored && Array.isArray(restored.launched) ? restored.launched : []),
    launchedSignatures: new Set(restored && Array.isArray(restored.launchedSignatures) ? restored.launchedSignatures : []),
    notedDoneRunIds: new Set(restored && Array.isArray(restored.notedDoneRunIds) ? restored.notedDoneRunIds : []),
    escalations: (restored && restored.escalations) || [],
    emptyPlans: (restored && restored.emptyPlans) || 0,
    doneSummary: (restored && restored.doneSummary) || null,
    result: (restored && restored.result) || null,
    activity: (restored && restored.activity) || [],
    lastError: null,
    stopReason: null,
    stopMessage: null,
    endedAt: null
  };
}

/**
 * Start a COPILOT run: the human hands ONE demand and the orchestrator carries it out
 * end to end. Requires a non-empty request — without a demand there's nothing to drive.
 */
export function startAutopilot(request) {
  const demand = String(request || "").trim();
  if (!demand) return { ok: false, error: "Précise ce que tu veux que l'orchestrateur fasse." };
  const config = loadConfig();
  const paths = createWorkspacePaths(config.workspaceRoot);
  saveConfig({ autopilot: { ...(config.autopilot || {}), enabled: true } });
  startSession(demand, safeSpend(paths, config.pricing));
  note(`Demande reçue : « ${demand} ». L'orchestrateur s'en occupe.`);
  schedule(1200);
  return { ok: true, ...getAutopilotStatus() };
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
  // The agent currently working (if any) — lets the UI show its live console.
  const running = listRuns().filter((r) => r.status === "running");
  const cur = running[0] || null;
  const currentRun = cur ? { id: cur.id, label: cur.label, agent: cur.agent, kind: cur.kind, phaseId: cur.phaseId } : null;
  return {
    enabled: Boolean(ap.enabled),
    settings: {
      maxConcurrent: ap.maxConcurrent ?? 1,
      maxIterations: ap.maxIterations ?? 30,
      budgetUsd: ap.budgetUsd ?? 0,
      escalation: ap.escalation || "expert-blocked"
    },
    currentRun,
    session: session
      ? {
          request: session.request || "",
          status: session.status,
          iterations: session.iterations,
          spentUsd: session.spentUsd || 0,
          escalations: session.escalations || [],
          launched: (session.launched || []).slice(-12),
          result: session.result || null,
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
  // No demand to drive (or the run had already finished) → nothing to resume; clear the flag.
  if (!restored || !String(restored.request || "").trim() || restored.status === "stopped") {
    try { saveConfig({ autopilot: { ...(config.autopilot || {}), enabled: false } }); } catch {}
    return { resumed: false };
  }
  startSession(restored.request, safeSpend(paths, config.pricing), restored);
  // A session that had paused for the human stays paused until they answer.
  if (restored.status === "waiting-human" && (restored.escalations || []).length) {
    session.status = "waiting-human";
    clearTimer();
    return { resumed: true, waiting: true };
  }
  note("Reprise de la demande en cours après redémarrage du serveur.");
  schedule(2000);
  return { resumed: true, waiting: false };
}
