import fs from "node:fs";
import path from "node:path";
import { startRun, readRunMeta, runIoFiles } from "./runs.js";
import { readRunAnswers, markDecisionsApplied } from "./decisions-store.js";
import { buildResumePrompt, libraryPolicyText } from "./run-prompts.js";
import { PHASE_BY_ID, PRODUCERS } from "../domain/phases.js";

/**
 * Resume the run that RAISED questions, once they are answered.
 *
 * The resumed agent is the one that asked (same agent, same cwd, same io files — a G5 lane
 * keeps its BC scope), and it continues ITS Claude session (`--resume <session_id>`), so it
 * remembers what it was doing instead of re-reading the whole project cold. When the session
 * can't be resumed (cwd gone, unknown session, or the CLI refuses it), the original prompt
 * is replayed with the answers instead.
 *
 * Answers go to answers-<fromRunId>.json, read by this resume ONLY.
 */

const AGENT_IO_REL = "livrables/_governance/agent-io";

/** Re-root an absolute file of the original cwd onto the cwd actually used now. */
function reroot(file, fromCwd, toCwd) {
  if (!file) return null;
  if (!fromCwd || fromCwd === toCwd) return file;
  const rel = path.relative(fromCwd, file);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return file;
  return path.join(toCwd, rel);
}

function toRel(cwd, file) {
  return file ? path.relative(cwd, file).split(path.sep).join("/") : null;
}

export function resumeRun(config, paths, fromRunId, { phaseId: phaseHint, agent: agentHint, noSession } = {}) {
  const answers = readRunAnswers(paths, fromRunId);
  if (!answers.length) return { ok: false, error: "Aucune réponse à transmettre." };
  const meta = readRunMeta(paths.workspaceRoot, fromRunId);

  const phaseId = (meta && meta.phaseId) || (phaseHint && PHASE_BY_ID[phaseHint] ? phaseHint : null);
  const phase = phaseId ? PHASE_BY_ID[phaseId] : null;
  const agent = (meta && meta.agent) || agentHint || (phaseId ? PRODUCERS[phaseId] || null : "@project-bootstrapper");
  const originalCwd = meta && meta.cwd;
  const cwd = originalCwd && fs.existsSync(originalCwd) ? originalCwd : paths.workspaceRoot;
  const sessionId = !noSession && meta && meta.sessionId && originalCwd === cwd ? meta.sessionId : null;

  const answersAbs = path.join(cwd, ...AGENT_IO_REL.split("/"), `answers-${fromRunId}.json`);
  fs.mkdirSync(path.dirname(answersAbs), { recursive: true });
  fs.writeFileSync(answersAbs, JSON.stringify(answers, null, 2), "utf8");

  // Explicit io files of the original run (a lane's own pending file…) stay in use.
  const pendingFile = reroot(meta && meta.pendingFile, originalCwd, cwd);
  const risksFile = reroot(meta && meta.risksFile, originalCwd, cwd);
  const tasksFile = reroot(meta && meta.tasksFile, originalCwd, cwd);

  const phaseLabel = phase ? `${phase.id} ${phase.title}` : (meta && meta.label) || "la tâche";
  const prompt =
    buildResumePrompt({
      phaseLabel,
      agent: agent || "",
      answersFileRel: toRel(cwd, answersAbs),
      sessionResumed: Boolean(sessionId),
      originalPrompt: sessionId ? null : (meta && meta.basePrompt) || null,
      pendingFileRel: toRel(cwd, pendingFile)
    }) + libraryPolicyText(config);

  const runId = startRun(config, {
    label: `${phase ? phase.id : "Tâche"} · Reprise après réponses${agent ? ` · ${agent}` : ""}`,
    kind: "resume",
    phaseId,
    agent,
    prompt,
    cwd,
    stateRoot: paths.workspaceRoot,
    resumeSessionId: sessionId,
    pendingFile,
    risksFile,
    tasksFile,
    // Safety net: if the resumed session still writes to the files named in its earlier
    // context, they are ingested too.
    extraIo: originalCwd ? [runIoFiles(originalCwd, fromRunId)] : [],
    resumeOf: fromRunId,
    post: {
      resume: { fromRunId, answersFile: answersAbs, usedSession: Boolean(sessionId), phaseId, agent },
      // The resumed work keeps the original run's follow-up (review, acceptance tests…).
      chainReview: (meta && meta.post && meta.post.chainReview) || null,
      chainAcceptance: Boolean(meta && meta.post && meta.post.chainAcceptance),
      lockAcceptance: Boolean(meta && meta.post && meta.post.lockAcceptance),
      // A step of a request-desk request: the resumed run ends that step.
      request: (meta && meta.post && meta.post.request) || null
    }
  });
  return { ok: true, runId, agent, sessionResumed: Boolean(sessionId) };
}

/**
 * End of a resume run (live or re-adopted after restart). A session the CLI could not
 * resume fails before doing any work: retry once by replaying the original prompt.
 */
export function handleResumeDone(config, paths, run) {
  const r = run.post && run.post.resume;
  if (!r) return;
  try { fs.rmSync(r.answersFile, { force: true }); } catch {}
  if (run.status === "done") {
    markDecisionsApplied(paths, r.fromRunId);
    return;
  }
  const didNothing = !run.cancelled && run.liveUsage && run.liveUsage.size === 0;
  if (r.usedSession && didNothing) {
    resumeRun(config, paths, r.fromRunId, { phaseId: r.phaseId, agent: r.agent, noSession: true });
  }
}
