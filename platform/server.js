import { createServer } from "./src/server/app.js";
import { loadConfig } from "./src/server/config/store.js";
import { buildProjectState } from "./src/server/services/project-state.js";
import { createWorkspacePaths } from "./src/server/config/paths.js";
import { reconcileRuns } from "./src/server/services/runs.js";
import { ingestResolutions, ingestRisks, ingestPendingInput } from "./src/server/services/inbox-ingest.js";
import { resumeAutopilotOnBoot } from "./src/server/services/autopilot.js";

const PORT = Number(process.env.PORT || 4174);

// `node server.js --check` validates that the workspace can be read, without serving.
if (process.argv.includes("--check")) {
  const config = loadConfig();
  const state = await buildProjectState(config);
  console.log(`[check] workspace: ${config.workspaceRoot}`);
  console.log(`[check] project: ${state.project.name || "(none)"}`);
  console.log(`[check] phases: ${state.phases.length}, deliverables: ${state.summary.docsCount}`);
  process.exit(0);
}

const server = createServer();
server.listen(PORT, "127.0.0.1", () => {
  console.log(`SDLC Studio backend running at http://127.0.0.1:${PORT}`);
  // Re-adopt any agent runs that were still in flight when this server last stopped,
  // so a restart doesn't lose track of them (banner) or strand their outputs (ingestion).
  try {
    const paths = createWorkspacePaths(loadConfig().workspaceRoot);
    const r = reconcileRuns(paths, (run) => {
      ingestResolutions(paths);
      ingestRisks(paths, { runId: run.id, phaseId: run.phaseId, raisedBy: run.agent }, run.risksFile);
      ingestPendingInput(paths, { runId: run.id, phaseId: run.phaseId, raisedBy: run.agent }, run.pendingFile);
    });
    if (r.adopted || r.finalized) {
      console.log(`[reconcile] runs repris: ${r.adopted} en cours, ${r.finalized} terminés (ingestion rattrapée)`);
    }
  } catch (e) {
    console.error(`[reconcile] échec: ${e.message}`);
  }
  // Resume "gestion automatique" if it was left enabled before the last stop.
  try {
    const a = resumeAutopilotOnBoot();
    if (a.resumed) {
      console.log(`[autopilot] repris${a.waiting ? " (en attente d'une réponse humaine)" : ""}`);
    }
  } catch (e) {
    console.error(`[autopilot] reprise échouée: ${e.message}`);
  }
});
