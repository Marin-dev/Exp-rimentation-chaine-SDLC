import { loadConfig } from "../config/store.js";
import { createWorkspacePaths } from "../config/paths.js";
import { setRunHooks } from "./runs.js";
import { ingestResolutions, ingestRisks, ingestTasks, ingestPendingInput } from "./inbox-ingest.js";
import { closePassedPhaseTasks } from "./coordination.js";
import { listDecisions } from "./decisions-store.js";
import { handleResolutionDone } from "./resolve-via-agent.js";
import { handleResumeDone } from "./run-resume.js";
import { launchReview, launchAcceptanceTests } from "./phase-runs.js";
import { enforceAllEvidenceGates, lockAcceptance } from "./verification.js";
import { handleRequestRunDone, reconcileRequests } from "./request-flow.js";

/**
 * Platform-wide end-of-run behaviour, identical for a live run and for a run re-adopted
 * after a server restart (whose own onDone closure no longer exists).
 *
 * beforeDone — ingest everything the run wrote through the agent-io contract: its own
 *   per-run files, the explicit files it was given, and (for a resume) the files of the
 *   run it resumes. Ingestion deletes each file, so nothing is ingested twice.
 * afterDone — coordination: lock @qa's acceptance tests, cap G5 / G6 with the executable
 *   evidence, close tasks of cleanly passed gates, finish a delegated resolution or a
 *   resume, and chain what follows (acceptance tests, verification, review).
 */

function ingestRunIo(paths, run) {
  const meta = { runId: run.id, phaseId: run.phaseId, raisedBy: run.agent || run.label };
  const sets = [run.io, ...(run.extraIo || [])].filter(Boolean);
  for (const io of sets) {
    if (io.resolutions) ingestResolutions(paths, io.resolutions);
    if (io.risks) ingestRisks(paths, meta, io.risks);
    if (io.tasks) ingestTasks(paths, meta, io.tasks);
    if (io.pending) ingestPendingInput(paths, meta, io.pending);
  }
  if (run.risksFile) ingestRisks(paths, meta, run.risksFile);
  if (run.tasksFile) ingestTasks(paths, meta, run.tasksFile);
  if (run.pendingFile) ingestPendingInput(paths, meta, run.pendingFile);
}

function waitingOnHumans(paths, run) {
  return listDecisions(paths).some((d) => d.status === "pending" && d.runId === run.id);
}

/**
 * Chain what follows a clean run — unless it is waiting on humans (the resume that
 * follows the answers carries the same chain).
 */
function maybeChain(config, paths, run) {
  const post = run.post || {};
  if (run.status !== "done" || config.autoReview === false) return;
  if (!post.chainReview && !post.chainAcceptance) return;
  if (waitingOnHumans(paths, run)) return;
  if (post.chainAcceptance) {
    launchAcceptanceTests(config, paths);
    return;
  }
  // After a verification run the evidence is fresh: go straight to the review.
  launchReview(config, paths, post.chainReview, { afterVerification: run.kind === "verification" });
}

/**
 * @qa owns the acceptance tests: what a @qa run of G4 / G6 leaves on disk becomes the new
 * lock. Other @qa runs (risk seeding…) must not legitimise a change made by someone else.
 */
function maybeLockAcceptance(paths, run) {
  if (run.status !== "done") return;
  const isQa = String(run.agent || "").split(/[\s,+]+/).includes("@qa");
  const qaOfTests = isQa && (run.phaseId === "G4" || run.phaseId === "G6");
  if ((run.post && run.post.lockAcceptance) || qaOfTests) lockAcceptance(paths);
}

export function installRunHooks() {
  setRunHooks({
    beforeDone: (run) => {
      const paths = createWorkspacePaths(run.stateRoot);
      ingestRunIo(paths, run);
    },
    afterDone: (run) => {
      // Re-adopted runs (after a restart) have no launch config: use the current one.
      const config = run.config || loadConfig();
      const paths = createWorkspacePaths(run.stateRoot);
      try { maybeLockAcceptance(paths, run); } catch {}
      // Before closing tasks: a gate the evidence doesn't support is no longer passed.
      try { enforceAllEvidenceGates(paths); } catch {}
      try { closePassedPhaseTasks(paths); } catch {}
      handleResolutionDone(config, paths, run);
      handleResumeDone(config, paths, run);
      maybeChain(config, paths, run);
      // Request desk: continue the request whose step this was, then the queue.
      try { handleRequestRunDone(config, paths, run); } catch (e) { console.error(`[requests] ${e.message}`); }
      try { reconcileRequests(config, paths); } catch (e) { console.error(`[requests] ${e.message}`); }
    }
  });
}
