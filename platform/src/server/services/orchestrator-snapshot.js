import { buildProjectState } from "./project-state.js";
import { listRuns } from "./runs.js";
import { readGates } from "./gates.js";
import { listTasks } from "./tasks-store.js";
import { listRisks, OPEN_RISK_STATUSES } from "./risks-store.js";
import { PRODUCERS, REVIEWERS } from "../domain/phases.js";

// A gate counts as "cleared" for objective-tracking when it PASSes (with or without
// residual risk). The CURRENT OBJECTIVE is the first phase whose gate isn't cleared.
const PASSED = new Set(["PASS", "PASS_WITH_RISK"]);

/**
 * Build the live project snapshot the orchestrator reasons over — the single source used
 * by BOTH the advisory chat and the autopilot conductor, so they never diverge. Returns
 * the human-readable `text` block injected into the prompt PLUS the structured signals
 * (current objective, failing gates, convergence, open work) the conductor needs to decide.
 */
export async function buildOrchestratorSnapshot(config, paths, opts = {}) {
  // In COPILOT mode the objective is the user's DEMAND, not the next gate. Emitting a
  // "OBJECTIF COURANT: faire passer Gx" directive makes the orchestrator drift onto the gate
  // chain (relaunching phases unrelated to the demand). `contextOnly` reframes gates as plain
  // status context so the demand stays the single objective.
  const contextOnly = Boolean(opts.contextOnly);
  const state = await buildProjectState(config);
  const running = listRuns().filter((r) => r.status === "running");
  const pending = (state.decisions || []).filter((d) => d.status === "pending");
  // Current OBJECTIVE = the first gate not yet passed. The orchestrator drives toward THIS
  // gate and stops when it's met, instead of opening fronts everywhere.
  const nextGate = (state.phases || []).find((p) => !PASSED.has(String(p.gateStatus || "").toUpperCase()));
  // Failing gates — INCLUDING lettered sub-gates (e.g. G6R business acceptance) not in the
  // G0..G7 phase list. An all-PASS_WITH_RISK chain with a failing sub-gate is NOT converged.
  const failedGates = Object.values(readGates(paths))
    .filter((g) => /FAIL/i.test(String(g.status || "")))
    .map((g) => `${g.id} (${String(g.status).replace(/\*/g, "").trim().slice(0, 40)})`);
  const allTasks = listTasks(paths);
  const openTasks = allTasks.filter((t) => t.status === "todo" || t.status === "in-progress");
  const candidates = allTasks.filter((t) => t.status === "proposed");
  const fmtTask = (t) => `${t.id} "${t.title}" (${t.phaseId || "—"} → ${t.targetProfile}${t.raisedBy ? `, via ${t.raisedBy}` : ""})`;
  // Open RISKS agents have raised — the orchestrator must SEE these to drive their fixes
  // (they carry the concrete defects/blockers found while producing deliverables).
  let openRisks = [];
  try { openRisks = listRisks(paths).filter((r) => OPEN_RISK_STATUSES.includes(String(r.status))); } catch {}
  const fmtRisk = (r) => `${r.id} [${r.severity}] "${r.title}" (${r.phaseId || "—"}${r.owner ? ` → ${r.owner}` : ""}${r.raisedBy ? `, via ${r.raisedBy}` : ""})`;

  const objectiveLine = contextOnly
    // Copilot: gates are context only; the demand is the objective.
    ? `Contexte gates (NE PILOTE PAS vers ces gates — ton objectif est la DEMANDE): prochain gate non validé = ${nextGate ? `${nextGate.id} ${nextGate.title} (${nextGate.gateStatus})` : "aucun, chaîne convergée"}.`
    : nextGate
      ? `OBJECTIF COURANT: faire passer ${nextGate.id} — ${nextGate.title} (actuellement ${nextGate.gateStatus}).`
      : failedGates.length
        ? `OBJECTIF COURANT: lever le(s) gate(s) EN ÉCHEC — ${failedGates.join("; ")}. La chaîne n'est PAS convergée tant qu'ils échouent.`
        : `OBJECTIF COURANT: tous les gates sont passés — la chaîne est convergée. Ne propose plus de travail sauf demande explicite.`;
  const text = [
    `Projet: ${state.project?.name || "(non défini)"}`,
    objectiveLine,
    failedGates.length ? `Gates EN ÉCHEC (FAIL) — contexte: ${failedGates.join("; ")}` : null,
    `Phases/gates: ${(state.phases || []).map((p) => `${p.id} ${p.title} = ${p.gateStatus}`).join("; ")}`,
    `Agents en cours (${running.length}): ${running.length ? running.map((r) => `${r.agent || r.label} [${r.kind}, phase ${r.phaseId || "—"}]`).join("; ") : "aucun"}`,
    `Plan validé — tâches À FAIRE / EN COURS (${openTasks.length}): ${openTasks.length ? openTasks.slice(0, 20).map(fmtTask).join("; ") : "aucune"}`,
    `Candidats à TRIER — handoffs d'agents non promus (${candidates.length}): ${candidates.length ? candidates.slice(0, 25).map(fmtTask).join("; ") : "aucun"}`,
    `Risques OUVERTS remontés par les agents (${openRisks.length}): ${openRisks.length ? openRisks.slice(0, 20).map(fmtRisk).join("; ") : "aucun"}`,
    `Décisions en attente (${pending.length}): ${pending.length ? pending.slice(0, 12).map((d) => `${d.id} "${d.title}" (${d.phaseId || "—"} → ${d.targetProfileLabel})`).join("; ") : "aucune"}`,
    `Livrables: ${state.summary?.docsCount ?? "?"} document(s)`,
    `Producteurs par étape: ${Object.entries(PRODUCERS).map(([g, a]) => `${g}=${a}`).join(", ")}`,
    `Reviewers par étape: ${Object.entries(REVIEWERS).map(([g, a]) => `${g}=${a}`).join(", ")}`
  ].filter(Boolean).join("\n");

  return {
    text,
    state,
    running,
    pending,
    nextGate: nextGate ? { id: nextGate.id, title: nextGate.title, gateStatus: nextGate.gateStatus } : null,
    failedGates,
    converged: !nextGate && failedGates.length === 0,
    openTasks,
    candidates,
    openRisks
  };
}
