import path from "node:path";
import { startRun } from "./runs.js";
import { buildAgentTaskPrompt, libraryPolicyText } from "./run-prompts.js";
import { ingestPendingInput } from "./inbox-ingest.js";
import { pendingInputsForPhase, markPhaseInputsConsidered } from "./inputs-store.js";

/**
 * Option A coordinator: runs a phase as stages, each stage's agents in parallel
 * (separate Claude processes), stages sequentially. Each agent writes only its
 * own folders and its own per-agent pending-input file (no conflicts).
 */
const groups = new Map();
let seq = 0;

export function getGroup(id) {
  const g = groups.get(id);
  if (!g) return null;
  return {
    id: g.id,
    phaseId: g.phaseId,
    status: g.status,
    currentStage: g.currentStage,
    stages: g.stages.map((s) => ({
      agents: s.agents.map((a) => ({ name: a.name, runId: a.runId, status: a.status }))
    }))
  };
}

function runTask(config, paths, group, stageIdx, phase, task) {
  return new Promise((resolve) => {
    const token = `${phase.id}-${task.agentKey}`.toLowerCase();
    const pendingRel = `livrables/_governance/agent-io/pending-input-${token}.json`;
    const pendingAbs = path.join(paths.agentIoDir, `pending-input-${token}.json`);
    const prompt =
      buildAgentTaskPrompt(phase, task, { pendingFile: pendingRel, inputs: pendingInputsForPhase(paths, phase.id) }) +
      libraryPolicyText(config);
    const entry = { name: task.agent, runId: null, status: "running" };
    group.stages[stageIdx].agents.push(entry);
    const runId = startRun(config, {
      label: `${phase.id} · ${task.agent}`,
      kind: "parallel",
      phaseId: phase.id,
      agent: task.agent,
      prompt,
      cwd: paths.workspaceRoot,
      onDone: (run) => {
        try {
          ingestPendingInput(paths, { runId: run.id, phaseId: phase.id, raisedBy: task.agent }, pendingAbs);
        } catch {}
        entry.status = run.status === "done" ? "done" : "error";
        resolve();
      }
    });
    entry.runId = runId;
  });
}

export function startPhaseGroup(config, paths, phase, stages) {
  const id = `grp-${++seq}-${Date.now()}`;
  const group = {
    id,
    phaseId: phase.id,
    status: "running",
    currentStage: 0,
    stages: stages.map(() => ({ agents: [] }))
  };
  groups.set(id, group);
  (async () => {
    for (let i = 0; i < stages.length; i++) {
      group.currentStage = i;
      await Promise.all(stages[i].map((task) => runTask(config, paths, group, i, phase, task)));
    }
    markPhaseInputsConsidered(paths, phase.id);
    group.status = "done";
  })().catch(() => {
    group.status = "error";
  });
  return id;
}
