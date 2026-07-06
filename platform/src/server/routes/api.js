import { loadConfig, saveConfig } from "../config/store.js";
import { buildProjectState } from "../services/project-state.js";
import { readDeliverableContent } from "../services/deliverable-content.js";
import { createSkill } from "../services/resources.js";
import { createAgent } from "../services/agents.js";
import { searchExistingSkills } from "../services/skill-discovery.js";
import { createDecision, answerDecision, readRunAnswers, reopenDecision, markDecisionsApplied, markDecisionsAppliedByIds, listDecisions } from "../services/decisions-store.js";
import { createWorkspacePaths, frameworkRoot } from "../config/paths.js";
import { startRun, getRun, subscribe, listRuns } from "../services/runs.js";
import { buildG0Prompt, buildResumePrompt, buildPhasePrompt, buildReviewPrompt, buildRemediationPrompt, buildChatPrompt, buildNewNeedPrompt, buildOrchestratorChatPrompt, buildAppDetectPrompt, buildRiskSeedPrompt, buildRiskResolutionPrompt, buildTaskBatchPrompt, libraryPolicyText } from "../services/run-prompts.js";
import { ingestPendingInput, ingestResolutions, ingestRisks, ingestTasks } from "../services/inbox-ingest.js";
import { listRisks, createRisk, updateRiskStatus, getRisk } from "../services/risks-store.js";
import { buildRiskBatchPrompt, buildDecisionIntegrationPrompt } from "../services/run-prompts.js";
import { listTasks, createTask, updateTaskStatus, assignTasksToRun, markActionTaskLaunched } from "../services/tasks-store.js";
import { executeOrchestratorAction, ingestOrchestratorActionsAsTasks, applyOrchestratorTaskOps } from "../services/orchestrator-actions.js";
import { buildOrchestratorSnapshot } from "../services/orchestrator-snapshot.js";
import { startAutopilot, stopAutopilot, getAutopilotStatus, answerEscalation } from "../services/autopilot.js";
import { scanIntake } from "../services/intake.js";
import { saveUpload } from "../services/uploads.js";
import { readTextSafe } from "../services/fs-utils.js";
import { addFeedback } from "../services/feedback-store.js";
import { addInput, setInputStatus, removeInput, pendingInputsForPhase, markPhaseInputsConsidered } from "../services/inputs-store.js";
import { startApp, stopApp, appStatus } from "../services/app-runner.js";
import { getSpend } from "../services/spend-store.js";
import { readGates } from "../services/gates.js";
import { buildActivity } from "../services/activity.js";
import { scaffoldProject } from "../services/project-scaffold.js";
import { pickFolder } from "../services/folder-picker.js";
import { gitStatus, gitAction } from "../services/git-service.js";
import { githubStatus, publish as githubPublish } from "../services/github-publish.js";
import { PHASE_BY_ID, PRODUCERS, REVIEWERS, PHASE_PARALLEL } from "../domain/phases.js";
import { startPhaseGroup, getGroup, listGroups } from "../services/group-runner.js";
import { buildDevBatches, buildUsReport } from "../services/dev-batches.js";
import { resolveViaAgent, resolveManyViaAgent } from "../services/resolve-via-agent.js";
import { auditProfileDecisions, auditGlobalCoherence } from "../services/audit-decisions.js";
import { PROFILE_BY_ID } from "../domain/profiles.js";
import fs from "node:fs";
import path from "node:path";

const PHASE_AGENTS = {
  G0: "@project-bootstrapper",
  G1: "@sponsor",
  G2: "@ux + @architecte-metier + @ui-designer",
  G3: "@architecte-technique + @security-architect",
  G4: "@po",
  G5: "@developpeur",
  G6: "@qa + @appsec-reviewer",
  G6R: "@end-user",
  G7: "@devops + @release-judge"
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 40_000_000) req.destroy();
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

/**
 * Handle /api/* routes. Returns true if the request was handled.
 */
export async function handleApi(req, res, url) {
  const { pathname } = url;

  try {
    if (pathname === "/api/health" && req.method === "GET") {
      sendJson(res, 200, { ok: true });
      return true;
    }

    if (pathname === "/api/state" && req.method === "GET") {
      const config = loadConfig();
      const state = await buildProjectState(config);
      sendJson(res, 200, state);
      return true;
    }

    if (pathname === "/api/deliverable" && req.method === "GET") {
      const config = loadConfig();
      const result = readDeliverableContent(config, url.searchParams.get("path"));
      sendJson(res, result.ok ? 200 : 400, result);
      return true;
    }

    if (pathname === "/api/pick-folder" && req.method === "POST") {
      const body = await readBody(req);
      sendJson(res, 200, await pickFolder(String(body.initial || "")));
      return true;
    }

    if (pathname === "/api/projects/new" && req.method === "POST") {
      const body = await readBody(req);
      // New projects are seeded from the app-bundled framework template, not the current workspace.
      const result = scaffoldProject(body.path);
      if (!result.ok) {
        sendJson(res, 400, result);
        return true;
      }
      saveConfig({ workspaceRoot: result.path });
      const state = await buildProjectState(loadConfig());
      sendJson(res, 200, { ok: true, path: result.path, state });
      return true;
    }

    if (pathname === "/api/config" && req.method === "POST") {
      const body = await readBody(req);
      const patch = {};
      if (typeof body.workspaceRoot === "string" && body.workspaceRoot.trim()) {
        patch.workspaceRoot = body.workspaceRoot.trim();
      }
      if (body.app && typeof body.app === "object") {
        patch.app = body.app;
      }
      if (body.policies && typeof body.policies === "object") {
        patch.policies = body.policies;
      }
      if (body.pricing && typeof body.pricing === "object") {
        patch.pricing = body.pricing;
      }
      if (body.permissionMode === "bypassPermissions" || body.permissionMode === "acceptEdits") {
        patch.permissionMode = body.permissionMode;
      }
      if (body.autopilot && typeof body.autopilot === "object") {
        // Merge onto the existing autopilot policy so partial edits (e.g. just the budget)
        // don't wipe the rest, and never let a settings save flip the run flag.
        const current = loadConfig().autopilot || {};
        patch.autopilot = { ...current, ...body.autopilot, enabled: current.enabled };
      }
      const config = saveConfig(patch);
      const state = await buildProjectState(config);
      sendJson(res, 200, state);
      return true;
    }

    if (pathname === "/api/skills/search" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const result = await searchExistingSkills(config, {
        name: body.name,
        description: body.description
      });
      sendJson(res, result.ok ? 200 : 400, result);
      return true;
    }

    if (pathname === "/api/skills" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      // Always add to the current project; scope "both" also persists it into the app template.
      const result = createSkill(paths, { name: body.name, description: body.description });
      if (!result.ok) {
        sendJson(res, 400, result);
        return true;
      }
      let savedToFramework = false;
      if (body.scope === "both") {
        const fwPaths = createWorkspacePaths(frameworkRoot);
        const fwResult = createSkill(fwPaths, { name: body.name, description: body.description, ifExists: "skip" });
        savedToFramework = fwResult.ok;
      }
      const state = await buildProjectState(config);
      sendJson(res, 200, { ok: true, id: result.id, savedToFramework, state });
      return true;
    }

    if (pathname === "/api/agents" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      // Always add to the current project; scope "both" also persists it into the app template.
      const result = createAgent(paths, { name: body.name, description: body.description, tools: body.tools });
      if (!result.ok) {
        sendJson(res, 400, result);
        return true;
      }
      let savedToFramework = false;
      if (body.scope === "both") {
        const fwPaths = createWorkspacePaths(frameworkRoot);
        const fwResult = createAgent(fwPaths, { name: body.name, description: body.description, tools: body.tools, ifExists: "skip" });
        savedToFramework = fwResult.ok;
      }
      const state = await buildProjectState(config);
      sendJson(res, 200, { ok: true, id: result.id, savedToFramework, state });
      return true;
    }

    if (pathname === "/api/decisions" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const result = createDecision(paths, body);
      if (!result.ok) {
        sendJson(res, 400, result);
        return true;
      }
      const state = await buildProjectState(config);
      sendJson(res, 200, { ok: true, id: result.id, state });
      return true;
    }

    if (pathname === "/api/decisions/answer-bulk" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      // Route each selected item to its target profile's agent (like single-item delegation).
      const result = resolveManyViaAgent(config, paths, { ids: body.ids });
      if (!result.ok) {
        sendJson(res, 400, result);
        return true;
      }
      const state = await buildProjectState(config);
      sendJson(res, 200, { ok: true, count: result.count, skipped: result.skipped, state });
      return true;
    }

    if (pathname === "/api/decisions/answer" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const result = answerDecision(paths, body);
      if (!result.ok) {
        sendJson(res, 400, result);
        return true;
      }
      // Auto-approve the library in the policy allowlist.
      if (result.approvedLibrary) {
        const libs = (config.policies && config.policies.libraries && config.policies.libraries.allowed) || [];
        if (!libs.includes(result.approvedLibrary)) {
          saveConfig({
            policies: {
              ...(config.policies || {}),
              libraries: {
                mode: (config.policies && config.policies.libraries && config.policies.libraries.mode) || "ask",
                allowed: [...libs, result.approvedLibrary]
              }
            }
          });
        }
      }
      const state = await buildProjectState(loadConfig());
      sendJson(res, 200, {
        ok: true,
        id: result.id,
        runId: result.runId,
        runFullyAnswered: result.runFullyAnswered,
        approvedLibrary: result.approvedLibrary || null,
        state
      });
      return true;
    }

    // Resolve a routed item via the TARGET profile's agent (agent-to-agent).
    // mode "delegate": the target agent decides; "validate": it reviews the human's answer.
    if (pathname === "/api/decisions/resolve-via-agent" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const result = resolveViaAgent(config, paths, {
        id: body.id,
        mode: body.mode,
        humanAnswer: body.humanAnswer,
        note: body.note
      });
      sendJson(res, result.ok ? 200 : 400, result);
      return true;
    }

    // Integrate answered decisions: send the answers back to the RAISING agent so it
    // applies them to the deliverables/code. Works unitarily (one id) or in batch.
    if (pathname === "/api/decisions/integrate-batch" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const ids = Array.isArray(body.ids) ? body.ids.map((x) => String(x)) : [];
      const answered = listDecisions(paths).filter((d) => ids.includes(d.id) && d.status === "answered");
      if (!answered.length) { sendJson(res, 400, { ok: false, error: "Aucune décision répondue à intégrer." }); return true; }
      // Group by the raising agent (who must take the answer into account).
      const byAgent = new Map();
      for (const d of answered) {
        const agent = (String(d.raisedBy || "").match(/@[\w-]+/) || [])[0]
          || (PROFILE_BY_ID[d.targetProfile] && PROFILE_BY_ID[d.targetProfile].agents[0])
          || "@project-bootstrapper";
        if (!byAgent.has(agent)) byAgent.set(agent, []);
        byAgent.get(agent).push(d);
      }
      const started = [];
      for (const [agent, decisions] of byAgent) {
        const token = `integ-${agent.replace(/[^a-z0-9]+/gi, "")}-${Date.now().toString(36)}`;
        const pendingAbs = path.join(paths.agentIoDir, `pending-input-${token}.json`);
        const risksAbs = path.join(paths.agentIoDir, `risks-${token}.json`);
        const tasksAbs = path.join(paths.agentIoDir, `tasks-${token}.json`);
        const rel = (p) => `livrables/_governance/agent-io/${p}`;
        const phaseId = decisions.find((d) => d.phaseId)?.phaseId || null;
        const decIds = decisions.map((d) => d.id);
        const runId = startRun(config, {
          label: `Intégration ${decisions.length} décision(s) · ${agent}`,
          kind: "decision-integration",
          phaseId,
          agent,
          prompt: buildDecisionIntegrationPrompt({
            agent, decisions,
            pendingFileRel: rel(`pending-input-${token}.json`), risksFileRel: rel(`risks-${token}.json`), tasksFileRel: rel(`tasks-${token}.json`)
          }) + libraryPolicyText(config),
          cwd: paths.workspaceRoot,
          pendingFile: pendingAbs,
          risksFile: risksAbs,
          onDone: (run) => {
            ingestResolutions(paths);
            if (run.status === "done") markDecisionsAppliedByIds(paths, decIds);
            ingestRisks(paths, { runId: run.id, phaseId, raisedBy: agent }, risksAbs);
            ingestTasks(paths, { runId: run.id, phaseId, raisedBy: agent }, tasksAbs);
            return ingestPendingInput(paths, { runId: run.id, phaseId, raisedBy: agent }, pendingAbs);
          }
        });
        started.push({ agent, runId, count: decisions.length });
      }
      const state = await buildProjectState(config);
      sendJson(res, 200, { ok: true, started, state });
      return true;
    }

    // Coherence control over answered decisions: per-profile (its own agent) or global.
    if (pathname === "/api/decisions/audit" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const result = body.scope === "global"
        ? auditGlobalCoherence(config, paths)
        : auditProfileDecisions(config, paths, { profileId: body.profileId });
      sendJson(res, result.ok ? 200 : 400, result);
      return true;
    }

    if (pathname === "/api/decisions/reopen" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const result = reopenDecision(paths, body.id);
      if (!result.ok) {
        sendJson(res, 400, result);
        return true;
      }
      const state = await buildProjectState(config);
      sendJson(res, 200, { ok: true, id: result.id, state });
      return true;
    }

    // Git operations on the workspace.
    if (pathname === "/api/git/status" && req.method === "GET") {
      const config = loadConfig();
      const root = createWorkspacePaths(config.workspaceRoot).workspaceRoot;
      sendJson(res, 200, await gitStatus(root));
      return true;
    }
    if (pathname === "/api/git/github-status" && req.method === "GET") {
      const config = loadConfig();
      const root = createWorkspacePaths(config.workspaceRoot).workspaceRoot;
      const st = await githubStatus();
      sendJson(res, 200, { ok: true, ...st, suggestedRepo: path.basename(root) });
      return true;
    }
    if (pathname === "/api/git/publish" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const root = createWorkspacePaths(config.workspaceRoot).workspaceRoot;
      const result = await githubPublish(root, {
        repo: body.repo,
        visibility: body.visibility,
        token: body.token
      });
      const status = await gitStatus(root);
      sendJson(res, result.ok ? 200 : 400, { ...result, status });
      return true;
    }
    if (pathname === "/api/git/action" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const root = createWorkspacePaths(config.workspaceRoot).workspaceRoot;
      const result = await gitAction(root, String(body.action || ""), body.params || {});
      const status = await gitStatus(root);
      sendJson(res, 200, {
        ok: result.ok,
        message: result.ok ? (result.stdout || "").trim() : result.stderr || "Échec.",
        status
      });
      return true;
    }

    // Launch / stop / status of the DELIVERED product (backend + frontend).
    if (pathname === "/api/app/status" && req.method === "GET") {
      const config = loadConfig();
      sendJson(res, 200, { ok: true, app: config.app || {}, status: appStatus() });
      return true;
    }
    if (pathname === "/api/app/start" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const root = createWorkspacePaths(config.workspaceRoot).workspaceRoot;
      const which = body.which === "all" ? ["backend", "frontend"] : [String(body.which || "")];
      const results = {};
      for (const name of which) {
        if (name === "backend" || name === "frontend") results[name] = startApp(config, name, root);
      }
      sendJson(res, 200, { ok: true, results, status: appStatus() });
      return true;
    }
    if (pathname === "/api/app/stop" && req.method === "POST") {
      const body = await readBody(req);
      const which = body.which === "all" ? ["backend", "frontend"] : [String(body.which || "")];
      for (const name of which) {
        if (name === "backend" || name === "frontend") stopApp(name);
      }
      sendJson(res, 200, { ok: true, status: appStatus() });
      return true;
    }

    // Ask a technical agent (@devops or @developpeur) to inspect the delivered product
    // and fill in the local launch parameters (backend/frontend commands, cwd, url).
    if (pathname === "/api/app/detect" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const agent = body.agent === "@developpeur" ? "@developpeur" : "@devops";
      const configRel = "livrables/_governance/agent-io/app-launch-config.json";
      const configAbs = path.join(paths.agentIoDir, "app-launch-config.json");
      try { fs.rmSync(configAbs, { force: true }); } catch {}
      const runId = startRun(config, {
        label: `Détection du lancement · ${agent}`,
        kind: "app-detect",
        agent,
        prompt:
          buildAppDetectPrompt({ agent, configFileRel: configRel, workspaceRoot: paths.workspaceRoot }) +
          libraryPolicyText(config),
        cwd: paths.workspaceRoot,
        onDone: () => {
          const raw = readTextSafe(configAbs);
          if (!raw) return;
          let detected;
          try { detected = JSON.parse(raw); } catch { return; }
          if (!detected || typeof detected !== "object") return;
          const pick = (part) => ({
            command: String(part?.command || "").trim(),
            cwd: String(part?.cwd || "").trim(),
            ...(part && "url" in part ? { url: String(part.url || "").trim() } : {})
          });
          const current = loadConfig();
          const nextApp = {
            backend: { ...(current.app?.backend || {}), ...pick(detected.backend) },
            frontend: { ...(current.app?.frontend || {}), ...pick(detected.frontend) }
          };
          saveConfig({ app: nextApp });
          try { fs.rmSync(configAbs, { force: true }); } catch {}
        }
      });
      sendJson(res, 200, { ok: true, runId, agent });
      return true;
    }

    // ---- Risk register (first-class, tracked like decisions) ----
    if (pathname === "/api/risks" && req.method === "GET") {
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      sendJson(res, 200, { ok: true, risks: listRisks(paths) });
      return true;
    }
    if (pathname === "/api/risks" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const result = createRisk(paths, body);
      if (!result.ok) { sendJson(res, 400, result); return true; }
      const state = await buildProjectState(config);
      sendJson(res, 200, { ok: true, id: result.id, state });
      return true;
    }
    if (pathname === "/api/risks/status" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const result = updateRiskStatus(paths, body);
      if (!result.ok) { sendJson(res, 400, result); return true; }
      const state = await buildProjectState(config);
      sendJson(res, 200, { ok: true, id: result.id, from: result.from, to: result.to, state });
      return true;
    }
    // Hand a risk to its OWNER agent (specialist) to treat it: mitigate, update status,
    // and open a dialogue (decision) with the raiser if it needs input.
    if (pathname === "/api/risks/resolve-via-agent" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const risk = getRisk(paths, body.id);
      if (!risk) { sendJson(res, 404, { ok: false, error: "Risque introuvable." }); return true; }
      const agent = (String(risk.owner || "").match(/@[\w-]+/) || [])[0] || PRODUCERS[risk.phaseId] || null;
      if (!agent) { sendJson(res, 400, { ok: false, error: "Aucun agent propriétaire associé à ce risque." }); return true; }
      const token = `${String(risk.id).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;
      const pendingRel = `livrables/_governance/agent-io/pending-input-${token}.json`;
      const pendingAbs = path.join(paths.agentIoDir, `pending-input-${token}.json`);
      const risksRel = `livrables/_governance/agent-io/risks-${token}.json`;
      const risksAbs = path.join(paths.agentIoDir, `risks-${token}.json`);
      // Show, immediately, that it's being actively treated and by whom.
      updateRiskStatus(paths, { id: risk.id, status: "mitigating", by: agent, note: `Confié à ${agent} pour traitement.` });
      const runId = startRun(config, {
        label: `Traitement risque ${risk.id} · ${agent}`,
        kind: "risk-resolution",
        phaseId: risk.phaseId || null,
        agent,
        prompt: buildRiskResolutionPrompt(risk, { agent, risksFileRel: risksRel, pendingFileRel: pendingRel }) + libraryPolicyText(config),
        cwd: paths.workspaceRoot,
        pendingFile: pendingAbs,
        risksFile: risksAbs,
        onDone: (run) => {
          ingestResolutions(paths);
          ingestRisks(paths, { runId: run.id, phaseId: risk.phaseId || null, raisedBy: agent }, risksAbs);
          return ingestPendingInput(paths, { runId: run.id, phaseId: risk.phaseId || null, raisedBy: agent }, pendingAbs);
        }
      });
      const state = await buildProjectState(config);
      sendJson(res, 200, { ok: true, runId, agent, state });
      return true;
    }

    // Batch-treat selected risks: group by owner agent, one expert run per owner.
    if (pathname === "/api/risks/resolve-batch" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const ids = Array.isArray(body.ids) ? body.ids.map((x) => String(x)) : [];
      const selected = listRisks(paths).filter((r) => ids.includes(r.id) && (r.status === "open" || r.status === "mitigating"));
      if (!selected.length) { sendJson(res, 400, { ok: false, error: "Aucun risque traitable sélectionné." }); return true; }
      const byAgent = new Map();
      for (const r of selected) {
        const agent = (String(r.owner || "").match(/@[\w-]+/) || [])[0] || PRODUCERS[r.phaseId] || "@architecte-technique";
        if (!byAgent.has(agent)) byAgent.set(agent, []);
        byAgent.get(agent).push(r);
      }
      const started = [];
      for (const [agent, risks] of byAgent) {
        const token = `risks-${agent.replace(/[^a-z0-9]+/gi, "")}-${Date.now().toString(36)}`;
        const pendingAbs = path.join(paths.agentIoDir, `pending-input-${token}.json`);
        const risksAbs = path.join(paths.agentIoDir, `risks-${token}.json`);
        const tasksAbs = path.join(paths.agentIoDir, `tasks-${token}.json`);
        const rel = (p) => `livrables/_governance/agent-io/${p}`;
        const phaseId = risks.find((r) => r.phaseId)?.phaseId || null;
        const runId = startRun(config, {
          label: `${risks.length} risque(s) · ${agent}`,
          kind: "risk-batch",
          phaseId,
          agent,
          prompt: buildRiskBatchPrompt({
            agent, profileLabel: agent, risks,
            risksFileRel: rel(`risks-${token}.json`), pendingFileRel: rel(`pending-input-${token}.json`), tasksFileRel: rel(`tasks-${token}.json`)
          }) + libraryPolicyText(config),
          cwd: paths.workspaceRoot,
          pendingFile: pendingAbs,
          risksFile: risksAbs,
          onDone: (run) => {
            ingestResolutions(paths);
            ingestRisks(paths, { runId: run.id, phaseId, raisedBy: agent }, risksAbs);
            ingestTasks(paths, { runId: run.id, phaseId, raisedBy: agent }, tasksAbs);
            return ingestPendingInput(paths, { runId: run.id, phaseId, raisedBy: agent }, pendingAbs);
          }
        });
        for (const r of risks) updateRiskStatus(paths, { id: r.id, status: "mitigating", by: agent, note: `Traitement batch confié à ${agent}.` });
        started.push({ agent, runId, count: risks.length });
      }
      const state = await buildProjectState(config);
      sendJson(res, 200, { ok: true, started, state });
      return true;
    }

    // Seed the register from existing deliverables via a @qa agent pass.
    if (pathname === "/api/risks/seed" && req.method === "POST") {
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      try { fs.rmSync(paths.risksInboxFile, { force: true }); } catch {}
      const runId = startRun(config, {
        label: "Amorçage du registre des risques · @qa",
        kind: "risk-seed",
        agent: "@qa",
        prompt: buildRiskSeedPrompt() + libraryPolicyText(config),
        cwd: paths.workspaceRoot,
        onDone: () => ingestRisks(paths, { raisedBy: "@qa" })
      });
      sendJson(res, 200, { ok: true, runId });
      return true;
    }

    // ---- Task register (actions routed to a profile, batch-executable) ----
    if (pathname === "/api/tasks" && req.method === "GET") {
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      sendJson(res, 200, { ok: true, tasks: listTasks(paths) });
      return true;
    }
    if (pathname === "/api/tasks" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const result = createTask(paths, body);
      if (!result.ok) { sendJson(res, 400, result); return true; }
      const state = await buildProjectState(config);
      sendJson(res, 200, { ok: true, id: result.id, state });
      return true;
    }
    if (pathname === "/api/tasks/status" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const result = updateTaskStatus(paths, body);
      if (!result.ok) { sendJson(res, 400, result); return true; }
      const state = await buildProjectState(config);
      sendJson(res, 200, { ok: true, id: result.id, from: result.from, to: result.to, state });
      return true;
    }
    // Batch-execute selected tasks: group by target profile, one agent run per profile.
    if (pathname === "/api/tasks/run-batch" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const ids = Array.isArray(body.ids) ? body.ids.map((x) => String(x)) : [];
      const all = listTasks(paths);
      const selected = all.filter((t) => ids.includes(t.id) && (t.status === "todo" || t.status === "in-progress"));
      if (!selected.length) { sendJson(res, 400, { ok: false, error: "Aucune tâche exécutable sélectionnée." }); return true; }
      const started = [];

      // Tasks mirroring an orchestrator proposal carry the exact executable action —
      // run it through the SAME typed machinery (launch_dev / launch_phase / review / …)
      // rather than the generic profile-batch prompt, so a "launch a review" task really
      // launches a review. One run per such task.
      const actionTasks = selected.filter((t) => t.action && typeof t.action === "object");
      for (const t of actionTasks) {
        const r = executeOrchestratorAction(config, paths, t.action);
        if (r.ok) {
          updateTaskStatus(paths, { id: t.id, status: "in-progress", by: "orchestrateur", runId: r.runId || null, note: "Lancée depuis la banette des tâches." });
          started.push({ profile: t.targetProfile, agent: t.action.agent || null, runId: r.runId || null, groupId: r.groupId || null, count: 1, label: r.label });
        } else {
          started.push({ profile: t.targetProfile, error: r.error });
        }
      }

      // Group the remaining (plain) tasks by target profile — one run per profile.
      const byProfile = new Map();
      for (const t of selected) {
        if (t.action && typeof t.action === "object") continue;
        if (!byProfile.has(t.targetProfile)) byProfile.set(t.targetProfile, []);
        byProfile.get(t.targetProfile).push(t);
      }
      for (const [profileId, tasks] of byProfile) {
        const profile = PROFILE_BY_ID[profileId];
        const agent = profile && Array.isArray(profile.agents) && profile.agents[0] ? profile.agents[0] : null;
        if (!agent) { started.push({ profile: profileId, error: "Aucun agent pour ce profil." }); continue; }
        const token = `tasks-${profileId}-${Date.now().toString(36)}`;
        const pendingRel = `livrables/_governance/agent-io/pending-input-${token}.json`;
        const pendingAbs = path.join(paths.agentIoDir, `pending-input-${token}.json`);
        const risksRel = `livrables/_governance/agent-io/risks-${token}.json`;
        const risksAbs = path.join(paths.agentIoDir, `risks-${token}.json`);
        const tasksRel = `livrables/_governance/agent-io/tasks-${token}.json`;
        const tasksAbs = path.join(paths.agentIoDir, `tasks-${token}.json`);
        const phaseId = tasks.find((t) => t.phaseId)?.phaseId || null;
        const runId = startRun(config, {
          label: `${tasks.length} tâche(s) · ${agent}`,
          kind: "task-batch",
          phaseId,
          agent,
          prompt: buildTaskBatchPrompt({
            agent, profileLabel: profile.label, tasks,
            tasksFileRel: tasksRel, pendingFileRel: pendingRel, risksFileRel: risksRel
          }) + libraryPolicyText(config),
          cwd: paths.workspaceRoot,
          pendingFile: pendingAbs,
          risksFile: risksAbs,
          onDone: (run) => {
            ingestResolutions(paths);
            ingestTasks(paths, { runId: run.id, phaseId, raisedBy: agent }, tasksAbs);
            ingestRisks(paths, { runId: run.id, phaseId, raisedBy: agent }, risksAbs);
            return ingestPendingInput(paths, { runId: run.id, phaseId, raisedBy: agent }, pendingAbs);
          }
        });
        assignTasksToRun(paths, tasks.map((t) => t.id), runId, agent);
        started.push({ profile: profileId, agent, runId, count: tasks.length });
      }
      const state = await buildProjectState(config);
      sendJson(res, 200, { ok: true, started, state });
      return true;
    }

    if (pathname === "/api/uploads" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const result = saveUpload(paths, {
        itemId: body.itemId,
        filename: body.filename,
        contentBase64: body.contentBase64
      });
      sendJson(res, result.ok ? 200 : 400, result);
      return true;
    }

    if (pathname === "/api/spend" && req.method === "GET") {
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      sendJson(res, 200, { ok: true, ...getSpend(paths, config.pricing) });
      return true;
    }

    if (pathname === "/api/activity" && req.method === "GET") {
      const config = loadConfig();
      sendJson(res, 200, { ok: true, ...buildActivity(config) });
      return true;
    }

    if (pathname === "/api/intake/scan" && req.method === "POST") {
      const body = await readBody(req);
      sendJson(res, 200, scanIntake(String(body.path || "").trim()));
      return true;
    }

    // Start the G0 run: read intake, structure needs, raise questions.
    if (pathname === "/api/runs/g0" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const intakePath = String(body.intakePath || "").trim();
      const hasAnswers = fs.existsSync(paths.answersFile);
      const runId = startRun(config, {
        label: "G0 · Structuration du besoin",
        kind: "g0",
        phaseId: "G0",
        agent: PHASE_AGENTS.G0,
        prompt: buildG0Prompt({ intakePath, hasAnswers }) + libraryPolicyText(config),
        cwd: paths.workspaceRoot,
        onDone: (run) =>
          ingestPendingInput(paths, { runId: run.id, phaseId: "G0", raisedBy: PHASE_AGENTS.G0 })
      });
      sendJson(res, 200, { ok: true, runId });
      return true;
    }

    // Launch any phase G1..G7 with its owner agents.
    if (pathname === "/api/runs/phase" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const phaseId = String(body.phaseId || "").trim();
      const phase = PHASE_BY_ID[phaseId];
      if (!phase || phaseId === "G0") {
        sendJson(res, 400, { ok: false, error: "Étape invalide pour ce lancement." });
        return true;
      }
      const hasAnswers = fs.existsSync(paths.answersFile);
      const runId = startRun(config, {
        label: `${phase.id} · ${phase.title}`,
        kind: "phase",
        phaseId,
        agent: PHASE_AGENTS[phaseId] || null,
        prompt:
          buildPhasePrompt(phase, { hasAnswers, inputs: pendingInputsForPhase(paths, phaseId) }) +
          libraryPolicyText(config),
        cwd: paths.workspaceRoot,
        onDone: (run) => {
          ingestResolutions(paths);
          // Only mark inputs consumed if the agent actually completed — a failed run never read them.
          if (run.status === "done") markPhaseInputsConsidered(paths, phaseId);
          ingestRisks(paths, { runId: run.id, phaseId, raisedBy: PHASE_AGENTS[phaseId] });
          ingestTasks(paths, { runId: run.id, phaseId, raisedBy: PHASE_AGENTS[phaseId] });
          return ingestPendingInput(paths, { runId: run.id, phaseId, raisedBy: PHASE_AGENTS[phaseId] });
        }
      });
      sendJson(res, 200, { ok: true, runId });
      return true;
    }

    // Launch a phase in PARALLEL (independent agents as concurrent processes).
    if (pathname === "/api/runs/phase-parallel" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const phaseId = String(body.phaseId || "").trim();
      const phase = PHASE_BY_ID[phaseId];
      const stages = PHASE_PARALLEL[phaseId];
      if (!phase || !stages) {
        sendJson(res, 400, { ok: false, error: "Pas de parallélisation définie pour cette étape." });
        return true;
      }
      const groupId = startPhaseGroup(config, paths, phase, stages);
      sendJson(res, 200, { ok: true, groupId });
      return true;
    }

    // Per-US development report (developed vs still to develop) for the dev zone.
    if (pathname === "/api/dev/us-report" && req.method === "GET") {
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      sendJson(res, 200, buildUsReport(paths));
      return true;
    }

    // Preview the dynamic G5 dev batches (by Bounded Context) without launching.
    if (pathname === "/api/runs/dev-batches/plan" && req.method === "GET") {
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const { meta } = buildDevBatches(paths);
      sendJson(res, 200, { ok: true, meta });
      return true;
    }

    // Launch G5 dev in parallel BATCHES by Bounded Context (waves of BC lanes).
    if (pathname === "/api/runs/dev-batches" && req.method === "POST") {
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const phase = PHASE_BY_ID.G5;
      const { stages, meta } = buildDevBatches(paths);
      if (!stages.length) {
        sendJson(res, 200, { ok: true, groupId: null, meta, message: "Aucune User Story à développer (toutes développées ou backlog vide)." });
        return true;
      }
      const groupId = startPhaseGroup(config, paths, phase, stages);
      sendJson(res, 200, { ok: true, groupId, meta });
      return true;
    }

    const groupMatch = pathname.match(/^\/api\/runs\/group\/([^/]+)$/);
    if (groupMatch && req.method === "GET") {
      const group = getGroup(decodeURIComponent(groupMatch[1]));
      sendJson(res, group ? 200 : 404, group ? { ok: true, group } : { ok: false, error: "Groupe introuvable." });
      return true;
    }

    // Remediate a gate accepted PASS_WITH_RISK: the producer agent fixes the risks
    // in the deliverables and re-evaluates the gate.
    if (pathname === "/api/runs/remediate-risks" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const phaseId = String(body.phaseId || "").trim();
      const phase = PHASE_BY_ID[phaseId];
      if (!phase) {
        sendJson(res, 400, { ok: false, error: "Étape inconnue." });
        return true;
      }
      const agent = PRODUCERS[phaseId] || PHASE_AGENTS[phaseId] || null;
      const gateStatus = (readGates(paths)[phaseId] || {}).status || null;
      const runId = startRun(config, {
        label: `${phase.id} · Correction des points bloquants`,
        kind: "remediation",
        phaseId,
        agent,
        prompt: buildRemediationPrompt(phase, agent, gateStatus) + libraryPolicyText(config),
        cwd: paths.workspaceRoot,
        onDone: (run) => {
          ingestResolutions(paths);
          ingestRisks(paths, { runId: run.id, phaseId, raisedBy: agent || "Correction" });
          ingestTasks(paths, { runId: run.id, phaseId, raisedBy: agent || "Correction" });
          ingestPendingInput(paths, { runId: run.id, phaseId, raisedBy: agent || "Correction" });
        }
      });
      sendJson(res, 200, { ok: true, runId });
      return true;
    }

    // Run the reviewer for a phase: evaluate deliverables and decide the gate.
    if (pathname === "/api/runs/review" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const phaseId = String(body.phaseId || "").trim();
      const phase = PHASE_BY_ID[phaseId];
      const reviewer = REVIEWERS[phaseId];
      if (!phase || !reviewer) {
        sendJson(res, 400, { ok: false, error: "Pas de revue définie pour cette étape." });
        return true;
      }
      const runId = startRun(config, {
        label: `${phase.id} · Revue (${reviewer})`,
        kind: "review",
        phaseId,
        agent: reviewer,
        prompt: buildReviewPrompt(phase, reviewer),
        cwd: paths.workspaceRoot,
        onDone: (run) => {
          ingestRisks(paths, { runId: run.id, phaseId, raisedBy: reviewer });
          ingestTasks(paths, { runId: run.id, phaseId, raisedBy: reviewer });
          return ingestPendingInput(paths, { runId: run.id, phaseId, raisedBy: reviewer });
        }
      });
      sendJson(res, 200, { ok: true, runId });
      return true;
    }

    // Chat with the phase's agent (ask / produce / update docs).
    if (pathname === "/api/runs/chat" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const phaseId = String(body.phaseId || "").trim();
      const phase = PHASE_BY_ID[phaseId];
      const message = String(body.message || "").trim();
      if (!phase || !message) {
        sendJson(res, 400, { ok: false, error: "Message ou étape manquant." });
        return true;
      }
      const agent = PRODUCERS[phaseId] || PHASE_AGENTS[phaseId] || null;
      const profileLabel = PROFILE_BY_ID[body.by] ? PROFILE_BY_ID[body.by].label : "membre de l'équipe";
      const runId = startRun(config, {
        label: `${phase.id} · Chat ${agent || ""}`,
        kind: "chat",
        phaseId,
        agent,
        prompt: buildChatPrompt(phase, agent, profileLabel, message, body.history) + libraryPolicyText(config),
        cwd: paths.workspaceRoot,
        onDone: (run) => ingestPendingInput(paths, { runId: run.id, phaseId, raisedBy: agent })
      });
      sendJson(res, 200, { ok: true, runId, agent });
      return true;
    }

    // Global orchestrator chat: advisory Q&A about progress, vision, and agent state.
    if (pathname === "/api/runs/orchestrator-chat" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const message = String(body.message || "").trim();
      if (!message) {
        sendJson(res, 400, { ok: false, error: "Message manquant." });
        return true;
      }
      // Live snapshot so the orchestrator can answer "what's happening right now".
      // Single source shared with the autopilot conductor (orchestrator-snapshot.js).
      const snapshot = (await buildOrchestratorSnapshot(config, paths)).text;
      // Clear any stale proposal so the client only sees THIS turn's actions.
      try { fs.rmSync(paths.orchestratorActionsFile, { force: true }); } catch {}
      const runId = startRun(config, {
        label: "Orchestrateur · Chat",
        kind: "chat",
        phaseId: null,
        agent: "@orchestrateur",
        prompt: buildOrchestratorChatPrompt({
          message,
          history: body.history,
          snapshot,
          actionsFileRel: "livrables/_governance/agent-io/orchestrator-actions.json"
        }),
        cwd: paths.workspaceRoot,
        // End of turn: apply the orchestrator's coordination decisions.
        //  1. Its planned next steps become first-class "todo" tasks (the validated plan).
        //  2. Its triage of candidates (promote/drop) is applied to the tray.
        onDone: () => {
          ingestOrchestratorActionsAsTasks(paths, { raisedBy: "@orchestrateur" });
          return applyOrchestratorTaskOps(paths);
        }
      });
      sendJson(res, 200, { ok: true, runId });
      return true;
    }

    // Read the actions the orchestrator proposed on its last turn (if any).
    if (pathname === "/api/orchestrator/actions" && req.method === "GET") {
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const raw = readTextSafe(paths.orchestratorActionsFile);
      let actions = [];
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          actions = Array.isArray(parsed) ? parsed : Array.isArray(parsed.actions) ? parsed.actions : [];
        } catch {}
      }
      sendJson(res, 200, { ok: true, actions });
      return true;
    }

    // Execute ONE orchestrator action the human confirmed.
    if (pathname === "/api/orchestrator/act" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const result = executeOrchestratorAction(config, paths, body.action || {});
      if (!result.ok) { sendJson(res, 400, result); return true; }
      // Its mirror task in the tray moves to in-progress so the same step isn't
      // left sitting as "todo" (and can't be launched twice by accident).
      try { markActionTaskLaunched(paths, body.action || {}, result.runId || result.groupId || null, "@orchestrateur"); } catch {}
      // Consume the proposal so it isn't offered again.
      try { fs.rmSync(paths.orchestratorActionsFile, { force: true }); } catch {}
      sendJson(res, 200, result);
      return true;
    }

    // --- Autopilot ("gestion automatique") : the orchestrator drives the chain itself. ---
    if (pathname === "/api/autopilot/status" && req.method === "GET") {
      sendJson(res, 200, { ok: true, ...getAutopilotStatus() });
      return true;
    }
    if (pathname === "/api/autopilot/start" && req.method === "POST") {
      const body = await readBody(req);
      // Optional settings passed from the toggle (budget / iterations / concurrency / escalation).
      if (body && body.settings && typeof body.settings === "object") {
        const config = loadConfig();
        saveConfig({ autopilot: { ...(config.autopilot || {}), ...body.settings } });
      }
      sendJson(res, 200, { ok: true, ...startAutopilot() });
      return true;
    }
    if (pathname === "/api/autopilot/stop" && req.method === "POST") {
      sendJson(res, 200, { ok: true, ...stopAutopilot() });
      return true;
    }
    // The human answers an escalation the conductor surfaced; the blocked agent then resumes.
    if (pathname === "/api/autopilot/answer" && req.method === "POST") {
      const body = await readBody(req);
      const result = answerEscalation(body || {});
      if (!result.ok) { sendJson(res, 400, result); return true; }
      sendJson(res, 200, { ok: true, ...result, status: getAutopilotStatus() });
      return true;
    }

    // Per-phase input documents (sources the agents must consume).
    if (pathname === "/api/inputs" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const result = addInput(paths, {
        phaseId: body.phaseId,
        filename: body.filename,
        contentBase64: body.contentBase64,
        description: body.description
      });
      if (!result.ok) {
        sendJson(res, 400, result);
        return true;
      }
      sendJson(res, 200, { ok: true, id: result.id, state: await buildProjectState(config) });
      return true;
    }
    if (pathname === "/api/inputs/status" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const result = setInputStatus(paths, String(body.id || ""), String(body.status || ""));
      sendJson(res, result.ok ? 200 : 400, result.ok ? { ok: true, state: await buildProjectState(config) } : result);
      return true;
    }
    if (pathname === "/api/inputs/remove" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const result = removeInput(paths, String(body.id || ""));
      sendJson(res, result.ok ? 200 : 400, result.ok ? { ok: true, state: await buildProjectState(config) } : result);
      return true;
    }

    // Human feedback on a deliverable (fed to the AI for revision).
    if (pathname === "/api/feedback" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const result = addFeedback(paths, {
        docPath: body.docPath,
        comment: body.comment,
        phaseId: body.phaseId,
        by: body.by
      });
      if (!result.ok) {
        sendJson(res, 400, result);
        return true;
      }
      const state = await buildProjectState(config);
      sendJson(res, 200, { ok: true, id: result.id, state });
      return true;
    }

    // New business need -> requalification mini-chain.
    if (pathname === "/api/runs/new-need" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const description = String(body.description || "").trim();
      if (!description) {
        sendJson(res, 400, { ok: false, error: "Décrivez le besoin." });
        return true;
      }
      const documents = Array.isArray(body.documents) ? body.documents.map(String) : [];
      // Durable dated record even if the AI run is interrupted.
      try {
        fs.mkdirSync(path.dirname(paths.newNeedsFile), { recursive: true });
        const date = new Date().toISOString().slice(0, 10);
        const entry = `\n## ${date} — Nouveau besoin\n\n${description}\n${documents.length ? `\nDocuments: ${documents.join(", ")}\n` : ""}`;
        fs.appendFileSync(paths.newNeedsFile, entry, "utf8");
      } catch {}
      const runId = startRun(config, {
        label: "Nouveau besoin · Requalification",
        kind: "new-need",
        phaseId: null,
        agent: "@project-bootstrapper",
        prompt: buildNewNeedPrompt(description, documents) + libraryPolicyText(config),
        cwd: paths.workspaceRoot,
        onDone: (run) => { ingestResolutions(paths); return ingestPendingInput(paths, { runId: run.id, phaseId: null, raisedBy: "Nouveau besoin" }); }
      });
      sendJson(res, 200, { ok: true, runId });
      return true;
    }

    // Resume a phase: hand the accumulated human answers back to the AI.
    if (pathname === "/api/runs/resume" && req.method === "POST") {
      const body = await readBody(req);
      const config = loadConfig();
      const paths = createWorkspacePaths(config.workspaceRoot);
      const fromRunId = String(body.runId || "").trim();
      const rawPhase = String(body.phaseId || "").trim();
      const phaseId = rawPhase && rawPhase !== "new-need" ? rawPhase : null;
      // A phaseId that isn't a known phase would crash the prompt builder (phase.id on undefined).
      if (phaseId && !PHASE_BY_ID[phaseId]) {
        sendJson(res, 400, { ok: false, error: "Étape inconnue pour la reprise." });
        return true;
      }
      const answers = readRunAnswers(paths, fromRunId);
      if (!answers.length) {
        sendJson(res, 400, { ok: false, error: "Aucune réponse à transmettre." });
        return true;
      }
      fs.mkdirSync(paths.stateDir, { recursive: true });
      fs.writeFileSync(paths.answersFile, JSON.stringify(answers, null, 2), "utf8");
      const phase = phaseId ? PHASE_BY_ID[phaseId] : null;
      const isNeed = !phaseId;
      const agent = phaseId ? PHASE_AGENTS[phaseId] || null : "@project-bootstrapper";
      const runId = startRun(config, {
        label: isNeed ? "Nouveau besoin · Reprise après réponses" : `${phaseId} · Reprise après réponses`,
        kind: "resume",
        phaseId,
        agent,
        prompt: buildResumePrompt({
          phaseLabel: isNeed ? "la prise en compte du nouveau besoin (propagation vers domaine, technique, UX, backlog)" : `${phase.id} ${phase.title}`,
          agent: agent || ""
        }) + libraryPolicyText(config),
        cwd: paths.workspaceRoot,
        onDone: (run) => {
          ingestResolutions(paths);
          const result = ingestPendingInput(paths, { runId: run.id, phaseId, raisedBy: agent || "Reprise" });
          // The raising agent has re-run and integrated the answers -> mark them applied.
          if (run.status === "done") markDecisionsApplied(paths, fromRunId);
          try { fs.rmSync(paths.answersFile, { force: true }); } catch {}
          return result;
        }
      });
      sendJson(res, 200, { ok: true, runId });
      return true;
    }

    if (pathname === "/api/runs" && req.method === "GET") {
      sendJson(res, 200, { ok: true, runs: listRuns() });
      return true;
    }

    // Currently-running agents & groups — lets the UI recover live state after a refresh.
    if (pathname === "/api/runs/active" && req.method === "GET") {
      const runs = listRuns()
        .filter((r) => r.status === "running")
        .map((r) => ({ id: r.id, label: r.label, phaseId: r.phaseId, agent: r.agent, kind: r.kind }));
      const groups = listGroups()
        .filter((g) => g.status === "running")
        .map((g) => ({ groupId: g.id, phaseId: g.phaseId, agents: g.agents }));
      sendJson(res, 200, { ok: true, runs, groups });
      return true;
    }

    const streamMatch = pathname.match(/^\/api\/runs\/([^/]+)\/stream$/);
    if (streamMatch && req.method === "GET") {
      subscribe(decodeURIComponent(streamMatch[1]), res);
      return true; // SSE keeps the connection open
    }

    const runMatch = pathname.match(/^\/api\/runs\/([^/]+)$/);
    if (runMatch && req.method === "GET") {
      const run = getRun(decodeURIComponent(runMatch[1]));
      sendJson(res, run ? 200 : 404, run ? { ok: true, run } : { ok: false, error: "Run introuvable." });
      return true;
    }

    if (pathname.startsWith("/api/")) {
      sendJson(res, 404, { ok: false, error: "Route inconnue." });
      return true;
    }
  } catch (err) {
    sendJson(res, 500, { ok: false, error: String(err && err.message ? err.message : err) });
    return true;
  }

  return false;
}
