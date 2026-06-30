export function createStateService({
  projectService,
  agentsService,
  resourcesService,
  gatesService,
  deliverablesService,
  humanReviewService,
  changeRequestService,
  g0Service,
  configService,
  actionsService
}) {
  async function getState() {
    const config = await configService.getConfig();
    const { workspaceRoot } = await configService.getWorkspacePaths();
    const humanReviews = await humanReviewService.listHumanReviews();
    const [
      project,
      agents,
      skills,
      mcpServers,
      gates,
      deliverables,
      changeRequests,
      g0Questions
    ] = await Promise.all([
      projectService.getProjectProfile(),
      agentsService.listAgents(),
      resourcesService.listSkills(),
      resourcesService.listMcpServers(),
      gatesService.listGates(humanReviews),
      deliverablesService.listDeliverables(),
      changeRequestService.listChangeRequests(),
      g0Service.listG0Questions()
    ]);
    const phaseWorkspaces = await deliverablesService.listPhaseWorkspaces(gates, humanReviews);
    return {
      workspaceRoot,
      project,
      agents,
      skills,
      mcpServers,
      gates,
      deliverables,
      phaseWorkspaces,
      humanReviews,
      changeRequests,
      g0Questions,
      config,
      claudeAvailable: await configService.isCommandAvailable(config.claudeCommand),
      runs: actionsService.listRuns()
    };
  }

  return { getState };
}
