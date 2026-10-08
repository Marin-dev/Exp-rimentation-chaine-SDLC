import fs from "node:fs";
import path from "node:path";
import { readTextSafe } from "./fs-utils.js";
import { PROFILE_BY_ID } from "../domain/profiles.js";

/**
 * Decisions are the heart of the human-in-the-loop product.
 * They live in the machine-owned project-state.json (reliable source of truth);
 * when answered, a human-readable record is also written under
 * /livrables/_governance/decisions/ (dual-write principle).
 */

function load(paths) {
  const content = readTextSafe(paths.projectStateFile);
  if (!content) return { decisions: [], seq: 0 };
  try {
    const parsed = JSON.parse(content);
    return {
      ...parsed,
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
      seq: Number.isInteger(parsed.seq) ? parsed.seq : 0
    };
  } catch {
    return { decisions: [], seq: 0 };
  }
}

function save(paths, data) {
  fs.mkdirSync(path.dirname(paths.projectStateFile), { recursive: true });
  fs.writeFileSync(paths.projectStateFile, JSON.stringify(data, null, 2), "utf8");
}

function slug(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function createDecision(paths, input) {
  const title = String(input.title || "").trim();
  const targetProfile = String(input.targetProfile || "").trim();
  if (!title) return { ok: false, error: "Titre requis." };
  if (!PROFILE_BY_ID[targetProfile]) return { ok: false, error: "Profil cible invalide." };

  const data = load(paths);
  const { item, seq } = buildItem(data, input, targetProfile, title);
  data.decisions.push(item);
  data.seq = seq;
  save(paths, data);
  return { ok: true, id: item.id };
}

/** Build a normalized inbox item (question or decision) and bump the sequence. */
function buildItem(data, input, targetProfile, title) {
  const seq = data.seq + 1;
  const type = input.type === "question" ? "question" : "decision";
  const prefix = type === "question" ? "Q" : "DEC";
  const id = `${prefix}-${String(seq).padStart(4, "0")}`;
  const item = {
    id,
    type,
    runId: input.runId ? String(input.runId) : null,
    ref: input.ref ? String(input.ref) : null,
    // Set when the decision belongs to a request of the request desk.
    requestId: input.requestId ? String(input.requestId) : null,
    // A human must decide (e.g. the pilot accepting an enhancement): no delegation to an AI.
    humanOnly: Boolean(input.humanOnly),
    library: input.library ? String(input.library).trim() : null,
    title,
    summary: String(input.summary || "").trim(),
    context: String(input.context || "").trim(),
    raisedBy: String(input.raisedBy || "").trim(),
    targetProfile,
    phaseId: String(input.phaseId || "").trim() || null,
    severity: input.severity === "high" ? "high" : "normal",
    options: Array.isArray(input.options)
      ? input.options
          .map((o, i) => ({
            id: String(o.id || `opt-${i + 1}`),
            label: String(o.label || "").trim(),
            detail: String(o.detail || "").trim()
          }))
          .filter((o) => o.label)
      : [],
    evidence: Array.isArray(input.evidence)
      ? input.evidence.map((e) => String(e)).filter(Boolean)
      : [],
    status: "pending",
    createdAt: new Date().toISOString(),
    answer: null
  };
  return { item, seq };
}

/**
 * Bulk-ingest items produced by an AI agent (the structured output contract).
 * Each raw item: { ref, type, profile, title, context, severity, options }.
 */
export function createItems(paths, rawItems, meta = {}) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return { ok: true, ids: [] };
  const data = load(paths);
  const ids = [];
  for (const raw of rawItems) {
    const targetProfile = PROFILE_BY_ID[raw.profile] ? raw.profile : "orchestrateur";
    const title = String(raw.title || "").trim();
    if (!title) continue;
    // Skip duplicates already ingested from the same run+ref.
    if (meta.runId && raw.ref && data.decisions.some((d) => d.runId === meta.runId && d.ref === String(raw.ref))) {
      continue;
    }
    const { item, seq } = buildItem(
      data,
      {
        type: raw.type,
        ref: raw.ref,
        library: raw.library,
        runId: meta.runId || null,
        title,
        summary: raw.summary || raw.context || "",
        context: raw.context || "",
        raisedBy: meta.raisedBy || "",
        targetProfile,
        phaseId: meta.phaseId || null,
        severity: raw.severity,
        options: raw.options,
        evidence: raw.evidence
      },
      targetProfile,
      title
    );
    data.decisions.push(item);
    data.seq = seq;
    ids.push(item.id);
  }
  save(paths, data);
  return { ok: true, ids };
}

/** Read a single decision/question by id (source of truth = project-state.json). */
export function getDecision(paths, id) {
  const data = load(paths);
  return data.decisions.find((d) => d.id === String(id || "").trim()) || null;
}

/** Read the full list of decisions/questions (source of truth = project-state.json). */
export function listDecisions(paths) {
  return load(paths).decisions;
}

export function answerDecision(paths, input) {
  const id = String(input.id || "").trim();
  const data = load(paths);
  const decision = data.decisions.find((d) => d.id === id);
  if (!decision) return { ok: false, error: "Décision introuvable." };
  if (decision.status === "answered") return { ok: false, error: "Décision déjà tranchée." };

  const decidedBy = String(input.decidedBy || "").trim();
  const documents = Array.isArray(input.documents)
    ? input.documents.map((d) => String(d)).filter(Boolean)
    : [];
  let choiceLabel = String(input.choiceLabel || "").trim();
  if (input.optionId) {
    const opt = decision.options.find((o) => o.id === input.optionId);
    if (opt) choiceLabel = opt.label;
  }
  const delegated = Boolean(input.delegate);
  if (!choiceLabel && documents.length) {
    choiceLabel = documents.length > 1 ? `${documents.length} documents fournis` : "Document fourni";
  }
  if (!choiceLabel && delegated) {
    choiceLabel = "Délégué à l'IA (au mieux)";
  }
  if (!choiceLabel) return { ok: false, error: "Réponse requise (un choix, un texte ou un document)." };
  if (delegated && decision.humanOnly) return { ok: false, error: "Cette décision revient à un humain : elle ne peut pas être déléguée à l'IA." };

  decision.status = "answered";
  decision.answer = {
    optionId: input.optionId || null,
    choiceLabel,
    note: String(input.note || "").trim(),
    documents,
    delegated,
    decidedBy,
    decidedAt: new Date().toISOString()
  };
  save(paths, data);
  if (decision.type !== "question") writeDecisionRecord(paths, decision);
  if (decision.runId) appendRunAnswer(paths, decision);

  // If this was a library-approval decision answered affirmatively, tell the
  // caller so it can add the library to the approved list.
  let approvedLibrary = null;
  if (decision.library && !delegated) {
    const affirmative = /autoris|oui|approuv|accept|valide/i.test(choiceLabel) && !/refus|non|interdit|rejet/i.test(choiceLabel);
    if (affirmative) approvedLibrary = decision.library;
  }

  // Tell the caller whether the run this item belongs to is now fully answered.
  const runId = decision.runId;
  const runPending = runId
    ? data.decisions.filter((d) => d.runId === runId && d.status === "pending").length
    : 0;
  return {
    ok: true,
    id,
    runId: runId || null,
    runFullyAnswered: Boolean(runId) && runPending === 0,
    approvedLibrary
  };
}

/**
 * Mark every answered decision raised by `runId` as APPLIED — i.e. the raising agent
 * has re-run and integrated the human answer into the deliverables. Called when a
 * resume run completes successfully, so the human can SEE their answer was taken into account.
 */
export function markDecisionsApplied(paths, runId) {
  const id = String(runId || "").trim();
  if (!id) return { applied: 0 };
  const data = load(paths);
  let applied = 0;
  const now = new Date().toISOString();
  for (const d of data.decisions) {
    if (d.runId === id && d.status === "answered") {
      d.status = "applied";
      d.appliedAt = now;
      applied += 1;
    }
  }
  if (applied) save(paths, data);
  return { applied };
}

/** Mark specific answered decisions (by id) as applied — used after an integration run. */
export function markDecisionsAppliedByIds(paths, ids) {
  const set = new Set((ids || []).map((x) => String(x)));
  if (!set.size) return { applied: 0 };
  const data = load(paths);
  let applied = 0;
  const now = new Date().toISOString();
  for (const d of data.decisions) {
    if (set.has(d.id) && d.status === "answered") {
      d.status = "applied";
      d.appliedAt = now;
      applied += 1;
    }
  }
  if (applied) save(paths, data);
  return { applied };
}

/** Reopen an answered item (e.g. to correct the AI's delegated decision). */
export function reopenDecision(paths, id, reason) {
  const data = load(paths);
  const decision = data.decisions.find((d) => d.id === String(id).trim());
  if (!decision) return { ok: false, error: "Décision introuvable." };
  decision.status = "pending";
  decision.priorAnswer = decision.answer; // keep for context
  decision.answer = null;
  // A control audit can reopen with a reason so the target profile sees WHY
  // its prior answer was returned (incohérence / non documentée).
  const why = String(reason || "").trim();
  decision.reopenReason = why || null;
  save(paths, data);
  return { ok: true, id: decision.id };
}

/** Apply the AI's reported choices for delegated items (resolutions.json). */
export function applyResolutions(paths, resolutions) {
  if (!Array.isArray(resolutions) || !resolutions.length) return { applied: 0 };
  const data = load(paths);
  let applied = 0;
  for (const r of resolutions) {
    const id = String(r.id || "").trim();
    const item = data.decisions.find((d) => d.id === id);
    if (!item) continue;
    item.aiDecision = {
      decision: String(r.decision || "").trim(),
      rationale: String(r.rationale || "").trim(),
      at: new Date().toISOString()
    };
    applied += 1;
  }
  if (applied) save(paths, data);
  return { applied };
}

/** Accumulate human answers for a run so a follow-up AI run can read them. */
function appendRunAnswer(paths, item) {
  const dir = path.join(paths.stateDir, "answers");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${item.runId}.json`);
  let list = [];
  const existing = readTextSafe(file);
  if (existing) {
    try { list = JSON.parse(existing); } catch { list = []; }
  }
  if (!Array.isArray(list)) list = [];
  // A correction must replace the prior (e.g. delegated) answer for this item.
  list = list.filter((e) => e.id !== item.id);
  list.push({
    id: item.id,
    ref: item.ref,
    type: item.type,
    question: item.title,
    answer: item.answer.delegated
      ? "DÉLÉGUÉ — fais au mieux : choisis l'option la plus pertinente selon le contexte, les bonnes pratiques et le périmètre MVP, applique-la et DOCUMENTE clairement ton choix et sa justification. Ne repose pas cette question."
      : item.answer.choiceLabel,
    note: item.answer.note,
    documents: item.answer.documents || [],
    answeredBy: item.answer.decidedBy
  });
  fs.writeFileSync(file, JSON.stringify(list, null, 2), "utf8");
}

export function readRunAnswers(paths, runId) {
  const file = path.join(paths.stateDir, "answers", `${runId}.json`);
  const content = readTextSafe(file);
  if (!content) return [];
  try {
    const list = JSON.parse(content);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeDecisionRecord(paths, decision) {
  const dir = paths.decisionsDir;
  fs.mkdirSync(dir, { recursive: true });
  const profile = PROFILE_BY_ID[decision.answer.decidedBy];
  const decidedByLabel = profile ? profile.label : decision.answer.decidedBy || "—";
  const file = path.join(dir, `${decision.id}-${slug(decision.title)}.md`);
  const lines = [
    `# ${decision.id} : ${decision.title}`,
    "",
    "**Statut**: Décidé",
    `**Soulevé par**: ${decision.raisedBy || "—"}`,
    `**Décidé par**: ${decidedByLabel}`,
    `**Date**: ${decision.answer.decidedAt}`,
    decision.phaseId ? `**Phase**: ${decision.phaseId}` : null,
    "",
    "## Contexte",
    "",
    decision.context || decision.summary || "—",
    "",
    "## Décision",
    "",
    decision.answer.choiceLabel,
    ""
  ];
  if (decision.answer.note) {
    lines.push("## Justification", "", decision.answer.note, "");
  }
  if (decision.evidence.length) {
    lines.push("## Éléments consultés", "");
    for (const e of decision.evidence) lines.push(`- ${e}`);
    lines.push("");
  }
  fs.writeFileSync(file, lines.filter((l) => l !== null).join("\n"), "utf8");
}
