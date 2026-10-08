import { startRun, listRuns } from "./runs.js";
import {
  buildPhasePrompt,
  buildReviewPrompt,
  buildRemediationPrompt,
  buildAcceptanceTestsPrompt,
  libraryPolicyText
} from "./run-prompts.js";
import { pendingInputsForPhase, markPhaseInputsConsidered } from "./inputs-store.js";
import { readGates } from "./gates.js";
import {
  EVIDENCE_GATES,
  readEvidence,
  isEvidenceFresh,
  readVerificationConfig,
  readApproval,
  startVerification
} from "./verification.js";
import { PHASE_BY_ID, PRODUCERS, REVIEWERS } from "../domain/phases.js";

/**
 * The phase-level launches shared by the phase screen, the orchestrator actions and the
 * autopilot: produce a phase, write the acceptance tests, verify, review, remediate.
 * Agent-io ingestion is generic (run hooks); only phase-specific side-effects live here.
 *
 * Chaining (carried in `post`, executed by the run hooks once a run ends cleanly and no
 * question of it is pending):
 *   G4 production / remediation ─▶ @qa acceptance tests (chainAcceptance) ─▶ G4 review
 *   other producer / remediation ─▶ review (chainReview)
 *   G5 / G6 review ─▶ preceded by the executable verification when its commands are
 *   approved and the evidence is not fresh, so the reviewer reads real results.
 * The gate is always decided by the reviewer, never by the agent that produced the work —
 * and for G5 / G6 the platform caps it with the executable evidence.
 */

/** A run of this kind is already running for this phase (avoid stacking duplicates). */
function running(kind, phaseId) {
  return listRuns().some((r) => r.status === "running" && r.kind === kind && r.phaseId === phaseId);
}

export function reviewRunning(phaseId) {
  return running("review", phaseId) || running("verification", phaseId);
}

/** What follows a producer run of this phase. */
function producerChain(phaseId) {
  if (phaseId === "G4") return { chainAcceptance: true };
  return REVIEWERS[phaseId] ? { chainReview: phaseId } : null;
}

export function launchPhase(config, paths, phaseId, { agent: agentLabel } = {}) {
  const phase = PHASE_BY_ID[phaseId];
  if (!phase || phaseId === "G0") return { ok: false, error: "Étape invalide pour un lancement." };
  const agent = agentLabel || PRODUCERS[phaseId] || null;
  const label = `${phase.id} · ${phase.title}`;
  const runId = startRun(config, {
    label,
    kind: "phase",
    phaseId,
    agent,
    prompt: buildPhasePrompt(phase, { inputs: pendingInputsForPhase(paths, phaseId) }) + libraryPolicyText(config),
    cwd: paths.workspaceRoot,
    post: producerChain(phaseId),
    onDone: (run) => {
      // Only mark inputs consumed if the agent actually completed — a failed run never read them.
      if (run.status === "done") markPhaseInputsConsidered(paths, phaseId);
    }
  });
  return { ok: true, runId, label };
}

/** Tests-first: @qa writes the executable acceptance tests of the User Stories (G4). */
export function launchAcceptanceTests(config, paths) {
  if (running("acceptance-tests", "G4")) return { ok: false, error: "L'écriture des tests d'acceptation est déjà en cours." };
  const label = "G4 · Tests d'acceptation (@qa)";
  const runId = startRun(config, {
    label,
    kind: "acceptance-tests",
    phaseId: "G4",
    agent: "@qa",
    prompt: buildAcceptanceTestsPrompt() + libraryPolicyText(config),
    cwd: paths.workspaceRoot,
    // The hooks lock the tests (sha256) when @qa is done, then the G4 review follows.
    post: { lockAcceptance: true, chainReview: "G4" }
  });
  return { ok: true, runId, label };
}

/** Verification first, when it can run and the evidence of the gate is not fresh. */
function needsVerificationFirst(paths, phaseId) {
  if (!EVIDENCE_GATES.includes(phaseId)) return false;
  const cfg = readVerificationConfig(paths);
  const approval = readApproval(paths);
  if (!cfg.ok || !approval || approval.hash !== cfg.hash) return false; // the review notes the missing evidence
  return !isEvidenceFresh(paths, phaseId, readEvidence(paths, phaseId));
}

export function launchReview(config, paths, phaseId, { afterVerification } = {}) {
  const phase = PHASE_BY_ID[phaseId];
  const reviewer = REVIEWERS[phaseId];
  if (!phase || !reviewer) return { ok: false, error: "Pas de revue définie pour cette étape." };
  if (reviewRunning(phaseId)) return { ok: false, error: "Une revue ou une vérification de cette étape est déjà en cours." };
  if (!afterVerification && needsVerificationFirst(paths, phaseId)) {
    // The review is chained by the hooks once the verification has produced the evidence.
    const v = startVerification(config, paths, phaseId, { post: { chainReview: phaseId } });
    if (v.ok) return { ok: true, runId: v.runId, label: `${phase.id} · Preuves exécutables puis revue`, verification: true };
  }
  const label = `${phase.id} · Revue (${reviewer})`;
  const runId = startRun(config, {
    label,
    kind: "review",
    phaseId,
    agent: reviewer,
    prompt: buildReviewPrompt(phase, reviewer),
    cwd: paths.workspaceRoot
  });
  return { ok: true, runId, label };
}

export function launchRemediation(config, paths, phaseId) {
  const phase = PHASE_BY_ID[phaseId];
  if (!phase) return { ok: false, error: "Étape inconnue." };
  const agent = PRODUCERS[phaseId] || null;
  const gateStatus = (readGates(paths)[phaseId] || {}).status || null;
  const label = `${phase.id} · Correction des points bloquants`;
  const runId = startRun(config, {
    label,
    kind: "remediation",
    phaseId,
    agent,
    prompt: buildRemediationPrompt(phase, agent, gateStatus) + libraryPolicyText(config),
    cwd: paths.workspaceRoot,
    post: producerChain(phaseId)
  });
  return { ok: true, runId, label };
}
