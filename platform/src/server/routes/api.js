import { loadConfig, saveConfig } from "../config/store.js";
import { buildProjectState } from "../services/project-state.js";
import { readDeliverableContent } from "../services/deliverable-content.js";
import { createSkill } from "../services/resources.js";
import { createAgent } from "../services/agents.js";
import { searchExistingSkills } from "../services/skill-discovery.js";
import { createDecision, answerDecision, answerItemsAuto, readRunAnswers, reopenDecision } from "../services/decisions-store.js";
import { createWorkspacePaths, frameworkRoot } from "../config/paths.js";
import { startRun, getRun, subscribe, listRuns } from "../services/runs.js";
import { buildG0Prompt, buildResumePrompt, buildPhasePrompt, buildReviewPrompt, buildChatPrompt, buildNewNeedPrompt, libraryPolicyText } from "../services/run-prompts.js";
import { ingestPendingInput, ingestResolutions } from "../services/inbox-ingest.js";
import { scanIntake } from "../services/intake.js";
import { saveUpload } from "../services/uploads.js";
import { addFeedback } from "../services/feedback-store.js";
import { addInput, setInputStatus, removeInput, pendingInputsForPhase, markPhaseInputsConsidered } from "../services/inputs-store.js";
import { startApp, stopApp, appStatus } from "../services/app-runner.js";
import { getSpend } from "../services/spend-store.js";
import { buildActivity } from "../services/activity.js";
import { scaffoldProject } from "../services/project-scaffold.js";
import { pickFolder } from "../services/folder-picker.js";
import { gitStatus, gitAction } from "../services/git-service.js";
import { githubStatus, publish as githubPublish } from "../services/github-publish.js";
import { PHASE_BY_ID, PRODUCERS, REVIEWERS, PHASE_PARALLEL } from "../domain/phases.js";
import { startPhaseGroup, getGroup } from "../services/group-runner.js";
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
      const result = answerItemsAuto(paths, { ids: body.ids, decidedBy: body.decidedBy });
      if (!result.ok) {
        sendJson(res, 400, result);
        return true;
      }
      const state = await buildProjectState(config);
      sendJson(res, 200, { ok: true, count: result.count, resumableRuns: result.resumableRuns, state });
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
    const groupMatch = pathname.match(/^\/api\/runs\/group\/([^/]+)$/);
    if (groupMatch && req.method === "GET") {
      const group = getGroup(decodeURIComponent(groupMatch[1]));
      sendJson(res, group ? 200 : 404, group ? { ok: true, group } : { ok: false, error: "Groupe introuvable." });
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
        onDone: (run) => ingestPendingInput(paths, { runId: run.id, phaseId, raisedBy: reviewer })
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
