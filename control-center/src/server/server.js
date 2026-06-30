import http from "node:http";
import { appStateDir } from "./config/paths.js";
import { ensureDirs } from "./utils/fs-utils.js";
import { createConfigService } from "./services/config-service.js";
import { createAgentsService } from "./services/agents-service.js";
import { createResourcesService } from "./services/resources-service.js";
import { createProjectService } from "./services/project-service.js";
import { createGatesService } from "./services/gates-service.js";
import { createDeliverablesService } from "./services/deliverables-service.js";
import { createIntakeService } from "./services/intake-service.js";
import { createActionsService } from "./services/actions-service.js";
import { createHumanReviewService } from "./services/human-review-service.js";
import { createChangeRequestService } from "./services/change-request-service.js";
import { createG0Service } from "./services/g0-service.js";
import { createStateService } from "./services/state-service.js";
import { createApiRouter } from "./routes/api-router.js";
import { createStaticRouter } from "./routes/static-router.js";

export async function createControlCenterServer() {
  const configService = createConfigService();
  await ensureDirs([appStateDir]);
  const workspacePaths = await configService.getWorkspacePaths();
  await ensureDirs([
    workspacePaths.actionsDir,
    workspacePaths.runsDir,
    workspacePaths.importedIntakeDir,
    workspacePaths.humanReviewsDir,
    workspacePaths.changeRequestsDir,
    workspacePaths.changeRequestSourcesDir,
    workspacePaths.g0ResponsesDir
  ]);

  const agentsService = createAgentsService(configService);
  const resourcesService = createResourcesService(configService);
  const projectService = createProjectService(configService);
  const gatesService = createGatesService(configService);
  const deliverablesService = createDeliverablesService(configService);
  const intakeService = createIntakeService(configService);
  const actionsService = createActionsService(configService);
  const humanReviewService = createHumanReviewService(configService);
  const changeRequestService = createChangeRequestService(configService);
  const g0Service = createG0Service(configService);
  const stateService = createStateService({
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
  });

  const services = {
    config: configService,
    agents: agentsService,
    resources: resourcesService,
    project: projectService,
    gates: gatesService,
    deliverables: deliverablesService,
    intake: intakeService,
    actions: actionsService,
    humanReviews: humanReviewService,
    changeRequests: changeRequestService,
    g0: g0Service,
    state: stateService
  };

  const apiRouter = createApiRouter(services);
  const staticRouter = await createStaticRouter();

  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/api/")) {
      apiRouter(req, res);
      return;
    }
    staticRouter(req, res);
  });

  return { server, services };
}
