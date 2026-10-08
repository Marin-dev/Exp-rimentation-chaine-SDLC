import fs from "node:fs";
import path from "node:path";
import { startRun } from "./runs.js";
import { getDecision, answerDecision } from "./decisions-store.js";
import { buildResolutionAgentPrompt, libraryPolicyText } from "./run-prompts.js";
import { resumeRun } from "./run-resume.js";
import { readTextSafe } from "./fs-utils.js";
import { PROFILE_BY_ID } from "../domain/profiles.js";

function agentForProfile(profileId) {
  const p = PROFILE_BY_ID[profileId];
  return p && Array.isArray(p.agents) && p.agents[0] ? p.agents[0] : null;
}

/**
 * Resume the run that RAISED the item, once its answer(s) are in place — the raising
 * agent (e.g. a @developpeur lane) continues its own session with the answers.
 */
export function resumeRaisingRun(config, paths, runId, phaseId) {
  const r = resumeRun(config, paths, runId, { phaseId });
  return r.ok ? r.runId : null;
}

/**
 * Resolve a routed item by spawning the TARGET profile's agent to answer it.
 * mode "delegate": the target agent decides from scratch.
 * mode "validate": the target agent reviews/enriches the human's proposed answer.
 * The agent's answer is fed back to the raising run, which is then resumed
 * (handleResolutionDone, called by the run hooks — also after a server restart).
 */
export function resolveViaAgent(config, paths, { id, mode, humanAnswer, note }) {
  const decision = getDecision(paths, id);
  if (!decision) return { ok: false, error: "Décision introuvable." };
  if (decision.status === "answered") return { ok: false, error: "Décision déjà tranchée." };
  if (decision.humanOnly) return { ok: false, error: "Cette décision revient à un humain : elle ne peut pas être déléguée à l'IA." };
  const targetAgent = agentForProfile(decision.targetProfile);
  if (!targetAgent) return { ok: false, error: "Aucun agent associé au profil cible." };
  const resMode = mode === "validate" ? "validate" : "delegate";
  if (resMode === "validate" && !String(humanAnswer || "").trim()) {
    return { ok: false, error: "Réponse humaine requise pour la validation." };
  }

  const resolutionRel = `livrables/_governance/agent-io/resolution-${decision.id}.json`;
  const resolutionAbs = path.join(paths.agentIoDir, `resolution-${decision.id}.json`);
  try { fs.rmSync(resolutionAbs, { force: true }); } catch {}

  const prompt =
    buildResolutionAgentPrompt(decision, {
      mode: resMode,
      humanAnswer,
      note,
      resolutionFileRel: resolutionRel,
      targetAgent,
      // Default name: rewritten to this run's own pending file by the run engine.
      pendingFileRel: "livrables/_governance/agent-io/pending-input.json"
    }) + libraryPolicyText(config);

  const resolverRunId = startRun(config, {
    label: `Résolution ${decision.id} · ${targetAgent}`,
    kind: "resolution",
    phaseId: decision.phaseId || null,
    agent: targetAgent,
    prompt,
    cwd: paths.workspaceRoot,
    post: { resolution: { decisionId: decision.id, resolutionFile: resolutionAbs } }
  });
  return { ok: true, resolverRunId, targetAgent, mode: resMode };
}

/** End of a resolver run: record the expert's answer and resume the raising run. */
export function handleResolutionDone(config, paths, run) {
  const r = run.post && run.post.resolution;
  if (!r) return;
  const decision = getDecision(paths, r.decisionId);
  if (!decision || decision.status === "answered") return;
  let resolution = null;
  const raw = readTextSafe(r.resolutionFile);
  if (raw) { try { resolution = JSON.parse(raw); } catch {} }
  // No answer (agent may have escalated a blocker) — leave the item pending.
  if (!resolution || !String(resolution.answer || "").trim()) return;
  const updated = Array.isArray(resolution.deliverablesUpdated) ? resolution.deliverablesUpdated.filter(Boolean) : [];
  const noteText = [
    String(resolution.rationale || "").trim(),
    updated.length ? `Livrables mis à jour : ${updated.join(", ")}` : ""
  ].filter(Boolean).join(" — ");
  const answered = answerDecision(paths, {
    id: decision.id,
    choiceLabel: String(resolution.answer).trim(),
    note: noteText,
    decidedBy: decision.targetProfile
  });
  try { fs.rmSync(r.resolutionFile, { force: true }); } catch {}
  // Raising run fully answered -> resume it so the requester continues with the answer.
  if (answered.ok && answered.runFullyAnswered && decision.runId) {
    resumeRaisingRun(config, paths, decision.runId, decision.phaseId || null);
  }
}

/**
 * Bulk "déléguer à l'IA" : route EACH selected item to its target profile's agent,
 * exactly like the single-item delegation. Each resolver run resumes its raising run
 * on its own, so resolution is asynchronous.
 */
export function resolveManyViaAgent(config, paths, { ids }) {
  const list = Array.isArray(ids) ? ids : [];
  if (!list.length) return { ok: false, error: "Aucun élément sélectionné." };
  const started = [];
  const skipped = [];
  for (const id of list) {
    const r = resolveViaAgent(config, paths, { id, mode: "delegate" });
    if (r.ok) started.push({ id, resolverRunId: r.resolverRunId, targetAgent: r.targetAgent });
    else skipped.push({ id, error: r.error });
  }
  return { ok: true, count: started.length, started, skipped };
}
