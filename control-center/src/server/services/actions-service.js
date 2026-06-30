import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { readMaybe } from "../utils/fs-utils.js";
import { isoStamp, slugify } from "../utils/text-utils.js";

export function createActionsService(configService) {
  const runs = new Map();

  async function buildPrompt({ agent, instruction, intakePath, extraContext, reviewContext, changeRequest }) {
    const { workspaceRoot } = await configService.getWorkspacePaths();
    const header = agent ? `${agent} :` : "Orchestrateur :";
    return `${header}

${instruction || ""}

Contexte de pilotage :
- Workspace: ${workspaceRoot}
${intakePath ? `- Dossier intake: ${intakePath}` : ""}
${reviewContext ? `- Revue humaine: ${reviewContext}` : ""}
${changeRequest ? `- Nouveau besoin: ${changeRequest}` : ""}
${extraContext ? `- Notes utilisateur: ${extraContext}` : ""}

Respecte CLAUDE.md et les règles sous .claude/rules.
`;
  }

  async function prepareAction(body) {
    const { actionsDir, workspaceRoot } = await configService.getWorkspacePaths();
    const agent = body.agent || "";
    const prompt = await buildPrompt(body);
    const slug = slugify(`${agent || "orchestrateur"}-${body.title || "action"}`);
    const filePath = path.join(actionsDir, `${isoStamp()}-${slug}.md`);
    await fs.mkdir(actionsDir, { recursive: true });
    await fs.writeFile(filePath, prompt, "utf8");
    return { prompt, actionFile: path.relative(workspaceRoot, filePath) };
  }

  async function runClaudeAction(body) {
    const config = await configService.getConfig();
    const { runsDir, workspaceRoot } = await configService.getWorkspacePaths();
    const available = await configService.isCommandAvailable(config.claudeCommand);
    if (!available) {
      const error = new Error(`Commande Claude Code introuvable: ${config.claudeCommand}`);
      error.status = 409;
      throw error;
    }
    const prepared = await prepareAction(body);
    const runId = `${isoStamp()}-${slugify(body.agent || "run")}`;
    const logPath = path.join(runsDir, `${runId}.log`);
    const args = (config.claudeArgs || []).map((arg) =>
      String(arg)
        .replace("{prompt}", prepared.prompt)
        .replace("{promptFile}", path.join(workspaceRoot, prepared.actionFile))
        .replace("{workspace}", workspaceRoot)
    );
    const run = {
      id: runId,
      agent: body.agent || "",
      status: "running",
      startedAt: new Date().toISOString(),
      command: config.claudeCommand,
      args,
      log: path.relative(workspaceRoot, logPath),
      actionFile: prepared.actionFile
    };
    runs.set(runId, run);
    await fs.mkdir(runsDir, { recursive: true });
    await fs.writeFile(logPath, `> ${config.claudeCommand} ${args.join(" ")}\n\n`, "utf8");

    const child = spawn(config.claudeCommand, args, {
      cwd: workspaceRoot,
      shell: false,
      env: process.env
    });
    child.stdout.on("data", (data) => fssync.appendFileSync(logPath, data));
    child.stderr.on("data", (data) => fssync.appendFileSync(logPath, data));
    child.on("error", (err) => {
      run.status = "failed";
      run.endedAt = new Date().toISOString();
      run.exitCode = null;
      fssync.appendFileSync(logPath, `\n[process error] ${err.message}\n`);
    });
    child.on("close", (code) => {
      run.status = code === 0 ? "completed" : "failed";
      run.endedAt = new Date().toISOString();
      run.exitCode = code;
      fssync.appendFileSync(logPath, `\n[exit code] ${code}\n`);
    });
    return run;
  }

  async function readRunLog(runId) {
    const { runsDir, workspaceRoot } = await configService.getWorkspacePaths();
    const run = runs.get(runId);
    const logPath = run ? path.join(workspaceRoot, run.log) : path.join(runsDir, `${runId}.log`);
    return await readMaybe(logPath);
  }

  function listRuns() {
    return [...runs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 20);
  }

  return { prepareAction, runClaudeAction, readRunLog, listRuns };
}
