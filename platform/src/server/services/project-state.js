import { createWorkspacePaths } from "../config/paths.js";
import { PHASES, PRODUCERS, REVIEWERS, PHASE_PARALLEL } from "../domain/phases.js";
import { classifyDoc, phaseDocTypes } from "../domain/doc-types.js";
import { PHASE_INSTRUCTIONS } from "../domain/instructions.js";
import { PROFILES, PROFILE_BY_ID } from "../domain/profiles.js";
import { readGates } from "./gates.js";
import { listDeliverables, countDocsByFolders } from "./deliverables.js";
import { readProject } from "./project.js";
import { listAgents } from "./agents.js";
import { listSkills, listMcpServers } from "./resources.js";
import { readAudits } from "./audit-decisions.js";
import { openRequestsCount } from "./request-flow.js";
import { readTextSafe, statSafe } from "./fs-utils.js";
import fs from "node:fs";

const GATE_LABELS = {
  G0: "Contexte projet prêt",
  G1: "Vision prête",
  G2: "Domaine, UX et UI prêts",
  G3: "Architecture et sécurité prêtes",
  G4: "User Story prête",
  G5: "Implémentation faite",
  G6: "Vérification faite",
  G7: "Décision de release"
};

/**
 * Read the machine-owned structured state (decisions, etc.) if present.
 * This file is the reliable source of truth that the AI agents will write to (M5).
 */
function readStructuredState(paths) {
  const content = readTextSafe(paths.projectStateFile);
  if (!content) return {};
  try {
    return JSON.parse(content);
  } catch {
    return {};
  }
}

export async function buildProjectState(config) {
  const paths = createWorkspacePaths(config.workspaceRoot);
  const workspaceExists = fs.existsSync(paths.workspaceRoot);

  // Read-only: closing the tasks of passed gates happens when a run ends (run hooks) and
  // at startup — not on every state read.
  const gates = readGates(paths);
  const deliverables = listDeliverables(paths);
  // Tag every deliverable with its typology (Epics, User Stories, …).
  for (const group of deliverables) {
    for (const item of group.items) {
      const c = classifyDoc(item.path);
      item.typeKey = c ? c.typeKey : null;
      item.typeLabel = c ? c.typeLabel : null;
      item.phaseId = c ? c.phaseId : null;
    }
  }
  const project = readProject(paths);
  const agents = listAgents(paths);
  const skills = listSkills(paths);
  const mcpServers = listMcpServers(paths);
  const structured = readStructuredState(paths);

  const allItems = deliverables.flatMap((g) => g.items);
  const phases = PHASES.map((phase) => {
    const gate = gates[phase.id] || { id: phase.id, status: "NOT_STARTED", file: null, updatedAt: null };
    // Group by the CLASSIFIED phase (handles folders shared across phases).
    const phaseItems = allItems.filter((it) => it.phaseId === phase.id);
    const docCount = phaseItems.length;
    const docTypes = phaseDocTypes(phase.id).map((t) => ({
      key: t.key,
      label: t.label,
      items: phaseItems.filter((it) => it.typeKey === t.key)
    }));
    return {
      id: phase.id,
      title: phase.title,
      subtitle: phase.subtitle,
      plain: phase.plain,
      human: phase.human,
      folders: phase.folders,
      gateLabel: GATE_LABELS[phase.id] || phase.id,
      gateStatus: gate.status,
      gateFile: gate.file,
      gateUpdatedAt: gate.updatedAt,
      agents: phase.agents || null,
      producers: PRODUCERS[phase.id] || null,
      reviewer: REVIEWERS[phase.id] || null,
      parallel: Boolean(PHASE_PARALLEL[phase.id]),
      goal: phase.goal || null,
      produces: phase.produces || [],
      instructions: PHASE_INSTRUCTIONS[phase.id] || [],
      inputs: (Array.isArray(structured.inputs) ? structured.inputs : []).filter((i) => i.phaseId === phase.id),
      docTypes,
      docCount,
      ownerProfiles: phase.ownerProfiles
        .map((id) => PROFILE_BY_ID[id])
        .filter(Boolean)
        .map((p) => ({ id: p.id, label: p.label, color: p.color }))
    };
  });

  const docsCount = deliverables.reduce((sum, g) => sum + g.items.length, 0);
  const gatesPassed = phases.filter((p) => p.gateStatus === "PASS" || p.gateStatus === "PASS_WITH_RISK").length;
  const phaseTitleById = Object.fromEntries(phases.map((p) => [p.id, `${p.id} · ${p.title}`]));
  const rawDecisions = Array.isArray(structured.decisions) ? structured.decisions : [];
  const decisions = rawDecisions
    .map((d) => {
      const target = PROFILE_BY_ID[d.targetProfile];
      return {
        ...d,
        targetProfileLabel: target ? target.label : d.targetProfile,
        targetProfileColor: target ? target.color : "#888",
        phaseLabel: d.phaseId ? phaseTitleById[d.phaseId] || d.phaseId : null
      };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const decisionsPending = decisions.filter((d) => d.status === "pending").length;
  const rawRisks = Array.isArray(structured.risks) ? structured.risks : [];
  const risks = rawRisks
    .map((r) => ({
      ...r,
      phaseLabel: r.phaseId ? phaseTitleById[r.phaseId] || r.phaseId : null
    }))
    .sort((a, b) => ((a.updatedAt || a.createdAt || "") < (b.updatedAt || b.createdAt || "") ? 1 : -1));
  const risksOpen = risks.filter((r) => r.status === "open" || r.status === "mitigating").length;
  const rawTasks = Array.isArray(structured.tasks) ? structured.tasks : [];
  const tasks = rawTasks
    .map((t) => {
      const target = PROFILE_BY_ID[t.targetProfile];
      return {
        ...t,
        targetProfileLabel: target ? target.label : t.targetProfile,
        targetProfileColor: target ? target.color : "#888",
        phaseLabel: t.phaseId ? phaseTitleById[t.phaseId] || t.phaseId : null
      };
    })
    .sort((a, b) => ((a.updatedAt || a.createdAt || "") < (b.updatedAt || b.createdAt || "") ? 1 : -1));
  const tasksOpen = tasks.filter((t) => t.status === "todo" || t.status === "in-progress").length;

  // Current phase = first phase whose gate is not yet passed.
  const currentPhase = phases.find((p) => p.gateStatus !== "PASS" && p.gateStatus !== "PASS_WITH_RISK")
    || phases[phases.length - 1];

  return {
    config: {
      workspaceRoot: paths.workspaceRoot,
      workspaceExists,
      policies: config.policies || { libraries: { mode: "ask", allowed: [] } },
      permissionMode: config.permissionMode || "bypassPermissions",
      autopilot: config.autopilot || null,
      runLimits: config.runLimits || { timeoutMinutes: 0, maxTurns: 0 },
      models: config.models || { default: "", byKind: {} },
      autoReview: config.autoReview !== false,
      devIsolation: config.devIsolation || "shared",
      supportTemplates: config.supportTemplates || { pptx: null, docx: null }
    },
    project: {
      ...project,
      currentPhaseId: currentPhase ? currentPhase.id : null
    },
    profiles: PROFILES.map((p) => ({
      id: p.id,
      label: p.label,
      short: p.short,
      color: p.color,
      description: p.description,
      seesAll: Boolean(p.seesAll)
    })),
    phases,
    deliverables,
    agents,
    skills,
    mcpServers,
    decisions,
    risks,
    tasks,
    audits: readAudits(paths),
    feedback: Array.isArray(structured.feedback) ? structured.feedback : [],
    summary: {
      gatesPassed,
      totalGates: phases.length,
      docsCount,
      decisionsPending,
      risksOpen,
      tasksOpen,
      requestsOpen: openRequestsCount(paths)
    }
  };
}
