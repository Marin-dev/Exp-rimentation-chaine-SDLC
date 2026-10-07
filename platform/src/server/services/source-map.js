import fs from "node:fs";
import path from "node:path";
import { readSourcesIndex, writeSourcesIndex } from "./source-ingest.js";
import { addInputRef, pruneSourceInputs } from "./inputs-store.js";
import { PHASE_BY_ID } from "../domain/phases.js";

/**
 * Bootstrap from a rich client folder — steps 2 and 3.
 *
 * The cartography agent classifies every ingested document into
 * livrables/_governance/agent-io/source-map.json. We merge that classification into
 * the sources index, let the human override it (phases, exclusion, reference flag),
 * then on validation route each document to the inputs of its target phases and write
 * one brief per phase (livrables/_sources/par-etape/<phase>.md) that switches the
 * phase agents into "reprise" mode.
 */

export const SOURCE_LEVELS = ["metier", "fonctionnel", "ux-ecrans", "technique", "securite", "planning", "autre"];
const ROUTABLE = new Set(["converted", "native", "partial"]);

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** Effective view of a source: the human override wins over the agent classification. */
export function effectiveSource(f) {
  const c = f.classification || {};
  const o = f.override || {};
  const phases = (o.phases || c.phases || []).filter((p) => PHASE_BY_ID[p]);
  return {
    ...f,
    title: c.title || path.basename(f.rel),
    level: o.level || c.level || null,
    phases,
    docType: o.docType || c.docType || "",
    summary: c.summary || "",
    reliability: c.reliability || null,
    relations: c.relations || [],
    excluded: Boolean(o.excluded),
    reference: o.reference != null ? Boolean(o.reference) : Boolean(c.reference),
    routable: ROUTABLE.has(f.kind) && f.status !== "removed"
  };
}

/** Full sources view for the UI. */
export function sourcesOverview(paths) {
  const index = readSourcesIndex(paths);
  if (!index) return { ok: true, ingested: false };
  const files = index.files.map(effectiveSource);
  const coverage = readJson(paths.coverageFile);
  return {
    ok: true,
    ingested: true,
    sourceFolder: index.sourceFolder,
    ingestedAt: index.ingestedAt,
    mappedAt: index.mappedAt,
    validatedAt: index.validatedAt,
    // Any ingestion change or human override clears validatedAt until the human validates again.
    pendingReview: !index.validatedAt,
    files,
    coverage: coverage && Array.isArray(coverage.items) ? coverage : null,
    levels: SOURCE_LEVELS
  };
}

/** Merge the cartography agent's output into the index (after a source-map run). */
export function ingestSourceMap(paths) {
  const index = readSourcesIndex(paths);
  const map = readJson(paths.sourceMapFile);
  if (!index || !map || !Array.isArray(map.documents)) return { merged: 0 };
  const byId = new Map(index.files.map((f) => [f.id, f]));
  let merged = 0;
  for (const d of map.documents) {
    const f = byId.get(String(d.id || "").toUpperCase());
    if (!f) continue;
    f.classification = {
      title: String(d.title || "").trim() || null,
      level: SOURCE_LEVELS.includes(d.level) ? d.level : "autre",
      phases: (Array.isArray(d.phases) ? d.phases : []).map((p) => String(p).toUpperCase()).filter((p) => PHASE_BY_ID[p]),
      docType: String(d.docType || "").trim(),
      summary: String(d.summary || "").trim(),
      reliability: d.reliability && typeof d.reliability === "object" ? d.reliability : null,
      reference: Boolean(d.reference),
      relations: Array.isArray(d.relations) ? d.relations : []
    };
    merged += 1;
  }
  index.mappedAt = new Date().toISOString();
  writeSourcesIndex(paths, index);
  return { merged };
}

/** Human override of one source's classification. Pass null to reset a field. */
export function updateSource(paths, id, patch) {
  const index = readSourcesIndex(paths);
  const f = index && index.files.find((x) => x.id === id);
  if (!f) return { ok: false, error: "Document introuvable." };
  const o = { ...(f.override || {}) };
  if ("phases" in patch) o.phases = Array.isArray(patch.phases) ? patch.phases.filter((p) => PHASE_BY_ID[p]) : undefined;
  if ("level" in patch) o.level = SOURCE_LEVELS.includes(patch.level) ? patch.level : undefined;
  if ("excluded" in patch) o.excluded = Boolean(patch.excluded);
  if ("reference" in patch) o.reference = Boolean(patch.reference);
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  f.override = Object.keys(o).length ? o : null;
  f.routedAt = null; // a changed affectation must be validated again
  index.validatedAt = null;
  writeSourcesIndex(paths, index);
  return { ok: true };
}

function phaseBrief(phaseId, sources) {
  const phase = PHASE_BY_ID[phaseId];
  const lines = [
    `# Sources client — ${phaseId} ${phase ? phase.title : ""}`.trim(),
    "",
    "Documents fournis par le client et affectés à cette étape (validés par l'humain).",
    "Les chemins `normalisé` sont lisibles directement ; l'original est conservé à l'identique.",
    ""
  ];
  for (const s of sources) {
    const rel = s.reliability || {};
    const reliability = [rel.version, rel.date, rel.status].filter(Boolean).join(" · ");
    lines.push(`## ${s.id} — ${s.title}${s.reference ? " (document de référence)" : ""}`);
    lines.push(`- Niveau : ${s.level || "non classé"}${s.docType ? ` · alimente : ${s.docType}` : ""}`);
    if (reliability) lines.push(`- Fiabilité : ${reliability}`);
    lines.push(`- Normalisé : \`${s.normalized}\``);
    lines.push(`- Original : \`${s.original}\``);
    if (s.kind === "partial") lines.push(`- Lecture partielle : ${s.note}`);
    if (s.summary) lines.push(`- Résumé : ${s.summary}`);
    for (const r of s.relations) {
      if (r && r.with) lines.push(`- ${r.type || "relation"} avec ${r.with}${r.topic ? ` : ${r.topic}` : ""}`);
    }
    if (s.figmaLinks && s.figmaLinks.length) lines.push(`- Liens Figma cités : ${s.figmaLinks.join(", ")}`);
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Validate the affectation: route every kept document to its phases' inputs and write
 * the per-phase briefs. Returns { ok, routed, phases }.
 */
export function validateSources(paths) {
  const index = readSourcesIndex(paths);
  if (!index) return { ok: false, error: "Aucune source ingérée." };
  const now = new Date().toISOString();
  const byPhase = new Map();
  let routed = 0;

  for (const f of index.files) {
    const s = effectiveSource(f);
    const keep = s.routable && !s.excluded ? s.phases : [];
    pruneSourceInputs(paths, f.id, keep);
    if (!keep.length) continue;
    const description = `[${f.id}] ${s.title}${s.reference ? " — document de référence" : ""}${s.summary ? ` — ${s.summary}` : ""}`;
    for (const phaseId of keep) {
      addInputRef(paths, { phaseId, relPath: f.normalized, description, sourceId: f.id });
      if (!byPhase.has(phaseId)) byPhase.set(phaseId, []);
      byPhase.get(phaseId).push(s);
    }
    f.routedAt = now;
    routed += 1;
  }

  fs.rmSync(paths.sourcesByPhaseDir, { recursive: true, force: true });
  fs.mkdirSync(paths.sourcesByPhaseDir, { recursive: true });
  for (const [phaseId, sources] of byPhase) {
    fs.writeFileSync(path.join(paths.sourcesByPhaseDir, `${phaseId}.md`), phaseBrief(phaseId, sources), "utf8");
  }
  index.validatedAt = now;
  writeSourcesIndex(paths, index);
  return { ok: true, routed, phases: [...byPhase.keys()].sort() };
}

/** Relative path of the per-phase brief (what the reprise-mode prompts point to). */
export function phaseBriefRel(phaseId) {
  return `livrables/_sources/par-etape/${phaseId}.md`;
}
