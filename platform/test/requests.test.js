import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installRunHooks } from "../src/server/services/run-hooks.js";
import { submitRequest, getRequest, reconcileRequests } from "../src/server/services/request-flow.js";
import { listDecisions, answerDecision } from "../src/server/services/decisions-store.js";
import { resolveViaAgent } from "../src/server/services/resolve-via-agent.js";
import { readVerificationConfig, approveVerification, lockAcceptance, readEvidence } from "../src/server/services/verification.js";
import { createWorkspacePaths } from "../src/server/config/paths.js";

// The three playbooks of the request desk, end to end, with a fake `claude` following a
// scenario and REAL verification commands (a script that writes a JUnit report).
const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sdlc-req-"));
const fake = path.join(tmp, "fake-claude.mjs");
fs.copyFileSync(path.join(here, "fixtures", "fake-claude.mjs"), fake);
const config = {
  claudeCommand: `node "${fake}"`,
  permissionMode: "bypassPermissions",
  runLimits: { timeoutMinutes: 1, maxTurns: 0 },
  models: { default: "", byKind: {} },
  autoReview: false
};
installRunHooks();

// The "product": US-001 always passes; REQ-001 (a bug) passes once `fixed-bug` exists;
// US-002 (an enhancement) passes once `feature-done` exists and is in the manifest.
const RUNNER = `import fs from "node:fs";
const m = JSON.parse(fs.readFileSync("livrables/07-tests/acceptance/manifest.json", "utf8"));
const cases = ['<testcase name="US-001 AC1 liste"/>'];
const fail = (n) => '<testcase name="' + n + '"><failure message="ko"/></testcase>';
let ok = true;
if ((m.regressions || []).some((r) => r.id === "REQ-001")) {
  if (fs.existsSync("fixed-bug")) cases.push('<testcase name="REQ-001 total sans remise"/>');
  else { cases.push(fail("REQ-001 total sans remise")); ok = false; }
}
if ((m.stories || []).some((s) => s.us === "US-002")) {
  if (fs.existsSync("feature-done")) cases.push('<testcase name="US-002 AC1 export"/>');
  else { cases.push(fail("US-002 AC1 export")); ok = false; }
}
fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync("reports/acc.xml", "<testsuite>" + cases.join("") + "</testsuite>");
process.exit(ok ? 0 : 1);
`;
const BASE_MANIFEST = { stories: [{ us: "US-001", title: "Liste", tests: ["tests/run.mjs"] }] };

function workspace(scenario) {
  const root = fs.mkdtempSync(path.join(tmp, "ws-"));
  const paths = createWorkspacePaths(root);
  fs.mkdirSync(path.join(root, "tests"), { recursive: true });
  fs.writeFileSync(path.join(root, "tests", "run.mjs"), RUNNER);
  fs.mkdirSync(path.dirname(paths.acceptanceManifestFile), { recursive: true });
  fs.writeFileSync(paths.acceptanceManifestFile, JSON.stringify(BASE_MANIFEST));
  fs.writeFileSync(paths.verificationConfigFile, JSON.stringify({
    steps: [{ id: "acceptance", label: "Acceptation", kind: "acceptance", command: "node tests/run.mjs", junit: "reports/acc.xml" }]
  }));
  approveVerification(paths, { hash: readVerificationConfig(paths).hash });
  lockAcceptance(paths);
  fs.writeFileSync(path.join(root, "fake-claude-script.json"), JSON.stringify({ noQuestions: true, ...scenario }));
  return { root, paths };
}

async function waitFor(paths, id, predicate, ms = 40000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const r = getRequest(paths, id);
    if (r && predicate(r)) return r;
    await new Promise((res) => setTimeout(res, 150));
  }
  const r = getRequest(paths, id);
  throw new Error(`délai dépassé — ${id} : ${r && r.status} / ${r && r.step} / ${r && (r.history || []).map((h) => h.msg).join(" | ")}`);
}

test("question : classée, répondue par l'agent du profil, sans rien modifier", async () => {
  const { paths } = workspace({
    classification: { output: { type: "question", title: "Rôle du PO", summary: "Qui valide les US ?", profile: "po", urgency: "normal" } },
    answer: { output: { answer: "Le PO valide les User Stories à G4.", sources: ["livrables/05-backlog/"], gap: null } }
  });
  const r = submitRequest(config, paths, { text: "Qui valide les user stories ?", by: "sponsor" });
  assert.ok(r.ok);
  const done = await waitFor(paths, r.id, (x) => x.status === "done");
  assert.equal(done.type, "question");
  assert.match(done.answer.text, /PO valide/);
  assert.equal(done.answer.by, "@po");
});

test("anomalie : test qui échoue d'abord, correction, preuve, revue", async () => {
  const withRegression = { ...BASE_MANIFEST, regressions: [{ id: "REQ-001", title: "Total", tests: ["tests/run.mjs"] }] };
  const { paths } = workspace({
    classification: { output: { type: "bug", title: "Total faux", us: ["US-001"], expected: "total sans remise", observed: "remise appliquée" } },
    repro: { output: { reproduced: true, tests: ["tests/run.mjs"], notes: "reproduit" }, files: { "livrables/07-tests/acceptance/manifest.json": JSON.stringify(withRegression) } },
    // First attempt fixes nothing; the second one does.
    review: { output: { approved: true, issues: [] } }
  });
  const scriptFile = path.join(paths.workspaceRoot, "fake-claude-script.json");
  const r = submitRequest(config, paths, { text: "Le total de la commande applique une remise à tort", by: "end-user" });

  // After reproduction the regression test is red; the first fix attempt changes nothing,
  // so verification fails and the desk loops back to the fix with the failure.
  await waitFor(paths, r.id, (x) => (x.attempts || 0) >= 2);
  const s = JSON.parse(fs.readFileSync(scriptFile, "utf8"));
  s.fix = { output: { summary: "remise retirée du total" }, files: { "fixed-bug": "1" } };
  fs.writeFileSync(scriptFile, JSON.stringify(s));

  const done = await waitFor(paths, r.id, (x) => x.status === "done" || x.status === "blocked");
  assert.equal(done.status, "done", (done.history || []).map((h) => h.msg).join(" | "));
  assert.ok(done.history.some((h) => /Nouvelle tentative/.test(h.msg)));
  const ev = readEvidence(paths, "G5");
  assert.equal(ev.regressions.find((x) => x.id === "REQ-001").status, "pass");
});

test("évolution : impact, décision humaine obligatoire, puis tests, dev et preuve", async () => {
  const withUs2 = { ...BASE_MANIFEST, stories: [...BASE_MANIFEST.stories, { us: "US-002", title: "Export", tests: ["tests/run.mjs"] }] };
  const { paths } = workspace({
    classification: { output: { type: "feature", title: "Export CSV", summary: "Exporter la liste en CSV" } },
    impact: { output: { summary: "Nouvelle US d'export.", newUs: [{ title: "Export CSV" }], estimateDays: { min: 1, max: 2 }, recommendation: "do-now" } },
    spec: { output: { us: ["US-002"] } },
    tests: { output: { tests: ["tests/run.mjs"] }, files: { "livrables/07-tests/acceptance/manifest.json": JSON.stringify(withUs2) } },
    dev: { output: { summary: "export CSV" }, files: { "feature-done": "1" } },
    review: { output: { approved: true, issues: [] } }
  });
  const r = submitRequest(config, paths, { text: "Je voudrais exporter la liste en CSV", by: "po" });
  const waiting = await waitFor(paths, r.id, (x) => x.step === "decision" && x.status === "waiting-human");
  const d = listDecisions(paths).find((x) => x.id === waiting.decisionId);
  assert.ok(d && d.humanOnly && d.requestId === r.id);
  // Neither an expert agent nor "fais au mieux" may take this decision.
  assert.equal(resolveViaAgent(config, paths, { id: d.id, mode: "delegate" }).ok, false);
  assert.equal(answerDecision(paths, { id: d.id, delegate: true }).ok, false);

  assert.ok(answerDecision(paths, { id: d.id, optionId: "approve", decidedBy: "orchestrateur" }).ok);
  reconcileRequests(config, paths);
  const done = await waitFor(paths, r.id, (x) => x.status === "done" || x.status === "blocked");
  assert.equal(done.status, "done", (done.history || []).map((h) => h.msg).join(" | "));
  assert.deepEqual(done.usIds, ["US-002"]);
  assert.equal(readEvidence(paths, "G5").stories.find((x) => x.us === "US-002").status, "pass");
});

test("évolution refusée par le chef de projet : demande close", async () => {
  const { paths } = workspace({
    classification: { output: { type: "feature", title: "Mode sombre" } },
    impact: { output: { summary: "Thème sombre.", recommendation: "later" } }
  });
  const r = submitRequest(config, paths, { text: "Un mode sombre", by: "po" });
  const waiting = await waitFor(paths, r.id, (x) => x.step === "decision");
  answerDecision(paths, { id: waiting.decisionId, optionId: "reject", decidedBy: "orchestrateur" });
  reconcileRequests(config, paths);
  assert.equal(getRequest(paths, r.id).status, "rejected");
});
