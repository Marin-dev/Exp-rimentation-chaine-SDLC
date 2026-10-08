import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { startCommandRun } from "./runs.js";
import { getSpend } from "./spend-store.js";
import { readGates } from "./gates.js";
import { readTextSafe } from "./fs-utils.js";
import { PHASE_BY_ID } from "../domain/phases.js";

/**
 * Executable gate evidence.
 *
 * G5 and G6 are not passed on an LLM's word. The platform itself runs the product's build
 * and tests — commands that @qa declares in livrables/07-tests/verification.json and that
 * a HUMAN approves (any change to the file needs a new approval) — reads the JUnit reports,
 * maps each test to its User Story (US-NNN in its name, class or file), and checks that the
 * acceptance tests written by @qa at G4 were not modified since (sha256 lock).
 *
 * The verdict is stored under .claude/control-center/evidence/ (agents can't write there),
 * mirrored as Markdown for reviewers, and ENFORCED on the gate file: a gate can only be
 * PASS / PASS_WITH_RISK when fresh evidence passes. The reviewer still judges what tests
 * can't measure (code quality, security, coverage of the criteria).
 *
 * Enforcement is a per-project policy (evidence-policy.json): on for new projects, opt-in
 * for projects created before it, so their already-passed gates aren't flipped silently.
 */

export const EVIDENCE_GATES = ["G5", "G6"];
const STEP_KINDS = ["install", "build", "lint", "unit", "acceptance", "e2e", "other"];
const DEFAULT_GATES_BY_KIND = {
  install: ["G5", "G6"], build: ["G5", "G6"], lint: ["G5", "G6"], unit: ["G5", "G6"],
  acceptance: ["G5", "G6"], e2e: ["G6"], other: ["G6"]
};
// Runs that only judge or plan don't change the product: they don't make evidence stale.
const NON_MUTATING_KINDS = new Set([
  "review", "verification", "plan", "app-detect", "support", "source-map", "coverage",
  "request-classify", "request-answer", "request-impact", "request-review"
]);
const US_RE = /US-\d+/i;
const REQ_RE = /REQ-\d+/i;
const MARK_START = "<!-- sdlc-evidence:start -->";
const MARK_END = "<!-- sdlc-evidence:end -->";

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

function readJson(file) {
  const raw = readTextSafe(file);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return undefined; }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

/** A workspace-relative path that stays inside the workspace, or null. */
function insideWorkspace(root, rel) {
  const v = String(rel || ".").trim() || ".";
  if (path.isAbsolute(v)) return null;
  const abs = path.resolve(root, v);
  const back = path.relative(root, abs);
  if (back.startsWith("..") || path.isAbsolute(back)) return null;
  return abs;
}

// ---------- policy ----------

export function readEvidencePolicy(paths) {
  const p = readJson(paths.evidencePolicyFile);
  return { enabled: Boolean(p && p.enabled), enabledAt: (p && p.enabledAt) || null };
}

export function setEvidencePolicy(paths, enabled) {
  const next = { enabled: Boolean(enabled), enabledAt: enabled ? new Date().toISOString() : null };
  writeJson(paths.evidencePolicyFile, next);
  return next;
}

// ---------- verification commands (written by @qa, approved by a human) ----------

/** Parse and validate verification.json. Returns { ok, steps, hash, error }. */
export function readVerificationConfig(paths) {
  const raw = readTextSafe(paths.verificationConfigFile);
  if (raw == null) return { ok: false, missing: true, steps: [], hash: null, error: "Aucune commande de vérification (livrables/07-tests/verification.json)." };
  const hash = sha256(raw);
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { return { ok: false, steps: [], hash, error: `verification.json illisible : ${e.message}` }; }
  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed && parsed.steps) ? parsed.steps : null;
  if (!list || !list.length) return { ok: false, steps: [], hash, error: "verification.json ne déclare aucune étape (steps)." };
  const steps = [];
  const seen = new Set();
  for (const [i, s] of list.entries()) {
    const id = String((s && s.id) || `step-${i + 1}`).trim();
    if (!/^[A-Za-z0-9][\w-]{0,40}$/.test(id) || seen.has(id)) return { ok: false, steps: [], hash, error: `Étape ${i + 1} : identifiant invalide ou en double (« ${id} »).` };
    seen.add(id);
    const command = String((s && s.command) || "").trim();
    if (!command || command.length > 2000) return { ok: false, steps: [], hash, error: `Étape « ${id} » : commande absente ou trop longue.` };
    const cwdRel = String((s && s.cwd) || ".").trim() || ".";
    const cwd = insideWorkspace(paths.workspaceRoot, cwdRel);
    if (!cwd) return { ok: false, steps: [], hash, error: `Étape « ${id} » : dossier hors du workspace (« ${cwdRel} »).` };
    const kind = STEP_KINDS.includes(s && s.kind) ? s.kind : "other";
    const junit = (Array.isArray(s && s.junit) ? s.junit : s && s.junit ? [s.junit] : [])
      .map((j) => String(j).trim())
      .filter(Boolean);
    for (const j of junit) {
      if (!insideWorkspace(paths.workspaceRoot, j)) return { ok: false, steps: [], hash, error: `Étape « ${id} » : rapport JUnit hors du workspace (« ${j} »).` };
    }
    const gates = Array.isArray(s && s.gates) && s.gates.length
      ? s.gates.map((g) => String(g).toUpperCase()).filter((g) => EVIDENCE_GATES.includes(g))
      : DEFAULT_GATES_BY_KIND[kind];
    const minutes = Math.min(120, Math.max(1, Number(s && s.timeoutMinutes) || 20));
    steps.push({
      id,
      label: String((s && s.label) || id).trim().slice(0, 120),
      command,
      cwdRel,
      cwd,
      kind,
      required: !(s && s.required === false),
      junit,
      gates,
      timeoutMs: minutes * 60000
    });
  }
  return { ok: true, steps, hash, error: null };
}

export function readApproval(paths) {
  return readJson(paths.verificationApprovalFile) || null;
}

/** A human approves THIS version of the commands (the hash must match the file on disk). */
export function approveVerification(paths, { hash, by }) {
  const cfg = readVerificationConfig(paths);
  if (!cfg.ok) return { ok: false, error: cfg.error };
  if (!hash || hash !== cfg.hash) return { ok: false, error: "Les commandes ont changé depuis l'affichage : relis-les avant d'approuver." };
  const approval = { hash: cfg.hash, approvedAt: new Date().toISOString(), by: by || null };
  writeJson(paths.verificationApprovalFile, approval);
  return { ok: true, approval };
}

// ---------- acceptance tests (written by @qa at G4, locked) ----------

/** The acceptance manifest: [{ us, title, criteria: [{id, text}], tests: [relative paths] }]. */
export function readManifest(paths) {
  const parsed = readJson(paths.acceptanceManifestFile);
  if (parsed == null) return { ok: false, missing: true, stories: [], regressions: [], error: "Aucun manifeste des tests d'acceptation." };
  if (parsed === undefined) return { ok: false, stories: [], regressions: [], error: "Manifeste des tests d'acceptation illisible." };
  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.stories) ? parsed.stories : [];
  const stories = list
    .map((s) => ({
      us: String((s && (s.us || s.id)) || "").toUpperCase().match(US_RE)?.[0]?.toUpperCase() || null,
      title: String((s && s.title) || ""),
      criteria: Array.isArray(s && s.criteria) ? s.criteria.map((c) => ({ id: String(c.id || ""), text: String(c.text || "") })) : [],
      tests: (Array.isArray(s && s.tests) ? s.tests : []).map((t) => String(t).trim()).filter(Boolean)
    }))
    .filter((s) => s.us);
  // Regression tests written by @qa to reproduce a reported bug (request desk).
  const regressions = (Array.isArray(parsed && parsed.regressions) ? parsed.regressions : [])
    .map((r) => ({
      id: String((r && r.id) || "").toUpperCase().match(REQ_RE)?.[0]?.toUpperCase() || null,
      title: String((r && r.title) || ""),
      tests: (Array.isArray(r && r.tests) ? r.tests : []).map((t) => String(t).trim()).filter(Boolean)
    }))
    .filter((r) => r.id);
  return { ok: true, stories, regressions, error: null };
}

function manifestFiles(paths, manifest) {
  const files = new Set();
  for (const s of [...manifest.stories, ...(manifest.regressions || [])]) for (const t of s.tests) if (insideWorkspace(paths.workspaceRoot, t)) files.add(t.split("\\").join("/"));
  return [...files].sort();
}

/** Record the sha256 of every acceptance test file (done when @qa finishes writing them). */
export function lockAcceptance(paths) {
  const manifest = readManifest(paths);
  if (!manifest.ok) return { ok: false, error: manifest.error };
  const files = {};
  for (const rel of manifestFiles(paths, manifest)) {
    const abs = insideWorkspace(paths.workspaceRoot, rel);
    try { files[rel] = sha256(fs.readFileSync(abs)); } catch { files[rel] = null; }
  }
  const manifestRaw = readTextSafe(paths.acceptanceManifestFile) || "";
  const lock = { lockedAt: new Date().toISOString(), manifestHash: sha256(manifestRaw), files };
  writeJson(paths.acceptanceLockFile, lock);
  return { ok: true, lock };
}

/** Compare the acceptance tests on disk with the lock. */
export function checkAcceptanceLock(paths) {
  const lock = readJson(paths.acceptanceLockFile);
  if (!lock) return { locked: false, lockedAt: null, modified: [], missing: [], manifestChanged: false };
  const modified = [];
  const missing = [];
  for (const [rel, hash] of Object.entries(lock.files || {})) {
    const abs = insideWorkspace(paths.workspaceRoot, rel);
    let now = null;
    try { now = sha256(fs.readFileSync(abs)); } catch {}
    if (now == null) missing.push(rel);
    else if (hash && now !== hash) modified.push(rel);
  }
  const manifestChanged = sha256(readTextSafe(paths.acceptanceManifestFile) || "") !== lock.manifestHash;
  return { locked: true, lockedAt: lock.lockedAt, modified, missing, manifestChanged };
}

// ---------- JUnit ----------

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i")) || tag.match(new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, "i"));
  return m ? m[1] : "";
}

/** Test cases of a JUnit XML report: [{ name, classname, file, status }]. */
export function parseJUnit(xml) {
  const cases = [];
  const re = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/gi;
  let m;
  while ((m = re.exec(String(xml || "")))) {
    const head = m[1];
    const body = m[3] || "";
    const status = /<(failure|error)\b/i.test(body) ? "fail" : /<skipped\b/i.test(body) ? "skipped" : "pass";
    cases.push({ name: attr(head, "name"), classname: attr(head, "classname"), file: attr(head, "file"), status });
  }
  return cases;
}

function usOfCase(c) {
  const m = `${c.name} ${c.classname} ${c.file}`.match(US_RE);
  return m ? m[0].toUpperCase() : null;
}

function reqOfCase(c) {
  const m = `${c.name} ${c.classname} ${c.file}`.match(REQ_RE);
  return m ? m[0].toUpperCase() : null;
}

// ---------- evidence ----------

function evidenceFile(paths, gateId) {
  return path.join(paths.evidenceDir, `${gateId}-latest.json`);
}

export function readEvidence(paths, gateId) {
  return readJson(evidenceFile(paths, gateId)) || null;
}

/** When the product last changed: end of the latest run of G5/G6 that could modify it. */
function lastProductChange(paths, gateId) {
  const phases = gateId === "G6" ? new Set(["G5", "G6"]) : new Set(["G5"]);
  let last = "";
  try {
    for (const r of getSpend(paths, null).records) {
      if (!phases.has(r.phaseId) || NON_MUTATING_KINDS.has(r.kind)) continue;
      const at = r.endedAt || r.startedAt || "";
      if (at > last) last = at;
    }
  } catch {}
  return last || null;
}

/** Evidence is fresh when no product-changing run ended after the verification started. */
export function isEvidenceFresh(paths, gateId, evidence) {
  if (!evidence) return false;
  const changed = lastProductChange(paths, gateId);
  return !changed || evidence.startedAt >= changed;
}

/** Turn the step outcomes into a verdict. Pure apart from reading reports and the lock. */
export function computeEvidence(paths, { gateId, steps, results, startedAt, configHash }) {
  const reasons = [];
  const warnings = [];
  const cases = [];
  const stepViews = steps.map((s) => {
    const r = results.find((x) => x.id === s.id) || { status: "skipped" };
    const reports = [];
    for (const j of s.junit) {
      const abs = insideWorkspace(paths.workspaceRoot, j);
      let st = null;
      try { st = fs.statSync(abs); } catch {}
      if (!st) { warnings.push(`Rapport JUnit absent : ${j} (étape « ${s.label} »).`); continue; }
      if (r.startedAt && st.mtime.toISOString() < r.startedAt) { warnings.push(`Rapport JUnit non régénéré par l'étape « ${s.label} » : ${j}.`); continue; }
      const parsed = parseJUnit(readTextSafe(abs));
      for (const c of parsed) cases.push({ ...c, step: s.id, kind: s.kind });
      reports.push({ file: j, cases: parsed.length, failed: parsed.filter((c) => c.status === "fail").length });
    }
    if (s.required && r.status !== "pass") reasons.push(`Étape obligatoire « ${s.label} » : ${r.status === "skipped" ? "non exécutée" : `échec${r.exitCode != null ? ` (code ${r.exitCode})` : ""}${r.timedOut ? ", délai dépassé" : ""}`}.`);
    return {
      id: s.id, label: s.label, kind: s.kind, command: s.command, cwd: s.cwdRel, required: s.required,
      status: r.status, exitCode: r.exitCode ?? null, timedOut: Boolean(r.timedOut), durationMs: r.durationMs || 0,
      reports, logTail: String(r.logTail || "").slice(-2500)
    };
  });

  // Acceptance per User Story.
  const manifest = readManifest(paths);
  const acceptanceSteps = stepViews.filter((s) => s.kind === "acceptance" || s.kind === "e2e");
  const hasReports = cases.some((c) => c.kind === "acceptance" || c.kind === "e2e");
  const stories = [];
  if (!manifest.ok) {
    reasons.push(manifest.missing ? "Aucun test d'acceptation (manifeste absent) : rien ne prouve que les User Stories sont satisfaites." : manifest.error);
  } else {
    if (!acceptanceSteps.length) reasons.push("Aucune étape de tests d'acceptation dans les commandes de vérification.");
    for (const st of manifest.stories) {
      const mine = cases.filter((c) => (c.kind === "acceptance" || c.kind === "e2e") && usOfCase(c) === st.us);
      let status;
      if (mine.length) status = mine.some((c) => c.status === "fail") ? "fail" : mine.every((c) => c.status === "skipped") ? "missing" : "pass";
      else if (!hasReports && acceptanceSteps.length) status = acceptanceSteps.every((s) => s.status === "pass") ? "pass-global" : "fail";
      else status = "missing";
      stories.push({ us: st.us, title: st.title, status, tests: mine.length, failed: mine.filter((c) => c.status === "fail").length });
    }
    if (!hasReports && acceptanceSteps.length) warnings.push("Pas de rapport JUnit pour les tests d'acceptation : résultat global de la commande, sans détail par User Story.");
    const failed = stories.filter((s) => s.status === "fail").map((s) => s.us);
    const missing = stories.filter((s) => s.status === "missing").map((s) => s.us);
    if (failed.length) reasons.push(`Tests d'acceptation en échec : ${failed.join(", ")}.`);
    if (missing.length) reasons.push(`User Stories sans test d'acceptation exécuté : ${missing.join(", ")}.`);
  }

  // Regression tests of reported bugs: a known open bug (its reproduction test still red)
  // keeps the gate from passing, and a fixed bug must stay fixed.
  const regressions = [];
  for (const rg of (manifest.ok && manifest.regressions) || []) {
    const mine = cases.filter((c) => reqOfCase(c) === rg.id);
    const status = !mine.length ? "missing" : mine.some((c) => c.status === "fail") ? "fail" : "pass";
    regressions.push({ id: rg.id, title: rg.title, status, tests: mine.length });
  }
  const openBugs = regressions.filter((r) => r.status === "fail").map((r) => r.id);
  if (openBugs.length) reasons.push(`Anomalies non corrigées (tests de non-régression en échec) : ${openBugs.join(", ")}.`);
  const unrun = regressions.filter((r) => r.status === "missing").map((r) => r.id);
  if (unrun.length) warnings.push(`Tests de non-régression non exécutés : ${unrun.join(", ")}.`);

  // Tests-first lock: the developer must make @qa's tests pass, not rewrite them.
  const lock = checkAcceptanceLock(paths);
  if (!lock.locked) warnings.push("Tests d'acceptation non verrouillés : impossible de prouver qu'ils n'ont pas été modifiés depuis leur écriture par @qa.");
  if (lock.modified.length) reasons.push(`Tests d'acceptation modifiés depuis leur verrouillage par @qa : ${lock.modified.join(", ")}.`);
  if (lock.missing.length) reasons.push(`Tests d'acceptation supprimés depuis leur verrouillage : ${lock.missing.join(", ")}.`);

  const total = cases.length;
  return {
    gateId,
    startedAt,
    endedAt: new Date().toISOString(),
    configHash,
    verdict: reasons.length ? "FAIL" : "PASS",
    reasons,
    warnings,
    steps: stepViews,
    tests: { total, passed: cases.filter((c) => c.status === "pass").length, failed: cases.filter((c) => c.status === "fail").length, skipped: cases.filter((c) => c.status === "skipped").length },
    stories,
    regressions,
    lock: { locked: lock.locked, lockedAt: lock.lockedAt, modified: lock.modified, missing: lock.missing }
  };
}

function evidenceMarkdown(ev) {
  const icon = (s) => (s === "pass" || s === "pass-global" ? "OK" : s === "skipped" ? "—" : s === "missing" ? "MANQUANT" : "ÉCHEC");
  const lines = [
    `# Preuves exécutables — ${ev.gateId}`,
    "",
    `**Verdict plateforme**: ${ev.verdict}`,
    `**Exécuté**: ${ev.startedAt} → ${ev.endedAt}`,
    `**Tests**: ${ev.tests.passed} réussis, ${ev.tests.failed} en échec, ${ev.tests.skipped} ignorés (${ev.tests.total} au total)`,
    "",
    "Ce fichier est un miroir en lecture : la plateforme se fie à sa propre copie, pas à celui-ci.",
    ""
  ];
  if (ev.reasons.length) lines.push("## Bloquant", "", ...ev.reasons.map((r) => `- ${r}`), "");
  if (ev.warnings.length) lines.push("## Avertissements", "", ...ev.warnings.map((r) => `- ${r}`), "");
  lines.push("## Étapes", "", "| Étape | Type | Obligatoire | Résultat | Durée |", "|---|---|---|---|---|");
  for (const s of ev.steps) lines.push(`| ${s.label} | ${s.kind} | ${s.required ? "oui" : "non"} | ${icon(s.status)}${s.exitCode != null ? ` (code ${s.exitCode})` : ""} | ${Math.round(s.durationMs / 1000)} s |`);
  if (ev.stories.length) {
    lines.push("", "## Acceptation par User Story", "", "| US | Titre | Résultat | Tests |", "|---|---|---|---|");
    for (const s of ev.stories) lines.push(`| ${s.us} | ${s.title || ""} | ${icon(s.status)} | ${s.tests}${s.failed ? ` (${s.failed} en échec)` : ""} |`);
  }
  const failing = ev.steps.filter((s) => s.status !== "pass" && s.logTail);
  if (failing.length) {
    lines.push("", "## Fin des journaux des étapes en échec", "");
    for (const s of failing) lines.push(`### ${s.label}`, "", "```", s.logTail.trim(), "```", "");
  }
  return lines.join("\n") + "\n";
}

function saveEvidence(paths, ev) {
  writeJson(evidenceFile(paths, ev.gateId), ev);
  writeJson(path.join(paths.evidenceDir, "history", `${ev.gateId}-${ev.startedAt.replace(/[:.]/g, "-")}.json`), ev);
  fs.mkdirSync(paths.evidenceMirrorDir, { recursive: true });
  fs.writeFileSync(path.join(paths.evidenceMirrorDir, `${ev.gateId}.md`), evidenceMarkdown(ev), "utf8");
}

/**
 * Run the approved verification commands of a gate. Returns { ok, runId, label } or
 * { ok:false, error }. `post` lets the caller chain the review once it ends.
 */
export function startVerification(config, paths, gateId, { post } = {}) {
  if (!EVIDENCE_GATES.includes(gateId)) return { ok: false, error: "Pas de vérification exécutable pour cette étape." };
  const cfg = readVerificationConfig(paths);
  if (!cfg.ok) return { ok: false, error: cfg.error };
  const approval = readApproval(paths);
  if (!approval || approval.hash !== cfg.hash) {
    return { ok: false, needsApproval: true, error: "Les commandes de vérification doivent être approuvées par un humain (onglet de l'étape, bloc Preuves exécutables)." };
  }
  const steps = cfg.steps.filter((s) => s.gates.includes(gateId));
  if (!steps.length) return { ok: false, error: `Aucune étape de vérification ne s'applique à ${gateId}.` };
  const startedAt = new Date().toISOString();
  const label = `${gateId} · Preuves exécutables`;
  const runId = startCommandRun(config, {
    label,
    kind: "verification",
    phaseId: gateId,
    cwd: paths.workspaceRoot,
    stateRoot: paths.workspaceRoot,
    steps: steps.map((s) => ({ id: s.id, label: s.label, command: s.command, cwd: s.cwd, timeoutMs: s.timeoutMs, stopOnFail: s.required && (s.kind === "install" || s.kind === "build") })),
    post,
    onDone: (run) => {
      if (run.cancelled) return;
      const ev = computeEvidence(paths, { gateId, steps, results: run.stepResults || [], startedAt, configHash: cfg.hash });
      saveEvidence(paths, ev);
    }
  });
  return { ok: true, runId, label };
}

// ---------- enforcement on the gate file ----------

function gateFilePath(paths, gateId) {
  const phase = PHASE_BY_ID[gateId];
  const existing = readGates(paths)[gateId];
  if (existing && existing.file) return path.join(paths.gatesDir, existing.file);
  return phase ? path.join(paths.gatesDir, `${phase.gateFile || gateId}.md`) : null;
}

/** Why a gate can't pass on the current evidence, or null when it can. */
export function evidenceBlocker(paths, gateId) {
  const ev = readEvidence(paths, gateId);
  if (!ev) return { reasons: ["Aucune preuve exécutable : la vérification n'a pas encore été lancée."], evidence: null };
  if (!isEvidenceFresh(paths, gateId, ev)) return { reasons: ["Preuves périmées : le produit a changé depuis la dernière vérification. Relancer la vérification."], evidence: ev };
  if (ev.verdict !== "PASS") return { reasons: ev.reasons, evidence: ev };
  return null;
}

/**
 * Apply the evidence to the gate file: a gate written PASS / PASS_WITH_RISK without
 * passing, fresh evidence is turned into FAIL, with the reasons. Either way the evidence
 * section of the gate is refreshed. No-op when the project's policy is off or the gate
 * file doesn't exist yet. Returns { changed, forced }.
 */
export function enforceGateEvidence(paths, gateId) {
  if (!EVIDENCE_GATES.includes(gateId) || !readEvidencePolicy(paths).enabled) return { changed: false, forced: false };
  const file = gateFilePath(paths, gateId);
  const content = file ? readTextSafe(file) : null;
  if (content == null) return { changed: false, forced: false };
  const status = (readGates(paths)[gateId] || {}).status;
  const passing = status === "PASS" || status === "PASS_WITH_RISK";
  const blocker = evidenceBlocker(paths, gateId);
  const ev = blocker ? blocker.evidence : readEvidence(paths, gateId);

  let next = content;
  const forced = Boolean(passing && blocker);
  if (forced) {
    next = /\*\*Status\*\*\s*:.*/i.test(next)
      ? next.replace(/\*\*Status\*\*\s*:.*/i, "**Status**: FAIL (imposé par SDLC Studio : preuves exécutables insuffisantes)")
      : `**Status**: FAIL (imposé par SDLC Studio : preuves exécutables insuffisantes)\n\n${next}`;
  }
  const section = [
    MARK_START,
    "## Preuves exécutables (SDLC Studio)",
    "",
    ev ? `Dernière vérification : ${ev.endedAt} — verdict **${ev.verdict}** (${ev.tests.passed}/${ev.tests.total} tests réussis). Détail : \`livrables/_governance/evidence/${gateId}.md\`.` : "Aucune vérification exécutée.",
    blocker ? "" : null,
    blocker ? "Bloquant pour le gate :" : null,
    ...(blocker ? blocker.reasons.map((r) => `- ${r}`) : []),
    forced ? "" : null,
    forced ? `Le reviewer avait conclu ${status} ; la plateforme a ramené le gate à FAIL tant que les preuves ne passent pas.` : null,
    MARK_END
  ].filter((l) => l !== null).join("\n");
  const markRe = new RegExp(`${MARK_START}[\\s\\S]*?${MARK_END}`);
  next = markRe.test(next) ? next.replace(markRe, section) : `${next.replace(/\s*$/, "")}\n\n${section}\n`;
  if (next === content) return { changed: false, forced: false };
  fs.writeFileSync(file, next, "utf8");
  return { changed: true, forced };
}

/** Enforce every evidence gate (after any run, and at startup). */
export function enforceAllEvidenceGates(paths) {
  const out = {};
  for (const g of EVIDENCE_GATES) out[g] = enforceGateEvidence(paths, g);
  return out;
}

/** Everything the UI shows about verification for this project. */
export function verificationOverview(paths) {
  const cfg = readVerificationConfig(paths);
  const approval = readApproval(paths);
  const manifest = readManifest(paths);
  const evidence = {};
  for (const g of EVIDENCE_GATES) {
    const ev = readEvidence(paths, g);
    evidence[g] = ev ? { ...ev, fresh: isEvidenceFresh(paths, g, ev) } : null;
  }
  return {
    policy: readEvidencePolicy(paths),
    config: {
      ok: cfg.ok,
      missing: Boolean(cfg.missing),
      error: cfg.error,
      hash: cfg.hash,
      steps: cfg.steps.map(({ cwd, timeoutMs, ...s }) => ({ ...s, timeoutMinutes: Math.round(timeoutMs / 60000) }))
    },
    approval,
    approved: Boolean(cfg.ok && approval && approval.hash === cfg.hash),
    manifest: {
      ok: manifest.ok,
      missing: Boolean(manifest.missing),
      error: manifest.error,
      stories: manifest.stories.length,
      tests: manifest.ok ? manifestFiles(paths, manifest).length : 0,
      withoutTests: manifest.stories.filter((s) => !s.tests.length).map((s) => s.us)
    },
    lock: checkAcceptanceLock(paths),
    evidence
  };
}
