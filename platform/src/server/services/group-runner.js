import path from "node:path";
import { startRun, cancelRun, getRun } from "./runs.js";
import {
  buildAgentTaskPrompt,
  buildDevLanePrompt,
  buildDevIntegrationPrompt,
  buildDevConsolidationPrompt,
  libraryPolicyText
} from "./run-prompts.js";
import { pendingInputsForPhase, markPhaseInputsConsidered } from "./inputs-store.js";
import { listDecisions } from "./decisions-store.js";
import { createRisk } from "./risks-store.js";
import { launchReview } from "./phase-runs.js";
import { isGitRepo, snapshotWorkspace, createLaneWorktree, mergeLane, removeLane } from "./worktrees.js";
import { REVIEWERS } from "../domain/phases.js";

/**
 * Option A coordinator: runs a phase as stages, each stage's agents in parallel
 * (separate Claude processes), stages sequentially. Each agent writes only its
 * own folders and its own agent-io files (pending / risks / tasks — no conflicts).
 *
 * With config.devIsolation = "worktree", the lanes of a G5 wave that runs several lanes
 * each work in their own git worktree, merged back once the wave is over; a merge
 * conflict stops the group and is registered as a risk. Otherwise lanes share the
 * workspace (anti-collision by prompt) and the integration step after the wave catches
 * what slipped through.
 *
 * Once every stage succeeded, the phase review is chained (config.autoReview).
 */
const groups = new Map();
let seq = 0;

const AGENT_IO_REL = "livrables/_governance/agent-io";

function summary(g) {
  return {
    id: g.id,
    phaseId: g.phaseId,
    status: g.status,
    currentStage: g.currentStage,
    cancelled: g.cancelled,
    notes: g.notes.slice(-20)
  };
}

/** All groups (running or done) as flat summaries — used for cross-refresh visibility. */
export function listGroups() {
  return [...groups.values()].map((g) => ({
    ...summary(g),
    agents: g.stages.flatMap((s) => s.agents.map((a) => ({ name: a.name, runId: a.runId, status: a.status })))
  }));
}

export function getGroup(id) {
  const g = groups.get(id);
  if (!g) return null;
  return {
    ...summary(g),
    stages: g.stages.map((s) => ({
      agents: s.agents.map((a) => ({ name: a.name, runId: a.runId, status: a.status, isolated: Boolean(a.isolated) }))
    }))
  };
}

/** Run ids of every agent launched by a group (for budget accounting / cancellation). */
export function groupRunIds(id) {
  const g = groups.get(id);
  return g ? g.stages.flatMap((s) => s.agents.map((a) => a.runId).filter(Boolean)) : [];
}

/** Stop a group: no further stage starts, running lanes are cancelled. */
export function cancelGroup(id, reason) {
  const g = groups.get(id);
  if (!g) return { ok: false, error: "Groupe introuvable." };
  if (g.status !== "running") return { ok: false, error: "Ce groupe est déjà terminé." };
  g.cancelled = true;
  g.notes.push(`Arrêt demandé : ${reason || "par l'utilisateur"}.`);
  for (const runId of groupRunIds(id)) {
    const r = getRun(runId);
    if (r && r.status === "running") cancelRun(runId, reason || "Arrêt du groupe.");
  }
  return { ok: true, id };
}

function laneIoFiles(cwd, token) {
  const rel = (name) => `${AGENT_IO_REL}/${name}-${token}.json`;
  const abs = (name) => path.join(cwd, ...AGENT_IO_REL.split("/"), `${name}-${token}.json`);
  return {
    pendingRel: rel("pending-input"), pendingAbs: abs("pending-input"),
    risksRel: rel("risks"), risksAbs: abs("risks"),
    tasksRel: rel("tasks"), tasksAbs: abs("tasks")
  };
}

function buildTaskPrompt(paths, phase, task, io) {
  const files = { pendingFile: io.pendingRel, risksFile: io.risksRel, tasksFile: io.tasksRel };
  if (task.kind === "dev-lane") return buildDevLanePrompt(task, files);
  if (task.kind === "dev-integrate") return buildDevIntegrationPrompt(task, files);
  if (task.kind === "dev-consolidate") return buildDevConsolidationPrompt(files);
  return buildAgentTaskPrompt(phase, task, { ...files, inputs: pendingInputsForPhase(paths, phase.id) });
}

function runTask(config, paths, group, stageIdx, phase, task, cwd) {
  return new Promise((resolve) => {
    const token = `${phase.id}-${task.agentKey}-${group.id.split("-")[1]}`.toLowerCase();
    const io = laneIoFiles(cwd, token);
    const prompt = buildTaskPrompt(paths, phase, task, io) + libraryPolicyText(config);
    const laneLabel = task.bc ? `${task.agent} · ${task.bc}` : task.label || task.agent;
    const entry = { name: laneLabel, runId: null, status: "running", isolated: cwd !== paths.workspaceRoot };
    group.stages[stageIdx].agents.push(entry);
    entry.runId = startRun(config, {
      label: `${phase.id} · ${laneLabel}`,
      kind: "parallel",
      phaseId: phase.id,
      agent: task.agent,
      prompt,
      cwd,
      stateRoot: paths.workspaceRoot,
      pendingFile: io.pendingAbs,
      risksFile: io.risksAbs,
      tasksFile: io.tasksAbs,
      onDone: (run) => {
        entry.status = run.status === "done" ? "done" : "error";
        resolve();
      }
    });
  });
}

/** Prepare one worktree per lane of the stage, or null to run the stage in the workspace. */
async function prepareIsolation(config, paths, group, stage, waveNo) {
  const lanes = stage.filter((t) => t.kind === "dev-lane");
  if (config.devIsolation !== "worktree" || lanes.length < 2) return null;
  const root = paths.workspaceRoot;
  if (!(await isGitRepo(root))) {
    group.notes.push("Isolation par worktree ignorée : le workspace n'est pas un dépôt git.");
    return null;
  }
  const snap = await snapshotWorkspace(root, `SDLC Studio : instantané avant la vague ${waveNo} (G5)`);
  if (!snap.ok) {
    group.notes.push(`Isolation par worktree ignorée : instantané impossible (${snap.error}).`);
    return null;
  }
  const map = new Map();
  for (const task of lanes) {
    const wt = await createLaneWorktree(root, task.agentKey);
    if (!wt.ok) {
      group.notes.push(`Worktree impossible pour ${task.bc} (${wt.error}) : vague lancée sans isolation.`);
      for (const done of map.values()) await removeLane(root, done, { deleteBranch: true });
      return null;
    }
    map.set(task, wt);
  }
  group.notes.push(`Vague ${waveNo} : ${map.size} lanes isolées dans leur worktree.`);
  return map;
}

/** Merge every lane of the wave back. Returns false when a conflict must stop the group. */
async function mergeWave(paths, group, phase, isolation, waveNo) {
  const root = paths.workspaceRoot;
  let clean = true;
  for (const [task, wt] of isolation) {
    const msg = `SDLC Studio : vague ${waveNo}, lane ${task.bc} (${task.bcName || ""})`;
    const m = await mergeLane(root, wt, msg);
    if (m.ok) {
      await removeLane(root, wt, { deleteBranch: true });
      if (m.merged) group.notes.push(`Lane ${task.bc} fusionnée.`);
      continue;
    }
    clean = false;
    await removeLane(root, wt, { deleteBranch: false });
    group.notes.push(`Conflit de fusion sur la lane ${task.bc} : branche ${wt.branch} conservée.`);
    createRisk(paths, {
      title: `Conflit de fusion de la lane ${task.bc} (vague ${waveNo})`,
      description: `La lane ${task.bc} a été développée en parallèle dans la branche \`${wt.branch}\`, qui n'a pas pu être fusionnée automatiquement : ${String(m.error).slice(0, 600)}. Fusionner la branche à la main (ou arbitrer le contrat en conflit), puis relancer le dev par batch.`,
      severity: "high",
      phaseId: phase.id,
      raisedBy: "SDLC Studio",
      owner: "@architecte-technique"
    });
  }
  return clean;
}

export function startPhaseGroup(config, paths, phase, stages) {
  const id = `grp-${++seq}-${Date.now()}`;
  const group = {
    id,
    phaseId: phase.id,
    status: "running",
    currentStage: 0,
    cancelled: false,
    notes: [],
    stages: stages.map(() => ({ agents: [] }))
  };
  groups.set(id, group);
  (async () => {
    let blocked = false;
    for (let i = 0; i < stages.length && !group.cancelled; i++) {
      group.currentStage = i;
      const waveNo = i + 1;
      const isolation = await prepareIsolation(config, paths, group, stages[i], waveNo);
      await Promise.all(
        stages[i].map((task) => runTask(config, paths, group, i, phase, task, (isolation && isolation.get(task)?.dir) || paths.workspaceRoot))
      );
      if (isolation && !(await mergeWave(paths, group, phase, isolation, waveNo))) {
        blocked = true;
        break;
      }
    }
    // Only mark inputs consumed if every agent completed — if any failed, the inputs may not have been read.
    const anyError = group.stages.some((s) => s.agents.some((a) => a.status === "error"));
    const ok = !anyError && !blocked && !group.cancelled;
    if (ok) markPhaseInputsConsidered(paths, phase.id);
    group.status = ok ? "done" : "error";
    if (ok && config.autoReview !== false && REVIEWERS[phase.id]) {
      const runIds = new Set(groupRunIds(id));
      const waiting = listDecisions(paths).some((d) => d.status === "pending" && runIds.has(d.runId));
      if (!waiting) {
        const r = launchReview(config, paths, phase.id);
        if (r.ok) group.notes.push(`Revue lancée : ${r.label}.`);
      }
    }
  })().catch((e) => {
    group.notes.push(`Erreur : ${e.message}`);
    group.status = "error";
  });
  return id;
}
