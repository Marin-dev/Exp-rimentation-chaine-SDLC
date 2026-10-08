import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRun } from "../src/server/services/runs.js";
import { installRunHooks } from "../src/server/services/run-hooks.js";
import { launchReview } from "../src/server/services/phase-runs.js";
import { appendSpend } from "../src/server/services/spend-store.js";
import { readGates } from "../src/server/services/gates.js";
import {
  readVerificationConfig,
  approveVerification,
  parseJUnit,
  lockAcceptance,
  checkAcceptanceLock,
  startVerification,
  readEvidence,
  enforceGateEvidence,
  setEvidencePolicy
} from "../src/server/services/verification.js";
import { createWorkspacePaths } from "../src/server/config/paths.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sdlc-verif-"));
const fake = path.join(tmp, "fake-claude.mjs");
fs.copyFileSync(path.join(here, "fixtures", "fake-claude.mjs"), fake);
const config = {
  claudeCommand: `node "${fake}"`,
  permissionMode: "bypassPermissions",
  runLimits: { timeoutMinutes: 1, maxTurns: 0 },
  models: { default: "", byKind: {} },
  autoReview: true
};
installRunHooks();

// A "product" whose acceptance tests are a script writing a JUnit report: US-001 always
// passes, US-002 passes only once the file `fixed` exists (the developer's fix).
const JUNIT_SCRIPT = `import fs from "node:fs";
const ok2 = fs.existsSync("fixed");
const c2 = ok2 ? '<testcase name="US-002 AC1 calcule le total"/>' : '<testcase name="US-002 AC1 calcule le total"><failure message="faux"/></testcase>';
fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync("reports/acceptance.xml", '<testsuites><testsuite name="acc"><testcase name="US-001 AC1 affiche la liste" classname="acc"/>' + c2 + '</testsuite></testsuites>');
process.exit(ok2 ? 0 : 1);
`;

function workspace() {
  const root = fs.mkdtempSync(path.join(tmp, "ws-"));
  const paths = createWorkspacePaths(root);
  fs.mkdirSync(path.join(root, "tests", "acceptance"), { recursive: true });
  fs.writeFileSync(path.join(root, "tests", "acceptance", "run.mjs"), JUNIT_SCRIPT);
  fs.mkdirSync(path.dirname(paths.acceptanceManifestFile), { recursive: true });
  fs.writeFileSync(paths.acceptanceManifestFile, JSON.stringify({
    stories: [
      { us: "US-001", title: "Liste", criteria: [{ id: "AC1", text: "…" }], tests: ["tests/acceptance/run.mjs"] },
      { us: "US-002", title: "Total", criteria: [{ id: "AC1", text: "…" }], tests: ["tests/acceptance/run.mjs"] }
    ]
  }));
  fs.writeFileSync(paths.verificationConfigFile, JSON.stringify({
    steps: [
      { id: "build", label: "Build", kind: "build", command: "node -v" },
      { id: "acceptance", label: "Acceptation", kind: "acceptance", command: "node tests/acceptance/run.mjs", junit: "reports/acceptance.xml" }
    ]
  }));
  fs.mkdirSync(paths.gatesDir, { recursive: true });
  return { root, paths };
}

async function waitDone(runId) {
  for (let i = 0; i < 200; i++) {
    const r = getRun(runId);
    if (r && r.status !== "running" && /\[Terminé\]/.test(r.log)) {
      await new Promise((res) => setTimeout(res, 300));
      return getRun(runId);
    }
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new Error("run toujours en cours");
}

test("verification.json : validation des étapes et des chemins", () => {
  const { paths } = workspace();
  const cfg = readVerificationConfig(paths);
  assert.ok(cfg.ok);
  assert.deepEqual(cfg.steps.map((s) => s.gates), [["G5", "G6"], ["G5", "G6"]]);
  fs.writeFileSync(paths.verificationConfigFile, JSON.stringify({ steps: [{ id: "x", command: "ls", cwd: "../ailleurs" }] }));
  assert.match(readVerificationConfig(paths).error, /hors du workspace/);
  fs.writeFileSync(paths.verificationConfigFile, JSON.stringify({ steps: [{ id: "x", command: "ls", junit: "C:/rapport.xml" }] }));
  assert.match(readVerificationConfig(paths).error, /hors du workspace/);
});

test("l'approbation porte sur une version précise des commandes", () => {
  const { paths } = workspace();
  const { hash } = readVerificationConfig(paths);
  assert.equal(approveVerification(paths, { hash: "autre" }).ok, false);
  assert.ok(approveVerification(paths, { hash }).ok);
  // The file changes after approval → the platform refuses to run it.
  fs.writeFileSync(paths.verificationConfigFile, JSON.stringify({ steps: [{ id: "evil", command: "node -e 1" }] }));
  const r = startVerification(config, paths, "G5");
  assert.equal(r.ok, false);
  assert.ok(r.needsApproval);
});

test("parseJUnit : réussis, échecs, ignorés", () => {
  const cases = parseJUnit(`<testsuite>
    <testcase name="US-001 AC1" classname="a"/>
    <testcase name="US-002 AC1"><failure>boom</failure></testcase>
    <testcase name='US-003 AC1' file="t.spec.ts"><skipped/></testcase>
  </testsuite>`);
  assert.deepEqual(cases.map((c) => c.status), ["pass", "fail", "skipped"]);
  assert.equal(cases[2].file, "t.spec.ts");
});

test("le verrou détecte un test d'acceptation modifié", () => {
  const { root, paths } = workspace();
  assert.ok(lockAcceptance(paths).ok);
  assert.deepEqual(checkAcceptanceLock(paths).modified, []);
  fs.appendFileSync(path.join(root, "tests", "acceptance", "run.mjs"), "\n// assouplissement\n");
  assert.deepEqual(checkAcceptanceLock(paths).modified, ["tests/acceptance/run.mjs"]);
});

test("preuves réelles : un échec ramène le gate à FAIL, la correction le laisse passer", async () => {
  const { root, paths } = workspace();
  setEvidencePolicy(paths, true);
  lockAcceptance(paths);
  approveVerification(paths, { hash: readVerificationConfig(paths).hash });
  const gateFile = path.join(paths.gatesDir, "G5-implementation-done.md");
  fs.writeFileSync(gateFile, "# G5\n\n**Status**: PASS\n\nTout est parfait selon le reviewer.\n");

  // 1. US-002 fails for real → the reviewer's PASS is capped to FAIL.
  let r = startVerification(config, paths, "G5");
  assert.ok(r.ok, r.error);
  await waitDone(r.runId);
  let ev = readEvidence(paths, "G5");
  assert.equal(ev.verdict, "FAIL");
  assert.deepEqual(ev.stories.map((s) => [s.us, s.status]), [["US-001", "pass"], ["US-002", "fail"]]);
  assert.ok(ev.reasons.some((x) => /US-002/.test(x)));
  assert.equal(readGates(paths).G5.status, "FAIL");
  assert.match(fs.readFileSync(gateFile, "utf8"), /imposé par SDLC Studio/);

  // 2. The developer fixes the product (not the test) → evidence passes, a PASS holds.
  fs.writeFileSync(path.join(root, "fixed"), "1");
  r = startVerification(config, paths, "G5");
  await waitDone(r.runId);
  ev = readEvidence(paths, "G5");
  assert.equal(ev.verdict, "PASS", ev.reasons.join(" / "));
  fs.writeFileSync(gateFile, "# G5\n\n**Status**: PASS\n");
  enforceGateEvidence(paths, "G5");
  assert.equal(readGates(paths).G5.status, "PASS");
  assert.match(fs.readFileSync(gateFile, "utf8"), /Preuves exécutables \(SDLC Studio\)/);

  // 3. The product changes after the verification → evidence is stale → FAIL again.
  appendSpend(root, { id: "dev", phaseId: "G5", kind: "parallel", endedAt: new Date(Date.now() + 1000).toISOString(), costUsd: 0 });
  enforceGateEvidence(paths, "G5");
  assert.equal(readGates(paths).G5.status, "FAIL");
  assert.match(fs.readFileSync(gateFile, "utf8"), /périmées/);
});

test("un test d'acceptation modifié par le dev fait échouer les preuves", async () => {
  const { root, paths } = workspace();
  lockAcceptance(paths);
  approveVerification(paths, { hash: readVerificationConfig(paths).hash });
  // "Fix" by weakening the test instead of the product.
  fs.writeFileSync(path.join(root, "tests", "acceptance", "run.mjs"), JUNIT_SCRIPT.replace("fs.existsSync(\"fixed\")", "true"));
  const r = startVerification(config, paths, "G5");
  await waitDone(r.runId);
  const ev = readEvidence(paths, "G5");
  assert.equal(ev.verdict, "FAIL");
  assert.ok(ev.reasons.some((x) => /modifiés depuis leur verrouillage/.test(x)));
});

test("revue G5 : la vérification est lancée d'abord, puis la revue enchaînée", async () => {
  const { paths } = workspace();
  approveVerification(paths, { hash: readVerificationConfig(paths).hash });
  const r = launchReview(config, paths, "G5");
  assert.ok(r.ok && r.verification);
  assert.equal(getRun(r.runId).kind, "verification");
  await waitDone(r.runId);
  // The hooks chained the review (fake claude) once the evidence existed.
  const callsFile = path.join(paths.workspaceRoot, "fake-claude-calls.jsonl");
  for (let i = 0; i < 150 && !fs.existsSync(callsFile); i++) await new Promise((res) => setTimeout(res, 100));
  const calls = fs.readFileSync(callsFile, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(calls.length, 1);
  assert.match(calls[0].prompt, /PREUVES EXÉCUTABLES/);
  assert.match(calls[0].prompt, /evidence\/G5\.md/);
});
