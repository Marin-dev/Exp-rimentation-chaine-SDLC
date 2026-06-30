import { createControlCenterServer } from "./src/server/server.js";

const port = Number(process.env.PORT || 4173);

async function main() {
  const app = await createControlCenterServer();

  if (process.argv.includes("--check")) {
    const state = await app.services.state.getState();
    console.log(
      `OK: ${state.agents.length} agents, ${state.skills.length} skills, ${state.gates.length} gates, project=${state.project.projectName}`
    );
    return;
  }

  app.server.listen(port, () => {
    console.log(`AI Dev Chain Control Center: http://localhost:${port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
