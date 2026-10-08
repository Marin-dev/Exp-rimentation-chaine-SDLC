import fs from "node:fs";
import path from "node:path";
import { startRun, getRun, listRuns, cancelRun } from "./runs.js";
import { startVerification, readEvidence } from "./verification.js";
import { buildUsReport } from "./dev-batches.js";
import { createDecision, getDecision, listDecisions } from "./decisions-store.js";
import { buildNewNeedPrompt, libraryPolicyText } from "./run-prompts.js";
import {
  requestOutputRel,
  buildClassifyPrompt,
  buildAnswerPrompt,
  buildReproducePrompt,
  buildFixPrompt,
  buildRequestReviewPrompt,
  buildImpactPrompt,
  buildSpecifyPrompt,
  buildScopedAcceptancePrompt,
  buildDevelopPrompt
} from "./request-prompts.js";
import { readTextSafe } from "./fs-utils.js";
import { PROFILE_BY_ID } from "../domain/profiles.js";

/**
 * Request desk ("guichet des demandes").
 *
 * Anyone — a user, the pilot — drops a request in plain words: a question, a broken
 * button, a feature they want. The orchestrator only CLASSIFIES it (one cheap LLM call);
 * then a FIXED playbook per type, written here in code, runs it to the end:
 *
 *   question     classify ─▶ answer (owner agent, read-only) ─▶ done
 *                            (a gap it reveals is offered as a new request)
 *   bug          classify ─▶ reproduce (@qa writes a FAILING regression test, locked)
 *                ─▶ fix (@developpeur) ─▶ verify (platform runs the tests) ─▶ review ─▶ done
 *                (verify / review failing ─▶ fix again, at most MAX_ATTEMPTS times)
 *   feature      classify ─▶ impact (@po) ─▶ DECISION of the pilot (human only)
 *                ─▶ specify (@po) ─▶ tests (@qa, before dev) ─▶ develop ─▶ verify ─▶ review ─▶ done
 *   spec-change  classify ─▶ requalify (the "new need" chain, reopens the gates) ─▶ done
 *
 * The LLM decides nothing about the route: only what to write at each step. A step that
 * touches the product (tests, code, build) waits while another one runs (queue by
 * priority), and agents' questions pause the step until they are answered.
 */

const MAX_ATTEMPTS = 3;
const TYPES = ["question", "bug", "feature", "spec-change"];
// Steps that change the product or its tests, or build it: one at a time.
const EXCLUSIVE = new Set(["reproduce", "fix", "verify", "specify", "tests", "develop", "requalify"]);
const OPEN = new Set(["new", "in-progress", "queued", "waiting-human", "blocked"]);
const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };
// Runs (outside the desk) that change the product: an exclusive step waits for them.
const PRODUCT_KINDS = new Set(["phase", "parallel", "orchestrated", "remediation", "resume", "verification", "acceptance-tests"]);

export const REQUEST_STEP_LABELS = {
  classify: "Analyse de la demande",
  answer: "Réponse",
  reproduce: "Reproduction par un test",
  fix: "Correction",
  verify: "Vérification exécutable",
  review: "Revue",
  impact: "Analyse d'impact",
  decision: "Décision du chef de projet",
  specify: "Spécification",
  tests: "Tests d'acceptation",
  develop: "Développement",
  requalify: "Requalification"
};

// ---------- store ----------

function load(paths) {
  const raw = readTextSafe(paths.requestsFile);
  if (!raw) return { seq: 0, requests: [] };
  try {
    const p = JSON.parse(raw);
    return { seq: Number(p.seq) || 0, requests: Array.isArray(p.requests) ? p.requests : [] };
  } catch {
    return { seq: 0, requests: [] };
  }
}

function save(paths, data) {
  fs.mkdirSync(path.dirname(paths.requestsFile), { recursive: true });
  fs.writeFileSync(paths.requestsFile, JSON.stringify(data, null, 2), "utf8");
}

/** Read-modify-write one request. fn(req) mutates it; returns the updated request. */
function update(paths, id, fn) {
  const data = load(paths);
  const req = data.requests.find((r) => r.id === id);
  if (!req) return null;
  fn(req);
  req.updatedAt = new Date().toISOString();
  save(paths, data);
  return req;
}

function note(req, msg, extra = {}) {
  req.history = req.history || [];
  req.history.push({ at: new Date().toISOString(), msg: String(msg).slice(0, 600), ...extra });
}

export function listRequests(paths) {
  return load(paths).requests.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getRequest(paths, id) {
  return load(paths).requests.find((r) => r.id === String(id || "").trim()) || null;
}

export function openRequestsCount(paths) {
  return load(paths).requests.filter((r) => OPEN.has(r.status)).length;
}

function readOutput(paths, id, step) {
  const file = path.join(paths.workspaceRoot, ...requestOutputRel(id, step).split("/"));
  const raw = readTextSafe(file);
  try { fs.rmSync(file, { force: true }); } catch {}
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// ---------- launching a step ----------

function productBusy(data) {
  const deskBusy = data.requests.some((r) => EXCLUSIVE.has(r.step) && r.status === "in-progress" && isRunning(r.currentRunId));
  const chainBusy = listRuns().some((r) => r.status === "running" && PRODUCT_KINDS.has(r.kind) && ["G4", "G5", "G6"].includes(r.phaseId));
  return deskBusy || chainBusy;
}

function isRunning(runId) {
  const r = runId ? getRun(runId) : null;
  return Boolean(r && r.status === "running");
}

function agentForProfile(profileId) {
  const p = PROFILE_BY_ID[profileId];
  return (p && p.agents && p.agents[0]) || "@po";
}

function stepRun(config, paths, req, step, { kind, agent, phaseId, prompt, lockAcceptance }) {
  return startRun(config, {
    label: `${req.id} · ${REQUEST_STEP_LABELS[step]}${agent ? ` · ${agent}` : ""}`,
    kind,
    phaseId,
    agent,
    prompt,
    cwd: paths.workspaceRoot,
    post: { request: { id: req.id, step }, ...(lockAcceptance ? { lockAcceptance: true } : {}) }
  });
}

function failuresText(req) {
  return (req.lastFailures || []).map((f) => `- ${f}`).join("\n");
}

/** Start one step of a request (or queue it). Returns { ok, runId?, queued?, error? }. */
function launch(config, paths, req, step) {
  const c = req.classification || {};
  switch (step) {
    case "classify": {
      const openRequests = listRequests(paths)
        .filter((r) => r.id !== req.id && OPEN.has(r.status))
        .map((r) => ({ id: r.id, type: r.type, title: (r.classification && r.classification.title) || r.text.slice(0, 80) }));
      const report = buildUsReport(paths);
      const stories = report.ok ? [...report.todo, ...report.developed].map((u) => ({ id: u.id, title: u.title })) : [];
      return { runId: stepRun(config, paths, req, step, { kind: "request-classify", agent: "@orchestrateur", phaseId: null, prompt: buildClassifyPrompt(req, { openRequests, stories }) }) };
    }
    case "answer": {
      const agent = agentForProfile(c.profile);
      return { runId: stepRun(config, paths, req, step, { kind: "request-answer", agent, phaseId: c.phaseId || null, prompt: buildAnswerPrompt(req, agent) }) };
    }
    case "reproduce":
      return { runId: stepRun(config, paths, req, step, { kind: "request-repro", agent: "@qa", phaseId: "G6", prompt: buildReproducePrompt(req) + libraryPolicyText(config), lockAcceptance: true }) };
    case "fix":
      return { runId: stepRun(config, paths, req, step, { kind: "request-fix", agent: "@developpeur", phaseId: "G5", prompt: buildFixPrompt(req, { attempt: req.attempts || 1, failures: failuresText(req) }) + libraryPolicyText(config) }) };
    case "verify": {
      const v = startVerification(config, paths, "G5", { post: { request: { id: req.id, step } } });
      return v.ok ? { runId: v.runId } : { error: v.error };
    }
    case "review":
      return { runId: stepRun(config, paths, req, step, { kind: "request-review", agent: "@code-quality-reviewer", phaseId: "G5", prompt: buildRequestReviewPrompt(req, { kind: req.type, usIds: req.usIds }) }) };
    case "impact":
      return { runId: stepRun(config, paths, req, step, { kind: "request-impact", agent: "@po", phaseId: c.phaseId || "G4", prompt: buildImpactPrompt(req) }) };
    case "specify":
      return { runId: stepRun(config, paths, req, step, { kind: "request-spec", agent: "@po", phaseId: "G4", prompt: buildSpecifyPrompt(req) }) };
    case "tests":
      return { runId: stepRun(config, paths, req, step, { kind: "request-tests", agent: "@qa", phaseId: "G4", prompt: buildScopedAcceptancePrompt(req, req.usIds || []) + libraryPolicyText(config), lockAcceptance: true }) };
    case "develop":
      return { runId: stepRun(config, paths, req, step, { kind: "request-dev", agent: "@developpeur", phaseId: "G5", prompt: buildDevelopPrompt(req, req.usIds || [], { attempt: req.attempts || 1, failures: failuresText(req) }) + libraryPolicyText(config) }) };
    case "requalify":
      return { runId: stepRun(config, paths, req, step, { kind: "request-requalify", agent: "@orchestrateur", phaseId: null, prompt: buildNewNeedPrompt(`${req.text}${c.summary ? `\n\nReformulation : ${c.summary}` : ""}`, []) + libraryPolicyText(config) }) };
    default:
      return { error: `Étape inconnue : ${step}` };
  }
}

/** Move a request to `step` and start it — or queue it behind work that touches the product. */
function goTo(config, paths, id, step, msg) {
  const data = load(paths);
  const req = data.requests.find((r) => r.id === id);
  if (!req) return { ok: false, error: "Demande introuvable." };
  req.step = step;
  if (msg) note(req, msg, { step });
  if (EXCLUSIVE.has(step) && productBusy(data)) {
    req.status = "queued";
    req.updatedAt = new Date().toISOString();
    save(paths, data);
    return { ok: true, queued: true };
  }
  save(paths, data);
  const r = launch(config, paths, req, step);
  update(paths, id, (x) => {
    if (r.error) {
      x.status = "blocked";
      x.blockedReason = r.error;
      note(x, `Bloqué : ${r.error}`, { step });
      return;
    }
    x.status = "in-progress";
    x.blockedReason = null;
    x.currentRunId = r.runId;
    x.runs = [...(x.runs || []), r.runId];
  });
  return r.error ? { ok: false, error: r.error } : { ok: true, runId: r.runId };
}

function block(paths, id, reason, status = "blocked") {
  update(paths, id, (x) => {
    x.status = status;
    x.blockedReason = reason;
    note(x, status === "waiting-human" ? `En attente : ${reason}` : `Bloqué : ${reason}`, { step: x.step });
  });
}

function finish(paths, id, status, msg, extra = {}) {
  update(paths, id, (x) => {
    x.status = status;
    x.step = null;
    x.blockedReason = null;
    x.currentRunId = null;
    x.closedAt = new Date().toISOString();
    Object.assign(x, extra);
    note(x, msg);
  });
}

// ---------- public actions ----------

export function submitRequest(config, paths, { text, by }) {
  const body = String(text || "").trim();
  if (!body) return { ok: false, error: "Décris ta demande." };
  const data = load(paths);
  data.seq += 1;
  const id = `REQ-${String(data.seq).padStart(3, "0")}`;
  const profile = PROFILE_BY_ID[by];
  const now = new Date().toISOString();
  data.requests.push({
    id,
    text: body.slice(0, 6000),
    by: profile ? by : null,
    byLabel: profile ? profile.label : null,
    createdAt: now,
    updatedAt: now,
    status: "new",
    step: null,
    type: null,
    priority: "normal",
    classification: null,
    attempts: 0,
    runs: [],
    comments: [],
    history: [{ at: now, msg: "Demande déposée." }]
  });
  save(paths, data);
  const r = goTo(config, paths, id, "classify");
  return { ok: true, id, runId: r.runId || null };
}

export function commentRequest(config, paths, { id, text, by }) {
  const body = String(text || "").trim();
  if (!body) return { ok: false, error: "Commentaire vide." };
  const profile = PROFILE_BY_ID[by];
  const req = update(paths, id, (x) => {
    x.comments = [...(x.comments || []), { at: new Date().toISOString(), by: by || null, byLabel: profile ? profile.label : null, text: body.slice(0, 3000) }];
    note(x, `Complément de ${profile ? profile.label : "l'équipe"}.`);
  });
  if (!req) return { ok: false, error: "Demande introuvable." };
  // A step that stopped for lack of information starts again with the new information.
  if ((req.status === "waiting-human" && !req.decisionId) || req.status === "blocked") return retryRequest(config, paths, { id });
  return { ok: true };
}

export function retryRequest(config, paths, { id }) {
  const req = getRequest(paths, id);
  if (!req) return { ok: false, error: "Demande introuvable." };
  if (!OPEN.has(req.status)) return { ok: false, error: "Cette demande est close." };
  if (isRunning(req.currentRunId)) return { ok: false, error: "Une étape est déjà en cours." };
  if (req.step === "decision") return { ok: false, error: "La demande attend la décision du chef de projet." };
  return goTo(config, paths, id, req.step || "classify", "Étape relancée.");
}

export function cancelRequest(paths, { id }) {
  const req = getRequest(paths, id);
  if (!req) return { ok: false, error: "Demande introuvable." };
  if (isRunning(req.currentRunId)) cancelRun(req.currentRunId, `Demande ${id} annulée.`);
  finish(paths, id, "cancelled", "Demande annulée.");
  return { ok: true };
}

export function setRequestPriority(paths, { id, priority }) {
  if (!PRIORITY_RANK.hasOwnProperty(priority)) return { ok: false, error: "Priorité invalide." };
  const req = update(paths, id, (x) => {
    x.priority = priority;
    note(x, `Priorité : ${priority}.`);
  });
  return req ? { ok: true } : { ok: false, error: "Demande introuvable." };
}

// ---------- end of a step ----------

/** Stories / regressions passing in the last G5 evidence (to catch a fix that breaks them). */
function snapshotPassing(paths) {
  const ev = readEvidence(paths, "G5");
  if (!ev) return [];
  return [
    ...(ev.stories || []).filter((s) => String(s.status).startsWith("pass")).map((s) => s.us),
    ...(ev.regressions || []).filter((r) => r.status === "pass").map((r) => r.id)
  ];
}

function verifyOutcome(paths, req) {
  const ev = readEvidence(paths, "G5");
  if (!ev) return { ok: false, failures: ["La vérification n'a produit aucune preuve."] };
  const status = new Map([
    ...(ev.stories || []).map((s) => [s.us, s.status]),
    ...(ev.regressions || []).map((r) => [r.id, r.status])
  ]);
  const passes = (k) => String(status.get(k) || "").startsWith("pass");
  const failures = [];
  const targets = req.type === "bug" ? [req.id] : req.usIds || [];
  for (const t of targets) if (!passes(t)) failures.push(`${t} : tests ${status.get(t) === "missing" ? "absents ou non exécutés" : "en échec"}.`);
  const broken = (req.baseline || []).filter((k) => !targets.includes(k) && !passes(k));
  if (broken.length) failures.push(`Régression : ${broken.join(", ")} passaient avant et échouent maintenant.`);
  const failedSteps = (ev.steps || []).filter((s) => s.required && s.status !== "pass" && s.kind !== "acceptance" && s.kind !== "e2e");
  for (const s of failedSteps) failures.push(`Étape « ${s.label} » en échec.`);
  return { ok: failures.length === 0, failures };
}

/** Loop back to fixing / developing, or give up after MAX_ATTEMPTS. */
function retryWork(config, paths, req, failures) {
  const work = req.type === "bug" ? "fix" : "develop";
  if ((req.attempts || 1) >= MAX_ATTEMPTS) {
    update(paths, req.id, (x) => { x.lastFailures = failures; });
    block(paths, req.id, `${MAX_ATTEMPTS} tentatives sans succès. Dernier constat : ${failures.join(" ")}`);
    return;
  }
  update(paths, req.id, (x) => {
    x.attempts = (x.attempts || 1) + 1;
    x.lastFailures = failures;
  });
  goTo(config, paths, req.id, work, `Nouvelle tentative (${(req.attempts || 1) + 1}/${MAX_ATTEMPTS}) : ${failures.join(" ")}`);
}

function startWork(config, paths, req, work) {
  update(paths, req.id, (x) => {
    x.attempts = 1;
    x.lastFailures = [];
    x.baseline = snapshotPassing(paths);
  });
  return goTo(config, paths, req.id, work);
}

/**
 * Called by the run hooks when ANY run ends: continues the request whose step it was.
 * A step whose agent asked questions waits for the answers (the resume carries the step).
 */
export function handleRequestRunDone(config, paths, run) {
  const info = run.post && run.post.request;
  if (!info) return;
  const req = getRequest(paths, info.id);
  if (!req || !OPEN.has(req.status) || req.step !== info.step) return;
  update(paths, req.id, (x) => { x.currentRunId = null; });
  if (run.cancelled) return block(paths, req.id, "Étape arrêtée.");
  if (run.status !== "done") return block(paths, req.id, "L'agent n'a pas abouti (voir le journal du run). Relance l'étape.");
  if (listDecisions(paths).some((d) => d.status === "pending" && d.runId === run.id)) {
    return block(paths, req.id, "l'agent a posé des questions (écran Décisions). L'étape reprendra après les réponses.", "waiting-human");
  }

  switch (info.step) {
    case "classify": {
      const out = readOutput(paths, req.id, "classification");
      if (!out || !TYPES.includes(out.type)) return block(paths, req.id, "Classement impossible : l'analyse n'a pas produit de résultat exploitable.");
      const dup = out.duplicateOf ? getRequest(paths, String(out.duplicateOf).toUpperCase()) : null;
      update(paths, req.id, (x) => {
        x.type = out.type;
        x.classification = {
          title: String(out.title || "").slice(0, 120),
          summary: String(out.summary || ""),
          us: Array.isArray(out.us) ? out.us.map(String) : [],
          screen: String(out.screen || ""),
          expected: String(out.expected || ""),
          observed: String(out.observed || ""),
          urgency: ["low", "normal", "high"].includes(out.urgency) ? out.urgency : "normal",
          profile: String(out.profile || ""),
          phaseId: String(out.phaseId || "") || null
        };
        if (x.priority === "normal" && out.urgency === "high") x.priority = "high";
        note(x, `Classée : ${({ question: "question", bug: "anomalie", feature: "évolution", "spec-change": "changement de cadrage" })[out.type]}.`);
      });
      if (dup && dup.id !== req.id && OPEN.has(dup.status)) {
        return finish(paths, req.id, "duplicate", `Doublon de ${dup.id}.`, { duplicateOf: dup.id });
      }
      const first = { question: "answer", bug: "reproduce", feature: "impact", "spec-change": "requalify" }[out.type];
      return goTo(config, paths, req.id, first);
    }
    case "answer": {
      const out = readOutput(paths, req.id, "answer");
      if (!out || !String(out.answer || "").trim()) return block(paths, req.id, "Pas de réponse produite.");
      const gap = out.gap && out.gap.summary ? { type: out.gap.type === "bug" ? "bug" : "feature", summary: String(out.gap.summary) } : null;
      return finish(paths, req.id, "done", "Réponse apportée.", {
        answer: { text: String(out.answer), sources: Array.isArray(out.sources) ? out.sources.map(String) : [], by: run.agent },
        suggestion: gap
      });
    }
    case "reproduce": {
      const out = readOutput(paths, req.id, "repro");
      if (!out || !out.reproduced) {
        update(paths, req.id, (x) => { x.reproNotes = out ? String(out.notes || "") : ""; });
        return block(paths, req.id, `Anomalie non reproduite${out && out.notes ? ` : ${out.notes}` : ""}. Ajoute un complément (étapes, données, capture) pour relancer.`, "waiting-human");
      }
      update(paths, req.id, (x) => {
        x.regressionTests = Array.isArray(out.tests) ? out.tests.map(String) : [];
        x.reproNotes = String(out.notes || "");
        note(x, `Reproduite par ${x.regressionTests.length} test(s).`);
      });
      return startWork(config, paths, getRequest(paths, req.id), "fix");
    }
    case "fix":
    case "develop": {
      const out = readOutput(paths, req.id, info.step === "fix" ? "fix" : "dev");
      if (out && out.summary) update(paths, req.id, (x) => note(x, `${info.step === "fix" ? "Correction" : "Développement"} : ${out.summary}`, { step: info.step }));
      return goTo(config, paths, req.id, "verify");
    }
    case "verify": {
      const res = verifyOutcome(paths, req);
      if (!res.ok) return retryWork(config, paths, req, res.failures);
      return goTo(config, paths, req.id, "review", "Tests réussis.");
    }
    case "review": {
      const out = readOutput(paths, req.id, "review");
      if (!out) return block(paths, req.id, "La revue n'a pas produit de verdict.");
      const issues = Array.isArray(out.issues) ? out.issues.map(String).filter(Boolean) : [];
      if (out.approved && !issues.length) {
        return finish(paths, req.id, "done", req.type === "bug" ? "Anomalie corrigée, prouvée par son test de non-régression et revue." : "Évolution livrée, prouvée par ses tests d'acceptation et revue.", { reviewNotes: String(out.notes || "") });
      }
      return retryWork(config, paths, req, issues.length ? issues : ["La revue n'a pas approuvé la modification."]);
    }
    case "impact": {
      const out = readOutput(paths, req.id, "impact");
      if (!out || !String(out.summary || "").trim()) return block(paths, req.id, "Pas d'analyse d'impact produite.");
      const days = out.estimateDays && (out.estimateDays.min || out.estimateDays.max) ? ` Charge estimée : ${out.estimateDays.min}–${out.estimateDays.max} j.` : "";
      const rec = { "do-now": "à faire maintenant", later: "à reporter", no: "à ne pas faire" }[out.recommendation] || "—";
      const context = [
        out.summary,
        out.affectedUs && out.affectedUs.length ? `User Stories touchées : ${out.affectedUs.join(", ")}.` : "",
        out.newUs && out.newUs.length ? `Nouvelles User Stories : ${out.newUs.map((u) => u.title).join(" ; ")}.` : "",
        out.gatesToReopen && out.gatesToReopen.length ? `Gates à rouvrir : ${out.gatesToReopen.join(", ")}.` : "",
        out.risks && out.risks.length ? `Risques : ${out.risks.join(" ; ")}.` : "",
        `${days} Recommandation du PO : ${rec}${out.rationale ? ` (${out.rationale})` : ""}.`
      ].filter(Boolean).join("\n");
      const c = req.classification || {};
      const d = createDecision(paths, {
        type: "decision",
        title: `Évolution ${req.id} : ${c.title || req.text.slice(0, 60)}`,
        summary: String(out.summary).slice(0, 400),
        context,
        targetProfile: "orchestrateur",
        severity: "high",
        phaseId: "G4",
        raisedBy: "Guichet des demandes",
        requestId: req.id,
        humanOnly: true,
        options: [
          { id: "approve", label: "Valider l'évolution", detail: "Spécification, tests d'acceptation, développement et vérification s'enchaînent." },
          { id: "defer", label: "Reporter", detail: "La demande est mise de côté." },
          { id: "reject", label: "Refuser", detail: "La demande est close." }
        ]
      });
      update(paths, req.id, (x) => {
        x.impact = out;
        x.step = "decision";
        x.decisionId = d.ok ? d.id : null;
        x.status = "waiting-human";
        note(x, `Analyse d'impact faite : décision ${d.ok ? d.id : ""} soumise au chef de projet.`, { step: "decision" });
      });
      return;
    }
    case "specify": {
      const out = readOutput(paths, req.id, "spec");
      const us = out && Array.isArray(out.us) ? out.us.map((u) => String(u).toUpperCase()).filter((u) => /^US-\d+$/.test(u)) : [];
      if (!us.length) return block(paths, req.id, "Aucune User Story créée ou modifiée.");
      update(paths, req.id, (x) => {
        x.usIds = us;
        note(x, `Spécifiée : ${us.join(", ")}.`);
      });
      return goTo(config, paths, req.id, "tests");
    }
    case "tests":
      readOutput(paths, req.id, "tests");
      return startWork(config, paths, getRequest(paths, req.id), "develop");
    case "requalify":
      return finish(paths, req.id, "done", "Changement de cadrage pris en compte : les livrables et gates concernés ont été requalifiés.");
    default:
      return undefined;
  }
}

/**
 * Advance what doesn't end with a run: a pilot's decision answered, a queued step whose
 * turn has come. Called after every run and after a decision is answered.
 */
export function reconcileRequests(config, paths) {
  for (const req of load(paths).requests) {
    if (req.step !== "decision" || req.status !== "waiting-human" || !req.decisionId) continue;
    const d = getDecision(paths, req.decisionId);
    if (!d || d.status === "pending" || !d.answer) continue;
    const label = String(d.answer.choiceLabel || "");
    const noteText = String(d.answer.note || "");
    // The option clicked decides; a free-text answer is read for a refusal or a postponement.
    const opt = d.answer.optionId;
    if (opt === "reject" || (!opt && /^refus|rejet/i.test(label))) {
      finish(paths, req.id, "rejected", `Évolution refusée par le chef de projet.${noteText ? ` ${noteText}` : ""}`);
    } else if (opt === "defer" || (!opt && /^report|plus tard/i.test(label))) {
      finish(paths, req.id, "deferred", `Évolution reportée par le chef de projet.${noteText ? ` ${noteText}` : ""}`);
    } else {
      update(paths, req.id, (x) => {
        x.decisionNote = [opt === "approve" ? "" : label, noteText].filter(Boolean).join(" — ");
      });
      goTo(config, paths, req.id, "specify", "Évolution validée par le chef de projet.");
    }
  }
  // Queue: the highest-priority, oldest queued request starts when the product is free.
  const data = load(paths);
  if (productBusy(data)) return;
  const next = data.requests
    .filter((r) => r.status === "queued" && r.step)
    .sort((a, b) => (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) || (a.createdAt < b.createdAt ? -1 : 1))[0];
  if (next) goTo(config, paths, next.id, next.step, "Au tour de cette demande.");
}
