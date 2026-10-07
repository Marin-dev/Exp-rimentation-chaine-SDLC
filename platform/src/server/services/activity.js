import path from "node:path";
import { createWorkspacePaths } from "../config/paths.js";
import { PHASES, PHASE_BY_ID } from "../domain/phases.js";
import { PROFILES } from "../domain/profiles.js";
import { getSpend } from "./spend-store.js";
import { readTextSafe } from "./fs-utils.js";

/**
 * Activity journal. Turns the persisted run records (spend.json) into a
 * human-readable history: for every agent that was called, WHAT it did
 * (kind of work + concrete deliverables written + decisions it raised),
 * plus a per-phase rollup of that activity. Read-only.
 */

// Which human profile speaks through each AI agent handle.
const AGENT_TO_PROFILE = {};
for (const p of PROFILES) for (const a of p.agents || []) AGENT_TO_PROFILE[a] = p;

const KIND_LABELS = {
  g0: "Cadrage initial",
  phase: "Production des livrables",
  parallel: "Production en parallèle",
  review: "Revue et décision de gate",
  chat: "Échange / consigne",
  resume: "Reprise après réponses",
  "new-need": "Requalification d'un besoin",
  orchestrated: "Tâche pilotée par l'orchestrateur",
  remediation: "Correction des risques",
  resolution: "Résolution d'une décision (expert)",
  "risk-seed": "Amorçage des risques",
  "task-batch": "Traitement d'un lot de tâches",
  "app-detect": "Détection du lancement du produit"
};

function describe(rec, phaseTitle) {
  const who = rec.agent || "les agents de l'étape";
  switch (rec.kind) {
    case "g0":
      return "Analyse des documents d'intake et structuration du besoin projet.";
    case "phase":
      return `Production des livrables de l'étape « ${phaseTitle} » par ${who}.`;
    case "parallel":
      return `Exécution en parallèle des agents producteurs de l'étape « ${phaseTitle} ».`;
    case "review":
      return `Revue indépendante des livrables de « ${phaseTitle} » et décision de gate.`;
    case "chat":
      return `Échange / consigne sur l'étape « ${phaseTitle} ».`;
    case "resume":
      return `Reprise du travail sur « ${phaseTitle} » après les réponses humaines.`;
    case "new-need":
      return "Requalification d'un nouveau besoin métier dans la chaîne.";
    case "orchestrated":
      return `Tâche confiée par l'orchestrateur à ${who}${phaseTitle && phaseTitle !== "—" ? ` (${phaseTitle})` : ""}.`;
    case "remediation":
      return `Correction des points bloquants de « ${phaseTitle} » par ${who}.`;
    case "resolution":
      return `Résolution d'une décision par ${who} (délégation à l'agent expert).`;
    case "risk-seed":
      return "Amorçage du registre des risques.";
    case "task-batch":
      return `Traitement d'un lot de tâches par ${who}.`;
    case "app-detect":
      return "Détection de la configuration de lancement du produit livré.";
    default:
      return rec.label || "Action d'agent.";
  }
}

/** Extract the deliverable files an agent wrote/edited, parsed from its run log. */
function filesFromLog(runsDir, runId) {
  const txt = readTextSafe(path.join(runsDir, `${runId}.log`));
  if (!txt) return [];
  const set = new Set();
  const re = /→\s+(?:Écriture|Modification)\s+·\s+(.+)/g;
  let m;
  while ((m = re.exec(txt)) !== null) {
    let p = m[1].trim().replace(/\\/g, "/");
    const idx = p.indexOf("livrables/");
    if (idx !== -1) p = p.slice(idx);
    // Keep deliverable-looking paths only (skip machine state / logs).
    if (p.includes("control-center") || p.includes("agent-io")) continue;
    set.add(p);
  }
  return [...set].slice(0, 30);
}

export function buildActivity(config) {
  const paths = createWorkspacePaths(config.workspaceRoot);
  // getSpend already computes effective cost and returns the last 100 runs, newest first.
  const { records } = getSpend(paths, config.pricing);

  // Decisions raised, indexed by the run that produced them.
  let structured = {};
  try {
    structured = JSON.parse(readTextSafe(paths.projectStateFile) || "{}");
  } catch {
    structured = {};
  }
  const decisions = Array.isArray(structured.decisions) ? structured.decisions : [];
  const decByRun = {};
  for (const d of decisions) {
    if (!d.runId) continue;
    (decByRun[d.runId] = decByRun[d.runId] || []).push({
      id: d.id,
      title: d.title || d.question || "Décision",
      status: d.status
    });
  }

  const timeline = records.map((r) => {
    const phase = PHASE_BY_ID[r.phaseId];
    const phaseTitle = phase ? phase.title : r.phaseId || "—";
    const prof = r.agent ? AGENT_TO_PROFILE[r.agent] : null;
    const decs = decByRun[r.id] || [];
    return {
      id: r.id,
      label: r.label,
      kind: r.kind || null,
      kindLabel: KIND_LABELS[r.kind] || "Action",
      agent: r.agent || null,
      profileLabel: prof ? prof.label : null,
      profileColor: prof ? prof.color : "#94a3b8",
      phaseId: r.phaseId || null,
      phaseTitle,
      phaseLabel: phase ? `${phase.id} · ${phase.title}` : r.phaseId || "—",
      status: r.status || null,
      startedAt: r.startedAt || null,
      endedAt: r.endedAt || null,
      durationMs: r.durationMs || null,
      cost: r.cost || 0,
      tokens: (r.inputTokens || 0) + (r.outputTokens || 0),
      description: describe(r, phaseTitle),
      producedFiles: filesFromLog(paths.runsDir, r.id),
      decisions: decs
    };
  });

  // Per-agent rollup (who was called, how often, latest activity).
  const byAgent = {};
  for (const t of timeline) {
    const key = t.agent || "—";
    if (!byAgent[key]) {
      byAgent[key] = {
        agent: key,
        profileLabel: t.profileLabel,
        profileColor: t.profileColor,
        runs: 0,
        cost: 0,
        files: 0,
        decisions: 0,
        lastAt: null
      };
    }
    const b = byAgent[key];
    b.runs += 1;
    b.cost += t.cost;
    b.files += t.producedFiles.length;
    b.decisions += t.decisions.length;
    if (!b.lastAt || (t.endedAt && t.endedAt > b.lastAt)) b.lastAt = t.endedAt || t.startedAt;
  }

  // Per-phase rollup of runtime activity (static phase metadata comes from /api/state).
  const rollup = (phaseId, title, runs) => {
    const agents = [...new Set(runs.map((r) => r.agent).filter(Boolean))];
    const files = [...new Set(runs.flatMap((r) => r.producedFiles))];
    return {
      phaseId,
      title,
      runCount: runs.length,
      cost: runs.reduce((s, r) => s + r.cost, 0),
      agents,
      fileCount: files.length,
      decisionCount: runs.reduce((s, r) => s + r.decisions.length, 0),
      lastAt: runs.reduce((acc, r) => {
        const e = r.endedAt || r.startedAt;
        return e && (!acc || e > acc) ? e : acc;
      }, null)
    };
  };
  const byPhase = PHASES.map((phase) => rollup(phase.id, phase.title, timeline.filter((t) => t.phaseId === phase.id)));
  // Runs not tied to a G0–G7 gate (chat/planification, résolution, orchestré sans étape…):
  // surface them in a dedicated "Hors étape" bucket so nothing is hidden.
  const knownPhaseIds = new Set(PHASES.map((p) => p.id));
  const offPhaseRuns = timeline.filter((t) => !t.phaseId || !knownPhaseIds.has(t.phaseId));
  if (offPhaseRuns.length) byPhase.push(rollup("—", "Hors étape", offPhaseRuns));

  return {
    timeline,
    byAgent: Object.values(byAgent).sort((a, b) => b.runs - a.runs),
    byPhase,
    summary: {
      totalRuns: timeline.length,
      totalCost: timeline.reduce((s, t) => s + t.cost, 0),
      agentsInvolved: Object.keys(byAgent).filter((k) => k !== "—").length,
      filesProduced: [...new Set(timeline.flatMap((t) => t.producedFiles))].length,
      firstAt: timeline.length ? timeline[timeline.length - 1].startedAt : null,
      lastAt: timeline.length ? timeline[0].endedAt || timeline[0].startedAt : null
    }
  };
}
