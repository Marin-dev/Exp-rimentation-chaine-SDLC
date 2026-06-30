import { parseBody, sendJson } from "../utils/http-utils.js";

export function createApiRouter(services) {
  return async function handleApi(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
      if (req.method === "GET" && url.pathname === "/api/state") {
        sendJson(res, 200, await services.state.getState());
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/deliverables/content") {
        sendJson(res, 200, await services.deliverables.readDeliverableContent(url.searchParams.get("path")));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/config") {
        sendJson(res, 200, await services.config.updateConfig(await parseBody(req)));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/intake/scan") {
        const body = await parseBody(req);
        sendJson(res, 200, await services.intake.scanIntakeFolder(body.folderPath));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/intake/import") {
        sendJson(res, 200, await services.intake.importIntakeFiles(await parseBody(req)));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/actions/prepare") {
        sendJson(res, 200, await services.actions.prepareAction(await parseBody(req)));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/actions/run") {
        sendJson(res, 202, await services.actions.runClaudeAction(await parseBody(req)));
        return;
      }
      if (req.method === "GET" && url.pathname.startsWith("/api/runs/")) {
        const runId = url.pathname.split("/").pop();
        sendJson(res, 200, { log: await services.actions.readRunLog(runId) });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/human-reviews") {
        sendJson(res, 200, await services.humanReviews.createHumanReview(await parseBody(req)));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/change-requests") {
        sendJson(res, 200, await services.changeRequests.createChangeRequest(await parseBody(req)));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/g0/answers") {
        sendJson(res, 200, await services.g0.answerG0Question(await parseBody(req)));
        return;
      }
      sendJson(res, 404, { error: "API route not found" });
    } catch (error) {
      sendJson(res, error.status || 500, { error: error.message || "Unexpected error" });
    }
  };
}
