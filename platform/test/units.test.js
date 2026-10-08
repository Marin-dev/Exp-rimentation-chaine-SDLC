import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extractStatus } from "../src/server/services/fs-utils.js";
import { buildClaudeArgs, isolatePromptIo, captureEvent, runCostUsd } from "../src/server/services/runs.js";
import { buildDevBatches } from "../src/server/services/dev-batches.js";
import { appendSpend, getSpend } from "../src/server/services/spend-store.js";
import { buildPhasePrompt, buildRemediationPrompt, contractBlock } from "../src/server/services/run-prompts.js";
import { createWorkspacePaths } from "../src/server/config/paths.js";
import { PHASE_BY_ID } from "../src/server/domain/phases.js";

function tmpWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sdlc-test-"));
}

test("extractStatus lit les variantes de statut de gate", () => {
  assert.equal(extractStatus("**Status**: PASS"), "PASS");
  assert.equal(extractStatus("**Status**: **FAIL** (2 points bloquants)"), "FAIL");
  assert.equal(extractStatus("**Status**: `PASS_WITH_RISK` — R-G3-01"), "PASS_WITH_RISK");
  assert.equal(extractStatus("**Status** : pass with risk"), "PASS_WITH_RISK");
  assert.equal(extractStatus("pas de statut"), null);
});

test("buildClaudeArgs : modèle par type de run, max-turns, reprise de session", () => {
  const config = {
    permissionMode: "acceptEdits",
    models: { default: "", byKind: { plan: "sonnet" } },
    runLimits: { maxTurns: 40 }
  };
  const plan = buildClaudeArgs(config, { kind: "plan" });
  assert.deepEqual(plan.slice(0, 3), ["-p", "--permission-mode", "acceptEdits"]);
  assert.ok(plan.includes("--model") && plan[plan.indexOf("--model") + 1] === "sonnet");
  assert.ok(plan.includes("--max-turns") && plan[plan.indexOf("--max-turns") + 1] === "40");
  assert.ok(!buildClaudeArgs(config, { kind: "phase" }).includes("--model"));
  const sid = "0f8b2c7e-1111-4222-8333-444455556666";
  const resumed = buildClaudeArgs(config, { kind: "resume", resumeSessionId: sid });
  assert.equal(resumed[resumed.indexOf("--resume") + 1], sid);
  // Anything that could be read by a shell is refused.
  assert.ok(!buildClaudeArgs(config, { resumeSessionId: "x; rm -rf /" }).includes("--resume"));
  assert.ok(!buildClaudeArgs({ models: { default: "opus && calc" } }, {}).includes("--model"));
});

test("isolatePromptIo réécrit uniquement les fichiers agent-io partagés", () => {
  const prompt = [
    "livrables/_governance/agent-io/pending-input.json",
    "livrables/_governance/agent-io/risks.json",
    "livrables/_governance/agent-io/tasks.json",
    "livrables/_governance/agent-io/resolutions.json",
    "livrables/_governance/agent-io/pending-input-g5-dev-bc01.json",
    "livrables/_governance/agent-io/answers-run-1.json"
  ].join("\n");
  const out = isolatePromptIo(prompt, "run-9").split("\n");
  assert.equal(out[0], "livrables/_governance/agent-io/pending-input-run-9.json");
  assert.equal(out[1], "livrables/_governance/agent-io/risks-run-9.json");
  assert.equal(out[2], "livrables/_governance/agent-io/tasks-run-9.json");
  assert.equal(out[3], "livrables/_governance/agent-io/resolutions-run-9.json");
  assert.equal(out[4], "livrables/_governance/agent-io/pending-input-g5-dev-bc01.json");
  assert.equal(out[5], "livrables/_governance/agent-io/answers-run-1.json");
});

test("coût en direct : usage par message dédupliqué, puis coût réel du résultat", () => {
  const run = { liveUsage: new Map(), costUsd: 0, usage: null, model: null };
  const pricing = { default: "m", models: { m: { input: 1, output: 10, cacheWrite: 0, cacheRead: 0 } } };
  captureEvent(run, { type: "system", subtype: "init", session_id: "abc-12345678", model: "m" });
  const usage = { input_tokens: 1_000_000, output_tokens: 100_000 };
  // Same API message streamed twice (two content blocks): counted once.
  captureEvent(run, { type: "assistant", message: { id: "msg1", usage, content: [] } });
  captureEvent(run, { type: "assistant", message: { id: "msg1", usage, content: [] } });
  assert.equal(run.sessionId, "abc-12345678");
  assert.equal(runCostUsd(run, pricing), 2);
  captureEvent(run, { type: "result", subtype: "success", total_cost_usd: 3.5, usage });
  assert.equal(runCostUsd(run, pricing), 3.5);
  assert.deepEqual(run.resultEvent, { subtype: "success", isError: false });
});

test("dev par batch : intégration après une vague parallèle, consolidation en dernier", () => {
  const root = tmpWorkspace();
  const paths = createWorkspacePaths(root);
  const us = path.join(paths.livrablesDir, "05-backlog", "user-stories");
  fs.mkdirSync(us, { recursive: true });
  fs.writeFileSync(path.join(us, "US-001-a.md"), "# US-001 : A\n**Bounded Context**: BC-01\n");
  fs.writeFileSync(path.join(us, "US-002-b.md"), "# US-002 : B\n**Bounded Context**: BC-02\n");
  fs.writeFileSync(path.join(us, "US-003-c.md"), "# US-003 : C\n**Bounded Context**: BC-03\n");
  fs.mkdirSync(path.dirname(paths.devWavesFile), { recursive: true });
  fs.writeFileSync(paths.devWavesFile, JSON.stringify({ waves: [["BC-01", "BC-02"], ["BC-03"]] }));

  const { stages } = buildDevBatches(paths);
  const kinds = stages.map((s) => s.map((t) => t.kind).join("+"));
  assert.deepEqual(kinds, ["dev-lane+dev-lane", "dev-integrate", "dev-lane", "dev-consolidate"]);
  assert.deepEqual(stages[1][0].lanes.map((l) => l.bc), ["BC-01", "BC-02"]);
});

test("journal de dépense : ajout en fin de fichier, historique ancien toujours lu", () => {
  const root = tmpWorkspace();
  const paths = createWorkspacePaths(root);
  fs.mkdirSync(paths.stateDir, { recursive: true });
  fs.writeFileSync(paths.spendFile, JSON.stringify([{ id: "old", costUsd: 1 }]));
  appendSpend(root, { id: "a", costUsd: 2 });
  appendSpend(root, { id: "b", costUsd: 0.5 });
  const s1 = getSpend(paths, null);
  assert.equal(s1.summary.runCount, 3);
  assert.equal(s1.summary.totalCost, 3.5);
  appendSpend(root, { id: "c", costUsd: 1 });
  assert.equal(getSpend(paths, null).summary.totalCost, 4.5); // cache invalidated by the write
});

test("le producteur d'une étape avec reviewer ne décide pas le gate", () => {
  const g3 = buildPhasePrompt(PHASE_BY_ID.G3, {});
  assert.match(g3, /N'écris PAS la ligne \*\*Status\*\*/);
  const g6r = PHASE_BY_ID.G6R;
  if (g6r) assert.match(buildPhasePrompt(g6r, {}), /avec \*\*Status\*\*: PASS/);
  const rem = buildRemediationPrompt(PHASE_BY_ID.G5, "@developpeur", "FAIL");
  assert.match(rem, /NE MODIFIE PAS la ligne \*\*Status\*\*/);
});

test("le protocole ne renvoie plus vers un answers.json partagé", () => {
  assert.doesNotMatch(contractBlock(), /answers\.json/);
  assert.match(contractBlock(undefined, { answersFile: "livrables/_governance/agent-io/answers-run-1.json" }), /answers-run-1\.json/);
});
