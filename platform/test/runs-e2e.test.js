import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startRun, getRun, cancelRun, readRunMeta } from "../src/server/services/runs.js";
import { installRunHooks } from "../src/server/services/run-hooks.js";
import { resumeRun } from "../src/server/services/run-resume.js";
import { listDecisions, answerDecision } from "../src/server/services/decisions-store.js";
import { getSpend } from "../src/server/services/spend-store.js";
import { contractBlock } from "../src/server/services/run-prompts.js";
import { createWorkspacePaths } from "../src/server/config/paths.js";

// End-to-end through the real run engine, with a fake `claude` that speaks stream-json.
const here = path.dirname(fileURLToPath(import.meta.url));
const fakeSrc = path.join(here, "fixtures", "fake-claude.mjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sdlc-e2e-"));
const fake = path.join(tmp, "fake-claude.mjs"); // a path without spaces, for the shell spawn
fs.copyFileSync(fakeSrc, fake);

const config = {
  claudeCommand: `node "${fake}"`,
  permissionMode: "bypassPermissions",
  runLimits: { timeoutMinutes: 1, maxTurns: 0 },
  models: { default: "", byKind: {} },
  autoReview: false
};

installRunHooks();

function workspace() {
  const root = fs.mkdtempSync(path.join(tmp, "ws-"));
  return { root, paths: createWorkspacePaths(root) };
}

async function waitFinished(runId, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = getRun(runId);
    if (r && r.status !== "running" && /\[Terminé\]/.test(r.log)) {
      await new Promise((res) => setTimeout(res, 300)); // let the hooks finish
      return getRun(runId);
    }
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new Error(`run ${runId} toujours en cours`);
}

function calls(root) {
  return fs.readFileSync(path.join(root, "fake-claude-calls.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
}

test("un run écrit dans SES fichiers agent-io, est ingéré, coûte, puis reprend sa session", async () => {
  const { root, paths } = workspace();
  let onDoneCalled = false;
  const runId = startRun(config, {
    label: "G1 · test",
    kind: "phase",
    phaseId: "G1",
    agent: "@sponsor",
    prompt: `Produis la vision.\n${contractBlock()}`,
    cwd: root,
    onDone: () => { onDoneCalled = true; }
  });
  const run = await waitFinished(runId);
  assert.equal(run.status, "done");
  assert.ok(onDoneCalled);
  assert.equal(run.sessionId, "11111111-2222-4333-8444-555555555555");

  // The prompt pointed the agent at its own file, not the shared one.
  const first = calls(root)[0];
  assert.match(first.prompt, new RegExp(`pending-input-${runId}\\.json`));
  assert.doesNotMatch(first.prompt, /agent-io\/pending-input\.json/);

  // Its question was ingested (and the file consumed) by the run hooks.
  const pending = listDecisions(paths).filter((d) => d.status === "pending");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].runId, runId);
  assert.ok(!fs.existsSync(path.join(paths.agentIoDir, `pending-input-${runId}.json`)));

  // Cost from the result event is in the spend log; the session is in the run metadata.
  assert.equal(getSpend(paths, null).summary.totalCost, 0.42);
  assert.equal(readRunMeta(root, runId).sessionId, run.sessionId);

  // Answer → resume: same agent, same session (--resume), answers in a file of its own.
  const answered = answerDecision(paths, { id: pending[0].id, choiceLabel: "Le MVP", decidedBy: "sponsor" });
  assert.ok(answered.runFullyAnswered);
  const r = resumeRun(config, paths, runId, {});
  assert.ok(r.ok && r.sessionResumed);
  const resumed = await waitFinished(r.runId);
  assert.equal(resumed.status, "done");
  assert.equal(resumed.agent, "@sponsor");
  const second = calls(root)[1];
  assert.equal(second.args[second.args.indexOf("--resume") + 1], run.sessionId);
  assert.match(second.prompt, new RegExp(`answers-${runId}\\.json`));
  assert.ok(!fs.existsSync(path.join(paths.agentIoDir, `answers-${runId}.json`)), "fichier de réponses nettoyé");
  assert.equal(listDecisions(paths).find((d) => d.id === pending[0].id).status, "applied");
});

test("un run peut être arrêté par son PID et finit en erreur", async () => {
  const { root } = workspace();
  const runId = startRun(config, { label: "dormeur", kind: "chat", prompt: "SLEEP", cwd: root });
  await new Promise((res) => setTimeout(res, 1500));
  assert.equal(getRun(runId).status, "running");
  assert.ok(cancelRun(runId, "test").ok);
  const run = await waitFinished(runId);
  assert.equal(run.status, "error");
  assert.equal(run.cancelled, true);
});

test("un run orphelin retrouvé au redémarrage garde son coût, son statut et son ingestion", async () => {
  const { reconcileRuns } = await import("../src/server/services/runs.js");
  const { root, paths } = workspace();
  const runsDir = path.join(root, ".claude", "control-center", "runs");
  fs.mkdirSync(runsDir, { recursive: true });
  const id = "run-1-orphan";
  const rawFile = path.join(runsDir, `${id}.jsonl`);
  const events = [
    { type: "system", subtype: "init", session_id: "22222222-2222-4333-8444-555555555555", model: "claude-test" },
    { type: "assistant", message: { id: "m1", usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: "text", text: "fini" }] } },
    { type: "result", subtype: "success", is_error: false, total_cost_usd: 1.25, usage: { input_tokens: 10, output_tokens: 5 } }
  ];
  fs.writeFileSync(rawFile, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  const pendingFile = path.join(paths.agentIoDir, `pending-input-${id}.json`);
  fs.mkdirSync(paths.agentIoDir, { recursive: true });
  fs.writeFileSync(pendingFile, JSON.stringify({ items: [{ ref: "q1", type: "question", profile: "po", title: "Q orpheline" }] }));
  fs.writeFileSync(path.join(root, ".claude", "control-center", "active-runs.json"), JSON.stringify([{
    id, label: "orphelin", agent: "@po", phaseId: "G4", kind: "phase",
    pid: 999999, agentPid: 999999, startedAt: new Date().toISOString(),
    logFile: path.join(runsDir, `${id}.log`), rawFile, cwd: root, stateRoot: root
  }]));

  const r = reconcileRuns(paths, config);
  assert.equal(r.finalized, 1);
  const run = await waitFinished(id);
  assert.equal(run.status, "done");
  assert.equal(getSpend(paths, null).summary.totalCost, 1.25);
  assert.equal(listDecisions(paths).filter((d) => d.runId === id).length, 1);
});
