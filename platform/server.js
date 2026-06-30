import { createServer } from "./src/server/app.js";
import { loadConfig } from "./src/server/config/store.js";
import { buildProjectState } from "./src/server/services/project-state.js";

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
});
