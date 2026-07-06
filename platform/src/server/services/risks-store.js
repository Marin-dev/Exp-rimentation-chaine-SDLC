import fs from "node:fs";
import path from "node:path";
import { readTextSafe } from "./fs-utils.js";

/**
 * Risk register — risks as first-class, tracked objects (like decisions).
 * Lives in the machine-owned project-state.json (reliable source of truth);
 * on every status change a human-readable record is also written under
 * /livrables/_governance/risks/ (dual-write principle, mirrors decisions).
 *
 * Lifecycle: open → mitigating → resolved | accepted | closed  (reopen → open).
 */

export const RISK_STATUSES = ["open", "mitigating", "resolved", "accepted", "closed"];
export const OPEN_RISK_STATUSES = ["open", "mitigating"];
const SEVERITIES = ["low", "medium", "high", "critical"];

function load(paths) {
  const content = readTextSafe(paths.projectStateFile);
  if (!content) return { risks: [], riskSeq: 0 };
  try {
    const parsed = JSON.parse(content);
    // Spread `parsed` so we never drop the decisions slice living in the same file.
    return {
      ...parsed,
      risks: Array.isArray(parsed.risks) ? parsed.risks : [],
      riskSeq: Number.isInteger(parsed.riskSeq) ? parsed.riskSeq : 0
    };
  } catch {
    return { risks: [], riskSeq: 0 };
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

function normStatus(s) {
  const v = String(s || "").trim().toLowerCase();
  return RISK_STATUSES.includes(v) ? v : "open";
}

function normSeverity(s) {
  const v = String(s || "").trim().toLowerCase();
  return SEVERITIES.includes(v) ? v : "medium";
}

/** Build a normalized risk from raw input and bump the sequence when id is auto-generated. */
function buildRisk(data, input) {
  const provided = String(input.id || "").trim();
  let id = provided;
  let seq = data.riskSeq;
  if (!id) {
    seq = data.riskSeq + 1;
    const phasePart = String(input.phaseId || input.gate || "GEN").trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || "GEN";
    id = `R-${phasePart}-${String(seq).padStart(2, "0")}`;
  }
  const status = normStatus(input.status);
  const now = new Date().toISOString();
  const risk = {
    id,
    title: String(input.title || "").trim(),
    description: String(input.description || input.context || "").trim(),
    severity: normSeverity(input.severity),
    phaseId: String(input.phaseId || "").trim() || null,
    gate: String(input.gate || "").trim() || null,
    raisedBy: String(input.raisedBy || "").trim() || null,
    owner: String(input.owner || "").trim() || null,
    status,
    mitigation: String(input.mitigation || "").trim(),
    links: Array.isArray(input.links) ? input.links.map((l) => String(l)).filter(Boolean) : [],
    createdAt: now,
    updatedAt: now,
    history: [{ at: now, by: String(input.raisedBy || input.by || "").trim() || "—", from: null, to: status, note: String(input.note || "Risque identifié.").trim() }]
  };
  return { risk, seq };
}

export function createRisk(paths, input) {
  const title = String(input.title || "").trim();
  if (!title) return { ok: false, error: "Titre requis." };
  const data = load(paths);
  if (input.id && data.risks.some((r) => r.id === String(input.id).trim())) {
    return { ok: false, error: `Le risque « ${input.id} » existe déjà.` };
  }
  const { risk, seq } = buildRisk(data, input);
  data.risks.push(risk);
  data.riskSeq = seq;
  save(paths, data);
  writeRiskRecord(paths, risk);
  return { ok: true, id: risk.id };
}

export function listRisks(paths) {
  return load(paths).risks;
}

export function getRisk(paths, id) {
  const data = load(paths);
  return data.risks.find((r) => r.id === String(id || "").trim()) || null;
}

/**
 * Change a risk's status, appending a history entry. Also updates mitigation/owner
 * when provided. Dual-writes the human-readable record.
 */
export function updateRiskStatus(paths, input) {
  const id = String(input.id || "").trim();
  const data = load(paths);
  const risk = data.risks.find((r) => r.id === id);
  if (!risk) return { ok: false, error: "Risque introuvable." };
  const to = normStatus(input.status);
  const from = risk.status;
  const by = String(input.by || "").trim() || "—";
  const note = String(input.note || "").trim();
  if (typeof input.mitigation === "string" && input.mitigation.trim()) risk.mitigation = input.mitigation.trim();
  if (typeof input.owner === "string" && input.owner.trim()) risk.owner = input.owner.trim();
  risk.status = to;
  risk.updatedAt = new Date().toISOString();
  risk.history = Array.isArray(risk.history) ? risk.history : [];
  risk.history.push({ at: risk.updatedAt, by, from, to, note: note || `Statut : ${from} → ${to}` });
  save(paths, data);
  writeRiskRecord(paths, risk);
  return { ok: true, id, from, to };
}

/**
 * Bulk-ingest risks produced by an AI agent (agent-io/risks.json).
 * An item with a known id updates that risk (status/mitigation/owner);
 * an unknown or missing id creates a new risk. Idempotent by id.
 */
export function ingestRiskItems(paths, items, meta = {}) {
  if (!Array.isArray(items) || items.length === 0) return { created: 0, updated: 0 };
  const data = load(paths);
  let created = 0;
  let updated = 0;
  for (const raw of items) {
    if (!raw || !String(raw.title || raw.id || "").trim()) continue;
    const rawId = String(raw.id || "").trim();
    const existing = rawId ? data.risks.find((r) => r.id === rawId) : null;
    if (existing) {
      // Update in place — only move status when the agent asked for a different one.
      const to = raw.status ? normStatus(raw.status) : existing.status;
      const by = String(meta.raisedBy || raw.raisedBy || "").trim() || "—";
      if (typeof raw.mitigation === "string" && raw.mitigation.trim()) existing.mitigation = raw.mitigation.trim();
      if (typeof raw.owner === "string" && raw.owner.trim()) existing.owner = raw.owner.trim();
      if (to !== existing.status) {
        const from = existing.status;
        existing.status = to;
        existing.updatedAt = new Date().toISOString();
        existing.history = Array.isArray(existing.history) ? existing.history : [];
        existing.history.push({ at: existing.updatedAt, by, from, to, note: String(raw.note || `Mis à jour par ${by}`).trim() });
        updated += 1;
      }
      continue;
    }
    const { risk, seq } = buildRisk(data, {
      ...raw,
      raisedBy: raw.raisedBy || meta.raisedBy || "",
      phaseId: raw.phaseId || meta.phaseId || ""
    });
    data.risks.push(risk);
    data.riskSeq = seq;
    writeRiskRecord(paths, risk);
    created += 1;
  }
  save(paths, data);
  return { created, updated };
}

const STATUS_LABEL = {
  open: "Identifié",
  mitigating: "En traitement",
  resolved: "Résolu",
  accepted: "Accepté (risque assumé)",
  closed: "Clôturé"
};
const SEVERITY_LABEL = { low: "Faible", medium: "Moyen", high: "Élevé", critical: "Critique" };

function writeRiskRecord(paths, risk) {
  const dir = paths.risksDir;
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${risk.id}-${slug(risk.title)}.md`);
  const lines = [
    `# ${risk.id} : ${risk.title}`,
    "",
    `**Statut**: ${STATUS_LABEL[risk.status] || risk.status}`,
    `**Sévérité**: ${SEVERITY_LABEL[risk.severity] || risk.severity}`,
    risk.phaseId ? `**Phase/Gate**: ${risk.gate || risk.phaseId}` : null,
    risk.raisedBy ? `**Identifié par**: ${risk.raisedBy}` : null,
    risk.owner ? `**Propriétaire**: ${risk.owner}` : null,
    `**Créé le**: ${risk.createdAt}`,
    `**Mis à jour le**: ${risk.updatedAt}`,
    "",
    "## Description",
    "",
    risk.description || "—",
    ""
  ];
  if (risk.mitigation) lines.push("## Mitigation / prochaine action", "", risk.mitigation, "");
  if (risk.links && risk.links.length) {
    lines.push("## Liens", "");
    for (const l of risk.links) lines.push(`- ${l}`);
    lines.push("");
  }
  lines.push("## Historique", "");
  for (const h of risk.history || []) {
    const transition = h.from ? `${STATUS_LABEL[h.from] || h.from} → ${STATUS_LABEL[h.to] || h.to}` : STATUS_LABEL[h.to] || h.to;
    lines.push(`- ${h.at} — **${transition}** (${h.by})${h.note ? ` : ${h.note}` : ""}`);
  }
  lines.push("");
  fs.writeFileSync(file, lines.filter((l) => l !== null).join("\n"), "utf8");
}
