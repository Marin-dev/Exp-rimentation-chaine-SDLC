import fs from "node:fs";
import path from "node:path";
import { startRun } from "./runs.js";
import { getDecision, answerDecision, readRunAnswers, markDecisionsApplied } from "./decisions-store.js";
import { buildResolutionAgentPrompt, buildResumePrompt, libraryPolicyText } from "./run-prompts.js";
import { ingestResolutions, ingestPendingInput } from "./inbox-ingest.js";
import { readTextSafe } from "./fs-utils.js";
import { PROFILE_BY_ID } from "../domain/profiles.js";
import { PRODUCERS, PHASE_BY_ID } from "../domain/phases.js";

function agentForProfile(profileId) {
  const p = PROFILE_BY_ID[profileId];
  return p && Array.isArray(p.agents) && p.agents[0] ? p.agents[0] : null;
}

/**
 * Resume the run that RAISED the item, once its answer(s) are in place — the raising
 * agent (e.g. @developpeur) continues with the target profile's answer. Mirrors the
 * /api/runs/resume flow.
 */
export function resumeRaisingRun(config, paths, runId, phaseId) {
  const answers = readRunAnswers(paths, runId);
  if (!answers.length) return null;
  fs.mkdirSync(paths.stateDir, { recursive: true });
  fs.writeFileSync(paths.answersFile, JSON.stringify(answers, null, 2), "utf8");
  const ph = phaseId && PHASE_BY_ID[phaseId] ? phaseId : null;
  const phase = ph ? PHASE_BY_ID[ph] : null;
  const agent = ph ? PRODUCERS[ph] || null : "@project-bootstrapper";
  return startRun(config, {
    label: ph ? `${ph} · Reprise après réponse agent` : "Reprise après réponse agent",
    kind: "resume",
    phaseId: ph,
    agent,
    prompt:
      buildResumePrompt({ phaseLabel: phase ? `${phase.id} ${phase.title}` : "la tâche", agent: agent || "" }) +
      libraryPolicyText(config),
    cwd: paths.workspaceRoot,
    onDone: (run) => {
      ingestResolutions(paths);
      const r = ingestPendingInput(paths, { runId: run.id, phaseId: ph, raisedBy: agent || "Reprise" });
      if (run.status === "done") markDecisionsApplied(paths, runId);
      try { fs.rmSync(paths.answersFile, { force: true }); } catch {}
      return r;
    }
  });
}

/**
 * Resolve a routed item by spawning the TARGET profile's agent to answer it.
 * mode "delegate": the target agent decides from scratch.
 * mode "validate": the target agent reviews/enriches the human's proposed answer.
 * The agent's answer is fed back to the raising run, which is then resumed.
 */
export function resolveViaAgent(config, paths, { id, mode, humanAnswer, note }) {
  const decision = getDecision(paths, id);
  if (!decision) return { ok: false, error: "Décision introuvable." };
  if (decision.status === "answered") return { ok: false, error: "Décision déjà tranchée." };
  const targetAgent = agentForProfile(decision.targetProfile);
  if (!targetAgent) return { ok: false, error: "Aucun agent associé au profil cible." };
  const resMode = mode === "validate" ? "validate" : "delegate";
  if (resMode === "validate" && !String(humanAnswer || "").trim()) {
    return { ok: false, error: "Réponse humaine requise pour la validation." };
  }

  const lid = decision.id.toLowerCase();
  const resolutionRel = `livrables/_governance/agent-io/resolution-${decision.id}.json`;
  const resolutionAbs = path.join(paths.agentIoDir, `resolution-${decision.id}.json`);
  const pendingRel = `livrables/_governance/agent-io/pending-input-resolve-${lid}.json`;
  const pendingAbs = path.join(paths.agentIoDir, `pending-input-resolve-${lid}.json`);
  try { fs.rmSync(resolutionAbs, { force: true }); } catch {}

  const prompt =
    buildResolutionAgentPrompt(decision, {
      mode: resMode,
      humanAnswer,
      note,
      resolutionFileRel: resolutionRel,
      targetAgent,
      pendingFileRel: pendingRel
    }) + libraryPolicyText(config);

  const resolverRunId = startRun(config, {
    label: `Résolution ${decision.id} · ${targetAgent}`,
    kind: "resolution",
    phaseId: decision.phaseId || null,
    agent: targetAgent,
    prompt,
    cwd: paths.workspaceRoot,
    onDone: (run) => {
      // Surface any escalation the target agent itself raised.
      try {
        ingestPendingInput(paths, { runId: run.id, phaseId: decision.phaseId || null, raisedBy: targetAgent }, pendingAbs);
      } catch {}
      // Read the answer the target agent produced for the raising agent.
      let resolution = null;
      const raw = readTextSafe(resolutionAbs);
      if (raw) { try { resolution = JSON.parse(raw); } catch {} }
      if (!resolution || !String(resolution.answer || "").trim()) {
        // No answer (agent may have escalated a blocker) — leave the item pending.
        return;
      }
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
      try { fs.rmSync(resolutionAbs, { force: true }); } catch {}
      // Raising run fully answered -> resume it so the requester continues with the answer.
      if (answered.ok && answered.runFullyAnswered && decision.runId) {
        resumeRaisingRun(config, paths, decision.runId, decision.phaseId || null);
      }
    }
  });
  return { ok: true, resolverRunId, targetAgent, mode: resMode };
}

/**
 * Bulk "déléguer à l'IA" : route EACH selected item to its target profile's agent,
 * exactly like the single-item delegation. Each resolver run resumes its raising run
 * on its own (via resolveViaAgent's onDone), so resolution is asynchronous.
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
